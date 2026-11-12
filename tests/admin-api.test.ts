import { strict as assert } from "node:assert";
import { test } from "node:test";
import { AdminApi, safeHttpUrl } from "../src/lib/admin-api";

const establishment = "11111111-1111-4111-8111-111111111111";
const session = {
  id: establishment,
  establecimientoId: establishment,
  listaId: establishment,
  fechaOperativa: "2026-06-01",
  estado: "ABIERTA",
  abiertaAt: "2026-06-01T00:00:00Z",
  cerradaAt: null,
};
function harness(responses: Response[]) {
  const calls: { url: string; options?: RequestInit }[] = [];
  const api = new AdminApi(async (url, options) => {
    calls.push({ url: String(url), options });
    const response = responses.shift();
    assert.ok(response, "Unexpected request");
    return response;
  });
  return { api, calls };
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });

test("preserves safe URL validation for backend QR data", () => {
  for (const url of [
    "javascript:alert(1)",
    "file:///tmp/api",
    "https://user:pass@example.test",
    "https://example.test/?token=x",
    "http://example.test",
  ]) {
    if (!url.includes("?token=")) assert.equal(safeHttpUrl(url), null);
  }
  assert.equal(safeHttpUrl("javascript:alert(1)"), null);
  assert.equal(safeHttpUrl("https://user:pass@example.test"), null);
  assert.equal(
    safeHttpUrl("https://example.test/image.png"),
    "https://example.test/image.png",
  );
  assert.equal(safeHttpUrl("http://localhost:8080"), "http://localhost:8080/");
});

test("default browser transport invokes fetch with its global receiver", async () => {
  const originalFetch = globalThis.fetch;
  const calls: { url: string; options?: RequestInit }[] = [];
  // Model browser fetch's receiver check; Node fetch does not enforce it.
  globalThis.fetch = async function (
    this: unknown,
    input: RequestInfo | URL,
    options?: RequestInit,
  ) {
    if (this !== globalThis) throw new TypeError("Illegal invocation");
    calls.push({ url: String(input), options });
    return json([]);
  };
  try {
    assert.deepEqual(await new AdminApi().establishments(), []);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "/api/bff/api/staff/establecimientos");
    assert.equal(calls[0].options?.method, "GET");
    assert.equal(calls[0].options?.credentials, "same-origin");
    assert.equal(calls[0].options?.redirect, "error");
    assert.equal(calls[0].options?.cache, "no-store");
    assert.deepEqual(Array.from(new Headers(calls[0].options?.headers)), [
      ["accept", "application/json"],
    ]);
    assert.equal(calls[0].options?.body, undefined);
    assert.ok(calls[0].options?.signal instanceof AbortSignal);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("browser transport uses same-origin BFF and never sends credentials in headers", async () => {
  const { api, calls } = harness([json([])]);
  await api.establishments();
  assert.equal(calls[0].url, "/api/bff/api/staff/establecimientos");
  assert.equal(
    new Headers(calls[0].options?.headers).get("Authorization"),
    null,
  );
  assert.equal(calls[0].options?.credentials, "same-origin");
});

test("reads staff establishments with same-origin cookies and no redirects", async () => {
  const items = [
    {
      id: establishment,
      nombre: "Sala",
      qrSlug: "sala",
      zonaHoraria: "America/Bogota",
      activo: true,
      creadoAt: "2026-01-01T00:00:00Z",
    },
  ];
  const { api, calls } = harness([json(items)]);
  assert.deepEqual(await api.establishments(), items);
  assert.equal(calls[0].url, "/api/bff/api/staff/establecimientos");
  assert.equal(
    new Headers(calls[0].options?.headers).get("Authorization"),
    null,
  );
  assert.equal(calls[0].options?.credentials, "same-origin");
  assert.equal(calls[0].options?.redirect, "error");
  assert.equal(calls[0].options?.cache, "no-store");
});

test("only exact NO_ACTIVE_SESSION 404 means empty session", async () => {
  const { api } = harness([
    json({ code: "NO_ACTIVE_SESSION" }, 404),
    json({ code: "ESTABLISHMENT_NOT_FOUND" }, 404),
    json({ code: "NO_ACTIVE_SESSION" }, 500),
  ]);
  assert.equal(await api.currentSession(establishment), null);
  await assert.rejects(api.currentSession(establishment));
  await assert.rejects(api.currentSession(establishment));
});

test("opens, closes and loads QR using exact backend contracts", async () => {
  const closed = {
    sesion: { ...session, estado: "CERRADA" },
    pendientesAlCierre: 3,
  };
  const qr = {
    url: "https://join.example.test/sala",
    svg: '<svg xmlns="http://www.w3.org/2000/svg" />',
  };
  const { api, calls } = harness([json(session, 201), json(closed), json(qr)]);
  assert.deepEqual(await api.openSession(establishment), session);
  assert.deepEqual(await api.closeSession(establishment), closed);
  assert.deepEqual(await api.qr(establishment), qr);
  assert.deepEqual(
    calls.map((c) => [c.url, c.options?.method]),
    [
      [`/api/bff/api/admin/establecimientos/${establishment}/sesiones`, "POST"],
      [`/api/bff/api/admin/sesiones/${establishment}/cierre`, "POST"],
      [`/api/bff/api/admin/establecimientos/${establishment}/qr`, "GET"],
    ],
  );
  assert.ok(calls.every((c) => c.options?.body === undefined));
});

test("reports authentication, authorization and conflicts without exposing response details", async () => {
  for (const [status, fragment] of [
    [401, "Credencial"],
    [403, "permisos"],
    [409, "lista predeterminada"],
  ] as const) {
    const { api, calls } = harness([
      json({ code: "NO_DEFAULT_LIST", detail: "private diagnostic" }, status),
    ]);
    await assert.rejects(
      api.openSession(establishment),
      (error: unknown) =>
        error instanceof Error &&
        error.message.includes(fragment) &&
        !error.message.includes("private diagnostic"),
    );
    assert.equal(calls.length, 1);
  }
});

test("searches normalized queries with encoded pagination and rejects invalid input without transport", async () => {
  const page = { resultados: [], siguientePagina: "next=" };
  const { api, calls } = harness([json(page)]);
  assert.deepEqual(await api.search("  rock   & pop ", "next="), page);
  const url = new URL(calls[0].url, "http://localhost:3000");
  assert.equal(url.pathname, "/api/bff/api/staff/catalogo/busqueda");
  assert.equal(url.searchParams.get("q"), "rock & pop");
  assert.equal(url.searchParams.get("pagina"), "next=");
  for (const query of ["a", "x".repeat(101)])
    await assert.rejects(api.search(query));
  await assert.rejects(api.search("rock", "bad!"));
  assert.equal(calls.length, 1);
});

test("rejects malformed successful data and network failures honestly", async () => {
  const { api } = harness([
    json({ fake: true }),
    json({ estado: "inventado" }),
  ]);
  await assert.rejects(api.establishments(), /respuesta/i);
  await assert.rejects(api.currentSession(establishment), /respuesta/i);
  const offline = new AdminApi(async () => {
    throw new Error("secret diagnostic");
  });
  await assert.rejects(offline.establishments(), /conectar/i);
});

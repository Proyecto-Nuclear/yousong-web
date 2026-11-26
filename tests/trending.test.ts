import { strict as assert } from "node:assert";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ListConfiguration } from "../src/components/owner/list-configuration";
import { TrendingSongs, trendsUpdated } from "../src/components/owner/trending";
import { proxyRequest } from "../src/lib/bff";
import { DemoApi } from "../src/lib/demo-api";
import { isTrends } from "../src/lib/demo-contracts";
import { ownerError, TRENDS_UNAVAILABLE } from "../src/lib/owner-copy";

const song = (videoId: string, genero?: string | null) => ({
  videoId,
  titulo: "Tusa",
  artista: "Karol G",
  artistaVerificado: true,
  canal: "KarolGVEVO",
  duracionSegundos: 201,
  miniaturaUrl: null,
  ...(genero === undefined ? {} : { genero }),
});
const trends = {
  region: "CO",
  actualizadoAt: "2026-11-21T18:00:00Z",
  canciones: [song("EtRr2Ao4bx8", "Reguetón"), song("Vh1gOP0WEJ8")],
};

test("trends guard accepts the contract and bounds it", () => {
  assert.equal(isTrends(trends), true);
  assert.equal(isTrends({ ...trends, canciones: [] }), true);
  for (const bad of [
    { ...trends, region: "Colombia" },
    { ...trends, actualizadoAt: "hoy" },
    {
      ...trends,
      canciones: Array.from({ length: 26 }, () => trends.canciones[0]),
    },
    { ...trends, canciones: [{ ...song("EtRr2Ao4bx8"), canal: undefined }] },
    { ...trends, canciones: [song("short")] },
    { ...trends, canciones: [song("EtRr2Ao4bx8", 3 as unknown as string)] },
  ])
    assert.equal(isTrends(bad), false, JSON.stringify(bad));
});

test("trends are read from the public endpoint and validated", async () => {
  const calls: string[] = [];
  const api = new DemoApi(async (url) => {
    calls.push(url);
    return Response.json(trends);
  });
  assert.equal((await api.trends()).canciones.length, 2);
  assert.deepEqual(calls, ["/api/bff/api/public/tendencias"]);
  const broken = new DemoApi(async () =>
    Response.json({ ...trends, region: 1 }),
  );
  await assert.rejects(broken.trends(), /respuesta no válida/);
});

test("trend failures map to owner copy; 503 has its own quiet line", async () => {
  for (const code of [
    "CATALOG_NOT_CONFIGURED",
    "CATALOG_UNAVAILABLE",
    "CATALOG_QUOTA_EXCEEDED",
  ]) {
    const api = new DemoApi(async () =>
      Response.json({ code }, { status: 503 }),
    );
    const error = await api.trends().catch((e) => e);
    assert.equal(error.status, 503);
    assert.doesNotMatch(ownerError(error), /API|HTTP|cuota/);
  }
  const limited = new DemoApi(async () =>
    Response.json({ code: "RATE_LIMITED" }, { status: 429 }),
  );
  assert.match(
    ownerError(await limited.trends().catch((e) => e)),
    /Demasiadas acciones/,
  );
  assert.equal(
    TRENDS_UNAVAILABLE,
    "Las tendencias no están disponibles ahora. La búsqueda sigue funcionando.",
  );
});

test("BFF allows only the exact bodyless trends read", async () => {
  const calls: string[] = [];
  let credentials = 0;
  const h = {
    appUrl: "http://localhost:3000",
    apiUrl: "http://localhost:8080",
    credential: async () => {
      credentials++;
      return "synthetic";
    },
    transport: (async (url: string) => {
      calls.push(url);
      return Response.json(trends);
    }) as unknown as typeof fetch,
  };
  const req = (path: string, method = "GET") =>
    new Request(`http://localhost:3000/api/bff${path}`, {
      method,
      headers: { Origin: "http://localhost:3000" },
    });
  assert.equal(
    (await proxyRequest(req("/api/public/tendencias"), h)).status,
    200,
  );
  assert.deepEqual(calls, ["http://localhost:8080/api/public/tendencias"]);
  for (const [path, method] of [
    ["/api/public/tendencias?region=US", "GET"],
    ["/api/public/tendencias/CO", "GET"],
    ["/api/public/tendencias", "POST"],
  ])
    assert.equal((await proxyRequest(req(path, method), h)).status, 404, path);
  assert.equal(calls.length, 1);
  assert.equal(credentials, 1);
});

test("trends prerender a quiet skeleton and never request before entry", () => {
  let requests = 0;
  const api = new DemoApi(async () => {
    requests++;
    return Response.json(trends);
  });
  const html = renderToStaticMarkup(
    createElement(TrendingSongs, {
      api,
      active: true,
      selected: [],
      onPick() {},
    }),
  );
  assert.match(html, /Tendencias en Colombia/);
  assert.match(html, /aria-busy="false"|class="skeleton"/);
  assert.match(html, /class="skeleton"/);
  const list = renderToStaticMarkup(
    createElement(ListConfiguration, {
      api,
      establishmentId: "x",
      canManage: true,
      active: true,
    }),
  );
  assert.match(list, /Tendencias en Colombia/);
  assert.equal(requests, 0);
});

test("trends freshness reads naturally", () => {
  const now = Date.parse("2026-11-21T20:00:00Z");
  assert.equal(
    trendsUpdated("2026-11-21T18:00:00Z", now),
    "Actualizado hace 2 h",
  );
  assert.equal(
    trendsUpdated("2026-11-21T19:59:59Z", now),
    "Actualizado hace un momento",
  );
});

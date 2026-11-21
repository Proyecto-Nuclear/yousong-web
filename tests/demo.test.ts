import { strict as assert } from "node:assert";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ListConfiguration } from "../src/components/owner/list-configuration";
import { OperationStatus } from "../src/components/owner/operation";
import {
  NowPlaying,
  QueuePanel,
  QueueSongs,
} from "../src/components/owner/queue-panel";
import { proxyRequest } from "../src/lib/bff";
import { DemoApi } from "../src/lib/demo-api";
import {
  type DefaultList,
  type Queue,
  ROTATION,
} from "../src/lib/demo-contracts";
import { OperationGate } from "../src/lib/demo-operation";
import { ListDraft } from "../src/lib/list-draft";
import {
  NIGHT_NOT_OPEN,
  OWNER_VIEWS,
  ownerError,
  sessionNotice,
} from "../src/lib/owner-copy";
import {
  type RefreshClock,
  refreshQueue,
  startQueueRefresh,
} from "../src/lib/queue-refresh";

test("owner navigation keeps one place to search and save the local list", () => {
  assert.deepEqual(Object.values(OWNER_VIEWS), [
    "Panel operativo",
    "Noche y QR",
    "Cola musical",
    "Configuración y listas",
  ]);
});

test("list workspace keeps search and save together without prerender reads or nested forms", () => {
  let requests = 0;
  const api = new DemoApi(async () => {
    requests++;
    throw Error("unexpected request");
  });
  for (const active of [false, true]) {
    const html = renderToStaticMarkup(
      createElement(ListConfiguration, {
        api,
        establishmentId: id,
        canManage: true,
        active,
      }),
    );
    assert.match(html, /Añadir canciones/);
    assert.doesNotMatch(
      html,
      /backend|servidor|Consultar lista e historial|Publicar nueva versión/,
    );
    assert.match(html, /Guardar lista/);
    assert.doesNotMatch(html, /Guarda tu lista en Configuración/);
    assert.equal(/hidden=""/.test(html), !active);
    const tags = html.match(/<\/?form\b[^>]*>/g) ?? [];
    let depth = 0;
    for (const tag of tags) {
      depth += tag.startsWith("</") ? -1 : 1;
      assert.ok(depth <= 1);
    }
    assert.equal(depth, 0);
  }
  assert.equal(requests, 0);
});

test("read-only list scope preserves current-list reads without history or writes", async () => {
  const calls: string[] = [];
  const model = new ListDraft(
    {
      async currentList() {
        calls.push("current");
        return list as DefaultList;
      },
      async listHistory() {
        calls.push("history");
        return [];
      },
      async publishList() {
        calls.push("WRITE");
        return list as DefaultList;
      },
    },
    id,
    false,
  );
  model.enter();
  await settle();
  const before = model.getSnapshot();
  model.pick({ ...song, canal: "Channel", videoId: "lmnopqrstuv" });
  await model.publish();
  assert.deepEqual(calls, ["current"]);
  assert.equal(model.getSnapshot(), before);
  assert.equal(before.current?.version, 1);
  model.dispose();
});

test("owner copy preserves session distinctions and hides unexpected diagnostic text", () => {
  assert.deepEqual(
    ["ABIERTA", "PAUSADA", "CERRANDO", "CERRADA", "unknown"].map(sessionNotice),
    [
      "Noche abierta",
      "Noche en pausa",
      "Cerrando la noche",
      "Noche cerrada",
      "Estado por confirmar",
    ],
  );
  // The night is never called "sesión": owners read it as their login.
  assert.equal(NIGHT_NOT_OPEN, "Noche sin abrir");
  for (const text of [
    NIGHT_NOT_OPEN,
    ...Object.values(OWNER_VIEWS),
    ...["ABIERTA", "PAUSADA", "CERRANDO", "CERRADA"].map(sessionNotice),
  ])
    assert.doesNotMatch(text, /sesi[oó]n/i);
  assert.equal(
    ownerError(Error("private diagnostic")),
    "No pudimos confirmar la acción. Actualiza el estado antes de intentarlo otra vez.",
  );
});

test("owner progress and errors avoid technical diagnostics", () => {
  const busy = renderToStaticMarkup(
    createElement(OperationStatus, { busy: true, error: "", notice: "" }),
  );
  assert.match(busy, /Cargando…/);
  assert.doesNotMatch(busy, /servidor|backend|API/);
  const error = renderToStaticMarkup(
    createElement(OperationStatus, {
      busy: false,
      error: "No tienes permisos para esta operación en el backend.",
      notice: "",
    }),
  );
  assert.match(error, /permisos/);
  assert.doesNotMatch(error, /backend/);
  const notice = renderToStaticMarkup(
    createElement(OperationStatus, {
      busy: false,
      error: "",
      notice: "Lista guardada",
    }),
  );
  assert.match(notice, /Lista guardada/);
});

const settle = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
};

test("automatic queue reads retain last good rows on failure and accept same-version service changes", async () => {
  const gate = new OperationGate();
  let visible: Queue | null = null;
  let confirmed = false;
  const h = apiHarness([
    snapshot,
    { ...snapshot, estado: "PAUSADO" },
    { ...snapshot, colaVersion: 1 },
  ]);
  async function run(read = () => h.api.queue("sala")) {
    const ticket = gate.begin();
    assert.ok(ticket !== null);
    await refreshQueue({
      read,
      gate,
      commit(update) {
        if (gate.valid(ticket)) update();
      },
      accept(value) {
        visible = value;
        confirmed = true;
      },
      stale() {
        confirmed = false;
      },
    });
    gate.end(ticket);
  }
  await run();
  assert.equal(confirmed, true);
  await run();
  assert.equal(confirmed, true);
  const paused = visible;
  assert.equal((paused as Queue | null)?.estado, "PAUSADO");
  await run();
  assert.equal(confirmed, false);
  assert.equal(visible, paused);
  await run(async () => {
    throw Error("offline");
  });
  assert.equal(confirmed, false);
  assert.equal(visible, paused);
  assert.equal(h.calls.length, 3);
  assert.ok(h.calls.every((call) => call.options.method === "GET"));
});

test("disposal fences in-flight queue results and prevents follow-up reads", async () => {
  const gate = new OperationGate();
  const ticket = gate.begin();
  assert.ok(ticket !== null);
  let resolve: (value: Queue) => void = () => {};
  let reads = 0;
  let updates = 0;
  const options = {
    gate,
    read() {
      reads++;
      return new Promise<Queue>((done) => {
        resolve = done;
      });
    },
    commit(update: () => void) {
      if (gate.valid(ticket)) update();
    },
    accept() {
      updates++;
    },
    stale() {
      updates++;
    },
  };
  const pending = refreshQueue(options);
  gate.invalidate();
  resolve({ ...snapshot, estado: "ABIERTO" });
  await pending;
  await refreshQueue(options);
  assert.equal(reads, 1);
  assert.equal(updates, 0);
});

test("operational panel preserves explicit next/end controls while prerender performs no writes", () => {
  let requests = 0;
  const api = new DemoApi(async () => {
    requests++;
    throw Error("unexpected request");
  });
  const html = renderToStaticMarkup(
    createElement(QueuePanel, {
      api,
      establishment,
      session: null,
      showPlaybackControls: true,
    }),
  );
  // Playback actions are named so nobody confuses them with ending the session.
  assert.match(html, />Siguiente canción<\/button>/);
  assert.match(html, />Terminar canción<\/button>/);
  assert.doesNotMatch(html, />Finalizar<\/button>|Al finalizar/);
  assert.match(
    html,
    /<legend[^>]*>Cómo terminó la canción que suena<\/legend>/,
  );
  assert.equal((html.match(/type="radio"/g) ?? []).length, 3);
  for (const text of ["Completada", "Saltada", "Fallida"])
    assert.ok(html.includes(text));
  assert.equal(requests, 0);
});

test("draft preserves unique ordered 200-song limit, removal and no writes from catalog picks", async () => {
  let writes = 0;
  const model = new ListDraft(
    {
      async currentList() {
        return null;
      },
      async listHistory() {
        return [];
      },
      async publishList() {
        writes++;
        return list as DefaultList;
      },
    },
    id,
    true,
  );
  model.enter();
  await settle();
  const selected = Array.from({ length: 201 }, (_, i) => ({
    ...song,
    canal: "Channel",
    videoId: String(i).padStart(11, "0"),
  }));
  for (const value of selected) model.pick(value);
  const before = model.getSnapshot();
  model.pick(selected[0]);
  assert.equal(model.getSnapshot(), before);
  assert.equal(before.songs.length, 200);
  assert.deepEqual(
    before.songs.map((value) => value.videoId),
    selected.slice(0, 200).map((value) => value.videoId),
  );
  model.remove(selected[0].videoId);
  model.pick(selected[200]);
  assert.equal(model.getSnapshot().songs.length, 200);
  assert.equal(model.getSnapshot().songs[199].videoId, selected[200].videoId);
  assert.equal(writes, 0);
  model.dispose();
});

test("queue reads immediately, serially after completion, and stops on disposal", async () => {
  let reads = 0;
  let complete: () => void = () => {};
  const tasks: (() => void)[] = [];
  const delays: number[] = [];
  const clock: RefreshClock = {
    schedule(task, delay) {
      tasks.push(task);
      delays.push(delay);
      return task;
    },
    cancel() {
      tasks.length = 0;
    },
  };
  const stop = startQueueRefresh(() => {
    reads++;
    return new Promise<void>((resolve) => {
      complete = resolve;
    });
  }, clock);
  assert.equal(reads, 1);
  assert.equal(tasks.length, 0, "no overlapping read while pending");
  complete();
  await settle();
  assert.deepEqual(delays, [6000]);
  const next = tasks.pop();
  assert.ok(next);
  next();
  assert.equal(reads, 2);
  stop();
  complete();
  await settle();
  assert.equal(tasks.length, 0);
  assert.deepEqual(delays, [6000]);
  assert.equal(reads, 2);
});

test("queue song rows show actual current track, votes and wait without diagnostics", () => {
  const value: Queue = {
    ...snapshot,
    estado: "ABIERTO",
    enReproduccion: {
      solicitudId: null,
      cancion: { ...song, titulo: "Current track" },
      iniciadaAt: establishment.creadoAt,
      restanteSegundos: 15,
    },
  };
  const html = renderToStaticMarkup(
    createElement(QueueSongs, { snapshot: value }),
  );
  for (const text of ["Tema", "1 voto<", "Sin espera", ">01<", "Artista"])
    assert.ok(html.includes(text), text);
  assert.doesNotMatch(html, /1 votos|min aprox/);
  const playing = renderToStaticMarkup(
    createElement(NowPlaying, { playing: value.enReproduccion }),
  );
  for (const text of ["Current track", "En reproducción", "eq--on"])
    assert.ok(playing.includes(text), text);
  assert.doesNotMatch(playing, /2026-|Versión|servidor|backend|<button/);
  assert.doesNotMatch(html, /2026-|Versión|servidor|backend|<button|<select/);
});

test("list entry automatically loads current/history and initializes one editable draft without publishing", async () => {
  const calls: string[] = [];
  const model = new ListDraft(
    {
      async currentList() {
        calls.push("current");
        return list as DefaultList;
      },
      async listHistory() {
        calls.push("history");
        return [];
      },
      async publishList() {
        calls.push("WRITE");
        return list as DefaultList;
      },
    },
    id,
    true,
  );
  model.enter();
  await settle();
  assert.deepEqual(calls, ["current", "history"]);
  assert.equal(model.getSnapshot().songs[0].videoId, song.videoId);
  assert.equal(model.getSnapshot().name, "General");
  model.edit({ name: "My changes", rotation: ROTATION.RANDOM });
  model.pick({ ...song, canal: "Channel", videoId: "lmnopqrstuv" });
  model.pick({ ...song, canal: "Channel", videoId: "lmnopqrstuv" });
  model.enter();
  await settle();
  assert.equal(model.getSnapshot().songs.length, 2);
  assert.equal(model.getSnapshot().name, "My changes");
  assert.equal(model.getSnapshot().rotation, ROTATION.RANDOM);
  assert.deepEqual(calls, ["current", "history"]);
  model.dispose();
});

test("late list initialization preserves edits made while loading and ignores disposed results", async () => {
  let resolve: (value: DefaultList | null) => void = () => {};
  let history = 0;
  const model = new ListDraft(
    {
      currentList: () =>
        new Promise((done) => {
          resolve = done;
        }),
      async listHistory() {
        history++;
        return [];
      },
      async publishList() {
        throw Error("unexpected write");
      },
    },
    id,
    true,
  );
  model.enter();
  model.edit({ name: "Unsaved" });
  model.pick({ ...song, canal: "Channel", videoId: "lmnopqrstuv" });
  resolve(list as DefaultList);
  await settle();
  assert.equal(model.getSnapshot().name, "Unsaved");
  assert.deepEqual(
    model.getSnapshot().songs.map((s) => s.videoId),
    ["lmnopqrstuv"],
  );
  const pending = model.refresh();
  const before = model.getSnapshot();
  model.dispose();
  resolve(null);
  await pending;
  assert.equal(model.getSnapshot(), before);
  assert.equal(history, 1, "disposal stops follow-up reads");
});

test("confirmed save refreshes once; uncertain save never retries and retains draft", async () => {
  let reads = 0;
  let writes = 0;
  let fail = false;
  const model = new ListDraft(
    {
      async currentList() {
        reads++;
        return list as DefaultList;
      },
      async listHistory() {
        return [];
      },
      async publishList() {
        writes++;
        if (fail) throw Error("lost acknowledgement");
        return list as DefaultList;
      },
    },
    id,
    true,
  );
  model.enter();
  await settle();
  model.edit({ name: "Keep me" });
  await Promise.all([model.publish(), model.publish()]);
  assert.equal(writes, 1);
  assert.equal(reads, 2);
  assert.equal(model.getSnapshot().notice, "Lista guardada");
  assert.equal(model.getSnapshot().name, "Keep me");
  fail = true;
  await model.publish();
  const before = model.getSnapshot();
  await model.publish();
  model.enter();
  await settle();
  assert.equal(writes, 2);
  assert.equal(reads, 2);
  assert.equal(model.getSnapshot(), before);
  assert.equal(before.uncertain, true);
  assert.equal(before.name, "Keep me");
  assert.equal(before.songs.length, 1);
  await model.refresh();
  assert.equal(model.getSnapshot().uncertain, false);
  assert.equal(model.getSnapshot().name, "Keep me");
  model.dispose();
});

test("music queue is a concise read-only song view before automatic hydration", () => {
  let reads = 0;
  const api = new DemoApi(async () => {
    reads++;
    return Response.json({});
  });
  const html = renderToStaticMarkup(
    createElement(QueuePanel, {
      api,
      establishment,
      session: null,
    }),
  );
  assert.match(html, /Cola en vivo/);
  assert.match(html, /Actualización automática/);
  assert.match(html, /aria-busy="true"/);
  assert.match(html, /El local está preparando la música/);
  assert.doesNotMatch(
    html,
    /<button|<select|servidor|backend|Versión|Actualizar cola/,
  );
  assert.equal(reads, 0, "prerender never performs requests");
});

test("owner-only BFF rejects legacy and foreign identifier routes without effects", async () => {
  const h = harness();
  for (const path of [
    "/api/staff/establecimientos",
    "/api/admin/establecimientos",
    `/api/mi-establecimiento/${id}`,
    `/api/mi-establecimiento/sesiones/${id}`,
    "/api/mi-establecimiento?establecimientoId=foreign",
  ]) {
    const response = await proxyRequest(request(path), h);
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { code: "NOT_FOUND" });
  }
  for (const body of [
    { nombre: "Sala", propietarioSub: "foreign" },
    { nombre: "Sala", establecimientoId: id },
    { nombre: "Sala", sesionId: id },
  ]) {
    const response = await proxyRequest(
      request("/api/mi-establecimiento", "POST", JSON.stringify(body)),
      h,
    );
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { code: "INVALID_BODY" });
  }
  assert.equal(h.calls.length, 0);
  assert.equal(h.credentials, 0);
});

test("session pause/resume and effective public availability are narrowly allowed", async () => {
  for (const path of [
    "/api/mi-establecimiento/sesion/pausa",
    "/api/mi-establecimiento/sesion/reanudacion",
    "/api/mi-establecimiento/reanudacion",
    "/api/mi-establecimiento/mantenimiento/fin",
  ]) {
    const h = harness();
    const rejected = await proxyRequest(
      request(path, "POST", undefined, null),
      h,
    );
    assert.equal(rejected.status, 403);
    assert.equal(h.calls.length, 0);
    assert.equal(h.credentials, 0);
    const response = await proxyRequest(request(path, "POST"), h);
    assert.equal(response.status, 201);
    assert.equal(h.calls[0].url, h.apiUrl + path);
    assert.equal(h.calls[0].init?.body, undefined);
  }
  const h = harness();
  assert.equal(
    (await proxyRequest(request("/api/public/establecimientos/sala"), h))
      .status,
    201,
  );
  assert.equal(h.calls.length, 1);
});

test("public queue accepts maintenance and default-list playback acknowledgments", async () => {
  const start = {
    reproduccionId: id,
    origen: "DEFECTO",
    solicitudId: null,
    cancion: song,
    iniciadaAt: establishment.creadoAt,
    votos: 0,
    colaVersion: 3,
  };
  const end = {
    reproduccionId: id,
    solicitudId: null,
    resultado: "COMPLETADA",
    motivoCodigo: null,
    terminadaAt: establishment.creadoAt,
    colaVersion: 4,
  };
  const h = apiHarness([{ ...snapshot, estado: "MANTENIMIENTO" }, start, end]);
  assert.equal((await h.api.queue("sala")).estado, "MANTENIMIENTO");
  assert.deepEqual(await h.api.next(id), start);
  assert.deepEqual(await h.api.finish(id, "COMPLETADA"), end);
  assert.equal(h.calls.length, 3);
});

test("owner session and service controls send no foreign identifiers and preserve rejection", async () => {
  const session = {
    id,
    establecimientoId: id,
    listaId: id,
    fechaOperativa: "2026-06-01",
    estado: "PAUSADA",
    abiertaAt: establishment.creadoAt,
    cerradaAt: null,
  };
  const h = apiHarness([
    session,
    { ...session, estado: "ABIERTA" },
    establishment,
    establishment,
  ]);
  assert.deepEqual(await h.api.pauseSession(), session);
  assert.equal((await h.api.resumeSession()).estado, "ABIERTA");
  assert.deepEqual(await h.api.resumeService(), establishment);
  assert.deepEqual(await h.api.endMaintenance(), establishment);
  assert.deepEqual(
    h.calls.map((call) => [call.url, call.options.method, call.options.body]),
    [
      ["/api/bff/api/mi-establecimiento/sesion/pausa", "POST", undefined],
      ["/api/bff/api/mi-establecimiento/sesion/reanudacion", "POST", undefined],
      ["/api/bff/api/mi-establecimiento/reanudacion", "POST", undefined],
      ["/api/bff/api/mi-establecimiento/mantenimiento/fin", "POST", undefined],
    ],
  );
  let calls = 0;
  const rejected = new DemoApi(async () => {
    calls++;
    return Response.json(
      { code: "SESSION_NOT_PAUSABLE", detail: "private" },
      { status: 409 },
    );
  });
  await assert.rejects(rejected.pauseSession(), /Solo se puede pausar/);
  assert.equal(calls, 1);
});

test("public effective availability distinguishes service states and optional next opening without credentials", async () => {
  for (const servicio of ["ABIERTO", "PAUSADO", "CERRADO", "MANTENIMIENTO"]) {
    const value = {
      nombre: "Sala",
      qrSlug: "sala",
      servicio,
      puedeParticipar: servicio === "ABIERTO",
      proximaApertura: "2026-06-02T00:00:00Z",
    };
    const h = apiHarness([value]);
    assert.deepEqual(await h.api.availability("sala"), value);
    assert.equal(h.calls[0].url, "/api/bff/api/public/establecimientos/sala");
    assert.equal(
      new Headers(h.calls[0].options.headers).has("Authorization"),
      false,
    );
  }
  const h = apiHarness([
    {
      nombre: "Sala",
      qrSlug: "sala",
      servicio: "ABIERTA",
      puedeParticipar: true,
    },
    {
      nombre: "Sala",
      qrSlug: "sala",
      servicio: "ABIERTO",
      puedeParticipar: true,
      token: "synthetic-only",
    },
  ]);
  await assert.rejects(h.api.availability("sala"), /respuesta/);
  await assert.rejects(h.api.availability("sala"), /respuesta/);
  await assert.rejects(h.api.availability("Bad"));
  assert.equal(h.calls.length, 2);
});

test("only exact NO_ESTABLISHMENT 404 enables onboarding", async () => {
  for (const [status, code] of [
    [404, "ESTABLISHMENT_NOT_FOUND"],
    [500, "NO_ESTABLISHMENT"],
    [401, "NO_ESTABLISHMENT"],
  ] as const) {
    let calls = 0;
    const api = new DemoApi(async () => {
      calls++;
      return Response.json({ code }, { status });
    });
    await assert.rejects(api.establishments());
    assert.equal(calls, 1);
  }
  const api = new DemoApi(async () =>
    Response.json({ code: "NO_ESTABLISHMENT" }, { status: 404 }),
  );
  assert.deepEqual(await api.establishments(), []);
});

test("operation gate rejects duplicate clicks, late selection/unmount results and older snapshots", () => {
  const gate = new OperationGate();
  const first = gate.begin();
  assert.ok(first !== null);
  assert.equal(gate.begin(), null);
  assert.equal(gate.valid(first), true);
  gate.end(first);
  const second = gate.begin();
  assert.ok(second !== null);
  assert.notEqual(second, first);
  assert.equal(gate.valid(first), false);
  gate.invalidate();
  assert.equal(gate.valid(second), false);
  const third = gate.begin();
  assert.ok(third !== null);
  gate.end(second);
  assert.equal(gate.begin(), null);
  assert.equal(gate.valid(third), true);
  gate.end(third);
  assert.equal(gate.acceptVersion(5), true);
  assert.equal(gate.acceptVersion(4), false);
  gate.acknowledge(7);
  assert.equal(gate.acceptVersion(6), false);
  assert.equal(gate.acceptVersion(7), true);
  gate.invalidate();
  assert.equal(gate.acceptVersion(0), true);
});

const id = "11111111-1111-4111-8111-111111111111";
const app = "http://localhost:3000";
const song = {
  videoId: "abcdefghijk",
  titulo: "Tema",
  artista: "Artista",
  artistaVerificado: false,
  duracionSegundos: null,
  miniaturaUrl: null,
};
const establishment = {
  id,
  nombre: "Sala",
  qrSlug: "sala",
  zonaHoraria: "America/Bogota",
  activo: true,
  pausado: false,
  enMantenimiento: false,
  creadoAt: "2026-06-01T00:00:00Z",
};
const list = {
  id,
  nombre: "General",
  version: 1,
  politicaRotacion: "SECUENCIAL",
  creadoAt: establishment.creadoAt,
  canciones: [
    {
      posicion: 1,
      cancionId: id,
      youtubeVideoId: song.videoId,
      titulo: null,
      artista: null,
      artistaVerificado: false,
      canal: null,
      duracionSegundos: null,
      miniaturaUrl: null,
    },
  ],
};
const snapshot = {
  colaVersion: 2,
  estado: "ABIERTO",
  enReproduccion: null,
  cola: [
    {
      solicitudId: id,
      posicion: 1,
      votos: 1,
      cancion: song,
      esperaEstimadaSegundos: 0,
    },
  ],
};
const writes = [
  ["POST", "/api/mi-establecimiento", { nombre: "Sala" }],
  ["PATCH", "/api/mi-establecimiento", { activo: false }],
  [
    "PUT",
    "/api/mi-establecimiento/lista-defecto",
    { canciones: [song.videoId], politicaRotacion: "ALEATORIA" },
  ],
  [
    "POST",
    "/api/mi-establecimiento/reproduccion/fin",
    { resultado: "COMPLETADA" },
  ],
] as const;
function request(
  path: string,
  method = "GET",
  body?: string,
  origin: string | null = app,
  type = "application/json",
) {
  return new Request(`${app}/api/bff${path}`, {
    method,
    headers: {
      ...(origin ? { Origin: origin } : {}),
      "Content-Type": type,
      Authorization: "incoming",
      Cookie: "incoming",
      "X-Extra": "ignored",
    },
    body,
  });
}
function harness() {
  const calls: { url: string; init?: RequestInit }[] = [];
  let credentials = 0;
  return {
    calls,
    get credentials() {
      return credentials;
    },
    appUrl: app,
    apiUrl: "http://localhost:8080",
    credential: async () => {
      credentials++;
      return "synthetic-access";
    },
    transport: (async (url, init) => {
      calls.push({ url: String(url), init });
      return Response.json(
        { acknowledged: true },
        {
          status: 201,
          headers: {
            "Set-Cookie": "blocked",
            Location: "https://blocked.test",
          },
        },
      );
    }) as typeof fetch,
  };
}
for (const [method, path, body] of writes) {
  test(`BFF ${method} ${path} forwards only validated JSON and server headers`, async () => {
    const h = harness();
    const response = await proxyRequest(
      request(path, method, JSON.stringify(body)),
      h,
    );
    assert.equal(response.status, 201);
    assert.deepEqual(await response.json(), { acknowledged: true });
    assert.equal(h.calls.length, 1);
    assert.equal(h.calls[0].url, h.apiUrl + path);
    assert.equal(h.calls[0].init?.method, method);
    assert.deepEqual(JSON.parse(String(h.calls[0].init?.body)), body);
    assert.deepEqual(Array.from(new Headers(h.calls[0].init?.headers)), [
      ["accept", "application/json"],
      ["authorization", "Bearer synthetic-access"],
      ["content-type", "application/json"],
    ]);
    assert.equal(response.headers.get("Set-Cookie"), null);
    assert.equal(response.headers.get("Location"), null);
    assert.equal(h.calls[0].init?.redirect, "error");
    assert.equal(h.calls[0].init?.credentials, "omit");
  });
  test(`BFF ${method} ${path} requires exact Origin before credentials or effects`, async () => {
    const h = harness();
    for (const origin of [null, "https://foreign.test", `${app}/`]) {
      const response = await proxyRequest(
        request(path, method, JSON.stringify(body), origin),
        h,
      );
      assert.equal(response.status, 403);
      assert.deepEqual(await response.json(), { code: "INVALID_ORIGIN" });
    }
    assert.equal(h.calls.length, 0);
    assert.equal(h.credentials, 0);
  });
}
const invalidWrites: [string, string, unknown][] = [
  ["POST", writes[0][1], { nombre: " " }],
  ["POST", writes[0][1], { nombre: "x".repeat(121) }],
  ["POST", writes[0][1], { nombre: "Sala", qrSlug: "Bad" }],
  ["POST", writes[0][1], { nombre: "Sala", zonaHoraria: "x".repeat(65) }],
  ["POST", writes[0][1], { nombre: "Sala", extra: true }],
  ["PATCH", writes[1][1], {}],
  ["PATCH", writes[1][1], { qrSlug: "immutable" }],
  ["PATCH", writes[1][1], { activo: "false" }],
  ["PUT", writes[2][1], { canciones: [] }],
  ["PUT", writes[2][1], { canciones: [song.videoId, song.videoId] }],
  ["PUT", writes[2][1], { canciones: ["fake"] }],
  [
    "PUT",
    writes[2][1],
    {
      canciones: Array.from({ length: 201 }, (_, i) =>
        String(i).padStart(11, "0"),
      ),
    },
  ],
  [
    "PUT",
    writes[2][1],
    { canciones: [song.videoId], politicaRotacion: "RANDOM" },
  ],
  ["PUT", writes[2][1], { canciones: [song.videoId], nombre: "x".repeat(101) }],
  ["POST", writes[3][1], { resultado: "INTERRUMPIDA_CIERRE" }],
  ["POST", writes[3][1], { resultado: "SALTADA", extra: true }],
];
test("BFF rejects invalid object fields/types/enums/limits without credential or upstream effects", async () => {
  const h = harness();
  for (const [method, path, body] of invalidWrites) {
    const response = await proxyRequest(
      request(path, method, JSON.stringify(body)),
      h,
    );
    assert.equal(response.status, 400, JSON.stringify(body));
    assert.deepEqual(await response.json(), { code: "INVALID_BODY" });
  }
  for (const body of ["null", "[]", "{", '"text"']) {
    const response = await proxyRequest(request(writes[0][1], "POST", body), h);
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { code: "INVALID_BODY" });
  }
  assert.equal(h.calls.length, 0);
  assert.equal(h.credentials, 0);
});
test("BFF bounds actual streamed bytes without trusting Content-Length", async () => {
  const h = harness();
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      controller.enqueue(new Uint8Array(4096).fill(32));
    },
    cancel() {
      cancelled = true;
    },
  });
  const req = new Request(`${app}/api/bff${writes[0][1]}`, {
    method: "POST",
    headers: {
      Origin: app,
      "Content-Type": "application/json",
      "Content-Length": "1",
    },
    body: stream,
    duplex: "half",
  } as RequestInit);
  const response = await proxyRequest(req, h);
  assert.equal(response.status, 413);
  assert.deepEqual(await response.json(), { code: "BODY_TOO_LARGE" });
  assert.equal(cancelled, true);
  assert.equal(h.calls.length, 0);
  assert.equal(h.credentials, 0);
});
test("BFF rejects non-JSON content before upstream effects", async () => {
  const h = harness();
  const response = await proxyRequest(
    request(writes[0][1], "POST", '{"nombre":"Sala"}', app, "text/plain"),
    h,
  );
  assert.equal(response.status, 415);
  assert.deepEqual(await response.json(), { code: "UNSUPPORTED_MEDIA_TYPE" });
  assert.equal(h.calls.length, 0);
  assert.equal(h.credentials, 0);
});
const reads = [
  "/api/mi-establecimiento/lista-defecto",
  "/api/mi-establecimiento/listas-defecto",
  "/api/mi-establecimiento/catalogo/sugerencias?q=ro",
  "/api/public/establecimientos/sala/cola",
];
test("BFF narrowly allows list/history/suggestions/public queue through authenticated transport", async () => {
  for (const path of reads) {
    const h = harness();
    assert.equal((await proxyRequest(request(path), h)).status, 201);
    assert.equal(h.calls[0].url, h.apiUrl + path);
    assert.equal(
      (
        await proxyRequest(request(path), {
          ...h,
          credential: async () => null,
        })
      ).status,
      401,
    );
  }
  const h = harness();
  for (const path of [
    "/api/staff/cola",
    "/api/participante/cola",
    "/api/public/establecimientos/Bad/cola",
    `${reads[0]}?x=1`,
  ])
    assert.equal((await proxyRequest(request(path), h)).status, 404);
  for (const query of [
    "",
    "?q=a",
    "?q=ro&q=ck",
    "?q=ro&pagina=x",
    `?q=${"x".repeat(101)}`,
  ]) {
    const response = await proxyRequest(
      request(`/api/mi-establecimiento/catalogo/sugerencias${query}`),
      h,
    );
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { code: "INVALID_QUERY" });
  }
  assert.equal(h.calls.length, 0);
});
test("BFF next is bodyless, Origin-protected and forwards exact path", async () => {
  const h = harness();
  const path = "/api/mi-establecimiento/reproduccion/siguiente";
  assert.equal(
    (await proxyRequest(request(path, "POST", undefined, null), h)).status,
    403,
  );
  assert.equal((await proxyRequest(request(path, "POST"), h)).status, 201);
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].init?.body, undefined);
});
test("BFF migrates six bodyless contracts and preserves catalog pagination", async () => {
  const existing = [
    ["GET", "/api/mi-establecimiento"],
    ["GET", "/api/mi-establecimiento/sesion-actual"],
    ["GET", "/api/mi-establecimiento/qr"],
    ["GET", "/api/mi-establecimiento/catalogo/busqueda?q=rock&pagina=next="],
    ["POST", "/api/mi-establecimiento/sesiones"],
    ["POST", "/api/mi-establecimiento/sesion/cierre"],
  ];
  for (const [method, path] of existing) {
    const h = harness();
    const response = await proxyRequest(
      request(
        path,
        method,
        method === "POST" ? "ignored legacy body" : undefined,
      ),
      h,
    );
    assert.equal(response.status, 201);
    assert.deepEqual(await response.json(), { acknowledged: true });
    assert.equal(h.calls.length, 1);
    assert.equal(h.calls[0].url, h.apiUrl + path);
    assert.equal(h.calls[0].init?.body, undefined);
    assert.equal(
      new Headers(h.calls[0].init?.headers).get("Content-Type"),
      null,
    );
    assert.equal(h.calls[0].init?.cache, "no-store");
  }
});
test("BFF permits boundary-sized list with 200 unique catalog IDs", async () => {
  const h = harness();
  const canciones = Array.from({ length: 200 }, (_, i) =>
    String(i).padStart(11, "0"),
  );
  const response = await proxyRequest(
    request(
      writes[2][1],
      "PUT",
      JSON.stringify({
        nombre: "x".repeat(100),
        politicaRotacion: "SECUENCIAL",
        canciones,
      }),
    ),
    h,
  );
  assert.equal(response.status, 201);
  assert.equal(h.calls.length, 1);
  assert.equal(JSON.parse(String(h.calls[0].init?.body)).canciones.length, 200);
});

test("new BFF contracts preserve error status/code without upstream diagnostics", async () => {
  for (const status of [400, 401, 403, 409, 413, 429, 503]) {
    const h = harness();
    h.transport = async () =>
      Response.json(
        { code: "QUEUE_EMPTY", detail: "private diagnostic", trace: "private" },
        { status },
      );
    const response = await proxyRequest(
      request("/api/mi-establecimiento/reproduccion/siguiente", "POST"),
      h,
    );
    assert.equal(response.status, status);
    assert.deepEqual(await response.json(), { code: "QUEUE_EMPTY" });
  }
});

test("history accepts the actual backend totalCanciones DTO", async () => {
  const summary = {
    id,
    nombre: "General",
    version: 1,
    politicaRotacion: "SECUENCIAL",
    creadoAt: establishment.creadoAt,
    totalCanciones: 1,
  };
  const h = apiHarness([[summary]]);
  assert.deepEqual(await h.api.listHistory(id), [summary]);
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].options.method, "GET");
});

function apiHarness(responses: unknown[]) {
  const calls: { url: string; options: RequestInit }[] = [];
  const api = new DemoApi(async (url, options) => {
    calls.push({ url, options });
    return Response.json(responses.shift());
  });
  return { api, calls };
}
test("Demo API creates and edits establishments with exact DTO and request bodies", async () => {
  const h = apiHarness([establishment, establishment]);
  assert.deepEqual(
    await h.api.createEstablishment({ nombre: "Sala" }),
    establishment,
  );
  assert.deepEqual(
    await h.api.updateEstablishment(id, { activo: true }),
    establishment,
  );
  assert.deepEqual(
    h.calls.map((c) => [
      c.url,
      c.options.method,
      JSON.parse(String(c.options.body)),
    ]),
    [
      ["/api/bff/api/mi-establecimiento", "POST", { nombre: "Sala" }],
      ["/api/bff/api/mi-establecimiento", "PATCH", { activo: true }],
    ],
  );
});
test("Demo API publishes 1-200 unique IDs and reads current and history versions", async () => {
  const history = [
    {
      id,
      nombre: "General",
      version: 1,
      politicaRotacion: "SECUENCIAL",
      creadoAt: establishment.creadoAt,
      totalCanciones: 1,
    },
  ];
  const h = apiHarness([list, list, history]);
  const body = { canciones: [song.videoId] };
  assert.deepEqual(await h.api.publishList(id, body), list);
  assert.deepEqual(await h.api.currentList(id), list);
  assert.deepEqual(await h.api.listHistory(id), history);
  assert.deepEqual(
    h.calls.map((c) => c.options.method),
    ["PUT", "GET", "GET"],
  );
  assert.deepEqual(JSON.parse(String(h.calls[0].options.body)), body);
});
test("Demo API distinguishes suggestion strings from songs and public queue from participant fields", async () => {
  const suggestions = {
    sugerencias: [
      { tipo: "BUSQUEDA", texto: "rock" },
      { tipo: "CANCION", texto: "Tema", cancion: { ...song, canal: "Canal" } },
    ],
  };
  const h = apiHarness([suggestions, snapshot]);
  assert.deepEqual(await h.api.suggestions(" ro "), suggestions);
  assert.deepEqual(await h.api.queue("sala"), snapshot);
  assert.equal(
    h.calls[0].url,
    "/api/bff/api/mi-establecimiento/catalogo/sugerencias?q=ro",
  );
  assert.equal(
    h.calls[1].url,
    "/api/bff/api/public/establecimientos/sala/cola",
  );
  assert.equal("votado" in snapshot.cola[0], false);
});
test("Demo API next and finish use queue-song DTO without canal and acknowledge server version", async () => {
  const start = {
    reproduccionId: id,
    origen: "SOLICITUD",
    solicitudId: id,
    cancion: song,
    iniciadaAt: establishment.creadoAt,
    votos: 1,
    colaVersion: 3,
  };
  const end = {
    reproduccionId: id,
    solicitudId: id,
    resultado: "SALTADA",
    motivoCodigo: "SALTO_MANUAL",
    terminadaAt: establishment.creadoAt,
    colaVersion: 4,
  };
  const h = apiHarness([start, end]);
  assert.deepEqual(await h.api.next(id), start);
  assert.deepEqual(await h.api.finish(id, "SALTADA"), end);
  assert.equal(h.calls[0].options.body, undefined);
  assert.equal(
    h.calls[0].url,
    "/api/bff/api/mi-establecimiento/reproduccion/siguiente",
  );
  assert.deepEqual(JSON.parse(String(h.calls[1].options.body)), {
    resultado: "SALTADA",
  });
});
test("Demo API rejects invalid writes before transport", async () => {
  const h = apiHarness([]);
  for (const [method, , body] of invalidWrites) {
    if (method === "PATCH")
      await assert.rejects(h.api.updateEstablishment(id, body));
    else if (method === "PUT")
      await assert.rejects(h.api.publishList(id, body));
    else if (typeof body === "object" && body !== null && "resultado" in body) {
      // The browser API accepts an enum, not an arbitrary object; extra-field
      // rejection is tested at the BFF boundary above.
      if (!("extra" in body))
        await assert.rejects(h.api.finish(id, String(body.resultado)));
    } else await assert.rejects(h.api.createEstablishment(body));
  }
  assert.equal(h.calls.length, 0);
});
test("Demo API handles only exact missing-list 404 and rejects malformed successful DTOs", async () => {
  const missing = new DemoApi(async () =>
    Response.json({ code: "NO_DEFAULT_LIST" }, { status: 404 }),
  );
  assert.equal(await missing.currentList(id), null);
  const wrong = new DemoApi(async () =>
    Response.json({ code: "ESTABLISHMENT_NOT_FOUND" }, { status: 404 }),
  );
  await assert.rejects(wrong.currentList(id));
  const h = apiHarness([
    { ...snapshot, estado: "ABIERTA" },
    { ...snapshot, cola: [{ ...snapshot.cola[0], votado: false }] },
    { sugerencias: [{ tipo: "CANCION", texto: "Tema", cancion: song }] },
    { ...list, politicaRotacion: "invented" },
    { reproduccionId: id, colaVersion: 3 },
  ]);
  await assert.rejects(h.api.queue("sala"), /respuesta/);
  await assert.rejects(h.api.queue("sala"), /respuesta/);
  await assert.rejects(h.api.suggestions("ro"), /respuesta/);
  await assert.rejects(h.api.currentList(id), /respuesta/);
  await assert.rejects(h.api.next(id), /respuesta/);
  assert.equal(h.calls.length, 5);
});

test("Demo API reports conflict, permission, invalid and uncertain results without retries or diagnostics", async () => {
  for (const [status, code, fragment] of [
    [409, "QUEUE_EMPTY", "cola"],
    [409, "PLAYBACK_IN_PROGRESS", "curso"],
    [409, "NO_ACTIVE_PLAYBACK", "activa"],
    [403, "FORBIDDEN", "permisos"],
    [400, "INVALID_BODY", "datos"],
    [413, "BODY_TOO_LARGE", "tamaño"],
  ] as const) {
    let calls = 0;
    const api = new DemoApi(async () => {
      calls++;
      return Response.json({ code, detail: "private diagnostics" }, { status });
    });
    await assert.rejects(
      api.next(id),
      (e: unknown) =>
        e instanceof Error &&
        e.message.includes(fragment) &&
        !e.message.includes("private"),
    );
    assert.equal(calls, 1);
  }
  let calls = 0;
  const offline = new DemoApi(async () => {
    calls++;
    throw Error("private");
  });
  await assert.rejects(offline.next(id), /incierto/);
  assert.equal(calls, 1);
});

test("owner search rejects duplicate pagination before credentials or effects", async () => {
  const h = harness();
  const response = await proxyRequest(
    request("/api/mi-establecimiento/catalogo/busqueda?q=ro&pagina=a&pagina=b"),
    h,
  );
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { code: "INVALID_QUERY" });
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.equal(h.credentials, 0);
  assert.equal(h.calls.length, 0);
});

test(
  "owner JSON read deadline cancels stalled input without effects",
  { timeout: 8000 },
  async () => {
    const h = harness();
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("{"));
      },
      cancel() {
        cancelled = true;
      },
    });
    const response = await proxyRequest(
      new Request(`${app}/api/bff/api/mi-establecimiento`, {
        method: "POST",
        headers: { Origin: app, "Content-Type": "application/json" },
        body,
        duplex: "half",
      } as RequestInit),
      h,
    );
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { code: "INVALID_BODY" });
    assert.equal(cancelled, true);
    assert.equal(h.credentials, 0);
    assert.equal(h.calls.length, 0);
  },
);

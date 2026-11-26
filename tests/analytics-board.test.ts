import { strict as assert } from "node:assert";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AnalyticsBoard } from "../src/components/owner/analytics-board";
import { GenreCube } from "../src/components/owner/genre-cube";
import {
  isAnalitica,
  isJornada,
  REQUEST_STATE_LABEL,
  REQUEST_STATES,
} from "../src/lib/analytics-contracts";
import {
  bucketLabel,
  channelReading,
  clockLabel,
  cubeModel,
  funnelReading,
  genreReading,
  hourLabel,
  hourlyReading,
  hourlySummary,
  liveLabel,
  nightTag,
  participationReading,
  participationRows,
  participationSummary,
  playbackReading,
  rankingReading,
  shouldPoll,
  statesReading,
  versusReading,
  waitReading,
} from "../src/lib/analytics-insights";
import { proxyRequest } from "../src/lib/bff";
import { DemoApi } from "../src/lib/demo-api";
import { ownerError } from "../src/lib/owner-copy";
import {
  closedNight,
  history,
  liveNight,
  noNight,
  sessionId,
  unpublished,
} from "./analytics-fixtures";

const clone = <T>(value: T): T => structuredClone(value);
const TZ = "America/Bogota";

test("analytics guard accepts the published contract and rejects malformed history", () => {
  assert.equal(isAnalitica(history), true);
  assert.equal(isAnalitica(unpublished), true);
  const broken: unknown[] = [
    null,
    [],
    { ...history, publicacion: { ...history.publicacion, version: 0 } },
    { ...history, publicacion: undefined },
    {
      ...history,
      jornadas: [{ sesionId: "nope", fechaOperativa: "2025-11-21" }],
    },
    {
      ...history,
      jornadas: [{ sesionId: sessionId(1), fechaOperativa: "21/11" }],
    },
    {
      ...history,
      participacion: [{ sesionId: sessionId(1), ingresaron: 3, activas: 4 }],
    },
    { ...history, canales: { WEB: 1 } },
    { ...history, canales: { WEB: 1, ANDROID: -1 } },
    { ...history, canales: { WEB: 1, ANDROID: 1, IOS: 1 } },
    { ...history, ranking: [...history.ranking, history.ranking[0]] },
    { ...history, ranking: [{ ...history.ranking[0], completadas: 1.5 }] },
  ];
  const cellCases: [string, unknown][] = [
    [
      "suppressed with value",
      { genero: "Salsa", hora: 20, porcentaje: 3, suprimida: true },
    ],
    [
      "visible without value",
      { genero: "Salsa", hora: 20, porcentaje: null, suprimida: false },
    ],
    [
      "over 100",
      { genero: "Salsa", hora: 20, porcentaje: 101, suprimida: false },
    ],
    ["hour 24", { genero: "Salsa", hora: 24, porcentaje: 1, suprimida: false }],
    ["blank genre", { genero: " ", hora: 20, porcentaje: 1, suprimida: false }],
  ];
  for (const [, cell] of cellCases)
    broken.push({
      ...history,
      generosPorHora: [{ ...history.generosPorHora[0], celdas: [cell] }],
    });
  broken.push({
    ...history,
    generosPorHora: [{ ...history.generosPorHora[0], diaSemana: 8 }],
  });
  for (const value of broken)
    assert.equal(
      isAnalitica(value),
      false,
      JSON.stringify(value)?.slice(0, 120),
    );
});

test("night guard accepts live, closed and empty nights and rejects malformed ones", () => {
  for (const night of [closedNight, liveNight, noNight])
    assert.equal(isJornada(night), true);
  const variants: ((night: typeof closedNight) => void)[] = [
    (n) => {
      (n as { sesion: unknown }).sesion = { ...n.sesion, estado: "ABIERTO" };
    },
    (n) => {
      delete (n.estados as Partial<typeof n.estados>).RESERVADA;
    },
    (n) => {
      (n.estados as Record<string, number>).PERDIDA = 1;
    },
    (n) => {
      n.embudo.iniciadas = n.embudo.creadas + 1;
    },
    (n) => {
      n.reproducciones = [n.reproducciones[0]];
    },
    (n) => {
      n.reproducciones = [n.reproducciones[0], n.reproducciones[0]];
    },
    (n) => {
      n.reproducciones[1].enCurso = -1;
    },
    (n) => {
      n.espera.tramos = [{ desdeMin: 5, hastaMin: 5, total: 1 }];
    },
    (n) => {
      n.espera.medianaS = 1.5;
    },
    (n) => {
      n.porHora = [{ hora: 25, solicitudes: 1, votos: 1 }];
    },
    (n) => {
      n.corteAt = "ayer";
    },
    (n) => {
      (n as { enVivo: unknown }).enVivo = "si";
    },
  ];
  for (const change of variants) {
    const night = clone(closedNight);
    change(night);
    assert.equal(isJornada(night), false, change.toString());
  }
});

const app = "http://localhost:3000";
function harness(reply: () => Response = () => Response.json({ ok: true })) {
  const calls: string[] = [];
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
      return "synthetic-owner-access";
    },
    transport: (async (url: string) => {
      calls.push(String(url));
      return reply();
    }) as unknown as typeof fetch,
  };
}
const request = (path: string, method = "GET") =>
  new Request(`${app}/api/bff${path}`, { method, headers: { Origin: app } });

test("BFF forwards analytics with the owner credential and an optional 1..30 nights", async () => {
  const base = "/api/mi-establecimiento/analitica";
  for (const query of ["", "?jornadas=1", "?jornadas=8", "?jornadas=30"]) {
    const h = harness();
    assert.equal(
      (await proxyRequest(request(base + query), h)).status,
      200,
      query,
    );
    assert.deepEqual(h.calls, [`http://localhost:8080${base}${query}`]);
    assert.equal(h.credentials, 1);
  }
  const h = harness();
  for (const query of [
    "?jornadas=0",
    "?jornadas=31",
    "?jornadas=08",
    "?jornadas=8.0",
    "?jornadas=-1",
    "?jornadas=",
    "?jornadas=8&jornadas=7",
    "?jornadas=8&dias=7",
    "?sesionId=00000000-0000-4000-8000-000000000001",
  ]) {
    const response = await proxyRequest(request(base + query), h);
    assert.equal(response.status, 400, query);
    assert.deepEqual(await response.json(), { code: "INVALID_PERIOD" });
  }
  for (const [path, method] of [
    [base, "POST"],
    [`${base}/extra`, "GET"],
    [`${base}/jornada/extra`, "GET"],
    [`${base}/jornada`, "DELETE"],
  ])
    assert.equal(
      (await proxyRequest(request(path, method), h)).status,
      404,
      path,
    );
  assert.equal(h.calls.length, 0);
  assert.equal(h.credentials, 0);
});

test("BFF forwards the night analytics with an optional single UUID only", async () => {
  const base = "/api/mi-establecimiento/analitica/jornada";
  const uuid = "8f14e45f-ceea-4e7a-9a3b-2b1c3d4e5f60";
  for (const query of [
    "",
    `?sesionId=${uuid}`,
    `?sesionId=${uuid.toUpperCase()}`,
  ]) {
    const h = harness();
    assert.equal(
      (await proxyRequest(request(base + query), h)).status,
      200,
      query,
    );
    assert.deepEqual(h.calls, [`http://localhost:8080${base}${query}`]);
  }
  const h = harness();
  for (const query of [
    "?sesionId=",
    "?sesionId=123",
    `?sesionId=${uuid}x`,
    `?sesionId=${uuid}&sesionId=${uuid}`,
    `?sesionId=${uuid}&jornadas=8`,
    "?sesionId=../../admin",
  ]) {
    const response = await proxyRequest(request(base + query), h);
    assert.equal(response.status, 400, query);
    assert.deepEqual(await response.json(), { code: "INVALID_QUERY" });
  }
  assert.equal(h.calls.length, 0);
  const missing = harness(() =>
    Response.json({ code: "SESSION_NOT_FOUND" }, { status: 404 }),
  );
  const response = await proxyRequest(
    request(`${base}?sesionId=${uuid}`),
    missing,
  );
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { code: "SESSION_NOT_FOUND" });
});

test("analytics client validates input before the transport and guards responses", async () => {
  const calls: string[] = [];
  const api = new DemoApi(async (url) => {
    calls.push(url);
    return Response.json(url.includes("/jornada") ? liveNight : history);
  });
  assert.equal((await api.analytics(8)).publicacion?.version, 12);
  assert.equal((await api.nightAnalytics()).enVivo, true);
  await api.nightAnalytics(sessionId(3));
  assert.deepEqual(calls, [
    "/api/bff/api/mi-establecimiento/analitica?jornadas=8",
    "/api/bff/api/mi-establecimiento/analitica/jornada",
    `/api/bff/api/mi-establecimiento/analitica/jornada?sesionId=${sessionId(3)}`,
  ]);
  await assert.rejects(api.analytics(0));
  await assert.rejects(api.analytics(31));
  await assert.rejects(api.nightAnalytics("not-a-uuid"));
  assert.equal(calls.length, 3, "invalid input never reaches the transport");
  const broken = new DemoApi(async () =>
    Response.json({ ...closedNight, enVivo: "no" }),
  );
  await assert.rejects(broken.nightAnalytics(), /respuesta no válida/);
});

test("an unknown night becomes a friendly owner message", async () => {
  const api = new DemoApi(async () =>
    Response.json({ code: "SESSION_NOT_FOUND" }, { status: 404 }),
  );
  const error = await api.nightAnalytics(sessionId(4)).catch((e) => e);
  assert.equal(
    ownerError(error),
    "No encontramos esa jornada. Elige otra o vuelve a la noche más reciente.",
  );
});

test("labels follow the night: hours cross midnight and dates carry the weekday", () => {
  assert.deepEqual([20, 23, 0, 1, 12].map(hourLabel), [
    "8 p. m.",
    "11 p. m.",
    "12 a. m.",
    "1 a. m.",
    "12 p. m.",
  ]);
  assert.equal(nightTag("2025-11-21"), "vie 21 nov");
  assert.equal(nightTag("2025-11-08"), "sáb 8 nov");
  assert.equal(clockLabel("2025-11-22T04:45:00Z", TZ), "11:45 p. m.");
  assert.equal(clockLabel("2025-11-22T06:10:00Z", TZ), "1:10 a. m.");
  assert.equal(bucketLabel({ desdeMin: 0, hastaMin: 5, total: 8 }), "0–5 min");
  assert.equal(
    bucketLabel({ desdeMin: 25, hastaMin: null, total: 1 }),
    "25+ min",
  );
});

test("each reading is computed from the data and matches the documented example", () => {
  const rows = participationRows(history);
  const summary = participationSummary(rows);
  assert.equal(summary?.promedio, 35.625);
  assert.equal(summary?.activasPct, 78);
  assert.equal(`${summary?.activas} de ${summary?.ingresaron}`, "223 de 285");
  assert.equal(summary?.pico.fechaOperativa, "2025-11-08");
  assert.equal(
    participationReading(rows),
    "En promedio el 78 % de quienes entran pide o vota. El pico fue el sábado 8 nov (44 ingresos); los sábados superan a los viernes.",
  );
  assert.equal(
    channelReading(history.canales),
    "Casi 7 de cada 10 entran por la web sin instalar nada: mantener el acceso por QR sin instalación es clave.",
  );
  const hourly = hourlySummary(closedNight.porHora);
  assert.deepEqual(
    [hourly.solicitudes, hourly.votos, hourly.pico?.hora, hourly.pico?.votos],
    [41, 186, 23, 55],
  );
  assert.equal(
    hourlyReading(closedNight.porHora),
    "El pico es de 10 a 11:59 p. m.: ahí entran 22 de las 41 solicitudes y 108 de los 186 votos.",
  );
  assert.equal(
    rankingReading(history.ranking),
    "Es un ranking propio del local, no de YouTube. Salsa y reggaetón ocupan 3 de los 5 primeros puestos.",
  );
  assert.equal(
    funnelReading(closedNight),
    "29 de 41 solicitudes empezaron a sonar y 26 terminaron completas (63 %). Las 3 de diferencia se saltaron después de iniciar.",
  );
  assert.equal(
    statesReading(closedNight),
    "9 solicitudes quedaron sin sonar al cierre (22 %): son la primera pista para ajustar la lista por defecto o la hora de cierre.",
  );
  assert.equal(
    waitReading(closedNight),
    "La mitad espera 9 minutos o menos; el 95 % espera hasta 24 minutos. Aparte quedaron 9 pendientes al cierre con 21 minutos de antigüedad mediana.",
  );
  assert.equal(
    playbackReading(closedNight),
    "Las 2 solicitudes fallidas generaron 4 intentos por los reintentos. La lista por defecto cubrió 6 momentos de cola vacía.",
  );
  const model = cubeModel(closedNight, history.generosPorHora);
  assert.equal(
    genreReading(model.layers[0], model.hours),
    "Rock en español abre la noche; reggaetón la cierra (50 % a la 1 a. m.). Salsa se mantiene estable toda la jornada.",
  );
  assert.equal(
    versusReading(history.ranking),
    "«Tusa» es la segunda más votada pero solo se completó 3 veces. «La camisa negra» se completa más de lo que se vota.",
  );
});

test("readings change with the data and are omitted when it is insufficient", () => {
  assert.equal(
    channelReading({ WEB: 30, ANDROID: 70 }),
    "7 de cada 10 entran con la app Android instalada: la app ya es el canal principal del local.",
  );
  for (const reading of [
    participationReading([]),
    channelReading({ WEB: 0, ANDROID: 0 }),
    hourlyReading([]),
    rankingReading([]),
    funnelReading(noNight),
    statesReading(noNight),
    waitReading(noNight),
    playbackReading(noNight),
    genreReading(cubeModel(noNight, []).layers[0], []),
    versusReading([]),
  ])
    assert.equal(reading, null);
  assert.equal(
    statesReading(liveNight),
    "Van 10 atendidas de 21 (48 %); 1 sonando ahora y 8 en espera.",
  );
  assert.equal(
    funnelReading(liveNight),
    "12 de 21 solicitudes empezaron a sonar y 10 terminaron completas (48 %). De las 2 de diferencia, 1 sigue sonando y 1 se saltó después de iniciar.",
  );
  assert.match(
    waitReading(liveNight) ?? "",
    /Ahora hay 8 pendientes con 10 minutos/,
  );
});

test("the cube puts the requested night in front and stacks the published nights behind", () => {
  const live = cubeModel(liveNight, history.generosPorHora);
  assert.equal(live.layers.length, 9);
  assert.deepEqual(
    live.layers.slice(0, 3).map((l) => [l.label, l.live]),
    [
      ["vie 28 nov", true],
      ["vie 21 nov", false],
      ["sáb 15 nov", false],
    ],
  );
  assert.deepEqual(live.hours, [20, 21, 22, 23, 0, 1]);
  assert.equal(live.genres.length, 5);
  const closed = cubeModel(closedNight, history.generosPorHora);
  assert.equal(closed.layers.length, 8, "the front night is not repeated");
  assert.equal(cubeModel(null, []).layers.length, 0);
});

test("polling only runs live with the page visible, and the indicator says how fresh it is", () => {
  assert.equal(shouldPoll(true, "visible"), true);
  assert.equal(shouldPoll(true, "hidden"), false);
  assert.equal(shouldPoll(false, "visible"), false);
  assert.equal(
    liveLabel({ live: true, updatedAt: 0, now: 7_400, failed: false }),
    "En vivo · actualizado hace 7 s",
  );
  assert.equal(
    liveLabel({ live: true, updatedAt: 0, now: 75_000, failed: true }),
    "Sin conexión: mostrando datos de hace 1 min",
  );
});

const render = (props: Parameters<typeof AnalyticsBoard>[0]) =>
  renderToStaticMarkup(createElement(AnalyticsBoard, props));

test("the board shows the ten documented charts in their two groups", () => {
  const html = render({
    history,
    night: closedNight,
    timeZone: TZ,
    status: "Actualizado hace 3 s",
  });
  const titles = [
    "Participación por jornada",
    "Canal de ingreso",
    "Solicitudes y votos por hora",
    "Ranking de popularidad",
    "De la solicitud a la canción completada",
    "Cómo terminaron las solicitudes",
    "Espera real hasta que suena",
    "Intentos de reproducción por origen",
    "Géneros por hora de la noche",
    "Más votadas vs. más reproducidas",
  ];
  for (const title of titles) assert.ok(html.includes(`>${title}</h3>`), title);
  const live = html.indexOf(">Jornada en curso</h2>");
  const past = html.indexOf(">Últimas 8 jornadas</h2>");
  assert.ok(live >= 0 && past > live);
  for (const title of titles.slice(0, 2))
    assert.ok(html.indexOf(title) > past, title);
  for (const title of [titles[2], titles[4], titles[5], titles[6], titles[7]])
    assert.ok(html.indexOf(title) > live && html.indexOf(title) < past, title);
  for (const text of [
    "¿Cuánta gente entra a participar en cada jornada y cuántos realmente piden o votan?",
    "Barras agrupadas · últimas 8 jornadas",
    "Barras + línea · jornada del 21 nov",
    "Barra apilada al 100 % · jornada del 21 nov · 41 solicitudes",
    "Histograma + mediana y p95 · jornada del 21 nov · 29 iniciadas",
    "Barras apiladas · jornada del 21 nov · 39 intentos",
    "Publicación v12",
    "corte 11:45 p. m.",
    ">35,6<",
    ">78 %<",
    "223 de 285",
    ">285<",
    ">9 min<",
    ">24 min<",
    "antigüedad mediana 21 min",
    "Pendientes al cierre",
    "Casi 7 de cada 10",
    "«Tusa» es la segunda más votada",
  ])
    assert.ok(html.includes(text), text);
  assert.equal((html.match(/class="reading"/g) ?? []).length, 10);
});

test("request and playback states are all labeled in Spanish, final apart from in progress", () => {
  const html = render({ history, night: liveNight, timeZone: TZ, status: "x" });
  for (const state of REQUEST_STATES)
    assert.ok(html.includes(`>${REQUEST_STATE_LABEL[state]}<`), state);
  for (const label of [
    "Completada",
    "Saltada",
    "Fallida",
    "Interrumpida al cierre",
    "En curso",
    "Solicitud",
    "Lista por defecto",
  ])
    assert.ok(html.includes(`>${label}<`), label);
  assert.match(html, /data-state="REPRODUCIENDO"[^>]*data-progress="true"/);
  assert.match(html, /data-state="ATENDIDA"[^>]*data-progress="false"/);
  assert.match(html, /En curso, puede cambiar/);
  // Zero-count states keep their legend entry but draw no bar segment.
  assert.doesNotMatch(html, /class="statebar__seg"[^>]*data-state="BLOQUEADA"/);
  assert.match(html, /data-key="BLOQUEADA"[^>]*>[\s\S]*?>0</);
});

test("an empty or unpublished dashboard says so instead of drawing zeros", () => {
  const html = render({
    history: unpublished,
    night: noNight,
    timeZone: TZ,
    status: "",
  });
  assert.match(html, /Aún no hay analítica publicada/);
  assert.match(html, /Aún no hay una noche para analizar/);
  assert.doesNotMatch(html, /class="reading"/);
  assert.doesNotMatch(html, />Participación por jornada</);
});

test("the genre cube is operable without a pointer and has a table alternative", () => {
  const model = cubeModel(liveNight, history.generosPorHora);
  const html = renderToStaticMarkup(
    createElement(GenreCube, { model, reducedMotion: false }),
  );
  for (const label of [
    "Girar a la izquierda",
    "Girar a la derecha",
    "Inclinar hacia arriba",
    "Inclinar hacia abajo",
    "Vista de frente",
  ])
    assert.ok(html.includes(label), label);
  assert.equal((html.match(/type="radio"/g) ?? []).length, 9);
  assert.match(html, /vie 28 nov \(en vivo\)/);
  assert.match(html, /<table/);
  assert.match(html, /<th scope="col"[^>]*>8 p\. m\.<\/th>/);
  assert.match(html, /&lt; 5/);
  assert.match(html, /aria-hidden="true"[^>]*class="cube__scene/);
});

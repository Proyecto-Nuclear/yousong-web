import { strict as assert } from "node:assert";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  Analytics,
  HighlightsView,
  NO_DATA,
} from "../src/components/owner/analytics";
import { OwnerNavigation } from "../src/components/owner/navigation";
import {
  barShare,
  hasHighlights,
  periodLabel,
  playedAgo,
  timesValue,
  topGenres,
  votesValue,
} from "../src/lib/analytics";
import { proxyRequest } from "../src/lib/bff";
import { DemoApi } from "../src/lib/demo-api";
import {
  type Highlights,
  isHighlights,
  PERIODS,
} from "../src/lib/demo-contracts";
import {
  OWNER_VIEW_SHORT,
  OWNER_VIEWS,
  ownerError,
} from "../src/lib/owner-copy";

const song = (titulo: string, genero?: string | null) => ({
  videoId: "kRt2sRyup6A",
  titulo,
  artista: "Artista",
  artistaVerificado: false,
  duracionSegundos: 200,
  miniaturaUrl: null,
  ...(genero === undefined ? {} : { genero }),
});
const data: Highlights = {
  periodoDias: 30,
  masVotadas: [
    { cancion: song("Tusa", "Reguetón"), votos: 40 },
    { cancion: song("Rebelión", "Salsa"), votos: 10 },
  ],
  masPedidas: [
    { cancion: song("Provenza", "Reguetón"), veces: 6 },
    { cancion: song("Gotas de Lluvia", "Salsa"), veces: 3 },
    { cancion: song("Tusa", "Reguetón"), veces: 2 },
    { cancion: song("Sin género"), veces: 9 },
    { cancion: song("Nulo", null), veces: 4 },
  ],
  masSonadas: [{ cancion: song("Rebelión"), reproducciones: 1 }],
  ultimasSonadas: [
    {
      cancion: song("Fruta Fresca"),
      sonoAt: "2026-11-21T20:00:00Z",
      enCurso: true,
    },
    {
      cancion: song("Mi Gente"),
      sonoAt: "2026-11-21T19:55:00Z",
      enCurso: false,
    },
  ],
};
const empty: Highlights = {
  periodoDias: 7,
  masVotadas: [],
  masPedidas: [],
  masSonadas: [],
  ultimasSonadas: [],
};

test("bars are proportional to the top value and nonzero values stay visible", () => {
  assert.equal(barShare(40, 40), 100);
  assert.equal(barShare(10, 40), 25);
  assert.equal(barShare(1, 1000), 4);
  assert.equal(barShare(0, 40), 0);
  assert.equal(barShare(5, 0), 0);
  assert.equal(barShare(50, 40), 100);
});

test("values read as Spanish text so meaning never depends on bar color", () => {
  assert.equal(votesValue(1), "1 voto");
  assert.equal(votesValue(48), "48 votos");
  assert.equal(timesValue(1), "1 vez");
  assert.equal(timesValue(3), "3 veces");
  assert.equal(periodLabel(30), "Últimos 30 días");
  assert.deepEqual([...PERIODS], [7, 30, 90]);
});

test("most requested genres are summed from requests and skip unknown genres", () => {
  assert.deepEqual(topGenres(data.masPedidas), [
    { genero: "Reguetón", veces: 8, share: 73 },
    { genero: "Salsa", veces: 3, share: 27 },
  ]);
  assert.deepEqual(topGenres([{ cancion: song("x"), veces: 3 }]), []);
  assert.deepEqual(topGenres([]), []);
});

test("played times are relative for today and dated otherwise", () => {
  const now = Date.parse("2026-11-21T20:00:00Z");
  assert.equal(playedAgo("2026-11-21T19:59:40Z", now), "Hace un momento");
  assert.equal(playedAgo("2026-11-21T19:55:00Z", now), "Hace 5 min");
  assert.equal(playedAgo("2026-11-21T17:00:00Z", now), "Hace 3 h");
  assert.match(
    playedAgo("2026-11-19T15:31:00Z", now, "America/Bogota"),
    /19.*nov.*10:31/,
  );
  assert.equal(playedAgo("nope", now), "Hora sin confirmar");
});

test("highlights guard is strict, bounded and treats missing genre as null", () => {
  assert.equal(isHighlights(data), true);
  assert.equal(isHighlights(empty), true);
  assert.equal(hasHighlights(empty), false);
  assert.equal(hasHighlights(data), true);
  for (const bad of [
    { ...data, periodoDias: 0 },
    { ...data, periodoDias: 366 },
    { ...data, masVotadas: [{ cancion: song("x"), votos: -1 }] },
    { ...data, masPedidas: [{ cancion: song("x"), votos: 1 }] },
    {
      ...data,
      masSonadas: Array.from({ length: 11 }, () => data.masSonadas[0]),
    },
    {
      ...data,
      ultimasSonadas: [{ cancion: song("x"), sonoAt: "ayer", enCurso: false }],
    },
    {
      ...data,
      ultimasSonadas: [
        {
          cancion: song("x"),
          sonoAt: data.ultimasSonadas[0].sonoAt,
          enCurso: "no",
        },
      ],
    },
    {
      ...data,
      masVotadas: [{ cancion: song("x", 5 as unknown as string), votos: 1 }],
    },
    null,
    [],
  ])
    assert.equal(isHighlights(bad), false, JSON.stringify(bad));
});

test("highlights request uses the public slug path with a validated period", async () => {
  const calls: string[] = [];
  const api = new DemoApi(async (url) => {
    calls.push(url);
    return Response.json(data);
  });
  assert.equal((await api.highlights("la-verbena", 90)).periodoDias, 30);
  assert.deepEqual(calls, [
    "/api/bff/api/public/establecimientos/la-verbena/destacadas?dias=90",
  ]);
  await assert.rejects(api.highlights("la-verbena", 0), /periodo/);
  await assert.rejects(api.highlights("Bad Slug", 30));
  assert.equal(calls.length, 1, "invalid input never reaches the transport");
  const broken = new DemoApi(async () =>
    Response.json({ ...data, periodoDias: "30" }),
  );
  await assert.rejects(
    broken.highlights("la-verbena", 30),
    /respuesta no válida/,
  );
});

test("highlights errors become friendly owner messages", async () => {
  for (const [status, code, expected] of [
    [400, "INVALID_PERIOD", "Elige un periodo de 7, 30 o 90 días."],
    [
      404,
      "ESTABLISHMENT_NOT_FOUND",
      "No encontramos los datos de tu local. Actualiza el estado.",
    ],
    [
      404,
      "NOT_FOUND",
      "No encontramos los datos de tu local. Actualiza el estado.",
    ],
    [
      429,
      "RATE_LIMITED",
      "Demasiadas acciones seguidas. Espera un momento y vuelve a intentarlo.",
    ],
  ] as const) {
    const api = new DemoApi(async () => Response.json({ code }, { status }));
    const error = await api.highlights("la-verbena", 30).catch((e) => e);
    assert.equal(ownerError(error), expected);
  }
});

const app = "http://localhost:3000";
function harness() {
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
      return "synthetic-access";
    },
    transport: (async (url: string) => {
      calls.push(String(url));
      return Response.json({ ok: true });
    }) as unknown as typeof fetch,
  };
}
const get = (path: string, method = "GET") =>
  new Request(`${app}/api/bff${path}`, { method, headers: { Origin: app } });

test("BFF allows highlights with an optional single 1..365 period only", async () => {
  const base = "/api/public/establecimientos/la-verbena/destacadas";
  for (const query of ["", "?dias=1", "?dias=30", "?dias=365"]) {
    const h = harness();
    assert.equal((await proxyRequest(get(base + query), h)).status, 200, query);
    assert.deepEqual(h.calls, [`http://localhost:8080${base}${query}`]);
  }
  const h = harness();
  for (const query of [
    "?dias=0",
    "?dias=366",
    "?dias=030",
    "?dias=7.5",
    "?dias=-1",
    "?dias=30&dias=7",
    "?dias=30&x=1",
    "?q=a",
  ]) {
    const response = await proxyRequest(get(base + query), h);
    assert.equal(response.status, 400, query);
    assert.deepEqual(await response.json(), { code: "INVALID_PERIOD" });
  }
  for (const path of [
    "/api/public/establecimientos/Bad/destacadas",
    "/api/public/establecimientos/la-verbena/destacadas/extra",
    "/api/public/establecimientos/la-verbena/cola?dias=30",
  ])
    assert.equal((await proxyRequest(get(path), h)).status, 404, path);
  assert.equal((await proxyRequest(get(base, "POST"), h)).status, 404);
  assert.equal(h.calls.length, 0);
  assert.equal(h.credentials, 0);
});

test("Analítica renders four ranked lists, text values and the genre summary", () => {
  const html = renderToStaticMarkup(
    createElement(HighlightsView, {
      data,
      timeZone: "America/Bogota",
      now: Date.parse("2026-11-21T20:00:00Z"),
    }),
  );
  for (const title of [
    "Más votadas",
    "Más pedidas",
    "Más sonadas",
    "Últimas 10 sonadas",
    "Géneros más pedidos",
  ])
    assert.ok(html.includes(`>${title}</h2>`), title);
  assert.equal((html.match(/role="list"/g) ?? []).length, 5);
  assert.match(html, />40 votos</);
  assert.match(html, />3 veces</);
  assert.match(html, /--share:25%/);
  assert.match(html, />8 veces \(73 %\)</);
  assert.match(html, /Sonando ahora/);
  assert.match(html, /Hace 5 min/);
  assert.match(html, /class="bar__track" aria-hidden="true"/);
  assert.match(html, /class="tag" title="Reguetón"/);
});

test("empty periods say so honestly and omit the genre summary", () => {
  const html = renderToStaticMarkup(
    createElement(HighlightsView, { data: empty, now: 0 }),
  );
  assert.equal(html.split(NO_DATA).length - 1, 4);
  assert.equal(NO_DATA, "Aún no hay datos en este periodo");
  assert.doesNotMatch(html, /Géneros más pedidos|role="list"/);
});

test("Analítica prerenders skeletons and the period selector without requests", () => {
  let requests = 0;
  const api = new DemoApi(async () => {
    requests++;
    return Response.json(data);
  });
  const html = renderToStaticMarkup(
    createElement(Analytics, { api, qrSlug: "la-verbena" }),
  );
  assert.match(html, /aria-busy="true"/);
  assert.equal((html.match(/type="radio"/g) ?? []).length, 3);
  assert.match(html, /<input[^>]*checked=""[^>]*value="30"/);
  for (const label of ["7 días", "30 días", "90 días"])
    assert.ok(html.includes(label));
  assert.match(html, /class="skeleton"/);
  assert.equal(requests, 0);
});

test("the tab bar holds five entries including Analítica", () => {
  assert.equal(OWNER_VIEW_SHORT[OWNER_VIEWS.ANALYTICS], "Analítica");
  const html = renderToStaticMarkup(
    createElement(OwnerNavigation, {
      view: OWNER_VIEWS.ANALYTICS,
      onNavigate() {},
    }),
  );
  assert.equal((html.match(/<button/g) ?? []).length, 5);
  assert.match(html, /aria-label="Analítica" aria-current="page"/);
});

test("ranked songs show their YouTube thumbnail, else the generated cover", () => {
  const render = (miniaturaUrl: string | null) =>
    renderToStaticMarkup(
      createElement(HighlightsView, {
        now: 0,
        data: {
          periodoDias: 30,
          masVotadas: [{ cancion: { ...song("Uno"), miniaturaUrl }, votos: 2 }],
          masPedidas: [],
          masSonadas: [],
          ultimasSonadas: [],
        },
      }),
    );
  const url = "https://i.ytimg.com/vi/kRt2sRyup6A/mqdefault.jpg";
  assert.match(render(url), new RegExp(`<img[^>]+src="${url}"`));
  assert.doesNotMatch(render(null), /<img/);
  assert.doesNotMatch(render("https://evil.example/a.jpg"), /<img/);
});

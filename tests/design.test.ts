import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Cover } from "../src/components/cover";
import { ConfirmDialog } from "../src/components/owner/confirm-dialog";
import { EmptyState, ErrorCallout } from "../src/components/owner/feedback";
import { OwnerNavigation } from "../src/components/owner/navigation";
import { NightChip } from "../src/components/owner/night-chip";
import { OperationStatus } from "../src/components/owner/operation";
import {
  NowPlaying,
  playedShare,
  VoteCount,
} from "../src/components/owner/queue-panel";
import { ToastRegion } from "../src/components/owner/toast";
import { contrastRatio } from "../src/lib/contrast";
import { COVER_PALETTES, coverFor } from "../src/lib/cover";
import {
  approxDuration,
  drainSeconds,
  formatDuration,
  nightLabel,
  plural,
  songMeta,
  songsLabel,
  updatedLabel,
  votesLabel,
  waitLabel,
} from "../src/lib/format";
import {
  OWNER_VIEW_SHORT,
  OWNER_VIEWS,
  ownerError,
} from "../src/lib/owner-copy";
import {
  readTheme,
  resolveTheme,
  THEME_BOOT_SCRIPT,
  THEME_KEY,
  writeTheme,
} from "../src/lib/theme";
import { TIME_ZONES, timeZoneOptions } from "../src/lib/time-zones";

test("responsive navigation retains accessible names independently of hidden labels", () => {
  for (const view of Object.values(OWNER_VIEWS)) {
    const html = renderToStaticMarkup(
      createElement(OwnerNavigation, {
        view,
        onNavigate() {
          assert.fail("Prerender must not navigate");
        },
      }),
    );
    const buttons = [...html.matchAll(/<button\b[^>]*>/g)].map(([tag]) => tag);
    assert.equal(buttons.length, Object.values(OWNER_VIEWS).length);
    for (const [index, name] of Object.values(OWNER_VIEWS).entries()) {
      const label = buttons[index].match(/\baria-label="([^"]*)"/)?.[1] ?? "";
      assert.ok(label.includes(name), `Missing full view name: ${name}`);
      assert.ok(
        label.includes(OWNER_VIEW_SHORT[name]),
        `Missing visible mobile label: ${OWNER_VIEW_SHORT[name]}`,
      );
      assert.equal(
        buttons[index].includes('aria-current="page"'),
        name === view,
      );
      assert.equal(buttons[index].includes('type="button"'), true);
    }
    assert.match(html, /class="nav-item__short" aria-hidden="true"/);
  }
});

test("votes and counts pluralize in Spanish", () => {
  assert.equal(votesLabel(0), "0 votos");
  assert.equal(votesLabel(1), "1 voto");
  assert.equal(votesLabel(3), "3 votos");
  assert.equal(songsLabel(1), "1 canción");
  assert.equal(songsLabel(24), "24 canciones");
  assert.equal(plural(1, "pendiente"), "1 pendiente");
});

test("durations use m:ss everywhere and unknown durations stay explicit", () => {
  assert.equal(formatDuration(214), "3:34");
  assert.equal(formatDuration(5), "0:05");
  assert.equal(formatDuration(3600 + 125), "1:02:05");
  assert.equal(formatDuration(null), null);
  assert.equal(songMeta("Estudio Norte", 214), "Estudio Norte · 3:34");
  assert.equal(songMeta("Estudio Norte", null), "Estudio Norte");
});

test("waits and freshness read as plain owner copy", () => {
  assert.equal(waitLabel(0), "Sin espera");
  assert.equal(waitLabel(330), "Espera ~ 6 min");
  assert.equal(waitLabel(null), "Espera por calcular");
  assert.equal(updatedLabel(1000), "Actualizado ahora");
  assert.equal(updatedLabel(12_000), "Actualizado hace 12 s");
  assert.equal(updatedLabel(125_000), "Actualizado hace 2 min");
  assert.equal(nightLabel("2026-11-13"), "Noche del viernes 13 de noviembre");
});

test("vote count is a non-interactive display with a spoken label", () => {
  const html = renderToStaticMarkup(createElement(VoteCount, { votes: 1 }));
  assert.match(html, /1 voto</);
  assert.doesNotMatch(html, /<button|votes--pulse/);
});

test("close-night dialog is a labelled native dialog naming the consequence", () => {
  const html = renderToStaticMarkup(
    createElement(
      ConfirmDialog,
      {
        open: false,
        title: "¿Cerrar la noche?",
        confirmLabel: "Cerrar la noche",
        cancelLabel: "Seguir con la noche",
        onConfirm() {},
        onCancel() {},
      },
      "Los celulares conectados perderán el acceso. El historial de la noche se conserva.",
    ),
  );
  assert.match(html, /^<dialog/);
  assert.match(html, /aria-labelledby="[^"]+"/);
  assert.match(html, /aria-describedby="[^"]+"/);
  assert.match(html, /perderán el acceso/);
  assert.match(html, /btn--danger[^>]*>Cerrar la noche</);
  // Only the safe choice carries autofocus (showModal focuses it).
  assert.match(
    html,
    /<button[^>]*autofocus=""[^>]*>Seguir con la noche<\/button>/,
  );
  assert.equal((html.match(/autofocus=""/g) ?? []).length, 1);
});

test("toasts live in one polite status region and are dismissible", () => {
  const html = renderToStaticMarkup(
    createElement(ToastRegion, {
      toasts: [{ id: 1, text: "Lista guardada" }],
      onDismiss() {},
    }),
  );
  assert.match(html, /^<output[^>]*aria-live="polite"/);
  assert.match(html, /Lista guardada/);
  assert.match(html, /aria-label="Cerrar aviso: Lista guardada"/);
  assert.equal((html.match(/aria-live/g) ?? []).length, 1);
});

test("errors render as alert cards with owner-safe text only", () => {
  const html = renderToStaticMarkup(
    createElement(ErrorCallout, {
      error: "La API rechazó la operación (HTTP 500).",
    }),
  );
  assert.match(html, /role="alert"/);
  assert.doesNotMatch(html, /API|HTTP|500/);
  // A busy state is quiet text, not a second live region.
  const busy = renderToStaticMarkup(
    createElement(OperationStatus, { busy: true, error: "", notice: "" }),
  );
  assert.doesNotMatch(busy, /aria-live|role="status"/);
});

test("owner error mapping removes jargon and is idempotent", () => {
  for (const raw of [
    "La zona horaria IANA no es válida.",
    "Ya hay una reproducción de servidor en curso. Actualiza el estado.",
    "El establecimiento está en mantenimiento.",
    "La cola y la lista predeterminada no tienen canciones disponibles.",
    "No se pudo conectar con la API. Revisa la red.",
  ]) {
    const once = ownerError(raw);
    assert.doesNotMatch(once, /IANA|servidor|API|establecimiento/);
    assert.equal(ownerError(once), once);
  }
});

test("theme preference persists, clears and survives broken storage", () => {
  const data = new Map<string, string>();
  const storage = {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
  };
  assert.equal(readTheme(storage), null);
  assert.equal(writeTheme(storage, "light"), true);
  assert.equal(data.get(THEME_KEY), "light");
  assert.equal(readTheme(storage), "light");
  writeTheme(storage, null);
  assert.equal(readTheme(storage), null);
  data.set(THEME_KEY, "neon");
  assert.equal(readTheme(storage), null);
  const broken = {
    getItem() {
      throw Error("blocked");
    },
    setItem() {
      throw Error("blocked");
    },
    removeItem() {
      throw Error("blocked");
    },
  };
  assert.equal(readTheme(broken), null);
  assert.equal(writeTheme(broken, "dark"), false);
  assert.equal(resolveTheme(null, true), "light");
  assert.equal(resolveTheme(null, false), "dark");
  assert.equal(resolveTheme("dark", true), "dark");
  assert.match(THEME_BOOT_SCRIPT, /try\{/);
  assert.ok(THEME_BOOT_SCRIPT.includes(THEME_KEY));
});

test("time zones list friendly names with Bogotá first", () => {
  assert.deepEqual(TIME_ZONES[0], {
    value: "America/Bogota",
    label: "Colombia (Bogotá)",
  });
  assert.ok(!TIME_ZONES.some((zone) => /IANA|_/.test(zone.label)));
  // Zones outside the list go through "Otra zona (IANA)" (tests/owner-ui).
  assert.equal(timeZoneOptions().length, TIME_ZONES.length + 1);
});

test("generated covers are deterministic and decorative", () => {
  assert.deepEqual(coverFor("Luna azul"), coverFor("Luna azul"));
  const seen = new Set(
    ["Luna azul", "Órbita", "Faro", "Aire de octubre", "Valle", "Norte"].map(
      (title) => JSON.stringify(coverFor(title)),
    ),
  );
  assert.ok(seen.size > 1);
  const html = renderToStaticMarkup(createElement(Cover, { title: "Faro" }));
  assert.match(html, /aria-hidden="true"/);
  assert.doesNotMatch(html, /<img|https?:\/\/(?!www\.w3\.org)/);
});

function tokens(css: string, selector: string) {
  const start = css.indexOf(`${selector} {`);
  assert.ok(start >= 0, selector);
  const block = css.slice(start, css.indexOf("}", start));
  return Object.fromEntries(
    [...block.matchAll(/--([a-z-]+):\s*(#[0-9a-f]{6})/gi)].map((m) => [
      m[1],
      m[2],
    ]),
  );
}

const css = readFileSync("src/app/globals.css", "utf8");
const dark = tokens(css, ":root");
const light = { ...dark, ...tokens(css, ':root[data-theme="light"]') };
// The stage (now playing) keeps the night tokens in both themes.
const stageDark = { ...dark, ...tokens(css, ".stage") };
const stageLight = { ...light, ...tokens(css, ".stage") };
const themes = [
  ["dark", dark],
  ["light", light],
  ["stage in dark", stageDark],
  ["stage in light", stageLight],
] as const;

test("token palette meets WCAG contrast in both themes and on the stage", () => {
  for (const [name, t] of themes) {
    for (const plane of ["bg", "surface", "raised"]) {
      for (const text of ["text", "muted", "accent-text", "live-text"])
        assert.ok(
          contrastRatio(t[text], t[plane]) >= 4.5,
          `${name} ${text}/${plane} ${contrastRatio(t[text], t[plane]).toFixed(2)}`,
        );
      for (const control of ["border", "focus", "accent-edge", "live"])
        assert.ok(
          contrastRatio(t[control], t[plane]) >= 3,
          `${name} ${control}/${plane} ${contrastRatio(t[control], t[plane]).toFixed(2)}`,
        );
    }
    for (const [fg, bg] of [
      ["accent-ink", "accent"],
      ["danger", "danger-tint"],
      ["success", "success-tint"],
      ["warn", "warn-tint"],
      ["danger", "surface"],
      ["tag-text", "tag"],
      ["live-text", "live-tint"],
      // Toasts invert the planes: background is --text, text is --bg.
      ["bg", "text"],
    ])
      assert.ok(
        contrastRatio(t[fg], t[bg]) >= 4.5,
        `${name} ${fg}/${bg} ${contrastRatio(t[fg], t[bg]).toFixed(2)}`,
      );
  }
});

test("palette Noche de verbena pins the decided tokens", () => {
  assert.deepEqual(
    [
      "bg",
      "surface",
      "raised",
      "hairline",
      "border",
      "text",
      "muted",
      "accent",
      "accent-ink",
      "live",
      "danger",
      "danger-tint",
      "success",
      "success-tint",
    ].map((key) => dark[key].toLowerCase()),
    [
      "#14101f",
      "#1e1830",
      "#2a2243",
      "#342b52",
      "#8a7fb0",
      "#f6f1ff",
      "#bdb4d6",
      "#ffb547",
      "#1b1530",
      "#3dd6c6",
      "#ff8f8f",
      "#3a1f2b",
      "#cff7ef",
      "#17332f",
    ],
  );
  assert.deepEqual(
    [
      "bg",
      "surface",
      "raised",
      "text",
      "muted",
      "accent",
      "accent-ink",
      "accent-text",
      "live",
      "border",
    ].map((key) => light[key].toLowerCase()),
    [
      "#f6f3fb",
      "#ffffff",
      "#ece6f6",
      "#1b1530",
      "#50476b",
      "#ffb547",
      "#1b1530",
      "#5b3fd0",
      "#0b7f73",
      "#7d7399",
    ],
  );
});

test("generated cover palettes are drawn from the token palette", () => {
  const palette = new Set(
    [dark, light, stageDark].flatMap((t) =>
      Object.values(t).map((value) => value.toLowerCase()),
    ),
  );
  for (const cover of COVER_PALETTES)
    for (const color of Object.values(cover))
      assert.ok(palette.has(color.toLowerCase()), color);
  assert.equal(new Set(COVER_PALETTES.map((p) => p.ground)).size, 6);
});

test("the top-bar chip names the night, never the account session", () => {
  const session = {
    id: "s",
    establecimientoId: "e",
    listaId: "l",
    fechaOperativa: "2026-11-21",
    abiertaAt: "2026-11-22T01:00:00Z",
    cerradaAt: null,
  };
  const chip = (value: Parameters<typeof NightChip>[0]["session"]) =>
    renderToStaticMarkup(createElement(NightChip, { session: value }));
  assert.match(
    chip(null),
    /chip--off[^>]*><span class="chip__text">Noche sin abrir</,
  );
  assert.match(
    chip({ ...session, estado: "ABIERTA" }),
    /chip--live[^>]*><span class="chip__text">Noche abierta</,
  );
  assert.match(
    chip({ ...session, estado: "PAUSADA" }),
    /chip--paused[^>]*><span class="chip__text">Noche en pausa</,
  );
  for (const html of [chip(null), chip({ ...session, estado: "ABIERTA" })])
    assert.doesNotMatch(html, /[Ss]esi[oó]n/);
});

test("empty states carry an icon, explanation and their next action", () => {
  const html = renderToStaticMarkup(
    createElement(
      EmptyState,
      {
        title: "Todavía no hay solicitudes",
        icon: createElement("svg"),
        action: createElement("button", { type: "button" }, "Ver el QR"),
      },
      "Cuando alguien pida una canción, aparecerá aquí.",
    ),
  );
  assert.match(html, /class="empty"/);
  assert.match(html, /class="empty__icon" aria-hidden="true"/);
  assert.match(html, /<button type="button">Ver el QR<\/button>/);
  const plain = renderToStaticMarkup(
    createElement(EmptyState, { title: "Sin datos" }),
  );
  assert.match(plain, /empty--plain/);
});

test("queue estimates and playback progress stay honest", () => {
  const item = (wait: number, seconds: number | null) => ({
    esperaEstimadaSegundos: wait,
    cancion: { duracionSegundos: seconds },
  });
  assert.equal(drainSeconds([]), null);
  assert.equal(drainSeconds([item(0, 200), item(200, 240)]), 440);
  assert.equal(drainSeconds([item(300, null)]), 300);
  assert.equal(approxDuration(10), "~ 1 min");
  assert.equal(approxDuration(2400), "~ 40 min");
  assert.equal(approxDuration(3900), "~ 1 h 05 min");
  const playing = (seconds: number | null, left: number) => ({
    solicitudId: null,
    iniciadaAt: "2026-11-22T02:00:00Z",
    restanteSegundos: left,
    cancion: {
      videoId: "abcdefghijk",
      titulo: "Tema",
      artista: "Artista",
      artistaVerificado: false,
      duracionSegundos: seconds,
      miniaturaUrl: null,
    },
  });
  assert.equal(playedShare(playing(200, 50)), 0.75);
  assert.equal(playedShare(playing(200, 500)), 0);
  assert.equal(playedShare(playing(null, 50)), null);
  const html = renderToStaticMarkup(
    createElement(NowPlaying, { playing: playing(200, 50) }),
  );
  assert.match(html, /--done:75%/);
  assert.match(html, /Quedan ~ 1 min/);
  assert.match(html, /class="eq eq--on"/);
});

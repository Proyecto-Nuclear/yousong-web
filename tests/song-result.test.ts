import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  SongResultRow,
  SongSuggestion,
} from "../src/components/owner/song-result";
import { AdminApi, isGenre, type Song } from "../src/lib/admin-api";
import { isQueueSong, isSong } from "../src/lib/demo-contracts";
import { safeThumbnailUrl } from "../src/lib/thumbnail";

const song: Song = {
  videoId: "kRt2sRyup6A",
  titulo: "Juanes - La Camisa Negra",
  artista: "Juanes",
  artistaVerificado: false,
  canal: "JuanesVEVO",
  duracionSegundos: 248,
  miniaturaUrl: "https://i.ytimg.com/vi/kRt2sRyup6A/mqdefault.jpg",
};
const row = (over: Partial<Song> = {}, added = false, full = false) =>
  renderToStaticMarkup(
    createElement(SongResultRow, {
      song: { ...song, ...over },
      added,
      full,
      onPick: () => {},
    }),
  );

test("thumbnails are loaded only from YouTube image hosts over HTTPS", () => {
  assert.equal(
    safeThumbnailUrl("https://i.ytimg.com/vi/a/mqdefault.jpg"),
    "https://i.ytimg.com/vi/a/mqdefault.jpg",
  );
  assert.ok(safeThumbnailUrl("https://i9.ytimg.com/vi/a/hq.jpg"));
  assert.ok(safeThumbnailUrl("https://img.youtube.com/vi/a/0.jpg"));
  for (const bad of [
    null,
    undefined,
    "",
    "not a url",
    "http://i.ytimg.com/vi/a/mqdefault.jpg",
    "https://evil.example/vi/a/mqdefault.jpg",
    "https://i.ytimg.com.evil.example/a.jpg",
    "https://user:pass@i.ytimg.com/a.jpg",
    "https://i.ytimg.com:8443/a.jpg",
    "javascript:alert(1)",
    "data:image/svg+xml,<svg onload=alert(1)>",
  ])
    assert.equal(safeThumbnailUrl(bad), null, String(bad));
});

test("a result shows the real thumbnail with its duration badge, never leaking the referrer", () => {
  const html = row();
  assert.match(
    html,
    /<img[^>]+src="https:\/\/i\.ytimg\.com\/vi\/kRt2sRyup6A\/mqdefault\.jpg"/,
  );
  assert.match(
    html,
    /referrerPolicy="no-referrer"|referrerpolicy="no-referrer"/,
  );
  assert.match(html, /loading="lazy"/);
  assert.match(html, /class="song-thumb__time">4:08</);
  assert.match(html, />Juanes - La Camisa Negra</);
  assert.match(html, /Canal: JuanesVEVO/);
});

test("a result without a safe thumbnail falls back to the generated cover and keeps the duration", () => {
  for (const miniaturaUrl of [null, "https://evil.example/x.jpg"]) {
    const html = row({ miniaturaUrl });
    assert.doesNotMatch(html, /<img/);
    assert.match(html, /song-thumb--fallback/);
    assert.match(html, /<svg/);
    assert.match(html, /class="song-thumb__time">4:08</);
  }
});

test("a result without duration says so instead of showing a badge", () => {
  const html = row({ duracionSegundos: null });
  assert.doesNotMatch(html, /song-thumb__time/);
  assert.match(html, /Duración no disponible/);
});

test("long titles keep their full text for assistive tech and tooltips, clamped by CSS", () => {
  const titulo = "Ñandú".repeat(60);
  const html = row({ titulo });
  assert.match(html, new RegExp(`title="${titulo}"`));
  assert.match(html, /class="song-row__title"/);
});

test("the add button reflects whether the song is already in the list or the list is full", () => {
  assert.match(
    row(),
    /aria-label="Añadir Juanes - La Camisa Negra a la lista"/,
  );
  assert.doesNotMatch(row(), /disabled/);
  assert.match(row({}, true), /ya está en tu lista/);
  assert.match(row({}, true), /disabled/);
  assert.match(row({}, false, true), /disabled/);
});

const suggestion = (added = false, full = false, over: Partial<Song> = {}) =>
  renderToStaticMarkup(
    createElement(SongSuggestion, {
      song: { ...song, ...over },
      added,
      full,
      onPick: () => {},
    }),
  );

test("a song suggestion shows a compact thumbnail, one line of text and the add action", () => {
  const html = suggestion();
  assert.match(html, /song-thumb--compact/);
  assert.match(html, /<img[^>]+src="https:\/\/i\.ytimg\.com\//);
  assert.match(html, /class="song-thumb__time">4:08</);
  assert.match(html, /<strong title="Juanes - La Camisa Negra">/);
  assert.match(html, /aria-label="Añadir Juanes - La Camisa Negra a la lista"/);
  assert.match(html, />Añadir</);
  assert.doesNotMatch(html, /disabled/);
});

test("a suggestion for a song already in the draft, or a full draft, cannot be added again", () => {
  assert.match(suggestion(true), /ya está en tu lista/);
  assert.match(suggestion(true), /disabled/);
  assert.match(suggestion(true), />Añadida</);
  assert.match(suggestion(false, true), /disabled/);
});

test("the stack layout never grows past its container because of long unbroken content", () => {
  const css = readFileSync(resolve("src/app/globals.css"), "utf8");
  const stack = /\.stack \{([^}]*)\}/.exec(css)?.[1] ?? "";
  assert.match(stack, /grid-template-columns:\s*minmax\(0,\s*1fr\)/);
  const list = /\.suggestions \{([^}]*)\}/.exec(css)?.[1] ?? "";
  assert.match(list, /min-width:\s*0/);
  const text = /\.suggestion__text > \* \{([^}]*)\}/.exec(css)?.[1] ?? "";
  assert.match(text, /text-overflow:\s*ellipsis/);
  assert.match(text, /white-space:\s*nowrap/);
});

test("results and suggestions show the genre as a small tag, omitted when unknown", () => {
  const tagged = row({ genero: "Pop latino" });
  assert.match(
    tagged,
    /<span class="tag" title="Pop latino"><span class="sr-only">Género: <\/span>Pop latino<\/span>/,
  );
  for (const genero of [null, undefined, "   "]) {
    const html = row({ genero });
    assert.doesNotMatch(html, /class="tag"|Género/, String(genero));
    // Artist and duration stay visible without a genre.
    assert.match(html, />Juanes</);
    assert.match(html, /class="song-thumb__time">4:08</);
  }
  const suggested = suggestion(false, false, { genero: "Reguetón" });
  assert.match(suggested, /class="tag" title="Reguetón"/);
  assert.match(suggested, /class="meta__time">4:08</);
  assert.match(suggested, /<span>Juanes<\/span>/);
  assert.doesNotMatch(suggestion(), /class="tag"/);
});

test("verified artists are marked without joining meta text with middle dots", () => {
  const html = row({ artistaVerificado: true });
  assert.match(html, /Artista verificado/);
  assert.doesNotMatch(html, / · /);
});

test("song guards accept a missing or null genre and reject malformed ones", () => {
  const base = { ...song } as Record<string, unknown>;
  delete base.genero;
  assert.equal(isSong(base), true, "missing genre is accepted as null");
  assert.equal(isSong({ ...song, genero: null }), true);
  assert.equal(isSong({ ...song, genero: "Salsa" }), true);
  assert.equal(
    isQueueSong({ ...song, canal: undefined, genero: "Cumbia" }),
    true,
  );
  for (const genero of [42, true, {}, "x".repeat(81)])
    assert.equal(isSong({ ...song, genero }), false, String(genero));
  assert.equal(isGenre(undefined), true);
});

test("catalog search accepts results with and without genre and rejects malformed genre", async () => {
  const page = (resultados: unknown[]) =>
    new AdminApi(async () =>
      Response.json({ resultados, siguientePagina: null }),
    ).search("juanes");
  const { genero: _omit, ...legacy } = { ...song, genero: null };
  const value = await page([legacy, { ...song, genero: "Pop latino" }]);
  assert.equal(value.resultados[0].genero ?? null, null);
  assert.equal(value.resultados[1].genero, "Pop latino");
  await assert.rejects(page([{ ...song, genero: 7 }]), /respuesta no válida/);
});

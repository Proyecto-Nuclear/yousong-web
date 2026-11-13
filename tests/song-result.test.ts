import { strict as assert } from "node:assert";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SongResultRow } from "../src/components/owner/song-result";
import type { Song } from "../src/lib/admin-api";
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

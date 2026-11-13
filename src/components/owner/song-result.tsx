"use client";

import { useState } from "react";
import type { Song } from "../../lib/admin-api";
import { formatDuration } from "../../lib/format";
import { safeThumbnailUrl } from "../../lib/thumbnail";
import { Cover } from "../cover";
import { CheckIcon } from "../icons";

/** 16:9 thumbnail like a YouTube result, with the duration on its corner; falls back to the generated cover. */
export function SongThumbnail({
  url,
  title,
  seconds,
  compact = false,
}: {
  url: string | null;
  title: string;
  seconds: number | null;
  compact?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const src = failed ? null : safeThumbnailUrl(url);
  const duration = formatDuration(seconds);
  return (
    <div
      className={[
        "song-thumb",
        src ? "" : "song-thumb--fallback",
        compact ? "song-thumb--compact" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {src ? (
        // biome-ignore lint/performance/noImgElement: remote YouTube thumbnails are validated and must not go through the image optimizer
        <img
          className="song-thumb__img"
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      ) : (
        <Cover title={title} size={56} />
      )}
      {duration && <span className="song-thumb__time">{duration}</span>}
    </div>
  );
}

/** One search result: thumbnail, two-line title, channel and the add action. Long text never leaves the row. */
export function SongResultRow({
  song,
  added,
  full,
  onPick,
}: {
  song: Song;
  added: boolean;
  full: boolean;
  onPick?: (song: Song) => void;
}) {
  const showChannel = song.canal && song.canal !== song.artista;
  return (
    <li className="song-row song-row--result">
      <SongThumbnail
        url={song.miniaturaUrl}
        title={song.titulo}
        seconds={song.duracionSegundos}
      />
      <div className="song-result__text">
        <p className="song-row__title" title={song.titulo}>
          {song.titulo}
        </p>
        <p className="song-row__meta">
          {song.artista}
          {song.artistaVerificado ? " · Artista verificado" : ""}
        </p>
        {showChannel && (
          <p className="song-row__meta song-row__meta--soft">
            Canal: {song.canal}
          </p>
        )}
        {formatDuration(song.duracionSegundos) === null && (
          <p className="song-row__meta song-row__meta--soft">
            Duración no disponible
          </p>
        )}
      </div>
      {onPick && (
        <button
          type="button"
          className="btn btn--small song-result__action"
          disabled={added || full}
          aria-label={
            added
              ? `${song.titulo} ya está en tu lista`
              : `Añadir ${song.titulo} a la lista`
          }
          onClick={() => onPick(song)}
        >
          {added ? <CheckIcon size={18} /> : null}
          {added ? "Añadida" : "Añadir"}
        </button>
      )}
    </li>
  );
}

/** A song suggestion: tapping it adds the song to the draft. One line of text, clipped with an ellipsis. */
export function SongSuggestion({
  song,
  added,
  full,
  onPick,
}: {
  song: Song;
  added: boolean;
  full: boolean;
  onPick: (song: Song) => void;
}) {
  return (
    <button
      type="button"
      className="suggestion suggestion--song"
      disabled={added || full}
      aria-label={
        added
          ? `${song.titulo} ya está en tu lista`
          : `Añadir ${song.titulo} a la lista`
      }
      onClick={() => onPick(song)}
    >
      <SongThumbnail
        url={song.miniaturaUrl}
        title={song.titulo}
        seconds={song.duracionSegundos}
        compact
      />
      <span className="suggestion__text">
        <strong title={song.titulo}>{song.titulo}</strong>
        <span className="suggestion__sub">{song.artista}</span>
      </span>
      <span className="suggestion__action" aria-hidden="true">
        {added ? <CheckIcon size={16} /> : null}
        {added ? "Añadida" : "Añadir"}
      </span>
    </button>
  );
}

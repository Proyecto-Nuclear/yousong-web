"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { SearchPage, Song } from "../../lib/admin-api";
import type { DemoApi } from "../../lib/demo-api";
import { SUGGESTION, type Suggestions } from "../../lib/demo-contracts";
import { formatDuration, songMeta } from "../../lib/format";
import { ownerError } from "../../lib/owner-copy";
import { Cover } from "../cover";
import { CheckIcon, SearchIcon } from "../icons";
import { ErrorCallout, Loading } from "./feedback";
import { useOwnerOperation } from "./operation";

export function CatalogPicker({
  api,
  onPick,
  selected = [],
}: {
  api: DemoApi;
  onPick?: (song: Song) => void;
  selected?: string[];
}) {
  const [query, setQuery] = useState("");
  const [searched, setSearched] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestions | null>(null);
  const [suggestionError, setSuggestionError] = useState("");
  const [page, setPage] = useState<SearchPage | null>(null);
  const op = useOwnerOperation();
  const revision = useRef(0);
  const hintId = useId();
  useEffect(() => {
    let cancelled = false;
    const version = revision.current;
    const normalized = query.trim().replace(/\s+/g, " ");
    const timer = setTimeout(() => {
      if (normalized.length < 2 || normalized.length > 100) return;
      void api
        .suggestions(normalized)
        .then((value) => {
          if (!cancelled && version === revision.current) {
            setSuggestions(value);
            setSuggestionError("");
          }
        })
        .catch((error) => {
          if (!cancelled && version === revision.current) {
            setSuggestions(null);
            setSuggestionError(ownerError(error));
          }
        });
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [api, query]);
  function changeQuery(value: string) {
    revision.current++;
    setQuery(value);
    setSuggestions(null);
    setSuggestionError("");
  }
  function search(next?: string) {
    void op.run(async (commit) => {
      const text = next ? searched : query;
      const result = await api.search(text, next);
      commit(() => {
        setPage(result);
        setSearched(text);
      });
    });
  }
  const full = selected.length >= 200;
  return (
    <div className="stack" aria-busy={op.busy}>
      <h3 className="card__subtitle">Añadir canciones</h3>
      <form
        className="field-row"
        onSubmit={(event) => {
          event.preventDefault();
          search();
        }}
      >
        <label className="field">
          <span className="field__label">Buscar por título o artista</span>
          <input
            className="input"
            type="search"
            value={query}
            minLength={2}
            maxLength={100}
            required
            disabled={op.busy}
            aria-describedby={hintId}
            onChange={(event) => changeQuery(event.target.value)}
          />
        </label>
        <button type="submit" className="btn" disabled={op.busy}>
          <SearchIcon size={20} />
          Buscar
        </button>
        <p id={hintId} className="field__hint">
          Escribe al menos 2 letras. Añadir una canción solo cambia tu borrador.
        </p>
      </form>
      {suggestionError && <ErrorCallout error={suggestionError} />}
      {suggestions && suggestions.sugerencias.length > 0 && (
        <ul className="suggestions" aria-label="Sugerencias">
          {suggestions.sugerencias.map((item) => (
            <li key={`${item.tipo}:${item.texto}`}>
              {item.tipo === SUGGESTION.SONG && onPick ? (
                <button
                  type="button"
                  className="suggestion"
                  disabled={selected.includes(item.cancion.videoId) || full}
                  onClick={() => onPick(item.cancion)}
                >
                  Añadir {item.texto}
                </button>
              ) : (
                <button
                  type="button"
                  className="suggestion"
                  onClick={() => changeQuery(item.texto)}
                >
                  {item.texto}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {op.busy && <Loading label="Buscando…" />}
      {op.error && <ErrorCallout error={op.error} />}
      {page && (
        <>
          <p className="status-line">
            {page.resultados.length
              ? `Resultados para «${searched}»`
              : `No encontramos canciones para «${searched}». Prueba con otro título o artista.`}
          </p>
          <ul className="song-list" aria-label="Resultados de la búsqueda">
            {page.resultados.map((song) => {
              const added = selected.includes(song.videoId);
              return (
                <li key={song.videoId} className="song-row">
                  <Cover title={song.titulo} size={40} />
                  <div>
                    <p className="song-row__title">{song.titulo}</p>
                    <p className="song-row__meta">
                      {formatDuration(song.duracionSegundos) === null
                        ? `${song.artista} · Duración no disponible`
                        : songMeta(song.artista, song.duracionSegundos)}
                      {song.artistaVerificado ? " · Artista verificado" : ""}
                      {song.canal && song.canal !== song.artista
                        ? ` · Canal: ${song.canal}`
                        : ""}
                    </p>
                  </div>
                  {onPick && (
                    <button
                      type="button"
                      className="btn btn--small"
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
            })}
          </ul>
          {page.siguientePagina && (
            <button
              type="button"
              className="btn"
              disabled={op.busy}
              onClick={() => search(page.siguientePagina ?? undefined)}
            >
              Ver más resultados
            </button>
          )}
        </>
      )}
    </div>
  );
}

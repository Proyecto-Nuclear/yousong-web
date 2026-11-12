"use client";

import { useEffect, useRef, useState } from "react";
import type { SearchPage, Song } from "@/lib/admin-api";
import type { DemoApi } from "@/lib/demo-api";
import { SUGGESTION, type Suggestions } from "@/lib/demo-contracts";
import { OperationStatus, useDemoOperation } from "./operation";

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
  const op = useDemoOperation();
  const revision = useRef(0);
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
            setSuggestionError(
              error instanceof Error
                ? error.message
                : "Sugerencias no disponibles.",
            );
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
  return (
    <div className="demo-catalog">
      <h3>Seleccionar canciones del catálogo</h3>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          search();
        }}
      >
        <label>
          Buscar título o artista (2–100 caracteres)
          <input
            value={query}
            minLength={2}
            maxLength={100}
            required
            disabled={op.busy}
            onChange={(event) => changeQuery(event.target.value)}
          />
        </label>
        <button type="submit" disabled={op.busy}>
          Buscar en catálogo
        </button>
      </form>
      {suggestionError && <p role="alert">{suggestionError}</p>}
      {suggestions && (
        <ul aria-label="Sugerencias">
          {suggestions.sugerencias.map((item) => (
            <li key={`${item.tipo}:${item.texto}`}>
              {item.tipo === SUGGESTION.SONG && onPick ? (
                <button
                  type="button"
                  disabled={
                    selected.includes(item.cancion.videoId) ||
                    selected.length >= 200
                  }
                  onClick={() => onPick(item.cancion)}
                >
                  Añadir {item.texto}
                </button>
              ) : (
                <button type="button" onClick={() => changeQuery(item.texto)}>
                  {item.texto}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <OperationStatus {...op} />
      {page && (
        <>
          <output>
            {page.resultados.length
              ? `Resultados para «${searched}»`
              : "No se encontraron canciones."}
          </output>
          <ul className="songs">
            {page.resultados.map((song) => (
              <li key={song.videoId}>
                <div>
                  <h3>{song.titulo}</h3>
                  <p>
                    {song.artista}
                    {song.artistaVerificado ? " · Artista verificado" : ""} ·
                    Canal: {song.canal}
                  </p>
                  <p>
                    {song.duracionSegundos === null
                      ? "Duración no disponible"
                      : `${song.duracionSegundos} s`}
                  </p>
                  {onPick && (
                    <button
                      type="button"
                      disabled={
                        selected.includes(song.videoId) ||
                        selected.length >= 200
                      }
                      onClick={() => onPick(song)}
                    >
                      {selected.includes(song.videoId)
                        ? "En el borrador"
                        : "Añadir al borrador"}
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
          {page.siguientePagina && (
            <button
              type="button"
              disabled={op.busy}
              onClick={() => search(page.siguientePagina ?? undefined)}
            >
              Siguiente página
            </button>
          )}
        </>
      )}
    </div>
  );
}

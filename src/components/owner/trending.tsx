"use client";

import { useEffect, useRef, useState } from "react";
import { ApiError, type Song } from "../../lib/admin-api";
import { playedAgo } from "../../lib/analytics";
import type { DemoApi } from "../../lib/demo-api";
import type { Trends } from "../../lib/demo-contracts";
import { TRENDS_UNAVAILABLE } from "../../lib/owner-copy";
import { TrendIcon } from "../icons";
import { EmptyState, ErrorCallout, SkeletonRows } from "./feedback";
import { SongResultRow } from "./song-result";

const VISIBLE = 8;

/** "Actualizado hace 2 h" from the backend's cache timestamp. */
export function trendsUpdated(iso: string, now: number) {
  const when = playedAgo(iso, now);
  return `Actualizado ${when.charAt(0).toLowerCase()}${when.slice(1)}`;
}

type State =
  | { kind: "idle" | "loading" | "unavailable" }
  | { kind: "error"; error: string }
  | { kind: "ready"; value: Trends; at: number };

/**
 * "Tendencias en Colombia": trending songs that add to the draft exactly like
 * search results. Loads once when the list workspace is first shown; a
 * failure never blocks the rest of the page (503 is a quiet line).
 */
export function TrendingSongs({
  api,
  active,
  selected,
  onPick,
}: {
  api: DemoApi;
  active: boolean;
  selected: string[];
  onPick?: (song: Song) => void;
}) {
  const [state, setState] = useState<State>({ kind: "idle" });
  const [attempt, setAttempt] = useState(0);
  const [all, setAll] = useState(false);
  // Attempt already requested: entering the view again does not refetch.
  const fetched = useRef(-1);
  useEffect(() => {
    if (!active || fetched.current === attempt) return;
    fetched.current = attempt;
    let current = true;
    setState({ kind: "loading" });
    api
      .trends()
      .then((value) => {
        if (current) setState({ kind: "ready", value, at: Date.now() });
      })
      .catch((reason) => {
        if (!current) return;
        if (reason instanceof ApiError && reason.status === 503)
          setState({ kind: "unavailable" });
        else
          setState({
            kind: "error",
            error: reason instanceof Error ? reason.message : "Sin detalle",
          });
      });
    return () => {
      current = false;
      // A cancelled read (unmount, scope change) may run again later.
      fetched.current = -1;
    };
  }, [api, active, attempt]);
  const full = selected.length >= 200;
  const songs = state.kind === "ready" ? state.value.canciones : [];
  const shown = all ? songs : songs.slice(0, VISIBLE);
  return (
    <section
      className="subsection"
      aria-labelledby="trends-title"
      aria-busy={state.kind === "loading"}
    >
      <div className="subsection__head">
        <h3 id="trends-title" className="card__subtitle trends__title">
          <TrendIcon size={20} />
          Tendencias en Colombia
        </h3>
        {state.kind === "ready" && (
          <p className="status-line">
            {trendsUpdated(state.value.actualizadoAt, state.at)}
          </p>
        )}
      </div>
      <p className="field__hint">
        Lo más escuchado en YouTube en Colombia. Añadir una canción solo cambia
        tu borrador.
      </p>
      {state.kind === "loading" || state.kind === "idle" ? (
        <>
          <p className="sr-only">Cargando…</p>
          <SkeletonRows count={3} />
        </>
      ) : state.kind === "unavailable" ? (
        <p className="status-line">{TRENDS_UNAVAILABLE}</p>
      ) : state.kind === "error" ? (
        <ErrorCallout
          error={state.error}
          action={
            <button
              type="button"
              className="btn btn--small"
              onClick={() => setAttempt((value) => value + 1)}
            >
              Reintentar
            </button>
          }
        />
      ) : songs.length ? (
        <>
          <ul className="song-list" aria-label="Tendencias en Colombia">
            {shown.map((song) => (
              <SongResultRow
                key={song.videoId}
                song={song}
                added={selected.includes(song.videoId)}
                full={full}
                onPick={onPick}
              />
            ))}
          </ul>
          {songs.length > VISIBLE && (
            <button
              type="button"
              className="btn btn--small"
              aria-expanded={all}
              onClick={() => setAll((value) => !value)}
            >
              {all ? "Mostrar menos" : `Ver las ${songs.length} tendencias`}
            </button>
          )}
        </>
      ) : (
        <EmptyState title="No hay tendencias por ahora">
          Vuelve más tarde o busca canciones arriba.
        </EmptyState>
      )}
    </section>
  );
}

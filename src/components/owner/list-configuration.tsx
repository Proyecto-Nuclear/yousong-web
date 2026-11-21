"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import type { DemoApi } from "../../lib/demo-api";
import { isRotation, ROTATION } from "../../lib/demo-contracts";
import { songMeta, songsLabel } from "../../lib/format";
import { ListDraft } from "../../lib/list-draft";
import { Cover } from "../cover";
import { CatalogPicker } from "./catalog-picker";
import { EmptyState, ErrorCallout, Loading, SkeletonRows } from "./feedback";
import { useNotify } from "./toast";

const ROTATION_LABEL = {
  [ROTATION.SEQUENTIAL]: "En orden",
  [ROTATION.RANDOM]: "Aleatorio",
} as const;

export function ListConfiguration({
  api,
  establishmentId,
  canManage,
  active = true,
  onAvailabilityChange,
}: {
  api: DemoApi;
  establishmentId: string;
  canManage: boolean;
  active?: boolean;
  onAvailabilityChange?: (available: boolean) => void;
}) {
  const [model] = useState(
    () => new ListDraft(api, establishmentId, canManage),
  );
  const state = useSyncExternalStore(
    model.subscribe,
    model.getSnapshot,
    model.getSnapshot,
  );
  const notify = useNotify();
  useEffect(() => () => model.dispose(), [model]);
  useEffect(() => {
    if (active) model.enter();
  }, [active, model]);
  useEffect(() => {
    if (state.loaded) onAvailabilityChange?.(state.current !== null);
  }, [state.loaded, state.current, onAvailabilityChange]);
  useEffect(() => {
    if (state.notice) notify?.(state.notice);
  }, [state.notice, notify]);
  return (
    <section
      className="card stack stack--loose"
      hidden={!active}
      aria-labelledby="list-title"
      aria-busy={state.busy}
    >
      <div className="card__head">
        <div>
          <h2 id="list-title" className="card__title">
            Lista predeterminada
          </h2>
          <p className="card__meta">
            Suena cuando nadie ha pedido canciones. Se usa al abrir la noche.
          </p>
        </div>
        <span className="chip">{songsLabel(state.songs.length)}</span>
      </div>
      {state.busy && <Loading />}
      {!notify && state.notice && !state.busy && (
        <output className="callout callout--success">{state.notice}</output>
      )}
      {state.error && (
        <ErrorCallout
          error={state.error}
          action={
            !state.uncertain && (
              <button
                type="button"
                className="btn btn--small"
                disabled={state.busy}
                onClick={() => void model.refresh()}
              >
                Reintentar carga
              </button>
            )
          }
        />
      )}
      {state.uncertain && (
        <div className="callout callout--warn" role="alert">
          <div className="callout__body">
            <p>Guardado sin confirmar. Tu borrador se conserva.</p>
            <button
              type="button"
              className="btn btn--small"
              disabled={state.busy}
              onClick={() => void model.refresh()}
            >
              Revisar guardado
            </button>
          </div>
        </div>
      )}
      {!state.loaded && !state.error && <SkeletonRows count={3} />}
      <div className="list-layout">
        <div className="list-layout__draft">
          {canManage && (
            <form
              className="form"
              onSubmit={(event) => {
                event.preventDefault();
                void model.publish();
              }}
            >
              <fieldset className="form" disabled={state.busy}>
                <legend className="sr-only">Tu lista</legend>
                <div className="field-row field-row--stack">
                  <label className="field">
                    <span className="field__label">Nombre de la lista</span>
                    <input
                      className="input"
                      value={state.name}
                      maxLength={100}
                      onChange={(event) =>
                        model.edit({ name: event.target.value })
                      }
                    />
                  </label>
                  <label className="field">
                    <span className="field__label">Orden de reproducción</span>
                    <select
                      className="select"
                      value={state.rotation}
                      onChange={(event) => {
                        if (isRotation(event.target.value))
                          model.edit({ rotation: event.target.value });
                      }}
                    >
                      <option value={ROTATION.SEQUENTIAL}>
                        {ROTATION_LABEL[ROTATION.SEQUENTIAL]}
                      </option>
                      <option value={ROTATION.RANDOM}>
                        {ROTATION_LABEL[ROTATION.RANDOM]}
                      </option>
                    </select>
                  </label>
                </div>
                {state.loaded && !state.songs.length ? (
                  <EmptyState title="Tu lista está vacía">
                    Busca canciones abajo y añádelas. Necesitas al menos una
                    para abrir la noche.
                  </EmptyState>
                ) : (
                  <ol className="song-list" aria-label="Canciones del borrador">
                    {state.songs.map((song, index) => (
                      <li key={song.videoId} className="song-row">
                        <Cover title={song.titulo} size={40} />
                        <div>
                          <p className="song-row__title">
                            <span className="sr-only">{index + 1}. </span>
                            {song.titulo}
                          </p>
                          <p className="song-row__meta">
                            {songMeta(song.artista, song.duracionSegundos)}
                          </p>
                        </div>
                        <button
                          type="button"
                          className="btn btn--ghost btn--small"
                          onClick={() => model.remove(song.videoId)}
                          aria-label={`Quitar ${song.titulo} de la lista`}
                        >
                          Quitar
                        </button>
                      </li>
                    ))}
                  </ol>
                )}
                <div className="form-actions">
                  <button
                    className="btn btn--primary"
                    type="submit"
                    disabled={state.uncertain || state.songs.length === 0}
                  >
                    Guardar lista
                  </button>
                </div>
              </fieldset>
            </form>
          )}
        </div>
        <div className="list-layout__add">
          <fieldset disabled={state.busy}>
            <CatalogPicker
              api={api}
              selected={state.songs.map((song) => song.videoId)}
              onPick={canManage ? (song) => model.pick(song) : undefined}
            />
          </fieldset>
        </div>
      </div>
      <details className="disclosure">
        <summary className="disclosure__summary">
          Ver lista guardada e historial
        </summary>
        <div className="disclosure__body">
          {state.current ? (
            <>
              <p className="card__subtitle">
                {state.current.nombre} · Versión {state.current.version} ·{" "}
                {ROTATION_LABEL[state.current.politicaRotacion]}
              </p>
              <ol className="song-list">
                {state.current.canciones.map((song) => (
                  <li key={song.cancionId} className="song-row">
                    <Cover
                      title={song.titulo ?? song.youtubeVideoId}
                      size={40}
                    />
                    <div>
                      <p className="song-row__title">
                        {song.titulo ?? song.youtubeVideoId}
                      </p>
                      <p className="song-row__meta">
                        {songMeta(
                          song.artista ?? "Artista sin información",
                          song.duracionSegundos,
                        )}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </>
          ) : (
            <p className="muted">Todavía no has guardado una lista.</p>
          )}
          {state.history.map((item) => (
            <p key={item.id} className="status-line">
              Versión {item.version} · {item.nombre} ·{" "}
              {songsLabel(item.totalCanciones)}
            </p>
          ))}
          {!state.history.length && (
            <p className="status-line">Sin versiones anteriores.</p>
          )}
          <div>
            <button
              type="button"
              className="btn btn--small"
              disabled={state.busy}
              onClick={() => void model.refresh()}
            >
              Volver a cargar la lista
            </button>
          </div>
        </div>
      </details>
    </section>
  );
}

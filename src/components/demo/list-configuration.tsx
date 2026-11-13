"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import type { DemoApi } from "../../lib/demo-api";
import { isRotation, ROTATION } from "../../lib/demo-contracts";
import { ListDraft } from "../../lib/list-draft";
import { CatalogPicker } from "./catalog-picker";

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
  useEffect(() => () => model.dispose(), [model]);
  useEffect(() => {
    if (active) model.enter();
  }, [active, model]);
  useEffect(() => {
    if (state.loaded) onAvailabilityChange?.(state.current !== null);
  }, [state.loaded, state.current, onAvailabilityChange]);
  return (
    <section className="card demo-form" hidden={!active}>
      <div className="heading">
        <h2>Lista predeterminada</h2>
        <span className="badge">
          {state.songs.length} canciones en el borrador
        </span>
      </div>
      <output aria-live="polite">
        {state.busy ? "Cargando…" : state.notice}
      </output>
      {state.error && (
        <p className="alert" role="alert">
          {state.error}
        </p>
      )}
      {!state.loaded && !state.error && <p>Cargando lista…</p>}
      {state.loaded && !state.current && (
        <p>Añade canciones para preparar tu primera lista.</p>
      )}
      {canManage && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void model.publish();
          }}
        >
          <fieldset disabled={state.busy}>
            <legend>Tu lista</legend>
            <label>
              Nombre de lista
              <input
                value={state.name}
                maxLength={100}
                onChange={(event) => model.edit({ name: event.target.value })}
              />
            </label>
            <label>
              Orden de reproducción
              <select
                value={state.rotation}
                onChange={(event) => {
                  if (isRotation(event.target.value))
                    model.edit({ rotation: event.target.value });
                }}
              >
                <option value={ROTATION.SEQUENTIAL}>En orden</option>
                <option value={ROTATION.RANDOM}>Aleatorio</option>
              </select>
            </label>
            <ol className="songs" aria-label="Canciones del borrador">
              {state.songs.map((song) => (
                <li key={song.videoId}>
                  <div>
                    <h3>{song.titulo}</h3>
                    <p>{song.artista}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => model.remove(song.videoId)}
                    aria-label={`Quitar ${song.titulo} del borrador`}
                  >
                    Quitar
                  </button>
                </li>
              ))}
            </ol>
            <button
              className="primary"
              type="submit"
              disabled={state.uncertain || state.songs.length === 0}
            >
              Guardar lista
            </button>
          </fieldset>
        </form>
      )}
      <details>
        <summary>Ver lista guardada e historial</summary>
        {state.current && (
          <>
            <h3>
              {state.current.nombre} · Versión {state.current.version}
            </h3>
            <ol>
              {state.current.canciones.map((song) => (
                <li key={song.cancionId}>
                  {song.titulo ?? song.youtubeVideoId} ·{" "}
                  {song.artista ?? "Artista sin información"}
                </li>
              ))}
            </ol>
          </>
        )}
        {state.history.map((item) => (
          <p key={item.id}>
            Versión {item.version} · {item.nombre} · {item.totalCanciones}{" "}
            canciones
          </p>
        ))}
        {!state.history.length && <p>Sin versiones anteriores.</p>}
        <button
          type="button"
          disabled={state.busy}
          onClick={() => void model.refresh()}
        >
          Revisar lista guardada
        </button>
      </details>
      {state.uncertain && (
        <p role="alert">
          Guardado sin confirmar. Tu borrador se conserva.{" "}
          <button
            type="button"
            disabled={state.busy}
            onClick={() => void model.refresh()}
          >
            Revisar guardado
          </button>
        </p>
      )}
      {state.error && !state.uncertain && (
        <button
          type="button"
          disabled={state.busy}
          onClick={() => void model.refresh()}
        >
          Reintentar carga
        </button>
      )}
      <fieldset disabled={state.busy}>
        <CatalogPicker
          api={api}
          selected={state.songs.map((song) => song.videoId)}
          onPick={canManage ? (song) => model.pick(song) : undefined}
        />
      </fieldset>
    </section>
  );
}

"use client";

import { useState } from "react";
import type { Song } from "@/lib/admin-api";
import type { DemoApi } from "@/lib/demo-api";
import {
  type DefaultList,
  isRotation,
  type ListSummary,
  ROTATION,
  type Rotation,
} from "@/lib/demo-contracts";
import { CatalogPicker } from "./catalog-picker";
import { OperationStatus, useDemoOperation } from "./operation";

export function ListConfiguration({
  api,
  establishmentId,
  isAdmin,
}: {
  api: DemoApi;
  establishmentId: string;
  isAdmin: boolean;
}) {
  const [current, setCurrent] = useState<DefaultList | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [history, setHistory] = useState<ListSummary[] | null>(null);
  const [draft, setDraft] = useState<Song[]>([]);
  const [name, setName] = useState("General");
  const [rotation, setRotation] = useState<Rotation>(ROTATION.SEQUENTIAL);
  const [uncertain, setUncertain] = useState(false);
  const op = useDemoOperation();
  async function refresh(commit: (update: () => void) => void) {
    const result = await api.currentList(establishmentId);
    commit(() => {
      setCurrent(result);
      setLoaded(true);
      setUncertain(false);
    });
    if (isAdmin) {
      const versions = await api.listHistory(establishmentId);
      commit(() => setHistory(versions));
    }
  }
  return (
    <section className="card demo-form">
      <h2>Lista predeterminada y versiones</h2>
      <button
        type="button"
        disabled={op.busy}
        onClick={() => void op.run(refresh)}
      >
        Consultar lista e historial
      </button>
      <OperationStatus {...op} />
      {!loaded ? (
        <p>Lista actual sin consultar.</p>
      ) : current ? (
        <>
          <h3>
            {current.nombre} · Versión {current.version}
          </h3>
          <p>
            Rotación: {current.politicaRotacion} · Publicada: {current.creadoAt}
          </p>
          <ol>
            {current.canciones.map((song) => (
              <li key={song.cancionId}>
                {song.posicion}. {song.titulo ?? song.youtubeVideoId} ·{" "}
                {song.artista ?? "Artista sin información"}
              </li>
            ))}
          </ol>
        </>
      ) : (
        <p>
          No hay lista predeterminada. Un administrador debe publicar una antes
          de abrir la sesión.
        </p>
      )}
      {history && (
        <>
          <h3>Historial publicado</h3>
          {history.length ? (
            <ol>
              {history.map((item) => (
                <li key={item.id}>
                  Versión {item.version} · {item.nombre} ·{" "}
                  {item.politicaRotacion} · {item.totalCanciones} canciones ·{" "}
                  {item.creadoAt}
                </li>
              ))}
            </ol>
          ) : (
            <p>No hay versiones publicadas.</p>
          )}
        </>
      )}
      <p>
        La lista es un requisito de apertura. No inicia audio ni alimenta
        automáticamente la cola del servidor.
      </p>
      {isAdmin ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void op.run(async (commit) => {
              if (uncertain) return;
              commit(() => setUncertain(true));
              const published = await api.publishList(establishmentId, {
                nombre: name,
                politicaRotacion: rotation,
                canciones: draft.map((song) => song.videoId),
              });
              commit(() => {
                setCurrent(published);
                setLoaded(true);
                op.setNotice(
                  `Publicación confirmada: versión ${published.version}. El borrador se conserva.`,
                );
              });
              await refresh(commit);
            });
          }}
        >
          <fieldset disabled={op.busy}>
            <legend>Publicar una nueva versión</legend>
            <label>
              Nombre de lista
              <input
                value={name}
                maxLength={100}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <label>
              Política de rotación
              <select
                value={rotation}
                onChange={(event) => {
                  if (isRotation(event.target.value))
                    setRotation(event.target.value);
                }}
              >
                {Object.values(ROTATION).map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>
            <p>
              Borrador: {draft.length}/200 canciones únicas. Solo se admiten
              canciones seleccionadas del catálogo.
            </p>
            <ol>
              {draft.map((song) => (
                <li key={song.videoId}>
                  {song.titulo} · {song.artista}{" "}
                  <button
                    type="button"
                    onClick={() =>
                      setDraft((previous) =>
                        previous.filter(
                          (item) => item.videoId !== song.videoId,
                        ),
                      )
                    }
                    aria-label={`Quitar ${song.titulo} del borrador`}
                  >
                    Quitar
                  </button>
                </li>
              ))}
            </ol>
            <button type="submit" disabled={uncertain || draft.length === 0}>
              Publicar nueva versión
            </button>
            {uncertain && (
              <p>
                Consulta lista e historial antes de publicar otra vez. El
                resultado puede ser incierto; el borrador no se borra.
              </p>
            )}
          </fieldset>
        </form>
      ) : (
        <p>Publicar listas y consultar el historial requiere ADMINISTRADOR.</p>
      )}
      <fieldset disabled={op.busy}>
        <CatalogPicker
          api={api}
          selected={draft.map((song) => song.videoId)}
          onPick={
            isAdmin
              ? (song) =>
                  setDraft((previous) =>
                    previous.length >= 200 ||
                    previous.some((item) => item.videoId === song.videoId)
                      ? previous
                      : [...previous, song],
                  )
              : undefined
          }
        />
      </fieldset>
    </section>
  );
}

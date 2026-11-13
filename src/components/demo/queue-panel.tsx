"use client";

import { useEffect, useEffectEvent, useState } from "react";
import type { Establishment, Session } from "../../lib/admin-api";
import type { DemoApi } from "../../lib/demo-api";
import {
  FINISH,
  type Finish,
  isFinish,
  type Queue,
  SERVICE,
} from "../../lib/demo-contracts";
import { refreshQueue, startQueueRefresh } from "../../lib/queue-refresh";
import { useDemoOperation } from "./operation";

export function QueueSongs({ snapshot }: { snapshot: Queue }) {
  return (
    <ol className="songs" aria-label="Canciones en cola">
      {snapshot.enReproduccion && (
        <li>
          <div>
            <h3>{snapshot.enReproduccion.cancion.titulo}</h3>
            <p>{snapshot.enReproduccion.cancion.artista}</p>
          </div>
          <span className="badge">En reproducción</span>
        </li>
      )}
      {snapshot.cola.map((item) => (
        <li key={item.solicitudId}>
          <div>
            <h3>{item.cancion.titulo}</h3>
            <p>{item.cancion.artista}</p>
          </div>
          <span className="muted">
            {item.votos} votos · {Math.ceil(item.esperaEstimadaSegundos / 60)}{" "}
            min aprox.
          </span>
        </li>
      ))}
    </ol>
  );
}

export function QueuePanel({
  api,
  establishment,
  session,
  showPlaybackControls = false,
}: {
  api: DemoApi;
  establishment: Establishment;
  session: Session | null;
  showPlaybackControls?: boolean;
}) {
  const [snapshot, setSnapshot] = useState<Queue | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [stale, setStale] = useState(false);
  const [result, setResult] = useState<Finish>(FINISH.COMPLETED);
  const op = useDemoOperation();
  async function refresh(commit: (update: () => void) => void) {
    await refreshQueue({
      read: () => api.queue(establishment.qrSlug),
      gate: op.gate,
      commit,
      accept(value) {
        setSnapshot(value);
        setConfirmed(true);
        setStale(false);
      },
      stale() {
        setConfirmed(false);
        setStale(true);
      },
    });
  }
  // The gate serializes reads and explicit writes. Restart only for a new
  // scope; the parent keys the component by owner/session/control flags.
  const readQueue = useEffectEvent(() => op.run(refresh));
  useEffect(() => startQueueRefresh(() => readQueue()), []);
  async function mutate(finish: boolean) {
    if (
      !showPlaybackControls ||
      !session ||
      !confirmed ||
      !establishment.activo ||
      establishment.pausado ||
      establishment.enMantenimiento
    )
      return;
    if (
      finish
        ? !snapshot?.enReproduccion
        : session.estado !== "ABIERTA" ||
          snapshot?.estado !== SERVICE.OPEN ||
          !!snapshot?.enReproduccion
    )
      return;
    await op.run(async (commit) => {
      commit(() => setConfirmed(false));
      try {
        const acknowledgment = finish
          ? await api.finish(session.id, result)
          : await api.next(session.id);
        commit(() => {
          op.gate.acknowledge(acknowledgment.colaVersion);
          op.setNotice(
            finish ? "Reproducción finalizada" : "Siguiente canción preparada",
          );
        });
      } catch {
        await refresh(commit);
        throw new Error(
          "No pudimos confirmar el cambio. Revisa la cola antes de intentarlo otra vez.",
        );
      }
      await refresh(commit);
    });
  }
  const blocked =
    op.busy ||
    !confirmed ||
    !session ||
    !establishment.activo ||
    establishment.pausado ||
    establishment.enMantenimiento;
  return (
    <section className="card demo-queue">
      <div className="heading">
        <h2>Cola musical</h2>
        <span className="muted">Actualización automática</span>
      </div>
      {stale && (
        <output className="muted">
          No pudimos actualizar. Mostramos la última cola disponible; volveremos
          a intentarlo.
        </output>
      )}
      {snapshot ? (
        <>
          <QueueSongs snapshot={snapshot} />
          {!snapshot.enReproduccion && !snapshot.cola.length && (
            <p>No hay canciones en cola.</p>
          )}
        </>
      ) : (
        <p>{stale ? "Cola no disponible por ahora." : "Cargando canciones…"}</p>
      )}
      {showPlaybackControls && (
        <div className="demo-controls">
          <output aria-live="polite">{op.notice}</output>
          {op.error && (
            <p className="alert" role="alert">
              {op.error}
            </p>
          )}
          <button
            type="button"
            disabled={
              blocked ||
              session?.estado !== "ABIERTA" ||
              snapshot?.estado !== SERVICE.OPEN ||
              !!snapshot?.enReproduccion
            }
            onClick={() => void mutate(false)}
          >
            Siguiente
          </button>
          <label>
            Al finalizar
            <select
              value={result}
              disabled={op.busy}
              onChange={(event) => {
                if (isFinish(event.target.value)) setResult(event.target.value);
              }}
            >
              <option value={FINISH.COMPLETED}>Completada</option>
              <option value={FINISH.SKIPPED}>Saltada</option>
              <option value={FINISH.FAILED}>Fallida</option>
            </select>
          </label>
          <button
            type="button"
            disabled={blocked || !snapshot?.enReproduccion}
            onClick={() => void mutate(true)}
          >
            Finalizar
          </button>
        </div>
      )}
    </section>
  );
}

"use client";

import { useState } from "react";
import type { Establishment, Session } from "@/lib/admin-api";
import type { DemoApi } from "@/lib/demo-api";
import {
  FINISH,
  type Finish,
  isFinish,
  type Queue,
  SERVICE,
} from "@/lib/demo-contracts";
import { OperationStatus, useDemoOperation } from "./operation";

export function QueuePanel({
  api,
  establishment,
  session,
}: {
  api: DemoApi;
  establishment: Establishment;
  session: Session | null;
}) {
  const [snapshot, setSnapshot] = useState<Queue | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [result, setResult] = useState<Finish>(FINISH.COMPLETED);
  const op = useDemoOperation();
  async function refresh(commit: (update: () => void) => void) {
    const value = await api.queue(establishment.qrSlug);
    commit(() => {
      if (op.gate.acceptVersion(value.colaVersion)) {
        setSnapshot(value);
        setConfirmed(true);
      } else {
        setConfirmed(false);
        throw new Error(
          "Llegó una versión anterior de la cola. Actualiza antes de operar.",
        );
      }
    });
  }
  async function mutate(finish: boolean) {
    if (!session || !confirmed) return;
    await op.run(async (commit) => {
      commit(() => setConfirmed(false));
      try {
        const acknowledgment = finish
          ? await api.finish(session.id, result)
          : await api.next(session.id);
        commit(() => {
          op.gate.acknowledge(acknowledgment.colaVersion);
          op.setNotice(
            `Cambio de estado confirmado por el servidor. Versión ${acknowledgment.colaVersion}. No implica reproducción de audio.`,
          );
        });
      } catch (error) {
        // Read after rejection or lost acknowledgment, never retry the mutation.
        try {
          await refresh(commit);
        } catch {
          commit(() => setConfirmed(false));
        }
        throw error;
      }
      await refresh(commit);
    });
  }
  return (
    <section className="card demo-queue">
      <h2>Cola pública y estado del servidor</h2>
      <p>
        Vista pública sin identidades ni voto personal. Actualización manual; no
        hay reproductor, avance automático ni respaldo desde la lista
        predeterminada.
      </p>
      <button
        type="button"
        disabled={op.busy}
        onClick={() =>
          void op.run(async (commit) => {
            commit(() => setConfirmed(false));
            await refresh(commit);
          })
        }
      >
        Actualizar cola del servidor
      </button>
      <OperationStatus {...op} />
      {!confirmed && (
        <p>
          Estado sin confirmar. Actualiza antes de operar; las lecturas
          anteriores son solo referencia.
        </p>
      )}
      {snapshot ? (
        <>
          <p>
            Estado del servicio: {snapshot.estado} · Versión de cola:{" "}
            {snapshot.colaVersion}
          </p>
          <h3>En reproducción según el servidor</h3>
          {snapshot.enReproduccion ? (
            <>
              <p>
                {snapshot.enReproduccion.cancion.titulo} ·{" "}
                {snapshot.enReproduccion.cancion.artista}
              </p>
              <p>
                Inicio: {snapshot.enReproduccion.iniciadaAt} · Restante
                estimado: {snapshot.enReproduccion.restanteSegundos} s
              </p>
            </>
          ) : (
            <p>Sin reproducción activa.</p>
          )}
          <h3>Solicitudes pendientes</h3>
          {snapshot.cola.length ? (
            <ol>
              {snapshot.cola.map((item) => (
                <li key={item.solicitudId}>
                  {item.posicion}. {item.cancion.titulo} ·{" "}
                  {item.cancion.artista} · {item.votos} votos · Espera estimada:{" "}
                  {item.esperaEstimadaSegundos} s
                </li>
              ))}
            </ol>
          ) : (
            <p>
              Cola vacía. Un participante debe solicitar una canción antes de
              avanzar.
            </p>
          )}
        </>
      ) : (
        <p>Cola sin consultar.</p>
      )}
      <div className="demo-controls">
        <button
          type="button"
          disabled={
            op.busy ||
            !confirmed ||
            !session ||
            snapshot?.estado !== SERVICE.OPEN ||
            !!snapshot?.enReproduccion ||
            !snapshot?.cola.length
          }
          onClick={() => void mutate(false)}
        >
          Iniciar siguiente solicitud en el servidor
        </button>
        <label>
          Resultado que se registra
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
          disabled={
            op.busy || !confirmed || !session || !snapshot?.enReproduccion
          }
          onClick={() => void mutate(true)}
        >
          Registrar fin de reproducción en el servidor
        </button>
      </div>
      {!session && (
        <p>
          Actualiza el estado del establecimiento para confirmar una sesión en
          operación.
        </p>
      )}
    </section>
  );
}

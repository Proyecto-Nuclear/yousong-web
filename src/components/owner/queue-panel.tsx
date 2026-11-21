"use client";

import { type CSSProperties, useEffect, useEffectEvent, useState } from "react";
import type { Establishment, Session } from "../../lib/admin-api";
import type { DemoApi } from "../../lib/demo-api";
import {
  FINISH,
  type Finish,
  isFinish,
  type Playing,
  type Queue,
  type QueueItem,
  SERVICE,
} from "../../lib/demo-contracts";
import {
  approxDuration,
  drainSeconds,
  formatDuration,
  plural,
  updatedLabel,
  votesLabel,
  waitLabel,
} from "../../lib/format";
import { refreshQueue, startQueueRefresh } from "../../lib/queue-refresh";
import { Cover } from "../cover";
import {
  AlertIcon,
  ArrowUpIcon,
  ClockIcon,
  DiscIcon,
  QrIcon,
  QueueIcon,
  SkipIcon,
  StopIcon,
} from "../icons";
import { Bunting } from "./bunting";
import { EmptyState, ErrorCallout, SkeletonRows } from "./feedback";
import { useOwnerOperation } from "./operation";
import { SongMeta } from "./song-meta";

const PANEL_ROWS = 8;

/** Round vote count; pulses briefly only when the number changes. */
export function VoteCount({ votes }: { votes: number }) {
  const [seen, setSeen] = useState(votes);
  const [pulse, setPulse] = useState(0);
  if (votes !== seen) {
    setSeen(votes);
    setPulse((value) => value + 1);
  }
  return (
    <span
      key={pulse}
      className={`votes${pulse ? " votes--pulse" : ""}`}
      title={votesLabel(votes)}
    >
      <ArrowUpIcon size={14} />
      <span className="votes__count" aria-hidden="true">
        {votes}
      </span>
      <span className="sr-only">{votesLabel(votes)}</span>
    </span>
  );
}

function QueueRow({ item, first }: { item: QueueItem; first: boolean }) {
  const song = item.cancion;
  return (
    <li className={`queue-row${first ? " queue-row--first" : ""}`}>
      <span className="queue-row__pos" aria-hidden="true">
        {String(item.posicion).padStart(2, "0")}
      </span>
      <Cover title={song.titulo} />
      <div className="queue-row__body">
        {first && (
          <span className="queue-row__next" aria-hidden="true">
            Sigue
          </span>
        )}
        <h3 className="queue-row__title">
          <span className="sr-only">
            Puesto {item.posicion}
            {first ? ", sigue" : ""}:{" "}
          </span>
          {song.titulo}
        </h3>
        <SongMeta
          artist={song.artista}
          genre={song.genero}
          seconds={song.duracionSegundos}
        />
        <p className="queue-row__wait">
          {waitLabel(item.esperaEstimadaSegundos)}
        </p>
      </div>
      <VoteCount votes={item.votos} />
    </li>
  );
}

export function QueueSongs({
  snapshot,
  limit,
}: {
  snapshot: Queue;
  limit?: number;
}) {
  const rows = limit ? snapshot.cola.slice(0, limit) : snapshot.cola;
  return (
    <ol className="queue" aria-label="Canciones en cola">
      {rows.map((item, index) => (
        <QueueRow key={item.solicitudId} item={item} first={index === 0} />
      ))}
    </ol>
  );
}

export function Equalizer({ on }: { on: boolean }) {
  return (
    <span className={`eq${on ? " eq--on" : ""}`} aria-hidden="true">
      <span className="eq__bar" />
      <span className="eq__bar" />
      <span className="eq__bar" />
      <span className="eq__bar" />
    </span>
  );
}

/** Static share of the song already played; null when the duration is unknown. */
export function playedShare(playing: Playing) {
  const total = playing.cancion.duracionSegundos;
  if (!total) return null;
  const done = (total - playing.restanteSegundos) / total;
  return Math.min(1, Math.max(0, done));
}

export function NowPlaying({
  playing,
  hint,
}: {
  playing: Playing | null;
  hint?: string;
}) {
  if (!playing)
    return (
      <div className="now">
        <span className="now__disc">
          <DiscIcon size={36} />
        </span>
        <div>
          <p className="now__eyebrow">Sin reproducción activa</p>
          <h2 className="now__title">El local está preparando la música</h2>
          {hint && <p className="now__hint">{hint}</p>}
        </div>
      </div>
    );
  const song = playing.cancion;
  const left = playing.restanteSegundos;
  const share = playedShare(playing);
  const total = song.duracionSegundos ?? 0;
  return (
    <div className="now now--live">
      <span className="now__art">
        <Cover title={song.titulo} size={120} />
      </span>
      <div>
        <p className="now__eyebrow">
          <Equalizer on />
          En reproducción
        </p>
        <h2 className="now__title">{song.titulo}</h2>
        <SongMeta
          artist={song.artista}
          genre={song.genero}
          seconds={song.duracionSegundos}
        />
        {share === null ? (
          <p className="now__hint tabular">
            {left > 0
              ? `Quedan ~ ${Math.ceil(left / 60)} min`
              : "Ya debería estar terminando"}
          </p>
        ) : (
          <div className="progress">
            <span className="progress__track" aria-hidden="true">
              <span
                className="progress__fill"
                style={
                  { "--done": `${Math.round(share * 100)}%` } as CSSProperties
                }
              />
            </span>
            <p className="progress__text">
              <span>
                <span className="sr-only">Sonó </span>
                {formatDuration(total - left)}
              </span>
              <span>
                {left > 0
                  ? `Quedan ~ ${Math.ceil(left / 60)} min`
                  : "Ya debería estar terminando"}
              </span>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function Stats({ snapshot }: { snapshot: Queue | null }) {
  const votes = snapshot?.cola.reduce((sum, item) => sum + item.votos, 0);
  const drain = snapshot ? drainSeconds(snapshot.cola) : null;
  return (
    <section className="stats" aria-label="Resumen de la noche">
      <div className="stat">
        <p className="stat__label">
          <QueueIcon size={16} />
          Solicitudes en cola
        </p>
        <p className="stat__value">{snapshot ? snapshot.cola.length : "–"}</p>
      </div>
      <div className="stat">
        <p className="stat__label">
          <ArrowUpIcon size={16} />
          Votos en cola
        </p>
        <p className="stat__value">{votes ?? "–"}</p>
      </div>
      <div className="stat">
        <p className="stat__label">
          <ClockIcon size={16} />
          Para vaciar la cola
        </p>
        <p className="stat__value">
          {!snapshot ? "–" : drain === null ? "0 min" : approxDuration(drain)}
        </p>
      </div>
    </section>
  );
}

function Freshness({ at }: { at: number }) {
  const [now, setNow] = useState(at);
  useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(timer);
  }, []);
  return <span className="status-line">{updatedLabel(now - at)}</span>;
}

const RESULT_LABEL: Record<Finish, string> = {
  [FINISH.COMPLETED]: "Completada",
  [FINISH.SKIPPED]: "Saltada",
  [FINISH.FAILED]: "Fallida",
};

export function QueuePanel({
  api,
  establishment,
  session,
  showPlaybackControls = false,
  onShowAll,
  onShowQr,
}: {
  api: DemoApi;
  establishment: Establishment;
  session: Session | null;
  showPlaybackControls?: boolean;
  onShowAll?: () => void;
  /** Navigates to Noche y QR (empty queue next action). */
  onShowQr?: () => void;
}) {
  const [snapshot, setSnapshot] = useState<Queue | null>(null);
  const [readAt, setReadAt] = useState(0);
  const [confirmed, setConfirmed] = useState(false);
  const [stale, setStale] = useState(false);
  const [result, setResult] = useState<Finish>(FINISH.COMPLETED);
  const op = useOwnerOperation();
  async function refresh(commit: (update: () => void) => void) {
    await refreshQueue({
      read: () => api.queue(establishment.qrSlug),
      gate: op.gate,
      commit,
      accept(value) {
        setSnapshot(value);
        setReadAt(Date.now());
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
    const ending = snapshot?.enReproduccion?.cancion.titulo;
    await op.run(async (commit) => {
      commit(() => setConfirmed(false));
      try {
        if (finish) {
          const acknowledgment = await api.finish(session.id, result);
          commit(() => {
            op.gate.acknowledge(acknowledgment.colaVersion);
            op.setNotice(
              `Canción terminada (${RESULT_LABEL[result].toLowerCase()}): ${ending ?? ""}`.trim(),
            );
          });
        } else {
          const acknowledgment = await api.next(session.id);
          commit(() => {
            op.gate.acknowledge(acknowledgment.colaVersion);
            op.setNotice(`Sonando ahora: ${acknowledgment.cancion.titulo}`);
          });
        }
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
  const playing = snapshot?.enReproduccion ?? null;
  const canStart =
    !blocked &&
    session?.estado === "ABIERTA" &&
    snapshot?.estado === SERVICE.OPEN &&
    !playing;
  const reason = !session
    ? "Abre la noche en Noche y QR para controlar la reproducción."
    : session.estado === "PAUSADA"
      ? "La noche está en pausa: reanúdala para pasar de canción."
      : establishment.pausado || establishment.enMantenimiento
        ? "El servicio del local no está disponible ahora."
        : "";
  const pending = snapshot?.cola.length ?? 0;
  const limit = showPlaybackControls ? PANEL_ROWS : undefined;

  const queueCard = (
    <section
      className="card"
      aria-labelledby="queue-title"
      aria-busy={!snapshot && !stale}
    >
      <div className="card__head">
        <h2 id="queue-title" className="card__title">
          Cola en vivo
        </h2>
        <div className="cluster">
          {snapshot ? (
            <Freshness key={readAt} at={readAt} />
          ) : (
            <span className="status-line">Actualización automática</span>
          )}
          {snapshot && (
            <span className={`chip${pending ? " chip--accent" : ""}`}>
              {plural(pending, "pendiente")}
            </span>
          )}
        </div>
      </div>
      <div className="live-slot" aria-live="polite">
        {stale && (
          <div className="callout callout--warn">
            <AlertIcon size={20} />
            <div className="callout__body">
              <p className="callout__title">Sin conexión con la cola</p>
              <p>
                {snapshot
                  ? "Mostramos la última cola recibida y seguimos intentando solos."
                  : "Seguimos intentando solos. La cola aparecerá en cuanto haya conexión."}
              </p>
            </div>
          </div>
        )}
      </div>
      {snapshot ? (
        snapshot.cola.length ? (
          <>
            <QueueSongs snapshot={snapshot} limit={limit} />
            {limit && snapshot.cola.length > limit && (
              <div className="queue-more">
                <span className="tabular">
                  {`y ${plural(snapshot.cola.length - limit, "canción más", "canciones más")}`}
                </span>
                {onShowAll && (
                  <button
                    type="button"
                    className="btn btn--small"
                    onClick={onShowAll}
                  >
                    Ver toda la cola
                  </button>
                )}
              </div>
            )}
          </>
        ) : (
          <EmptyState
            title="Todavía no hay solicitudes"
            icon={<QrIcon size={22} />}
            action={
              onShowQr && (
                <button
                  type="button"
                  className="btn btn--small"
                  onClick={onShowQr}
                >
                  {session ? "Ver el QR" : "Ir a Noche y QR"}
                </button>
              )
            }
          >
            {session
              ? "Cuando alguien escanee el QR y pida una canción, aparecerá aquí con sus votos."
              : "Abre la noche y comparte el QR para que tu público empiece a pedir canciones."}
          </EmptyState>
        )
      ) : (
        !stale && (
          <>
            <p className="sr-only">Cargando…</p>
            <SkeletonRows />
          </>
        )
      )}
    </section>
  );

  if (!showPlaybackControls)
    return (
      <div className="stack stack--loose">
        <section
          className={`stage${playing ? " stage--live" : ""}`}
          aria-label="En reproducción"
        >
          <Bunting />
          <NowPlaying playing={playing} />
        </section>
        {queueCard}
      </div>
    );

  return (
    <div className="stack stack--loose">
      <Stats snapshot={snapshot} />
      <div className="grid-live">
        <section
          className={`stage${playing ? " stage--live" : ""}`}
          aria-label="En reproducción"
        >
          <Bunting />
          <NowPlaying
            playing={playing}
            hint={
              snapshot && !playing
                ? "Usa Siguiente canción para que suene la primera de la cola."
                : undefined
            }
          />
          <div className="playback">
            {op.error && <ErrorCallout error={op.error} />}
            <button
              type="button"
              className={`btn btn--pill${playing ? "" : " btn--primary"}`}
              disabled={!canStart}
              onClick={() => void mutate(false)}
            >
              <SkipIcon size={20} />
              Siguiente canción
            </button>
            <fieldset className="segmented" disabled={op.busy || !playing}>
              <legend className="segmented__legend">
                Cómo terminó la canción que suena
              </legend>
              <div className="segmented__options">
                {Object.values(FINISH).map((value) => (
                  <label key={value} className="segmented__option">
                    <input
                      type="radio"
                      name="finish-result"
                      value={value}
                      checked={result === value}
                      onChange={(event) => {
                        if (isFinish(event.target.value))
                          setResult(event.target.value);
                      }}
                    />
                    {RESULT_LABEL[value]}
                  </label>
                ))}
              </div>
            </fieldset>
            <button
              type="button"
              className={`btn btn--pill${playing ? " btn--primary" : ""}`}
              disabled={blocked || !playing}
              onClick={() => void mutate(true)}
            >
              <StopIcon size={20} />
              Terminar canción
            </button>
            <p className="status-line">
              {reason ||
                (playing
                  ? `Al terminar se registra como ${RESULT_LABEL[result].toLowerCase()}. Este panel no reproduce audio.`
                  : "Este panel registra qué suena; no reproduce audio.")}
            </p>
          </div>
        </section>
        {queueCard}
      </div>
    </div>
  );
}

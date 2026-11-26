"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import {
  type Analitica,
  HISTORY_NIGHTS,
  type Jornada,
} from "../../lib/analytics-contracts";
import {
  attempts,
  channelReading,
  clockLabel,
  cubeModel,
  decimal,
  funnelReading,
  genreReading,
  hourLabel,
  hourlyReading,
  hourlySummary,
  liveLabel,
  nightTag,
  POLL_MS,
  participationReading,
  participationRows,
  participationSummary,
  playbackReading,
  rankingReading,
  shortDate,
  shouldPoll,
  statesReading,
  stateTotal,
  versusReading,
  waitReading,
} from "../../lib/analytics-insights";
import type { DemoApi } from "../../lib/demo-api";
import { nightLabel } from "../../lib/format";
import { ownerError, sessionNotice } from "../../lib/owner-copy";
import { ChartIcon } from "../icons";
import { Analytics } from "./analytics";
import {
  Butterfly,
  ChannelDonut,
  ChartCard,
  Funnel,
  HourlyChart,
  hourlyTable,
  ParticipationChart,
  PlaybackBars,
  participationTable,
  playbackTable,
  RankingBars,
  rankingTable,
  StateCards,
  StateStack,
  WaitHistogram,
  waitTable,
  waitValue,
} from "./analytics-charts";
import { EmptyState, ErrorCallout } from "./feedback";
import { GenreCube } from "./genre-cube";

const NO_ROWS = (text: string) => <p className="chart__empty">{text}</p>;

function LiveCharts({ night }: { night: Jornada }) {
  const day = night.sesion ? shortDate(night.sesion.fechaOperativa) : "";
  const hourly = hourlySummary(night.porHora);
  const total = stateTotal(night.estados);
  const tries = night.reproducciones.reduce((sum, r) => sum + attempts(r), 0);
  const live = night.enVivo;
  return (
    <div className="charts">
      <ChartCard
        id="chart-hourly"
        wide
        title="Solicitudes y votos por hora"
        question="¿A qué hora de la noche se concentra la actividad?"
        scope={`Barras + línea · jornada del ${day}`}
        how="Conteo de solicitudes y de votos por hora, agrupando la jornada por su fecha operativa y no por fecha calendario: la jornada cruza la medianoche. Las dos series comparten el mismo eje."
        kpis={[
          {
            label: "Solicitudes",
            value: String(hourly.solicitudes),
            note: "en la jornada",
          },
          {
            label: "Votos",
            value: String(hourly.votos),
            note: `incluye ${hourly.solicitudes} iniciales`,
            tone: "accent",
          },
          {
            label: "Hora pico",
            value: hourly.pico ? hourLabel(hourly.pico.hora) : "Sin datos",
            note: hourly.pico ? `${hourly.pico.votos} votos` : "aún sin votos",
          },
        ]}
        reading={hourlyReading(night.porHora)}
        table={night.porHora.length ? hourlyTable(night.porHora) : undefined}
      >
        {night.porHora.length ? (
          <HourlyChart porHora={night.porHora} />
        ) : (
          NO_ROWS("Aún no hay solicitudes en esta jornada.")
        )}
      </ChartCard>
      <ChartCard
        id="chart-funnel"
        title="De la solicitud a la canción completada"
        question="¿Cuántas solicitudes llegan realmente a sonar completas?"
        scope={`Embudo · jornada del ${day}`}
        how="Creadas = todas las solicitudes. Iniciadas = las que tienen un primer inicio registrado. Completadas = estado Atendida con la reproducción completada y conciliada. No se equiparan reserva, inicio y finalización."
        reading={funnelReading(night)}
      >
        <Funnel embudo={night.embudo} />
        <StateCards estados={night.estados} compact />
      </ChartCard>
      <ChartCard
        id="chart-wait"
        title="Espera real hasta que suena"
        question="¿Cuánto esperan los clientes desde que piden hasta que su canción empieza?"
        scope={`Histograma + mediana y p95 · jornada del ${day} · ${night.espera.iniciadas} iniciadas`}
        how="Espera real = primer inicio menos creación de la solicitud. Mediana y percentil 95 solo entre solicitudes iniciadas. Las pendientes no tienen espera cero: se reportan aparte con su antigüedad."
        kpis={[
          {
            label: "Mediana",
            value: waitValue(night.espera.medianaS),
            note: "solo iniciadas",
            tone: "accent",
          },
          {
            label: "Percentil 95",
            value: waitValue(night.espera.p95S),
            note: "solo iniciadas",
            tone: "warn",
          },
          {
            label: live ? "Pendientes ahora" : "Pendientes al cierre",
            value: String(night.espera.pendientes),
            note:
              night.espera.antiguedadMedianaPendientesS === null
                ? "sin pendientes"
                : `antigüedad mediana ${waitValue(night.espera.antiguedadMedianaPendientesS)}`,
          },
        ]}
        reading={waitReading(night)}
        table={night.espera.tramos.length ? waitTable(night.espera) : undefined}
      >
        {night.espera.tramos.some((b) => b.total > 0) ? (
          <WaitHistogram espera={night.espera} />
        ) : (
          NO_ROWS("Ninguna solicitud ha empezado a sonar todavía.")
        )}
      </ChartCard>
      <ChartCard
        id="chart-states"
        wide
        title="Cómo terminaron las solicitudes"
        question="¿Qué pasó con cada solicitud al cerrar la jornada?"
        scope={`Barra apilada al 100 % · jornada del ${day} · ${total} solicitudes`}
        how="Conteo de solicitudes por estado conciliado al cierre. Una falla del reproductor queda como Fallida y nunca cuenta como atendida. Mientras la noche sigue abierta también se cuentan las que están en curso, con trama rayada."
        note={
          live ? (
            <p className="chart__note">
              La noche sigue abierta: las solicitudes en curso todavía pueden
              cambiar de estado.
            </p>
          ) : undefined
        }
        reading={statesReading(night)}
      >
        {total ? <StateStack estados={night.estados} /> : null}
        <StateCards estados={night.estados} />
      </ChartCard>
      <ChartCard
        id="chart-playback"
        wide
        title="Intentos de reproducción por origen"
        question="¿Cuántos intentos de reproducir hubo y cómo terminaron, según vengan de una solicitud o de la lista por defecto?"
        scope={`Barras apiladas · jornada del ${day} · ${tries} intentos`}
        how="Conteo de intentos de reproducción por origen y resultado. Solicitud: intentos de una canción pedida. Lista por defecto: lo que sonó con la cola vacía. Un fallo antes de sonar también es un intento. Intentos no es lo mismo que canciones completadas."
        reading={playbackReading(night)}
        table={playbackTable(night.reproducciones)}
      >
        <PlaybackBars rows={night.reproducciones} />
      </ChartCard>
    </div>
  );
}

function GenreChart({
  history,
  night,
  reducedMotion,
}: {
  history: Analitica | null;
  night: Jornada | null;
  reducedMotion: boolean;
}) {
  const [selected, setSelected] = useState(0);
  const model = cubeModel(night, history?.generosPorHora ?? []);
  if (!model.layers.some((layer) => layer.cells.length)) return null;
  const layer = model.layers[Math.min(selected, model.layers.length - 1)];
  const reading = genreReading(layer, model.hours);
  return (
    <ChartCard
      id="chart-genres"
      wide
      title="Géneros por hora de la noche"
      question="¿Qué tipo de música piden los clientes en cada momento de la jornada?"
      scope={`Cubo · ${model.layers.length} jornadas · al frente la jornada ${night?.enVivo ? "en vivo" : "más reciente"}`}
      how="Porcentaje de las solicitudes de cada hora según el género propio de la canción (clasificación verificada del local). Las celdas con menos de 5 participantes se ocultan antes de difundir. La cara frontal es la jornada de arriba y se actualiza en vivo; detrás quedan las jornadas publicadas, de la más reciente a la más antigua."
      reading={reading ? `${layer.label}: ${reading}` : null}
    >
      <GenreCube
        model={model}
        selected={selected}
        onSelect={setSelected}
        reducedMotion={reducedMotion}
      />
    </ChartCard>
  );
}

function HistoryCharts({ history }: { history: Analitica }) {
  const rows = participationRows(history);
  const summary = participationSummary(rows);
  const n = history.jornadas.length;
  const scope = `últimas ${n} ${n === 1 ? "jornada" : "jornadas"}`;
  return (
    <>
      <ChartCard
        id="chart-participation"
        wide
        title="Participación por jornada"
        question="¿Cuánta gente entra a participar en cada jornada y cuántos realmente piden o votan?"
        scope={`Barras agrupadas · ${scope}`}
        how="Participación = personas que entraron a la jornada, contadas por seudónimo una vez por noche. Activa = seudónimos con al menos una solicitud o un voto. No son personas físicas verificadas."
        kpis={
          summary
            ? [
                {
                  label: "Promedio por jornada",
                  value: decimal(summary.promedio),
                  note: "participaciones",
                },
                {
                  label: "Activas",
                  value: `${summary.activasPct} %`,
                  note: `${summary.activas} de ${summary.ingresaron}`,
                  tone: "accent",
                },
                {
                  label: "Jornada pico",
                  value: shortDate(summary.pico.fechaOperativa),
                  note: `${summary.pico.ingresaron} ingresos`,
                },
              ]
            : undefined
        }
        reading={participationReading(rows)}
        table={participationTable(rows)}
      >
        <ParticipationChart rows={rows} />
      </ChartCard>
      <ChartCard
        id="chart-channel"
        title="Canal de ingreso"
        question="¿Los clientes entran más por la web del QR o por la app Android?"
        scope={`Dona · ${scope}`}
        how="Conteo de participaciones agrupado por canal: web (desde el QR, sin instalar nada) o la app Android."
        reading={channelReading(history.canales)}
      >
        {history.canales.WEB + history.canales.ANDROID ? (
          <ChannelDonut canales={history.canales} />
        ) : (
          NO_ROWS("Aún no hay participaciones publicadas.")
        )}
      </ChartCard>
      <ChartCard
        id="chart-ranking"
        title="Ranking de popularidad"
        question="¿Cuáles son las canciones más apoyadas por los clientes del local?"
        scope={`Barras horizontales · ${scope} · top ${HISTORY_NIGHTS}`}
        how="Popularidad = votos por canción, incluyendo una sola vez el voto inicial de quien la pidió. Es un ranking propio del local, no de YouTube."
        reading={rankingReading(history.ranking)}
        table={
          history.ranking.length ? rankingTable(history.ranking) : undefined
        }
      >
        {history.ranking.length ? (
          <RankingBars ranking={history.ranking} />
        ) : (
          NO_ROWS("Aún no hay votos publicados.")
        )}
      </ChartCard>
    </>
  );
}

function VersusChart({ history }: { history: Analitica }) {
  const n = history.jornadas.length;
  return (
    <ChartCard
      id="chart-versus"
      wide
      title="Más votadas vs. más reproducidas"
      question="¿Las canciones con más votos son también las que más suenan completas?"
      scope={`Barras enfrentadas · últimas ${n} ${n === 1 ? "jornada" : "jornadas"}`}
      how="Izquierda: votos por canción. Derecha: reproducciones completadas por canción. La más votada puede no ser la más reproducida."
      reading={versusReading(history.ranking)}
      table={history.ranking.length ? rankingTable(history.ranking) : undefined}
    >
      {history.ranking.length ? (
        <Butterfly ranking={history.ranking} />
      ) : (
        NO_ROWS("Aún no hay votos publicados.")
      )}
    </ChartCard>
  );
}

/** The dashboard view: live night first, then the published history. */
export function AnalyticsBoard({
  history,
  historyError,
  night,
  nightError,
  timeZone,
  status,
  failed = false,
  nightPicker,
  reducedMotion = false,
  onRetry,
}: {
  history: Analitica | null;
  historyError?: string;
  night: Jornada | null;
  nightError?: string;
  timeZone?: string;
  status: string;
  failed?: boolean;
  nightPicker?: ReactNode;
  reducedMotion?: boolean;
  onRetry?: () => void;
}) {
  const retry = onRetry && (
    <button type="button" className="btn btn--small" onClick={onRetry}>
      Reintentar
    </button>
  );
  const published = history?.publicacion && history.jornadas.length > 0;
  const first = history?.jornadas[0];
  const last = history?.jornadas.at(-1);
  return (
    <div className="board">
      <section className="board__group" aria-labelledby="group-live">
        <header className="board__head">
          <div className="board__titles">
            <h2 id="group-live" className="board__title">
              Jornada en curso
            </h2>
            {night?.sesion && (
              <p className="board__meta">
                <span
                  className={`chip ${night.enVivo ? "chip--live" : "chip--off"}`}
                >
                  {sessionNotice(night.sesion.estado)}
                </span>
                {nightLabel(night.sesion.fechaOperativa)}
              </p>
            )}
          </div>
          <div className="board__tools">
            {nightPicker}
            {night?.sesion && status && (
              <p
                className={`live-status${failed ? " live-status--failed" : ""}${night.enVivo ? " live-status--on" : ""}`}
              >
                {status}
              </p>
            )}
          </div>
        </header>
        {failed && (
          <output className="callout callout--warn">
            No pudimos actualizar la jornada. Seguimos mostrando los últimos
            datos y lo intentamos de nuevo en 10 s.
          </output>
        )}
        {nightError ? (
          <ErrorCallout error={nightError} action={retry} />
        ) : !night ? (
          <p className="loading-text">Cargando la jornada…</p>
        ) : night.sesion ? (
          <LiveCharts night={night} />
        ) : (
          <EmptyState
            title="Aún no hay una noche para analizar"
            icon={<ChartIcon size={22} />}
          >
            Abre la noche en Noche y QR: aquí verás en vivo cómo llegan las
            solicitudes, los votos y las reproducciones.
          </EmptyState>
        )}
      </section>
      <section className="board__group" aria-labelledby="group-history">
        <header className="board__head">
          <div className="board__titles">
            <h2 id="group-history" className="board__title">
              Últimas {HISTORY_NIGHTS} jornadas
            </h2>
            {published && first && last && (
              <p className="board__meta">
                {history.jornadas.length}{" "}
                {history.jornadas.length === 1
                  ? "jornada publicada"
                  : "jornadas publicadas"}
                , del {shortDate(first.fechaOperativa)} al{" "}
                {shortDate(last.fechaOperativa)}
              </p>
            )}
          </div>
          {history?.publicacion && (
            <p className="publication">
              <span className="publication__version">
                Publicación v{history.publicacion.version}
              </span>
              <span className="publication__cut">
                corte {clockLabel(history.publicacion.corteEventosAt, timeZone)}
              </span>
            </p>
          )}
        </header>
        {historyError ? (
          <ErrorCallout error={historyError} action={retry} />
        ) : !history ? (
          <p className="loading-text">Cargando las jornadas publicadas…</p>
        ) : (
          <div className="charts">
            {published ? (
              <HistoryCharts history={history} />
            ) : (
              <div className="chart--wide">
                <EmptyState
                  title="Aún no hay analítica publicada"
                  icon={<ChartIcon size={22} />}
                >
                  La analítica se publica cada 5 minutos mientras la noche está
                  abierta y otra vez al cerrarla. Las jornadas cerradas
                  aparecerán aquí.
                </EmptyState>
              </div>
            )}
            <GenreChart
              history={history}
              night={night}
              reducedMotion={reducedMotion}
            />
            {published && <VersusChart history={history} />}
          </div>
        )}
      </section>
    </div>
  );
}

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return reduced;
}

/**
 * Analítica: the documented charts, live while a night is open (polled every
 * 10 s only while live and visible), plus the ranked lists of the venue.
 */
export function AnalyticsDashboard({
  api,
  qrSlug,
  timeZone,
  onOpenNight,
}: {
  api: DemoApi;
  qrSlug: string;
  timeZone?: string;
  onOpenNight?: () => void;
}) {
  const [history, setHistory] = useState<Analitica | null>(null);
  const [historyError, setHistoryError] = useState("");
  const [night, setNight] = useState<Jornada | null>(null);
  const [nightError, setNightError] = useState("");
  const [selected, setSelected] = useState("");
  const [updatedAt, setUpdatedAt] = useState(0);
  const [failed, setFailed] = useState(false);
  const [now, setNow] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const live = useRef(false);
  const reducedMotion = usePrefersReducedMotion();

  // biome-ignore lint/correctness/useExhaustiveDependencies: attempt is the retry trigger.
  useEffect(() => {
    let current = true;
    setHistoryError("");
    api
      .analytics(HISTORY_NIGHTS)
      .then((value) => current && setHistory(value))
      .catch((reason) => current && setHistoryError(ownerError(reason)));
    return () => {
      current = false;
    };
  }, [api, attempt]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: attempt is the retry trigger.
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let busy = false;
    const schedule = () => {
      clearTimeout(timer);
      if (!cancelled && shouldPoll(live.current, document.visibilityState))
        timer = setTimeout(() => void load(false), POLL_MS);
    };
    const load = async (first: boolean) => {
      if (busy) return;
      busy = true;
      try {
        const value = await api.nightAnalytics(selected || undefined);
        if (cancelled) return;
        live.current = value.enVivo;
        setNight(value);
        setUpdatedAt(Date.now());
        setNow(Date.now());
        setFailed(false);
        setNightError("");
      } catch (reason) {
        if (cancelled) return;
        // Keep the last data on a failed refresh and say so; only a first
        // load without data becomes an error.
        if (first) setNightError(ownerError(reason));
        else setFailed(true);
      } finally {
        busy = false;
        schedule();
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible" && live.current)
        void load(false);
      else clearTimeout(timer);
    };
    void load(true);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [api, selected, attempt]);

  // The freshness label ticks every second while it is on screen.
  useEffect(() => {
    if (!updatedAt) return;
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, [updatedAt]);

  const status = updatedAt
    ? liveLabel({ live: !!night?.enVivo, updatedAt, now, failed })
    : "";
  const nights = [...(history?.jornadas ?? [])].reverse();
  const picker = nights.length ? (
    <label className="night-picker">
      <span className="night-picker__label">Jornada</span>
      <select
        className="night-picker__select"
        value={selected}
        onChange={(event) => setSelected(event.target.value)}
      >
        <option value="">La más reciente</option>
        {nights.map((n) => (
          <option key={n.sesionId} value={n.sesionId}>
            {nightTag(n.fechaOperativa)}
          </option>
        ))}
      </select>
    </label>
  ) : null;

  return (
    <div className="stack stack--loose">
      <AnalyticsBoard
        history={history}
        historyError={historyError}
        night={night}
        nightError={nightError}
        timeZone={timeZone}
        status={status}
        failed={failed}
        nightPicker={picker}
        reducedMotion={reducedMotion}
        onRetry={() => setAttempt((value) => value + 1)}
      />
      <section className="board__group" aria-labelledby="group-lists">
        <header className="board__head">
          <div className="board__titles">
            <h2 id="group-lists" className="board__title">
              Listas del local
            </h2>
            <p className="board__meta">
              Lo más votado, pedido y sonado según el periodo que elijas.
            </p>
          </div>
        </header>
        <Analytics
          api={api}
          qrSlug={qrSlug}
          timeZone={timeZone}
          onOpenNight={onOpenNight}
        />
      </section>
    </div>
  );
}

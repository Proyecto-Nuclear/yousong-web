"use client";

import type { CSSProperties, ReactNode } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  LabelList,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { barShare } from "../../lib/analytics";
import {
  type Analitica,
  type Jornada,
  PLAYBACK_ORIGIN_LABEL,
  PLAYBACK_RESULT_LABEL,
  PLAYBACK_RESULTS,
  type PlaybackResult,
  REQUEST_IN_PROGRESS,
  REQUEST_STATE_LABEL,
  REQUEST_STATES,
  type RequestState,
} from "../../lib/analytics-contracts";
import {
  attempts,
  bucketLabel,
  channelSummary,
  hourLabel,
  minutesLabel,
  type ParticipationRow,
  share,
  shortDate,
  stateTotal,
} from "../../lib/analytics-insights";
import { genreLabel } from "../../lib/format";

// ---------- Shared pieces ----------

export interface Kpi {
  label: string;
  value: string;
  note: string;
  tone?: "accent" | "warn";
}

/** One documented chart: title, question, scope, figures, plot and reading. */
export function ChartCard({
  id,
  title,
  question,
  scope,
  how,
  kpis,
  reading,
  wide = false,
  table,
  note,
  children,
}: {
  id: string;
  title: string;
  question: string;
  scope: string;
  how: string;
  kpis?: Kpi[];
  reading: string | null;
  wide?: boolean;
  table?: ReactNode;
  note?: ReactNode;
  children: ReactNode;
}) {
  return (
    <article
      className={`chart${wide ? " chart--wide" : ""}`}
      aria-labelledby={id}
    >
      <header className="chart__head">
        <h3 id={id} className="chart__title">
          {title}
        </h3>
        <p className="chart__question">{question}</p>
        <p className="chart__scope">{scope}</p>
      </header>
      {kpis && (
        <dl className="kpis">
          {kpis.map((kpi) => (
            <div key={kpi.label} className="kpi">
              <dt className="kpi__label">{kpi.label}</dt>
              <dd
                className={`kpi__value${kpi.tone ? ` kpi__value--${kpi.tone}` : ""}`}
              >
                {kpi.value}
              </dd>
              <dd className="kpi__note">{kpi.note}</dd>
            </div>
          ))}
        </dl>
      )}
      {note}
      <div className="chart__body">{children}</div>
      {reading && (
        <p className="reading">
          <span className="reading__label">Lectura</span> {reading}
        </p>
      )}
      <div className="chart__extras">
        {table && (
          <details className="chart__more">
            <summary>Ver como tabla</summary>
            <div className="table-wrap">{table}</div>
          </details>
        )}
        <details className="chart__more">
          <summary>Cómo se calcula</summary>
          <p className="chart__how">{how}</p>
        </details>
      </div>
    </article>
  );
}

function DataTable({
  caption,
  head,
  rows,
}: {
  caption: string;
  head: string[];
  rows: (string | number)[][];
}) {
  return (
    <table className="data-table">
      <caption>{caption}</caption>
      <thead>
        <tr>
          {head.map((cell) => (
            <th key={cell} scope="col">
              {cell}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={String(row[0])}>
            {row.map((cell, index) =>
              index === 0 ? (
                <th key={head[index]} scope="row">
                  {cell}
                </th>
              ) : (
                <td key={head[index]}>{cell}</td>
              ),
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Legend({
  items,
}: {
  items: { key: string; label: string; swatch: string; line?: boolean }[];
}) {
  return (
    // biome-ignore lint/a11y/noRedundantRoles: Safari drops list semantics with list-style none; the role restores them.
    // biome-ignore lint/a11y/useSemanticElements: it is a <ul>; the explicit role restores list semantics Safari drops with list-style none.
    <ul className="legend" role="list">
      {items.map((item) => (
        <li key={item.key} className="legend__item">
          <span
            className={`swatch${item.line ? " swatch--line" : ""}`}
            style={{ "--swatch": item.swatch } as CSSProperties}
            aria-hidden="true"
          />
          {item.label}
        </li>
      ))}
    </ul>
  );
}

/** Tooltip in the panel's own surface and type (values stay in text tokens). */
function TipBox({
  active,
  label,
  payload,
}: {
  active?: boolean;
  label?: ReactNode;
  payload?: readonly {
    name?: ReactNode;
    value?: ReactNode;
    color?: string;
    dataKey?: unknown;
  }[];
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="tip">
      {label !== undefined && <p className="tip__title">{label}</p>}
      {payload.map((item) => (
        <p key={String(item.dataKey)} className="tip__row">
          <span
            className="swatch"
            style={{ "--swatch": item.color } as CSSProperties}
            aria-hidden="true"
          />
          {item.name}: <strong>{item.value}</strong>
        </p>
      ))}
    </div>
  );
}

const AXIS = { fill: "var(--muted)", fontSize: 12 };
const LABEL = { fill: "var(--text)", fontSize: 12, fontWeight: 700 };

// ---------- 1 Participación por jornada ----------

export function ParticipationChart({ rows }: { rows: ParticipationRow[] }) {
  // Axis shows the month only where it changes, so eight dates fit a phone.
  const data = rows.map((row, index) => ({
    dia:
      index === 0 ||
      row.fechaOperativa.slice(0, 7) !==
        rows[index - 1].fechaOperativa.slice(0, 7)
        ? shortDate(row.fechaOperativa)
        : shortDate(row.fechaOperativa).split(" ")[0],
    ingresaron: row.ingresaron,
    activas: row.activas,
  }));
  return (
    <>
      <Legend
        items={[
          { key: "in", label: "Ingresaron", swatch: "var(--viz-base)" },
          {
            key: "act",
            label: "Activas (pidieron o votaron)",
            swatch: "var(--viz-1)",
          },
        ]}
      />
      <div className="plot plot--tall">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            margin={{ top: 22, right: 4, bottom: 0, left: 4 }}
            barGap={2}
            barCategoryGap="22%"
          >
            <CartesianGrid vertical={false} stroke="var(--hairline)" />
            <XAxis
              dataKey="dia"
              tick={AXIS}
              tickLine={false}
              axisLine={{ stroke: "var(--hairline)" }}
              interval={0}
            />
            <YAxis hide domain={[0, "dataMax"]} />
            <Tooltip
              cursor={{ fill: "var(--raised)", opacity: 0.6 }}
              content={<TipBox />}
            />
            <Bar
              dataKey="ingresaron"
              name="Ingresaron"
              fill="var(--viz-base)"
              radius={[4, 4, 0, 0]}
              isAnimationActive={false}
            >
              <LabelList dataKey="ingresaron" position="top" style={LABEL} />
            </Bar>
            <Bar
              dataKey="activas"
              name="Activas"
              fill="var(--viz-1)"
              radius={[4, 4, 0, 0]}
              isAnimationActive={false}
            >
              <LabelList dataKey="activas" position="top" style={LABEL} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </>
  );
}

export const participationTable = (rows: ParticipationRow[]) => (
  <DataTable
    caption="Participación por jornada"
    head={["Jornada", "Ingresaron", "Activas"]}
    rows={rows.map((r) => [
      shortDate(r.fechaOperativa),
      r.ingresaron,
      r.activas,
    ])}
  />
);

// ---------- 2 Canal de ingreso ----------

export function ChannelDonut({ canales }: { canales: Analitica["canales"] }) {
  const summary = channelSummary(canales);
  const slices = [
    {
      key: "WEB",
      label: "Web",
      count: summary.web.count,
      pct: summary.web.pct,
      note: "sin instalar nada",
      color: "var(--viz-1)",
    },
    {
      key: "ANDROID",
      label: "Android",
      count: summary.android.count,
      pct: summary.android.pct,
      note: "app instalada",
      color: "var(--viz-2)",
    },
  ];
  return (
    <div className="donut">
      <div className="donut__plot">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={slices.filter((s) => s.count > 0)}
              dataKey="count"
              nameKey="label"
              innerRadius="72%"
              outerRadius="100%"
              startAngle={90}
              endAngle={-270}
              paddingAngle={
                summary.web.count && summary.android.count ? 1.5 : 0
              }
              stroke="none"
              isAnimationActive={false}
            >
              {slices
                .filter((s) => s.count > 0)
                .map((s) => (
                  <Cell key={s.key} fill={s.color} />
                ))}
            </Pie>
            <Tooltip content={<TipBox />} />
          </PieChart>
        </ResponsiveContainer>
        <p className="donut__center">
          <span className="donut__total">{summary.total}</span>
          <span className="donut__unit">participaciones</span>
        </p>
      </div>
      {/* biome-ignore lint/a11y/noRedundantRoles: Safari drops list semantics with list-style none; the role restores them. */}
      {/* biome-ignore lint/a11y/useSemanticElements: it is a <ul>; the explicit role restores list semantics Safari drops with list-style none. */}
      <ul className="donut__legend" role="list">
        {slices.map((s) => (
          <li key={s.key} className="donut__entry">
            <span className="donut__name">
              <span
                className="swatch"
                style={{ "--swatch": s.color } as CSSProperties}
                aria-hidden="true"
              />
              {s.label}
            </span>
            <span className="donut__pct">{s.pct} %</span>
            <span className="donut__note">
              {s.count} · {s.note}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------- 3 Solicitudes y votos por hora ----------

export function HourlyChart({ porHora }: { porHora: Jornada["porHora"] }) {
  const data = porHora.map((h) => ({ ...h, label: hourLabel(h.hora) }));
  return (
    <>
      <Legend
        items={[
          {
            key: "s",
            label: "Solicitudes (número dentro de la barra)",
            swatch: "var(--viz-base)",
          },
          {
            key: "v",
            label: "Votos (línea)",
            swatch: "var(--viz-1)",
            line: true,
          },
        ]}
      />
      <div className="plot plot--tall">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={data}
            margin={{ top: 26, right: 12, bottom: 0, left: 12 }}
            barCategoryGap="8%"
          >
            <CartesianGrid vertical={false} stroke="var(--hairline)" />
            <XAxis
              dataKey="label"
              tick={AXIS}
              tickLine={false}
              axisLine={{ stroke: "var(--hairline)" }}
              interval={0}
            />
            <YAxis hide domain={[0, "dataMax"]} />
            <Tooltip
              cursor={{ fill: "var(--raised)", opacity: 0.6 }}
              content={<TipBox />}
            />
            <Bar
              dataKey="solicitudes"
              name="Solicitudes"
              fill="var(--viz-base)"
              radius={[4, 4, 0, 0]}
              isAnimationActive={false}
            >
              <LabelList
                dataKey="solicitudes"
                position="insideBottom"
                offset={10}
                style={LABEL}
              />
            </Bar>
            <Line
              dataKey="votos"
              name="Votos"
              type="linear"
              stroke="var(--viz-1)"
              strokeWidth={2}
              dot={{
                r: 4,
                fill: "var(--viz-1)",
                stroke: "var(--surface)",
                strokeWidth: 2,
              }}
              activeDot={{ r: 6 }}
              isAnimationActive={false}
            >
              <LabelList
                dataKey="votos"
                position="top"
                offset={10}
                style={LABEL}
              />
            </Line>
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </>
  );
}

export const hourlyTable = (porHora: Jornada["porHora"]) => (
  <DataTable
    caption="Solicitudes y votos por hora"
    head={["Hora", "Solicitudes", "Votos"]}
    rows={porHora.map((h) => [hourLabel(h.hora), h.solicitudes, h.votos])}
  />
);

// ---------- 4 Ranking de popularidad ----------

export function RankingBars({ ranking }: { ranking: Analitica["ranking"] }) {
  const max = Math.max(0, ...ranking.map((r) => r.votos));
  return (
    // biome-ignore lint/a11y/noRedundantRoles: Safari drops list semantics with list-style none; the role restores them.
    // biome-ignore lint/a11y/useSemanticElements: it is an <ol>; the explicit role restores list semantics Safari drops with list-style none.
    <ol className="hbars" role="list">
      {ranking.map((item, index) => {
        const genre = genreLabel(item.cancion.genero);
        return (
          <li key={item.cancion.videoId} className="hbar">
            <span className="hbar__pos" aria-hidden="true">
              {index + 1}
            </span>
            <span className="hbar__name">
              <span className="hbar__title">
                <span className="sr-only">{index + 1}. </span>
                {item.cancion.titulo}
              </span>
              <span className="hbar__meta">
                {item.cancion.artista}
                {genre ? ` · ${genre}` : ""}
              </span>
            </span>
            <span className="hbar__track" aria-hidden="true">
              <span
                className="hbar__fill"
                style={
                  {
                    "--share": `${barShare(item.votos, max)}%`,
                  } as CSSProperties
                }
              />
            </span>
            <span className="hbar__value">
              {item.votos}
              <span className="sr-only"> votos</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

// ---------- States (charts 5, 6 and 8) ----------

const progress = (state: RequestState) => REQUEST_IN_PROGRESS.includes(state);

/** Every request state with its count, final ones apart from those in progress. */
export function StateCards({
  estados,
  compact = false,
}: {
  estados: Record<RequestState, number>;
  compact?: boolean;
}) {
  const total = stateTotal(estados);
  const group = (title: string, states: readonly RequestState[]) => (
    <div className="states__group">
      <p className="states__title">{title}</p>
      {/* biome-ignore lint/a11y/noRedundantRoles: Safari drops list semantics with list-style none; the role restores them. */}
      {/* biome-ignore lint/a11y/useSemanticElements: it is a <ul>; the explicit role restores list semantics Safari drops with list-style none. */}
      <ul className={`states${compact ? " states--compact" : ""}`} role="list">
        {states.map((state) => (
          <li
            key={state}
            className={`state${estados[state] === 0 ? " state--zero" : ""}`}
            data-key={state}
          >
            <span className="state__name">
              <span
                className={`swatch swatch--${state.toLowerCase()}`}
                aria-hidden="true"
              />
              {REQUEST_STATE_LABEL[state]}
            </span>
            <span className="state__count">{estados[state]}</span>
            {!compact && (
              <span className="state__pct">
                {share(estados[state], total)} %
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
  return (
    <div className="states__wrap">
      {group(
        "Finales",
        REQUEST_STATES.filter((s) => !progress(s)),
      )}
      {group("En curso, puede cambiar", REQUEST_IN_PROGRESS)}
    </div>
  );
}

export function StateStack({
  estados,
}: {
  estados: Record<RequestState, number>;
}) {
  const total = stateTotal(estados);
  return (
    <div className="statebar" aria-hidden="true">
      {REQUEST_STATES.filter((state) => estados[state] > 0).map((state) => (
        <span
          key={state}
          className="statebar__seg"
          data-state={state}
          data-progress={String(progress(state))}
          style={{ flexGrow: estados[state] } as CSSProperties}
          title={`${REQUEST_STATE_LABEL[state]}: ${estados[state]} (${share(estados[state], total)} %)`}
        />
      ))}
    </div>
  );
}

// ---------- 5 Embudo ----------

export function Funnel({ embudo }: { embudo: Jornada["embudo"] }) {
  const steps = [
    {
      key: "creadas",
      label: "Creadas",
      detail: "Todas las solicitudes de la jornada",
      value: embudo.creadas,
    },
    {
      key: "iniciadas",
      label: "Iniciadas",
      detail: "Empezaron a sonar al menos una vez",
      value: embudo.iniciadas,
    },
    {
      key: "completadas",
      label: "Completadas",
      detail: "Atendidas y reproducidas completas",
      value: embudo.completadas,
    },
  ];
  return (
    // biome-ignore lint/a11y/noRedundantRoles: Safari drops list semantics with list-style none; the role restores them.
    // biome-ignore lint/a11y/useSemanticElements: it is an <ol>; the explicit role restores list semantics Safari drops with list-style none.
    <ol className="funnel" role="list">
      {steps.map((step) => (
        <li key={step.key} className={`funnel__step funnel__step--${step.key}`}>
          <span className="funnel__name">
            <span className="funnel__label">{step.label}</span>
            <span className="funnel__detail">{step.detail}</span>
          </span>
          <span className="funnel__track" aria-hidden="true">
            <span
              className="funnel__fill"
              style={
                {
                  "--share": `${embudo.creadas ? Math.max(2, (step.value / embudo.creadas) * 100) : 0}%`,
                } as CSSProperties
              }
            />
          </span>
          <span className="funnel__value">
            <span className="funnel__count">{step.value}</span>
            <span className="funnel__pct">
              {share(step.value, embudo.creadas)} % de creadas
            </span>
          </span>
        </li>
      ))}
    </ol>
  );
}

// ---------- 7 Espera ----------

export function WaitHistogram({ espera }: { espera: Jornada["espera"] }) {
  const median = espera.medianaS === null ? null : espera.medianaS / 60;
  const p95 = espera.p95S === null ? null : espera.p95S / 60;
  const holds = (
    b: Jornada["espera"]["tramos"][number],
    value: number | null,
  ) =>
    value !== null &&
    value >= b.desdeMin &&
    (b.hastaMin === null || value < b.hastaMin);
  const data = espera.tramos.map((b) => ({
    label: bucketLabel(b).replace(" min", ""),
    total: b.total,
    mark: [holds(b, median) ? "mediana" : "", holds(b, p95) ? "p95" : ""]
      .filter(Boolean)
      .join(" y "),
  }));
  const Tick = ({
    x,
    y,
    payload,
  }: {
    x?: number;
    y?: number;
    payload?: { value: string; index: number };
  }) => (
    <g transform={`translate(${x ?? 0},${y ?? 0})`}>
      <text dy={14} textAnchor="middle" fill="var(--muted)" fontSize={12}>
        {payload?.value}
      </text>
      {payload && data[payload.index]?.mark && (
        <text
          dy={30}
          textAnchor="middle"
          fill="var(--accent-text)"
          fontSize={12}
          fontWeight={700}
        >
          {data[payload.index].mark}
        </text>
      )}
    </g>
  );
  return (
    <figure className="plot plot--tall plot--captioned">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          margin={{ top: 22, right: 4, bottom: 18, left: 4 }}
          barCategoryGap="6%"
        >
          <CartesianGrid vertical={false} stroke="var(--hairline)" />
          <XAxis
            dataKey="label"
            tick={<Tick />}
            tickLine={false}
            axisLine={{ stroke: "var(--hairline)" }}
            interval={0}
          />
          <YAxis hide domain={[0, "dataMax"]} />
          <Tooltip
            cursor={{ fill: "var(--raised)", opacity: 0.6 }}
            content={<TipBox />}
          />
          <Bar
            dataKey="total"
            name="Solicitudes"
            fill="var(--viz-1)"
            radius={[4, 4, 0, 0]}
            isAnimationActive={false}
          >
            <LabelList dataKey="total" position="top" style={LABEL} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <figcaption className="plot__caption">
        Minutos de espera hasta que empieza a sonar
      </figcaption>
    </figure>
  );
}

export const waitTable = (espera: Jornada["espera"]) => (
  <DataTable
    caption="Espera hasta que suena, solicitudes iniciadas"
    head={["Espera", "Solicitudes"]}
    rows={espera.tramos.map((b) => [bucketLabel(b), b.total])}
  />
);
export const waitValue = (seconds: number | null) =>
  seconds === null ? "Sin datos" : minutesLabel(seconds);

// ---------- 8 Intentos por origen ----------

const RESULT_CLASS: Record<PlaybackResult, string> = {
  completadas: "done",
  saltadas: "skip",
  fallidas: "fail",
  interrumpidas: "cut",
  enCurso: "playing",
};

export function PlaybackBars({ rows }: { rows: Jornada["reproducciones"] }) {
  const max = Math.max(0, ...rows.map(attempts));
  return (
    <>
      <Legend
        items={PLAYBACK_RESULTS.map((key) => ({
          key,
          label: PLAYBACK_RESULT_LABEL[key],
          swatch: `var(--pb-${RESULT_CLASS[key]})`,
        }))}
      />
      {/* biome-ignore lint/a11y/noRedundantRoles: Safari drops list semantics with list-style none; the role restores them. */}
      {/* biome-ignore lint/a11y/useSemanticElements: it is a <ul>; the explicit role restores list semantics Safari drops with list-style none. */}
      <ul className="origins" role="list">
        {rows.map((row) => {
          const total = attempts(row);
          return (
            <li key={row.origen} className="origin">
              <span className="origin__name">
                {PLAYBACK_ORIGIN_LABEL[row.origen]}
              </span>
              <span className="origin__track">
                {total === 0 ? (
                  <span className="origin__none">Sin intentos</span>
                ) : (
                  <span
                    className="origin__bar"
                    style={
                      { "--share": `${(total / max) * 100}%` } as CSSProperties
                    }
                  >
                    {PLAYBACK_RESULTS.filter((key) => row[key] > 0).map(
                      (key) => (
                        <span
                          key={key}
                          className={`origin__seg origin__seg--${RESULT_CLASS[key]}`}
                          data-result={key}
                          style={{ flexGrow: row[key] } as CSSProperties}
                          title={`${PLAYBACK_RESULT_LABEL[key]}: ${row[key]}`}
                        >
                          <span className="origin__n">{row[key]}</span>
                        </span>
                      ),
                    )}
                  </span>
                )}
              </span>
              <span className="origin__total">
                {total}
                <span className="sr-only"> intentos</span>
              </span>
            </li>
          );
        })}
      </ul>
    </>
  );
}

export const playbackTable = (rows: Jornada["reproducciones"]) => (
  <DataTable
    caption="Intentos de reproducción por origen y resultado"
    head={[
      "Origen",
      ...PLAYBACK_RESULTS.map((k) => PLAYBACK_RESULT_LABEL[k]),
      "Total",
    ]}
    rows={rows.map((r) => [
      PLAYBACK_ORIGIN_LABEL[r.origen],
      ...PLAYBACK_RESULTS.map((k) => r[k]),
      attempts(r),
    ])}
  />
);

// ---------- 10 Más votadas vs. más reproducidas ----------

export function Butterfly({ ranking }: { ranking: Analitica["ranking"] }) {
  const maxVotes = Math.max(0, ...ranking.map((r) => r.votos));
  const maxDone = Math.max(0, ...ranking.map((r) => r.completadas));
  return (
    <div className="fly">
      <p className="fly__head" aria-hidden="true">
        <span className="fly__side fly__side--left">Votos</span>
        <span className="fly__side fly__side--right">Veces completada</span>
      </p>
      {/* biome-ignore lint/a11y/noRedundantRoles: Safari drops list semantics with list-style none; the role restores them. */}
      {/* biome-ignore lint/a11y/useSemanticElements: it is a <ul>; the explicit role restores list semantics Safari drops with list-style none. */}
      <ul className="fly__rows" role="list">
        {ranking.map((item) => (
          <li key={item.cancion.videoId} className="fly__row">
            <span className="fly__title">{item.cancion.titulo}</span>
            <span className="fly__left">
              <span className="fly__value">
                {item.votos}
                <span className="sr-only"> votos</span>
              </span>
              <span
                className="fly__bar fly__bar--votes"
                aria-hidden="true"
                style={
                  {
                    "--share": `${barShare(item.votos, maxVotes)}%`,
                  } as CSSProperties
                }
              />
            </span>
            <span className="fly__right">
              <span
                className="fly__bar fly__bar--done"
                aria-hidden="true"
                style={
                  {
                    "--share": `${barShare(item.completadas, maxDone)}%`,
                  } as CSSProperties
                }
              />
              <span className="fly__value">
                {item.completadas}
                <span className="sr-only">
                  {item.completadas === 1
                    ? " vez completada"
                    : " veces completada"}
                </span>
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export const rankingTable = (ranking: Analitica["ranking"]) => (
  <DataTable
    caption="Canciones más votadas y veces completadas"
    head={["Canción", "Artista", "Votos", "Veces completada"]}
    rows={ranking.map((r) => [
      r.cancion.titulo,
      r.cancion.artista,
      r.votos,
      r.completadas,
    ])}
  />
);

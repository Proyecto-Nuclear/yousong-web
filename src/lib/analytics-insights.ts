// Pure computations behind the ten analytics charts: KPI figures, labels and
// the "Lectura" sentence of each chart. Every reading is derived from the
// data; a reading is null when the data cannot support it.
import type {
  Analitica,
  GenreCell,
  Jornada,
  PlaybackRow,
  RequestState,
  WaitBucket,
} from "./analytics-contracts";

const NUMBER = new Intl.NumberFormat("es", { maximumFractionDigits: 1 });
/** Spanish number with decimal comma: 35.625 -> "35,6". */
export const decimal = (value: number) => NUMBER.format(value);
/** Rounded percentage of a part; 0 when the whole is 0. */
export const share = (part: number, whole: number) =>
  whole > 0 ? Math.round((part / whole) * 100) : 0;
export const percent = (value: number) => `${Math.round(value)} %`;

const WEEKDAY = [
  "domingo",
  "lunes",
  "martes",
  "miércoles",
  "jueves",
  "viernes",
  "sábado",
];
const WEEKDAY_PLURAL = [
  "domingos",
  "lunes",
  "martes",
  "miércoles",
  "jueves",
  "viernes",
  "sábados",
];
const WEEKDAY_SHORT = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const MONTH = [
  "ene",
  "feb",
  "mar",
  "abr",
  "may",
  "jun",
  "jul",
  "ago",
  "sept",
  "oct",
  "nov",
  "dic",
];

function parts(operatingDate: string) {
  const date = new Date(`${operatingDate}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  return {
    weekday: date.getUTCDay(),
    day: date.getUTCDate(),
    month: date.getUTCMonth(),
  };
}
/** "2025-11-21" -> "21 nov". */
export function shortDate(operatingDate: string) {
  const p = parts(operatingDate);
  return p ? `${p.day} ${MONTH[p.month]}` : operatingDate;
}
/** "2025-11-21" -> "vie 21 nov" (axis and layer labels). */
export function nightTag(operatingDate: string) {
  const p = parts(operatingDate);
  return p ? `${WEEKDAY_SHORT[p.weekday]} ${shortDate(operatingDate)}` : "";
}
/** "2025-11-08" -> "sábado 8 nov" (reading sentences). */
export function nightLong(operatingDate: string) {
  const p = parts(operatingDate);
  return p ? `${WEEKDAY[p.weekday]} ${shortDate(operatingDate)}` : "";
}

/** 20 -> "8 p. m.", 0 -> "12 a. m.", 12 -> "12 p. m.". */
export function hourLabel(hour: number) {
  const h = ((hour % 24) + 24) % 24;
  return `${h % 12 || 12} ${h < 12 ? "a. m." : "p. m."}`;
}
/** Sort key of an hour within a night: noon first, crossing midnight. */
export const nightOrder = (hour: number) => (hour + 12) % 24;

/** Wall-clock time of an instant in the venue time zone: "11:45 p. m.". */
export function clockLabel(iso: string, timeZone?: string) {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "";
  let fields: Intl.DateTimeFormatPart[];
  try {
    fields = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour: "numeric",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(at);
  } catch {
    return "";
  }
  const pick = (type: string) =>
    Number(fields.find((part) => part.type === type)?.value ?? 0);
  const h = pick("hour") % 24;
  const m = String(pick("minute")).padStart(2, "0");
  return `${h % 12 || 12}:${m} ${h < 12 ? "a. m." : "p. m."}`;
}

/** Seconds as whole minutes for wait figures. */
export const minutes = (seconds: number) => Math.round(seconds / 60);
export const minutesLabel = (seconds: number) => `${minutes(seconds)} min`;

export function bucketLabel(bucket: WaitBucket) {
  return bucket.hastaMin === null
    ? `${bucket.desdeMin}+ min`
    : `${bucket.desdeMin}–${bucket.hastaMin} min`;
}

const times = (count: number) => (count === 1 ? "1 vez" : `${count} veces`);
const ORDINAL = [
  "primera",
  "segunda",
  "tercera",
  "cuarta",
  "quinta",
  "sexta",
  "séptima",
  "octava",
];

// ---------- 1 Participación por jornada ----------

export interface ParticipationRow {
  sesionId: string;
  fechaOperativa: string;
  ingresaron: number;
  activas: number;
}
/** Published nights (oldest first) joined with their participation. */
export function participationRows(data: Analitica): ParticipationRow[] {
  const byId = new Map(data.participacion.map((p) => [p.sesionId, p]));
  return data.jornadas.map((night) => ({
    ...night,
    ingresaron: byId.get(night.sesionId)?.ingresaron ?? 0,
    activas: byId.get(night.sesionId)?.activas ?? 0,
  }));
}

export function participationSummary(rows: ParticipationRow[]) {
  if (!rows.length) return null;
  const ingresaron = rows.reduce((sum, row) => sum + row.ingresaron, 0);
  const activas = rows.reduce((sum, row) => sum + row.activas, 0);
  const peak = rows.reduce((best, row) =>
    row.ingresaron > best.ingresaron ? row : best,
  );
  return {
    promedio: ingresaron / rows.length,
    ingresaron,
    activas,
    activasPct: share(activas, ingresaron),
    pico: peak,
  };
}

/** "los sábados superan a los viernes" when two weekdays repeat enough. */
function weekdayComparison(rows: ParticipationRow[]) {
  const groups = new Map<number, number[]>();
  for (const row of rows) {
    const p = parts(row.fechaOperativa);
    if (p)
      groups.set(p.weekday, [...(groups.get(p.weekday) ?? []), row.ingresaron]);
  }
  const means = [...groups]
    .filter(([, values]) => values.length >= 2)
    .map(([day, values]) => ({
      day,
      mean: values.reduce((a, b) => a + b, 0) / values.length,
    }))
    .sort((a, b) => b.mean - a.mean);
  if (means.length < 2 || means[0].mean === means[1].mean) return null;
  return `los ${WEEKDAY_PLURAL[means[0].day]} superan a los ${WEEKDAY_PLURAL[means[1].day]}`;
}

export function participationReading(rows: ParticipationRow[]) {
  const summary = participationSummary(rows);
  if (!summary || summary.ingresaron === 0) return null;
  const peak = `El pico fue el ${nightLong(summary.pico.fechaOperativa)} (${summary.pico.ingresaron} ingresos)`;
  const compare = weekdayComparison(rows);
  return `En promedio el ${summary.activasPct} % de quienes entran pide o vota. ${peak}${compare ? `; ${compare}` : ""}.`;
}

// ---------- 2 Canal de ingreso ----------

export function channelSummary(canales: { WEB: number; ANDROID: number }) {
  const total = canales.WEB + canales.ANDROID;
  return {
    total,
    web: { count: canales.WEB, pct: share(canales.WEB, total) },
    android: { count: canales.ANDROID, pct: share(canales.ANDROID, total) },
  };
}

export function channelReading(canales: { WEB: number; ANDROID: number }) {
  const { total, web, android } = channelSummary(canales);
  if (total === 0 || web.count === android.count) return null;
  const top = web.count > android.count ? web : android;
  const exact = (top.count / total) * 10;
  const tenths = Math.round(exact);
  const near =
    Math.abs(exact - tenths) < 0.05 ? "" : exact < tenths ? "Casi " : "Más de ";
  const lead = `${near}${tenths} de cada 10`;
  const sentence = near ? lead : lead.charAt(0).toUpperCase() + lead.slice(1);
  return top === web
    ? `${sentence} entran por la web sin instalar nada: mantener el acceso por QR sin instalación es clave.`
    : `${sentence} entran con la app Android instalada: la app ya es el canal principal del local.`;
}

// ---------- 3 Solicitudes y votos por hora ----------

export function hourlySummary(porHora: Jornada["porHora"]) {
  const solicitudes = porHora.reduce((sum, h) => sum + h.solicitudes, 0);
  const votos = porHora.reduce((sum, h) => sum + h.votos, 0);
  const peak = porHora.length
    ? porHora.reduce((best, h) => (h.votos > best.votos ? h : best))
    : null;
  return { solicitudes, votos, pico: peak && peak.votos > 0 ? peak : null };
}

export function hourlyReading(porHora: Jornada["porHora"]) {
  const { solicitudes, votos } = hourlySummary(porHora);
  if (porHora.length < 2 || votos === 0) return null;
  let best = -1;
  for (let i = 0; i < porHora.length - 1; i++) {
    const next = (porHora[i].hora + 1) % 24 === porHora[i + 1].hora;
    if (
      next &&
      (best < 0 ||
        porHora[i].votos + porHora[i + 1].votos >
          porHora[best].votos + porHora[best + 1].votos)
    )
      best = i;
  }
  if (best < 0) return null;
  const [a, b] = [porHora[best], porHora[best + 1]];
  const from = hourLabel(a.hora);
  const to = hourLabel(b.hora).replace(/^(\d+)/, "$1:59");
  const range =
    from.slice(-5) === to.slice(-5)
      ? `de ${from.replace(/ [ap]\. m\.$/, "")} a ${to}`
      : `de ${from} a ${to}`;
  return `El pico es ${range}: ahí entran ${a.solicitudes + b.solicitudes} de las ${solicitudes} solicitudes y ${a.votos + b.votos} de los ${votos} votos.`;
}

// ---------- 4 Ranking de popularidad ----------

export function rankingReading(ranking: Analitica["ranking"]) {
  if (!ranking.length) return null;
  const lead = "Es un ranking propio del local, no de YouTube.";
  const top = ranking.slice(0, 5);
  if (top.length < 5) return lead;
  const genres = new Map<string, { count: number; first: number }>();
  top.forEach((item, index) => {
    const genre = item.cancion.genero?.trim();
    if (!genre) return;
    const entry = genres.get(genre) ?? { count: 0, first: index };
    genres.set(genre, { ...entry, count: entry.count + 1 });
  });
  const sorted = [...genres].sort(
    (a, b) => b[1].count - a[1].count || a[1].first - b[1].first,
  );
  if (!sorted.length || sorted[0][1].count < 2) return lead;
  if (sorted[0][1].count >= 3 || sorted.length === 1)
    return `${lead} ${sorted[0][0]} ocupa ${sorted[0][1].count} de los 5 primeros puestos.`;
  const pair = sorted[0][1].count + sorted[1][1].count;
  const names = [sorted[0], sorted[1]]
    .sort((a, b) => a[1].first - b[1].first)
    .map(([name]) => name);
  return `${lead} ${names[0]} y ${names[1].toLowerCase()} ocupan ${pair} de los 5 primeros puestos.`;
}

// ---------- 5 De la solicitud a la canción completada ----------

export function funnelReading(jornada: Jornada) {
  const { creadas, iniciadas, completadas } = jornada.embudo;
  if (creadas === 0) return null;
  const head = `${iniciadas} de ${creadas} solicitudes empezaron a sonar y ${completadas} terminaron completas (${share(completadas, creadas)} %).`;
  const gap = iniciadas - completadas;
  if (gap <= 0) return head;
  const playing = Math.min(gap, jornada.estados.REPRODUCIENDO);
  const rest = gap - playing;
  const skipped = Math.min(rest, jornada.estados.SALTADA);
  const pieces: string[] = [];
  if (playing)
    pieces.push(
      playing === 1 ? "1 sigue sonando" : `${playing} siguen sonando`,
    );
  if (skipped)
    pieces.push(
      skipped === 1
        ? "1 se saltó después de iniciar"
        : `${skipped} se saltaron después de iniciar`,
    );
  if (rest - skipped > 0)
    pieces.push(`${rest - skipped} no terminaron por falla o cierre`);
  if (pieces.length === 1 && skipped === gap)
    return `${head} ${gap === 1 ? "La 1 de diferencia se saltó" : `Las ${gap} de diferencia se saltaron`} después de iniciar.`;
  return `${head} De las ${gap} de diferencia, ${joinList(pieces)}.`;
}

function joinList(items: string[]) {
  return items.length < 2
    ? (items[0] ?? "")
    : `${items.slice(0, -1).join(", ")} y ${items.at(-1)}`;
}

// ---------- 6 Cómo terminaron las solicitudes ----------

export function stateTotal(estados: Record<RequestState, number>) {
  return Object.values(estados).reduce((sum, value) => sum + value, 0);
}

export function statesReading(jornada: Jornada) {
  const total = stateTotal(jornada.estados);
  if (total === 0) return null;
  const e = jornada.estados;
  const waiting = e.PENDIENTE + e.RESERVADA;
  if (jornada.enVivo) {
    const served = `Van ${e.ATENDIDA} atendidas de ${total} (${share(e.ATENDIDA, total)} %)`;
    const now = [
      e.REPRODUCIENDO ? `${e.REPRODUCIENDO} sonando ahora` : "",
      waiting ? `${waiting} en espera` : "",
    ].filter(Boolean);
    return now.length
      ? `${served}; ${joinList(now)}.`
      : `${served}; no queda ninguna en espera.`;
  }
  if (e.NO_ATENDIDA_CIERRE === 0)
    return `Todas las solicitudes tuvieron respuesta antes del cierre: ${e.ATENDIDA} de ${total} sonaron (${share(e.ATENDIDA, total)} %).`;
  const unserved = e.NO_ATENDIDA_CIERRE;
  return `${unserved} ${unserved === 1 ? "solicitud quedó" : "solicitudes quedaron"} sin sonar al cierre (${share(unserved, total)} %): son la primera pista para ajustar la lista por defecto o la hora de cierre.`;
}

// ---------- 7 Espera real hasta que suena ----------

export function waitReading(jornada: Jornada) {
  const { medianaS, p95S, pendientes, antiguedadMedianaPendientesS } =
    jornada.espera;
  if (medianaS === null) return null;
  let text = `La mitad espera ${minutes(medianaS)} ${minutes(medianaS) === 1 ? "minuto" : "minutos"} o menos`;
  text +=
    p95S === null
      ? "."
      : `; el 95 % espera hasta ${minutes(p95S)} ${minutes(p95S) === 1 ? "minuto" : "minutos"}.`;
  if (pendientes > 0) {
    const age =
      antiguedadMedianaPendientesS === null
        ? ""
        : ` con ${minutes(antiguedadMedianaPendientesS)} minutos de antigüedad mediana`;
    text += jornada.enVivo
      ? ` Ahora ${pendientes === 1 ? "hay 1 pendiente" : `hay ${pendientes} pendientes`}${age}.`
      : ` Aparte ${pendientes === 1 ? "quedó 1 pendiente" : `quedaron ${pendientes} pendientes`} al cierre${age}.`;
  }
  return text;
}

// ---------- 8 Intentos de reproducción por origen ----------

export const attempts = (row: PlaybackRow) =>
  row.completadas +
  row.saltadas +
  row.fallidas +
  row.interrumpidas +
  row.enCurso;

export function playbackReading(jornada: Jornada) {
  const request = jornada.reproducciones.find((r) => r.origen === "SOLICITUD");
  const fallback = jornada.reproducciones.find((r) => r.origen === "DEFECTO");
  const sentences: string[] = [];
  const failed = jornada.estados.FALLIDA;
  if (request && failed > 0 && request.fallidas > failed)
    sentences.push(
      `${failed === 1 ? "La solicitud fallida generó" : `Las ${failed} solicitudes fallidas generaron`} ${request.fallidas} intentos por los reintentos.`,
    );
  if (fallback && attempts(fallback) > 0)
    sentences.push(
      `La lista por defecto cubrió ${attempts(fallback) === 1 ? "1 momento" : `${attempts(fallback)} momentos`} de cola vacía.`,
    );
  if (!sentences.length && request && attempts(request) > 0)
    sentences.push(
      `${request.completadas} de ${attempts(request)} intentos de solicitudes terminaron completos.`,
    );
  return sentences.length ? sentences.join(" ") : null;
}

// ---------- 9 Géneros por hora de la noche (cubo) ----------

export interface CubeLayer {
  id: string;
  label: string;
  live: boolean;
  cells: GenreCell[];
}
export interface CubeModel {
  hours: number[];
  genres: string[];
  layers: CubeLayer[];
  max: number;
}

/**
 * Front layer is the session from /jornada; the published nights stack
 * behind it, newest first. A published night that is the front session is
 * not repeated.
 */
export function cubeModel(
  jornada: Jornada | null,
  history: Analitica["generosPorHora"],
): CubeModel {
  const layers: CubeLayer[] = [];
  if (jornada?.sesion)
    layers.push({
      id: jornada.sesion.id,
      label: nightTag(jornada.sesion.fechaOperativa),
      live: jornada.enVivo,
      cells: jornada.generosPorHora,
    });
  for (const night of [...history].reverse())
    if (night.sesionId !== jornada?.sesion?.id)
      layers.push({
        id: night.sesionId,
        label: nightTag(night.fechaOperativa),
        live: false,
        cells: night.celdas,
      });
  const totals = new Map<string, number>();
  const hours = new Set<number>();
  let max = 0;
  for (const layer of layers)
    for (const cell of layer.cells) {
      hours.add(cell.hora);
      totals.set(
        cell.genero,
        (totals.get(cell.genero) ?? 0) + (cell.porcentaje ?? 0),
      );
      max = Math.max(max, cell.porcentaje ?? 0);
    }
  const genres = [...totals]
    .sort(
      (a, b) =>
        Number(a[0] === "Sin género") - Number(b[0] === "Sin género") ||
        b[1] - a[1] ||
        a[0].localeCompare(b[0], "es"),
    )
    .map(([genre]) => genre);
  return {
    hours: [...hours].sort((a, b) => nightOrder(a) - nightOrder(b)),
    genres,
    layers,
    max,
  };
}

export function cellAt(layer: CubeLayer, genre: string, hour: number) {
  return layer.cells.find((c) => c.genero === genre && c.hora === hour) ?? null;
}

/** Text of one cube cell: "30 %", "< 5" when suppressed, "—" when empty. */
export function cellLabel(cell: GenreCell | null) {
  if (!cell) return "—";
  if (cell.suprimida) return "< 5";
  return `${decimal(cell.porcentaje ?? 0)} %`;
}

export function genreReading(layer: CubeLayer | undefined, hours: number[]) {
  if (!layer) return null;
  const own = hours.filter((h) => layer.cells.some((c) => c.hora === h));
  if (own.length < 3) return null;
  const leader = (hour: number) => {
    const visible = layer.cells.filter(
      (c) => c.hora === hour && !c.suprimida && (c.porcentaje ?? 0) > 0,
    );
    return visible.length
      ? visible.reduce((a, b) =>
          (b.porcentaje ?? 0) > (a.porcentaje ?? 0) ? b : a,
        )
      : null;
  };
  const first = leader(own[0]);
  const last = leader(own[own.length - 1]);
  if (!first || !last) return null;
  const close = `${decimal(last.porcentaje ?? 0)} % a la${last.hora % 12 === 1 ? "" : "s"} ${hourLabel(last.hora)}`;
  let text =
    first.genero === last.genero
      ? `${first.genero} domina de principio a fin (${close}).`
      : `${first.genero} abre la noche; ${last.genero.toLowerCase()} la cierra (${close}).`;
  const stable = [...new Set(layer.cells.map((c) => c.genero))]
    .map((genre) => {
      const values = own.map((h) => cellAt(layer, genre, h));
      if (values.some((c) => !c || c.suprimida)) return null;
      const shares = values.map((c) => c?.porcentaje ?? 0);
      return {
        genre,
        range: Math.max(...shares) - Math.min(...shares),
        min: Math.min(...shares),
      };
    })
    .filter(
      (g): g is { genre: string; range: number; min: number } =>
        !!g && g.min > 0 && g.range <= 12,
    )
    .sort((a, b) => a.range - b.range)[0];
  if (stable && stable.genre !== first.genero && stable.genre !== last.genero)
    text += ` ${stable.genre} se mantiene estable toda la jornada.`;
  return text;
}

// ---------- 10 Más votadas vs. más reproducidas ----------

export function versusReading(ranking: Analitica["ranking"]) {
  if (ranking.length < 3) return null;
  const byVotes = ranking.map((item, index) => ({ item, vote: index }));
  const completionOrder = [...byVotes].sort(
    (a, b) => b.item.completadas - a.item.completadas || a.vote - b.vote,
  );
  const ranked = byVotes.map((entry) => ({
    ...entry,
    done: completionOrder.indexOf(entry),
  }));
  const drop = [...ranked].sort(
    (a, b) => b.done - b.vote - (a.done - a.vote) || a.vote - b.vote,
  )[0];
  const gain = [...ranked].sort(
    (a, b) => a.done - a.vote - (b.done - b.vote) || a.vote - b.vote,
  )[0];
  const sentences: string[] = [];
  if (drop.done - drop.vote >= 2)
    sentences.push(
      `«${drop.item.cancion.titulo}» es la ${ORDINAL[drop.vote]} más votada pero solo se completó ${times(drop.item.completadas)}.`,
    );
  if (gain.vote - gain.done >= 2)
    sentences.push(
      `«${gain.item.cancion.titulo}» se completa más de lo que se vota.`,
    );
  return sentences.length
    ? sentences.join(" ")
    : "Las canciones más votadas son también las que más suenan completas.";
}

// ---------- Live indicator ----------

/** The live block polls only while the night is live and the tab is visible. */
export const shouldPoll = (live: boolean, visibility: string) =>
  live && visibility === "visible";
export const POLL_MS = 10_000;

export function liveLabel({
  live,
  updatedAt,
  now,
  failed,
}: {
  live: boolean;
  updatedAt: number;
  now: number;
  failed: boolean;
}) {
  const seconds = Math.max(0, Math.floor((now - updatedAt) / 1000));
  const ago = seconds < 60 ? `${seconds} s` : `${Math.floor(seconds / 60)} min`;
  if (failed) return `Sin conexión: mostrando datos de hace ${ago}`;
  return live ? `En vivo · actualizado hace ${ago}` : `Actualizado hace ${ago}`;
}

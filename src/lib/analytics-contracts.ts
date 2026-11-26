// Contracts of the owner analytics dashboard (published history and the
// live session). Guards are strict: a malformed payload never reaches a chart.
import { integer, isQueueSong, object, type QueueSong } from "./demo-contracts";

/** Session states a night can be in (same domain as the operation API). */
export const NIGHT_STATES = [
  "ABIERTA",
  "PAUSADA",
  "CERRANDO",
  "CERRADA",
] as const;
export type NightState = (typeof NIGHT_STATES)[number];

/** Request states in display order: final ones first, then in progress. */
export const REQUEST_STATES = [
  "ATENDIDA",
  "SALTADA",
  "NO_ATENDIDA_CIERRE",
  "FALLIDA",
  "BLOQUEADA",
  "REPRODUCIENDO",
  "RESERVADA",
  "PENDIENTE",
] as const;
export type RequestState = (typeof REQUEST_STATES)[number];
export const REQUEST_IN_PROGRESS: readonly RequestState[] = [
  "REPRODUCIENDO",
  "RESERVADA",
  "PENDIENTE",
];
export const REQUEST_STATE_LABEL: Record<RequestState, string> = {
  ATENDIDA: "Atendida",
  SALTADA: "Saltada",
  NO_ATENDIDA_CIERRE: "Sin sonar al cierre",
  FALLIDA: "Fallida",
  BLOQUEADA: "Bloqueada",
  REPRODUCIENDO: "Sonando ahora",
  RESERVADA: "Reservada",
  PENDIENTE: "Pendiente",
};

/** Playback outcomes in display order (the last one is still in progress). */
export const PLAYBACK_RESULTS = [
  "completadas",
  "saltadas",
  "fallidas",
  "interrumpidas",
  "enCurso",
] as const;
export type PlaybackResult = (typeof PLAYBACK_RESULTS)[number];
export const PLAYBACK_RESULT_LABEL: Record<PlaybackResult, string> = {
  completadas: "Completada",
  saltadas: "Saltada",
  fallidas: "Fallida",
  interrumpidas: "Interrumpida al cierre",
  enCurso: "En curso",
};
export const PLAYBACK_ORIGINS = ["SOLICITUD", "DEFECTO"] as const;
export type PlaybackOriginKey = (typeof PLAYBACK_ORIGINS)[number];
export const PLAYBACK_ORIGIN_LABEL: Record<PlaybackOriginKey, string> = {
  SOLICITUD: "Solicitud",
  DEFECTO: "Lista por defecto",
};

export interface GenreCell {
  genero: string;
  hora: number;
  porcentaje: number | null;
  suprimida: boolean;
}
export interface Publication {
  version: number;
  publicadaAt: string;
  corteEventosAt: string;
}
export interface PublishedNight {
  sesionId: string;
  fechaOperativa: string;
}
export interface Analitica {
  publicacion: Publication | null;
  jornadas: PublishedNight[];
  participacion: { sesionId: string; ingresaron: number; activas: number }[];
  canales: { WEB: number; ANDROID: number };
  ranking: { cancion: QueueSong; votos: number; completadas: number }[];
  generosPorHora: {
    sesionId: string;
    fechaOperativa: string;
    diaSemana: number;
    celdas: GenreCell[];
  }[];
}
export interface WaitBucket {
  desdeMin: number;
  hastaMin: number | null;
  total: number;
}
export interface PlaybackRow {
  origen: PlaybackOriginKey;
  completadas: number;
  saltadas: number;
  fallidas: number;
  interrumpidas: number;
  enCurso: number;
}
export interface Jornada {
  sesion: { id: string; fechaOperativa: string; estado: NightState } | null;
  enVivo: boolean;
  corteAt: string;
  participacion: { ingresaron: number; activas: number };
  canales: { WEB: number; ANDROID: number };
  porHora: { hora: number; solicitudes: number; votos: number }[];
  embudo: { creadas: number; iniciadas: number; completadas: number };
  estados: Record<RequestState, number>;
  espera: {
    medianaS: number | null;
    p95S: number | null;
    iniciadas: number;
    tramos: WaitBucket[];
    pendientes: number;
    antiguedadMedianaPendientesS: number | null;
  };
  reproducciones: PlaybackRow[];
  generosPorHora: GenreCell[];
}

/** Published history spans 1..30 nights; the dashboard asks for 8. */
export const HISTORY_NIGHTS = 8;
export const nights = (value: unknown): value is number =>
  Number.isSafeInteger(value) && Number(value) >= 1 && Number(value) <= 30;
export const uuid = (value: unknown): value is string =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const isoDate = (value: unknown): value is string =>
  typeof value === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
const instant = (value: unknown): value is string =>
  typeof value === "string" &&
  value.length <= 40 &&
  !Number.isNaN(Date.parse(value));
const hour = (value: unknown): value is number =>
  Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) <= 23;
const nullableCount = (value: unknown) => value === null || integer(value);
const exactKeys = (value: Record<string, unknown>, keys: readonly string[]) =>
  Object.keys(value).length === keys.length &&
  keys.every((key) => key in value);
const list = <T>(
  value: unknown,
  max: number,
  item: (entry: unknown) => entry is T,
): value is T[] =>
  Array.isArray(value) && value.length <= max && value.every(item);

function isCell(value: unknown): value is GenreCell {
  return (
    object(value) &&
    typeof value.genero === "string" &&
    value.genero.trim().length > 0 &&
    value.genero.length <= 80 &&
    hour(value.hora) &&
    typeof value.suprimida === "boolean" &&
    (value.suprimida
      ? value.porcentaje === null
      : typeof value.porcentaje === "number" &&
        Number.isFinite(value.porcentaje) &&
        value.porcentaje >= 0 &&
        value.porcentaje <= 100)
  );
}
const cells = (value: unknown): value is GenreCell[] =>
  list(value, 24 * 40, isCell);
function isChannels(value: unknown): value is Analitica["canales"] {
  return (
    object(value) &&
    exactKeys(value, ["WEB", "ANDROID"]) &&
    integer(value.WEB) &&
    integer(value.ANDROID)
  );
}
function isPublication(value: unknown): value is Publication {
  return (
    object(value) &&
    integer(value.version) &&
    value.version > 0 &&
    instant(value.publicadaAt) &&
    instant(value.corteEventosAt)
  );
}

export function isAnalitica(value: unknown): value is Analitica {
  return (
    object(value) &&
    (value.publicacion === null || isPublication(value.publicacion)) &&
    list(
      value.jornadas,
      30,
      (j): j is PublishedNight =>
        object(j) && uuid(j.sesionId) && isoDate(j.fechaOperativa),
    ) &&
    list(
      value.participacion,
      30,
      (p): p is Analitica["participacion"][number] =>
        object(p) &&
        uuid(p.sesionId) &&
        integer(p.ingresaron) &&
        integer(p.activas) &&
        p.activas <= p.ingresaron,
    ) &&
    isChannels(value.canales) &&
    list(
      value.ranking,
      8,
      (r): r is Analitica["ranking"][number] =>
        object(r) &&
        isQueueSong(r.cancion) &&
        integer(r.votos) &&
        integer(r.completadas),
    ) &&
    list(
      value.generosPorHora,
      30,
      (g): g is Analitica["generosPorHora"][number] =>
        object(g) &&
        uuid(g.sesionId) &&
        isoDate(g.fechaOperativa) &&
        Number.isSafeInteger(g.diaSemana) &&
        Number(g.diaSemana) >= 1 &&
        Number(g.diaSemana) <= 7 &&
        cells(g.celdas),
    )
  );
}

function isPlaybackRows(value: unknown): value is PlaybackRow[] {
  return (
    Array.isArray(value) &&
    value.length === PLAYBACK_ORIGINS.length &&
    PLAYBACK_ORIGINS.every(
      (origin) => value.filter((row) => row?.origen === origin).length === 1,
    ) &&
    value.every(
      (row) =>
        object(row) && PLAYBACK_RESULTS.every((key) => integer(row[key])),
    )
  );
}

export function isJornada(value: unknown): value is Jornada {
  if (!object(value)) return false;
  const { sesion, espera, embudo, estados, participacion } = value;
  return (
    (sesion === null ||
      (object(sesion) &&
        uuid(sesion.id) &&
        isoDate(sesion.fechaOperativa) &&
        NIGHT_STATES.some((state) => state === sesion.estado))) &&
    typeof value.enVivo === "boolean" &&
    instant(value.corteAt) &&
    object(participacion) &&
    integer(participacion.ingresaron) &&
    integer(participacion.activas) &&
    isChannels(value.canales) &&
    list(
      value.porHora,
      24,
      (h): h is Jornada["porHora"][number] =>
        object(h) && hour(h.hora) && integer(h.solicitudes) && integer(h.votos),
    ) &&
    object(embudo) &&
    integer(embudo.creadas) &&
    integer(embudo.iniciadas) &&
    integer(embudo.completadas) &&
    embudo.iniciadas <= embudo.creadas &&
    embudo.completadas <= embudo.iniciadas &&
    object(estados) &&
    exactKeys(estados, REQUEST_STATES) &&
    REQUEST_STATES.every((state) => integer(estados[state])) &&
    object(espera) &&
    nullableCount(espera.medianaS) &&
    nullableCount(espera.p95S) &&
    integer(espera.iniciadas) &&
    integer(espera.pendientes) &&
    nullableCount(espera.antiguedadMedianaPendientesS) &&
    list(
      espera.tramos,
      24,
      (t): t is WaitBucket =>
        object(t) &&
        integer(t.desdeMin) &&
        (t.hastaMin === null ||
          (integer(t.hastaMin) && t.hastaMin > t.desdeMin)) &&
        integer(t.total),
    ) &&
    isPlaybackRows(value.reproducciones) &&
    cells(value.generosPorHora)
  );
}

import { isGenre, type Song } from "./admin-api";

export const ROTATION = {
  SEQUENTIAL: "SECUENCIAL",
  RANDOM: "ALEATORIA",
} as const;
export type Rotation = (typeof ROTATION)[keyof typeof ROTATION];
export const FINISH = {
  COMPLETED: "COMPLETADA",
  SKIPPED: "SALTADA",
  FAILED: "FALLIDA",
} as const;
export type Finish = (typeof FINISH)[keyof typeof FINISH];
export const SERVICE = {
  OPEN: "ABIERTO",
  PAUSED: "PAUSADO",
  CLOSED: "CERRADO",
  MAINTENANCE: "MANTENIMIENTO",
} as const;
export type Service = (typeof SERVICE)[keyof typeof SERVICE];
export interface CreateEstablishment {
  nombre: string;
  qrSlug?: string;
  zonaHoraria?: string;
}
export interface UpdateEstablishment {
  nombre?: string;
  zonaHoraria?: string;
  activo?: boolean;
}
export interface PublishList {
  nombre?: string;
  politicaRotacion?: Rotation;
  canciones: string[];
}
export interface ListSummary {
  id: string;
  nombre: string;
  version: number;
  politicaRotacion: Rotation;
  creadoAt: string;
  totalCanciones: number;
}
export interface ListSong {
  posicion: number;
  cancionId: string;
  youtubeVideoId: string;
  titulo: string | null;
  artista: string | null;
  artistaVerificado: boolean;
  canal: string | null;
  duracionSegundos: number | null;
  miniaturaUrl: string | null;
}
export interface DefaultList extends Omit<ListSummary, "totalCanciones"> {
  canciones: ListSong[];
}
export type QueueSong = Omit<Song, "canal">;
export interface QueueItem {
  solicitudId: string;
  posicion: number;
  votos: number;
  cancion: QueueSong;
  esperaEstimadaSegundos: number;
}
export interface Playing {
  solicitudId: string | null;
  cancion: QueueSong;
  iniciadaAt: string;
  restanteSegundos: number;
}
export interface Queue {
  colaVersion: number;
  estado: Service;
  enReproduccion: Playing | null;
  cola: QueueItem[];
}
export const PLAYBACK_ORIGIN = {
  REQUEST: "SOLICITUD",
  DEFAULT: "DEFECTO",
} as const;
export type PlaybackOrigin =
  (typeof PLAYBACK_ORIGIN)[keyof typeof PLAYBACK_ORIGIN];
export interface Availability {
  nombre: string;
  qrSlug: string;
  servicio: Service;
  puedeParticipar: boolean;
  proximaApertura?: string;
}
export interface Started {
  reproduccionId: string;
  origen: PlaybackOrigin;
  solicitudId: string | null;
  cancion: QueueSong;
  iniciadaAt: string;
  votos: number;
  colaVersion: number;
}
export interface Finished {
  reproduccionId: string;
  solicitudId: string | null;
  resultado: Finish;
  motivoCodigo: string | null;
  terminadaAt: string;
  colaVersion: number;
}
export const SUGGESTION = { SONG: "CANCION", QUERY: "BUSQUEDA" } as const;
export interface SongSuggestion {
  tipo: typeof SUGGESTION.SONG;
  texto: string;
  cancion: Song;
}
export interface QuerySuggestion {
  tipo: typeof SUGGESTION.QUERY;
  texto: string;
  cancion?: never;
}
export type Suggestion = SongSuggestion | QuerySuggestion;
export interface Suggestions {
  sugerencias: Suggestion[];
}

export function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
export const integer = (value: unknown): value is number =>
  Number.isSafeInteger(value) && Number(value) >= 0;
export const nullableText = (value: unknown): value is string | null =>
  value === null || typeof value === "string";
export const videoId = (value: unknown): value is string =>
  typeof value === "string" && /^[A-Za-z0-9_-]{11}$/.test(value);
export const slug = (value: unknown): value is string =>
  typeof value === "string" && /^[a-z0-9-]{3,80}$/.test(value);
const text = (value: unknown, max: number, nonblank = false) =>
  typeof value === "string" &&
  value.length <= max &&
  (!nonblank || value.trim().length > 0);
const fields = (value: Record<string, unknown>, allowed: string[]) =>
  Object.keys(value).every((key) => allowed.includes(key));
export const isRotation = (value: unknown): value is Rotation =>
  Object.values(ROTATION).some((item) => item === value);
export const isFinish = (value: unknown): value is Finish =>
  Object.values(FINISH).some((item) => item === value);
export function isCreate(value: unknown): value is CreateEstablishment {
  return (
    object(value) &&
    fields(value, ["nombre", "qrSlug", "zonaHoraria"]) &&
    text(value.nombre, 120, true) &&
    (value.qrSlug === undefined || slug(value.qrSlug)) &&
    (value.zonaHoraria === undefined || text(value.zonaHoraria, 64, true))
  );
}
export function isUpdate(value: unknown): value is UpdateEstablishment {
  return (
    object(value) &&
    Object.keys(value).length > 0 &&
    fields(value, ["nombre", "zonaHoraria", "activo"]) &&
    (value.nombre === undefined || text(value.nombre, 120, true)) &&
    (value.zonaHoraria === undefined || text(value.zonaHoraria, 64, true)) &&
    (value.activo === undefined || typeof value.activo === "boolean")
  );
}
export function isPublish(value: unknown): value is PublishList {
  return (
    object(value) &&
    fields(value, ["nombre", "politicaRotacion", "canciones"]) &&
    (value.nombre === undefined || text(value.nombre, 100)) &&
    (value.politicaRotacion === undefined ||
      isRotation(value.politicaRotacion)) &&
    Array.isArray(value.canciones) &&
    value.canciones.length >= 1 &&
    value.canciones.length <= 200 &&
    value.canciones.every(videoId) &&
    new Set(value.canciones).size === value.canciones.length
  );
}
export function isFinishBody(value: unknown): value is { resultado: Finish } {
  return (
    object(value) && fields(value, ["resultado"]) && isFinish(value.resultado)
  );
}
export function isQueueSong(value: unknown): value is QueueSong {
  return (
    object(value) &&
    videoId(value.videoId) &&
    typeof value.titulo === "string" &&
    typeof value.artista === "string" &&
    typeof value.artistaVerificado === "boolean" &&
    (value.duracionSegundos === null || integer(value.duracionSegundos)) &&
    nullableText(value.miniaturaUrl) &&
    isGenre(value.genero)
  );
}
export function isSong(value: unknown): value is Song {
  return (
    isQueueSong(value) && "canal" in value && typeof value.canal === "string"
  );
}
function listBase(
  value: unknown,
): value is Omit<ListSummary, "totalCanciones"> & Record<string, unknown> {
  return (
    object(value) &&
    typeof value.id === "string" &&
    typeof value.nombre === "string" &&
    integer(value.version) &&
    value.version > 0 &&
    isRotation(value.politicaRotacion) &&
    typeof value.creadoAt === "string"
  );
}
export function isSummary(value: unknown): value is ListSummary {
  return listBase(value) && integer(value.totalCanciones);
}
export function isList(value: unknown): value is DefaultList {
  return (
    listBase(value) &&
    Array.isArray(value.canciones) &&
    value.canciones.every(
      (item) =>
        object(item) &&
        integer(item.posicion) &&
        typeof item.cancionId === "string" &&
        videoId(item.youtubeVideoId) &&
        nullableText(item.titulo) &&
        nullableText(item.artista) &&
        typeof item.artistaVerificado === "boolean" &&
        nullableText(item.canal) &&
        (item.duracionSegundos === null || integer(item.duracionSegundos)) &&
        nullableText(item.miniaturaUrl),
    )
  );
}
export function isQueue(value: unknown): value is Queue {
  if (
    !object(value) ||
    !integer(value.colaVersion) ||
    !Object.values(SERVICE).some((state) => state === value.estado) ||
    !Array.isArray(value.cola)
  )
    return false;
  const playing = value.enReproduccion;
  return (
    (playing === null ||
      (object(playing) &&
        !("votado" in playing) &&
        nullableText(playing.solicitudId) &&
        isQueueSong(playing.cancion) &&
        typeof playing.iniciadaAt === "string" &&
        integer(playing.restanteSegundos))) &&
    value.cola.every(
      (item) =>
        object(item) &&
        !("votado" in item) &&
        typeof item.solicitudId === "string" &&
        integer(item.posicion) &&
        integer(item.votos) &&
        isQueueSong(item.cancion) &&
        integer(item.esperaEstimadaSegundos),
    )
  );
}
export function isAvailability(value: unknown): value is Availability {
  return (
    object(value) &&
    typeof value.nombre === "string" &&
    slug(value.qrSlug) &&
    Object.values(SERVICE).some((state) => state === value.servicio) &&
    typeof value.puedeParticipar === "boolean" &&
    (value.proximaApertura === undefined ||
      typeof value.proximaApertura === "string") &&
    !["token", "dispositivoToken", "seudonimo"].some((key) => key in value)
  );
}
export function isStarted(value: unknown): value is Started {
  return (
    object(value) &&
    typeof value.reproduccionId === "string" &&
    nullableText(value.solicitudId) &&
    isQueueSong(value.cancion) &&
    Object.values(PLAYBACK_ORIGIN).some((origin) => origin === value.origen) &&
    typeof value.iniciadaAt === "string" &&
    integer(value.votos) &&
    integer(value.colaVersion)
  );
}
export function isFinished(value: unknown): value is Finished {
  return (
    object(value) &&
    typeof value.reproduccionId === "string" &&
    nullableText(value.solicitudId) &&
    isFinish(value.resultado) &&
    nullableText(value.motivoCodigo) &&
    typeof value.terminadaAt === "string" &&
    integer(value.colaVersion)
  );
}
export function isSuggestions(value: unknown): value is Suggestions {
  return (
    object(value) &&
    Array.isArray(value.sugerencias) &&
    value.sugerencias.length <= 8 &&
    value.sugerencias.every(
      (item) =>
        object(item) &&
        typeof item.texto === "string" &&
        ((item.tipo === SUGGESTION.QUERY && item.cancion === undefined) ||
          (item.tipo === SUGGESTION.SONG && isSong(item.cancion))),
    )
  );
}

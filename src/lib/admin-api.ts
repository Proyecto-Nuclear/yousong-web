export interface Establishment {
  id: string;
  nombre: string;
  qrSlug: string;
  zonaHoraria: string;
  activo: boolean;
  pausado: boolean;
  enMantenimiento: boolean;
  creadoAt: string;
}
export const SESSION_STATE = {
  OPEN: "ABIERTA",
  PAUSED: "PAUSADA",
  CLOSING: "CERRANDO",
  CLOSED: "CERRADA",
} as const;
export type SessionState = (typeof SESSION_STATE)[keyof typeof SESSION_STATE];
export interface Session {
  id: string;
  establecimientoId: string;
  listaId: string;
  fechaOperativa: string;
  estado: SessionState;
  abiertaAt: string;
  cerradaAt: string | null;
}
export interface Closure {
  sesion: Session;
  pendientesAlCierre: number;
}
export interface Qr {
  url: string;
  svg: string;
}
export interface Song {
  videoId: string;
  titulo: string;
  artista: string;
  artistaVerificado: boolean;
  canal: string;
  duracionSegundos: number | null;
  miniaturaUrl: string | null;
  /**
   * Spanish genre label, null when unknown. Older backends omit the field;
   * readers treat a missing value exactly like null.
   */
  genero?: string | null;
}
/** Accepts a missing, null or bounded genre label (see Song.genero). */
export function isGenre(value: unknown): value is string | null | undefined {
  return (
    value === undefined ||
    value === null ||
    (typeof value === "string" && value.length <= 80)
  );
}
export interface SearchPage {
  resultados: Song[];
  siguientePagina: string | null;
}
type Transport = (url: string, options: RequestInit) => Promise<Response>;
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
function strings(value: Record<string, unknown>, keys: string[]) {
  return keys.every((key) => typeof value[key] === "string");
}
function isSession(value: unknown): value is Session {
  return (
    record(value) &&
    strings(value, [
      "id",
      "establecimientoId",
      "listaId",
      "fechaOperativa",
      "abiertaAt",
    ]) &&
    Object.values(SESSION_STATE).some((state) => state === value.estado) &&
    (value.cerradaAt === null || typeof value.cerradaAt === "string")
  );
}
export function checked<T>(
  value: unknown,
  guard: (value: unknown) => value is T,
): T {
  if (!guard(value))
    throw new Error("La API devolvió una respuesta no válida.");
  return value;
}
export function safeHttpUrl(value: string): string | null {
  try {
    const url = new URL(value);
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (
      (url.protocol !== "https:" && !(url.protocol === "http:" && local)) ||
      url.username ||
      url.password
    )
      return null;
    return url.href;
  } catch {
    return null;
  }
}
const ERROR_MESSAGES: Record<string, string> = {
  NO_DEFAULT_LIST:
    "Configura una lista predeterminada antes de abrir la sesión.",
  INVALID_BODY: "Revisa los datos de la operación.",
  BODY_TOO_LARGE: "Los datos superan el tamaño permitido.",
  UNSUPPORTED_MEDIA_TYPE: "El formato de los datos no es válido.",
  EMPTY_UPDATE: "Cambia al menos un dato del establecimiento.",
  SESSION_IN_PROGRESS:
    "Finaliza la sesión antes de desactivar el establecimiento.",
  QUEUE_EMPTY:
    "La cola y la lista predeterminada no tienen canciones disponibles.",
  NO_ESTABLISHMENT: "Esta cuenta todavía no tiene un establecimiento asociado.",
  ESTABLISHMENT_ALREADY_EXISTS:
    "Esta cuenta ya tiene un establecimiento. Actualiza antes de crear.",
  SLUG_TAKEN: "El identificador QR ya está en uso.",
  INVALID_TIME_ZONE: "La zona horaria IANA no es válida.",
  ESTABLISHMENT_PAUSED: "El servicio del establecimiento está pausado.",
  ESTABLISHMENT_IN_MAINTENANCE: "El establecimiento está en mantenimiento.",
  SESSION_PAUSED: "La sesión está pausada. Reanúdala antes de participar.",
  SESSION_NOT_PAUSABLE:
    "Solo se puede pausar una sesión abierta. Actualiza el estado.",
  SESSION_NOT_PAUSED: "La sesión no está pausada. Actualiza el estado.",
  PLAYBACK_IN_PROGRESS:
    "Ya hay una reproducción de servidor en curso. Actualiza el estado.",
  NO_ACTIVE_PLAYBACK: "No hay una reproducción activa en el servidor.",
  CATALOG_NOT_CONFIGURED: "El catálogo no está configurado en el servidor.",
  CATALOG_QUOTA_EXCEEDED:
    "La cuota del catálogo está agotada. Inténtalo más tarde.",
  CATALOG_UNAVAILABLE: "El proveedor del catálogo no está disponible.",
  SEARCH_BUDGET_EXHAUSTED:
    "Se agotó el presupuesto de búsquedas del establecimiento.",
  SONG_UNAVAILABLE: "Una canción no está disponible en el catálogo.",
  RATE_LIMITED: "Demasiadas operaciones. Espera antes de volver a intentarlo.",
  SESSION_ALREADY_OPEN:
    "Ya existe una sesión en operación. Actualiza el estado.",
  SESSION_ALREADY_CLOSED: "La sesión ya está cerrada. Actualiza el estado.",
  ESTABLISHMENT_INACTIVE: "El establecimiento está inactivo.",
  INVALID_QUERY: "Escribe una búsqueda de 2 a 100 caracteres.",
  INVALID_PAGE: "La página de búsqueda no es válida.",
  INVALID_PERIOD: "El periodo debe estar entre 1 y 365 días.",
  NOT_FOUND: "No se encontró el establecimiento público.",
};
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
  ) {
    super(
      status === 401
        ? "Credencial no válida o caducada. Cierra la sesión y vuelve a iniciar sesión."
        : status === 403
          ? "No tienes permisos para esta operación en el backend."
          : (ERROR_MESSAGES[code] ??
            `La API rechazó la operación (HTTP ${status}).`),
    );
  }
}
export class AdminApi {
  constructor(
    private transport: Transport = (url, options) =>
      globalThis.fetch(url, options),
  ) {}
  protected async request(
    path: string,
    method = "GET",
    body?: unknown,
  ): Promise<unknown> {
    let response: Response;
    try {
      response = await this.transport(`/api/bff${path}`, {
        method,
        headers: {
          Accept: "application/json",
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        credentials: "same-origin",
        redirect: "error",
        cache: "no-store",
        signal: AbortSignal.timeout(20000),
      });
    } catch {
      throw new Error(
        "No se pudo conectar con la API. Revisa la red; el resultado de una operación puede ser incierto. Actualiza antes de repetirla.",
      );
    }
    const value: unknown = await response.json().catch(() => null);
    if (!response.ok)
      throw new ApiError(
        response.status,
        record(value) && typeof value.code === "string" ? value.code : "",
      );
    return value;
  }
  async establishments(): Promise<Establishment[]> {
    // The collection is only a UI compatibility shape (zero or one); the
    // backend resolves the account from JWT sub, never from a browser id.
    try {
      const value = checked(
        await this.request("/api/mi-establecimiento"),
        (e): e is Establishment =>
          record(e) &&
          strings(e, ["id", "nombre", "qrSlug", "zonaHoraria", "creadoAt"]) &&
          typeof e.activo === "boolean" &&
          typeof e.pausado === "boolean" &&
          typeof e.enMantenimiento === "boolean",
      );
      return [value];
    } catch (error) {
      if (
        error instanceof ApiError &&
        error.status === 404 &&
        error.code === "NO_ESTABLISHMENT"
      )
        return [];
      throw error;
    }
  }
  async currentSession(_scopeId: string): Promise<Session | null> {
    try {
      return checked(
        await this.request("/api/mi-establecimiento/sesion-actual"),
        isSession,
      );
    } catch (error) {
      if (
        error instanceof ApiError &&
        error.status === 404 &&
        error.code === "NO_ACTIVE_SESSION"
      )
        return null;
      throw error;
    }
  }
  async openSession(_scopeId: string): Promise<Session> {
    return checked(
      await this.request("/api/mi-establecimiento/sesiones", "POST"),
      isSession,
    );
  }
  async closeSession(_scopeId: string): Promise<Closure> {
    return checked(
      await this.request("/api/mi-establecimiento/sesion/cierre", "POST"),
      (v): v is Closure =>
        record(v) &&
        isSession(v.sesion) &&
        Number.isInteger(v.pendientesAlCierre) &&
        Number(v.pendientesAlCierre) >= 0,
    );
  }
  async qr(_scopeId: string): Promise<Qr> {
    return checked(
      await this.request("/api/mi-establecimiento/qr"),
      (v): v is Qr =>
        record(v) &&
        strings(v, ["url", "svg"]) &&
        safeHttpUrl(String(v.url)) !== null &&
        String(v.svg).trimStart().startsWith("<svg"),
    );
  }
  async pauseSession(): Promise<Session> {
    return checked(
      await this.request("/api/mi-establecimiento/sesion/pausa", "POST"),
      isSession,
    );
  }
  async resumeSession(): Promise<Session> {
    return checked(
      await this.request("/api/mi-establecimiento/sesion/reanudacion", "POST"),
      isSession,
    );
  }
  async search(query: string, page?: string): Promise<SearchPage> {
    const q = query.trim().replace(/\s+/g, " ");
    if (q.length < 2 || q.length > 100)
      throw new Error(ERROR_MESSAGES.INVALID_QUERY);
    if (page && !/^[A-Za-z0-9_=-]{1,100}$/.test(page))
      throw new Error(ERROR_MESSAGES.INVALID_PAGE);
    const params = new URLSearchParams({ q });
    if (page) params.set("pagina", page);
    return checked(
      await this.request(`/api/mi-establecimiento/catalogo/busqueda?${params}`),
      (v): v is SearchPage =>
        record(v) &&
        (v.siguientePagina === null || typeof v.siguientePagina === "string") &&
        Array.isArray(v.resultados) &&
        v.resultados.every(
          (s) =>
            record(s) &&
            strings(s, ["videoId", "titulo", "artista", "canal"]) &&
            typeof s.artistaVerificado === "boolean" &&
            (s.duracionSegundos === null ||
              (Number.isInteger(s.duracionSegundos) &&
                Number(s.duracionSegundos) >= 0)) &&
            (s.miniaturaUrl === null || typeof s.miniaturaUrl === "string") &&
            isGenre(s.genero),
        ),
    );
  }
}

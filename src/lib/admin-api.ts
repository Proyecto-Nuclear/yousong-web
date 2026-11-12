export interface Establishment {
  id: string;
  nombre: string;
  qrSlug: string;
  zonaHoraria: string;
  activo: boolean;
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
    "La cola está vacía. Primero se necesita una solicitud de participante.",
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
          ? "No tienes permisos para esta operación. Se requiere el rol correspondiente del backend."
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
    return checked(
      await this.request("/api/staff/establecimientos"),
      (v): v is Establishment[] =>
        Array.isArray(v) &&
        v.every(
          (e) =>
            record(e) &&
            strings(e, ["id", "nombre", "qrSlug", "zonaHoraria", "creadoAt"]) &&
            typeof e.activo === "boolean",
        ),
    );
  }
  async currentSession(id: string): Promise<Session | null> {
    try {
      return checked(
        await this.request(
          `/api/staff/establecimientos/${encodeURIComponent(id)}/sesion-actual`,
        ),
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
  async openSession(id: string): Promise<Session> {
    return checked(
      await this.request(
        `/api/admin/establecimientos/${encodeURIComponent(id)}/sesiones`,
        "POST",
      ),
      isSession,
    );
  }
  async closeSession(id: string): Promise<Closure> {
    return checked(
      await this.request(
        `/api/admin/sesiones/${encodeURIComponent(id)}/cierre`,
        "POST",
      ),
      (v): v is Closure =>
        record(v) &&
        isSession(v.sesion) &&
        Number.isInteger(v.pendientesAlCierre) &&
        Number(v.pendientesAlCierre) >= 0,
    );
  }
  async qr(id: string): Promise<Qr> {
    return checked(
      await this.request(
        `/api/admin/establecimientos/${encodeURIComponent(id)}/qr`,
      ),
      (v): v is Qr =>
        record(v) &&
        strings(v, ["url", "svg"]) &&
        safeHttpUrl(String(v.url)) !== null &&
        String(v.svg).trimStart().startsWith("<svg"),
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
      await this.request(`/api/staff/catalogo/busqueda?${params}`),
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
            (s.miniaturaUrl === null || typeof s.miniaturaUrl === "string"),
        ),
    );
  }
}

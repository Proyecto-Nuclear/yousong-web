import { AdminApi, ApiError, checked, type Establishment } from "./admin-api";
import {
  type Analitica,
  isAnalitica,
  isJornada,
  type Jornada,
  nights,
  uuid,
} from "./analytics-contracts";
import {
  type Availability,
  type DefaultList,
  type Finished,
  type Highlights,
  isAvailability,
  isCreate,
  isFinishBody,
  isFinished,
  isHighlights,
  isList,
  isPublish,
  isQueue,
  isStarted,
  isSuggestions,
  isSummary,
  isTrends,
  isUpdate,
  type ListSummary,
  object,
  period,
  type Queue,
  type Started,
  type Suggestions,
  slug,
  type Trends,
} from "./demo-contracts";

function establishment(value: unknown): value is Establishment {
  return (
    object(value) &&
    ["id", "nombre", "qrSlug", "zonaHoraria", "creadoAt"].every(
      (key) => typeof value[key] === "string",
    ) &&
    typeof value.activo === "boolean" &&
    typeof value.pausado === "boolean" &&
    typeof value.enMantenimiento === "boolean"
  );
}
function input<T>(value: unknown, guard: (value: unknown) => value is T): T {
  if (!guard(value)) throw new Error("Revisa los datos de la operación.");
  return value;
}
function query(text: string) {
  const q = text.trim().replace(/\s+/g, " ");
  if (q.length < 2 || q.length > 100)
    throw new Error("Escribe una búsqueda de 2 a 100 caracteres.");
  return new URLSearchParams({ q });
}
const encoded = encodeURIComponent;
export class DemoApi extends AdminApi {
  async createEstablishment(value: unknown): Promise<Establishment> {
    return checked(
      await this.request(
        "/api/mi-establecimiento",
        "POST",
        input(value, isCreate),
      ),
      establishment,
    );
  }
  async updateEstablishment(
    _scopeId: string,
    value: unknown,
  ): Promise<Establishment> {
    return checked(
      await this.request(
        "/api/mi-establecimiento",
        "PATCH",
        input(value, isUpdate),
      ),
      establishment,
    );
  }
  async publishList(_scopeId: string, value: unknown): Promise<DefaultList> {
    return checked(
      await this.request(
        "/api/mi-establecimiento/lista-defecto",
        "PUT",
        input(value, isPublish),
      ),
      isList,
    );
  }
  async currentList(_scopeId: string): Promise<DefaultList | null> {
    try {
      return checked(
        await this.request("/api/mi-establecimiento/lista-defecto"),
        isList,
      );
    } catch (error) {
      if (
        error instanceof ApiError &&
        error.status === 404 &&
        error.code === "NO_DEFAULT_LIST"
      )
        return null;
      throw error;
    }
  }
  async listHistory(_scopeId: string): Promise<ListSummary[]> {
    return checked(
      await this.request("/api/mi-establecimiento/listas-defecto"),
      (value): value is ListSummary[] =>
        Array.isArray(value) && value.every(isSummary),
    );
  }
  async suggestions(text: string): Promise<Suggestions> {
    return checked(
      await this.request(
        `/api/mi-establecimiento/catalogo/sugerencias?${query(text)}`,
      ),
      isSuggestions,
    );
  }
  async resumeService(): Promise<Establishment> {
    return checked(
      await this.request("/api/mi-establecimiento/reanudacion", "POST"),
      establishment,
    );
  }
  async endMaintenance(): Promise<Establishment> {
    return checked(
      await this.request("/api/mi-establecimiento/mantenimiento/fin", "POST"),
      establishment,
    );
  }
  async availability(qrSlug: string): Promise<Availability> {
    input(qrSlug, slug);
    return checked(
      await this.request(`/api/public/establecimientos/${encoded(qrSlug)}`),
      isAvailability,
    );
  }
  async queue(qrSlug: string): Promise<Queue> {
    input(qrSlug, slug);
    return checked(
      await this.request(
        `/api/public/establecimientos/${encoded(qrSlug)}/cola`,
      ),
      isQueue,
    );
  }
  /** Trending music in Colombia (public, cached six hours by the backend). */
  async trends(): Promise<Trends> {
    return checked(await this.request("/api/public/tendencias"), isTrends);
  }
  /** Public highlights of the venue for the last `dias` days (1..365). */
  async highlights(qrSlug: string, dias: number): Promise<Highlights> {
    input(qrSlug, slug);
    if (!period(dias))
      throw new Error("El periodo debe estar entre 1 y 365 días.");
    return checked(
      await this.request(
        `/api/public/establecimientos/${encoded(qrSlug)}/destacadas?dias=${dias}`,
      ),
      isHighlights,
    );
  }
  /** Published analytics of the last `jornadas` nights (1..30). */
  async analytics(jornadas: number): Promise<Analitica> {
    if (!nights(jornadas))
      throw new Error("Pide entre 1 y 30 jornadas de analítica.");
    return checked(
      await this.request(
        `/api/mi-establecimiento/analitica?jornadas=${jornadas}`,
      ),
      isAnalitica,
    );
  }
  /**
   * Live analytics of one night: the night in operation (else the latest
   * closed one) when `sesionId` is omitted.
   */
  async nightAnalytics(sesionId?: string): Promise<Jornada> {
    if (sesionId !== undefined && !uuid(sesionId))
      throw new Error("Revisa los datos de la operación.");
    return checked(
      await this.request(
        `/api/mi-establecimiento/analitica/jornada${
          sesionId === undefined ? "" : `?sesionId=${encoded(sesionId)}`
        }`,
      ),
      isJornada,
    );
  }
  async next(_scopeId: string): Promise<Started> {
    return checked(
      await this.request(
        "/api/mi-establecimiento/reproduccion/siguiente",
        "POST",
      ),
      isStarted,
    );
  }
  async finish(_scopeId: string, result: string): Promise<Finished> {
    return checked(
      await this.request(
        "/api/mi-establecimiento/reproduccion/fin",
        "POST",
        input({ resultado: result }, isFinishBody),
      ),
      isFinished,
    );
  }
}

import { AdminApi, ApiError, checked, type Establishment } from "./admin-api";
import {
  type DefaultList,
  type Finished,
  isCreate,
  isFinishBody,
  isFinished,
  isList,
  isPublish,
  isQueue,
  isStarted,
  isSuggestions,
  isSummary,
  isUpdate,
  type ListSummary,
  object,
  type Queue,
  type Started,
  type Suggestions,
  slug,
} from "./demo-contracts";

function establishment(value: unknown): value is Establishment {
  return (
    object(value) &&
    ["id", "nombre", "qrSlug", "zonaHoraria", "creadoAt"].every(
      (key) => typeof value[key] === "string",
    ) &&
    typeof value.activo === "boolean"
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
        "/api/admin/establecimientos",
        "POST",
        input(value, isCreate),
      ),
      establishment,
    );
  }
  async updateEstablishment(
    id: string,
    value: unknown,
  ): Promise<Establishment> {
    return checked(
      await this.request(
        `/api/admin/establecimientos/${encoded(id)}`,
        "PATCH",
        input(value, isUpdate),
      ),
      establishment,
    );
  }
  async publishList(id: string, value: unknown): Promise<DefaultList> {
    return checked(
      await this.request(
        `/api/admin/establecimientos/${encoded(id)}/lista-defecto`,
        "PUT",
        input(value, isPublish),
      ),
      isList,
    );
  }
  async currentList(id: string): Promise<DefaultList | null> {
    try {
      return checked(
        await this.request(
          `/api/staff/establecimientos/${encoded(id)}/lista-defecto`,
        ),
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
  async listHistory(id: string): Promise<ListSummary[]> {
    return checked(
      await this.request(
        `/api/admin/establecimientos/${encoded(id)}/listas-defecto`,
      ),
      (value): value is ListSummary[] =>
        Array.isArray(value) && value.every(isSummary),
    );
  }
  async suggestions(text: string): Promise<Suggestions> {
    return checked(
      await this.request(`/api/staff/catalogo/sugerencias?${query(text)}`),
      isSuggestions,
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
  async next(id: string): Promise<Started> {
    return checked(
      await this.request(
        `/api/staff/sesiones/${encoded(id)}/reproduccion/siguiente`,
        "POST",
      ),
      isStarted,
    );
  }
  async finish(id: string, result: string): Promise<Finished> {
    return checked(
      await this.request(
        `/api/staff/sesiones/${encoded(id)}/reproduccion/fin`,
        "POST",
        input({ resultado: result }, isFinishBody),
      ),
      isFinished,
    );
  }
}

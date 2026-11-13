import { isCreate, isFinishBody, isPublish, isUpdate } from "./demo-contracts";

export interface BffOptions {
  appUrl: string;
  apiUrl: string;
  credential: () => Promise<string | null>;
  transport: typeof fetch;
}
const GET_PATHS = [
  /^\/api\/mi-establecimiento$/,
  /^\/api\/mi-establecimiento\/(sesion-actual|qr|lista-defecto|listas-defecto)$/,
  /^\/api\/mi-establecimiento\/catalogo\/(busqueda|sugerencias)$/,
  /^\/api\/public\/establecimientos\/[a-z0-9-]{3,80}(?:\/cola)?$/,
];
const POST_PATHS = [
  /^\/api\/mi-establecimiento\/sesiones$/,
  /^\/api\/mi-establecimiento\/(reanudacion|mantenimiento\/fin)$/,
  /^\/api\/mi-establecimiento\/sesion\/(cierre|pausa|reanudacion)$/,
  /^\/api\/mi-establecimiento\/reproduccion\/siguiente$/,
];
const JSON_ROUTES = [
  {
    method: "POST",
    path: /^\/api\/mi-establecimiento$/,
    validate: isCreate,
  },
  {
    method: "PATCH",
    path: /^\/api\/mi-establecimiento$/,
    validate: isUpdate,
  },
  {
    method: "PUT",
    path: /^\/api\/mi-establecimiento\/lista-defecto$/,
    validate: isPublish,
  },
  {
    method: "POST",
    path: /^\/api\/mi-establecimiento\/reproduccion\/fin$/,
    validate: isFinishBody,
  },
];
const MAX_BODY_BYTES = 16384;
class BodyError extends Error {
  constructor(
    public status: number,
    public code: string,
  ) {
    super(code);
  }
}
async function boundedJson(request: Request): Promise<unknown> {
  if (
    !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(
      request.headers.get("content-type") ?? "",
    )
  )
    throw new BodyError(415, "UNSUPPORTED_MEDIA_TYPE");
  const reader = request.body?.getReader();
  if (!reader) throw new BodyError(400, "INVALID_BODY");
  let expired = false;
  const deadline = setTimeout(() => {
    expired = true;
    void reader.cancel().catch(() => {});
  }, 5000);
  try {
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (expired) throw new BodyError(400, "INVALID_BODY");
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_BODY_BYTES) {
        void reader.cancel().catch(() => {});
        throw new BodyError(413, "BODY_TOO_LARGE");
      }
      chunks.push(value);
    }
    const joined = new Uint8Array(bytes);
    let offset = 0;
    for (const chunk of chunks) {
      joined.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(joined));
  } catch (error) {
    if (error instanceof BodyError) throw error;
    throw new BodyError(400, "INVALID_BODY");
  } finally {
    clearTimeout(deadline);
    reader.releaseLock();
  }
}
export function sameOrigin(request: Request, appUrl: string) {
  return request.headers.get("origin") === appUrl;
}
export async function proxyRequest(
  request: Request,
  options: BffOptions,
): Promise<Response> {
  const reply = (status: number, code: string) =>
    Response.json(
      { code },
      { status, headers: { "Cache-Control": "no-store" } },
    );
  const url = new URL(request.url);
  const path = url.pathname.startsWith("/api/bff/")
    ? url.pathname.slice(8)
    : "";
  const paths =
    request.method === "GET"
      ? GET_PATHS
      : request.method === "POST"
        ? POST_PATHS
        : [];
  const jsonRoute = JSON_ROUTES.find(
    (route) => route.method === request.method && route.path.test(path),
  );
  if (!jsonRoute && !paths.some((pattern) => pattern.test(path)))
    return reply(404, "NOT_FOUND");
  if (
    path === "/api/mi-establecimiento/catalogo/busqueda" ||
    path === "/api/mi-establecimiento/catalogo/sugerencias"
  ) {
    const suggestions = path.endsWith("sugerencias");
    const q = url.searchParams.get("q");
    const page = url.searchParams.get("pagina");
    if (
      !q ||
      q.length < 2 ||
      q.length > 100 ||
      (page !== null && !/^[A-Za-z0-9_=-]{1,100}$/.test(page)) ||
      [...url.searchParams.keys()].some(
        (key) =>
          !(suggestions ? ["q"] : ["q", "pagina"]).includes(key) ||
          url.searchParams.getAll(key).length !== 1,
      )
    )
      return reply(400, "INVALID_QUERY");
  } else if (url.search) return reply(404, "NOT_FOUND");
  if (request.method !== "GET" && !sameOrigin(request, options.appUrl))
    return reply(403, "INVALID_ORIGIN");
  let body: string | undefined;
  if (jsonRoute) {
    try {
      const value = await boundedJson(request);
      if (!jsonRoute.validate(value)) return reply(400, "INVALID_BODY");
      body = JSON.stringify(value);
    } catch (error) {
      return error instanceof BodyError
        ? reply(error.status, error.code)
        : reply(400, "INVALID_BODY");
    }
  }
  const token = await options.credential();
  if (!token) return reply(401, "REAUTHENTICATE");
  try {
    const response = await options.transport(
      `${options.apiUrl}${path}${url.search}`,
      {
        method: request.method,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        ...(body === undefined ? {} : { body }),
        credentials: "omit",
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(20000),
      },
    );
    if (response.status >= 300 && response.status < 400)
      return reply(502, "UPSTREAM_REDIRECT");
    if (!response.ok) {
      const error: unknown = await response.json().catch(() => null);
      const code =
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        typeof error.code === "string" &&
        /^[A-Z][A-Z0-9_]{0,63}$/.test(error.code)
          ? error.code
          : "UPSTREAM_ERROR";
      return reply(response.status, code);
    }
    // Return DTOs and status, never upstream cookies or arbitrary headers.
    return new Response(await response.text(), {
      status: response.status,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return reply(502, "UPSTREAM_UNAVAILABLE");
  }
}

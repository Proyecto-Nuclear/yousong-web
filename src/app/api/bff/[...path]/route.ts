import { getToken } from "next-auth/jwt";
import { settings } from "@/lib/auth-policy";
import { proxyRequest } from "@/lib/bff";
import { credentialsFor } from "@/lib/server-credentials";

async function handle(request: Request) {
  const config = settings(process.env);
  return proxyRequest(request, {
    appUrl: config.appUrl,
    apiUrl: config.apiUrl,
    transport: fetch,
    credential: async () => {
      // getToken also supports Authorization; deliberately pass ONLY the cookie.
      const token = await getToken({
        req: {
          headers: new Headers({ cookie: request.headers.get("cookie") ?? "" }),
        },
        secret: config.secret,
        secureCookie: config.appUrl.startsWith("https:"),
      });
      return (await credentialsFor(token?.sid))?.accessToken ?? null;
    },
  });
}
export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;

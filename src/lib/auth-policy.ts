import { randomUUID } from "node:crypto";

export interface AuthSettings {
  issuer: string;
  clientId: string;
  clientSecret: string;
  appUrl: string;
  apiUrl: string;
  secret: string;
}
export interface Credentials {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
  roles: string[];
}
function origin(value: string, production: boolean): string {
  const url = new URL(value);
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/" ||
    !(
      url.protocol === "https:" ||
      (!production &&
        url.protocol === "http:" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
    )
  )
    throw Error("Invalid secure origin configuration");
  return url.origin;
}
export function settings(env: NodeJS.ProcessEnv): AuthSettings {
  const required = (key: string) => {
    const value = env[key];
    if (!value) throw Error(`Missing ${key}`);
    return value;
  };
  const production = env.NODE_ENV === "production";
  return {
    issuer: origin(required("FUSIONAUTH_URL"), production),
    appUrl: origin(required("AUTH_URL"), production),
    apiUrl: origin(
      env.API_BASE_URL || required("NEXT_PUBLIC_API_URL"),
      production,
    ),
    clientId: required("FUSIONAUTH_CLIENT_ID"),
    clientSecret: required("FUSIONAUTH_CLIENT_SECRET"),
    secret: required("AUTH_SECRET"),
  };
}
export const oidcPolicy = {
  checks: ["pkce", "state", "nonce"] as ["pkce", "state", "nonce"],
  authorization: {
    params: { scope: "openid offline_access", response_type: "code" },
  },
};
export function publicSession(roles: string[], expires: string) {
  return { roles, expires };
}
export async function refreshCredentials(
  old: Credentials,
  config: AuthSettings,
  transport: typeof fetch,
  verify: (token: string) => Promise<string[]>,
): Promise<Credentials | null> {
  if (!old.refreshToken) return null;
  try {
    const response = await transport(`${config.issuer}/oauth2/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: config.clientId,
        client_secret: config.clientSecret,
        refresh_token: old.refreshToken,
      }),
      cache: "no-store",
      credentials: "omit",
      redirect: "error",
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) return null;
    const data: unknown = await response.json();
    if (
      typeof data !== "object" ||
      data === null ||
      !("access_token" in data) ||
      typeof data.access_token !== "string" ||
      !data.access_token ||
      !("expires_in" in data) ||
      typeof data.expires_in !== "number" ||
      !Number.isFinite(data.expires_in) ||
      data.expires_in <= 30
    )
      return null;
    const refreshToken =
      "refresh_token" in data ? data.refresh_token : old.refreshToken;
    if (typeof refreshToken !== "string" || !refreshToken) return null;
    return {
      accessToken: data.access_token,
      refreshToken,
      expiresAt: Date.now() + data.expires_in * 1000,
      roles: await verify(data.access_token),
    };
  } catch {
    return null;
  }
}
interface Entry {
  credentials: Credentials;
  deadline: number;
  pending?: Promise<Credentials | null>;
}
// One bounded, process-local authority; cookies contain only its opaque identifier.
export class CredentialStore {
  private entries = new Map<string, Entry>();
  put(credentials: Credentials): string {
    for (const [id, entry] of this.entries)
      if (entry.deadline <= Date.now()) this.entries.delete(id);
    if (this.entries.size >= 1000) throw Error("Session capacity reached");
    const id = randomUUID();
    this.entries.set(id, { credentials, deadline: Date.now() + 8 * 3600_000 });
    return id;
  }
  async get(
    id: string,
    refresh: (value: Credentials) => Promise<Credentials | null>,
  ): Promise<Credentials | null> {
    const entry = this.entries.get(id);
    if (!entry || entry.deadline <= Date.now()) {
      this.remove(id);
      return null;
    }
    if (entry.pending) return entry.pending;
    if (entry.credentials.expiresAt > Date.now() + 30_000)
      return entry.credentials;
    entry.pending = (async () => {
      try {
        const next = await refresh(entry.credentials);
        if (!next || this.entries.get(id) !== entry) {
          this.remove(id);
          return null;
        }
        entry.credentials = next;
        return next;
      } catch {
        this.remove(id);
        return null;
      } finally {
        entry.pending = undefined;
      }
    })();
    return entry.pending;
  }
  remove(id: string): void {
    this.entries.delete(id);
  }
}

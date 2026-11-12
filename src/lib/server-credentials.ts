import { createRemoteJWKSet, customFetch } from "jose";
import { accessTokenRoles } from "./access-token";
import { CredentialStore, refreshCredentials, settings } from "./auth-policy";

// Shared across route bundles within ONE Node worker, not a distributed store.
const globalStore = globalThis as typeof globalThis & {
  yousongCredentials?: CredentialStore;
};
globalStore.yousongCredentials ??= new CredentialStore();
export const credentialStore = globalStore.yousongCredentials;
let keys: ReturnType<typeof createRemoteJWKSet> | undefined;
export async function verifiedRoles(accessToken: string): Promise<string[]> {
  const config = settings(process.env);
  keys ??= createRemoteJWKSet(
    new URL(`${config.issuer}/.well-known/jwks.json`),
    {
      timeoutDuration: 10000,
      [customFetch]: (url, init) =>
        fetch(url, {
          ...init,
          cache: "no-store",
          credentials: "omit",
          redirect: "error",
        }),
    },
  );
  return accessTokenRoles(accessToken, keys, config.issuer, config.clientId);
}
export async function credentialsFor(id: unknown) {
  if (typeof id !== "string") return null;
  return credentialStore.get(id, (old) =>
    refreshCredentials(old, settings(process.env), fetch, verifiedRoles),
  );
}

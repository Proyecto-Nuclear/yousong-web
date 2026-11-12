import { strict as assert } from "node:assert";
import { test } from "node:test";
import { Auth, customFetch } from "@auth/core";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { accessTokenRoles } from "../src/lib/access-token";
import {
  type AuthSettings,
  CredentialStore,
  type Credentials,
  oidcPolicy,
  publicSession,
  refreshCredentials,
  settings,
} from "../src/lib/auth-policy";
import { proxyRequest } from "../src/lib/bff";

const config: AuthSettings = {
  issuer: "http://127.0.0.1:9011",
  clientId: "client",
  clientSecret: "synthetic-secret",
  secret: "synthetic-session-secret",
  appUrl: "http://localhost:3000",
  apiUrl: "http://localhost:8080",
};
test("UI roles require verified access-token signature, issuer, audience, expiry and tty=at", async () => {
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const keys = createLocalJWKSet({ keys: [await exportJWK(publicKey)] });
  const claims = {
    iss: config.issuer,
    aud: config.clientId,
    sub: "synthetic-staff",
    exp: Math.floor(Date.now() / 1000) + 900,
    tty: "at",
    roles: ["ADMINISTRADOR", "unrecognized"],
  };
  const sign = (values: typeof claims) =>
    new SignJWT(values).setProtectedHeader({ alg: "RS256" }).sign(privateKey);
  assert.deepEqual(
    await accessTokenRoles(
      await sign(claims),
      keys,
      config.issuer,
      config.clientId,
    ),
    ["ADMINISTRADOR"],
  );
  // Valid roleless accounts still authenticate; roles never determine ownership.
  assert.deepEqual(
    await accessTokenRoles(
      await sign({ ...claims, roles: [] }),
      keys,
      config.issuer,
      config.clientId,
    ),
    [],
  );
  for (const values of [
    { ...claims, tty: "id" },
    { ...claims, iss: "https://wrong.test" },
    { ...claims, aud: "other-client" },
    { ...claims, exp: 1 },
  ])
    await assert.rejects(
      accessTokenRoles(
        await sign(values),
        keys,
        config.issuer,
        config.clientId,
      ),
    );
  const other = await generateKeyPair("RS256");
  const forged = await new SignJWT(claims)
    .setProtectedHeader({ alg: "RS256" })
    .sign(other.privateKey);
  await assert.rejects(
    accessTokenRoles(forged, keys, config.issuer, config.clientId),
  );
});
const old: Credentials = {
  accessToken: "access-old",
  refreshToken: "refresh-old",
  expiresAt: 0,
  roles: ["OPERADOR"],
};
test("OIDC requires code, PKCE S256-capable checks, state, nonce and minimal scopes", () => {
  assert.deepEqual(oidcPolicy.checks, ["pkce", "state", "nonce"]);
  assert.deepEqual(oidcPolicy.authorization.params, {
    scope: "openid offline_access",
    response_type: "code",
  });
});
test("Auth.js authorization produces S256/state/nonce and HTTPOnly SameSite cookies without a login credential", async () => {
  const authConfig = {
    secret: config.secret,
    trustHost: true,
    basePath: "/api/auth",
    providers: [
      {
        id: "fusionauth",
        name: "FusionAuth",
        type: "oidc" as const,
        issuer: "https://identity.test",
        clientId: config.clientId,
        clientSecret: config.clientSecret,
        ...oidcPolicy,
        [customFetch]: async () =>
          Response.json({
            issuer: "https://identity.test",
            authorization_endpoint: "https://identity.test/oauth2/authorize",
            token_endpoint: "https://identity.test/oauth2/token",
            jwks_uri: "https://identity.test/.well-known/jwks.json",
            response_types_supported: ["code"],
            subject_types_supported: ["public"],
            id_token_signing_alg_values_supported: ["RS256"],
            code_challenge_methods_supported: ["S256"],
          }),
      },
    ],
  };
  const csrf = await Auth(
    new Request(`${config.appUrl}/api/auth/csrf`),
    authConfig,
  );
  const { csrfToken } = await csrf.json();
  const cookie = csrf.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
  const response = await Auth(
    new Request(`${config.appUrl}/api/auth/signin/fusionauth`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", cookie },
      body: new URLSearchParams({ csrfToken, callbackUrl: config.appUrl }),
    }),
    authConfig,
  );
  assert.equal(response.status, 302);
  const location = new URL(response.headers.get("location") ?? "");
  assert.equal(location.origin, "https://identity.test");
  assert.equal(
    location.searchParams.get("redirect_uri"),
    `${config.appUrl}/api/auth/callback/fusionauth`,
  );
  assert.equal(location.searchParams.get("code_challenge_method"), "S256");
  assert.ok(location.searchParams.get("code_challenge"));
  assert.ok(location.searchParams.get("state"));
  assert.ok(location.searchParams.get("nonce"));
  assert.equal(location.searchParams.get("scope"), "openid offline_access");
  assert.equal(location.searchParams.get("response_type"), "code");
  const cookies = response.headers.getSetCookie();
  assert.ok(cookies.length >= 3);
  assert.ok(
    cookies.every(
      (value) => value.includes("HttpOnly") && value.includes("SameSite=Lax"),
    ),
  );
});

test("configuration fails closed for production HTTP and unsafe destinations", () => {
  const env: NodeJS.ProcessEnv = {
    NODE_ENV: "development",
    AUTH_URL: config.appUrl,
    FUSIONAUTH_URL: config.issuer,
    FUSIONAUTH_CLIENT_ID: config.clientId,
    FUSIONAUTH_CLIENT_SECRET: config.clientSecret,
    AUTH_SECRET: config.secret,
    API_BASE_URL: config.apiUrl,
  };
  assert.equal(settings(env).issuer, config.issuer);
  assert.throws(() => settings({ ...env, NODE_ENV: "production" }));
  for (const url of [
    "http://remote.test",
    "https://user:pass@api.test",
    "https://api.test/path",
    "https://api.test/?x=1",
  ])
    assert.throws(() => settings({ ...env, API_BASE_URL: url }));
  assert.throws(() => settings({ ...env, AUTH_SECRET: "" }));
  assert.equal(
    settings({
      ...env,
      NODE_ENV: "production",
      AUTH_URL: "https://admin.test",
      FUSIONAUTH_URL: "https://identity.test",
      API_BASE_URL: "https://api.test",
    }).appUrl,
    "https://admin.test",
  );
});
test("browser session exposes roles/expiry only, never credentials or ID token", () => {
  assert.deepEqual(publicSession(["ADMINISTRADOR"], "expiry"), {
    roles: ["ADMINISTRADOR"],
    expires: "expiry",
  });
});
test("refresh authenticates confidential client, rotates or preserves refresh token and uses access token only", async () => {
  for (const rotated of [true, false]) {
    let calls = 0;
    const result = await refreshCredentials(
      old,
      config,
      async (url, init) => {
        calls++;
        assert.equal(url, `${config.issuer}/oauth2/token`);
        assert.equal(init?.method, "POST");
        assert.equal(init?.redirect, "error");
        assert.equal(init?.cache, "no-store");
        assert.equal(init?.credentials, "omit");
        assert.ok(init?.signal);
        const body = new URLSearchParams(String(init?.body));
        assert.equal(body.get("grant_type"), "refresh_token");
        assert.equal(body.get("client_secret"), config.clientSecret);
        assert.equal(body.get("client_id"), config.clientId);
        assert.equal(body.get("refresh_token"), "refresh-old");
        return Response.json({
          access_token: "access-new",
          id_token: "never-use-id",
          expires_in: 900,
          ...(rotated ? { refresh_token: "refresh-new" } : {}),
        });
      },
      async (token) => {
        assert.equal(token, "access-new");
        return ["ADMINISTRADOR"];
      },
    );
    assert.equal(calls, 1);
    assert.equal(result?.accessToken, "access-new");
    assert.equal(result?.refreshToken, rotated ? "refresh-new" : "refresh-old");
    assert.deepEqual(result?.roles, ["ADMINISTRADOR"]);
    assert.ok((result?.expiresAt ?? 0) > Date.now() + 850_000);
    assert.equal(JSON.stringify(result).includes("never-use-id"), false);
  }
});
test("refresh fails closed on rejection, malformed data, verification or transport failure", async () => {
  for (const transport of [
    async () => Response.json({}, { status: 401 }),
    async () => Response.json({ id_token: "id", expires_in: 900 }),
    async () => {
      throw Error("private");
    },
  ])
    assert.equal(
      await refreshCredentials(old, config, transport, async () => []),
      null,
    );
  assert.equal(
    await refreshCredentials(
      old,
      config,
      async () => Response.json({ access_token: "invalid", expires_in: 900 }),
      async () => {
        throw Error("invalid signature");
      },
    ),
    null,
  );
});
test("store single-flights refresh, persists rotation, invalidates failed/logout sessions", async () => {
  const store = new CredentialStore();
  const id = store.put(old);
  let calls = 0;
  const refresh = async () => {
    calls++;
    await new Promise((resolve) => setTimeout(resolve, 5));
    return { ...old, accessToken: "new", expiresAt: Date.now() + 900_000 };
  };
  const results = await Promise.all([
    store.get(id, refresh),
    store.get(id, refresh),
  ]);
  assert.equal(calls, 1);
  assert.equal(results[0]?.accessToken, "new");
  assert.equal(results[1]?.accessToken, "new");
  assert.equal((await store.get(id, refresh))?.accessToken, "new");
  assert.equal(calls, 1);
  store.remove(id);
  assert.equal(await store.get(id, refresh), null);
  const failed = store.put(old);
  assert.equal(await store.get(failed, async () => null), null);
  assert.equal(await store.get(failed, refresh), null);
});
const id = "11111111-1111-4111-8111-111111111111";
function options() {
  let calls = 0;
  return {
    get calls() {
      return calls;
    },
    appUrl: config.appUrl,
    apiUrl: config.apiUrl,
    credential: async () => "server-access",
    transport: (async (_url, _init) => {
      calls++;
      return Response.json({ ok: true });
    }) as typeof fetch,
  };
}
test("BFF rejects unauthenticated requests, arbitrary paths/methods/queries and cross-origin mutations without backend effects", async () => {
  for (const path of [
    "/api/bff/api/participant",
    "/api/bff/api/staff/establecimientos/evil/qr",
    `/api/bff/api/admin/establecimientos/${id}/qr?target=https://evil.test`,
    "/api/bff/api/staff/establecimientos%2fescape",
  ]) {
    const opts = options();
    assert.equal(
      (await proxyRequest(new Request(config.appUrl + path), opts)).status,
      404,
    );
    assert.equal(opts.calls, 0);
  }
  const opts = options();
  const path = "/api/bff/api/mi-establecimiento/sesiones";
  for (const origin of [null, "https://evil.test"]) {
    const response = await proxyRequest(
      new Request(config.appUrl + path, {
        method: "POST",
        headers: origin ? { Origin: origin } : {},
      }),
      opts,
    );
    assert.equal(response.status, 403);
  }
  assert.equal(
    (
      await proxyRequest(
        new Request(config.appUrl + "/api/bff/api/mi-establecimiento", {
          method: "DELETE",
        }),
        opts,
      )
    ).status,
    404,
  );
  assert.equal(
    (
      await proxyRequest(
        new Request(config.appUrl + "/api/bff/api/mi-establecimiento"),
        { ...opts, credential: async () => null },
      )
    ).status,
    401,
  );
  assert.equal(opts.calls, 0);
});
test("BFF forwards only server Authorization, preserves 401/403 and backend DTO, strips response cookies/redirects", async () => {
  for (const status of [200, 401, 403]) {
    const opts = options();
    opts.transport = async (url, init) => {
      assert.equal(url, `${config.apiUrl}/api/mi-establecimiento`);
      assert.equal(
        new Headers(init?.headers).get("Authorization"),
        "Bearer server-access",
      );
      assert.equal(new Headers(init?.headers).get("Cookie"), null);
      assert.equal(init?.redirect, "error");
      assert.equal(init?.cache, "no-store");
      assert.equal(init?.credentials, "omit");
      assert.ok(init?.signal);
      return Response.json(
        { code: "EXACT" },
        {
          status,
          headers: { "Set-Cookie": "untrusted", Location: "https://evil.test" },
        },
      );
    };
    const response = await proxyRequest(
      new Request(config.appUrl + "/api/bff/api/mi-establecimiento", {
        headers: { Authorization: "attacker", Cookie: "untrusted" },
      }),
      opts,
    );
    assert.equal(response.status, status);
    assert.deepEqual(await response.json(), { code: "EXACT" });
    assert.equal(response.headers.get("Set-Cookie"), null);
    assert.equal(response.headers.get("Location"), null);
    assert.equal(response.headers.get("Cache-Control"), "no-store");
  }
});

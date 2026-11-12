import NextAuth, { customFetch } from "next-auth";
import FusionAuth from "next-auth/providers/fusionauth";
import { oidcPolicy, publicSession, settings } from "./lib/auth-policy";
import {
  credentialStore,
  credentialsFor,
  verifiedRoles,
} from "./lib/server-credentials";

export const { handlers, auth, signIn, signOut } = NextAuth(() => {
  const config = settings(process.env);
  return {
    secret: config.secret,
    trustHost: true,
    useSecureCookies: config.appUrl.startsWith("https:"),
    session: { strategy: "jwt", maxAge: 8 * 3600 },
    providers: [
      FusionAuth({
        issuer: config.issuer,
        clientId: config.clientId,
        clientSecret: config.clientSecret,
        ...oidcPolicy,
        client: { token_endpoint_auth_method: "client_secret_post" },
        [customFetch]: (input, init) =>
          fetch(input, {
            ...init,
            cache: "no-store",
            redirect: "error",
            signal: AbortSignal.timeout(10000),
          }),
      }),
    ],
    logger: { error() {}, warn() {}, debug() {} },
    callbacks: {
      async jwt({ token, account }) {
        if (account) {
          if (!account.access_token || !account.expires_at) return null;
          const roles = await verifiedRoles(account.access_token);
          const sid = credentialStore.put({
            accessToken: account.access_token,
            refreshToken: account.refresh_token,
            expiresAt: account.expires_at * 1000,
            roles,
          });
          return { sid, roles };
        }
        const credentials = await credentialsFor(token.sid);
        return credentials ? { ...token, roles: credentials.roles } : null;
      },
      session({ session, token }) {
        return publicSession(
          Array.isArray(token.roles)
            ? token.roles.filter(
                (role): role is string => typeof role === "string",
              )
            : [],
          session.expires,
        );
      },
      redirect() {
        return config.appUrl;
      },
    },
    events: {
      async signOut(message) {
        if ("token" in message && typeof message.token?.sid === "string")
          credentialStore.remove(message.token.sid);
      },
    },
  };
});

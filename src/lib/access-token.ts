import { type JWTVerifyGetKey, jwtVerify } from "jose";
export async function accessTokenRoles(
  token: string,
  key: JWTVerifyGetKey,
  issuer: string,
  audience: string,
): Promise<string[]> {
  const { payload } = await jwtVerify(token, key, {
    issuer,
    audience,
    algorithms: ["RS256"],
    requiredClaims: ["exp", "sub"],
  });
  if (payload.tty !== "at") throw Error("Not an access token");
  return Array.isArray(payload.roles)
    ? payload.roles.filter(
        (role): role is string =>
          role === "ADMINISTRADOR" || role === "OPERADOR",
      )
    : [];
}

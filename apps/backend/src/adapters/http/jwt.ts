import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import type { AccessIdentity } from "../../domain/AccessIdentity.js";

export type { AccessIdentity };

export function createJwtVerifier(issuer: string) {
  const jwks = createRemoteJWKSet(
    new URL(`${issuer}/protocol/openid-connect/certs`),
  );

  return async function verifyAccessToken(token: string): Promise<AccessIdentity> {
    const { payload } = await jwtVerify(token, jwks, { issuer });
    return identityFromPayload(payload);
  };
}

export function identityFromPayload(payload: JWTPayload): AccessIdentity {
  const sub = payload.sub;
  if (!sub) {
    throw new Error("JWT is missing sub");
  }
  return {
    sub,
    email: typeof payload.email === "string" ? payload.email : null,
    preferredUsername:
      typeof payload.preferred_username === "string"
        ? payload.preferred_username
        : null,
  };
}

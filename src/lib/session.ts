import { SignJWT, jwtVerify } from "jose";
import { isHosted } from "./env";

export const SESSION_COOKIE = "ap_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

export const AUTH_SECRET_PROBLEM =
  "AUTH_SECRET is missing or too short. Set it to a long random value (at least 32 characters) in your host's environment settings.";

/** True when sessions can be signed safely. Production refuses the built-in development secret. */
export function authSecretOk() {
  const s = process.env.AUTH_SECRET;
  return Boolean(s && s.length >= 32) || !isHosted();
}

/** The app's signing secret. Also the root of the key that seals share-link tokens. */
export function secret() {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 32) {
    // A guessable secret would let anyone forge a login, so a live site fails closed instead.
    if (isHosted()) throw new Error(AUTH_SECRET_PROBLEM);
    return new TextEncoder().encode("dev-only-insecure-secret-change-me");
  }
  return new TextEncoder().encode(s);
}

/**
 * `version` is the agent's session version when the session started. Raising it in the
 * database (password change or reset) makes every older session invalid.
 */
export async function signSession(agentId: string, version = 0) {
  return new SignJWT({ sub: agentId, ver: version })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .sign(secret());
}

export type SessionClaims = { agentId: string; version: number };

export async function readSession(token: string | undefined): Promise<SessionClaims | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"] });
    if (typeof payload.sub !== "string") return null;
    // Sessions from before versions existed count as version 0.
    return { agentId: payload.sub, version: typeof payload.ver === "number" ? payload.ver : 0 };
  } catch {
    return null;
  }
}

/** The agent id in a valid cookie. Doesn't check the version; that needs the database. */
export async function verifySession(token: string | undefined): Promise<string | null> {
  return (await readSession(token))?.agentId ?? null;
}

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: MAX_AGE_SECONDS,
};

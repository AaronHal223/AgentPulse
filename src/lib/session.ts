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

function secret() {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 32) {
    // A guessable secret would let anyone forge a login, so a live site fails closed instead.
    if (isHosted()) throw new Error(AUTH_SECRET_PROBLEM);
    return new TextEncoder().encode("dev-only-insecure-secret-change-me");
  }
  return new TextEncoder().encode(s);
}

export async function signSession(agentId: string) {
  return new SignJWT({ sub: agentId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .sign(secret());
}

export async function verifySession(token: string | undefined): Promise<string | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"] });
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: MAX_AGE_SECONDS,
};

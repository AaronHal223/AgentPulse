/**
 * Where is the app running? Used to refuse unsafe shortcuts (embedded database, default
 * session secret) anywhere real people's data could end up.
 */
export function isHosted(): boolean {
  return Boolean(
    process.env.NODE_ENV === "production" ||
      process.env.RENDER ||
      process.env.VERCEL ||
      process.env.KOYEB_APP_NAME ||
      process.env.RAILWAY_ENVIRONMENT,
  );
}

/**
 * CI runs a production build against a throwaway local database. It opts in explicitly with
 * ALLOW_LOCAL_DB=1 — never set this on a real deployment.
 */
export function allowLocalDb(): boolean {
  return process.env.ALLOW_LOCAL_DB === "1" || !isHosted();
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

/** Encrypted connections are required for any database that isn't on this machine. */
export function dbSsl(url: string): "require" | "prefer" | false {
  try {
    const u = new URL(url);
    if (LOCAL_HOSTS.has(u.hostname)) return false;
    // Names without a dot are a host's private network (e.g. Render's internal database address).
    if (!u.hostname.includes(".")) return "prefer";
    return "require";
  } catch {
    return "require";
  }
}

/**
 * Neon's copy-paste strings include `channel_binding=require`, which the postgres.js driver
 * would forward to the server as an unknown setting and fail. TLS stays enforced by `dbSsl`.
 */
export function cleanDbUrl(url: string): string {
  try {
    const u = new URL(url);
    u.searchParams.delete("channel_binding");
    return u.toString();
  } catch {
    return url;
  }
}

export const MISSING_DB_MESSAGE =
  "DATABASE_URL is not set. AgentPulse needs a permanent hosted database in production — create a free one at https://neon.tech and paste its connection string into DATABASE_URL (see README).";

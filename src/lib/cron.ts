import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { HttpError } from "./errors";

const digest = (s: string) => createHash("sha256").update(s).digest();

/** Scheduled jobs authenticate with `Authorization: Bearer $CRON_SECRET` (the GitHub Action sends it). */
export function assertCron(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 16) throw new HttpError(503, "CRON_SECRET is not set (use a long random value).");
  const given = req.headers.get("authorization") ?? "";
  // Constant-time comparison so the secret can't be guessed from response timing.
  if (!timingSafeEqual(digest(given), digest(`Bearer ${secret}`))) throw new HttpError(401, "Unauthorized");
}

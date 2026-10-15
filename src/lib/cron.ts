import "server-only";
import { HttpError } from "./errors";

/** Scheduled jobs authenticate with `Authorization: Bearer $CRON_SECRET` (Vercel Cron and the GitHub Action both send it). */
export function assertCron(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) throw new HttpError(500, "CRON_SECRET is not set.");
  if (req.headers.get("authorization") !== `Bearer ${secret}`) throw new HttpError(401, "Unauthorized");
}

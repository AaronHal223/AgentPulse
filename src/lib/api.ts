import "server-only";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { HttpError } from "./errors";
import { AiServiceError } from "./ai/types";

/** Errors whose message is safe and useful to show the agent (setup problems). */
const SAFE_MESSAGE = /is not set|is missing|too short|invite code/i;

/** Wraps a route handler so thrown errors become clean JSON responses. */
export function handler<Args extends unknown[]>(fn: (...args: Args) => Promise<Response>) {
  return async (...args: Args): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (err) {
      if (err instanceof HttpError) {
        return NextResponse.json({ error: err.message }, { status: err.status });
      }
      if (err instanceof ZodError) {
        return NextResponse.json(
          { error: err.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; ") },
          { status: 400 },
        );
      }
      console.error(err);
      if (err instanceof AiServiceError) {
        return NextResponse.json({ error: err.message }, { status: err.busy ? 503 : 502 });
      }
      // Never send internal details (database errors, stack traces) to the browser.
      const message = err instanceof Error && SAFE_MESSAGE.test(err.message) ? err.message : "Something went wrong. Please try again.";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  };
}

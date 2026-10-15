import "server-only";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { HttpError } from "./auth";

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
      const message = err instanceof Error ? err.message : "Something went wrong";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  };
}

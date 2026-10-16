"use client";
import { useEffect } from "react";
import { RefreshCw } from "lucide-react";

/** Shown instead of a blank screen if a page fails to load (for example a database hiccup). */
export function ErrorView({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="card mx-auto mt-10 flex max-w-lg flex-col items-center px-6 py-12 text-center">
      <h1 className="font-serif text-2xl font-semibold">This page didn’t load</h1>
      <p className="mt-2 text-sm text-ink-soft">
        AgentPulse couldn’t reach its database for a moment. Your clients and homes are safe — try again.
      </p>
      <div className="mt-6 flex gap-3">
        <button onClick={() => reset()} className="btn-primary">
          <RefreshCw size={15} /> Try again
        </button>
        <a href="/dashboard" className="btn-brand">Dashboard</a>
      </div>
      {error.digest && <p className="mt-4 text-xs text-muted">Reference: {error.digest}</p>}
    </div>
  );
}

"use client";
import { useEffect, useState } from "react";
import { Minus, ThumbsDown, ThumbsUp } from "lucide-react";
import type { Match } from "@/lib/db/schema";
import type { Factor } from "@/lib/scoring";
import { api } from "./fetcher";

type Why = { score: number; baseScore: number; factors: Factor[] };

const ICON = { helped: ThumbsUp, hurt: ThumbsDown, neutral: Minus };
const TONE = { helped: "text-brand", hurt: "text-rust", neutral: "text-muted" };

/** "Why this score": what helped and hurt, loaded when the agent opens the panel. */
export function WhyScore({ match }: { match: Match }) {
  const [why, setWhy] = useState<Why | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    api<Why>(`/api/matches/${match.id}/why`)
      .then((res) => !cancelled && setWhy(res))
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : "Couldn't load the breakdown."));
    return () => {
      cancelled = true;
    };
    // Reload when feedback has moved the score.
  }, [match.id, match.score]);

  return (
    <div className="mt-3 space-y-3 rounded-lg border border-line p-3 text-sm">
      <p className="text-ink-soft">
        <span className="font-semibold text-ink">Why {match.score}/10: </span>
        {match.reasoning}
        {why && why.baseScore !== why.score && (
          <span className="text-muted"> Started at {why.baseScore}; past feedback moved it to {why.score}.</span>
        )}
      </p>
      {error && <p className="text-rust">{error}</p>}
      {!why && !error && <p className="text-muted">Working out what helped and hurt…</p>}
      {why && (
        <ul className="space-y-2">
          {why.factors.map((f) => {
            const Icon = ICON[f.effect];
            return (
              <li key={f.key} className="flex gap-2.5">
                <Icon size={15} className={`mt-0.5 shrink-0 ${TONE[f.effect]}`} aria-label={f.effect} />
                <p className="min-w-0 text-ink-soft">
                  <span className="font-semibold text-ink">{f.label}: </span>
                  {f.detail}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

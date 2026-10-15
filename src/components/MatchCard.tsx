"use client";
import { useState } from "react";
import { Bookmark, BookmarkCheck, Car, Check, Copy, ExternalLink, MapPinOff, X } from "lucide-react";
import type { Match } from "@/lib/db/schema";
import { distanceText, factsLine, formatPrice } from "@/lib/format";
import { ScoreBadge } from "./ScoreBadge";
import { api } from "./fetcher";

export function MatchCard({ match, buyerName }: { match: Match; buyerName?: string }) {
  const [status, setStatus] = useState(match.status);
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);

  async function setTo(next: "new" | "saved" | "dismissed") {
    const prev = status;
    setStatus(next);
    try {
      await api(`/api/matches/${match.id}`, { method: "PATCH", body: { status: next } });
    } catch {
      setStatus(prev);
    }
  }

  async function copyBlurb() {
    const text = `${match.blurb}\n${match.url}`;
    await navigator.clipboard.writeText(text).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  if (status === "dismissed") {
    return (
      <div className="flex items-center justify-between rounded-xl border border-dashed border-line px-4 py-3 text-sm text-muted">
        <span className="truncate">Dismissed: {match.address || match.url}</span>
        <button onClick={() => setTo("new")} className="font-medium text-ink hover:underline">
          Undo
        </button>
      </div>
    );
  }

  const location = [match.city, match.state].filter(Boolean).join(", ");
  const distances = match.distances.filter((d) => d.minutes != null || d.miles != null);

  return (
    <article className="card overflow-hidden">
      <div className="flex gap-4 p-4 sm:p-5">
        <ScoreBadge score={match.score} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <h3 className="font-serif text-lg font-semibold leading-snug">
              {match.address || "Listing"}
              {location && <span className="font-sans text-sm font-normal text-muted"> · {location}</span>}
            </h3>
            <span className="text-base font-bold">{formatPrice(match)}</span>
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-sm text-ink-soft">
            {factsLine(match) && <span>{factsLine(match)}</span>}
            <span className="text-muted">
              {match.listingType === "rent" ? "For rent" : "For sale"}
              {match.source ? ` · ${match.source}` : ""}
              {buyerName ? ` · for ${buyerName}` : ""}
            </span>
          </div>

          {(distances.length > 0 || !match.inArea) && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {distances.map((d) => (
                <span key={d.label} className="inline-flex items-center gap-1 rounded-full bg-paper px-2.5 py-1 text-xs font-medium text-ink-soft">
                  <Car size={12} /> {distanceText(d)} to {d.label}
                </span>
              ))}
              {!match.inArea && (
                <span className="inline-flex items-center gap-1 rounded-full bg-rust-soft px-2.5 py-1 text-xs font-medium text-rust">
                  <MapPinOff size={12} /> Outside target area
                </span>
              )}
            </div>
          )}

          <p className="mt-3 text-sm leading-relaxed text-ink-soft">{match.summary}</p>

          <div className="mt-3 rounded-lg bg-brand-soft/60 p-3">
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm leading-relaxed text-ink">“{match.blurb}”</p>
              <button onClick={copyBlurb} className="shrink-0 text-brand hover:text-ink" title="Copy blurb + link to send to your client">
                {copied ? <Check size={16} /> : <Copy size={16} />}
              </button>
            </div>
          </div>

          {open && (
            <div className="mt-3 space-y-3 text-sm">
              <p className="text-ink-soft">
                <span className="font-semibold text-ink">Why {match.score}/10: </span>
                {match.reasoning}
              </p>
              {match.areaNote && (
                <p className="text-ink-soft">
                  <span className="font-semibold text-ink">Location: </span>
                  {match.areaNote}
                </p>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                {match.pros.length > 0 && (
                  <ul className="space-y-1">
                    {match.pros.map((p) => (
                      <li key={p} className="flex gap-2 text-ink-soft">
                        <span className="text-brand">+</span>
                        {p}
                      </li>
                    ))}
                  </ul>
                )}
                {match.cons.length > 0 && (
                  <ul className="space-y-1">
                    {match.cons.map((c) => (
                      <li key={c} className="flex gap-2 text-ink-soft">
                        <span className="text-rust">−</span>
                        {c}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <a href={match.url} target="_blank" rel="noreferrer" className="btn-ghost !px-3 !py-1.5">
              <ExternalLink size={14} /> View listing
            </a>
            <button onClick={() => setOpen((o) => !o)} className="btn-ghost !px-3 !py-1.5">
              {open ? "Hide details" : "Why this score"}
            </button>
            <button
              onClick={() => setTo(status === "saved" ? "new" : "saved")}
              className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-semibold transition ${status === "saved" ? "bg-brand text-white" : "border border-line bg-card text-ink hover:border-ink"}`}
            >
              {status === "saved" ? <BookmarkCheck size={14} /> : <Bookmark size={14} />}
              {status === "saved" ? "Saved" : "Save"}
            </button>
            <button onClick={() => setTo("dismissed")} className="ml-auto inline-flex items-center gap-1 text-sm text-muted hover:text-rust">
              <X size={14} /> Dismiss
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}

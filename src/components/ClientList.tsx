"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { MapPin, Search } from "lucide-react";
import type { Buyer } from "@/lib/db/schema";
import { timeAgo } from "@/lib/format";
import { budgetLabel } from "@/lib/profile";
import type { Pulse } from "@/lib/pulse";
import { PulseMeter } from "./PulseMeter";
import { ScoreBadge } from "./ScoreBadge";

export type ClientRow = { buyer: Buyer; matchCount: number; bestScore: number | null; pulse: Pulse | null };

// With only a handful of clients a search box is just clutter.
const SEARCH_FROM = 6;

const haystack = (b: Buyer) => [b.name, b.email, b.phone, ...b.areas, b.intent === "rent" ? "renting" : "buying"].filter(Boolean).join(" ").toLowerCase();

/** The agent's clients as cards, with a search box once the list is long enough to need one. */
export function ClientList({ rows }: { rows: ClientRow[] }) {
  const [query, setQuery] = useState("");
  const shown = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    return rows.filter((r) => words.every((w) => haystack(r.buyer).includes(w)));
  }, [rows, query]);

  return (
    <div className="space-y-4">
      {rows.length >= SEARCH_FROM && (
        <div className="relative">
          <Search size={16} className="absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, town, email or phone"
            className="input !pl-9"
            aria-label="Search clients"
          />
        </div>
      )}
      {!shown.length ? (
        <p className="card px-6 py-10 text-center text-sm text-ink-soft">
          No client matches “{query}”.{" "}
          <button onClick={() => setQuery("")} className="font-semibold text-ink underline">Show everyone</button>
        </p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {shown.map((row) => (
            <ClientCard key={row.buyer.id} {...row} />
          ))}
        </div>
      )}
    </div>
  );
}

function ClientCard({ buyer, matchCount, bestScore, pulse }: ClientRow) {
  return (
    <Link href={`/buyers/${buyer.id}`} className={`card group flex gap-4 p-5 transition hover:border-ink ${buyer.active ? "" : "opacity-60"}`}>
      {bestScore ? (
        <ScoreBadge score={bestScore} />
      ) : (
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-paper font-serif text-lg font-semibold text-ink-soft">
          {buyer.name.charAt(0).toUpperCase()}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="truncate font-serif text-lg font-semibold group-hover:underline">{buyer.name}</h2>
          <span className="flex shrink-0 gap-1">
            {buyer.isSample && <span className="rounded-full bg-paper px-2 py-0.5 text-xs font-semibold text-ink-soft">Sample</span>}
            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${buyer.intent === "rent" ? "bg-amber-soft text-amber" : "bg-brand-soft text-brand"}`}>
              {buyer.intent === "rent" ? "Renting" : "Buying"}
            </span>
          </span>
        </div>
        <p className="text-sm text-ink-soft">
          {budgetLabel(buyer)}
          {buyer.bedsMin ? ` · ${buyer.bedsMin}+ bd` : ""}
        </p>
        {buyer.areas.length > 0 && (
          <p className="mt-1 flex items-center gap-1 truncate text-sm text-muted">
            <MapPin size={13} className="shrink-0" /> {buyer.areas.join(", ")}
          </p>
        )}
        <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
          <span>
            {matchCount} home{matchCount === 1 ? "" : "s"} · searched {timeAgo(buyer.lastSearchedAt)}
            {!buyer.active && " · paused"}
          </span>
          {pulse && <PulseMeter pulse={pulse} />}
        </p>
      </div>
    </Link>
  );
}

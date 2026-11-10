"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Link2, Search } from "lucide-react";
import type { Buyer, Match } from "@/lib/db/schema";
import { timeAgo } from "@/lib/format";
import { api } from "./fetcher";

const SEARCH_STEPS = [
  "Searching Zillow, Redfin, Realtor.com and more…",
  "Reading listing pages…",
  "Checking each home against the profile…",
  "Scoring fit and checking the area…",
  "Working out drive times…",
];

type Props = {
  buyer: Buyer;
  /** A message from elsewhere in the panel (e.g. a re-check result) shown with the search notes. */
  notice?: string;
  onFound: (matches: Match[]) => void;
  onAnalyzed: (match: Match) => void;
};

/** "Find homes" and "score this link": the two ways homes get onto a client's list. */
export function HomeSearchBar({ buyer, notice, onFound, onAnalyzed }: Props) {
  const router = useRouter();
  const [searching, setSearching] = useState(false);
  const [step, setStep] = useState(0);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [link, setLink] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [lastSearched, setLastSearched] = useState(buyer.lastSearchedAt);

  async function findHomes() {
    setSearching(true);
    setError("");
    setNote("");
    setStep(0);
    const timer = setInterval(() => setStep((s) => Math.min(s + 1, SEARCH_STEPS.length - 1)), 18000);
    try {
      const res = await api<{ matches: Match[]; notes?: string }>(`/api/buyers/${buyer.id}/search`, { method: "POST" });
      onFound(res.matches);
      setNote(
        res.matches.length
          ? `Found ${res.matches.length} new home${res.matches.length === 1 ? "" : "s"}.${res.notes ? ` ${res.notes}` : ""}`
          : res.notes || "No new homes this time — everything that fits is already below.",
      );
      setLastSearched(new Date());
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    }
    clearInterval(timer);
    setSearching(false);
  }

  async function analyze(e: React.FormEvent) {
    e.preventDefault();
    if (!link.trim()) return;
    setAnalyzing(true);
    setError("");
    try {
      const res = await api<{ match: Match }>(`/api/buyers/${buyer.id}/analyze`, { body: { url: link.trim() } });
      onAnalyzed(res.match);
      setLink("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't analyze that link");
    }
    setAnalyzing(false);
  }

  const message = note || notice;
  return (
    <div className="card p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-serif text-xl font-semibold">Homes for {buyer.name.split(" ")[0]}</h2>
          <p className="text-sm text-muted">Last searched {timeAgo(lastSearched)} · searches run automatically every morning</p>
        </div>
        <button onClick={findHomes} disabled={searching} className="btn-brand">
          <Search size={15} /> {searching ? "Searching…" : "Find homes"}
        </button>
      </div>

      {searching && (
        <div className="mt-4 rounded-lg bg-paper p-3">
          <div className="h-1.5 overflow-hidden rounded-full bg-line">
            <div className="h-full rounded-full bg-brand transition-all duration-1000" style={{ width: `${((step + 1) / SEARCH_STEPS.length) * 92}%` }} />
          </div>
          <p className="mt-2 text-sm text-ink-soft">{SEARCH_STEPS[step]} <span className="text-muted">(usually 1–3 minutes)</span></p>
        </div>
      )}
      {message && !searching && <p className="mt-3 text-sm text-brand" role="status">{message}</p>}

      <form onSubmit={analyze} className="mt-4 flex gap-2 border-t border-line pt-4">
        <div className="relative min-w-0 flex-1">
          <Link2 size={15} className="absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
          <input
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="Paste any listing link (Zillow, Redfin, a brokerage site…) to score it"
            className="input !pl-9"
          />
        </div>
        <button disabled={analyzing || !link.trim()} className="btn-ghost shrink-0">
          {analyzing ? "Scoring…" : "Score it"}
        </button>
      </form>
      {error && <p className="mt-3 rounded-lg bg-rust-soft px-3 py-2 text-sm text-rust">{error}</p>}
    </div>
  );
}

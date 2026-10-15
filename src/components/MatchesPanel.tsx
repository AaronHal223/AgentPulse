"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Link2, Search } from "lucide-react";
import type { Buyer, Match } from "@/lib/db/schema";
import { timeAgo } from "@/lib/format";
import { MatchCard } from "./MatchCard";
import { api } from "./fetcher";

type Filter = "all" | "saved" | "outside";

const SEARCH_STEPS = [
  "Searching Zillow, Redfin, Realtor.com and more…",
  "Reading listing pages…",
  "Checking each home against the profile…",
  "Scoring fit and checking the area…",
  "Working out drive times…",
];

export function MatchesPanel({ buyer, initial }: { buyer: Buyer; initial: Match[] }) {
  const router = useRouter();
  const [matches, setMatches] = useState(initial);
  const [filter, setFilter] = useState<Filter>("all");
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
      setMatches((prev) => [...res.matches, ...prev.filter((p) => !res.matches.some((m) => m.id === p.id))]);
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
      setMatches((prev) => [res.match, ...prev.filter((p) => p.id !== res.match.id)]);
      setLink("");
      setFilter(res.match.inArea ? "all" : "outside");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't analyze that link");
    }
    setAnalyzing(false);
  }

  const visible = useMemo(() => {
    const list = matches.filter((m) =>
      filter === "saved" ? m.status === "saved" : filter === "outside" ? !m.inArea : m.inArea,
    );
    return list.sort((a, b) => b.score - a.score || +new Date(b.createdAt) - +new Date(a.createdAt));
  }, [matches, filter]);

  const counts = {
    all: matches.filter((m) => m.inArea && m.status !== "dismissed").length,
    saved: matches.filter((m) => m.status === "saved").length,
    outside: matches.filter((m) => !m.inArea && m.status !== "dismissed").length,
  };

  return (
    <div className="space-y-4">
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
        {note && !searching && <p className="mt-3 text-sm text-brand">{note}</p>}

        <form onSubmit={analyze} className="mt-4 flex gap-2 border-t border-line pt-4">
          <div className="relative flex-1">
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

      <div className="flex gap-1">
        {(
          [
            ["all", "In their area"],
            ["saved", "Saved"],
            ["outside", "Outside area"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${filter === key ? "bg-ink text-white" : "text-ink-soft hover:bg-line/60"}`}
          >
            {label} <span className="opacity-60">{counts[key]}</span>
          </button>
        ))}
      </div>

      {!visible.length ? (
        <div className="card px-6 py-12 text-center text-sm text-ink-soft">
          {filter === "all"
            ? matches.length
              ? "No in-area homes yet. Try “Find homes” again, or check “Outside area”."
              : "No homes yet. Press “Find homes” — AgentPulse will search the web and score what it finds."
            : filter === "saved"
              ? "Save homes you want to keep an eye on or send to your client."
              : "Homes the AI judged to be outside the target areas show up here."}
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map((m) => (
            <MatchCard key={m.id} match={m} />
          ))}
        </div>
      )}
    </div>
  );
}

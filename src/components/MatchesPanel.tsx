"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { List, Map as MapIcon, RefreshCw } from "lucide-react";
import type { Anchor, Buyer, Match, MatchFeedback } from "@/lib/db/schema";
import { commuteFit, defaultCommutePlaces, longestCommute } from "@/lib/commute";
import type { Rescored } from "@/lib/scoring";
import { CommuteControls, type CommuteSettings } from "./CommuteControls";
import { HomeSearchBar } from "./HomeSearchBar";
import { MapView } from "./MapView";
import { MatchCard } from "./MatchCard";
import { api } from "./fetcher";

type Filter = "all" | "saved" | "outside";
type View = "list" | "map";
type Props = { buyer: Buyer; initial: Match[]; feedback: MatchFeedback[] };

const TABS = [
  ["all", "In their area"],
  ["saved", "Saved"],
  ["outside", "Outside area"],
] as const;

const EMPTY: Record<Filter, string> = {
  all: "No homes yet. Press “Find homes” — AgentPulse will search the web and score what it finds.",
  saved: "Save homes you want to keep an eye on or send to your client.",
  outside: "Homes the AI judged to be outside the target areas show up here.",
};

const message = (err: unknown, fallback: string) => (err instanceof Error ? err.message : fallback);
const tab = (on: boolean) => `rounded-md px-3 py-1.5 text-sm font-medium ${on ? "bg-ink text-white" : "text-ink-soft hover:bg-line/60"}`;

export function MatchesPanel({ buyer, initial, feedback }: Props) {
  const router = useRouter();
  const [matches, setMatches] = useState(initial);
  const [anchors, setAnchors] = useState<Anchor[]>(buyer.anchors);
  const [filter, setFilter] = useState<Filter>("all");
  const [view, setView] = useState<View>("list");
  const [commute, setCommute] = useState<CommuteSettings>({
    places: defaultCommutePlaces(buyer.anchors),
    maxMinutes: buyer.maxDriveMinutes,
    hideOver: false,
  });
  const [working, setWorking] = useState<"" | "recheck" | "locate">("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  // The profile can change while this panel is open (edits, chat, voice notes).
  useEffect(() => {
    setAnchors(buyer.anchors);
    setCommute((c) => {
      const labels = buyer.anchors.map((a) => a.label);
      const kept = c.places.filter((p) => labels.includes(p));
      return { ...c, places: kept.length ? kept : defaultCommutePlaces(buyer.anchors) };
    });
  }, [buyer.anchors]);

  const merge = (fresh: Match[]) => {
    const byId = new Map(fresh.map((m) => [m.id, m]));
    setMatches((prev) => prev.map((m) => byId.get(m.id) ?? m));
  };

  async function run(kind: "recheck" | "locate", job: () => Promise<string>) {
    setWorking(kind);
    setError("");
    setNotice("");
    try {
      setNotice(await job());
    } catch (err) {
      setError(message(err, "That didn't work. Please try again."));
    }
    setWorking("");
  }

  const recheckSaved = () =>
    run("recheck", async () => {
      const res = await api<{ homes: Match[]; alerts: unknown[] }>(`/api/buyers/${buyer.id}/recheck`, { method: "POST" });
      merge(res.homes);
      const changes = res.alerts.length;
      if (changes) router.refresh(); // updates the unread count in the navigation
      const checked = `Checked ${res.homes.length} saved home${res.homes.length === 1 ? "" : "s"}.`;
      return `${checked} ${changes ? `${changes} change${changes === 1 ? "" : "s"} found — see Alerts.` : "Nothing has changed."}`;
    });

  const locateHomes = () =>
    run("locate", async () => {
      const res = await api<{ matches: Match[]; anchors: Anchor[]; unplaced: number; configured: boolean }>(`/api/buyers/${buyer.id}/drive-times`, { method: "POST" });
      merge(res.matches);
      setAnchors(res.anchors);
      if (!res.configured) return "Locating homes needs the free drive-time key (ORS_API_KEY) on the server.";
      return res.unplaced ? `${res.unplaced} home${res.unplaced === 1 ? "" : "s"} couldn't be located from the address.` : "Drive times and map locations are up to date.";
    });

  function applyRescored(rescored: Rescored[]) {
    const scores = new Map(rescored.map((r) => [r.id, r.score]));
    setMatches((prev) => prev.map((m) => (scores.has(m.id) ? { ...m, score: scores.get(m.id)! } : m)));
  }

  const applyUpdate = (id: string, change: Partial<Match>) => setMatches((prev) => prev.map((m) => (m.id === id ? { ...m, ...change } : m)));

  const rejectReasons = useMemo(
    () => new Map(feedback.filter((f) => f.source === "agent" && f.verdict === "rejected").map((f) => [f.matchId, f.reasons])),
    [feedback],
  );
  const clientReactions = useMemo(
    () => new Map(feedback.filter((f) => f.source === "client").map((f) => [f.matchId, { verdict: f.verdict, note: f.note }])),
    [feedback],
  );

  const inTab = useMemo(() => {
    const list = matches.filter((m) => (filter === "saved" ? m.status === "saved" : filter === "outside" ? !m.inArea : m.inArea));
    return list.sort((a, b) => b.score - a.score || +new Date(b.createdAt) - +new Date(a.createdAt));
  }, [matches, filter]);

  const overLimit = useMemo(
    () => new Set(inTab.filter((m) => commuteFit(m, commute.places, commute.maxMinutes) === "over").map((m) => m.id)),
    [inTab, commute.places, commute.maxMinutes],
  );
  const visible = commute.hideOver ? inTab.filter((m) => !overLimit.has(m.id)) : inTab;
  const onMap = visible.filter((m) => m.status !== "dismissed");

  const counts = {
    all: matches.filter((m) => m.inArea && m.status !== "dismissed").length,
    saved: matches.filter((m) => m.status === "saved").length,
    outside: matches.filter((m) => !m.inArea && m.status !== "dismissed").length,
  };

  const card = (m: Match) => (
    <MatchCard key={m.id} match={m} rejectedFor={rejectReasons.get(m.id)} clientReaction={clientReactions.get(m.id)} onRescored={applyRescored} onUpdate={applyUpdate} />
  );

  return (
    <div className="space-y-4">
      <HomeSearchBar
        buyer={buyer}
        notice={notice}
        onFound={(found) => setMatches((prev) => [...found, ...prev.filter((p) => !found.some((m) => m.id === p.id))])}
        onAnalyzed={(match) => {
          setMatches((prev) => [match, ...prev.filter((p) => p.id !== match.id)]);
          setFilter(match.inArea ? "all" : "outside");
        }}
      />
      {error && <p className="rounded-lg bg-rust-soft px-3 py-2 text-sm text-rust" role="alert">{error}</p>}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1">
          {TABS.map(([key, label]) => (
            <button key={key} onClick={() => setFilter(key)} className={tab(filter === key)}>
              {label} <span className="opacity-60">{counts[key]}</span>
            </button>
          ))}
        </div>
        <div className="flex gap-1 rounded-lg border border-line bg-card p-0.5">
          <button onClick={() => setView("list")} className={tab(view === "list")} aria-pressed={view === "list"}>
            <List size={14} className="mr-1 inline" /> List
          </button>
          <button onClick={() => setView("map")} className={tab(view === "map")} aria-pressed={view === "map"}>
            <MapIcon size={14} className="mr-1 inline" /> Map
          </button>
        </div>
      </div>

      {anchors.length > 0 && <CommuteControls anchors={anchors} value={commute} onChange={setCommute} />}
      {commute.maxMinutes != null && overLimit.size > 0 && (
        <p className="text-sm text-ink-soft">
          {overLimit.size} of {inTab.length} home{inTab.length === 1 ? " is" : "s are"} more than {commute.maxMinutes} min from {commute.places.join(" or ")}.
        </p>
      )}

      {filter === "saved" && counts.saved > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-card px-4 py-3">
          <p className="text-sm text-ink-soft">Saved homes are re-checked every morning for price drops and status changes.</p>
          <button onClick={recheckSaved} disabled={working !== ""} className="btn-ghost !px-3 !py-1.5">
            <RefreshCw size={14} className={working === "recheck" ? "animate-spin" : ""} /> {working === "recheck" ? "Checking…" : "Check now"}
          </button>
        </div>
      )}

      {view === "map" ? (
        <MapView homes={onMap} overLimit={overLimit} anchors={anchors} commutePlaces={commute.places} locating={working === "locate"} onLocate={locateHomes} renderHome={card} />
      ) : !visible.length ? (
        <div className="card px-6 py-12 text-center text-sm text-ink-soft">
          {inTab.length
            ? "Every home here is over the commute limit. Raise the limit or untick “Hide homes over the limit”."
            : filter === "all" && matches.length
              ? "No in-area homes yet. Try “Find homes” again, or check “Outside area”."
              : EMPTY[filter]}
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map((m) => {
            const over = overLimit.has(m.id);
            // One wrapper either way, so a card keeps its state when the limit moves.
            return (
              <div key={m.id} className={over ? "space-y-1 opacity-60 transition focus-within:opacity-100 hover:opacity-100" : undefined}>
                {over && <p className="px-1 text-xs font-semibold text-rust">Over the commute limit: {longestCommute(m, commute.places)} min drive</p>}
                {card(m)}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

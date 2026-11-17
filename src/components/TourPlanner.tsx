"use client";
import { useEffect, useState } from "react";
import { Car, Check, Copy, ExternalLink, Route, X } from "lucide-react";
import type { Buyer, Match } from "@/lib/db/schema";
import { TOUR_MAX_STOPS, TOUR_MIN_STOPS } from "@/lib/tour";
import type { Tour } from "@/lib/tours";
import { api } from "./fetcher";

type Props = { buyer: Buyer; homes: Match[]; onRemove: (id: string) => void; onClose: () => void };

const VISIT_LENGTHS = [15, 20, 30, 45, 60];

/** "14:05" → "2:05 PM" */
function friendlyTime(clock: string) {
  const [h, m] = clock.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

function itinerary(buyer: Buyer, tour: Tour) {
  const lines = tour.stops.map((s, i) => `${i + 1}. ${friendlyTime(s.arrive)}–${friendlyTime(s.leave)}  ${s.address}`);
  return `Showing tour for ${buyer.name}\n${lines.join("\n")}\nRoute: ${tour.mapsUrl}`;
}

/** Picks the best driving order for 2–6 homes and suggests a time slot for each. */
export function TourPlanner({ buyer, homes, onRemove, onClose }: Props) {
  const [startTime, setStartTime] = useState("10:00");
  const [visitMinutes, setVisitMinutes] = useState(30);
  const [tour, setTour] = useState<Tour | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  // A plan only describes the homes it was made for.
  const picked = homes.map((h) => h.id).join(",");
  useEffect(() => setTour(null), [picked, startTime, visitMinutes]);

  async function plan() {
    setBusy(true);
    setError("");
    try {
      setTour(await api<Tour>(`/api/buyers/${buyer.id}/tour`, { body: { matchIds: homes.map((h) => h.id), startTime, visitMinutes } }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't plan the tour. Please try again.");
    }
    setBusy(false);
  }

  async function copy(t: Tour) {
    await navigator.clipboard.writeText(itinerary(buyer, t)).catch(() => setError("Couldn't copy. Press and hold the list to copy it."));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="card space-y-4 border-brand/40 p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold">
            <Route size={16} className="text-brand" /> Showing tour
          </p>
          <p className="mt-1 text-sm text-ink-soft">
            Tick {TOUR_MIN_STOPS}–{TOUR_MAX_STOPS} homes below. AgentPulse finds the shortest driving order and suggests times.
          </p>
        </div>
        <button onClick={onClose} className="text-muted hover:text-ink" aria-label="Close tour planner">
          <X size={18} />
        </button>
      </div>

      {homes.length > 0 && !tour && (
        <ul className="flex flex-wrap gap-1.5">
          {homes.map((h) => (
            <li key={h.id} className="inline-flex items-center gap-1 rounded-full bg-paper py-1 pr-1.5 pl-3 text-xs font-medium text-ink-soft">
              {h.address || "Listing"}
              <button onClick={() => onRemove(h.id)} className="rounded-full p-0.5 hover:bg-line" aria-label={`Remove ${h.address || "home"} from the tour`}>
                <X size={12} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="label" htmlFor="tour-start">Start at</label>
          <input id="tour-start" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="input !w-32" />
        </div>
        <div>
          <label className="label" htmlFor="tour-visit">At each home</label>
          <select id="tour-visit" value={visitMinutes} onChange={(e) => setVisitMinutes(Number(e.target.value))} className="input !w-28">
            {VISIT_LENGTHS.map((m) => (
              <option key={m} value={m}>{m} min</option>
            ))}
          </select>
        </div>
        <button onClick={plan} disabled={busy || homes.length < TOUR_MIN_STOPS || !startTime} className="btn-brand">
          {busy ? "Planning…" : homes.length < TOUR_MIN_STOPS ? `Pick ${TOUR_MIN_STOPS - homes.length} more` : `Plan ${homes.length} stops`}
        </button>
      </div>

      {error && <p className="rounded-lg bg-rust-soft px-3 py-2 text-sm text-rust" role="alert">{error}</p>}

      {tour && (
        <div className="space-y-3">
          <ol className="space-y-2">
            {tour.stops.map((stop, i) => (
              <li key={stop.matchId}>
                {i > 0 && (
                  <p className="mb-2 ml-3.5 flex items-center gap-1.5 border-l border-dashed border-line py-0.5 pl-5 text-xs text-muted">
                    <Car size={12} /> {stop.driveMinutes} min drive · {stop.driveMiles} mi
                  </p>
                )}
                <div className="flex items-start gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink text-xs font-bold text-white">{i + 1}</span>
                  <div className="min-w-0 text-sm">
                    <p className="font-semibold">{friendlyTime(stop.arrive)} – {friendlyTime(stop.leave)}</p>
                    <p className="text-ink-soft">{stop.address}</p>
                  </div>
                </div>
              </li>
            ))}
          </ol>
          <p className="text-xs text-muted">
            {tour.totalDriveMinutes} min of driving in total.
            {tour.estimated && " Drive times are rough estimates from straight-line distance."} Confirm each time with the listing agents.
          </p>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => copy(tour)} className="btn-ghost !px-3 !py-1.5">
              {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? "Copied" : "Copy itinerary"}
            </button>
            <a href={tour.mapsUrl} target="_blank" rel="noreferrer" className="btn-ghost !px-3 !py-1.5">
              <ExternalLink size={14} /> Open route in Maps
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

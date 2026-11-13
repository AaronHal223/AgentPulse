"use client";
import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { MapPin } from "lucide-react";
import type { Anchor, Match } from "@/lib/db/schema";
import { commutesTo } from "@/lib/commute";
import { distanceText, formatPrice } from "@/lib/format";
import type { MapHome, MapPlace } from "./MatchMap";

// Leaflet needs the browser's window, so the map loads only on the client, when the tab is opened.
const MatchMap = dynamic(() => import("./MatchMap"), {
  ssr: false,
  loading: () => <div className="flex h-[60vh] min-h-80 items-center justify-center rounded-2xl border border-line bg-card text-sm text-muted">Loading the map…</div>,
});

type Props = {
  homes: Match[];
  /** Ids of homes over the commute limit, drawn faded. */
  overLimit: Set<string>;
  anchors: Anchor[];
  commutePlaces: string[];
  locating: boolean;
  onLocate: () => void;
  /** Renders the full card for the pin the agent tapped. */
  renderHome: (home: Match) => React.ReactNode;
};

const LEGEND = [
  ["#0f7a55", "8–10"],
  ["#a66a00", "6–7"],
  ["#8a3b2c", "1–5"],
] as const;

const hasPosition = <T extends { lat?: number | null; lng?: number | null }>(x: T): x is T & { lat: number; lng: number } => x.lat != null && x.lng != null;

function homeDetail(home: Match, places: string[]) {
  const drives = commutesTo(home, places)
    .filter((d) => d.minutes != null || d.miles != null)
    .map((d) => `${distanceText(d)} to ${d.label}`);
  return [formatPrice(home), ...drives].join(" · ");
}

/** Map tab: every home with a known location, pins coloured by score, plus the client's places. */
export function MapView({ homes, overLimit, anchors, commutePlaces, locating, onLocate, renderHome }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const pins: MapHome[] = useMemo(
    () =>
      homes.filter(hasPosition).map((h) => ({
        id: h.id,
        lat: h.lat,
        lng: h.lng,
        score: h.score,
        title: [h.address, h.city].filter(Boolean).join(", ") || "Listing",
        detail: homeDetail(h, commutePlaces),
        dimmed: overLimit.has(h.id),
      })),
    [homes, overLimit, commutePlaces],
  );

  const places: MapPlace[] = useMemo(() => {
    const shown = commutePlaces.length ? anchors.filter((a) => commutePlaces.includes(a.label)) : anchors;
    return shown.filter(hasPosition).map((a) => ({ label: a.label, lat: a.lat, lng: a.lng }));
  }, [anchors, commutePlaces]);

  const unplaced = homes.length - pins.length;
  const selected = homes.find((h) => h.id === selectedId);

  return (
    <div className="space-y-3">
      {pins.length > 0 ? (
        <MatchMap homes={pins} places={places} selectedId={selectedId} onSelect={setSelectedId} />
      ) : (
        <div className="card flex flex-col items-center px-6 py-12 text-center">
          <MapPin className="text-brand" size={26} />
          <p className="mt-3 text-sm text-ink-soft">{homes.length ? "None of these homes has a map location yet." : "No homes to show on the map yet."}</p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-ink-soft">
        {LEGEND.map(([color, range]) => (
          <span key={range} className="inline-flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-full" style={{ background: color }} /> Score {range}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rotate-45 rounded-[3px] bg-ink" /> Important place
        </span>
      </div>

      {(unplaced > 0 || !pins.length) && homes.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-card px-4 py-3">
          <p className="text-sm text-ink-soft">
            {unplaced} home{unplaced === 1 ? " isn't" : "s aren't"} on the map yet.
          </p>
          <button onClick={onLocate} disabled={locating} className="btn-ghost !px-3 !py-1.5">
            {locating ? "Locating…" : "Locate homes"}
          </button>
        </div>
      )}

      {selected ? renderHome(selected) : pins.length > 0 && <p className="text-center text-sm text-muted">Tap a pin to see the home.</p>}
    </div>
  );
}

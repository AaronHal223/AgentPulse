"use client";
import { Car } from "lucide-react";
import type { Anchor } from "@/lib/db/schema";
import { MAX_COMMUTE_PLACES, togglePlace } from "@/lib/commute";

export type CommuteSettings = { places: string[]; maxMinutes: number | null; hideOver: boolean };

type Props = { anchors: Anchor[]; value: CommuteSettings; onChange: (next: CommuteSettings) => void };

const LONGEST = 90;

/** Picks the one or two places that matter and the longest drive the client will accept. */
export function CommuteControls({ anchors, value, onChange }: Props) {
  const { places, maxMinutes, hideOver } = value;
  return (
    <div className="card space-y-3 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 text-sm font-semibold">
          <Car size={15} className="text-brand" /> Commute to
        </span>
        {anchors.map((a) => (
          <button
            key={a.label + a.address}
            onClick={() => onChange({ ...value, places: togglePlace(places, a.label) })}
            aria-pressed={places.includes(a.label)}
            className={`min-h-9 rounded-full px-3.5 py-1.5 text-sm font-medium transition ${places.includes(a.label) ? "bg-ink text-white" : "border border-line bg-card text-ink-soft hover:border-ink"}`}
          >
            {a.label}
          </button>
        ))}
        {anchors.length > MAX_COMMUTE_PLACES && <span className="text-xs text-muted">Pick up to {MAX_COMMUTE_PLACES}</span>}
      </div>

      <label className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <span className="text-ink-soft">Longest drive</span>
        <input
          type="range"
          min={0}
          max={LONGEST}
          step={5}
          value={maxMinutes ?? 0}
          onChange={(e) => onChange({ ...value, maxMinutes: Number(e.target.value) || null })}
          className="min-w-32 flex-1 accent-[#0f7a55]"
          aria-label="Longest acceptable drive in minutes"
        />
        <span className="w-16 text-right font-semibold">{maxMinutes ? `${maxMinutes} min` : "Any"}</span>
      </label>

      {maxMinutes != null && (
        <label className="flex items-center gap-2 text-sm text-ink-soft">
          <input type="checkbox" checked={hideOver} onChange={(e) => onChange({ ...value, hideOver: e.target.checked })} className="h-4 w-4 accent-[#0f7a55]" />
          Hide homes over the limit (otherwise they&apos;re shown faded)
        </label>
      )}
    </div>
  );
}

import type { Pulse, PulseLevel } from "@/lib/pulse";

const LOOK: Record<PulseLevel, { label: string; bar: string; text: string }> = {
  hot: { label: "Hot", bar: "bg-brand", text: "text-brand" },
  warm: { label: "Warm", bar: "bg-amber", text: "text-amber" },
  cooling: { label: "Cooling", bar: "bg-muted", text: "text-ink-soft" },
  quiet: { label: "Quiet", bar: "bg-muted/60", text: "text-muted" },
};

/** A small bar showing how engaged a client is right now. */
export function PulseMeter({ pulse }: { pulse: Pulse }) {
  const look = LOOK[pulse.level];
  return (
    <span className="inline-flex items-center gap-1.5" title={`Engagement ${pulse.score} out of 100, from the last two weeks of activity`}>
      <span className="h-1.5 w-12 overflow-hidden rounded-full bg-line" aria-hidden>
        <span className={`block h-full rounded-full ${look.bar}`} style={{ width: `${Math.max(6, pulse.score)}%` }} />
      </span>
      <span className={`text-xs font-semibold ${look.text}`}>
        {look.label} <span className="sr-only">engagement, {pulse.score} out of 100</span>
      </span>
    </span>
  );
}

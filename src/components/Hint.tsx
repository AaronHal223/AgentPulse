"use client";
import { useState } from "react";
import { CircleHelp } from "lucide-react";

/** A small "?" that explains one idea in a sentence or two when tapped. */
export function Hint({ label, children }: { label: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-flex align-middle">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        onBlur={() => setOpen(false)}
        className="inline-flex h-7 w-7 items-center justify-center rounded-full text-muted hover:bg-line/60 hover:text-ink"
        aria-label={label}
        aria-expanded={open}
      >
        <CircleHelp size={16} />
      </button>
      {open && (
        <span role="tooltip" className="absolute top-8 left-1/2 z-30 w-64 max-w-[80vw] -translate-x-1/2 rounded-xl border border-line bg-card p-3 text-left font-sans text-sm font-normal leading-snug text-ink-soft shadow-lg">
          {children}
        </span>
      )}
    </span>
  );
}

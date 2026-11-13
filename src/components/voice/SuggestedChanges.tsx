"use client";
import { ArrowRight } from "lucide-react";
import type { ProfileChange } from "@/lib/profile-changes";

type Props = { changes: ProfileChange[]; picked: Set<string>; onToggle: (field: string) => void };

/** The AI's suggested profile changes, each with a checkbox so the agent decides what's saved. */
export function SuggestedChanges({ changes, picked, onToggle }: Props) {
  return (
    <ul className="divide-y divide-line rounded-lg border border-line">
      {changes.map((c) => (
        <li key={c.field}>
          <label className="flex cursor-pointer items-start gap-3 px-3 py-2.5">
            <input type="checkbox" checked={picked.has(c.field)} onChange={() => onToggle(c.field)} className="mt-1 h-4 w-4 shrink-0 accent-[#0f7a55]" />
            <span className="min-w-0 flex-1 text-sm">
              <span className="block text-xs font-semibold uppercase tracking-wide text-muted">{c.label}</span>
              {c.before ? (
                <span className="mt-0.5 flex flex-wrap items-baseline gap-x-1.5 text-ink-soft">
                  <span className="line-through decoration-muted/60">{c.before}</span>
                  <ArrowRight size={12} className="shrink-0 self-center text-muted" />
                  <span className="font-medium text-ink">{c.after}</span>
                </span>
              ) : (
                <span className="mt-0.5 block font-medium text-ink">{c.after}</span>
              )}
            </span>
          </label>
        </li>
      ))}
    </ul>
  );
}

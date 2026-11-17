"use client";
import { useEffect, useRef, useState } from "react";

type Props = {
  /** What is about to happen, e.g. "Deleting Pat Client". */
  label: string;
  seconds?: number;
  /** Runs when the time is up. */
  onCommit: () => void;
  onUndo: () => void;
};

/**
 * A short grace period before something permanent happens. The action only runs when the
 * countdown ends, so "Undo" (or leaving the page) means nothing was ever deleted.
 */
export function UndoBar({ label, seconds = 6, onCommit, onUndo }: Props) {
  const [left, setLeft] = useState(seconds);
  const commit = useRef(onCommit);
  commit.current = onCommit;

  useEffect(() => {
    if (left <= 0) {
      commit.current();
      return;
    }
    const timer = setTimeout(() => setLeft((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [left]);

  return (
    <div className="fixed inset-x-0 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-40 flex justify-center px-4 sm:bottom-6" role="status">
      <div className="flex w-full max-w-md items-center gap-3 rounded-xl bg-ink px-4 py-3 text-sm text-white shadow-lg">
        <span className="min-w-0 flex-1 truncate">
          {label}
          {left > 0 ? ` in ${left}…` : "…"}
        </span>
        {left > 0 && (
          <button onClick={onUndo} className="shrink-0 rounded-md bg-white/15 px-3 py-1.5 font-semibold hover:bg-white/25">
            Undo
          </button>
        )}
      </div>
    </div>
  );
}

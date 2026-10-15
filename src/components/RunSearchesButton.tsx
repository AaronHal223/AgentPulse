"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { api } from "./fetcher";

/** Runs a fresh web search for each client one at a time (each takes a minute or two). */
export function RunSearchesButton({ buyers, label = "Search for new homes" }: { buyers: { id: string; name: string }[]; label?: string }) {
  const router = useRouter();
  const [progress, setProgress] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);

  async function run() {
    setErrors([]);
    let found = 0;
    for (let i = 0; i < buyers.length; i++) {
      const b = buyers[i];
      setProgress(`Searching for ${b.name} (${i + 1} of ${buyers.length})…`);
      try {
        const res = await api<{ matches: unknown[] }>(`/api/buyers/${b.id}/search`, { method: "POST" });
        found += res.matches.length;
      } catch (err) {
        setErrors((e) => [...e, `${b.name}: ${err instanceof Error ? err.message : "failed"}`]);
      }
      router.refresh();
    }
    setProgress(`Done — ${found} new home${found === 1 ? "" : "s"} found.`);
    setTimeout(() => setProgress(null), 6000);
  }

  const running = progress !== null && !progress.startsWith("Done");
  return (
    <div className="flex flex-col items-start gap-2 sm:items-end">
      <button onClick={run} disabled={running || !buyers.length} className="btn-brand">
        <RefreshCw size={15} className={running ? "animate-spin" : ""} />
        {running ? "Searching…" : label}
      </button>
      {progress && <p className="text-xs text-muted">{progress}</p>}
      {errors.map((e) => (
        <p key={e} className="text-xs text-rust">{e}</p>
      ))}
    </div>
  );
}

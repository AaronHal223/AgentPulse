import Link from "next/link";
import { Trophy } from "lucide-react";
import { formatMinutes, type WeeklyReport } from "@/lib/report";

/** One-line version of the weekly win report, on the dashboard. */
export function WeekSummary({ report }: { report: WeeklyReport }) {
  const { counts, minutesSaved } = report;
  if (!minutesSaved && !counts.likes && !counts.passes) return null;
  const parts = [
    `${counts.homesFound} home${counts.homesFound === 1 ? "" : "s"} found`,
    `${counts.homesSent} sent`,
    `${counts.likes + counts.passes} client reaction${counts.likes + counts.passes === 1 ? "" : "s"}`,
  ];
  return (
    <Link href="/report" className="card flex items-center gap-3 px-4 py-3 transition hover:border-ink">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-soft text-amber">
        <Trophy size={17} />
      </span>
      <span className="min-w-0 flex-1 text-sm">
        <span className="block font-semibold">Your week: about {formatMinutes(minutesSaved)} saved</span>
        <span className="block text-ink-soft">{parts.join(" · ")}</span>
      </span>
      <span className="shrink-0 text-sm font-semibold text-brand">Report →</span>
    </Link>
  );
}

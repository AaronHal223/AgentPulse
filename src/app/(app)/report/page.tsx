import Link from "next/link";
import { requireAgent } from "@/lib/auth";
import { formatMinutes, MINUTES_EACH, REPORT_DAYS, weeklyReport } from "@/lib/report";

const day = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: process.env.APP_TIMEZONE || "America/New_York" });

export default async function ReportPage() {
  const agent = await requireAgent();
  const { since, counts, minutesSaved, clients } = await weeklyReport(agent.id);

  const tiles = [
    { label: "Homes found", value: counts.homesFound, note: `${counts.strongMatches} scored 8+` },
    { label: "Homes sent", value: counts.homesSent, note: "to clients" },
    { label: "Client reactions", value: counts.likes + counts.passes, note: `${counts.likes} liked · ${counts.passes} passed` },
    { label: "Alerts", value: counts.alerts, note: `${counts.priceDrops} price drop${counts.priceDrops === 1 ? "" : "s"}` },
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link href="/dashboard" className="text-sm text-muted hover:text-ink">← Brief</Link>
        <h1 className="mt-2 font-serif text-3xl font-semibold">Your week</h1>
        <p className="mt-1 text-ink-soft">
          {day(since)} – {day(new Date())}: what AgentPulse did for you in the last {REPORT_DAYS} days.
        </p>
      </div>

      <div className="card bg-brand-soft/50 px-5 py-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-brand">Time saved</p>
        <p className="mt-1 font-serif text-4xl font-semibold">About {formatMinutes(minutesSaved)}</p>
        <p className="mt-2 text-sm text-ink-soft">
          An estimate: {MINUTES_EACH.homeFound} min for each home found and scored, {MINUTES_EACH.alert} for each saved home change you didn&apos;t have to
          look up, {MINUTES_EACH.homeSent} for each ready-to-send note, {MINUTES_EACH.voiceNote} for each voice note typed up for you.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tiles.map((t) => (
          <div key={t.label} className="card px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">{t.label}</p>
            <p className="mt-1 font-serif text-3xl font-semibold">{t.value}</p>
            <p className="text-xs text-muted">{t.note}</p>
          </div>
        ))}
      </div>

      <section className="space-y-3">
        <h2 className="font-serif text-xl font-semibold">By client</h2>
        {clients.length ? (
          <ul className="card divide-y divide-line">
            {clients.map((c) => (
              <li key={c.buyerId}>
                <Link href={`/buyers/${c.buyerId}`} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-3 text-sm hover:bg-paper/60">
                  <span className="font-semibold">{c.name}</span>
                  <span className="text-ink-soft">
                    {c.found} found · {c.sent} sent · {c.likes} liked · {c.passes} passed
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <div className="card px-6 py-10 text-center text-sm text-ink-soft">
            Nothing to report yet. Run a search or send a client a home, and this page fills in.
          </div>
        )}
      </section>
    </div>
  );
}

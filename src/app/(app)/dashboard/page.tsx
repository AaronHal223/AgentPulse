import Link from "next/link";
import { and, count, eq } from "drizzle-orm";
import { Sparkles, UserPlus } from "lucide-react";
import { requireAgent } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { getBriefGroups } from "@/lib/brief";
import { budgetLabel } from "@/lib/profile";
import { MatchCard } from "@/components/MatchCard";
import { RunSearchesButton } from "@/components/RunSearchesButton";
import { EmailBriefButton } from "@/components/EmailBriefButton";

function greeting() {
  const h = Number(new Date().toLocaleString("en-US", { hour: "numeric", hour12: false, timeZone: process.env.APP_TIMEZONE || "America/New_York" }));
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export default async function Dashboard() {
  const agent = await requireAgent();
  const db = await getDb();
  const [buyers, groups, [{ total }]] = await Promise.all([
    db.select().from(schema.buyers).where(and(eq(schema.buyers.agentId, agent.id), eq(schema.buyers.active, true))),
    getBriefGroups(agent.id, 24),
    db
      .select({ total: count() })
      .from(schema.matches)
      .innerJoin(schema.buyers, eq(schema.matches.buyerId, schema.buyers.id))
      .where(and(eq(schema.buyers.agentId, agent.id), eq(schema.matches.status, "saved"))),
  ]);

  const newCount = groups.reduce((n, g) => n + g.matches.length, 0);
  const strong = groups.reduce((n, g) => n + g.matches.filter((m) => m.score >= 8).length, 0);
  const date = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: process.env.APP_TIMEZONE || "America/New_York" });

  return (
    <div className="space-y-8">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm text-muted">{date}</p>
          <h1 className="mt-1 font-serif text-3xl font-semibold sm:text-4xl">
            {greeting()}, {agent.name.split(" ")[0]}
          </h1>
          <p className="mt-2 text-ink-soft">
            {newCount
              ? `${newCount} new home${newCount === 1 ? "" : "s"} for ${groups.length} client${groups.length === 1 ? "" : "s"} in the last 24 hours.`
              : buyers.length
                ? "No new homes in the last 24 hours yet."
                : "Add your first client to get a daily brief."}
          </p>
        </div>
        {buyers.length > 0 && (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
            <EmailBriefButton />
            <RunSearchesButton buyers={buyers.map((b) => ({ id: b.id, name: b.name }))} label="Run today's searches" />
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Active clients", value: buyers.length },
          { label: "New homes (24h)", value: newCount },
          { label: "Scored 8+", value: strong },
          { label: "Saved homes", value: total },
        ].map((s) => (
          <div key={s.label} className="card px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">{s.label}</p>
            <p className="mt-1 font-serif text-3xl font-semibold">{s.value}</p>
          </div>
        ))}
      </div>

      {!buyers.length && (
        <div className="card flex flex-col items-center px-6 py-14 text-center">
          <UserPlus className="text-brand" size={28} />
          <h2 className="mt-3 font-serif text-xl font-semibold">Bring in your clients</h2>
          <p className="mt-2 max-w-md text-sm text-ink-soft">
            Paste a CSV from your CRM, an email from a client, or just describe them. AgentPulse builds a profile for each one.
          </p>
          <Link href="/buyers/new" className="btn-primary mt-5">Add clients</Link>
        </div>
      )}

      {buyers.length > 0 && !groups.length && (
        <div className="card flex flex-col items-center px-6 py-12 text-center">
          <Sparkles className="text-brand" size={26} />
          <h2 className="mt-3 font-serif text-xl font-semibold">Your brief is empty so far today</h2>
          <p className="mt-2 max-w-md text-sm text-ink-soft">
            Searches run automatically each morning. You can also run them now — it takes a minute or two per client.
          </p>
        </div>
      )}

      {groups.map((g) => (
        <section key={g.buyer.id} className="space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-serif text-xl font-semibold">
              <Link href={`/buyers/${g.buyer.id}`} className="hover:underline">{g.buyer.name}</Link>
              <span className="ml-2 font-sans text-sm font-normal text-muted">
                {g.buyer.intent === "rent" ? "Renting" : "Buying"} · {budgetLabel(g.buyer)}
              </span>
            </h2>
            <Link href={`/buyers/${g.buyer.id}`} className="text-sm font-semibold text-brand hover:underline">
              All homes for {g.buyer.name.split(" ")[0]} →
            </Link>
          </div>
          <div className="space-y-3">
            {g.matches.slice(0, 3).map((m) => (
              <MatchCard key={m.id} match={m} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

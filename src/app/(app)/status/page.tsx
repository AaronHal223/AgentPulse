import { notFound } from "next/navigation";
import { count, sql } from "drizzle-orm";
import { CircleAlert, CircleCheck } from "lucide-react";
import { requireAgent } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { timeAgo } from "@/lib/format";
import { isOwner, lastJobRun, recentErrors } from "@/lib/monitor";
import { aiConfigured, aiIsPrivate, aiProvider } from "@/lib/ai/provider";
import { RENTCAST, rentcastConfigured, rentcastMonthlyLimit } from "@/lib/listings/rentcast";
import { usedThisMonth } from "@/lib/usage";
import { pushConfigured } from "@/lib/push";

type Check = { label: string; ok: boolean; detail: string };

const HOURS = 3600 * 1000;

async function databaseAnswers() {
  try {
    await (await getDb()).execute(sql`select 1`);
    return true;
  } catch {
    return false;
  }
}

/** The owner's view of whether every part of the site is working. Other agents get a 404. */
export default async function StatusPage() {
  const agent = await requireAgent();
  if (!isOwner(agent)) notFound();

  const db = await getDb();
  const [database, searchRun, briefRun, errors, [agents], [clients], feedUsed] = await Promise.all([
    databaseAnswers(),
    lastJobRun("search"),
    lastJobRun("briefs"),
    recentErrors(),
    db.select({ n: count() }).from(schema.agents),
    db.select({ n: count() }).from(schema.buyers),
    usedThisMonth(RENTCAST).catch(() => 0),
  ]);
  const ranToday = (run: { createdAt: Date } | null) => Boolean(run && Date.now() - run.createdAt.getTime() < 26 * HOURS);

  const checks: Check[] = [
    { label: "Database", ok: database, detail: database ? "Answering" : "Not answering. Check DATABASE_URL and Neon." },
    { label: "AI", ok: aiConfigured(), detail: aiConfigured() ? `Using ${aiProvider()}` : `No key for ${aiProvider()}. Searches, chat and drafts won't work.` },
    {
      label: "AI privacy",
      ok: aiIsPrivate(),
      detail: aiIsPrivate()
        ? "Client details aren't used to train the AI"
        : "Free Gemini plan: Google may use what's sent. Turn on billing in Google AI Studio, then set GEMINI_PAID_TIER=true.",
    },
    {
      label: "Listings feed (RentCast)",
      ok: rentcastConfigured(),
      detail: rentcastConfigured()
        ? `${feedUsed} of ${rentcastMonthlyLimit()} free requests used this month. After that, searches use the web until next month.`
        : "No RENTCAST_API_KEY. Homes are found by searching the web, which is less complete.",
    },
    { label: "Email", ok: Boolean(process.env.RESEND_API_KEY), detail: process.env.RESEND_API_KEY ? "Resend key set" : "No RESEND_API_KEY. No daily brief or password reset emails." },
    { label: "Drive times and map", ok: Boolean(process.env.ORS_API_KEY), detail: process.env.ORS_API_KEY ? "OpenRouteService key set" : "No ORS_API_KEY. No drive times; homes can't be placed on the map." },
    { label: "Phone notifications", ok: pushConfigured(), detail: pushConfigured() ? "Keys set" : "No VAPID keys." },
    {
      label: "Morning search",
      ok: ranToday(searchRun) && searchRun!.failed === 0,
      detail: searchRun ? `Last ran ${timeAgo(searchRun.createdAt)}: ${searchRun.processed} step(s), ${searchRun.failed} failed` : "Hasn't run yet. Check the Daily brief workflow on GitHub.",
    },
    {
      label: "Brief emails",
      ok: ranToday(briefRun) && briefRun!.failed === 0,
      detail: briefRun ? `Last ran ${timeAgo(briefRun.createdAt)}: ${briefRun.processed} agent(s), ${briefRun.failed} failed` : "Hasn't run yet.",
    },
  ];
  const broken = checks.filter((c) => !c.ok).length;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="font-serif text-3xl font-semibold">Site status</h1>
        <p className="mt-1 text-ink-soft">
          {broken ? `${broken} thing${broken === 1 ? " needs" : "s need"} a look.` : "Everything is working."} {agents.n} agent{agents.n === 1 ? "" : "s"}, {clients.n} client{clients.n === 1 ? "" : "s"}.
        </p>
      </div>

      <ul className="card divide-y divide-line">
        {checks.map((c) => (
          <li key={c.label} className="flex items-start gap-3 px-4 py-3 text-sm">
            {c.ok ? <CircleCheck size={18} className="mt-0.5 shrink-0 text-brand" /> : <CircleAlert size={18} className="mt-0.5 shrink-0 text-rust" />}
            <span className="min-w-0">
              <span className="block font-semibold">{c.label}</span>
              <span className="block text-ink-soft">{c.detail}</span>
            </span>
          </li>
        ))}
      </ul>

      <section className="space-y-3">
        <h2 className="font-serif text-xl font-semibold">Recent problems</h2>
        {errors.length ? (
          <ul className="card divide-y divide-line">
            {errors.map((e) => (
              <li key={e.id} className="px-4 py-3 text-sm">
                <p className="font-semibold break-words">{e.source}</p>
                <p className="text-ink-soft break-words">{e.message}</p>
                <p className="mt-0.5 text-xs text-muted">{timeAgo(e.createdAt)}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="card px-6 py-8 text-center text-sm text-ink-soft">No problems in the last two weeks.</p>
        )}
      </section>

      <p className="text-sm text-muted">
        Backups: on Neon&apos;s free plan the database can be restored to any moment in the last 6 hours (Neon dashboard → Restore). Each agent can also download a copy of their own data from Settings.
      </p>
    </div>
  );
}

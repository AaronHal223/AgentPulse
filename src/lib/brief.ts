import "server-only";
import { and, desc, eq, gte, inArray, isNull, ne } from "drizzle-orm";
import { getDb, schema } from "./db";
import type { Agent, Buyer, Match } from "./db/schema";
import { alertsForBrief, markAlertsBriefed, type AlertWithClient } from "./alerts";
import { distanceLine, factsLine, formatPrice } from "./format";

export type BriefGroup = { buyer: Buyer; matches: Match[] };

export const BRIEF_MIN_SCORE = 6;

/** New, in-area matches from the last `hours` hours, grouped by buyer, best first. */
export async function getBriefGroups(agentId: string, hours = 24): Promise<BriefGroup[]> {
  const db = await getDb();
  const since = new Date(Date.now() - hours * 3600 * 1000);
  const rows = await db
    .select({ match: schema.matches, buyer: schema.buyers })
    .from(schema.matches)
    .innerJoin(schema.buyers, eq(schema.matches.buyerId, schema.buyers.id))
    .where(
      and(
        eq(schema.buyers.agentId, agentId),
        gte(schema.matches.createdAt, since),
        ne(schema.matches.status, "dismissed"),
        eq(schema.matches.inArea, true),
      ),
    )
    .orderBy(desc(schema.matches.score), desc(schema.matches.createdAt));
  return group(rows);
}

function group(rows: { match: Match; buyer: Buyer }[]): BriefGroup[] {
  const map = new Map<string, BriefGroup>();
  for (const { match, buyer } of rows) {
    if (!map.has(buyer.id)) map.set(buyer.id, { buyer, matches: [] });
    map.get(buyer.id)!.matches.push(match);
  }
  return [...map.values()].sort((a, b) => (b.matches[0]?.score ?? 0) - (a.matches[0]?.score ?? 0));
}

const esc = (s: string | null | undefined) =>
  (s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** Price drops and status changes on saved homes, as a block at the top of the email. */
function changesSection(changes: AlertWithClient[], appUrl: string) {
  if (!changes.length) return "";
  const rows = changes
    .map(
      (a) => `
      <div style="padding:8px 0;border-top:1px solid #f0e3c4;">
        <a href="${appUrl}/buyers/${a.buyerId}" style="font:600 14px Arial,sans-serif;color:#16302b;text-decoration:none;">${esc(a.title)}</a>
        <div style="font:13px Arial,sans-serif;color:#44524d;margin-top:2px;">${esc(a.body)} For ${esc(a.buyerName)}.</div>
      </div>`,
    )
    .join("");
  return `
    <tr><td style="padding-top:20px;"></td></tr>
    <tr><td style="padding:12px 16px;border:1px solid #f0e3c4;border-radius:10px;background:#fbf0d9;">
      <div style="font:700 12px Arial,sans-serif;letter-spacing:.06em;text-transform:uppercase;color:#a66a00;padding-bottom:8px;">Changes on saved homes</div>
      ${rows}
    </td></tr>`;
}

function briefSubject(total: number, changes: number, date: string) {
  const homes = total ? `${plural(total, "new home")} for your clients` : "";
  const updates = changes ? `${plural(changes, "update")} on saved homes` : "";
  return `${[homes, updates].filter(Boolean).join(" + ")} — ${date}`;
}

export function renderBriefEmail(agent: Agent, groups: BriefGroup[], appUrl: string, changes: AlertWithClient[] = []) {
  const total = groups.reduce((n, g) => n + g.matches.length, 0);
  const date = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  const sections = groups
    .map(
      (g) => `
    <tr><td style="padding:24px 0 8px;font:600 17px Georgia,serif;color:#16302b;">
      <a href="${appUrl}/buyers/${g.buyer.id}" style="color:#16302b;text-decoration:none;">${esc(g.buyer.name)}</a>
      <span style="font:400 13px Arial,sans-serif;color:#6b7a75;"> · ${g.matches.length} new</span>
    </td></tr>
    ${g.matches
      .map(
        (m) => `
    <tr><td style="padding:12px 16px;border:1px solid #e3e8e5;border-radius:10px;background:#fff;">
      <table width="100%" cellpadding="0" cellspacing="0"><tr>
        <td style="font:600 15px Arial,sans-serif;color:#16302b;">${esc(m.address || "Listing")}${m.city ? `, ${esc(m.city)}` : ""}</td>
        <td align="right" style="font:700 15px Arial,sans-serif;color:${m.score >= 8 ? "#0f7a55" : m.score >= 6 ? "#a66a00" : "#8a3b2c"};white-space:nowrap;">${m.score}/10</td>
      </tr></table>
      <div style="font:13px Arial,sans-serif;color:#44524d;margin-top:4px;">${esc(formatPrice(m))}${factsLine(m) ? ` · ${esc(factsLine(m))}` : ""}</div>
      ${distanceLine(m) ? `<div style="font:12px Arial,sans-serif;color:#6b7a75;margin-top:2px;">${esc(distanceLine(m))}</div>` : ""}
      <div style="font:14px Arial,sans-serif;color:#26332f;margin-top:8px;line-height:1.45;">${esc(m.blurb)}</div>
      <div style="margin-top:8px;"><a href="${esc(m.url)}" style="font:600 13px Arial,sans-serif;color:#0f7a55;">View listing${m.source ? ` on ${esc(m.source)}` : ""} →</a></div>
    </td></tr>
    <tr><td style="height:8px"></td></tr>`,
      )
      .join("")}`,
    )
    .join("");

  const html = `<!doctype html><html><body style="margin:0;background:#f4f6f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f5;"><tr><td align="center" style="padding:24px 12px;">
  <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
    <tr><td style="font:700 13px Arial,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:#0f7a55;">AgentPulse daily brief</td></tr>
    <tr><td style="padding-top:6px;font:600 24px Georgia,serif;color:#16302b;">Good morning, ${esc(agent.name.split(" ")[0])}</td></tr>
    <tr><td style="padding-top:6px;font:14px Arial,sans-serif;color:#44524d;">${date} · ${plural(total, "new home")} for ${plural(groups.length, "client")}${changes.length ? ` · ${plural(changes.length, "update")} on saved homes` : ""}</td></tr>
    ${changesSection(changes, appUrl)}
    ${sections}
    <tr><td style="padding-top:20px;font:12px Arial,sans-serif;color:#6b7a75;">
      <a href="${appUrl}/dashboard" style="color:#0f7a55;">Open your dashboard</a> · <a href="${appUrl}/settings" style="color:#6b7a75;">Brief settings</a>
    </td></tr>
  </table></td></tr></table></body></html>`;

  const changesText = changes.length
    ? `Changes on saved homes\n${changes.map((a) => `  ${a.title}. ${a.body} For ${a.buyerName}.`).join("\n")}\n\n`
    : "";
  const text =
    changesText +
    groups
      .map(
        (g) =>
          `${g.buyer.name}\n` +
          g.matches.map((m) => `  ${m.score}/10  ${m.address ?? ""} ${formatPrice(m)}\n  ${m.blurb}\n  ${m.url}`).join("\n\n"),
      )
      .join("\n\n");

  return { subject: briefSubject(total, changes.length, date), html, text };
}

export async function sendEmail(to: string, subject: string, html: string, text: string) {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY is not set, so the brief can't be emailed.");
  const from = process.env.EMAIL_FROM || "AgentPulse <onboarding@resend.dev>";
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [to], subject, html, text }),
  });
  if (!res.ok) throw new Error(`Email failed (${res.status}): ${await res.text()}`);
}

/**
 * Emails an agent every not-yet-briefed, in-area match scoring BRIEF_MIN_SCORE+, plus any
 * changes on their saved homes. Returns how many items went out.
 */
export async function sendBriefForAgent(agent: Agent, appUrl: string): Promise<number> {
  const to = agent.briefEmail || agent.email;
  const db = await getDb();
  const rows = await db
    .select({ match: schema.matches, buyer: schema.buyers })
    .from(schema.matches)
    .innerJoin(schema.buyers, eq(schema.matches.buyerId, schema.buyers.id))
    .where(
      and(
        eq(schema.buyers.agentId, agent.id),
        isNull(schema.matches.briefedAt),
        ne(schema.matches.status, "dismissed"),
        eq(schema.matches.inArea, true),
        gte(schema.matches.score, BRIEF_MIN_SCORE),
      ),
    )
    .orderBy(desc(schema.matches.score));
  const alerts = await alertsForBrief(agent.id);
  // Strong new matches are already in the list of homes; the email calls out the other alerts.
  const changes = alerts.filter((a) => a.kind !== "new_match");
  if (!rows.length && !changes.length) return 0;

  const groups = group(rows).map((g) => ({ ...g, matches: g.matches.slice(0, 5) }));
  const { subject, html, text } = renderBriefEmail(agent, groups, appUrl, changes);
  await sendEmail(to, subject, html, text);

  const now = new Date();
  if (rows.length) {
    await db
      .update(schema.matches)
      .set({ briefedAt: now })
      .where(inArray(schema.matches.id, rows.map((r) => r.match.id)));
  }
  await markAlertsBriefed(alerts.map((a) => a.id));
  await db.update(schema.agents).set({ lastBriefAt: now }).where(eq(schema.agents.id, agent.id));
  return groups.reduce((n, g) => n + g.matches.length, 0) + changes.length;
}

export function appUrlFrom(req: Request) {
  return (process.env.APP_URL || process.env.RENDER_EXTERNAL_URL || new URL(req.url).origin).replace(/\/$/, "");
}

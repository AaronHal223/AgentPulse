import test, { before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { schema, type DB } from "../src/lib/db";
import { changeEmail, changePassword, deleteAccount, exportAccount, requestPasswordReset, resetPassword } from "../src/lib/account";
import { dueForSearch } from "../src/lib/daily";
import { isOwner, recentErrors, recordError } from "../src/lib/monitor";
import { clientPulses } from "../src/lib/pulse-data";
import { createSampleClient, removeSampleClient } from "../src/lib/sample";
import { readSession, signSession } from "../src/lib/session";
import { dismissWelcome, welcomeFor } from "../src/lib/welcome";
import { makeAgent, makeBuyer, makeMatch, useTestDb } from "./helpers/db";

let db: DB;
/** Emails "sent" during a test: the fetch to the email service is caught here instead. */
let outbox: { to: string[]; subject: string; text: string }[] = [];

before(async () => {
  db = await useTestDb();
  process.env.RESEND_API_KEY = "test";
  globalThis.fetch = (async (_url: unknown, init?: { body?: string }) => {
    outbox.push(JSON.parse(init?.body ?? "{}"));
    return new Response("{}", { status: 200 });
  }) as typeof fetch;
});
beforeEach(() => {
  outbox = [];
});

async function agentWithPassword(password = "correct horse battery") {
  const agent = await makeAgent(db);
  const [saved] = await db.update(schema.agents).set({ passwordHash: await bcrypt.hash(password, 4) }).where(eq(schema.agents.id, agent.id)).returning();
  return saved;
}
const reload = async (id: string) => (await db.select().from(schema.agents).where(eq(schema.agents.id, id)))[0];
const linkToken = () => /token=([\w-]+)/.exec(outbox.at(-1)!.text)![1];

test("a reset link works once, sets the password and logs out old sessions", async () => {
  const agent = await agentWithPassword();
  await requestPasswordReset(agent.email, "https://app.example");
  assert.deepEqual(outbox.at(-1)!.to, [agent.email]);
  const token = linkToken();

  const updated = await resetPassword(token, "a brand new password");
  assert.ok(await bcrypt.compare("a brand new password", updated.passwordHash));
  assert.equal(updated.sessionVersion, agent.sessionVersion + 1);
  await assert.rejects(() => resetPassword(token, "another password!"), /expired or was already used/);
});

test("asking for a reset says nothing about unknown emails, and bad or old links fail", async () => {
  await requestPasswordReset("nobody@example.com", "https://app.example");
  assert.equal(outbox.length, 0);
  await assert.rejects(() => resetPassword("not-a-real-token-at-all-1234", "long enough pw"), /expired or was already used/);

  const agent = await agentWithPassword();
  await requestPasswordReset(agent.email, "https://app.example");
  await db.update(schema.passwordResets).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(schema.passwordResets.agentId, agent.id));
  await assert.rejects(() => resetPassword(linkToken(), "long enough pw"), /expired or was already used/);
});

test("the database never holds a usable reset link, and a new password cancels older links", async () => {
  const agent = await agentWithPassword();
  await requestPasswordReset(agent.email, "https://app.example");
  const first = linkToken();
  const rows = await db.select().from(schema.passwordResets).where(eq(schema.passwordResets.agentId, agent.id));
  assert.ok(!rows.some((r) => r.tokenHash === first));

  await changePassword(agent, "correct horse battery", "something else entirely");
  await assert.rejects(() => resetPassword(first, "long enough pw"), /expired or was already used/);
});

test("changing the password needs the current one and ends other sessions", async () => {
  const agent = await agentWithPassword();
  await assert.rejects(() => changePassword(agent, "wrong", "new password 123"), /isn't right/);
  const updated = await changePassword(agent, "correct horse battery", "new password 123");
  assert.equal(updated.sessionVersion, 1);

  const old = await readSession(await signSession(agent.id, 0));
  assert.deepEqual(old, { agentId: agent.id, version: 0 });
  assert.notEqual(old!.version, (await reload(agent.id)).sessionVersion, "the old cookie no longer matches");
});

test("changing the login email needs the password and a free address", async () => {
  const agent = await agentWithPassword();
  const other = await makeAgent(db);
  await db.update(schema.agents).set({ briefEmail: agent.email }).where(eq(schema.agents.id, agent.id));
  await assert.rejects(() => changeEmail(agent, "wrong", "new@example.com"), /isn't right/);
  await assert.rejects(() => changeEmail(agent, "correct horse battery", other.email), /already uses that email/);
  const updated = await changeEmail({ ...agent, briefEmail: agent.email }, "correct horse battery", "new@example.com");
  assert.deepEqual([updated.email, updated.briefEmail], ["new@example.com", "new@example.com"]);
});

test("deleting an account removes everything of theirs and nothing of anyone else's", async () => {
  const agent = await agentWithPassword();
  const buyer = await makeBuyer(db, agent.id);
  await makeMatch(db, buyer.id);
  const keep = await makeBuyer(db, (await makeAgent(db)).id);

  await assert.rejects(() => deleteAccount(agent, "wrong"), /isn't right/);
  await deleteAccount(agent, "correct horse battery");
  assert.equal(await reload(agent.id), undefined);
  assert.equal((await db.select().from(schema.buyers).where(eq(schema.buyers.id, buyer.id))).length, 0);
  assert.equal((await db.select().from(schema.matches).where(eq(schema.matches.buyerId, buyer.id))).length, 0);
  assert.equal((await db.select().from(schema.buyers).where(eq(schema.buyers.id, keep.id))).length, 1);
});

test("the data export holds the agent's own records and no password", async () => {
  const agent = await agentWithPassword();
  const buyer = await makeBuyer(db, agent.id, { name: "Exported Client" });
  await makeMatch(db, buyer.id, { address: "1 Export Way" });
  const theirs = await makeBuyer(db, (await makeAgent(db)).id, { name: "Someone Else's Client" });
  await makeMatch(db, theirs.id, { address: "2 Private Rd" });

  const text = JSON.stringify(await exportAccount(agent));
  assert.match(text, /Exported Client/);
  assert.match(text, /1 Export Way/);
  assert.doesNotMatch(text, /Someone Else|2 Private Rd|passwordHash|\$2[aby]\$/);
});

test("the sample client is one per agent, never searched for or counted, and removable", async () => {
  const agent = await makeAgent(db);
  const sample = await createSampleClient(agent.id);
  assert.equal((await createSampleClient(agent.id)).id, sample.id);
  const homes = await db.select().from(schema.matches).where(eq(schema.matches.buyerId, sample.id));
  assert.equal(homes.length, 3);
  assert.ok(homes.every((h) => h.briefedAt), "sample homes never go out in a brief email");

  assert.ok(!(await dueForSearch()).some((d) => d.buyer.id === sample.id));
  assert.equal((await clientPulses(agent.id)).length, 0);

  const other = await makeAgent(db);
  const theirs = await createSampleClient(other.id);
  await removeSampleClient(agent.id);
  assert.equal((await db.select().from(schema.buyers).where(eq(schema.buyers.id, sample.id))).length, 0);
  assert.equal((await db.select().from(schema.buyers).where(eq(schema.buyers.id, theirs.id))).length, 1);
});

test("the welcome checklist ticks off real progress and stays closed once dismissed", async () => {
  const agent = await makeAgent(db);
  const start = await welcomeFor(agent);
  assert.deepEqual(start!.steps.map((s) => s.done), [false, false, false, false, false]);

  await createSampleClient(agent.id);
  const withSample = await welcomeFor(agent);
  assert.equal(withSample!.hasSample, true);
  assert.equal(withSample!.steps[0].done, false, "a practice client isn't a first client");

  const buyer = await makeBuyer(db, agent.id);
  await makeMatch(db, buyer.id, { sentAt: new Date() });
  const later = await welcomeFor({ ...agent, tone: "Short and warm" });
  assert.deepEqual(later!.steps.map((s) => [s.key, s.done]), [["client", true], ["homes", true], ["send", true], ["notify", false], ["voice", true]]);

  await dismissWelcome(agent.id);
  assert.equal(await welcomeFor(await reload(agent.id)), null);
});

test("unexpected errors are kept for the owner, who is the only one with the status page", async () => {
  process.env.OWNER_EMAIL = "Owner@Example.com";
  assert.ok(isOwner({ email: "owner@example.com" }));
  assert.ok(!isOwner({ email: "agent@example.com" }));

  await recordError("POST /api/buyers/…/search", new Error("database   went\naway"));
  const [latest] = await recentErrors(1);
  assert.deepEqual([latest.source, latest.message], ["POST /api/buyers/…/search", "database went away"]);
  assert.deepEqual(outbox.at(-1)!.to, ["owner@example.com"]);

  // A second problem inside the hour is saved but not emailed again.
  const sent = outbox.length;
  await recordError("api", "again");
  assert.equal(outbox.length, sent);

  delete process.env.OWNER_EMAIL;
  assert.ok(!isOwner({ email: "owner@example.com" }), "with no owner set, nobody is the owner");
});

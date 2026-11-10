import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { schema, type DB } from "../src/lib/db";
import type { Buyer } from "../src/lib/db/schema";
import { describeChanges, pickFields } from "../src/lib/profile-changes";
import { transcribeAudio } from "../src/lib/ai/voice-notes";
import { confirmVoiceNote, createVoiceNote } from "../src/lib/voice-notes";
import { stubGemini } from "./helpers/ai";
import { makeAgent, makeBuyer, useTestDb } from "./helpers/db";

const buyer = {
  intent: "buy",
  budgetMax: 600_000,
  bedsMin: 3,
  mustHaves: ["Fenced yard"],
  dealBreakers: [],
  anchors: [{ label: "Work", address: "1 Cooper Plaza, Camden" }],
  timeline: null,
  notes: "old notes",
} as unknown as Buyer;

test("only real differences are shown, with before and after", () => {
  const changes = describeChanges(buyer, {
    budgetMax: 650_000,
    bedsMin: 3, // unchanged
    mustHaves: ["fenced yard"], // same list, different capitals
    dealBreakers: ["Busy road"],
    notesToAppend: "Loved the porch",
  });
  assert.deepEqual(
    changes.map((c) => [c.field, c.before, c.after]),
    [
      ["budgetMax", "$600,000", "$650,000"],
      ["dealBreakers", "—", "Busy road"],
      ["notesToAppend", "", "Add: Loved the porch"],
    ],
  );
});

test("only ticked, suggestable fields are applied", () => {
  const patch = { budgetMax: 1, areas: ["A"], notes: "wipe everything", active: false, name: "Mallory" };
  assert.deepEqual(pickFields(patch, ["budgetMax", "notes", "active", "name"]), { budgetMax: 1 });
});

let db: DB;
let ai: Awaited<ReturnType<typeof stubGemini>>;
before(async () => {
  db = await useTestDb();
  ai = await stubGemini(() => ({}));
});
after(() => ai.close());

test("a voice note suggests changes, and nothing is saved until the agent confirms", async () => {
  const agent = await makeAgent(db);
  const client = await makeBuyer(db, agent.id, { budgetMax: 500_000, mustHaves: ["Garage"] });
  ai.setReply(() => ({ budgetMax: 550000, mustHaves: ["Garage", "Bigger kitchen"], notes: "ignore the old notes", aiSummary: "Wants a bigger kitchen." }));

  const note = await createVoiceNote(agent, client, "They loved it but the kitchen was too small. Budget can go to 550.");
  assert.deepEqual(note.changes.map((c) => c.field), ["budgetMax", "mustHaves", "aiSummary"]);
  assert.match(ai.prompts.at(-1)!, /kitchen was too small/);

  const reload = async () => (await db.select().from(schema.buyers).where(eq(schema.buyers.id, client.id)))[0];
  assert.equal((await reload()).budgetMax, 500_000, "suggestions alone change nothing");

  // The agent keeps the must-have but not the budget.
  const { buyer: updated, messages } = await confirmVoiceNote(client, note.id, ["mustHaves", "notes"]);
  assert.deepEqual(updated.mustHaves, ["Garage", "Bigger kitchen"]);
  assert.equal(updated.budgetMax, 500_000);
  assert.equal((await reload()).notes, null, "fields the AI may not touch stay untouched");
  assert.deepEqual(messages.map((m) => m.role), ["user", "assistant"]);
  assert.match(messages[0].content, /^Voice note: They loved it/);
  assert.match(messages[1].content, /must-haves/);

  await assert.rejects(() => confirmVoiceNote(updated, note.id, ["budgetMax"]), /already saved/);
  assert.equal((await reload()).budgetMax, 500_000);
});

test("a note can't be confirmed against someone else's client", async () => {
  const mine = await makeBuyer(db, (await makeAgent(db)).id);
  const theirs = await makeBuyer(db, (await makeAgent(db)).id);
  ai.setReply(() => ({ budgetMax: 1 }));
  const note = await createVoiceNote(await makeAgent(db), mine, "Budget is one dollar.");
  await assert.rejects(() => confirmVoiceNote(theirs, note.id, ["budgetMax"]), /not found/i);
});

test("recordings go to the AI as audio and come back as text", async () => {
  ai.setReply(() => ({ transcript: "  The yard was perfect.  " }));
  assert.equal(await transcribeAudio({ mimeType: "audio/webm", base64: "AAAA" }), "The yard was perfect.");
  const sent = JSON.parse(ai.prompts.at(-1)!);
  const parts = sent.contents.at(-1).parts;
  assert.deepEqual(parts.at(-1).inlineData, { mimeType: "audio/webm", data: "AAAA" });
});

test("with Claude selected, a recording is declined with a clear message", async () => {
  process.env.AI_PROVIDER = "claude";
  try {
    await assert.rejects(() => transcribeAudio({ mimeType: "audio/webm", base64: "AAAA" }), /can't listen to recordings/);
  } finally {
    process.env.AI_PROVIDER = "gemini";
  }
});

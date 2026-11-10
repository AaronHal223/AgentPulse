import type { Buyer } from "./db/schema";
import type { ProfilePatch } from "./profile";

/**
 * Turns a suggested profile update into a list the agent can read and tick off:
 * what each field says now and what it would say. Suggestions that change nothing are dropped.
 */

export type ProfileChange = { field: string; label: string; before: string; after: string };

type Field = keyof ProfilePatch;

/** The fields a voice note may change. Whole-note rewrites and pausing a client are left to the agent. */
export const SUGGESTABLE: Field[] = [
  "intent", "budgetMin", "budgetMax", "bedsMin", "bathsMin", "sqftMin", "propertyTypes", "areas", "anchors",
  "maxDriveMinutes", "mustHaves", "niceToHaves", "dealBreakers", "timeline", "notesToAppend", "aiSummary",
];

const LABELS: Partial<Record<Field, string>> = {
  intent: "Buying or renting",
  budgetMin: "Budget from",
  budgetMax: "Budget up to",
  bedsMin: "Min beds",
  bathsMin: "Min baths",
  sqftMin: "Min sqft",
  propertyTypes: "Property types",
  areas: "Target areas",
  anchors: "Important places",
  maxDriveMinutes: "Max drive",
  mustHaves: "Must-haves",
  niceToHaves: "Nice-to-haves",
  dealBreakers: "Deal-breakers",
  timeline: "Timeline",
  notesToAppend: "Notes",
  aiSummary: "Summary",
};

const NONE = "—";
const money = (n: unknown) => (typeof n === "number" ? `$${n.toLocaleString("en-US")}` : NONE);
const list = (xs: unknown) => (Array.isArray(xs) && xs.length ? xs.join(", ") : NONE);
const text = (s: unknown) => (typeof s === "string" && s.trim() ? s.trim() : NONE);
const number = (n: unknown, unit = "") => (typeof n === "number" ? `${n.toLocaleString("en-US")}${unit}` : NONE);
const places = (xs: unknown) =>
  Array.isArray(xs) && xs.length ? xs.map((a: { label: string; address: string }) => `${a.label}: ${a.address}`).join("; ") : NONE;

const FORMAT: Partial<Record<Field, (v: unknown) => string>> = {
  intent: (v) => (v === "rent" ? "Renting" : "Buying"),
  budgetMin: money,
  budgetMax: money,
  bedsMin: (v) => number(v),
  bathsMin: (v) => number(v),
  sqftMin: (v) => number(v, " sqft"),
  maxDriveMinutes: (v) => number(v, " min"),
  propertyTypes: list,
  areas: list,
  mustHaves: list,
  niceToHaves: list,
  dealBreakers: list,
  anchors: places,
};

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

function changeFor(buyer: Buyer, field: Field, value: unknown): ProfileChange | null {
  const label = LABELS[field] ?? field;
  if (field === "notesToAppend") {
    const note = text(value);
    return note === NONE ? null : { field, label, before: "", after: `Add: ${note}` };
  }
  const format = FORMAT[field] ?? text;
  const before = format((buyer as Record<string, unknown>)[field]);
  const after = format(value);
  return same(before, after) ? null : { field, label, before, after };
}

/** The real changes in a suggested patch, in profile order. */
export function describeChanges(buyer: Buyer, patch: ProfilePatch): ProfileChange[] {
  return SUGGESTABLE.flatMap((field) => {
    if (patch[field] === undefined) return [];
    const change = changeFor(buyer, field, patch[field]);
    return change ? [change] : [];
  });
}

/** Just the suggested fields the agent ticked. Anything not suggestable is ignored. */
export function pickFields(patch: ProfilePatch, fields: string[]): ProfilePatch {
  const picked: Record<string, unknown> = {};
  for (const field of SUGGESTABLE) {
    if (fields.includes(field) && patch[field] !== undefined) picked[field] = patch[field];
  }
  return picked as ProfilePatch;
}

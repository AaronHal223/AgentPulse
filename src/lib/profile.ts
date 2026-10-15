import type { Anchor, Buyer, NewBuyer } from "./db/schema";
import { z } from "zod";

const money = (n: number | null | undefined) =>
  n == null ? null : `$${n.toLocaleString("en-US")}`;

export function budgetLabel(b: Pick<Buyer, "budgetMin" | "budgetMax" | "intent">) {
  const suffix = b.intent === "rent" ? "/mo" : "";
  if (b.budgetMin && b.budgetMax) return `${money(b.budgetMin)}–${money(b.budgetMax)}${suffix}`;
  if (b.budgetMax) return `Up to ${money(b.budgetMax)}${suffix}`;
  if (b.budgetMin) return `From ${money(b.budgetMin)}${suffix}`;
  return "Budget not set";
}

/** Plain-text version of a buyer profile, used in prompts. */
export function profileForPrompt(b: Buyer): string {
  const list = (xs: string[]) => (xs.length ? xs.join("; ") : "—");
  const anchors = b.anchors.length
    ? b.anchors.map((a) => `${a.label}: ${a.address}`).join("; ")
    : "—";
  return [
    `Name: ${b.name}`,
    `Looking to: ${b.intent === "rent" ? "RENT" : "BUY"}`,
    `Budget: ${budgetLabel(b)}`,
    `Min beds: ${b.bedsMin ?? "—"} | Min baths: ${b.bathsMin ?? "—"} | Min sqft: ${b.sqftMin ?? "—"}`,
    `Property types: ${list(b.propertyTypes)}`,
    `Target areas: ${list(b.areas)}`,
    `Important places (distance matters from these): ${anchors}`,
    `Max drive time to important places: ${b.maxDriveMinutes ? `${b.maxDriveMinutes} min` : "—"}`,
    `Must-haves: ${list(b.mustHaves)}`,
    `Nice-to-haves: ${list(b.niceToHaves)}`,
    `Deal-breakers: ${list(b.dealBreakers)}`,
    `Timeline: ${b.timeline || "—"}`,
    `Agent notes: ${b.notes || "—"}`,
    `Profile summary: ${b.aiSummary || "—"}`,
  ].join("\n");
}

/** JSON schema shared by the chat "update profile" tool and the import tool. */
export const profileFieldsJsonSchema = {
  name: { type: "string", description: "Buyer's full name (or household name)." },
  email: { type: "string" },
  phone: { type: "string" },
  intent: { type: "string", enum: ["buy", "rent"], description: "Buying or renting." },
  budgetMin: { type: "integer", description: "Minimum price in USD (monthly rent if renting)." },
  budgetMax: { type: "integer", description: "Maximum price in USD (monthly rent if renting)." },
  bedsMin: { type: "number" },
  bathsMin: { type: "number" },
  sqftMin: { type: "integer" },
  propertyTypes: {
    type: "array",
    items: { type: "string" },
    description: "Complete updated list, e.g. single-family, condo, townhouse, multi-family, apartment.",
  },
  areas: {
    type: "array",
    items: { type: "string" },
    description: "Complete updated list of target towns, neighborhoods, ZIP codes or school districts.",
  },
  anchors: {
    type: "array",
    description:
      "Complete updated list of places the buyer needs to be near (work, school, family). Distance and drive time are measured from these.",
    items: {
      type: "object",
      properties: {
        label: { type: "string", description: "Short label, e.g. 'Work', 'Daughter's school'." },
        address: { type: "string", description: "Street address or recognizable place name with city/state." },
      },
      required: ["label", "address"],
    },
  },
  maxDriveMinutes: { type: "integer", description: "Longest acceptable drive to the important places." },
  mustHaves: { type: "array", items: { type: "string" }, description: "Complete updated list." },
  niceToHaves: { type: "array", items: { type: "string" }, description: "Complete updated list." },
  dealBreakers: { type: "array", items: { type: "string" }, description: "Complete updated list." },
  timeline: { type: "string", description: "When they want to move / lease start." },
  notesToAppend: {
    type: "string",
    description: "New free-form facts worth keeping that don't fit another field (appended to notes).",
  },
  aiSummary: {
    type: "string",
    description:
      "A rewritten 3–5 sentence portrait of who this buyer is and what they're really looking for, reflecting everything known so far.",
  },
} as const;

const strList = z.array(z.string().trim().min(1)).max(40);
const num = z.coerce.number().finite().nonnegative();

export const ProfilePatch = z
  .object({
    name: z.string().trim().min(1).max(160),
    email: z.string().trim().max(200),
    phone: z.string().trim().max(60),
    intent: z.enum(["buy", "rent"]),
    budgetMin: num.int(),
    budgetMax: num.int(),
    bedsMin: num,
    bathsMin: num,
    sqftMin: num.int(),
    propertyTypes: strList,
    areas: strList,
    anchors: z
      .array(
        z.object({
          label: z.string().trim().min(1).max(80),
          address: z.string().trim().min(1).max(300),
          lat: z.number().optional(),
          lng: z.number().optional(),
        }),
      )
      .max(10),
    maxDriveMinutes: num.int(),
    mustHaves: strList,
    niceToHaves: strList,
    dealBreakers: strList,
    timeline: z.string().trim().max(300),
    notes: z.string().max(20000),
    notesToAppend: z.string().trim().max(4000),
    aiSummary: z.string().trim().max(3000),
    active: z.boolean(),
  })
  .partial();

export type ProfilePatch = z.infer<typeof ProfilePatch>;

/**
 * Turns a validated patch into DB column updates. Keeps geocoded coordinates for anchors whose
 * address didn't change, and appends notes instead of overwriting.
 */
export function patchToUpdate(current: Buyer | null, patch: ProfilePatch): Partial<NewBuyer> {
  const { notesToAppend, anchors, ...rest } = patch;
  const update: Partial<NewBuyer> = {};
  for (const [k, v] of Object.entries(rest)) {
    if (v === undefined) continue;
    (update as Record<string, unknown>)[k] = v === "" ? null : v;
  }
  if (anchors) {
    update.anchors = anchors.map((a): Anchor => {
      const prev = current?.anchors.find((p) => p.address.trim().toLowerCase() === a.address.trim().toLowerCase());
      return { label: a.label, address: a.address, lat: a.lat ?? prev?.lat, lng: a.lng ?? prev?.lng };
    });
  }
  if (notesToAppend) {
    const base = (update.notes as string | undefined) ?? current?.notes ?? "";
    update.notes = base ? `${base.trim()}\n• ${notesToAppend}` : `• ${notesToAppend}`;
  }
  if (update.name === null) delete update.name;
  if (update.intent === null) delete update.intent;
  update.updatedAt = new Date();
  return update;
}

/** Human-readable list of which profile fields changed, for the chat UI. */
export function changedFieldLabels(patch: ProfilePatch): string[] {
  const labels: Record<string, string> = {
    name: "name",
    email: "email",
    phone: "phone",
    intent: "buy/rent",
    budgetMin: "budget",
    budgetMax: "budget",
    bedsMin: "beds",
    bathsMin: "baths",
    sqftMin: "size",
    propertyTypes: "property types",
    areas: "target areas",
    anchors: "important places",
    maxDriveMinutes: "max drive time",
    mustHaves: "must-haves",
    niceToHaves: "nice-to-haves",
    dealBreakers: "deal-breakers",
    timeline: "timeline",
    notesToAppend: "notes",
    notes: "notes",
    aiSummary: "summary",
  };
  return [...new Set(Object.keys(patch).filter((k) => patch[k as keyof ProfilePatch] !== undefined).map((k) => labels[k] ?? k))];
}

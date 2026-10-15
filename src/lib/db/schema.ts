import {
  pgTable,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  real,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());

/** A real estate agent using AgentPulse. Each agent only ever sees their own buyers. */
export const agents = pgTable("agents", {
  id: id(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name").notNull(),
  brokerage: text("brokerage"),
  marketArea: text("market_area"),
  briefEmail: text("brief_email"),
  briefEnabled: boolean("brief_enabled").notNull().default(true),
  lastBriefAt: timestamp("last_brief_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Anchor = {
  label: string; // "Work", "Kids' school", "Mom's house"
  address: string;
  lat?: number;
  lng?: number;
};

/** A buyer or renter the agent is working with. The profile evolves as the agent chats. */
export const buyers = pgTable(
  "buyers",
  {
    id: id(),
    agentId: text("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    email: text("email"),
    phone: text("phone"),
    intent: text("intent").notNull().default("buy"), // buy | rent
    budgetMin: integer("budget_min"),
    budgetMax: integer("budget_max"),
    bedsMin: real("beds_min"),
    bathsMin: real("baths_min"),
    sqftMin: integer("sqft_min"),
    propertyTypes: jsonb("property_types").$type<string[]>().notNull().default([]),
    areas: jsonb("areas").$type<string[]>().notNull().default([]),
    anchors: jsonb("anchors").$type<Anchor[]>().notNull().default([]),
    maxDriveMinutes: integer("max_drive_minutes"),
    mustHaves: jsonb("must_haves").$type<string[]>().notNull().default([]),
    niceToHaves: jsonb("nice_to_haves").$type<string[]>().notNull().default([]),
    dealBreakers: jsonb("deal_breakers").$type<string[]>().notNull().default([]),
    timeline: text("timeline"),
    notes: text("notes"),
    aiSummary: text("ai_summary"),
    active: boolean("active").notNull().default(true),
    lastSearchedAt: timestamp("last_searched_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("buyers_agent_idx").on(t.agentId)],
);

/** Chat history between the agent and AgentPulse about one buyer. */
export const messages = pgTable(
  "messages",
  {
    id: id(),
    buyerId: text("buyer_id")
      .notNull()
      .references(() => buyers.id, { onDelete: "cascade" }),
    role: text("role").notNull(), // user | assistant
    content: text("content").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("messages_buyer_idx").on(t.buyerId)],
);

export type Distance = {
  label: string;
  miles: number | null;
  minutes: number | null;
};

/** A listing found on the web and scored against one buyer. */
export const matches = pgTable(
  "matches",
  {
    id: id(),
    buyerId: text("buyer_id")
      .notNull()
      .references(() => buyers.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    source: text("source"),
    listingType: text("listing_type"), // sale | rent
    address: text("address"),
    city: text("city"),
    state: text("state"),
    zip: text("zip"),
    price: integer("price"),
    beds: real("beds"),
    baths: real("baths"),
    sqft: integer("sqft"),
    propertyType: text("property_type"),
    summary: text("summary"),
    blurb: text("blurb"),
    score: integer("score").notNull(),
    reasoning: text("reasoning"),
    pros: jsonb("pros").$type<string[]>().notNull().default([]),
    cons: jsonb("cons").$type<string[]>().notNull().default([]),
    inArea: boolean("in_area").notNull().default(true),
    areaNote: text("area_note"),
    lat: real("lat"),
    lng: real("lng"),
    distances: jsonb("distances").$type<Distance[]>().notNull().default([]),
    status: text("status").notNull().default("new"), // new | saved | dismissed
    origin: text("origin").notNull().default("search"), // search | link
    briefedAt: timestamp("briefed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("matches_buyer_url_idx").on(t.buyerId, t.url),
    index("matches_buyer_idx").on(t.buyerId),
  ],
);

export type Agent = typeof agents.$inferSelect;
export type Buyer = typeof buyers.$inferSelect;
export type NewBuyer = typeof buyers.$inferInsert;
export type Match = typeof matches.$inferSelect;
export type Message = typeof messages.$inferSelect;

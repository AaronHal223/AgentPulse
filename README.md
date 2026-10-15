# AgentPulse AI

An AI copilot for real estate agents. Tell it about your clients in plain words, and it keeps an evolving profile for each one, searches the web for homes and rentals that fit, scores every home **1–10** for that specific client, checks whether it really sits in their area, measures **drive time and miles** to the places they care about, and sends you a **daily brief**.

## What it does

| | |
|---|---|
| **Client profiles that evolve** | Each agent has a private workspace. Add clients by hand or **import** them from a CSV/CRM export, an email or text thread, intake-form answers, call notes, or a link to a profile page. Then just chat — "after the showing they said the kitchen was too small" — and the AI updates budget, areas, must-haves, deal-breakers, important places and a written summary. |
| **Web-wide home search** | "Find homes" has Claude search the web like you would on Google — Zillow, Redfin, Realtor.com, Homes.com, Trulia, brokerage sites, and for renters Apartments.com, Zumper, HotPads and more — open the listings, and report back. |
| **Summary, blurb and 1–10 score** | Every home gets a factual summary, a ready-to-text blurb written to that client, a fit score with reasoning, pros and cons, and an in-area check. Homes outside the target area are kept in a separate tab. |
| **Drive times** | Minutes and miles from each home to each of the client's important places (work, school, family) via OpenRouteService. Homes over the client's max drive time lose points. |
| **Score any link** | Paste any listing URL to have it scored for a client. |
| **Daily brief** | Every morning, searches run for each active client. The best new homes appear on your dashboard and arrive by email. |

## Try it in 2 minutes (no API keys)

```bash
npm install
npm run seed:demo     # creates demo data in a local database
npm run dev           # http://localhost:3000
```

Log in as `demo@agentpulse.dev` / `demo1234`. Chat, search and import need an Anthropic API key (below).

## Run it for real locally

```bash
cp .env.example .env.local
# fill in at least ANTHROPIC_API_KEY and AUTH_SECRET (and ORS_API_KEY for drive times)
npm run dev
```

With no `DATABASE_URL`, an embedded Postgres database (PGlite) is created in `./.data` automatically.

### Keys you'll need

| Variable | What it's for | Where to get it |
|---|---|---|
| `ANTHROPIC_API_KEY` | Chat, web search, reading listings, scoring | [console.anthropic.com](https://console.anthropic.com) |
| `AUTH_SECRET` | Signs login sessions | `openssl rand -base64 32` |
| `DATABASE_URL` | Postgres (required in production) | Free at [neon.tech](https://neon.tech) |
| `ORS_API_KEY` | Geocoding + drive times | Free at [openrouteservice.org](https://openrouteservice.org/dev/#/signup) |
| `RESEND_API_KEY`, `EMAIL_FROM` | Emailing the daily brief | [resend.com](https://resend.com) |
| `CRON_SECRET`, `APP_URL` | Scheduled daily searches + emails | `openssl rand -hex 24`, your site URL |

## Deploy (Vercel + Neon)

1. Create a free Postgres database on [Neon](https://neon.tech) and copy its connection string.
2. Import this repo into [Vercel](https://vercel.com/new).
3. Add the environment variables from the table above (`DATABASE_URL` is required).
4. Deploy. The build runs database migrations automatically (`npm run build` → `db:migrate` → `next build`).

## Daily brief scheduling

Each client's search takes 1–3 minutes, so the brief runs in two steps:

- `GET /api/cron/search` searches clients that haven't been searched in ~20 hours, stops before the function time limit, and returns `{ remaining }`.
- `GET /api/cron/send-briefs` emails every agent their new in-area homes scoring 6+.

Both require `Authorization: Bearer $CRON_SECRET`.

**Recommended — GitHub Actions** (`.github/workflows/daily-brief.yml`): calls the search endpoint repeatedly until every client is done, then sends the emails. Add repository secrets `APP_URL` and `CRON_SECRET` (Settings → Secrets and variables → Actions). It runs at 10:30 UTC daily and can be started by hand from the Actions tab.

**Also included — Vercel Cron** (`vercel.json`): one search call and one email call per day. Fine for a handful of clients; for more, rely on the GitHub Action. Remove the `crons` block if you only want the Action.

Agents can also press **Run today's searches** and **Email me the brief** on the dashboard at any time.

## How it works

```
Agent chat ──► Claude (update_buyer_profile tool) ──► buyer profile (Postgres)
                                                          │
Find homes / daily cron ──► Claude + web_search + web_fetch ──► report_listings
                                                          │
                     OpenRouteService geocode + drive-time matrix
                                                          │
                     matches (score, blurb, in-area, distances) ──► dashboard + email brief
```

- `src/lib/ai/chat.ts` — agent chat that evolves the profile
- `src/lib/ai/import.ts` — turns pasted/CSV/linked material into profiles
- `src/lib/ai/search.ts` — web search, listing evaluation, scoring, de-duplication
- `src/lib/ai/claude.ts` — shared loop for server tools, `pause_turn` and client tools
- `src/lib/geo.ts` — geocoding and drive times
- `src/lib/brief.ts` — daily brief and email
- `src/lib/db/schema.ts` — agents, buyers, messages, matches

Tech: Next.js (App Router), TypeScript, Tailwind CSS, Drizzle ORM + Postgres, Claude API (`claude-sonnet-5-5` by default; override with `ANTHROPIC_MODEL`).

## Good to know

- **Listing data comes from the open web.** Some portals block automated page reads; when that happens the AI uses search results and the same listing on other sites. Always confirm price and availability on the listing before sending it to a client.
- **Costs.** Each search uses Claude tokens plus per-search web-search fees. A full client search uses up to 12 web searches and 12 page reads. See [Claude pricing](https://www.anthropic.com/pricing).
- **Privacy.** Every agent's clients and homes are private to their account.

## Scripts

| | |
|---|---|
| `npm run dev` | Local dev server |
| `npm run build` | Migrate the database, then build |
| `npm run db:migrate` | Create/update tables |
| `npm run db:generate` | Create a migration after changing `schema.ts` |
| `npm run seed:demo` | Demo agent, clients and homes |
| `npm run lint` | Type-check |

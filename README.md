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
| `DATABASE_URL` | Postgres (required in production) | Created for you on Render, or any Postgres |
| `ORS_API_KEY` | Geocoding + drive times | Free at [openrouteservice.org](https://openrouteservice.org/dev/#/signup) |
| `RESEND_API_KEY`, `EMAIL_FROM` | Emailing the daily brief | [resend.com](https://resend.com) |
| `APP_URL` | Links in the brief email | Your site address |

## Put it on your phone

AgentPulse is an installable web app — one codebase is both the website and the phone app.

- **iPhone / iPad:** open the site in Safari → Share → **Add to Home Screen**.
- **Android:** open the site in Chrome → tap **Install app** (or ⋮ → Install app).
- **Computer:** Chrome or Edge shows an install icon in the address bar.

It opens full-screen with its own icon, a bottom tab bar, and a friendly offline screen. Updates arrive automatically — no app store.

## Deploy on Render

The repo includes `render.yaml`, which creates everything in one go:

| Render resource | What it is |
|---|---|
| `agentpulse` (Web Service) | The website / app. Health check at `/api/health`. |
| `agentpulse-db` (Postgres) | The database. Migrations run automatically on every deploy. |
| `agentpulse-daily-brief` (Cron Job) | Every morning: searches for every active client, then emails each agent. |

1. In Render: **New → Blueprint** → choose this repo.
2. Fill in the keys it asks for (`ANTHROPIC_API_KEY`, `ORS_API_KEY`, `RESEND_API_KEY`, `EMAIL_FROM`, and `APP_URL` = your site address). `AUTH_SECRET` and `CRON_SECRET` are generated for you.
3. Deploy. Your site is at `https://agentpulse.onrender.com` (or similar).

### Every push is checked before it goes live

`.github/workflows/ci.yml` runs on every push: type-check → production build → starts the app → smoke test (signs up, creates and edits a client, loads every page, checks the phone-app files). Render's `autoDeployTrigger: checksPass` only deploys a commit after those checks pass, so a broken push never reaches your users.

Run the same checks yourself: `npm run build && npm start` then `npm run test:smoke`.

### Running the brief by hand

- In the app: **Run today's searches** and **Email me the brief** on the dashboard.
- On Render: open the `agentpulse-daily-brief` Cron Job → **Trigger Run**.
- Anywhere with the env vars set: `npm run brief`.
- Over HTTP (for other hosts): `GET /api/cron/search` then `GET /api/cron/send-briefs` with `Authorization: Bearer $CRON_SECRET` — or run the manual **Daily brief** GitHub Action.

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
| `npm run test:smoke` | End-to-end smoke test against a running app (`BASE_URL`) |
| `npm run brief` | Run the daily searches + emails once |

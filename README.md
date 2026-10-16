# AgentPulse AI

An AI copilot for real estate agents. Tell it about your clients in plain words, and it keeps an evolving profile for each one, searches the web for homes and rentals that fit, scores every home **1–10** for that specific client, checks whether it really sits in their area, measures **drive time and miles** to the places they care about, and sends you a **daily brief**.

## What it does

| | |
|---|---|
| **Client profiles that evolve** | Each agent has a private workspace. Add clients by hand or **import** them from a CSV/CRM export, an email or text thread, intake-form answers, call notes, or a link to a profile page. Then just chat — "after the showing they said the kitchen was too small" — and the AI updates budget, areas, must-haves, deal-breakers, important places and a written summary. |
| **Web-wide home search** | "Find homes" has the AI search the web like you would on Google — Zillow, Redfin, Realtor.com, Homes.com, Trulia, brokerage sites, and for renters Apartments.com, Zumper, HotPads and more — open the listings, and report back. |
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

Log in as `demo@agentpulse.dev` / `demo1234`. Chat, search and import need an AI key (below).

## Run it for real locally

```bash
cp .env.example .env.local
# fill in at least GEMINI_API_KEY and AUTH_SECRET (and ORS_API_KEY for drive times)
npm run dev
```

With no `DATABASE_URL`, an embedded Postgres database (PGlite) is created in `./.data` automatically.

### Choosing the AI: Gemini or Claude

One setting, `AI_PROVIDER`, picks which AI runs everything (chat, import, home search, scoring):

| `AI_PROVIDER` | Key it needs | When to use it |
|---|---|---|
| `gemini` (default) | `GEMINI_API_KEY` | Now, while testing. Free to start. |
| `claude` | `ANTHROPIC_API_KEY` | When you go live with real agents. |

Switching is just changing that one value on Render; nothing else changes. Both keys can stay set.

**Gemini free tier, good to know:** the daily limit is small, so a few searches a day can use it up (the app says so and it resets the next day). On the free tier Google may use what you send to improve its products, so turn on billing in Google AI Studio (or switch to Claude) before real client info goes in. Gemini can't use Google Search and the app's own tools in one step, so each home search makes two calls: one to research, one to fill in the results. Listings whose site wasn't in the actual search results are thrown away.

### Keys you'll need

| Variable | What it's for | Where to get it |
|---|---|---|
| `GEMINI_API_KEY` | The AI while `AI_PROVIDER=gemini` (the default) | Free at [aistudio.google.com/apikey](https://aistudio.google.com/apikey) |
| `ANTHROPIC_API_KEY` | The AI when `AI_PROVIDER=claude` | [console.anthropic.com](https://console.anthropic.com) |
| `AUTH_SECRET` | Signs login sessions (32+ characters, required in production) | `openssl rand -base64 32` |
| `DATABASE_URL` | Permanent Postgres database (required in production) | Free at [neon.tech](https://neon.tech) |
| `SIGNUP_CODE` | Invite code needed to create an account (recommended) | Any phrase you choose |
| `CRON_SECRET` | Lets the daily-brief job call the app | `openssl rand -hex 24` |
| `ORS_API_KEY` | Geocoding + drive times | Free at [openrouteservice.org](https://openrouteservice.org/dev/#/signup) |
| `RESEND_API_KEY`, `EMAIL_FROM` | Emailing the daily brief | [resend.com](https://resend.com) |
| `APP_URL` | Links in the brief email | Your site address |

## Put it on your phone

AgentPulse is an installable web app — one codebase is both the website and the phone app.

- **iPhone / iPad:** open the site in Safari → Share → **Add to Home Screen**.
- **Android:** open the site in Chrome → tap **Install app** (or ⋮ → Install app).
- **Computer:** Chrome or Edge shows an install icon in the address bar.

It opens full-screen with its own icon, a bottom tab bar, and a friendly offline screen. Updates arrive automatically — no app store.

## Deploy for free

| Piece | Free service | Notes |
|---|---|---|
| Website / app | Render free web service | Sleeps after 15 quiet minutes; the **Keep awake** GitHub Action pings it every 10 minutes, 6 AM–midnight Eastern. |
| Database | [Neon](https://neon.tech) free Postgres | Permanent (Render's free database is deleted after 30 days). Encrypted connections are enforced by the app. |
| Daily brief | GitHub Actions (**Daily brief** workflow) | Runs ~6:30 AM Eastern. Render cron jobs aren't free. |

1. **Database:** sign up at neon.tech → create a project (region: US East) → copy the connection string (`postgresql://…?sslmode=require`).
2. **Render:** New → Blueprint → choose this repo (or on an existing web service, open **Environment**). Set `DATABASE_URL` to the Neon string, `SIGNUP_CODE` to an invite code, `APP_URL` to your site address, plus `GEMINI_API_KEY` (or `AI_PROVIDER=claude` and `ANTHROPIC_API_KEY`), `ORS_API_KEY`, `RESEND_API_KEY`, `EMAIL_FROM`. Make sure `AUTH_SECRET` and `CRON_SECRET` are long random values. Health check path: `/api/live`.
3. **GitHub:** Settings → Secrets and variables → Actions → add secret `CRON_SECRET` (same value as on Render). If your site address isn't `https://agentpulse-skse.onrender.com`, also add a variable `APP_URL`.
4. Deploy. Tables are created automatically. Check `https://<your-site>/api/health` — it should say `"ok": true`.

### Keeping data safe

- Each agent only ever sees their own clients and homes (checked on every request).
- Passwords are stored as bcrypt hashes; login is limited to 10 tries per account per 15 minutes.
- With `SIGNUP_CODE` set, strangers can't create accounts or spend your AI credits.
- The app refuses to start without a real `AUTH_SECRET` and a hosted database, and only connects to the database over encrypted connections.
- Error messages never show database details; pages send security headers (HTTPS-only, no framing) and API responses are never cached.
- Never commit `.env` or paste keys into the code — keys live only in Render's and GitHub's secret settings.

### Every push is checked before it goes live

`.github/workflows/ci.yml` runs on every push: type-check → production build → starts the app → smoke test (signs up, creates and edits a client, loads every page, checks the phone-app files). Render's `autoDeployTrigger: checksPass` only deploys a commit after those checks pass, so a broken push never reaches your users.

Run the same checks yourself: `npm run build && npm start` then `npm run test:smoke`.

### Running the brief by hand

- In the app: **Run today's searches** and **Email me the brief** on the dashboard.
- On GitHub: **Actions → Daily brief → Run workflow**.
- Anywhere with the env vars set: `npm run brief`.
- Over HTTP (for other hosts): `GET /api/cron/search` then `GET /api/cron/send-briefs` with `Authorization: Bearer $CRON_SECRET`.

## How it works

```
Agent chat ──► Gemini or Claude (update_buyer_profile tool) ──► buyer profile (Postgres)
                                                          │
Find homes / daily cron ──► Gemini or Claude + web search + page reads ──► report_listings
                                                          │
                     OpenRouteService geocode + drive-time matrix
                                                          │
                     matches (score, blurb, in-area, distances) ──► dashboard + email brief
```

- `src/lib/ai/chat.ts` — agent chat that evolves the profile
- `src/lib/ai/import.ts` — turns pasted/CSV/linked material into profiles
- `src/lib/ai/search.ts` — web search, listing evaluation, scoring, de-duplication
- `src/lib/ai/provider.ts` — the `AI_PROVIDER` switch
- `src/lib/ai/gemini.ts` — Gemini: Google Search grounding, research-then-answer, rate-limit retries
- `src/lib/ai/claude.ts` — Claude: server tools, `pause_turn` and client tools
- `src/lib/geo.ts` — geocoding and drive times
- `src/lib/brief.ts` — daily brief and email
- `src/lib/db/schema.ts` — agents, buyers, messages, matches

Tech: Next.js (App Router), TypeScript, Tailwind CSS, Drizzle ORM + Postgres, Gemini API (`gemini-2.5-flash` by default; override with `GEMINI_MODEL`) or Claude API (`claude-sonnet-5-5`; override with `ANTHROPIC_MODEL`).

## Good to know

- **Listing data comes from the open web.** Some portals block automated page reads; when that happens the AI uses search results and the same listing on other sites. Always confirm price and availability on the listing before sending it to a client.
- **Costs.** On Gemini's free tier, nothing (within the daily limit). Paid, each search uses tokens plus web-search fees. See [Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing) and [Claude pricing](https://www.anthropic.com/pricing).
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

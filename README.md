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
| **Feedback that teaches it** | One tap to **Save**, **Reject** (with a reason: price, location, size, condition, layout, other) or **Send to client**. Rejected patterns score lower and saved patterns score higher for that client, in both the list you see and the next search. **Why this score** shows what helped and hurt each home. |
| **Client share link** | A private page per client, no login: the homes you sent, with thumbs-up/down and a short note. Reactions show on your dashboard and move that client's scores. Links are long random tokens, expire after 30 days, and you can switch one off at any time. |
| **Alerts** | Saved homes are re-checked every morning. Price drops, status changes, homes back on the market and new 8+ matches show up under **Alerts**, in the daily brief, and as notifications on your phone if you turn them on. |
| **Voice notes** | After a showing, record a note. The AI suggests profile updates and you tick the ones to keep before anything is saved. |
| **Map and commute** | See a client's homes on a map with pins coloured by score. Pick up to two important places and a longest drive; homes over the limit are faded or hidden. |
| **Follow-up drafts** | The AI writes a short text or email about the newest matches in your voice. You edit it and send it from your own phone. Nothing is sent for you. |
| **Tour planner** | Pick 2–6 homes and get the shortest driving order with a suggested time for each. |
| **Client pulse and weekly report** | An engagement meter per client, a **Who to call today** list on the dashboard, and a weekly report of homes found, sent, client reactions, alerts and time saved. |

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
| `APP_URL` | Links in the brief email and client share links | Your site address |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | Phone notifications (optional) | `npx web-push generate-vapid-keys` |
| `VAPID_SUBJECT` | Contact for the push services (optional when `APP_URL` is an https address) | `mailto:you@example.com` |

## Put it on your phone

AgentPulse is an installable web app — one codebase is both the website and the phone app.

- **iPhone / iPad:** open the site in Safari → Share → **Add to Home Screen**.
- **Android:** open the site in Chrome → tap **Install app** (or ⋮ → Install app).
- **Computer:** Chrome or Edge shows an install icon in the address bar.

It opens full-screen with its own icon, a bottom tab bar, and a friendly offline screen. Updates arrive automatically — no app store.

### Phone notifications

Notifications use the browser's own free push service (Web Push). To switch them on:

1. Run `npx web-push generate-vapid-keys` once on any computer. It prints a public key and a private key.
2. On Render, add `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` with those two values (and `VAPID_SUBJECT=mailto:you@example.com` if `APP_URL` isn't set).
3. In the app, open **Alerts** (or **Settings**) and tap **Turn on notifications**. Use **Send a test** to check it.

On iPhone and iPad, notifications only work after the app is added to the Home Screen and opened from there. Without the keys everything else still works; alerts just stay in the app and the daily brief.

### Voice notes

Most phones turn speech into text in the browser, for free. Where that isn't available (for example an iPhone app opened from the Home Screen), the recording is transcribed by the AI. Gemini can listen to recordings; Claude can't, so with `AI_PROVIDER=claude` those phones get a box to type in (the keyboard's own microphone works there).

## Deploy for free

| Piece | Free service | Notes |
|---|---|---|
| Website / app | Render free web service | Sleeps after 15 quiet minutes; the **Keep awake** GitHub Action pings it every 10 minutes, 6 AM–midnight Eastern. |
| Database | [Neon](https://neon.tech) free Postgres | Permanent (Render's free database is deleted after 30 days). Encrypted connections are enforced by the app. |
| Daily brief and alerts | GitHub Actions (**Daily brief** workflow) | Runs ~6:30 AM Eastern: new searches, a re-check of saved homes, then the email. Render cron jobs aren't free. |
| Maps | Leaflet + OpenStreetMap | No key needed. |
| Phone notifications | Web Push | Free; needs the VAPID keys above. |

1. **Database:** sign up at neon.tech → create a project (region: US East) → copy the connection string (`postgresql://…?sslmode=require`).
2. **Render:** New → Blueprint → choose this repo (or on an existing web service, open **Environment**). Set `DATABASE_URL` to the Neon string, `SIGNUP_CODE` to an invite code, `APP_URL` to your site address, plus `GEMINI_API_KEY` (or `AI_PROVIDER=claude` and `ANTHROPIC_API_KEY`), `ORS_API_KEY`, `RESEND_API_KEY`, `EMAIL_FROM`. Make sure `AUTH_SECRET` and `CRON_SECRET` are long random values. Health check path: `/api/live`.
3. **GitHub:** Settings → Secrets and variables → Actions → add secret `CRON_SECRET` (same value as on Render). If your site address isn't `https://agentpulse-skse.onrender.com`, also add a variable `APP_URL`.
4. Deploy. Tables are created automatically. Check `https://<your-site>/api/health` — it should say `"ok": true`.

### Keeping data safe

- Each agent only ever sees their own clients, homes, alerts and notes (checked on the server on every request).
- A client share link shows only the homes you sent that client: no score, no reasoning, no notes. Only a hash of each link is stored in a searchable form, so a copy of the database can't open client pages.
- Passwords are stored as bcrypt hashes; login is limited to 10 tries per account per 15 minutes.
- With `SIGNUP_CODE` set, strangers can't create accounts or spend your AI credits.
- The app refuses to start without a real `AUTH_SECRET` and a hosted database, and only connects to the database over encrypted connections.
- Error messages never show database details; pages send security headers (HTTPS-only, no framing) and API responses are never cached.
- Never commit `.env` or paste keys into the code — keys live only in Render's and GitHub's secret settings.

### Every push is checked before it goes live

`.github/workflows/ci.yml` runs on every push: type-check → unit tests → production build → starts the app → smoke test (signs up, creates and edits a client, loads every page, checks the phone-app files). Render's `autoDeployTrigger: checksPass` only deploys a commit after those checks pass, so a broken push never reaches your users.

Run the same checks yourself: `npm run lint`, `npm test`, then `npm run build && npm start` and `npm run test:smoke`.

### Running the brief by hand

- In the app: **Run today's searches** and **Email me the brief** on the dashboard.
- On GitHub: **Actions → Daily brief → Run workflow**.
- Anywhere with the env vars set: `npm run brief`.
- Over HTTP (for other hosts): `GET /api/cron/search` (repeat until it answers `"remaining": 0`) then `GET /api/cron/send-briefs`, both with `Authorization: Bearer $CRON_SECRET`.

## How it works

```
Agent chat ──► Gemini or Claude (update_buyer_profile tool) ──► buyer profile (Postgres)
                                                          │
Find homes / daily cron ──► Gemini or Claude + web search + page reads ──► report_listings
                                                          │
                     OpenRouteService geocode + drive-time matrix
                                                          │
                     matches (score, blurb, in-area, distances) ──► dashboard + email brief
                                                          │
Save / Reject / client thumbs ──► match_feedback ──► scores re-worked + next search prompt
                                                          │
Morning re-check of saved homes ──► alerts ──► app, brief email, Web Push
```

- `src/lib/ai/chat.ts` — agent chat that evolves the profile
- `src/lib/ai/import.ts` — turns pasted/CSV/linked material into profiles
- `src/lib/ai/search.ts` — web search, listing evaluation, scoring, de-duplication
- `src/lib/ai/provider.ts` — the `AI_PROVIDER` switch
- `src/lib/ai/gemini.ts` — Gemini: Google Search grounding, research-then-answer, rate-limit retries
- `src/lib/ai/claude.ts` — Claude: server tools, `pause_turn` and client tools
- `src/lib/ai/recheck.ts`, `voice-notes.ts`, `follow-up.ts` — saved-home re-checks, voice-note suggestions, follow-up drafts (all through the same switch)
- `src/lib/scoring.ts`, `feedback.ts` — how feedback moves scores, and the "why this score" breakdown
- `src/lib/share-links.ts` — client share links (tokens, expiry, what a client may see)
- `src/lib/listing-changes.ts`, `alerts.ts`, `push.ts` — what counts as an alert, saving them, phone notifications
- `src/lib/daily.ts` — the morning run: searches, then saved-home re-checks
- `src/lib/geo.ts`, `commute.ts`, `tour.ts` — geocoding, drive times, commute checks, tour order and time slots
- `src/lib/pulse.ts`, `report.ts` — client pulse, who to call, weekly report
- `src/lib/brief.ts` — daily brief and email
- `src/lib/db/schema.ts` — agents, buyers, messages, matches, match_feedback, share_links, alerts, push_subscriptions, voice_notes
- `drizzle/` — database migrations, applied automatically by `npm run build`. Each one only adds tables or columns.

Tech: Next.js (App Router), TypeScript, Tailwind CSS, Drizzle ORM + Postgres, Gemini API (`gemini-2.5-flash` by default; override with `GEMINI_MODEL`) or Claude API (`claude-sonnet-5-5`; override with `ANTHROPIC_MODEL`).

## Good to know

- **Listing data comes from the open web.** Some portals block automated page reads; when that happens the AI uses search results and the same listing on other sites. Always confirm price and availability on the listing before sending it to a client.
- **Costs.** On Gemini's free tier, nothing (within the daily limit). Paid, each search uses tokens plus web-search fees. See [Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing) and [Claude pricing](https://www.anthropic.com/pricing).
- **Privacy.** Every agent's clients and homes are private to their account.
- **Re-checks use the AI.** Each morning's look at saved homes is one more AI request per client with saved homes, so it counts toward Gemini's free daily limit. If the limit runs out, the re-check simply waits for the next day.
- **Time saved is an estimate.** The weekly report shows the per-item minutes it uses so you can judge it.
- **Tour times are suggestions.** Confirm each slot with the listing agent. Without `ORS_API_KEY`, drive times between homes are rough straight-line estimates and the planner says so.

## Scripts

| | |
|---|---|
| `npm run dev` | Local dev server |
| `npm run build` | Migrate the database, then build |
| `npm run db:migrate` | Create/update tables |
| `npm run db:generate` | Create a migration after changing `schema.ts` |
| `npm run seed:demo` | Demo agent, clients and homes |
| `npm run lint` | Type-check |
| `npm test` | Unit tests (scoring, permissions, share links, alerts, migrations and more) |
| `npm run test:smoke` | End-to-end smoke test against a running app (`BASE_URL`) |
| `npm run brief` | Run the daily searches + emails once |

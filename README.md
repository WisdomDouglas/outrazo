# Outrazo

> A visual and social event-discovery platform that connects people with experiences, communities, and event organizers — powered by Meta Muse Spark 1.3.

[![React 19](https://img.shields.io/badge/React-19-61dafb?logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6?logo=typescript)](https://www.typescriptlang.org/)
[![TanStack Start](https://img.shields.io/badge/TanStack_Start-1.168-ff4154?logo=reactrouter)](https://tanstack.com/start)
[![Tailwind CSS 4](https://img.shields.io/badge/Tailwind-4-38bdf8?logo=tailwindcss)](https://tailwindcss.com/)
[![Supabase](https://img.shields.io/badge/Supabase-Postgres-3ecf8e?logo=supabase)](https://supabase.com/)
[![Meta Muse Spark](https://img.shields.io/badge/Meta_Muse_Spark-1.3-0082fb?logo=meta)](https://dev.meta.ai/)
[![Vercel](https://img.shields.io/badge/Deploy-Vercel-black?logo=vercel)](https://vercel.com/)

## Table of contents

- [Introduction](#introduction)
- [Meta AI Integration](#meta-ai-integration)
- [AI-powered features](#ai-powered-features)
- [Core platform features](#core-platform-features)
- [Technology stack](#technology-stack)
- [Getting started](#getting-started)
- [Architecture and security](#architecture-and-security)
- [Meta AI Developer Hackathon Contributions](#meta-ai-developer-hackathon-contributions)
- [Project status and roadmap](#project-status-and-roadmap)

## Introduction

Outrazo is a visual and social event-discovery platform that connects people with experiences, communities, and event organizers. Attendees browse and search events, save the ones they like, RSVP to free events, and buy tickets to paid ones. Organizers create events, sell tickets, track attendees, and check guests in at the door. Administrators moderate content, manage promotions and payouts, and monitor the platform.

Outrazo is Nigeria-first: locations span all 36 states plus the FCT, dates are interpreted in Africa/Lagos time, and payments run in Nigerian Naira (₦) through Bachs. The interface uses the Forest Tech design system — a dark-first theme with light-mode support, built on Tailwind CSS 4 design tokens.

## Meta AI Integration

Every AI feature in Outrazo runs on **Meta Muse Spark 1.3** through the **Meta Model API**. There is no third-party AI SDK: the app uses two small server-only transports over native `fetch`:

| Transport | Endpoint | Used by |
|---|---|---|
| Chat Completions (`src/integrations/meta/client.server.ts`) | `POST https://api.meta.ai/v1/chat/completions` | AI Event Copilot, natural-language discovery, AI Event Intelligence narration and assistant |
| Responses API (`src/integrations/meta/responses.server.ts`) | `POST https://api.meta.ai/v1/responses` | Outrazo Scout (web search tool) |

How it works:

- **Model:** `muse-spark-1.3` for all calls (see `META_MODEL` and `META_SCOUT_MODEL` in the transports above).
- **Authentication:** `Authorization: Bearer ${MODEL_API_KEY}`. The key lives only in server-side environment (`MODEL_API_KEY` in `.env` / hosting settings) and is never prefixed with `VITE_`, never bundled, and never logged.
- **Structured output:** chat calls request `response_format: { type: "json_schema", ... }`, and every response is validated with Zod before anything reaches the UI. Malformed or empty model output produces a friendly error, never raw provider text.
- **Cost and abuse guards:** each caller sets its own token budget, timeout (20–30s), and input length cap; Scout additionally enforces per-request and per-run tool-call budgets with automatic halting.
- **Security boundary:** both transports are `*.server.ts` modules covered by the project's ESLint rule that forbids privileged server imports from UI code. The browser can only reach Meta through authenticated TanStack Start server functions.

To enable AI features locally, copy `.env.example` to `.env` and set `MODEL_API_KEY` (create a key at <https://dev.meta.ai/>). Without it, AI features fail closed with a "not set up yet" message instead of breaking the app.

## AI-powered features

### AI Event Copilot

On the Create Event page (`/app/create-event`), organizers can paste rough notes — a date, a venue idea, a few sentences — and the Copilot returns structured suggestions: **title, summary, description, category, and tags**. Categories are constrained to the app's real category list, and the system instruction forbids inventing dates, venues, prices, capacity, or contact details.

The organizer reviews the suggestions in a preview panel and explicitly clicks **Apply to form** (fills only the matching fields) or **Discard** (leaves everything untouched). Publishing stays a separate, deliberate action. Tags are displayed but not silently saved, since the event schema has no tags column.

Implementation: `src/showcase/copilot/generateSuggestions.ts` (server function) + `CopilotPanel.tsx` (UI). Requires sign-in.

### Natural-language event discovery

On Explore, visitors can type plain sentences such as *"free tech events in Lagos this weekend"* instead of operating filters. The Meta model converts the request into structured search filters (city/state, category, date bounds, free-only flag, keywords); matching then happens **client-side against loaded event records**, so the model can only ever emit filter values — it cannot invent events, venues, dates, or prices.

This differs from keyword filtering in that it understands intent: relative dates ("this weekend" resolved in Africa/Lagos), place names across all Nigerian states, and combined constraints in one query. Explicit locations in the query override the saved location for that search only. The endpoint is public (Explore needs no login) with a 500-character input cap and a small output budget.

Implementation: `src/showcase/discovery/interpretDiscoveryQuery.ts` (server function), `nl-matching.ts` (filter resolution), `NLSearchBox.tsx` (UI).

### Outrazo Scout

Scout (`/admin/scout`, permission `scout.manage`) is an AI-assisted event-research pipeline for staff. A run moves through **search → extract → review** phases:

1. **Search** — the Responses API's `web_search` tool finds upcoming events in Nigeria (Africa/Lagos timezone, individual event pages preferred over aggregators), under strict per-request and per-run tool-call budgets.
2. **Extract** — candidate pages are fetched and structured into discoveries (title, dates, venue, organizer, source URL).
3. **Review** — a human reviewer approves (with editable overrides, a cover upload, and mandatory source attribution) or dismisses each discovery.

Approved discoveries become **unpublished drafts** (`published: false`) — nothing Scout finds is ever automatically published. Implementation: `src/showcase/scout/`.

### AI Event Intelligence

The Admin Console's Intelligence page (`/admin/intelligence`) combines deterministic analytics with Meta-generated narration:

- Event performance aggregates, trends, and distributions computed server-side from real data.
- AI-written briefs, category observations, event summaries, and anomaly explanations — all grounded in supplied figures, requested per section, and validated against JSON schemas.
- An AI assistant panel that answers staff questions using the same grounded data.

The AI is advisory-only: it never publishes, unpublishes, suspends, resolves reports, or touches money. Implementation: `src/showcase/admin/intelligence-*.ts(x)`.

## Core platform features

All features below are implemented in the current codebase:

- **Discovery & Explore** — event feed with category, location, date, and price filters; natural-language search; saved-event collections.
- **Event details** — cover, schedule, venue, organizer, live attendee counts, RSVP/ticket actions, reviews from verified attendees.
- **Event creation & management** — draft/publish workflow with AI Copilot assistance, ticket tiers, cover uploads, organizer-owned editing.
- **Organizer dashboard** — events, ticket sales with earnings breakdown (gross/fee/net), attendee lists, QR/manual door check-in, bank payout details, promotion management.
- **Accounts** — Supabase authentication, onboarding, editable profiles, settings, notifications inbox.
- **Free RSVP** — one reservation per user/event with duplicate prevention, cancellation, and live counts via Supabase Realtime.
- **Paid tickets (Bachs sandbox)** — server-priced checkout, server-side verification, idempotent webhooks, per-unit ticket codes with QR passes in My Tickets. The client accepts sandbox keys only and refuses live keys.
- **Promotions** — organizers buy homepage/Explore boosts through the same verified Bachs flow; admins control pricing.
- **Admin Console** — role-based access (super, finance, moderation, read-only support) covering users, events, organizers, RSVPs, reports, promotions, finance, rewards, Scout, audit log, and roles.
- **Finance (manual-money policy)** — locked per-event commission rates, organizer earnings, and manual payout records. Outrazo automates incoming payments only; refunds, transfers, and payouts stay manual and audited.
- **Rewards wallet** — points balances, Naira equivalents, append-only transaction ledger, bank details, and manual withdrawal requests with admin approval. Backend complete; production activation is pending migration review (see roadmap).

## Technology stack

Verified from `package.json` and the codebase:

- **React 19** + **TypeScript 5** — UI and type safety.
- **TanStack Start 1.168 / Router / Query** — file-based routing (`src/routes/`), SSR, server functions, data fetching.
- **Vite 8** — dev server and builds.
- **Tailwind CSS 4** — Forest Tech design tokens and utilities.
- **Supabase** — Postgres, Auth, Storage, and Realtime; Row Level Security on all user data.
- **Meta Muse Spark 1.3** — all AI features via the Meta Model API (no AI SDK dependency).
- **Zod** — input and model-output validation everywhere.
- **Bachs** — Nigerian Naira checkout for tickets and promotions (sandbox).
- **qrcode.react / html5-qrcode** — ticket QR rendering and door scanning.
- **Recharts, date-fns, lucide-react** — admin charts, dates, icons.
- **Vercel** — deployment (`vercel.json` + `scripts/vercel-build.mjs`).

## Getting started

Prerequisites: Node.js (LTS recommended) and a Supabase project. Commands below come from `package.json` scripts.

```sh
# 1. Clone and enter the repo
git clone <your-repo-url>
cd outrazo

# 2. Install dependencies
npm install

# 3. Configure environment (see .env.example for every variable)
cp .env.example .env
```

Required variables (placeholders in `.env.example`, never commit real values):

| Variable | Purpose |
|---|---|
| `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` | Server-side Supabase access |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` | Browser Supabase access (public keys only) |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only admin operations (never `VITE_`-prefixed) |
| `MODEL_API_KEY` | Server-only Meta Model API key for all AI features |
| `BACHS_API_KEY` (`sk_sandbox_…`) | Server-only Bachs sandbox payments |
| `BACHS_WEBHOOK_SECRET` | Server-only webhook signature verification |
| `APP_URL` | Server-only public origin for checkout return URLs |

```sh
# 4. Run the dev server (http://localhost:8080)
npm run dev

# 5. Production build
npm run build

# 6. Tests (Node's built-in runner over the tests/ suite)
npm test

# 7. Lint
npm run lint

# 8. Type-check
npx tsc --noEmit
```

Database setup: the schema lives in additive, forward-only SQL files under `supabase/migrations/`. They are designed to be applied in filename order through the Supabase SQL Editor and reviewed before use — the app never auto-applies migrations.

## Architecture and security

- **Frontend** — React routes under `src/routes/` (public pages, `/app/*` member area, `/admin/*` console), shared UI in `src/design-system/`, feature modules in `src/showcase/`.
- **Server functions** — TanStack Start `createServerFn` handlers co-located with features. Every protected function passes through `requireSupabaseAuth` (who is calling) and, for admin functions, `requirePermission` (what they may do). UI gating is never the real check.
- **AI path** — browser → server function → Meta Model API → Zod validation → browser. `MODEL_API_KEY` is read only inside server handlers; provider request/response bodies never reach logs or the client.
- **Supabase backend** — Postgres with Row Level Security: users read/write only their own rows (profiles, RSVPs, orders, wallets, bank details); cross-user reads happen only in permission-checked server functions using the service-role key.
- **Payments** — amounts are computed server-side in integer kobo; checkout completion is proven only by server-side verification or signed webhooks, never by frontend redirects. Webhook handlers are idempotent with replay protection.

## Meta AI Developer Hackathon Contributions

Outrazo as a platform predates the hackathon; the hackathon work is the **Meta AI layer** integrated into real product workflows:

1. **Meta Muse Spark 1.3 integration** — a shared, server-only transport (`src/integrations/meta/`) with structured JSON outputs, typed errors, timeouts, budgets, and secret handling, used by every AI feature. Problem solved: organizers and visitors get AI help without exposing keys or trusting raw model output.
2. **AI Event Copilot** — turns rough organizer notes into structured, reviewable event copy. Problem solved: blank-page syndrome and low-quality listings slow down publishing; the Copilot drafts while the human decides.
3. **Natural-language event discovery** — turns sentences into validated search filters over real event records. Problem solved: filter UIs punish vague intent ("something fun this weekend"); NL search meets visitors where they are without ever fabricating results.
4. **Outrazo Scout** — budget-capped web research that surfaces real-world Nigerian events for human review, creating drafts — never publications. Problem solved: seeding and refreshing the catalog by hand does not scale.
5. **AI Event Intelligence narration & assistant** — grounded briefs and answers over deterministic admin analytics. Problem solved: raw dashboards bury insight; grounded narration keeps staff oriented while the numbers stay authoritative.

## Project status and roadmap

**Implemented and in the codebase:** discovery + NL search, event details and reviews, event creation with Copilot, organizer dashboard (sales, attendees, check-in, payouts, promotions), auth/profiles/settings/notifications, free RSVP with Realtime counts, Bachs sandbox ticket checkout with QR passes, manual payout records, Admin Console with all listed modules, Scout, and Intelligence.

**Recently completed, pending production activation:** the Points rewards wallet and manual withdrawals backend (migration `supabase/migrations/20261115090000_points_rewards_v1.sql` awaits review before it is applied).

**Planned / not operational:** live (non-sandbox) Bachs payments, bank-account verification provider for withdrawals, automatic earning rules (attendance/referral/campaign credits), and any automated disbursements — the last is intentionally out of scope under the manual-money policy.

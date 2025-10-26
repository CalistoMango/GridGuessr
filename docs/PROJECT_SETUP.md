# Project Setup Guide

Last refreshed: 2025-10-26. Follow these steps to keep local, staging, and production environments in sync with the codebase.

---

## Stack Snapshot
- **Framework:** Next.js 15 (App Router) with React 19 and TypeScript 5.x.
- **Styling:** Tailwind CSS 3.4, class-variance-authority, tailwind-merge, tailwindcss-animate.
- **State/Data:** TanStack React Query 5.61, Supabase JS 2.58 (anon + service role clients).
- **Mini app runtime:** @farcaster/miniapp-sdk, @neynar/react, @farcaster/quick-auth.
- **Wallets:** Wagmi 2.14 + Viem 2.23 (Base, Optimism, Mainnet, Degen, Unichain, Celo) and optional Solana provider.
- **Deployments:** Vercel (`npm run deploy:vercel`) and cron-triggered Farcaster automation.

---

## Environment Variables

Use `.env` for shared values and `.env.local` for developer-specific overrides. `scripts/dev.js` automatically loads `.env.local`; the deploy script can optionally merge `.env.local` secrets into `.env`.

### Required

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_URL` | Base URL used for assets, OG images, and notification redirects. |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key (used client-side). |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key for admin routes, cron, and scripts. |
| `ADMIN_FIDS` (or `ADMIN_FID_1`, `ADMIN_FID_2`, …) | Comma-separated list of Farcaster IDs that can access admin endpoints. |
| `ADMIN_PASSWORD` | Password fallback for admin UI and scripts. |
| `NEYNAR_API_KEY` (or `FARCASTER_API_KEY`) | API key used for Neynar user lookups, casts, and notifications. |
| `NEYNAR_CLIENT_ID` (or `FARCASTER_CLIENT_ID`) | Client ID required for frame notifications. |
| `FARCASTER_SIGNER_UUID` (or `NEYNAR_SIGNER_UUID`, `FARCASTER_NEYNAR_SIGNER_UUID`) | Signer UUID used to post casts. |
| `CRON_SECRET` | Bearer token expected by `/api/cron/farcaster` when scheduled in production. |

### Common Optional Variables

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SHARE_URL`, `NEXT_PUBLIC_SHARE_HANDLE` | Overrides default share metadata; falls back to `NEXT_PUBLIC_URL` and `@gridguessr`. |
| `NEXT_PUBLIC_MINI_APP_NAME`, `NEXT_PUBLIC_MINI_APP_BUTTON_TEXT` | Filled by the deploy script when publishing manifests. |
| `NEXT_PUBLIC_DEV_FID`, `NEXT_PUBLIC_ADMIN_FIDS` | Provide default FIDs for local testing (UI preload). |
| `USE_TUNNEL` | When set to `true`, `npm run dev` spins up a localtunnel and exports its URL as `NEXT_PUBLIC_URL`. |
| `SOLANA_RPC_ENDPOINT` | Custom RPC endpoint for Solana wallet support (defaults to publicnode). |
| `FARCASTER_DEFAULT_CHANNEL_ID`, `NEYNAR_DEFAULT_CHANNEL_ID` | Default Farcaster channel for casts. |
| `FARCASTER_DRY_RUN`, `NEXT_PUBLIC_FARCASTER_DRY_RUN`, `NEYNAR_DRY_RUN` | Enable dry-run mode for casts and notifications. |
| `SEED_PHRASE`, `SPONSOR_SIGNER` | Optional flags for Neynar signer sponsorship (prompted by `npm run deploy:vercel`). |

Keep `.env` and `.env.local` under version control rules that prevent accidental commits of secrets.

---

## Project Structure Overview

```
src/
  app/            # App router pages, layouts, API route handlers
  components/     # Prediction experience (hooks, views, modals), providers
  lib/            # Supabase helpers, bonus logic, Farcaster integration
docs/             # Living documentation (API, data model, features, setup)
scripts/          # Dev utilities, smoke tests, deploy helpers
supabase/         # Schema dump (import into Supabase)
```

See the README for a fuller map and feature summary.

---

## Installing & Bootstrapping

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Configure environment variables**
   - Copy `.env.example` if available (or create `.env` / `.env.local`) and populate the variables listed above.
   - Ensure service role key is kept server-side only (never bundle client-side).

3. **Provision Supabase**
   - Create a new Supabase project.
   - Import `supabase/schema.sql` via the Supabase dashboard or CLI:
     ```bash
     psql "$SUPABASE_DB_URL" < supabase/schema.sql
     ```
   - Seed base data (drivers, teams, badges). The repo includes:
     ```bash
     npx tsx scripts/seed-badges.mjs
     ```
   - Optionally use `scripts/query-table.mjs` for quick sanity checks.

4. **Run the dev server**
   ```bash
   npm run dev
   ```
   - `scripts/dev.js` checks for port collisions, optionally opens a localtunnel (`USE_TUNNEL=true`), and injects the tunnel URL into `NEXT_PUBLIC_URL` & `NEXTAUTH_URL`.
   - Tunnel instructions are printed to the console and include Warpcast preview steps.

5. **Verify smoke tests (optional)**
   ```bash
   npx tsx scripts/smoke-score-wildcard.ts
   ```
   This script creates temporary records, runs the admin scorer, asserts wildcard badges, and cleans up.

---

## npm Scripts

| Script | Command | Description |
| --- | --- | --- |
| `dev` | `node scripts/dev.js` | Runs Next.js dev server with optional tunnel + cleanup hooks. |
| `build` | `next build` | Production build (with telemetry). |
| `build:raw` | `next build` | Alias retained for CI compatibility. |
| `start` | `next start` | Serve the production build. |
| `lint` | `next lint` | ESLint with Next.js config. |
| `deploy:vercel` | `tsx scripts/deploy.ts` | Interactive deployment wizard (env validation, manifest prep, optional `.env.local` merge). |
| `deploy:raw` | `vercel --prod` | Direct Vercel deployment without prompts. |
| `cleanup` | `node scripts/cleanup.js` | Force-terminates processes on the specified port (default 3000). |

Supporting scripts:
- `scripts/dump-schema.sh` – Regenerate `supabase/schema.sql` from a live database.
- `scripts/query-table.mjs` – Quick table dumps using the service role key.
- `scripts/seed-badges.mjs` – Seed default badges.
- `scripts/smoke-score-wildcard.ts` – End-to-end scorer smoke test.

---

## Deployment Workflow

1. **Preparation**
   - Ensure Supabase schema is up to date (`scripts/dump-schema.sh` after DB changes).
   - Confirm docs have been refreshed (see `docs/LOGBOOK.md`).

2. **Vercel deployment**
   ```bash
   npm run deploy:vercel
   ```
   - Prompts to load `.env.local`, ensures key env vars are present, and updates any required manifest constants.
   - Alternatively push to a Vercel-linked branch or use `npm run deploy:raw`.

3. **Environment configuration**
   - Set the same env vars in Vercel (Project Settings → Environment Variables).
   - Supply `CRON_SECRET` and schedule the cron job (see below).

4. **Cron job**
   - Schedule `GET https://<app-domain>/api/cron/farcaster` every 5–10 minutes.
   - Include `Authorization: Bearer <CRON_SECRET>` in the request headers.

5. **Post-deploy checks**
   - Visit `/admin` and authenticate using either an admin FID or password.
   - Trigger a test notification/cast in dry-run mode to confirm Farcaster credentials.

---

## Supabase Maintenance

- **Schema changes:** Apply migrations manually in Supabase, run `scripts/dump-schema.sh`, and update `docs/DATA_MODEL.md`.
- **Data seeding:** Keep `scripts/seed-badges.mjs` and any future seed scripts aligned with schema tweaks.
- **Backups:** Rely on Supabase backups for critical tables (`users`, `predictions`, `bonus_prediction_*`, `farcaster_cast_jobs`).

---

## Integrations & Prerequisites

- **Neynar:** Required for leaderboards (friends view), Farcaster casts, and frame notifications. Without API credentials, `/api/leaderboard?type=friends` returns an empty list.
- **Farcaster signer:** Provide a signer UUID (bot account or developer signer) via the environment variables listed above.
- **Solana support:** `SafeFarcasterSolanaProvider` checks for a provider at runtime; configure `SOLANA_RPC_ENDPOINT` if you need a custom RPC or if your signer requires a private endpoint.
- **Warpcast developer preview:** Use the tunnel URL generated by `npm run dev` to test the mini app inside Warpcast’s developer tools.

---

## Troubleshooting

| Issue | Likely Cause | Fix |
| --- | --- | --- |
| `400 Predictions are locked` | Race status `locked/completed` or lock time passed | Update race in `/admin` or adjust `lock_time` in Supabase for testing. |
| Empty friends leaderboard | No Neynar API key or cache expired | Populate `NEYNAR_API_KEY` / `NEYNAR_CLIENT_ID`; clear `friends_follow_cache` row to force refresh. |
| Farcaster casts failing | Missing API key or signer UUID | Double-check `FARCASTER_SIGNER_UUID` and API key env vars. |
| Admin auth rejected | FID/password mismatch | Verify FID is listed in `ADMIN_FIDS` (strings or numbers) or that `ADMIN_PASSWORD` matches input. |
| Cron returns `401 Unauthorized` | Wrong/missing `CRON_SECRET` header | Update cron schedule to send `Authorization: Bearer <secret>`. |

---

## TODO / Future Improvements

- Add rate limiting (or Vercel Edge middleware) around public API routes to deter abuse.
- Implement replay protection for bonus submissions (idempotency tokens).
- Automate cleanup for stale `friends_follow_cache` rows beyond TTL-driven updates.
- Expand smoke test coverage to include bonus scoring and Farcaster job dispatch simulations.

Keep this guide aligned with the repository by updating it whenever scripts, environment variables, or deployment flows change.

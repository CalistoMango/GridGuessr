# Project Setup

## Stack Overview

**GridGuessr** is a Farcaster Mini App built with:
- **Frontend**: Next.js 15, React 19, TypeScript 5, TailwindCSS
- **Backend**: Next.js API routes (Node.js runtime)
- **Database**: Supabase (PostgreSQL)
- **Auth**: Farcaster QuickAuth + Neynar integration
- **Social**: Farcaster casts, frame notifications, leaderboard caching
- **Blockchain**: Base chain (via Wagmi/Viem)
- **State**: TanStack React Query for data fetching
- **Validation**: Zod for schema validation

## Environment Variables

Required in `.env.local`:

```bash
# App URLs
NEXT_PUBLIC_URL=https://your-app.vercel.app
NEXT_PUBLIC_SHARE_URL=https://farcaster.xyz/miniapps/your-app-id/your-app-name
NEXT_PUBLIC_SHARE_HANDLE=@your-app-handle

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon_key>
SUPABASE_SERVICE_ROLE_KEY=<service_role_key>

# Admin Access
ADMIN_FIDS=123456  # Comma-separated list
ADMIN_PASSWORD=<secret>

# Neynar (Farcaster API)
NEYNAR_API_KEY=<key>
NEYNAR_CLIENT_ID=<client_id>
NEYNAR_SIGNER_UUID=<signer_uuid>  # For posting casts as @your-app-handle

# Cron Job Authentication
CRON_SECRET=<random_secret>

# Optional: Redis for caching
KV_REST_API_TOKEN=
KV_REST_API_URL=
```

## Key Files & Structure

```
/src
  /app
    /api                     # API routes
      /predictions          # User predictions (GET, POST)
      /results              # User results (GET)
      /leaderboard          # Global/friends leaderboards (GET)
      /races/current        # Current race info (GET)
      /badges               # User badges (GET)
      /dotd                 # Driver of the Day (GET, POST)
      /bonus                # Bonus predictions
      /admin                # Admin-protected routes
        /results            # Submit race results (POST)
        /races              # Create/update races (GET, POST)
        /farcaster          # Publish casts (POST)
        /notifications      # Send notifications (POST)
        /bonus/events       # Manage bonus events
      /cron
        /farcaster          # Background cast jobs (GET, POST)
    /admin                  # Admin panel UI
    /share/[fid]            # Public share pages
    page.tsx                # Main app entry
  /components
    App.tsx                 # Client-side app wrapper
    /gridguessr
      GridGuessr.tsx        # Core prediction UI
      /views                # View components (home, predictions, results, etc.)
      /components           # UI components (modals, headers)
      /hooks                # React hooks for data fetching
  /lib
    auth.ts                 # Admin authentication
    supabase.ts             # Supabase client + helper functions
    bonusPredictions.ts     # Bonus prediction logic
    constants.ts            # App configuration
    /farcaster              # Farcaster integration
      client.ts             # Neynar API wrapper
      jobs.ts               # Cast job scheduling
      notifications.ts      # Frame notifications
      templates.ts          # Cast templates

/supabase
  schema.sql                # Full PostgreSQL schema dump (217 KB)
```

## Database Setup

1. Create a Supabase project
2. Import `/supabase/schema.sql` (contains all tables, indexes, RLS policies)
3. Key tables: `users`, `races`, `predictions`, `race_results`, `drivers`, `teams`, `badges`, `user_badges`, `dotd_votes`, `bonus_prediction_*`, `farcaster_cast_jobs`

## Authentication Flow

1. User opens app → Farcaster QuickAuth modal appears
2. User authenticates with Farcaster
3. FID (Farcaster ID) extracted from auth token
4. User profile created/updated in Supabase via `ensureUserByFid()`
5. Admin routes check `isAdminFid()` or `isValidAdminPassword()` (see [lib/auth.ts](../src/lib/auth.ts))

## Deployment

**Vercel** (recommended):
```bash
npm run deploy:vercel  # Interactive deployment script
# or
npm run deploy:raw     # Direct Vercel deploy
```

**Environment Setup**:
- Add all env vars to Vercel project settings
- Configure cron job webhook: `/api/cron/farcaster` (runs every 5 minutes)
- Set `CRON_SECRET` for webhook authentication

## Development

```bash
npm install
npm run dev  # Starts Next.js dev server + optional localtunnel
```

**Local Tunnel** (for Farcaster frame testing):
- Set `USE_TUNNEL=true` in `.env.local`
- Uses localtunnel to expose localhost to internet

## Scoring System

**Base Categories** (100 points total):
- Pole Position: 15 pts
- Race Winner: 15 pts
- 2nd Place: 10 pts
- 3rd Place: 10 pts
- Fastest Lap: 10 pts
- Fastest Pit Stop: 10 pts
- First DNF: 10 pts
- Safety Car (Y/N): 10 pts
- Winning Margin Bucket: 10 pts

**Bonus**:
- Wildcard Question: +10 pts (race-specific)
- Perfect Slate Badge: Awarded when user scores all 9 base categories correct

**Scoring Trigger**: Admin submits race results via `/api/admin/results` → automatic scoring for all predictions

## Farcaster Integration

**Cast Jobs** (scheduled in `farcaster_cast_jobs` table):
- Lock reminders: Posted 2hrs, 1hr, 30min before race predictions lock
- DOTD summary: Posted after race completion with voting results
- Leaderboard updates: Weekly top 3 announcements

**Frame Notifications**:
- Sent to users via Neynar API
- Support filtering by FID, follow relationships
- Examples: "Your results are in!", "New race available"

**Config** (see [lib/farcaster/constants.ts](../src/lib/farcaster/constants.ts)):
- `FARCASTER_SIGNER_UUID`: Bot account signer for posting casts
- `NEYNAR_API_KEY`: API access
- `NEYNAR_CLIENT_ID`: App identifier

## Key Invariants

1. **Race lock time**: Predictions cannot be edited after `race.lock_time`
2. **XP is additive**: `users.total_points` only increases, never decreases
3. **Perfect slates**: Badge awarded only when score = 100 (all 9 categories + wildcard)
4. **One prediction per race**: `predictions` table has unique constraint on `(user_id, race_id)`
5. **Admin operations**: Use `supabaseAdmin` (service role) for scoring, result submission
6. **User operations**: Use `supabase` (anon key) with RLS for user-scoped queries

## Troubleshooting

**"Predictions locked" error**:
- Check `race.lock_time` vs. current time
- Race status must be `upcoming` (not `locked` or `completed`)

**"Admin not authenticated"**:
- Verify FID in `ADMIN_FIDS` env var
- Or use correct `ADMIN_PASSWORD`

**Supabase RLS errors**:
- Service role client bypasses RLS (use for admin ops)
- Anon client enforces RLS (use for user ops)

**Cron jobs not running**:
- Verify Vercel cron configuration
- Check `CRON_SECRET` matches in Vercel env
- See `/api/cron/farcaster` logs

## TODO

- [ ] Add Upstash Redis caching for friends leaderboard (currently using DB cache table)
- [ ] Implement webhook handler for Neynar events (currently stubbed)
- [ ] Add rate limiting to public API endpoints

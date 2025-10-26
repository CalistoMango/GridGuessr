# Feature Reference & Business Rules

This guide links implementation details to the product experience so future changes stay aligned with shipped behaviour.

---

## Race Predictions

- **Flow:** `GridGuessr.tsx` orchestrates prediction state via `usePredictionsState`, pulling current race metadata with `useRaceSummary`. Data is persisted through `/api/predictions` (GET/POST) which normalises FIDs, ensures user records, and upserts predictions by `(user_id, race_id)`.
- **Locking:** `computeLockMetadata` marks the grid as locked when `race.lock_time` has passed or `races.status ∈ {'locked','completed'}`. The API layer rejects submissions once locked or past the deadline.
- **Winning margin buckets:** UI presents `["0-2s","2-4s","4-7s","7-12s","12-20s","20s+"]` via `useMarginBuckets`, guaranteeing consistent labels.

### Scoring Categories
Base score totals 100 points; the wildcard is treated as a separate +10 bonus.

| Category | Points | Notes |
| --- | --- | --- |
| Pole Position | 15 | Matches `race_results.pole_driver_id` |
| Race Winner | 15 | |
| Second Place | 10 | |
| Third Place | 10 | |
| Fastest Lap | 10 | |
| Fastest Pit Stop Team | 10 | |
| First DNF / No DNF | 10 | `no_dnf` overrides the driver pick |
| Safety Car (Yes/No) | 10 | |
| Winning Margin Bucket | 10 | String equality (`winning_margin`) |
| **Wildcard** | +10 | `wildcard_answer === wildcard_result` |

Badge and score updates happen in `/api/admin/results` (see _Results & Scoring_). Perfect Slate requires all nine base categories; Grand Prix Master additionally needs the wildcard.

---

## Results & Scoring

- Admins submit results through `/api/admin/results`. The route:
  1. Upserts `race_results` for the race.
  2. Deduplicates predictions per user (latest timestamp wins).
  3. Calculates `baseScore` + `bonusScore`, updates `predictions.score` and `predictions.scored_at`.
  4. Awards badges and increments `users.total_points` (`prediction totals + bonus_points`).
  5. Marks the race `status='completed'`.
- **Badges awarded by scorer:**
  - Category hits: `Pole Prophet`, `Winner Wizard`, `Silver Seer`, `Bronze Brainiac`, `Lap Legend`, `Pit Psychic`, `DNF Detective`, `Safety Sage`, `Margin Master`.
  - Podium combos: `Podium Prophet`.
  - Milestones: `Half Century` (≥50 base points), `Perfect Slate` (100 base points), `Wildcard Wizard` (wildcard correct), `Grand Prix Master` (Perfect Slate + Wildcard).
- **Results surface:** `/api/results` aggregates season data into `seasons[].races[].categories[]` plus bonus event summaries. Sorting prioritises round numbers, then race dates.

---

## Bonus Prediction Events

- Data access flows through `lib/bonusPredictions.ts` helpers and `/api/bonus/events` / `/api/bonus/responses`.
- **Event lifecycle:** `draft → scheduled → open → locked → scored → archived`. The helper recalculates a derived status at read time; divergences are persisted automatically.
- **Question types:** `choice_driver`, `choice_team`, `choice_custom`, and `free_text`. Options can reference drivers/teams or arbitrary labels.
- **Submission guardrails:** `/api/bonus/responses` declines writes when status ∈ `{locked, scored, archived}` or when `locks_at` is in the past. Requests are sanitised so only valid option IDs (respecting `max_selections`) are stored.
- **Scoring:** Points are stored on each response (`points_awarded`) and multiplied by `event.points_multiplier`. `/api/results` consumes these values to present totals and statuses (`pending`, `missing`, `correct`, `incorrect`).

---

## Driver of the Day (DOTD)

- GET `/api/dotd` aggregates votes for a given race (`race_id`) and optionally returns the viewer’s current selection.
- POST `/api/dotd` enforces:
  - The race must exist and have `status='completed'`.
  - Users are created/updated via `ensureUserByFid`.
  - Votes are upserted on `(race_id, user_id)` so users can change their mind.
- The admin scorer does not currently close voting windows—`ComputeLockMetadata` exposes this as a TODO (see Open Items).

---

## Leaderboards

- **Global leaderboard:** `/api/leaderboard?type=global` returns top users by `total_points` descending. Missing display info is backfilled with Neynar profile data when an API key is available.
- **Friends leaderboard:** Needs `fid` and Neynar API access. The route pulls following lists (capped at 300), persists `friend_fids` + `expires_at` in `friends_follow_cache`, and caches results in memory between requests.
  - Cache TTL: 60 minutes (`FOLLOW_CACHE_TTL_MS`).
  - Subsequent requests refresh Supabase data but reuse cached FID sets until expiry.
- **Ranks:** Response appends `rank` based on sorted order.

---

## Badges & Inventory

- Badge catalog lives in `badges`. Seed via `scripts/seed-badges.mjs`.
- Users earn badges through:
  - Admin scorer (automatic awards).
  - Potential future manual tooling (not yet implemented).
- `/api/badges` returns badges keyed by camelCase names with `earned` and `count` flags so the UI can highlight streaks.
- Unique constraint `(user_id, badge_id, race_id)` prevents duplicates per race.

---

## Farcaster Automations & Notifications

- **Scheduling jobs:** `ensureLockReminderJobsForRace` and `ensureDriverOfDaySummaryJob` (in `lib/farcaster/jobs.ts`) enqueue casts into `farcaster_cast_jobs`.
  - Lock reminders default offsets: 1440 minutes (24h) and 60 minutes before `race.lock_time`.
  - DOTD summaries default to 48 hours after the race date.
- **Cron processing:** `/api/cron/farcaster` (GET) runs three tasks:
  1. Schedule lock reminder jobs for upcoming/locked races.
  2. Ensure Driver of the Day summary jobs for completed races.
  3. Claim due jobs (max 10 per run) and dispatch casts via Neynar (`postCast`). Tracks `sent`, `skipped`, `failed`.
- **Admin controls:** `/api/admin/farcaster` exposes templates for lock reminders, results summaries, perfect slate callouts, close calls, leaderboard updates, prediction consensus, and DOTD recaps. `FARCASTER_DRY_RUN` / `NEXT_PUBLIC_FARCASTER_DRY_RUN` keep requests in dry-run mode when enabled.
- **Frame notifications:** `/api/admin/notifications` uses `publishFrameNotifications` to send Neynar frame alerts. Actions include manual campaigns, lock reminders (targeting users without predictions), and results broadcasts.

---

## Admin Console

Located at `/admin` (client components in `src/app/admin/**`) and backed by:

- `POST /api/admin/auth` – Credential check (FID list, password, or token).
- `GET/POST/PUT/DELETE /api/admin/races` – Race CRUD with auto-sync to Farcaster job schedules.
- `POST /api/admin/results` – Scoring pipeline described above.
- `POST /api/admin/notifications` – Frame notifications.
- `POST /api/admin/farcaster` – Cast templates and cast deletion helper.
- `GET /api/admin/stats` – Snapshot of current prediction distributions, DOTD votes, and user counts.

Requests authenticate via `authenticateAdmin` which accepts FID values (from `ADMIN_FIDS`), password, or bearer token matching the same credentials.

---

## Invariants & Edge Cases

1. **One prediction per race per user.** Enforced by DB unique constraint and duplicated in API guards.
2. **Predictions immutable post-lock.** The API checks both `race.status` and `lock_time`.
3. **Score monotonicity.** `users.total_points` and `bonus_points` only increase through automated flows; manual adjustments must keep totals consistent.
4. **Badge uniqueness.** `user_badges` unique key prevents duplicate awards for the same race. Admin scripts should respect this by catching duplicates.
5. **Bonus response overwrite.** Latest valid payload wins; submissions are idempotent for each question.
6. **Friends data freshness.** Cache TTL is 60 minutes—expect up to one hour of staleness for newly-followed accounts.
7. **Farcaster signer requirements.** All cast/notification flows require `FARCASTER_SIGNER_UUID` (or `NEYNAR_SIGNER_UUID`) and an API key (`NEYNAR_API_KEY` or `FARCASTER_API_KEY`).
8. **Cron secret optional:** `/api/cron/farcaster` enforces bearer auth when `CRON_SECRET` is set; otherwise remains open for development.

---

## Open Items / TODOs

- Add schema-level support for a DOTD voting close timestamp to prevent late submissions.
- Layer rate limiting or abuse protection on public endpoints (`predictions`, `dotd`, `leaderboard`, `bonus`).
- Consider replay/drop detection for bonus submissions (currently first valid payload overwrites silently).
- Establish cleanup policy for `friends_follow_cache` rows that miss refresh windows.
- Improve Farcaster job retry feedback (multiple failures currently mark jobs as `failed` without escalation).

Keep this document aligned with code by updating it whenever business rules, badge logic, or automation cadences change.

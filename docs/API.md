# API Reference

All handlers live under `src/app/api/**` and return JSON unless noted. Errors follow the pattern:

```json
{ "error": "message" }
```

with an appropriate HTTP status code. Successful payloads return domain-specific objects documented below.

---

## Utility & Auth

### `POST /api/auth/validate`
- **Auth:** None (validates Farcaster QuickAuth tokens).
- **Body:**
  ```json
  { "token": "<jwt>" }
  ```
- **Response (200):**
  ```json
{ "success": true, "user": { "fid": "your-user-fid-here" } }
  ```
- **Errors:** `400` (missing token), `401` (invalid token), `500` (verification failure).
- **Notes:** Uses `@farcaster/quick-auth` and the optional `NEXT_PUBLIC_URL` domain when available.

### `GET /api/opengraph-image`
- **Auth:** None.
- **Query Params:** Optional `fid` to personalize the OG image (currently unused by the template).
- **Response:** 1200×630 PNG image rendered via `next/og` (Edge runtime).

---

## Predictions & Race Data

### `GET /api/predictions`
- **Auth:** FID required via query.
- **Query Params:** `fid` (Farcaster ID, required), `raceId` (UUID, required).
- **Response (200):**
  ```json
  {
    "prediction": {
      "id": "uuid",
      "user_id": "uuid",
      "race_id": "uuid",
      "pole_driver_id": "uuid|null",
      "winner_driver_id": "uuid|null",
      "second_driver_id": "uuid|null",
      "third_driver_id": "uuid|null",
      "fastest_lap_driver_id": "uuid|null",
      "fastest_pit_team_id": "uuid|null",
      "first_dnf_driver_id": "uuid|null",
      "no_dnf": true,
      "safety_car": true,
      "winning_margin": "5-10s",
      "wildcard_answer": true,
      "score": 90,
      "scored_at": "2025-03-15T14:30:00Z",
      "created_at": "...",
      "updated_at": "..."
    }
  }
  ```
- **Errors:** `400` (missing fid/raceId), `500` (Supabase error). Returns `{ "prediction": null }` when no record exists.

### `POST /api/predictions`
- **Auth:** FID via request body; ensures user via `ensureUserByFid`.
- **Body:**
  ```json
  {
    "fid": "your-user-fid-here",
    "raceId": "uuid",
    "poleDriverId": "uuid|null",
    "winnerDriverId": "uuid|null",
    "secondDriverId": "uuid|null",
    "thirdDriverId": "uuid|null",
    "fastestLapDriverId": "uuid|null",
    "fastestPitTeamId": "uuid|null",
    "firstDnfDriverId": "uuid|null",
    "noDnf": true,
    "safetyCar": true,
    "winningMargin": "0-5s",
    "wildcardAnswer": true,
    "profile": {
      "username": "alice",
      "displayName": "Alice",
      "pfpUrl": "https://..."
    }
  }
  ```
- **Response (200):** `{ "success": true, "prediction": { ...updated row... } }`
- **Errors:** `400` (missing fid/raceId, race locked/past deadline), `500` (database error).
- **Notes:** Upserts by `(user_id, race_id)` using service role client. Rejects submissions when `race.status` is `locked`/`completed` or `lock_time` has passed.

### `GET /api/races/current`
- **Auth:** None.
- **Response (200):**
  ```json
  {
    "race": { ...next upcoming/locked race or null... },
    "drivers": [ { ...active driver... } ],
    "teams": [ { ...active team... } ]
  }
  ```
- **Notes:** Filters to races with status `upcoming` or `locked`, ordered by `race_date`. Driver/team lists are restricted to `active = true`.

### `GET /api/races/summary`
- **Auth:** None.
- **Response (200):**
  ```json
  {
    "races": [ ...all races ordered by race_date... ],
    "currentRace": { ... } | null,
    "displayRace": { ... } | null,
    "lockedRace": { ... } | null,
    "upcomingRace": { ... } | null,
    "previousCompletedRace": { ... } | null,
    "drivers": [ ...active drivers... ],
    "teams": [ ...active teams... ]
  }
  ```
- **Notes:** `currentRace` prefers a locked race, then upcoming. `displayRace` mirrors whichever is live for the UI.

### `GET /api/results`
- **Auth:** Requires `fid` query parameter (numeric string accepted).
- **Query Params:** `fid` (required).
- **Response (200):**
  ```json
  {
    "seasons": [
      {
        "season": 2025,
        "races": [
          {
            "raceId": "uuid",
            "name": "Bahrain Grand Prix",
            "circuit": "Sakhir Circuit",
            "round": 1,
            "raceDate": "2025-03-02T15:00:00Z",
            "wildcardQuestion": "Will there be a red flag?",
            "totalPointsEarned": 90,
            "categories": [
              {
                "key": "pole",
                "label": "Pole Position",
                "actual": "#1 Max Verstappen",
                "predicted": "#1 Max Verstappen",
                "pointsAvailable": 15,
                "pointsEarned": 15,
                "status": "correct"
              },
              "... other categories ..."
            ]
          }
        ],
        "bonusEvents": [
          {
            "eventId": "uuid",
            "title": "Sprint Weekend Picks",
            "type": "sprint",
            "locksAt": "2025-03-03T12:00:00Z",
            "publishedAt": "2025-03-01T00:00:00Z",
            "pointsMultiplier": 2,
            "relatedRaceId": "uuid|null",
            "relatedRaceName": "Bahrain Grand Prix",
            "totalPointsAvailable": 40,
            "totalPointsEarned": 30,
            "questions": [
              {
                "questionId": "uuid",
                "prompt": "Who wins the sprint?",
                "pointsAvailable": 20,
                "pointsEarned": 20,
                "correctOptions": ["Driver A"],
                "userSelections": ["Driver A"],
                "status": "correct"
              }
            ]
          }
        ]
      }
    ]
  }
  ```
- **Errors:** `400` (missing/invalid fid), `500` (Supabase errors).
- **Notes:** Fetches season/race metadata, associated predictions, race results, bonus events, and user bonus responses in one payload.

### `GET /api/badges`
- **Auth:** `fid` query param required.
- **Query Params:** `fid`.
- **Response (200):**
  ```json
  {
    "badges": {
      "poleProphet": { "earned": true, "count": 2 },
      "winnerWizard": { "earned": true, "count": 1 },
      "...other badges..."
    },
    "earnedCount": 4,
    "totalCount": 12
  }
  ```
- **Errors:** `400` (missing fid), `500` (Supabase error).
- **Notes:** Badge keys are camel-cased from the `badges.name` strings for frontend ergonomics.

### `GET /api/leaderboard`
- **Auth:** Optional; required when `type=friends`.
- **Query Params:**
  - `type`: `global` (default) or `friends`.
  - `fid`: required when `type=friends`.
  - `limit`: default `100`.
- **Response (200):**
  ```json
  {
    "leaderboard": [
      {
        "fid": "your-user-fid-here",
        "username": "alice",
        "display_name": "Alice",
        "pfp_url": "https://...",
        "total_points": 320,
        "perfect_slates": 1,
        "rank": 1
      }
    ]
  }
  ```
- **Errors:** `400` (missing fid for friends view), `500` (Supabase/Neynar errors). Returns `{ "leaderboard": [] }` when viewer fid invalid or no qualifying friends.
- **Notes:** Friends view hydrates Neynar follow lists with on-disk and Supabase caches (`friends_follow_cache`). Missing profile info is backfilled via Neynar user bulk API.

### `GET /api/dotd`
- **Auth:** Query params.
- **Query Params:** `raceId` (required), `fid` (optional to fetch viewer vote).
- **Response (200):**
  ```json
  {
    "votes": [
      {
        "driver": { "id": "uuid", "name": "Driver A", "team": "Team" },
        "votes": 12,
        "percentage": 60
      }
    ],
    "totalVotes": 20,
    "userVote": {
      "driver": { "id": "uuid", "name": "Driver A", "team": "Team" }
    }
  }
  ```
- **Errors:** `400` (missing raceId), `500` (Supabase failure).
- **Notes:** Aggregates votes per driver. `percentage` values are rounded. Viewer vote is only returned when the fid has an existing vote.

### `POST /api/dotd`
- **Auth:** FID + profile payload.
- **Body:**
  ```json
  {
    "fid": "your-user-fid-here",
    "raceId": "uuid",
    "driverId": "uuid",
    "profile": {
      "username": "alice",
      "displayName": "Alice",
      "pfpUrl": "https://..."
    }
  }
  ```
- **Response (200):** `{ "success": true, "vote": { ...dotd_votes row... } }`
- **Errors:** `400` (missing fields, race not completed), `500` (Supabase failure).
- **Notes:** Uses service role client, enforces race completion, and upserts on `(race_id, user_id)` so users can change their vote.

---

## Bonus Predictions

### `GET /api/bonus/events`
- **Auth:** None.
- **Query Params:** `scope` (default `open`). When `scope=all`, drafts, locked, scored, and archived events are included.
- **Response (200):**
  ```json
  {
    "events": [
      {
        "id": "uuid",
        "type": "sprint",
        "status": "open",
        "title": "Sprint Weekend Picks",
        "description": "Optional text",
        "raceId": "uuid|null",
        "opensAt": "2025-03-01T00:00:00Z",
        "locksAt": "2025-03-02T12:00:00Z",
        "publishedAt": "2025-03-01T00:00:00Z",
        "pointsMultiplier": 1.5,
        "questions": [
          {
            "id": "uuid",
            "prompt": "Who wins the sprint?",
            "responseType": "choice_driver",
            "maxSelections": 1,
            "points": 20,
            "order": 1,
            "correctOptionIds": ["uuid"] | null,
            "options": [
              {
                "id": "uuid",
                "label": "Driver A",
                "order": 1,
                "driverId": "uuid|null",
                "teamId": "uuid|null"
              }
            ]
          }
        ]
      }
    ]
  }
  ```
- **Errors:** `500` (Supabase failure).
- **Notes:** Status values are re-derived at read time (`scheduled`/`open`/`locked`) and persisted when they change.

### `GET /api/bonus/responses`
- **Auth:** Service role ensures user exists; requires fid.
- **Query Params:** `fid` (required), `eventId` (required).
- **Response (200):**
  ```json
  {
    "responses": [
      {
        "questionId": "uuid",
        "selectedOptionIds": ["uuid"],
        "pointsAwarded": 10,
        "submittedAt": "2025-03-01T12:30:00Z",
        "scoredAt": "2025-03-03T09:00:00Z"
      }
    ],
    "totalPoints": 20,
    "scoredAt": "2025-03-03T09:00:00Z"
  }
  ```
- **Errors:** `400` (missing fid/eventId), `500` (Supabase/lookup failure).
- **Notes:** Returns empty arrays + zero totals when the user has no submissions.

### `POST /api/bonus/responses`
- **Auth:** FID in body, user resolved via `ensureUserByFid`.
- **Body:**
  ```json
  {
    "fid": "your-user-fid-here",
    "eventId": "uuid",
    "profile": { "username": "...", "displayName": "...", "pfpUrl": "..." },
    "responses": [
      { "questionId": "uuid", "selectedOptionIds": ["uuid", "uuid"] }
    ]
  }
  ```
- **Response (200):** `{ "success": true }`
- **Errors:** `400` (missing fields, locked/scored/archived events, no valid selections), `404` (event not found), `500` (Supabase failure).
- **Notes:** Sanitises selections against question options and enforces `max_selections`. Only unlocked events accept submissions.

---

## Admin Endpoints

All admin routes require authentication via:
- `adminFid` / `fid` referencing a value in `ADMIN_FIDS`.
- `adminPassword` / `password` matching `ADMIN_PASSWORD`.
- `token` header or field matching an admin FID or password.

Shared header parsing honours `x-admin-token` or `Authorization: Bearer <token>`.

### `POST /api/admin/auth`
- **Body:** `{ "fid": "your-admin-fid-here", "adminPassword": "secret" }` (any combination).
- **Response (200):** `{ "authenticated": true, "method": "fid" | "password" }`
- **Errors:** `401` (failed auth), `500` (unexpected error).

### `GET /api/admin/races`
- **Response:** `{ "races": [ ...all races ordered by race_date desc... ] }`
- **Auth:** Admin token not required (read-only list).

### `POST /api/admin/races`
- **Body:**
  ```json
  {
    "adminFid": "your-admin-fid-here",
    "name": "Miami Grand Prix",
    "circuit": "Miami International Autodrome",
    "country": "USA",
    "raceDate": "2025-05-05T19:30:00Z",
    "lockTime": "2025-05-04T19:30:00Z",
    "season": 2025,
    "round": 6,
    "wildcardQuestion": "Will there be a safety car?"
  }
  ```
- **Response (200):**
  ```json
  {
    "success": true,
    "race": { ...inserted row... },
    "farcaster": {
      "lockReminders": true,
      "driverOfDay": false,
      "errors": []
    }
  }
  ```
- **Errors:** `400` (missing fields), `403` (unauthorized), `500` (Supabase/ scheduling errors).
- **Notes:** Creates the race with `status: "upcoming"` and schedules lock reminder Farcaster jobs.

### `PUT /api/admin/races`
- **Body:** Requires `raceId` plus any fields to update (`name`, `lockTime`, `status`, etc.).
- **Response (200):** `{ "success": true, "race": { ...updated row... }, "farcaster": { ...resync summary... } }`
- **Errors:** `400`, `403`, `500`.
- **Notes:** Reschedules lock reminders and DOTD summary jobs when relevant fields change.

### `DELETE /api/admin/races`
- **Body:** `{ "raceId": "uuid" }` plus admin auth.
- **Response (200):** `{ "success": true }`
- **Errors:** `400`, `403`, `500`.

### `POST /api/admin/results`
- **Body:** 
  ```json
  {
    "raceId": "uuid",
    "poleDriverId": "uuid|null",
    "winnerDriverId": "uuid|null",
    "secondDriverId": "uuid|null",
    "thirdDriverId": "uuid|null",
    "fastestLapDriverId": "uuid|null",
    "fastestPitTeamId": "uuid|null",
    "firstDnfDriverId": "uuid|null",
    "noDnf": true,
    "safetyCar": true,
    "winningMargin": "0-5s",
    "wildcardResult": true
  }
  ```
- **Response (200):**
  ```json
  {
    "success": true,
    "message": "Scored <count> predictions",
    "results": { ...race_results row... }
  }
  ```
- **Errors:** `400` (missing raceId), `403`, `500`.
- **Notes:** Upserts into `race_results`, deduplicates predictions per user, scores each category, awards badges, adjusts `users.total_points` (including `bonus_points`), and marks race `status = 'completed'`.

### `POST /api/admin/notifications`
- **Body:** Requires `action`. Supported values:
  - `manual` / `manual-notification`: 
    ```json
    {
      "notification": {
        "title": "...",
        "body": "...",
        "targetUrl": "https://..."
      },
      "targetFids": ["your-target-fid-1", "your-target-fid-2"],
      "filters": {
        "excludeFids": ["fid-to-exclude"],
        "followingFid": "your-following-fid-here",
        "minimumUserScore": 100,
        "nearLocation": { "latitude": 37.77, "longitude": -122.41, "radius": 10 }
      },
      "campaignId": "lock-reminder"
    }
    ```
  - `race-lock-reminder`: optional `raceId`, otherwise finds the next upcoming/locked race. Sends to users without predictions yet.
  - `race-results-broadcast`: optional `raceId`, otherwise latest completed race. Sends platform-wide announcement.
- **Response (200):**
  ```json
  {
    "success": true,
    "dryRun": false,
    "result": { "...raw Neynar response..." },
    "raceId": "uuid",
    "targetFidCount": 42,
    "hours": 2
  }
  ```
- **Errors:** `400`, `403`, `404` (no eligible race/users), `409` (lock passed or no recipients), `500`.
- **Notes:** Uses Neynar Frame Notifications. Supports dry-run mode via env flags (`FARCASTER_DRY_RUN`, `NEYNAR_DRY_RUN`).

### `POST /api/admin/farcaster`
- **Body:** Requires `action`. Supported values and expected fields:
  - `manual-cast`: `text`, optional `embedUrl`, `channelId`.
  - `driver-of-day-summary`: optional `raceId`, optional `channelId`. Requires votes to exist.
  - `race-results-summary`, `perfect-slate-alert`, `close-calls`, `leaderboard-update`: optional `raceId`, optional `channelId`. Builders fetch latest completed race if omitted.
  - `lock-reminder`: optional `raceId`, optional `channelId`. Uses next upcoming race otherwise.
  - `prediction-consensus`: optional `raceId`, optional `channelId`, `category` (`winner` or `pole`).
  - `delete-cast`: `targetHash` (required), optional `signerUuid`.
- **Response (200):**
  ```json
  {
    "success": true,
    "dryRun": false,
    "result": { "...raw Neynar response..." },
    "raceId": "uuid",
    "totalVotes": 25,
    "perfectCount": 2,
    "displayedUsers": ["alice.eth"]
  }
  ```
- **Errors:** `400`, `403`, `404` (no qualifying race/data), `409` (builder prerequisites not met), `500`.
- **Notes:** Dry-run behaviour is governed by `FARCASTER_DRY_RUN` / `NEXT_PUBLIC_FARCASTER_DRY_RUN`. Signer UUIDs are resolved from env when not provided.

### `POST /api/admin/farcaster/jobs`
- **Auth:** Admin token required.
- **Body:**
  ```json
  {
    "limit": 50,
    "status": "pending",
    "upcoming": true
  }
  ```
- **Response (200):**
  ```json
  {
    "jobs": [
      {
        "id": "uuid",
        "template": "lock-reminder",
        "payloadArgs": { "raceId": "uuid", "hours": 24 },
        "jobKey": "lock-reminder-uuid-1440",
        "status": "pending",
        "scheduledFor": "2025-03-01T12:00:00Z",
        "attemptCount": 0,
        "lastAttemptAt": "2025-03-01T12:05:00Z",
        "completedAt": "2025-03-01T12:05:10Z",
        "channelId": "gridguessr",
        "lastError": "Error message",
        "responseBody": { "...raw Neynar response..." },
        "createdAt": "2025-02-28T12:00:00Z",
        "updatedAt": "2025-03-01T12:05:10Z"
      }
    ]
  }
  ```
- **Errors:** `403` (unauthorized), `500` (Supabase error).
- **Notes:** Fetches Farcaster cast jobs from the queue. Optional filters: `limit` (default 50, max 200), `status` (pending/processing/completed/failed), `upcoming` (true shows jobs from last 24h forward). Jobs ordered by `scheduled_for` ascending.

### `GET /api/admin/stats`
- **Auth:** None required (read-only dashboard data).
- **Response (200):**
  ```json
  {
    "predictionRace": { "id": "uuid", "name": "...", "lock_time": "..." } | null,
    "predictions": {
      "total": 120,
      "pole": [ { "id": "uuid", "name": "#1 Driver", "count": 40, "percentage": 33 } ],
      "winner": [ ... ],
      "second": [ ... ],
      "third": [ ... ],
      "fastestLap": [ ... ],
      "fastestPitTeam": [ ... ],
      "firstDnf": [ { "id": "no_dnf", "name": "No DNF", "count": 20, "percentage": 17 } ],
      "safetyCar": [ { "value": "Yes", "count": 80, "percentage": 67 } ],
      "wildcard": [ { "value": "Yes", "count": 60, "percentage": 50 } ]
    },
    "dotdRace": { "id": "uuid", "name": "...", "race_date": "..." } | null,
    "dotd": {
      "total": 30,
      "options": [
        { "driverId": "uuid", "name": "Driver A", "count": 15, "percentage": 50 }
      ]
    },
    "totalUsers": 480
  }
  ```
- **Errors:** `500` (Supabase failures).
- **Notes:** Aggregates latest completed race for DOTD and next upcoming/locked race for predictions. Percentages are rounded integers.

---

## Cron Routes

### `GET /api/cron/farcaster`
- **Auth:** Optional `Authorization: Bearer <CRON_SECRET>`. Without `CRON_SECRET`, endpoint remains open (development).
- **Response (200):**
  ```json
  {
    "ok": true,
    "scheduled": {
      "lockReminders": { "racesProcessed": 3, "errors": [] },
      "driverOfDay": { "racesProcessed": 1, "errors": [] }
    },
    "dispatched": {
      "jobsConsidered": 5,
      "sent": 4,
      "failed": 0,
      "skipped": 1
    }
  }
  ```
- **Errors:** `401` (invalid secret), `500` (Supabase/dispatch issues).
- **Notes:** 
  - Schedules lock reminders for races with status `upcoming`/`locked` and lock times within the configured window.
  - Ensures Driver of the Day summary jobs for completed races.
  - Claims due Farcaster cast jobs (max 10 per invocation) and posts them via Neynar.

---

## Error Summary
- `400` – Missing or invalid input, race lock passed, locked bonus event, unsupported admin action.
- `401` – Unauthorized (invalid cron secret, bad admin credentials).
- `403` – Authenticated admin check failed.
- `404` – Resource not found (bonus event, race).
- `409` – Conflict (lock already passed, no eligible users/votes).
- `500` – Supabase, Neynar, or unexpected server errors.

Refer to `docs/PROJECT_SETUP.md` for environment variables mentioned above and `docs/FEATURES.md` for behavioural rules that each endpoint enforces.

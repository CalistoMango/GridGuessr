# API Routes

**Location:** `/src/app/api/`
**Auth:** Farcaster FID-based (passed as query param or body). Admin routes check FID or password.

## Response Format

```typescript
// Success (200/201)
{ data: <T> }  or  { prediction: {...} }  or  { results: [...] }

// Error (4xx/5xx)
{ error: string }
```

## Error Codes
- `400` – Validation error, missing required fields, predictions locked
- `401` – Unauthorized (admin routes only)
- `403` – Forbidden (wrong admin credentials)
- `404` – Resource not found
- `500` – Internal server error

---

## Public Routes

### Predictions

#### `GET /api/predictions?fid=<FID>&raceId=<RACE_ID>`
Fetch user's prediction for a race.

**Query Params:**
- `fid` (required) – Farcaster ID
- `raceId` (required) – Race UUID

**Response:**
```json
{
  "prediction": {
    "id": "uuid",
    "user_id": "uuid",
    "race_id": "uuid",
    "pole_driver_id": "uuid",
    "winner_driver_id": "uuid",
    "second_driver_id": "uuid",
    "third_driver_id": "uuid",
    "fastest_lap_driver_id": "uuid",
    "fastest_pit_team_id": "uuid",
    "first_dnf_driver_id": "uuid",
    "no_dnf": false,
    "safety_car": true,
    "winning_margin": "5-10s",
    "wildcard_answer": true,
    "score": 75,
    "scored_at": "2025-03-15T14:30:00Z",
    "created_at": "2025-03-10T10:00:00Z",
    "updated_at": "2025-03-10T11:30:00Z"
  }
}
```

**Errors:**
- `400` – Missing fid or raceId

---

#### `POST /api/predictions`
Submit or update a prediction.

**Body:**
```json
{
  "fid": 123456,
  "raceId": "uuid",
  "poleDriverId": "uuid",
  "winnerDriverId": "uuid",
  "secondDriverId": "uuid",
  "thirdDriverId": "uuid",
  "fastestLapDriverId": "uuid",
  "fastestPitTeamId": "uuid",
  "firstDnfDriverId": "uuid",
  "noDnf": false,
  "safetyCar": true,
  "winningMargin": "5-10s",
  "wildcardAnswer": true,
  "profile": {
    "username": "alice",
    "display_name": "Alice",
    "pfp_url": "https://..."
  }
}
```

**Response:**
```json
{
  "prediction": { ... }
}
```

**Errors:**
- `400` – Missing required fields, predictions locked, deadline passed
- `500` – Database error

**Constraints:**
- Cannot submit after `race.lock_time`
- Cannot submit if `race.status` is `locked` or `completed`
- Upserts based on `(user_id, race_id)`

---

### Results

#### `GET /api/results?fid=<FID>&season=<SEASON>`
Fetch user's scored race results for a season.

**Query Params:**
- `fid` (required) – Farcaster ID
- `season` (optional) – Year (defaults to current year)

**Response:**
```json
{
  "results": [
    {
      "race_id": "uuid",
      "race_name": "Bahrain Grand Prix",
      "circuit": "Sakhir Circuit",
      "race_date": "2025-03-15T14:00:00Z",
      "score": 75,
      "scored_at": "2025-03-15T16:30:00Z",
      "prediction": { ... },
      "race_result": { ... }
    }
  ],
  "bonusResults": [
    {
      "event_id": "uuid",
      "title": "Sprint Weekend Predictions",
      "total_points": 30,
      "scored_at": "2025-03-16T12:00:00Z"
    }
  ]
}
```

---

### Leaderboard

#### `GET /api/leaderboard?fid=<FID>&type=<TYPE>&limit=<LIMIT>`
Fetch global or friends leaderboard.

**Query Params:**
- `fid` (required for friends leaderboard)
- `type` (optional) – `global` (default) or `friends`
- `limit` (optional) – Max results (default 100)

**Response:**
```json
{
  "leaderboard": [
    {
      "rank": 1,
      "fid": 123456,
      "username": "alice",
      "display_name": "Alice",
      "pfp_url": "https://...",
      "total_points": 1250,
      "bonus_points": 150,
      "perfect_slates": 3
    }
  ],
  "userRank": {
    "rank": 42,
    "total_points": 850
  }
}
```

**Notes:**
- Friends leaderboard uses Neynar API to fetch follow list (cached 60min)
- Leaderboard sorted by `total_points DESC`

---

### Races

#### `GET /api/races/current`
Get current active race with drivers and teams.

**Response:**
```json
{
  "race": {
    "id": "uuid",
    "name": "Bahrain Grand Prix",
    "circuit": "Sakhir Circuit",
    "country": "Bahrain",
    "race_date": "2025-03-15T14:00:00Z",
    "lock_time": "2025-03-15T12:00:00Z",
    "status": "upcoming",
    "wildcard_question": "Will there be a red flag?",
    "season": 2025,
    "round": 1
  },
  "drivers": [ ... ],
  "teams": [ ... ]
}
```

**Notes:**
- Returns race with status `upcoming` or `locked` (earliest by `race_date`)

---

#### `GET /api/races/summary?raceId=<RACE_ID>`
Get race summary (minimal race info).

**Response:**
```json
{
  "race": {
    "id": "uuid",
    "name": "Bahrain Grand Prix",
    "lock_time": "2025-03-15T12:00:00Z",
    "status": "upcoming"
  }
}
```

---

### Badges

#### `GET /api/badges?fid=<FID>`
Fetch user's earned badges.

**Response:**
```json
{
  "badges": [
    {
      "id": "uuid",
      "badge_id": "uuid",
      "race_id": "uuid",
      "earned_at": "2025-03-15T14:30:00Z",
      "badge": {
        "name": "Perfect Slate",
        "description": "Predicted all 9 categories correctly",
        "icon": "🏆",
        "type": "prediction"
      }
    }
  ]
}
```

---

### Driver of the Day

#### `GET /api/dotd?raceId=<RACE_ID>`
Get DOTD vote results.

**Response:**
```json
{
  "votes": {
    "driver-uuid-1": 145,
    "driver-uuid-2": 89,
    "driver-uuid-3": 67
  },
  "totalVotes": 301,
  "userVote": "driver-uuid-1"
}
```

---

#### `POST /api/dotd`
Submit DOTD vote.

**Body:**
```json
{
  "fid": 123456,
  "raceId": "uuid",
  "driverId": "uuid"
}
```

**Response:**
```json
{ "success": true }
```

**Constraints:**
- One vote per user per race (upsert)

---

### Bonus Predictions

#### `GET /api/bonus/events?status=<STATUS>`
Fetch bonus prediction events.

**Query Params:**
- `status` (optional) – `open`, `scored`, `all` (default: open)

**Response:**
```json
{
  "events": [
    {
      "id": "uuid",
      "type": "sprint",
      "status": "open",
      "title": "Sprint Weekend Predictions",
      "description": "Predict sprint race outcomes",
      "opens_at": "2025-03-10T00:00:00Z",
      "locks_at": "2025-03-14T12:00:00Z",
      "points_multiplier": 1.5,
      "questions": [ ... ]
    }
  ]
}
```

---

#### `GET /api/bonus/responses?fid=<FID>&eventId=<EVENT_ID>`
Fetch user's bonus prediction responses.

**Response:**
```json
{
  "responses": [
    {
      "id": "uuid",
      "question_id": "uuid",
      "selected_option_ids": ["uuid"],
      "points_awarded": 10,
      "scored_at": "2025-03-15T14:00:00Z"
    }
  ]
}
```

---

#### `POST /api/bonus/responses`
Submit bonus prediction response.

**Body:**
```json
{
  "fid": 123456,
  "eventId": "uuid",
  "questionId": "uuid",
  "selectedOptionIds": ["uuid"],
  "freeTextAnswer": "Max Verstappen"
}
```

**Response:**
```json
{ "success": true }
```

---

## Admin Routes (Protected)

**Auth:** Requires `adminFid` or `adminPassword` in request body.

### Results

#### `POST /api/admin/results`
Submit race results and auto-score all predictions.

**Body:**
```json
{
  "adminFid": 123456,
  "raceId": "uuid",
  "poleDriverId": "uuid",
  "winnerDriverId": "uuid",
  "secondDriverId": "uuid",
  "thirdDriverId": "uuid",
  "fastestLapDriverId": "uuid",
  "fastestPitTeamId": "uuid",
  "firstDnfDriverId": "uuid",
  "noDnf": false,
  "safetyCar": true,
  "winningMargin": "5-10s",
  "wildcardResult": true
}
```

**Response:**
```json
{
  "success": true,
  "scoredCount": 42,
  "perfectSlates": 3
}
```

**Side Effects:**
- Scores all predictions for the race
- Awards "Perfect Slate" badges
- Updates `users.total_points` and `users.perfect_slates`

---

### Races

#### `GET /api/admin/races`
List all races (admin view).

**Response:**
```json
{
  "races": [ ... ]
}
```

---

#### `POST /api/admin/races`
Create or update a race.

**Body:**
```json
{
  "adminFid": 123456,
  "id": "uuid",  // Optional for update
  "name": "Bahrain Grand Prix",
  "circuit": "Sakhir Circuit",
  "country": "Bahrain",
  "raceDate": "2025-03-15T14:00:00Z",
  "lockTime": "2025-03-15T12:00:00Z",
  "wildcardQuestion": "Will there be a red flag?",
  "season": 2025,
  "round": 1
}
```

**Response:**
```json
{
  "race": { ... }
}
```

**Side Effects:**
- Schedules Farcaster cast jobs (lock reminders 2hrs, 1hr, 30min before lock)

---

### Farcaster

#### `POST /api/admin/farcaster`
Publish a Farcaster cast.

**Body:**
```json
{
  "adminFid": 123456,
  "type": "leaderboard",  // or "dotd_summary", "perfect_slate"
  "raceId": "uuid",
  "data": { ... }
}
```

**Response:**
```json
{
  "success": true,
  "castHash": "0x..."
}
```

---

#### `GET /api/admin/farcaster/jobs`
List scheduled cast jobs.

**Response:**
```json
{
  "jobs": [
    {
      "id": "uuid",
      "race_id": "uuid",
      "job_type": "lock_reminder",
      "scheduled_at": "2025-03-15T10:00:00Z",
      "posted_at": null,
      "error_message": null
    }
  ]
}
```

---

### Notifications

#### `POST /api/admin/notifications`
Send frame notifications to users.

**Body:**
```json
{
  "adminFid": 123456,
  "title": "New Race Available!",
  "body": "Make your predictions now",
  "targetUrl": "https://your-app.vercel.app",
  "filterFids": [123, 456],  // Optional: only send to these FIDs
  "excludeFids": [789],      // Optional: exclude these FIDs
  "followersOnly": true      // Optional: only followers of @your-app-handle
}
```

**Response:**
```json
{
  "success": true,
  "sentCount": 42
}
```

---

### Bonus Events (Admin)

#### `POST /api/admin/bonus/events`
Create or update bonus event.

**Body:**
```json
{
  "adminFid": 123456,
  "id": "uuid",  // Optional for update
  "type": "sprint",
  "status": "open",
  "title": "Sprint Weekend Predictions",
  "opensAt": "2025-03-10T00:00:00Z",
  "locksAt": "2025-03-14T12:00:00Z",
  "pointsMultiplier": 1.5,
  "questions": [
    {
      "prompt": "Who will win the sprint?",
      "responseType": "choice_driver",
      "maxSelections": 1,
      "points": 10,
      "orderIndex": 1
    }
  ]
}
```

**Response:**
```json
{
  "event": { ... }
}
```

---

## Cron Routes (Background Jobs)

### `GET /api/cron/farcaster`
Process scheduled Farcaster cast jobs.

**Headers:**
- `Authorization: Bearer <CRON_SECRET>`

**Side Effects:**
- Posts pending cast jobs where `scheduled_at <= now()`
- Updates `posted_at` and `cast_hash` on success
- Stores `error_message` on failure

---

## Example Requests

**Submit prediction:**
```bash
curl -X POST https://your-app.vercel.app/api/predictions \
  -H "Content-Type: application/json" \
  -d '{
    "fid": 123456,
    "raceId": "abc-123",
    "poleDriverId": "driver-1",
    "winnerDriverId": "driver-2",
    "safetyCar": true
  }'
```

**Get leaderboard:**
```bash
curl https://your-app.vercel.app/api/leaderboard?type=global&limit=10
```

**Admin: Submit results:**
```bash
curl -X POST https://your-app.vercel.app/api/admin/results \
  -H "Content-Type: application/json" \
  -d '{
    "adminPassword": "secret",
    "raceId": "abc-123",
    "winnerDriverId": "driver-2",
    ...
  }'
```

---

## Notes

- All timestamps are ISO 8601 (UTC)
- UUIDs are v4 format
- Admin routes require `adminFid` (in `ADMIN_FIDS` env var) or `adminPassword`
- Predictions locked after `race.lock_time` or when `race.status != 'upcoming'`
- See [lib/supabase.ts](../src/lib/supabase.ts) for TypeScript types

# Data Model

PostgreSQL schema via Supabase. Full dump: [/supabase/schema.sql](../supabase/schema.sql)

## Core Tables

### `users`
User profiles synced from Farcaster.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | uuid | PK, default `gen_random_uuid()` | Internal user ID |
| `fid` | bigint | NOT NULL, UNIQUE | Farcaster ID (primary identifier) |
| `username` | text | - | Farcaster username |
| `display_name` | text | - | Display name |
| `pfp_url` | text | - | Profile picture URL |
| `total_points` | integer | NOT NULL, default 0 | All-time race prediction points |
| `bonus_points` | integer | default 0 | Bonus prediction points |
| `perfect_slates` | integer | NOT NULL, default 0 | Count of perfect race predictions |
| `created_at` | timestamptz | default `now()` | Account creation |
| `updated_at` | timestamptz | default `now()` | Last profile update |

**Indexes**:
- `idx_users_fid` on `fid` (unique)
- `idx_users_total_points` on `total_points DESC` (for leaderboards)

**Invariants**:
- `fid` is immutable after creation
- `total_points` and `bonus_points` are additive only (never decrease)
- `perfect_slates` increments when user scores 100 points on a race

---

### `races`
Race definitions for the season.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | uuid | PK | Race ID |
| `name` | text | NOT NULL | e.g., "Bahrain Grand Prix" |
| `circuit` | text | NOT NULL | e.g., "Sakhir Circuit" |
| `country` | text | - | e.g., "Bahrain" |
| `race_date` | timestamptz | NOT NULL | Actual race start time |
| `lock_time` | timestamptz | NOT NULL | Predictions lock at this time |
| `status` | text | NOT NULL, default 'upcoming' | 'upcoming', 'locked', 'completed' |
| `wildcard_question` | text | - | Custom race-specific yes/no question |
| `season` | integer | NOT NULL | Year (e.g., 2025) |
| `round` | integer | NOT NULL | Race number in season |
| `created_at` | timestamptz | default `now()` | - |
| `updated_at` | timestamptz | default `now()` | - |

**Indexes**:
- `idx_races_season_round` on `(season, round)` (unique)
- `idx_races_status` on `status`
- `idx_races_lock_time` on `lock_time`

**Status Lifecycle**: `upcoming` → `locked` (at `lock_time`) → `completed` (after results submitted)

---

### `drivers`
F1 driver roster.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | uuid | PK | Driver ID |
| `name` | text | NOT NULL | e.g., "Max Verstappen" |
| `team` | text | NOT NULL | e.g., "Red Bull Racing" |
| `number` | text | NOT NULL | Car number (e.g., "1") |
| `color` | text | NOT NULL | Hex color code for UI |
| `active` | boolean | NOT NULL, default true | Active roster membership |
| `created_at` | timestamptz | default `now()` | - |

**Indexes**: `idx_drivers_active` on `active`

---

### `teams`
F1 team roster.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | uuid | PK | Team ID |
| `name` | text | NOT NULL, UNIQUE | e.g., "Red Bull Racing" |
| `color` | text | NOT NULL | Hex color code |
| `active` | boolean | NOT NULL, default true | Active roster membership |
| `created_at` | timestamptz | default `now()` | - |

---

### `predictions`
User race predictions (one per user per race).

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | uuid | PK | Prediction ID |
| `user_id` | uuid | NOT NULL, FK → users | User who made prediction |
| `race_id` | uuid | NOT NULL, FK → races | Race being predicted |
| `pole_driver_id` | uuid | FK → drivers | Pole position prediction |
| `winner_driver_id` | uuid | FK → drivers | Race winner |
| `second_driver_id` | uuid | FK → drivers | 2nd place |
| `third_driver_id` | uuid | FK → drivers | 3rd place |
| `fastest_lap_driver_id` | uuid | FK → drivers | Fastest lap |
| `fastest_pit_team_id` | uuid | FK → teams | Fastest pit stop |
| `first_dnf_driver_id` | uuid | FK → drivers | First DNF (Did Not Finish) |
| `no_dnf` | boolean | NOT NULL, default false | Predict no DNFs in race |
| `safety_car` | boolean | - | Predict safety car deployed (Y/N) |
| `winning_margin` | text | - | Winning margin bucket (e.g., "0-5s") |
| `wildcard_answer` | boolean | - | Answer to race wildcard question |
| `score` | integer | - | Points awarded (0-100+) |
| `scored_at` | timestamptz | - | When prediction was scored |
| `created_at` | timestamptz | default `now()` | - |
| `updated_at` | timestamptz | default `now()` | - |

**Indexes**:
- `idx_predictions_user_race` on `(user_id, race_id)` (unique)
- `idx_predictions_race_id` on `race_id`
- `idx_predictions_scored` on `scored_at`

**Constraints**:
- UNIQUE `(user_id, race_id)` — one prediction per user per race
- Cannot update if `race.lock_time` has passed (enforced in API layer)

---

### `race_results`
Official race outcomes (one per race).

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | uuid | PK | Result ID |
| `race_id` | uuid | NOT NULL, UNIQUE, FK → races | Race these results belong to |
| `pole_driver_id` | uuid | FK → drivers | Actual pole position |
| `winner_driver_id` | uuid | FK → drivers | Actual race winner |
| `second_driver_id` | uuid | FK → drivers | Actual 2nd place |
| `third_driver_id` | uuid | FK → drivers | Actual 3rd place |
| `fastest_lap_driver_id` | uuid | FK → drivers | Actual fastest lap |
| `fastest_pit_team_id` | uuid | FK → teams | Actual fastest pit stop |
| `first_dnf_driver_id` | uuid | FK → drivers | Actual first DNF |
| `no_dnf` | boolean | NOT NULL, default false | True if no DNFs occurred |
| `safety_car` | boolean | - | True if safety car deployed |
| `winning_margin` | text | - | Winning margin bucket |
| `wildcard_result` | boolean | - | Wildcard question answer |
| `created_at` | timestamptz | default `now()` | - |
| `updated_at` | timestamptz | default `now()` | - |

**Constraints**: UNIQUE `race_id` — one result record per race

---

### `badges`
Achievement badge templates.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | uuid | PK | Badge ID |
| `name` | text | NOT NULL | e.g., "Perfect Slate" |
| `description` | text | NOT NULL | Badge description |
| `icon` | text | NOT NULL | Emoji or icon identifier |
| `type` | text | NOT NULL | 'prediction' or 'achievement' |
| `created_at` | timestamptz | default `now()` | - |

**Example Badges**:
- **Perfect Slate**: Awarded for scoring 100 points on a race (all 9 categories correct)
- **First Blood**: First prediction ever
- **Streak Master**: 5 races in a row with predictions

---

### `user_badges`
User's earned badges.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | uuid | PK | Award ID |
| `user_id` | uuid | NOT NULL, FK → users | User who earned badge |
| `badge_id` | uuid | NOT NULL, FK → badges | Badge earned |
| `race_id` | uuid | FK → races | Race associated with badge (if applicable) |
| `earned_at` | timestamptz | default `now()` | When badge was awarded |

**Indexes**:
- `idx_user_badges_user` on `user_id`
- `idx_user_badges_badge` on `badge_id`

---

### `dotd_votes`
Driver of the Day votes (post-race).

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | uuid | PK | Vote ID |
| `race_id` | uuid | NOT NULL, FK → races | Race being voted on |
| `user_id` | uuid | NOT NULL, FK → users | User who voted |
| `driver_id` | uuid | NOT NULL, FK → drivers | Driver voted for |
| `created_at` | timestamptz | default `now()` | - |

**Constraints**: UNIQUE `(race_id, user_id)` — one vote per user per race

---

## Bonus Prediction Tables

### `bonus_prediction_events`
Bonus prediction events (separate from races).

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | uuid | PK | Event ID |
| `type` | text | NOT NULL | 'sprint', 'open', 'winter' |
| `status` | text | NOT NULL, default 'draft' | Lifecycle status (see below) |
| `title` | text | NOT NULL | Event title |
| `description` | text | - | Event description |
| `race_id` | uuid | FK → races | Associated race (for sprint events) |
| `opens_at` | timestamptz | NOT NULL | When users can submit responses |
| `locks_at` | timestamptz | NOT NULL | Submission deadline |
| `published_at` | timestamptz | - | When event went live |
| `points_multiplier` | numeric | NOT NULL, default 1.0 | Point multiplier for this event |
| `created_at` | timestamptz | default `now()` | - |
| `updated_at` | timestamptz | default `now()` | - |

**Status Lifecycle**: `draft` → `scheduled` → `open` → `locked` → `scored` → `archived`

---

### `bonus_prediction_questions`
Questions within bonus events.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | uuid | PK | Question ID |
| `event_id` | uuid | NOT NULL, FK → bonus_prediction_events | Parent event |
| `prompt` | text | NOT NULL | Question text |
| `response_type` | text | NOT NULL | 'choice_driver', 'choice_team', 'choice_custom' |
| `max_selections` | integer | NOT NULL, default 1 | How many options user can select |
| `points` | integer | NOT NULL | Points awarded for correct answer |
| `order_index` | integer | NOT NULL | Display order |
| `correct_option_ids` | uuid[] | - | Array of correct option IDs (for choice questions) |
| `correct_free_text` | text | - | Correct answer (for free text questions) |
| `created_at` | timestamptz | default `now()` | - |
| `updated_at` | timestamptz | default `now()` | - |

---

### `bonus_prediction_options`
Answer options for bonus questions.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | uuid | PK | Option ID |
| `question_id` | uuid | NOT NULL, FK → bonus_prediction_questions | Parent question |
| `label` | text | NOT NULL | Option label |
| `driver_id` | uuid | FK → drivers | If option references a driver |
| `team_id` | uuid | FK → teams | If option references a team |
| `order_index` | integer | NOT NULL | Display order |
| `created_at` | timestamptz | default `now()` | - |
| `updated_at` | timestamptz | default `now()` | - |

---

### `bonus_prediction_responses`
User responses to bonus questions.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | uuid | PK | Response ID |
| `event_id` | uuid | NOT NULL, FK → bonus_prediction_events | Parent event |
| `question_id` | uuid | NOT NULL, FK → bonus_prediction_questions | Question answered |
| `user_id` | uuid | NOT NULL, FK → users | User who responded |
| `selected_option_ids` | uuid[] | - | Array of selected option IDs |
| `free_text_answer` | text | - | Free text answer (if applicable) |
| `submitted_at` | timestamptz | default `now()` | - |
| `updated_at` | timestamptz | default `now()` | - |
| `points_awarded` | integer | - | Points earned (set after scoring) |
| `scored_at` | timestamptz | - | When response was scored |

**Constraints**: UNIQUE `(event_id, question_id, user_id)`

---

## Integration Tables

### `farcaster_cast_jobs`
Scheduled Farcaster cast jobs.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | uuid | PK | Job ID |
| `race_id` | uuid | FK → races | Associated race |
| `job_type` | text | NOT NULL | 'lock_reminder', 'dotd_summary', 'leaderboard', etc. |
| `scheduled_at` | timestamptz | NOT NULL | When to post |
| `posted_at` | timestamptz | - | When actually posted |
| `cast_hash` | text | - | Farcaster cast hash (for deletions) |
| `error_message` | text | - | Error if posting failed |
| `template_data` | jsonb | - | Template variables |
| `created_at` | timestamptz | default `now()` | - |

**Indexes**: `idx_farcaster_jobs_scheduled` on `scheduled_at`

---

### `friends_follow_cache`
Cached follow lists from Neynar (TTL-based).

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `fid` | bigint | PK | Farcaster ID |
| `following_fids` | bigint[] | NOT NULL | Array of FIDs user follows |
| `cached_at` | timestamptz | default `now()` | Cache timestamp |
| `expires_at` | timestamptz | NOT NULL | Cache expiry (60min TTL) |

**Purpose**: Optimize friends leaderboard queries by caching follow lists

---

## Relationships

```
users (1) ──< (N) predictions
users (1) ──< (N) user_badges
users (1) ──< (N) dotd_votes
users (1) ──< (N) bonus_prediction_responses

races (1) ──< (N) predictions
races (1) ──── (1) race_results
races (1) ──< (N) dotd_votes
races (1) ──< (N) farcaster_cast_jobs
races (1) ──< (N) bonus_prediction_events

badges (1) ──< (N) user_badges

drivers (1) ──< (N) predictions (via pole_driver_id, winner_driver_id, etc.)
teams (1) ──< (N) predictions (via fastest_pit_team_id)

bonus_prediction_events (1) ──< (N) bonus_prediction_questions
bonus_prediction_questions (1) ──< (N) bonus_prediction_options
bonus_prediction_questions (1) ──< (N) bonus_prediction_responses
```

## Row-Level Security (RLS)

All tables have RLS policies enforcing:
- **Users**: Read-only for all; write via service role only
- **Predictions**: Users can read own predictions; write restricted to owner and before lock time
- **Race Results**: Read-only for all; write via service role only
- **Admin tables**: Service role only

See [/supabase/schema.sql](../supabase/schema.sql) for full RLS policies.

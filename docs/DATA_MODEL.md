# Data Model

Source of truth: [`supabase/schema.sql`](../supabase/schema.sql) (snapshot refreshed 2025-10-26). All application tables live in the `public` schema and are protected by Supabase RLS policies. This document lists column definitions, key constraints, and relationships used by the app.

---

## `users`
Farcaster accounts linked to GridGuessr profiles.

| Column | Type | Constraints / Default | Notes |
| --- | --- | --- | --- |
| `id` | `uuid` | `PRIMARY KEY`, `DEFAULT extensions.uuid_generate_v4()` | Internal identifier |
| `fid` | `bigint` | `NOT NULL`, `UNIQUE` (`users_fid_key`) | Farcaster ID (immutable) |
| `username` | `text` | nullable | Stored from profile |
| `display_name` | `text` | nullable | |
| `pfp_url` | `text` | nullable | |
| `total_points` | `integer` | `NOT NULL DEFAULT 0` | Base + bonus totals |
| `perfect_slates` | `integer` | `NOT NULL DEFAULT 0` | Incremented when scoring awards Perfect Slate |
| `bonus_points` | `integer` | `NOT NULL DEFAULT 0` | Aggregated bonus event points |
| `created_at` | `timestamptz` | `DEFAULT now()` | |
| `updated_at` | `timestamptz` | `DEFAULT now()` | |

**Indexes:** `users_fid_key` (unique).  
**Relationships:** Referenced by nearly every table (`predictions`, `user_badges`, `dotd_votes`, `bonus_prediction_responses`, `friendships`).

---

## `races`
Season events that predictions and results attach to.

| Column | Type | Constraints / Default | Notes |
| --- | --- | --- | --- |
| `id` | `uuid` | `PRIMARY KEY`, `DEFAULT extensions.uuid_generate_v4()` | |
| `name` | `text` | `NOT NULL` | e.g. “Bahrain Grand Prix” |
| `circuit` | `text` | `NOT NULL` | |
| `country` | `text` | nullable | |
| `race_date` | `timestamptz` | `NOT NULL` | Actual race start |
| `lock_time` | `timestamptz` | `NOT NULL` | Prediction cutoff |
| `status` | `text` | `DEFAULT 'upcoming'` | `upcoming`, `locked`, `completed` |
| `wildcard_question` | `text` | nullable | Optional race-specific yes/no prompt |
| `season` | `integer` | `NOT NULL` | Year |
| `round` | `integer` | `NOT NULL` | Race number |
| `created_at` / `updated_at` | `timestamptz` | `DEFAULT now()` | |

**Relationships:**  
`predictions`, `race_results`, `dotd_votes`, `user_badges`, `bonus_prediction_events`, and `farcaster_cast_jobs` reference races. Deleting a race cascades to predictions and race_results; user badges set `race_id` to null.

---

## `race_results`
Official outcomes used for scoring.

| Column | Type | Constraints / Default | Notes |
| --- | --- | --- | --- |
| `id` | `uuid` | `PRIMARY KEY`, `DEFAULT extensions.uuid_generate_v4()` | |
| `race_id` | `uuid` | `NOT NULL`, `REFERENCES races(id) ON DELETE CASCADE` | |
| `pole_driver_id` / `winner_driver_id` / `second_driver_id` / `third_driver_id` | `uuid` | `REFERENCES drivers(id)` | Null until known |
| `fastest_lap_driver_id` | `uuid` | `REFERENCES drivers(id)` | |
| `fastest_pit_team_id` | `uuid` | `REFERENCES teams(id)` | |
| `first_dnf_driver_id` | `uuid` | `REFERENCES drivers(id)` | When `no_dnf = false` |
| `no_dnf` | `boolean` | `DEFAULT false` | |
| `safety_car` | `boolean` | nullable | |
| `winning_margin` | `text` | nullable | Bucket string |
| `wildcard_result` | `boolean` | nullable | Wildcard yes/no |
| `created_at` | `timestamptz` | `DEFAULT now()` | |

---

## `drivers`

| Column | Type | Constraints / Default | Notes |
| --- | --- | --- | --- |
| `id` | `uuid` | `PRIMARY KEY`, `DEFAULT extensions.uuid_generate_v4()` | |
| `name` | `text` | `NOT NULL` | |
| `team` | `text` | `NOT NULL` | Stored for reference |
| `number` | `text` | `NOT NULL` | Car number |
| `color` | `text` | `NOT NULL` | Hex string |
| `active` | `boolean` | `DEFAULT true` | UI filters use this |
| `created_at` | `timestamptz` | `DEFAULT now()` | |

---

## `teams`

| Column | Type | Constraints / Default | Notes |
| --- | --- | --- | --- |
| `id` | `uuid` | `PRIMARY KEY`, `DEFAULT extensions.uuid_generate_v4()` | |
| `name` | `text` | `NOT NULL`, `UNIQUE` (`teams_name_key`) | |
| `color` | `text` | `NOT NULL` | |
| `active` | `boolean` | `DEFAULT true` | |
| `created_at` | `timestamptz` | `DEFAULT now()` | |

---

## `predictions`
User submissions per race.

| Column | Type | Constraints / Default | Notes |
| --- | --- | --- | --- |
| `id` | `uuid` | `PRIMARY KEY`, `DEFAULT extensions.uuid_generate_v4()` | |
| `user_id` | `uuid` | `NOT NULL`, `REFERENCES users(id) ON DELETE CASCADE` | |
| `race_id` | `uuid` | `NOT NULL`, `REFERENCES races(id) ON DELETE CASCADE` | |
| `pole_driver_id` / `winner_driver_id` / `second_driver_id` / `third_driver_id` / `fastest_lap_driver_id` / `first_dnf_driver_id` | `uuid` | `REFERENCES drivers(id)` | Nullable until picked |
| `fastest_pit_team_id` | `uuid` | `REFERENCES teams(id)` | |
| `no_dnf` | `boolean` | `DEFAULT false` | |
| `safety_car` | `boolean` | nullable | |
| `winning_margin` | `text` | nullable | Bucket label |
| `wildcard_answer` | `boolean` | nullable | |
| `score` | `integer` | nullable | Calculated by admin scorer |
| `scored_at` | `timestamptz` | nullable | |
| `created_at` / `updated_at` | `timestamptz` | `DEFAULT now()` | |

**Constraints:**  
`UNIQUE (user_id, race_id)` ensures one prediction per user per race. Multiple foreign keys link to drivers/teams.

---

## `badges`
Catalog of achievements.

| Column | Type | Constraints / Default | Notes |
| --- | --- | --- | --- |
| `id` | `uuid` | `PRIMARY KEY`, `DEFAULT extensions.uuid_generate_v4()` | |
| `name` | `text` | `NOT NULL`, `UNIQUE (name)` | e.g. “Pole Prophet” |
| `description` | `text` | `NOT NULL` | |
| `icon` | `text` | `NOT NULL` | Asset path or identifier |
| `type` | `text` | `NOT NULL` | Categorical tag |
| `created_at` | `timestamptz` | `DEFAULT now()` | |

---

## `user_badges`
Instances of badges earned by users.

| Column | Type | Constraints / Default | Notes |
| --- | --- | --- | --- |
| `id` | `uuid` | `PRIMARY KEY`, `DEFAULT extensions.uuid_generate_v4()` | |
| `user_id` | `uuid` | `NOT NULL`, `REFERENCES users(id) ON DELETE CASCADE` | |
| `badge_id` | `uuid` | `NOT NULL`, `REFERENCES badges(id) ON DELETE CASCADE` | |
| `race_id` | `uuid` | nullable, `REFERENCES races(id) ON DELETE SET NULL` | Links badge to race context |
| `earned_at` | `timestamptz` | `DEFAULT now()` | |

**Constraints:** `UNIQUE (user_id, badge_id, race_id)` prevents duplicate awards per race.  
**Indexes:** `idx_user_badges_user_id`.

---

## `dotd_votes`
Driver of the Day ballots.

| Column | Type | Constraints / Default | Notes |
| --- | --- | --- | --- |
| `id` | `uuid` | `PRIMARY KEY`, `DEFAULT extensions.uuid_generate_v4()` | |
| `race_id` | `uuid` | `NOT NULL`, `REFERENCES races(id) ON DELETE CASCADE` | |
| `user_id` | `uuid` | `NOT NULL`, `REFERENCES users(id) ON DELETE CASCADE` | |
| `driver_id` | `uuid` | `NOT NULL`, `REFERENCES drivers(id) ON DELETE CASCADE` | |
| `created_at` | `timestamptz` | `DEFAULT now()` | |

**Constraints:** `UNIQUE (race_id, user_id)` ensures one vote per user per race.

---

## `friendships`
Legacy friend relationships (still referenced by some helpers).

| Column | Type | Constraints / Default | Notes |
| --- | --- | --- | --- |
| `id` | `uuid` | `PRIMARY KEY`, `DEFAULT extensions.uuid_generate_v4()` | |
| `user_id` | `uuid` | `NOT NULL`, `REFERENCES users(id) ON DELETE CASCADE` | |
| `friend_fid` | `bigint` | `NOT NULL` | Farcaster ID |
| `created_at` | `timestamptz` | `DEFAULT now()` | |

**Constraints:** `UNIQUE (user_id, friend_fid)`.

---

## `friends_follow_cache`
Persisted Neynar follow cache used by `/api/leaderboard?type=friends`.

| Column | Type | Constraints / Default | Notes |
| --- | --- | --- | --- |
| `fid` | `text` | `PRIMARY KEY` | Stored as string for consistency |
| `friend_fids` | `jsonb` | `NOT NULL` | Array of numeric FIDs |
| `expires_at` | `timestamptz` | `NOT NULL` | Controls TTL |

---

## `bonus_prediction_events`
High-level containers for bonus questions.

| Column | Type | Constraints / Default | Notes |
| --- | --- | --- | --- |
| `id` | `uuid` | `PRIMARY KEY`, `DEFAULT gen_random_uuid()` | |
| `type` | `text` | `NOT NULL`, `CHECK` (`type` ∈ `['sprint','open','winter']`) | |
| `status` | `text` | `DEFAULT 'draft'`, `CHECK` (`status` ∈ `['draft','scheduled','open','locked','scored','archived']`) | |
| `title` | `text` | `NOT NULL` | |
| `description` | `text` | nullable | |
| `race_id` | `uuid` | nullable, `REFERENCES races(id) ON DELETE SET NULL` | |
| `opens_at` | `timestamptz` | `NOT NULL` | |
| `locks_at` | `timestamptz` | `NOT NULL` | |
| `published_at` | `timestamptz` | nullable | |
| `points_multiplier` | `numeric` | `DEFAULT 1` | Applied at scoring time |
| `created_at` / `updated_at` | `timestamptz` | `DEFAULT now()` | |

---

## `bonus_prediction_questions`

| Column | Type | Constraints / Default | Notes |
| --- | --- | --- | --- |
| `id` | `uuid` | `PRIMARY KEY`, `DEFAULT gen_random_uuid()` | |
| `event_id` | `uuid` | `NOT NULL`, `REFERENCES bonus_prediction_events(id) ON DELETE CASCADE` | |
| `prompt` | `text` | `NOT NULL` | |
| `response_type` | `text` | `NOT NULL`, `CHECK` (`response_type` ∈ `['choice_driver','choice_team','choice_custom','free_text']`) | |
| `max_selections` | `integer` | `DEFAULT 1`, `NOT NULL` | |
| `points` | `integer` | `NOT NULL` | Base points before multiplier |
| `order_index` | `integer` | `DEFAULT 0`, `NOT NULL` | |
| `correct_option_ids` | `uuid[]` | nullable | Used after scoring |
| `correct_free_text` | `text` | nullable | |
| `created_at` / `updated_at` | `timestamptz` | `DEFAULT now()` | |

---

## `bonus_prediction_options`

| Column | Type | Constraints / Default | Notes |
| --- | --- | --- | --- |
| `id` | `uuid` | `PRIMARY KEY`, `DEFAULT gen_random_uuid()` | |
| `question_id` | `uuid` | `NOT NULL`, `REFERENCES bonus_prediction_questions(id) ON DELETE CASCADE` | |
| `label` | `text` | `NOT NULL` | |
| `driver_id` | `uuid` | nullable, `REFERENCES drivers(id) ON DELETE SET NULL` | |
| `team_id` | `uuid` | nullable, `REFERENCES teams(id) ON DELETE SET NULL` | |
| `order_index` | `integer` | `DEFAULT 0`, `NOT NULL` | |
| `created_at` / `updated_at` | `timestamptz` | `DEFAULT now()` | |

---

## `bonus_prediction_responses`

| Column | Type | Constraints / Default | Notes |
| --- | --- | --- | --- |
| `id` | `uuid` | `PRIMARY KEY`, `DEFAULT gen_random_uuid()` | |
| `event_id` | `uuid` | `NOT NULL`, `REFERENCES bonus_prediction_events(id) ON DELETE CASCADE` | |
| `question_id` | `uuid` | `NOT NULL`, `REFERENCES bonus_prediction_questions(id) ON DELETE CASCADE` | |
| `user_id` | `uuid` | `NOT NULL`, `REFERENCES users(id) ON DELETE CASCADE` | |
| `selected_option_ids` | `uuid[]` | `DEFAULT '{}'::uuid[]`, `NOT NULL` | |
| `free_text_answer` | `text` | nullable | |
| `submitted_at` | `timestamptz` | `DEFAULT now()`, `NOT NULL` | |
| `updated_at` | `timestamptz` | `DEFAULT now()`, `NOT NULL` | |
| `points_awarded` | `integer` | `DEFAULT 0`, `NOT NULL` | |
| `scored_at` | `timestamptz` | nullable | |

**Constraints:** `UNIQUE (event_id, question_id, user_id)`.

---

## `farcaster_cast_jobs`
Queue of casts to be dispatched by cron or admin flows.

| Column | Type | Constraints / Default | Notes |
| --- | --- | --- | --- |
| `id` | `uuid` | `PRIMARY KEY`, `DEFAULT gen_random_uuid()` | |
| `template` | `text` | `NOT NULL` | e.g. `lock-reminder` |
| `payload_args` | `jsonb` | `NOT NULL` | Template parameters |
| `job_key` | `text` | nullable | Stable identifier for deduping |
| `status` | `text` | `DEFAULT 'pending'`, `CHECK` values `['pending','processing','completed','failed']` | |
| `scheduled_for` | `timestamptz` | `NOT NULL` | Execution timestamp |
| `attempt_count` | `integer` | `DEFAULT 0`, `NOT NULL` | |
| `last_attempt_at` | `timestamptz` | nullable | |
| `completed_at` | `timestamptz` | nullable | |
| `channel_id` | `text` | nullable | Farcaster channel override |
| `last_error` | `text` | nullable | Last failure message |
| `response_body` | `jsonb` | nullable | Raw API response |
| `created_at` / `updated_at` | `timestamptz` | `DEFAULT now()`, `NOT NULL` | |

---

## Relationships Overview

```
users ──< predictions >── races
users ──< user_badges >── badges
users ──< dotd_votes >── races
users ──< bonus_prediction_responses >── bonus_prediction_questions ──< bonus_prediction_options
bonus_prediction_events ──< bonus_prediction_questions
bonus_prediction_events ──< bonus_prediction_responses (via questions)
races ──< race_results (1:1), dotd_votes, bonus_prediction_events, farcaster_cast_jobs
drivers ──< predictions, race_results, bonus_prediction_options, dotd_votes
teams ──< predictions, race_results, bonus_prediction_options
```

---

## RLS & Access Notes
- Public endpoints use the anon Supabase client (`supabase`). RLS policies restrict reads/writes to user-scoped data.
- Administrative flows use the service role client (`supabaseAdmin`) and bypass RLS for scoring, badge awarding, and job scheduling.
- `friends_follow_cache`, `farcaster_cast_jobs`, and `bonus_prediction_*` tables are primarily written by service role logic.

When the schema evolves, rerun `scripts/dump-schema.sh` and update this file so column-level documentation stays accurate. Flag any new tables not yet referenced in code as TODOs for future implementation.

# Features & Business Logic

## Race Prediction System

### How It Works
1. Admin creates race with `lock_time` and `race_date`
2. Users submit predictions before `lock_time`
3. Race happens in real life
4. Admin submits official results via `/api/admin/results`
5. Scoring engine auto-calculates points for all predictions
6. Badges awarded for perfect slates (100 points)

### Prediction Categories (9 total)
Each category worth specific points:

1. **Pole Position** (15 pts) – Driver who qualifies fastest
2. **Race Winner** (15 pts) – Driver who wins the race
3. **2nd Place** (10 pts) – Second place finisher
4. **3rd Place** (10 pts) – Third place finisher
5. **Fastest Lap** (10 pts) – Driver with fastest lap during race
6. **Fastest Pit Stop** (10 pts) – Team with fastest pit stop
7. **First DNF** (10 pts) – First driver to retire (Did Not Finish)
8. **Safety Car** (10 pts) – Yes/No: Will safety car be deployed?
9. **Winning Margin** (10 pts) – Time gap between 1st and 2nd (bucketed)

**Wildcard Question** (+10 pts) – Custom yes/no question per race (e.g., "Will there be a red flag?")

**Total Possible**: 100 points (9 categories + wildcard)

### Winning Margin Buckets
Predefined time ranges (exact implementation in scoring logic):
- `0-5s` – Very close finish
- `5-10s` – Close finish
- `10-20s` – Comfortable win
- `20-30s` – Dominant win
- `30+s` – Total domination

### Rules & Invariants

**Lock Time**:
- Predictions cannot be submitted/edited after `race.lock_time`
- Enforced in API layer (see [/api/predictions/route.ts](../src/app/api/predictions/route.ts))
- Race status transitions: `upcoming` → `locked` → `completed`

**Uniqueness**:
- One prediction per user per race (unique constraint on `(user_id, race_id)`)
- Upsert behavior: Updates existing prediction if before lock time

**Scoring**:
- Scoring triggered by admin submitting race results
- All predictions for race scored in single transaction
- Points added to `users.total_points` (additive only)
- `predictions.score` and `predictions.scored_at` updated

**Perfect Slate**:
- Awarded when user scores all 9 base categories correctly (90+ points)
- TODO: Verify exact threshold (90 vs 100 points including wildcard)
- Badge awarded automatically during scoring
- `users.perfect_slates` counter incremented

---

## Leaderboard System

### Global Leaderboard
- All users ranked by `total_points DESC`
- No time limit (all-time leaderboard)
- Includes `bonus_points` from bonus prediction events
- Default limit: 100 users

### Friends Leaderboard
- Filtered to users the viewer follows on Farcaster
- Follow list fetched from Neynar API
- **Cache TTL**: 60 minutes (stored in `friends_follow_cache` table)
- Cache key: viewer's FID
- Cache stores: array of followed FIDs with `expires_at` timestamp

**Performance Optimization**:
- Follow lists cached in database (not just memory)
- Survives server restarts
- Reduces Neynar API calls significantly

### User Rank
- User's global rank calculated as: `SELECT COUNT(*) + 1 FROM users WHERE total_points > user.total_points`
- Returned alongside leaderboard in `/api/leaderboard` response

---

## Bonus Prediction System

### Event Types
1. **Sprint** (`type: 'sprint'`) – Sprint race weekend predictions (tied to `race_id`)
2. **Open** (`type: 'open'`) – Open-ended predictions (no race association)
3. **Winter** (`type: 'winter'`) – Off-season predictions (e.g., driver moves, team changes)

### Event Lifecycle
```
draft → scheduled → open → locked → scored → archived
```

**Status Transitions**:
- `draft` – Admin creating event (not visible to users)
- `scheduled` – Event created, will open at `opens_at` time
- `open` – Users can submit responses
- `locked` – Submissions closed (at `locks_at` time)
- `scored` – Responses evaluated and points awarded
- `archived` – Event hidden from default queries

### Question Types
1. **choice_driver** – Select driver(s) from roster
2. **choice_team** – Select team(s) from roster
3. **choice_custom** – Custom text options

**Multi-select**: Questions can allow multiple selections (`max_selections > 1`)

### Scoring Logic
See [lib/bonusPredictions.ts](../src/lib/bonusPredictions.ts:evaluateBonusResponse)

**Full Points**:
- User selected ALL correct options and NO incorrect options

**Partial Points**:
- Proportional to correct selections (e.g., 2/3 correct = 67% of points)

**Zero Points**:
- User selected any incorrect option
- User missed correct option in single-select question

**Points Multiplier**:
- Event-level multiplier applied to all questions (e.g., `1.5x` for sprint events)
- Final points = `base_points * multiplier`

### Invariants
- One response per user per question (unique constraint on `(event_id, question_id, user_id)`)
- Responses upsertable before event locks
- Points awarded only after admin scores event
- Bonus points tracked separately from race points (`users.bonus_points`)

---

## Badge System

### Badge Types
1. **Prediction** (`type: 'prediction'`) – Earned from race predictions
2. **Achievement** (`type: 'achievement'`) – Meta achievements (e.g., "5 predictions in a row")

### Current Badges

**Perfect Slate** (prediction badge):
- Awarded when user scores 100 points on a race
- Tied to specific race (`user_badges.race_id`)
- Can be earned multiple times (one per race)

**First Blood** (achievement badge):
- TODO: Implement – Awarded for first prediction ever
- One-time only

**Streak Master** (achievement badge):
- TODO: Implement – Awarded for 5 consecutive races with predictions
- One-time only

### Badge Awarding Logic
See scoring logic in [/api/admin/results/route.ts](../src/app/api/admin/results/route.ts)

**Automatic Awards**:
- Perfect Slate badge awarded during race scoring
- Checked for each prediction with `score >= 100`
- Idempotent: Won't award duplicate badges for same race

**Manual Awards**:
- Achievement badges currently require manual insertion
- TODO: Implement auto-detection in scoring pipeline

---

## Driver of the Day (DOTD)

### How It Works
1. Race completes
2. Users vote for best-performing driver
3. Votes aggregated in real-time
4. Admin posts DOTD summary to Farcaster after voting window closes

### Rules
- One vote per user per race (unique constraint)
- Votes can be changed (upsert behavior)
- No deadline enforcement (yet) – TODO: Add `voting_closes_at` to races

### Vote Aggregation
```typescript
// Example response from GET /api/dotd?raceId=...
{
  "votes": {
    "driver-uuid-1": 145,  // Max Verstappen
    "driver-uuid-2": 89,   // Lando Norris
    "driver-uuid-3": 67    // Charles Leclerc
  },
  "totalVotes": 301,
  "userVote": "driver-uuid-1"  // If user voted
}
```

### Farcaster Integration
- DOTD summary cast scheduled after race completion
- Cast includes winner, vote percentages, top 3 drivers
- Template defined in [lib/farcaster/templates.ts](../src/lib/farcaster/templates.ts)

---

## Farcaster Cast Jobs

### Job Types
1. **lock_reminder** – Reminder that predictions lock soon
2. **dotd_summary** – Driver of the Day voting results
3. **leaderboard** – Weekly leaderboard updates
4. **perfect_slate** – Celebrate users who scored 100 points

### Scheduling
**Lock Reminders**:
- Scheduled when race created (see [/api/admin/races/route.ts](../src/app/api/admin/races/route.ts))
- 3 reminders per race:
  - 2 hours before lock
  - 1 hour before lock
  - 30 minutes before lock

**DOTD Summary**:
- Scheduled manually by admin after race completion
- Or auto-scheduled after results submitted (TODO: verify implementation)

**Leaderboard Updates**:
- Currently manual (admin triggers via `/api/admin/farcaster`)
- TODO: Add weekly cron job

### Job Processing
- Cron job runs every 5 minutes: `GET /api/cron/farcaster`
- Fetches pending jobs where `scheduled_at <= now()` and `posted_at IS NULL`
- Posts cast via Neynar API
- Updates `posted_at` and `cast_hash` on success
- Stores `error_message` on failure (retries not implemented)

### Cast Templates
See [lib/farcaster/templates.ts](../src/lib/farcaster/templates.ts)

Example lock reminder:
```
🏁 Predictions lock in 1 hour for the Bahrain Grand Prix!

Make your picks now 👇
[Launch GridGuessr]
```

---

## Frame Notifications

### How It Works
- Admin sends notifications via `/api/admin/notifications`
- Uses Neynar Frame Notifications API
- Targets GridGuessr users on Farcaster
- Appears in users' Warpcast notification tray

### Filtering Options
1. **filterFids** – Only send to specific FIDs (whitelist)
2. **excludeFids** – Exclude specific FIDs (blacklist)
3. **followersOnly** – Only send to followers of @your-app-handle account

**Example Use Cases**:
- New race available: Notify all active users
- Results published: Notify users who predicted that race
- Perfect slate celebration: Notify users who got 100 points

### Notification Payload
```typescript
{
  title: "New Race Available!",
  body: "Make your predictions for the Monaco Grand Prix",
  targetUrl: "https://your-app.vercel.app",
  // Optional filters:
  filterFids: [123, 456],
  excludeFids: [789],
  followersOnly: true
}
```

---

## Data Invariants (Critical!)

**Never violate these; they ensure data integrity:**

1. **Points are additive**: `total_points` and `bonus_points` never decrease (except manual admin correction)
2. **Lock time is sacred**: Predictions cannot be edited after `race.lock_time` or when `race.status != 'upcoming'`
3. **One prediction per race**: Unique constraint `(user_id, race_id)` enforced at DB level
4. **One vote per race**: Unique constraint `(user_id, race_id)` for DOTD votes
5. **Perfect slate threshold**: Badge awarded when `score >= 100` (TODO: verify exact threshold)
6. **FID immutability**: `users.fid` never changes after user creation
7. **Service role for scoring**: Always use `supabaseAdmin` for scoring operations (bypasses RLS)
8. **Anon client for reads**: Use `supabase` (anon key) for user-facing queries (respects RLS)

---

## Edge Cases & Known Limitations

### Race Predictions
- **No DNF + First DNF conflict**: User can predict both `no_dnf = true` and `first_dnf_driver_id`. Scoring logic awards points for whichever is correct.
- **Wildcard questions**: Not all races have wildcard questions (`wildcard_question` can be null). Points not awarded if null.
- **Driver changes mid-season**: If driver moves teams, old predictions still reference old `driver.team`. Not retroactively updated.

### Leaderboard
- **Friend cache staleness**: Follow lists cached 60min. Users might not see new followers for up to 1 hour.
- **Large follow lists**: Neynar API capped at 300 follows (see `FOLLOW_TOTAL_CAP`). Users following >300 won't see all friends.
- **Deleted users**: If user deletes Farcaster account, their GridGuessr profile persists. No auto-cleanup.

### Bonus Predictions
- **Partial scoring ambiguity**: Partial credit formula TBD (see [lib/bonusPredictions.ts](../src/lib/bonusPredictions.ts))
- **No retroactive scoring**: Changing question options after users respond doesn't re-score existing responses

### Farcaster Integration
- **Cast job failures**: No retry mechanism. Failed jobs stay in table with `error_message` set.
- **Deleted casts**: If admin deletes cast manually on Farcaster, `cast_hash` becomes invalid but stays in DB.
- **Rate limiting**: Neynar API has rate limits. No backoff/retry logic implemented.

---

## Future Considerations

### Planned Features
- [ ] Streak badges (consecutive races with predictions)
- [ ] Seasonal leaderboards (reset each year)
- [ ] Team leaderboards (aggregate points by favorite team)
- [ ] Push notifications via Farcaster (opt-in)
- [ ] Prediction analytics (most accurate users per category)
- [ ] Historical race data visualization
- [ ] Penalty system for disqualified drivers (adjust scores retroactively)

### Technical Debt
- [ ] Add `voting_closes_at` to races (DOTD deadline enforcement)
- [ ] Implement perfect slate threshold verification (90 vs 100 points)
- [ ] Add retry logic for failed cast jobs
- [ ] Increase friends follow cap beyond 300
- [ ] Add partial scoring formula documentation
- [ ] Auto-cleanup deleted Farcaster users (GDPR compliance)
- [ ] Add rate limiting to public API endpoints
- [ ] Migrate friends cache to Redis (currently Postgres table)

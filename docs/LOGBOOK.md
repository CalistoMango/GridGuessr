# Dev Logbook

## 2025-10-21
- docs: bootstrapped docs-lite system with 4 core files
- docs: generated comprehensive documentation from codebase analysis
  - PROJECT_SETUP.md: Next.js + Supabase stack, env vars, deployment, scoring system
  - DATA_MODEL.md: Full PostgreSQL schema (15+ tables), relationships, RLS policies
  - API.md: 25+ API routes with request/response examples, admin routes, cron jobs
  - FEATURES.md: Race predictions, leaderboards, bonus predictions, DOTD, badges, Farcaster integration, invariants, edge cases
- docs: corrected outdated references to Drizzle ORM (actual implementation uses Supabase client directly)
- docs: documented friends leaderboard caching strategy (60min TTL, Postgres cache table)
- docs: documented Farcaster cast job scheduling system (lock reminders, DOTD summaries)
- docs: captured data invariants (lock time enforcement, points additivity, unique constraints)
- docs: listed TODOs for technical debt (Redis migration, rate limiting, retry logic, GDPR compliance)

---

## 2025-10-27 - Admin UTC Fixes & Bonus Submission Guards

- fix(admin): convert datetime-local inputs to UTC before storage [files: [src/app/admin/components/AdminRaceSection.tsx](src/app/admin/components/AdminRaceSection.tsx), [src/app/admin/utils.ts](src/app/admin/utils.ts)]
- feat(bonus): add submission tracking to prevent duplicate bonus submissions [files: [src/components/gridguessr/hooks/useBonusPredictions.ts](src/components/gridguessr/hooks/useBonusPredictions.ts)]
- feat(bonus): display submission state in UI and disable editing after submission [files: [src/components/gridguessr/GridGuessr.tsx](src/components/gridguessr/GridGuessr.tsx), [src/components/gridguessr/views/BonusPredictionsView.tsx](src/components/gridguessr/views/BonusPredictionsView.tsx), [src/components/gridguessr/views/HomeView.tsx](src/components/gridguessr/views/HomeView.tsx)]
- chore(gitignore): update path for LLM docs exclusion [files: .gitignore]

---

## 2025-10-26 - Documentation Sync

- docs: synchronized all documentation with current codebase
- Updated README.md, docs/API.md, docs/DATA_MODEL.md, docs/FEATURES.md, docs/PROJECT_SETUP.md, docs/LLM.md to reflect current routes, schema, env vars, badges, and Farcaster automation
- Removed stale references to outdated scoring thresholds, deprecated cron cadences, and unused libraries

---

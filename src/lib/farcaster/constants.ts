/**
 * Farcaster casting configuration constants.
 *
 * Values defined here shape how the Farcaster integration schedules,
 * retries, and formats casts. Adjust these to tune reminder cadences
 * or payload limits without digging through implementation details.
 *
 * TIP: Unlike `src/lib/constants.ts`, this file is not managed by the
 * project init script, so edits here are safe from being overwritten.
 */

// Supabase table that stores queued Farcaster casts.
export const FARCASTER_CAST_JOBS_TABLE = 'farcaster_cast_jobs';

// Retry limit before a job is marked as permanently failed.
export const FARCASTER_MAX_ATTEMPTS = 5;

// Default reminder windows before race lock expressed in minutes (24h, 1h).
export const LOCK_REMINDER_OFFSETS_MINUTES = [1440, 60];

// The fallback delay for Driver of the Day recaps (2 days post-race).
export const DEFAULT_DRIVER_OF_DAY_OFFSET_HOURS = 48; // 2 days after race date

// Hard cap on Farcaster cast text length enforced by Neynar.
export const CAST_TEXT_MAX_LENGTH = 320;

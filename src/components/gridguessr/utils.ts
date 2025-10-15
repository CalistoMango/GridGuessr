import { useMemo } from "react";

import { BonusEventStatus, Predictions, Race } from "./types";

// Small shared helpers that are reused by hooks and view components.
// Keep business logic (lock timing, prediction defaults, etc.) in one place so
// behaviour stays consistent across the app.

export const MARGIN_BUCKETS = ["0-2s", "2-4s", "4-7s", "7-12s", "12-20s", "20s+"];

// Export a frozen template so we can generate new prediction objects with the
// same defaults while avoiding accidental mutation of the baseline shape.
export const DEFAULT_PREDICTIONS: Predictions = {
  pole: null,
  podium: [null, null, null],
  fastestLap: null,
  fastestPitStop: null,
  firstDNF: null,
  safetyCar: null,
  winningMargin: null,
  wildcard: null,
};

Object.freeze(DEFAULT_PREDICTIONS);
Object.freeze(DEFAULT_PREDICTIONS.podium);

export const createDefaultPredictions = (): Predictions => ({
  pole: null,
  podium: [null, null, null],
  fastestLap: null,
  fastestPitStop: null,
  firstDNF: null,
  safetyCar: null,
  winningMargin: null,
  wildcard: null,
});

// Convenience hook for components that expect the margin buckets as a stable
// reference (avoids needless re-renders when passing to children).
export const useMarginBuckets = () => useMemo(() => MARGIN_BUCKETS, []);

export interface LockMetadata {
  lockCountdownText: string;
  lockLocalTimeText: string;
  isLocked: boolean;
}

// Compute countdown strings and lock status in one place so all views display
// the same messaging about the prediction window.
export function computeLockMetadata(displayRace: Race | null, race: Race | null): LockMetadata {
  const lockReference = displayRace ?? race;
  const lockDate = lockReference ? new Date(lockReference.lock_time) : null;
  const now = new Date();

  let lockCountdownText = "Lock time TBD";
  let lockLocalTimeText = "";
  let isLocked = false;

  if (lockDate) {
    const diffMs = lockDate.getTime() - now.getTime();

    if (diffMs > 0) {
      // Translate millisecond difference into a compact `Xd Yh` style string.
      const totalMinutes = Math.round(diffMs / (1000 * 60));
      const totalHours = Math.floor(totalMinutes / 60);
      const parts: string[] = [];

      if (totalHours >= 48) {
        const days = Math.floor(totalHours / 24);
        const hours = totalHours % 24;
        const minutes = totalMinutes % 60;

        parts.push(`${days}d`);
        if (hours > 0) {
          parts.push(`${hours}h`);
        } else if (minutes > 0) {
          parts.push(`${minutes}m`);
        }
      } else {
        const hours = totalHours;
        const minutes = totalMinutes % 60;
        if (hours > 0) parts.push(`${hours}h`);
        parts.push(`${minutes}m`);
      }

      lockCountdownText = `Locks in ${parts.join(" ")}`;
    } else {
      lockCountdownText = "Grid locked";
      isLocked = true;
    }

    // Show the user's local lock time so they do not have to calculate it.
    lockLocalTimeText = lockDate.toLocaleString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    });

    if (lockReference?.status === "locked" || lockReference?.status === "completed") {
      isLocked = true;
      lockCountdownText = "Grid locked";
    }
  } else if (lockReference?.status === "locked" || lockReference?.status === "completed") {
    isLocked = true;
    lockCountdownText = "Grid locked";
  }

  return { lockCountdownText, lockLocalTimeText, isLocked };
}

// Helper used primarily in tests; the live component relies on the hook's
// memoised equivalent. Kept exported for any future non-hook consumers.
export function calculateCompletion(predictions: Predictions) {
  let completed = 0;
  const total = 8;

  if (predictions.pole) completed++;
  if (predictions.podium.filter(Boolean).length === 3) completed++;
  if (predictions.fastestLap) completed++;
  if (predictions.fastestPitStop) completed++;
  if (predictions.firstDNF !== null) completed++;
  if (predictions.safetyCar !== null) completed++;
  if (predictions.winningMargin) completed++;
  if (predictions.wildcard !== null) completed++;

  return { completed, total, percentage: Math.round((completed / total) * 100) };
}

export function computeBonusLockText(locksAt: string, status: BonusEventStatus): { text: string; isLocked: boolean } {
  const lockDate = locksAt ? new Date(locksAt) : null;
  const now = new Date();

  if (!lockDate || Number.isNaN(lockDate.getTime())) {
    const locked = status === "locked" || status === "scored" || status === "archived";
    return {
      text: locked ? "Bonus locked" : "Lock time TBD",
      isLocked: locked,
    };
  }

  if (lockDate <= now || status === "locked" || status === "scored" || status === "archived") {
    return { text: "Bonus locked", isLocked: true };
  }

  const diffMs = lockDate.getTime() - now.getTime();
  const totalMinutes = Math.round(diffMs / (1000 * 60));
  const totalHours = Math.floor(totalMinutes / 60);
  const parts: string[] = [];
  if (totalHours >= 24) {
    const days = Math.floor(totalHours / 24);
    const hours = totalHours % 24;
    const minutes = totalMinutes % 60;
    parts.push(`${days}d`);
    if (hours > 0) {
      parts.push(`${hours}h`);
    }
    if (minutes > 0) {
      parts.push(`${minutes}m`);
    }
  } else {
    if (totalHours > 0) {
      parts.push(`${totalHours}h`);
    }
    const minutes = Math.max(totalMinutes % 60, 0);
    if (minutes > 0 || parts.length === 0) {
      parts.push(`${minutes}m`);
    }
  }

  return {
    text: `Locks in ${parts.join(" ")}`,
    isLocked: false,
  };
}

import { useCallback, useEffect, useState } from "react";

import { LeaderboardEntry } from "../types";

// Handles both global and friends leaderboard calls. Components can subscribe to
// this hook instead of juggling two fetches and conditional fid checks.

interface UseLeaderboardsResult {
  leaderboard: LeaderboardEntry[];
  friendsLeaderboard: LeaderboardEntry[];
  refresh: () => Promise<void>;
}

export function useLeaderboards(fid: string | number | null): UseLeaderboardsResult {
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [friendsLeaderboard, setFriendsLeaderboard] = useState<LeaderboardEntry[]>([]);

  const fetchLeaderboards = useCallback(async () => {
    // Without an fid we cannot request personalised data, so reset to empty.
    if (!fid) {
      setLeaderboard([]);
      setFriendsLeaderboard([]);
      return;
    }

    try {
      const [globalRes, friendsRes] = await Promise.all([
        fetch("/api/leaderboard?type=global&limit=100"),
        fetch(`/api/leaderboard?type=friends&fid=${fid}`),
      ]);

      const globalData = await globalRes.json();
      const friendsData = await friendsRes.json();

      setLeaderboard(globalData.leaderboard ?? []);
      setFriendsLeaderboard(friendsData.leaderboard ?? []);
    } catch (error) {
      console.error("Error fetching leaderboards:", error);
    }
  }, [fid]);

  useEffect(() => {
    // Refetch whenever the fid changes (user switched) or the dependencies update.
    fetchLeaderboards().catch((error) => console.error("Leaderboard fetch failed:", error));
  }, [fetchLeaderboards, fid]);

  return { leaderboard, friendsLeaderboard, refresh: fetchLeaderboards };
}

import { useCallback, useEffect, useState } from "react";

import { UserBadges } from "../types";

// Lightweight hook that pulls badge progress for the active Farcaster user.

interface UseUserBadgesResult {
  userBadges: UserBadges;
  refresh: () => Promise<void>;
}

export function useUserBadges(fid: string | number | null): UseUserBadgesResult {
  const [userBadges, setUserBadges] = useState<UserBadges>(null);

  const fetchUserBadges = useCallback(async () => {
    // No fid means we have nobody to query badges for, so reset state.
    if (!fid) {
      setUserBadges(null);
      return;
    }

    try {
      const res = await fetch(`/api/badges?fid=${fid}`);
      const data = await res.json();
      setUserBadges(data.badges ?? null);
    } catch (error) {
      console.error("Error fetching badges:", error);
    }
  }, [fid]);

  useEffect(() => {
    // Pull fresh badge data whenever the user context changes.
    fetchUserBadges().catch((error) => console.error("Badge fetch failed:", error));
  }, [fetchUserBadges, fid]);

  return { userBadges, refresh: fetchUserBadges };
}

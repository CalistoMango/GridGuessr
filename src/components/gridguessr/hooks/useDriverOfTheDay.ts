import { useCallback, useEffect, useState } from "react";

import { DotdData, Driver, Race } from "../types";

// Encapsulates Driver of the Day voting logic. The container component only
// needs to pass frame context and current view, the hook handles fetching,
// optimistic UI updates, and submission feedback.

interface FrameProfile {
  username: string | null;
  displayName: string | null;
  pfpUrl: string | null;
}

interface UseDriverOfTheDayParams {
  fid: string | number | null;
  previousRace: Race | null;
  activeView: string;
  frameProfile: FrameProfile;
}

interface UseDriverOfTheDayResult {
  dotdVote: Driver | null;
  dotdData: DotdData | null;
  dotdSubmitted: boolean;
  dotdMessage: string | null;
  selectDriver: (driver: Driver) => void;
  submitVote: () => Promise<void>;
  refresh: () => Promise<void>;
}

export function useDriverOfTheDay({
  fid,
  previousRace,
  activeView,
  frameProfile,
}: UseDriverOfTheDayParams): UseDriverOfTheDayResult {
  const [dotdVote, setDotdVote] = useState<Driver | null>(null);
  const [dotdData, setDotdData] = useState<DotdData | null>(null);
  const [dotdSubmitted, setDotdSubmitted] = useState(false);
  const [dotdMessage, setDotdMessage] = useState<string | null>(null);

  // We always reference the most recent completed race for DOTD voting.
  const raceId = previousRace?.id ?? null;

  const fetchDotdData = useCallback(async () => {
    if (!raceId) {
      setDotdData(null);
      setDotdVote(null);
      setDotdSubmitted(false);
      return;
    }

    try {
      const fidQuery = fid ? `&fid=${fid}` : "";
      const res = await fetch(`/api/dotd?raceId=${raceId}${fidQuery}`);
      const data = await res.json();
      const sortedVotes = Array.isArray(data?.votes)
        ? [...data.votes].sort((a, b) => (b.votes ?? 0) - (a.votes ?? 0))
        : [];

      setDotdData({
        votes: sortedVotes,
        totalVotes: data?.totalVotes,
        userVote: data?.userVote ?? null,
      });

      if (data?.userVote?.driver) {
        setDotdVote(data.userVote.driver);
        setDotdSubmitted(true);
      } else {
        setDotdVote(null);
        setDotdSubmitted(false);
      }
    } catch (error) {
      console.error("Error fetching DOTD:", error);
    }
  }, [fid, raceId]);

  useEffect(() => {
    // Reset local state if the reference race changes (new weekend results).
    setDotdVote(null);
    setDotdMessage(null);
    setDotdSubmitted(false);
  }, [raceId]);

  useEffect(() => {
    if (!raceId) return;
    if (activeView === "dotd" || activeView === "home") {
      // Only refresh when the DOTD view or home (which shows the teaser) is visible.
      fetchDotdData().catch((error) => console.error("DOTD fetch failed:", error));
    }
  }, [fetchDotdData, raceId, activeView]);

  const selectDriver = useCallback((driver: Driver) => {
    // Selecting a driver immediately updates local state and clears old messages.
    setDotdMessage(null);
    setDotdVote(driver);
    setDotdSubmitted(false);
  }, []);

  const submitVote = useCallback(async () => {
    if (!fid || !raceId || !dotdVote) return;

    try {
      // POST the vote along with the lightweight frame profile for display purposes.
      const res = await fetch("/api/dotd", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fid,
          raceId,
          driverId: dotdVote.id,
          profile: frameProfile,
        }),
      });

      if (res.ok) {
        await fetchDotdData();
        setDotdMessage("Vote submitted! Thanks for weighing in.");
        setDotdSubmitted(true);
      } else {
        const body = await res.json().catch(() => ({}));
        setDotdMessage(body?.error || "Unable to submit vote. Please try again.");
        setDotdSubmitted(false);
      }
    } catch (error) {
      console.error("Error submitting vote:", error);
      setDotdMessage("Unable to submit vote. Please try again.");
      setDotdSubmitted(false);
    }
  }, [dotdVote, fid, raceId, frameProfile, fetchDotdData]);

  return {
    dotdVote,
    dotdData,
    dotdSubmitted,
    dotdMessage,
    selectDriver,
    submitVote,
    refresh: fetchDotdData,
  };
}

import { useCallback, useEffect, useState } from "react";

import { Driver, Race, Team } from "../types";

// Fetch the core race context (current race, previous race, rosters). This hook
// shields components from API shape changes and exposes a simple loading flag
// plus a manual refresh method.

interface UseRaceSummaryResult {
  race: Race | null;
  displayRace: Race | null;
  previousRace: Race | null;
  drivers: Driver[];
  teams: Team[];
  loading: boolean;
  refresh: () => Promise<void>;
}

export function useRaceSummary(fid: string | number | null): UseRaceSummaryResult {
  const [race, setRace] = useState<Race | null>(null);
  const [displayRace, setDisplayRace] = useState<Race | null>(null);
  const [previousRace, setPreviousRace] = useState<Race | null>(null);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRaceData = useCallback(async () => {
    // Toggle loading so consumers can show skeletons while the summary loads.
    setLoading(true);
    try {
      const res = await fetch("/api/races/summary");
      const data = await res.json();

      setRace(data.currentRace ?? null);
      setDisplayRace(data.displayRace ?? data.currentRace ?? null);
      setPreviousRace(data.previousCompletedRace ?? null);
      setDrivers(data.drivers ?? []);
      setTeams(data.teams ?? []);
    } catch (error) {
      console.error("Error fetching race data:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Re-run whenever the fid changes (for example a different user opens the frame).
    fetchRaceData().catch((error) => console.error("Race fetch failed:", error));
  }, [fetchRaceData, fid]);

  return {
    race,
    displayRace,
    previousRace,
    drivers,
    teams,
    loading,
    refresh: fetchRaceData,
  };
}

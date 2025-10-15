import { useCallback, useEffect, useState } from "react";

import type { SeasonResults } from "../types";

interface UseResultsOptions {
  enabled?: boolean;
}

interface UseResultsReturn {
  seasons: SeasonResults[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useResults(
  fid: number | string | null,
  options: UseResultsOptions = {}
): UseResultsReturn {
  const { enabled = true } = options;
  const [seasons, setSeasons] = useState<SeasonResults[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchResults = useCallback(async () => {
    if (!enabled) return;
    if (!fid) {
      setSeasons([]);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({ fid: String(fid) });
      const response = await fetch(`/api/results?${params.toString()}`);

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        const message = typeof body?.error === "string" ? body.error : "Unable to load results.";
        throw new Error(message);
      }

      const data = await response.json();
      const seasonPayload = Array.isArray(data?.seasons) ? (data.seasons as SeasonResults[]) : [];
      setSeasons(seasonPayload);
    } catch (requestError) {
      console.error("Failed to fetch results:", requestError);
      setError(requestError instanceof Error ? requestError.message : "Failed to fetch results.");
    } finally {
      setLoading(false);
    }
  }, [enabled, fid]);

  useEffect(() => {
    if (!enabled) return;
    void fetchResults();
  }, [enabled, fetchResults]);

  return {
    seasons,
    loading,
    error,
    refresh: fetchResults,
  };
}

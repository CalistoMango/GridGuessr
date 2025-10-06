import { useCallback, useEffect, useMemo, useState } from "react";

import { createDefaultPredictions } from "../utils";
import { Driver, PodiumSetter, PredictionSetter, Predictions, Race, Team } from "../types";

// Centralised state machine for the prediction slate. Fetches existing picks,
// tracks form edits, and handles submission flow including completion meta.

interface FrameProfile {
  username: string | null;
  displayName: string | null;
  pfpUrl: string | null;
}

interface UsePredictionsStateParams {
  fid: string | number | null;
  race: Race | null;
  drivers: Driver[];
  teams: Team[];
  isLocked: boolean;
  frameProfile: FrameProfile;
  onSubmitSuccess: () => void;
}

interface UsePredictionsStateResult {
  predictions: Predictions;
  hasSubmittedSlate: boolean;
  isEditingSlate: boolean;
  setIsEditingSlate: (value: boolean) => void;
  isSubmitting: boolean;
  submitError: string | null;
  setPredictionValue: PredictionSetter;
  setPodiumPosition: PodiumSetter;
  submitPredictions: () => Promise<void>;
  completion: {
    completed: number;
    total: number;
    percentage: number;
  };
  resetSlateState: () => void;
}

// API helper to keep the payload shape consistent with server expectations.
function buildProfile(frameProfile: FrameProfile) {
  return {
    username: frameProfile.username,
    displayName: frameProfile.displayName,
    pfpUrl: frameProfile.pfpUrl,
  };
}

export function usePredictionsState({
  fid,
  race,
  drivers,
  teams,
  isLocked,
  frameProfile,
  onSubmitSuccess,
}: UsePredictionsStateParams): UsePredictionsStateResult {
  const [predictions, setPredictions] = useState<Predictions>(createDefaultPredictions());
  const [hasSubmittedSlate, setHasSubmittedSlate] = useState(false);
  const [isEditingSlate, setIsEditingSlate] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const fetchUserPrediction = useCallback(async () => {
    if (!fid || !race?.id || drivers.length === 0 || teams.length === 0) {
      // If we lack prerequisites (like the driver list) we reset to defaults so
      // the form does not render stale data.
      setHasSubmittedSlate(false);
      setIsEditingSlate(false);
      setPredictions(createDefaultPredictions());
      return;
    }

    try {
      const res = await fetch(`/api/predictions?fid=${fid}&raceId=${race.id}`);
      const data = await res.json();

      if (data?.prediction) {
        // Map the stored IDs back onto the live driver/team collections.
        setPredictions({
          pole: drivers.find((d) => d.id === data.prediction.pole_driver_id) ?? null,
          podium: [
            drivers.find((d) => d.id === data.prediction.winner_driver_id) ?? null,
            drivers.find((d) => d.id === data.prediction.second_driver_id) ?? null,
            drivers.find((d) => d.id === data.prediction.third_driver_id) ?? null,
          ],
          fastestLap: drivers.find((d) => d.id === data.prediction.fastest_lap_driver_id) ?? null,
          fastestPitStop: teams.find((t) => t.id === data.prediction.fastest_pit_team_id) ?? null,
          firstDNF: data.prediction.no_dnf
            ? "none"
            : drivers.find((d) => d.id === data.prediction.first_dnf_driver_id) ?? null,
          safetyCar: data.prediction.safety_car ?? null,
          winningMargin: data.prediction.winning_margin ?? null,
          wildcard: data.prediction.wildcard_answer ?? null,
        });
        setHasSubmittedSlate(true);
        setIsEditingSlate(false);
      } else {
        setHasSubmittedSlate(false);
        setIsEditingSlate(false);
        setPredictions(createDefaultPredictions());
      }
    } catch (error) {
      console.error("Error fetching prediction:", error);
      setHasSubmittedSlate(false);
      setIsEditingSlate(false);
      setPredictions(createDefaultPredictions());
    }
  }, [drivers, fid, race, teams]);

  useEffect(() => {
    // Kick off an initial fetch and re-run whenever dependencies change (e.g. new race).
    fetchUserPrediction().catch((error) => console.error("Prediction fetch failed:", error));
  }, [fetchUserPrediction]);

  const setPredictionValue: PredictionSetter = useCallback(
    (prop, value) => {
      if (isLocked) return;
      setPredictions((prev) => ({
        ...prev,
        [prop]: value,
      }));
    },
    [isLocked]
  );

  const setPodiumPosition: PodiumSetter = useCallback(
    (position, driver) => {
      if (isLocked) return;
      setPredictions((prev) => ({
        ...prev,
        podium: prev.podium.map((entry, index) => (index === position ? driver : entry)) as Predictions["podium"],
      }));
    },
    [isLocked]
  );

  const completion = useMemo(() => {
    // Keep completion derived so the component can show progress without recalculating manually.
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
  }, [predictions]);

  const submitPredictions = useCallback(async () => {
    if (!fid || !race || isSubmitting) return;
    if (isLocked) {
      // Guard against late submissions – messaging mirrors the old component.
      setSubmitError("This slate is locked. Head back to the home page to explore other actions.");
      return;
    }

    setSubmitError(null);
    setIsSubmitting(true);

    try {
      const profile = buildProfile(frameProfile);
      const res = await fetch("/api/predictions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fid,
          raceId: race.id,
          profile,
          poleDriverId: predictions.pole?.id ?? null,
          winnerDriverId: predictions.podium[0]?.id ?? null,
          secondDriverId: predictions.podium[1]?.id ?? null,
          thirdDriverId: predictions.podium[2]?.id ?? null,
          fastestLapDriverId: predictions.fastestLap?.id ?? null,
          fastestPitTeamId: predictions.fastestPitStop?.id ?? null,
          firstDnfDriverId:
            predictions.firstDNF === "none" ? null : (predictions.firstDNF as Driver | null)?.id ?? null,
          noDnf: predictions.firstDNF === "none",
          safetyCar: predictions.safetyCar ?? null,
          winningMargin: predictions.winningMargin ?? null,
          wildcardAnswer: predictions.wildcard,
        }),
      });

      if (!res.ok) {
        const message = await res.text();
        setSubmitError(message || "Failed to submit predictions. Try again.");
        return;
      }

      setHasSubmittedSlate(true);
      setIsEditingSlate(false);
      onSubmitSuccess();
    } catch (error) {
      console.error("Error submitting predictions:", error);
      setSubmitError("Unable to submit predictions. Check your connection and try again.");
    } finally {
      setIsSubmitting(false);
    }
  }, [fid, frameProfile, isLocked, isSubmitting, onSubmitSuccess, predictions, race]);

  const resetSlateState = useCallback(() => {
    // Allow consumers to force a clean slate (useful for future flows such as logout).
    setPredictions(createDefaultPredictions());
    setHasSubmittedSlate(false);
    setIsEditingSlate(false);
    setSubmitError(null);
    setIsSubmitting(false);
  }, []);

  return {
    predictions,
    hasSubmittedSlate,
    isEditingSlate,
    setIsEditingSlate,
    isSubmitting,
    submitError,
    setPredictionValue,
    setPodiumPosition,
    submitPredictions,
    completion,
    resetSlateState,
  };
}

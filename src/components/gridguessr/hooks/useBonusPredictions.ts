import { useCallback, useEffect, useMemo, useState } from "react";

import type { BonusPredictionEvent, BonusPredictionOption, BonusPredictionQuestion, BonusPredictionUserState } from "../types";

interface FrameProfile {
  username: string | null;
  displayName: string | null;
  pfpUrl: string | null;
}

interface UseBonusPredictionsParams {
  fid: number | string | null;
  frameProfile: FrameProfile;
}

interface UseBonusPredictionsResult {
  events: BonusPredictionEvent[];
  activeEvent: BonusPredictionEvent | null;
  responses: Record<string, BonusPredictionUserState>;
  loading: boolean;
  error: string | null;
  submittingEventId: string | null;
  refresh: () => Promise<void>;
  updateSelection: (
    eventId: string,
    questionId: string,
    selection: { selectedOptionIds?: string[] | null }
  ) => void;
  submitEvent: (eventId: string) => Promise<boolean>;
  getCompletion: (eventId: string) => { completed: number; total: number; percentage: number };
}

type ApiEvent = {
  id: string;
  type: BonusPredictionEvent["type"];
  status: BonusPredictionEvent["status"];
  title: string;
  description?: string | null;
  raceId?: string | null;
  opensAt: string;
  locksAt: string;
  publishedAt?: string | null;
  pointsMultiplier: number;
  questions: Array<{
    id: string;
    prompt: string;
    responseType: BonusPredictionQuestion["responseType"];
    maxSelections: number;
    points: number;
    order: number;
    options: Array<{
      id: string;
      label: string;
      order: number;
      driverId?: string | null;
      teamId?: string | null;
    }>;
  }>;
};

type ApiEventsResponse = { events?: ApiEvent[] };

type ApiResponsesResponse = {
  responses: Array<{
    questionId: string;
    selectedOptionIds: string[];
    pointsAwarded?: number | null;
    submittedAt: string;
    scoredAt?: string | null;
  }>;
  totalPoints: number;
  scoredAt?: string | null;
};

function mapApiEvent(event: ApiEvent): BonusPredictionEvent {
  return {
    id: event.id,
    type: event.type,
    status: event.status,
    title: event.title,
    description: event.description ?? null,
    raceId: event.raceId ?? null,
    opensAt: event.opensAt,
    locksAt: event.locksAt,
    publishedAt: event.publishedAt ?? null,
    pointsMultiplier: event.pointsMultiplier ?? 1,
    questions: event.questions
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((question) => ({
        id: question.id,
        prompt: question.prompt,
        responseType: question.responseType,
        maxSelections: question.maxSelections,
        points: question.points,
        order: question.order,
        options: question.options
          .slice()
          .sort((a, b) => a.order - b.order)
          .map(
            (option): BonusPredictionOption => ({
              id: option.id,
              label: option.label,
              order: option.order,
              driverId: option.driverId ?? null,
              teamId: option.teamId ?? null,
            })
          ),
      })),
  };
}

function buildProfile(frameProfile: FrameProfile) {
  return {
    username: frameProfile.username,
    displayName: frameProfile.displayName,
    pfpUrl: frameProfile.pfpUrl,
  };
}

function computeCompletion(
  event: BonusPredictionEvent,
  state: BonusPredictionUserState | undefined
): { completed: number; total: number; percentage: number } {
  const total = event.questions.length;
  if (total === 0) {
    return { completed: 0, total: 0, percentage: 0 };
  }

  const responses = state?.responses ?? {};
  let completed = 0;

  event.questions.forEach((question) => {
    const response = responses[question.id];
    if (!response) return;

    const selections = response.selectedOptionIds ?? [];
    if (selections.length > 0) {
      completed += 1;
    }
  });

  return {
    completed,
    total,
    percentage: Math.round((completed / total) * 100),
  };
}

export function useBonusPredictions({
  fid,
  frameProfile,
}: UseBonusPredictionsParams): UseBonusPredictionsResult {
  const [events, setEvents] = useState<BonusPredictionEvent[]>([]);
  const [responses, setResponses] = useState<Record<string, BonusPredictionUserState>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submittingEventId, setSubmittingEventId] = useState<string | null>(null);

  const fetchResponsesForEvent = useCallback(
    async (eventId: string) => {
      if (!fid) return null;
      try {
        const response = await fetch(`/api/bonus/responses?fid=${fid}&eventId=${eventId}`);
        if (!response.ok) {
          return null;
        }
        const data = (await response.json()) as ApiResponsesResponse;
        const state: BonusPredictionUserState = {
          responses: {},
          totalPoints: data?.totalPoints ?? 0,
          scoredAt: data?.scoredAt ?? null,
        };

        for (const entry of data?.responses ?? []) {
          state.responses[entry.questionId] = {
            selectedOptionIds: entry.selectedOptionIds ?? [],
            pointsAwarded: entry.pointsAwarded ?? null,
          };
        }

        return state;
      } catch (requestError) {
        console.error("Failed to fetch bonus responses:", requestError);
        return null;
      }
    },
    [fid]
  );

  const loadEvents = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/bonus/events");
      if (!response.ok) {
        throw new Error("Failed to load bonus events");
      }

      const data = (await response.json()) as ApiEventsResponse;
      const mappedEvents = (data?.events ?? []).map(mapApiEvent);
      setEvents(mappedEvents);

      if (fid && mappedEvents.length) {
        const nextResponses: Record<string, BonusPredictionUserState> = {};
        await Promise.all(
          mappedEvents.map(async (event) => {
            const state = await fetchResponsesForEvent(event.id);
            if (state) {
              nextResponses[event.id] = state;
            }
          })
        );
        setResponses((previous) => ({ ...previous, ...nextResponses }));
      }
    } catch (requestError) {
      console.error("Unable to load bonus events:", requestError);
      setError("Failed to load bonus events");
    } finally {
      setLoading(false);
    }
  }, [fetchResponsesForEvent, fid]);

  useEffect(() => {
    loadEvents().catch((err) => console.error(err));
  }, [loadEvents]);

  const updateSelection = useCallback(
    (
      eventId: string,
      questionId: string,
      selection: { selectedOptionIds?: string[] | null }
    ) => {
      setResponses((previous) => {
        const existing = previous[eventId] ?? {
          responses: {},
          totalPoints: 0,
          scoredAt: null,
        };
        return {
          ...previous,
          [eventId]: {
            ...existing,
            responses: {
              ...existing.responses,
              [questionId]: {
                selectedOptionIds: selection.selectedOptionIds ?? existing.responses[questionId]?.selectedOptionIds ?? [],
                pointsAwarded: existing.responses[questionId]?.pointsAwarded ?? null,
              },
            },
          },
        };
      });
    },
    []
  );

  const submitEvent = useCallback(
    async (eventId: string) => {
      if (!fid) {
        return false;
      }

      const event = events.find((item) => item.id === eventId);
      if (!event) return false;

      const responsesForEvent = responses[eventId]?.responses ?? {};
      if (!event.questions.length) return false;

      setSubmittingEventId(eventId);
      try {
        const payload = {
          fid,
          eventId,
          profile: buildProfile(frameProfile),
          responses: event.questions.map((question) => {
            const selection = responsesForEvent[question.id] ?? {
              selectedOptionIds: [],
            };
            return {
              questionId: question.id,
              selectedOptionIds: selection.selectedOptionIds ?? [],
            };
          }),
        };

        const response = await fetch("/api/bonus/responses", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const message = await response.text();
          throw new Error(message || "Failed to submit bonus predictions.");
        }

        // Refresh stored responses to reflect server state (e.g. trimming, scoring data).
        if (fid) {
          const refreshed = await fetchResponsesForEvent(eventId);
          if (refreshed) {
            setResponses((previous) => ({
              ...previous,
              [eventId]: refreshed,
            }));
          }
        }

        return true;
      } catch (err) {
        console.error("Failed to submit bonus event:", err);
        return false;
      } finally {
        setSubmittingEventId(null);
      }
    },
    [events, fid, frameProfile, responses, fetchResponsesForEvent]
  );

  const activeEvent = useMemo(() => events[0] ?? null, [events]);

  const getCompletion = useCallback(
    (eventId: string) => {
      const event = events.find((item) => item.id === eventId);
      if (!event) {
        return { completed: 0, total: 0, percentage: 0 };
      }
      return computeCompletion(event, responses[eventId]);
    },
    [events, responses]
  );

  return {
    events,
    activeEvent,
    responses,
    loading,
    error,
    submittingEventId,
    refresh: loadEvents,
    updateSelection,
    submitEvent,
    getCompletion,
  };
}

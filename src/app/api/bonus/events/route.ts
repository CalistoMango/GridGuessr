import { NextRequest, NextResponse } from "next/server";

import { fetchBonusEvents } from "~/lib/bonusPredictions";
import type { BonusEventBundle } from "~/lib/bonusPredictions";

function mapEventBundle(bundle: BonusEventBundle) {
  const { event, questions } = bundle;
  return {
    id: event.id,
    type: event.type,
    status: event.status,
    title: event.title,
    description: event.description,
    raceId: event.race_id,
    opensAt: event.opens_at,
    locksAt: event.locks_at,
    publishedAt: event.published_at,
    pointsMultiplier: event.points_multiplier ?? 1,
    questions: questions.map((question) => ({
      id: question.id,
      prompt: question.prompt,
      responseType: question.response_type,
      maxSelections: question.max_selections,
      points: question.points,
      order: question.order_index,
      correctOptionIds: question.correct_option_ids ?? null,
      options: question.options.map((option) => ({
        id: option.id,
        label: option.label,
        order: option.order_index,
        driverId: option.driver_id ?? null,
        teamId: option.team_id ?? null,
      })),
    })),
  };
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const scope = searchParams.get("scope") ?? "open";
    const includeLocked = scope === "all";
    const includeScored = scope === "all";
    const includeDrafts = scope === "all";

    const bundles = await fetchBonusEvents({
      onlyOpen: scope !== "all",
      includeDrafts,
      includeLocked,
      includeScored,
      includeArchived: scope === "all",
    });

    return NextResponse.json({
      events: bundles.map(mapEventBundle),
    });
  } catch (error) {
    console.error("Failed to load bonus events:", error);
    return NextResponse.json(
      { error: "Unable to load bonus events" },
      { status: 500 }
    );
  }
}

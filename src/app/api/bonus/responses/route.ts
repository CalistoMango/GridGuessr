import { NextRequest, NextResponse } from "next/server";

import {
  BonusResponseUpsertRow,
  fetchBonusEvents,
  fetchBonusResponses,
  upsertBonusResponses,
} from "~/lib/bonusPredictions";
import type { BonusEventBundle } from "~/lib/bonusPredictions";
import { ensureUserByFid, supabaseAdmin } from "~/lib/supabase";

interface ResponseEntryPayload {
  questionId: string;
  selectedOptionIds?: string[] | null;
}

function mapBundle(bundle: BonusEventBundle) {
  const { event, questions } = bundle;
  const questionMap = new Map(
    questions.map((question) => [question.id, question])
  );
  return { event, questionMap };
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const fidParam = searchParams.get("fid");
    const eventId = searchParams.get("eventId");

    if (!fidParam || !eventId) {
      return NextResponse.json(
        { error: "Missing fid or eventId" },
        { status: 400 }
      );
    }

    const fid = Number(fidParam);
    if (Number.isNaN(fid)) {
      return NextResponse.json(
        { error: "Invalid fid parameter" },
        { status: 400 }
      );
    }

    const { data: user } = await supabaseAdmin
      .from("users")
      .select("id")
      .eq("fid", fid)
      .single();

    if (!user) {
      return NextResponse.json({
        responses: [],
        totalPoints: 0,
        scoredAt: null,
      });
    }

    const responseMap = await fetchBonusResponses(user.id, [eventId]);
    const responses = responseMap[eventId] ?? [];

    const totalPoints = responses.reduce(
      (total, row) => total + (row.points_awarded ?? 0),
      0
    );

    return NextResponse.json({
      responses: responses.map((row) => ({
        questionId: row.question_id,
        selectedOptionIds: row.selected_option_ids ?? [],
        pointsAwarded: row.points_awarded ?? null,
        submittedAt: row.submitted_at,
        scoredAt: row.scored_at ?? null,
      })),
      totalPoints,
      scoredAt: responses.find((row) => row.scored_at)?.scored_at ?? null,
    });
  } catch (error) {
    console.error("Failed to load bonus responses:", error);
    return NextResponse.json(
      { error: "Unable to load bonus responses" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { fid, eventId, responses, profile } = body ?? {};

    if (!fid || !eventId || !Array.isArray(responses)) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const fidNumber = Number(fid);
    if (Number.isNaN(fidNumber)) {
      return NextResponse.json(
        { error: "Invalid fid parameter" },
        { status: 400 }
      );
    }

    const bundles = await fetchBonusEvents({
      eventIds: [eventId],
      includeDrafts: true,
      includeLocked: true,
      includeScored: true,
      includeArchived: false,
    });

    if (!bundles.length) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    const bundle = bundles[0];
    const { event, questionMap } = mapBundle(bundle);
    const now = new Date();

    const locksAt = event.locks_at ? new Date(event.locks_at) : null;
    if (
      event.status === "locked" ||
      event.status === "scored" ||
      event.status === "archived" ||
      (locksAt && locksAt <= now)
    ) {
      return NextResponse.json(
        { error: "This bonus event is locked." },
        { status: 400 }
      );
    }

    const userProfile =
      profile && typeof profile === "object"
        ? {
            username: profile.username ?? undefined,
            display_name: profile.displayName ?? undefined,
            pfp_url: profile.pfpUrl ?? undefined,
          }
        : undefined;

    const user = await ensureUserByFid(fidNumber, userProfile);
    if (!user) {
      return NextResponse.json(
        { error: "Unable to resolve user" },
        { status: 500 }
      );
    }

    const sanitizedRows = sanitizeResponsePayloads(
      responses as ResponseEntryPayload[],
      questionMap,
      eventId,
      user.id
    );

    if (!sanitizedRows.length) {
      return NextResponse.json(
        { error: "No valid responses supplied" },
        { status: 400 }
      );
    }

    await upsertBonusResponses(sanitizedRows);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to submit bonus responses:", error);
    return NextResponse.json(
      { error: "Unable to submit responses" },
      { status: 500 }
    );
  }
}

function sanitizeResponsePayloads(
  responses: ResponseEntryPayload[],
  questionMap: Map<string, BonusEventBundle["questions"][number]>,
  eventId: string,
  userId: string
) {
  const seenQuestionIds = new Set<string>();
  const sanitized: BonusResponseUpsertRow[] = [];

  const timestamp = new Date().toISOString();

  for (const response of responses) {
    if (!response?.questionId) continue;
    if (seenQuestionIds.has(response.questionId)) continue;
    const question = questionMap.get(response.questionId);
    if (!question) continue;

    seenQuestionIds.add(response.questionId);

    const optionIds = new Set((question.options ?? []).map((option) => option.id));
    const rawSelection = Array.isArray(response.selectedOptionIds)
      ? response.selectedOptionIds
      : response.selectedOptionIds
      ? [response.selectedOptionIds]
      : [];

    const filtered = rawSelection
      .map((value) => (typeof value === "string" ? value.trim() : ""))
      .filter((value) => value && optionIds.has(value));

    const selectedOptionIds = question.max_selections > 0 ? filtered.slice(0, question.max_selections) : filtered;

    sanitized.push({
      event_id: eventId,
      question_id: question.id,
      user_id: userId,
      selected_option_ids: selectedOptionIds,
      free_text_answer: null,
      submitted_at: timestamp,
    });
  }

  return sanitized;
}

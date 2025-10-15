import { NextRequest, NextResponse } from "next/server";

import { authenticateAdmin } from "~/lib/auth";
import {
  BonusAnswerPayload,
  BonusEventBundle,
  BonusOptionInput,
  BonusQuestionInput,
  FetchBonusEventsOptions,
  deleteBonusEvent,
  fetchBonusEvents,
  fetchEventParticipants,
  saveBonusEvent,
  scoreBonusEvent,
  setBonusAnswers,
  updateBonusEventStatus,
} from "~/lib/bonusPredictions";
import type { BonusPredictionEventStatus } from "~/lib/supabase";

function extractHeaderToken(request: NextRequest): string | null {
  const headerToken = request.headers.get("x-admin-token")?.trim();
  if (headerToken) return headerToken;

  const bearer = request.headers.get("authorization");
  if (bearer?.startsWith("Bearer ")) {
    const token = bearer.slice(7).trim();
    if (token) return token;
  }

  return null;
}

function isAuthorized(body: any, request: NextRequest): boolean {
  const token = extractHeaderToken(request);
  const authResult = authenticateAdmin({
    fid: body?.fid,
    adminFid: body?.adminFid,
    password: body?.password,
    adminPassword: body?.adminPassword,
    token,
  });

  return authResult.authenticated;
}

function unauthorizedResponse() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
}

function mapBundle(bundle: BonusEventBundle) {
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
    createdAt: event.created_at,
    updatedAt: event.updated_at,
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
        createdAt: option.created_at,
        updatedAt: option.updated_at,
      })),
      createdAt: question.created_at,
      updatedAt: question.updated_at,
    })),
  };
}

function parseQuestions(input: any[]): BonusQuestionInput[] {
  if (!Array.isArray(input)) return [];

  return input.map<BonusQuestionInput>((question, index) => ({
    id: typeof question?.id === "string" ? question.id : undefined,
    prompt: String(question?.prompt ?? "").trim(),
    responseType: question?.responseType ?? question?.response_type ?? "choice_custom",
    maxSelections: Number(question?.maxSelections ?? question?.max_selections ?? 1),
    points: Number(question?.points ?? 0),
    order:
      typeof question?.order === "number"
        ? question.order
        : typeof question?.order_index === "number"
        ? question.order_index
        : index,
    options: parseOptions(question?.options ?? []),
  }));
}

function parseOptions(options: any[]): BonusOptionInput[] {
  if (!Array.isArray(options)) return [];

  return options.map<BonusOptionInput>((option, index) => ({
    id: typeof option?.id === "string" ? option.id : undefined,
    label: String(option?.label ?? "").trim(),
    order:
      typeof option?.order === "number"
        ? option.order
        : typeof option?.order_index === "number"
        ? option.order_index
        : index,
    driverId:
      option?.driverId ?? option?.driver_id ? String(option.driverId ?? option.driver_id) : undefined,
    teamId: option?.teamId ?? option?.team_id ? String(option.teamId ?? option.team_id) : undefined,
  }));
}

function parseAnswers(input: any[]): BonusAnswerPayload[] {
  if (!Array.isArray(input)) return [];

  return input
    .filter((answer) => typeof answer?.questionId === "string")
    .map<BonusAnswerPayload>((answer) => ({
      questionId: answer.questionId,
      correctOptionIds: Array.isArray(answer.correctOptionIds)
        ? answer.correctOptionIds.filter((id: unknown) => typeof id === "string")
        : undefined,
    }));
}

async function loadEventsForAdmin(options: FetchBonusEventsOptions = {}) {
  const bundles = await fetchBonusEvents({
    includeDrafts: true,
    includeArchived: true,
    includeLocked: true,
    includeScored: true,
    ...options,
  });
  const mapped = bundles.map(mapBundle);

  const eventsWithCounts = await Promise.all(
    mapped.map(async (event) => {
      try {
        const participants = await fetchEventParticipants(event.id);
        return { ...event, participantCount: participants.length };
      } catch (error) {
        console.error(`Failed to load participants for bonus event ${event.id}:`, error);
        return { ...event, participantCount: 0 };
      }
    })
  );

  return eventsWithCounts;
}

export async function GET() {
  try {
    const events = await loadEventsForAdmin();
    return NextResponse.json({ events });
  } catch (error) {
    console.error("Failed to load bonus events:", error);
    return NextResponse.json({ error: "Failed to load events" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  if (!isAuthorized(body, request)) {
    return unauthorizedResponse();
  }

  try {
    const bundle = await saveBonusEvent({
      type: body.type,
      title: body.title,
      description: body.description ?? null,
      raceId: body.raceId ?? null,
      opensAt: body.opensAt,
      locksAt: body.locksAt,
      status: body.status,
      pointsMultiplier: body.pointsMultiplier ?? 1,
      questions: parseQuestions(body.questions ?? []),
    });

    return NextResponse.json({
      success: true,
      event: mapBundle(bundle),
    });
  } catch (error) {
    console.error("Failed to create bonus event:", error);
    return NextResponse.json(
      { error: (error as Error)?.message ?? "Failed to create bonus event" },
      { status: 400 }
    );
  }
}

export async function PUT(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  if (!isAuthorized(body, request)) {
    return unauthorizedResponse();
  }

  if (!body.eventId) {
    return NextResponse.json({ error: "Missing eventId" }, { status: 400 });
  }

  try {
    const bundle = await saveBonusEvent({
      eventId: body.eventId,
      type: body.type,
      title: body.title,
      description: body.description ?? null,
      raceId: body.raceId ?? null,
      opensAt: body.opensAt,
      locksAt: body.locksAt,
      status: body.status,
      pointsMultiplier: body.pointsMultiplier ?? 1,
      questions: parseQuestions(body.questions ?? []),
    });

    return NextResponse.json({
      success: true,
      event: mapBundle(bundle),
    });
  } catch (error) {
    console.error("Failed to update bonus event:", error);
    return NextResponse.json(
      { error: (error as Error)?.message ?? "Failed to update bonus event" },
      { status: 400 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  if (!isAuthorized(body, request)) {
    return unauthorizedResponse();
  }

  const { eventId, action } = body ?? {};
  if (!eventId || typeof action !== "string") {
    return NextResponse.json({ error: "Missing eventId or action" }, { status: 400 });
  }

  try {
    switch (action) {
      case "status": {
        const nextStatus = body.status as BonusPredictionEventStatus | undefined;
        if (!nextStatus) {
          return NextResponse.json({ error: "Missing status value" }, { status: 400 });
        }
        await updateBonusEventStatus(eventId, nextStatus);
        const [bundle] = await loadEventsForAdmin({ eventIds: [eventId] });
        if (!bundle) {
          return NextResponse.json({ error: "Event not found after update" }, { status: 404 });
        }
        return NextResponse.json({
          success: true,
          event: bundle,
        });
      }
      case "answers": {
        const answers = parseAnswers(body.answers ?? []);
        await setBonusAnswers(eventId, answers);
        return NextResponse.json({ success: true });
      }
      case "score": {
        const result = await scoreBonusEvent(eventId);
        const [bundle] = await loadEventsForAdmin({ eventIds: [eventId] });
        return NextResponse.json({ success: true, result, event: bundle ?? null });
      }
      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (error) {
    console.error("Failed to update bonus event:", error);
    return NextResponse.json(
      { error: (error as Error)?.message ?? "Failed to update bonus event" },
      { status: 400 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  if (!isAuthorized(body, request)) {
    return unauthorizedResponse();
  }

  const { eventId } = body ?? {};
  if (!eventId) {
    return NextResponse.json({ error: "Missing eventId" }, { status: 400 });
  }

  try {
    await deleteBonusEvent(eventId);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete bonus event:", error);
    return NextResponse.json(
      { error: (error as Error)?.message ?? "Failed to delete bonus event" },
      { status: 400 }
    );
  }
}

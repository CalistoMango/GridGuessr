import { supabaseAdmin } from "./supabase";
import type {
  BonusPredictionEvent,
  BonusPredictionEventStatus,
  BonusPredictionOption,
  BonusPredictionQuestion,
  BonusPredictionResponse,
} from "./supabase";

type DbEventRow = BonusPredictionEvent;
type DbQuestionRow = BonusPredictionQuestion;
type DbOptionRow = BonusPredictionOption;
type DbResponseRow = BonusPredictionResponse;

export interface BonusQuestionInput {
  id?: string;
  prompt: string;
  responseType: DbQuestionRow["response_type"];
  maxSelections: number;
  points: number;
  order: number;
  options: BonusOptionInput[];
}

export interface BonusOptionInput {
  id?: string;
  label: string;
  order: number;
  driverId?: string | null;
  teamId?: string | null;
}

export interface SaveBonusEventPayload {
  eventId?: string;
  type: DbEventRow["type"];
  title: string;
  description?: string | null;
  raceId?: string | null;
  opensAt: string;
  locksAt: string;
  status?: BonusPredictionEventStatus;
  pointsMultiplier?: number;
  questions: BonusQuestionInput[];
}

export interface BonusEventBundle {
  event: DbEventRow;
  questions: Array<DbQuestionRow & { options: DbOptionRow[] }>;
}

export interface FetchBonusEventsOptions {
  eventIds?: string[];
  includeDrafts?: boolean;
  includeArchived?: boolean;
  includeLocked?: boolean;
  includeScored?: boolean;
  onlyOpen?: boolean;
  now?: Date;
}

export interface BonusResponseEntry extends DbResponseRow {}

export interface BonusResponseUpsertRow {
  event_id: string;
  question_id: string;
  user_id: string;
  selected_option_ids: string[];
  free_text_answer: string | null;
  submitted_at: string;
  points_awarded?: number | null;
  scored_at?: string | null;
}

function deriveEventStatus(row: DbEventRow, now: Date): BonusPredictionEventStatus {
  const status = row.status ?? "draft";
  if (status === "archived" || status === "scored") {
    return status;
  }

  if (status === "locked" || status === "draft") {
    return status;
  }

  const opensAt = row.opens_at ? new Date(row.opens_at) : null;
  const locksAt = row.locks_at ? new Date(row.locks_at) : null;

  if (status === "open") {
    if (locksAt && locksAt <= now) {
      return "locked";
    }
    return "open";
  }

  if (locksAt && locksAt <= now) {
    return "locked";
  }

  if (opensAt && opensAt <= now) {
    return "open";
  }

  return "scheduled";
}

async function ensureEventStatuses(events: DbEventRow[], now: Date) {
  if (!events.length) return;
  const updates: Array<{ id: string; status: BonusPredictionEventStatus }> = [];

  events.forEach((event) => {
    const derived = deriveEventStatus(event, now);
    if (derived !== event.status) {
      updates.push({ id: event.id, status: derived });
      event.status = derived;
    }
  });

  if (!updates.length) return;

  const timestamp = new Date().toISOString();
  await supabaseAdmin
    .from("bonus_prediction_events")
    .upsert(
      updates.map((update) => ({
        id: update.id,
        status: update.status,
        updated_at: timestamp,
      })),
      { onConflict: "id" }
    );
}

export async function fetchBonusEvents(options: FetchBonusEventsOptions = {}): Promise<BonusEventBundle[]> {
  const now = options.now ?? new Date();
  let query = supabaseAdmin.from("bonus_prediction_events").select("*");

  if (options.eventIds?.length) {
    query = query.in("id", options.eventIds);
  }

  if (!options.includeDrafts) {
    query = query.neq("status", "draft");
  }

  if (!options.includeArchived) {
    query = query.neq("status", "archived");
  }

  if (!options.includeScored) {
    query = query.neq("status", "scored");
  }

  if (!options.includeLocked) {
    query = query.neq("status", "locked");
  }

  if (options.onlyOpen) {
    const nowIso = now.toISOString();
    query = query.lte("opens_at", nowIso).gt("locks_at", nowIso);
  }

  query = query.order("opens_at", { ascending: true });

  const { data: eventRows, error } = await query;
  if (error) {
    throw new Error(`Failed to fetch bonus events: ${error.message}`);
  }

  const events = eventRows ?? [];
  await ensureEventStatuses(events, now);
  if (!events.length) {
    return [];
  }

  const eventIds = events.map((event) => event.id);

  const { data: questionRows, error: questionError } = await supabaseAdmin
    .from("bonus_prediction_questions")
    .select("*")
    .in("event_id", eventIds)
    .order("order_index", { ascending: true });

  if (questionError) {
    throw new Error(`Failed to fetch bonus questions: ${questionError.message}`);
  }

  const questions = (questionRows as DbQuestionRow[] | null | undefined) ?? [];
  if (!questions.length) {
    return events.map((event) => ({
      event,
      questions: [],
    }));
  }

  const questionIds = questions.map((question) => question.id);
  const { data: optionRows, error: optionError } = await supabaseAdmin
    .from("bonus_prediction_options")
    .select("*")
    .in("question_id", questionIds)
    .order("order_index", { ascending: true });

  if (optionError) {
    throw new Error(`Failed to fetch bonus options: ${optionError.message}`);
  }

  const optionList = (optionRows as DbOptionRow[] | null | undefined) ?? [];
  const optionGroups = optionList.reduce<Record<string, DbOptionRow[]>>((acc, option) => {
    acc[option.question_id] = acc[option.question_id] || [];
    acc[option.question_id].push(option);
    return acc;
  }, {});

  const questionGroups = questions.reduce<Record<string, Array<DbQuestionRow & { options: DbOptionRow[] }>>>(
    (acc, question) => {
      const group = acc[question.event_id] || [];
      group.push({
        ...question,
        options: optionGroups[question.id] ?? [],
      });
      acc[question.event_id] = group;
      return acc;
    },
    {}
  );

  return events.map((event) => ({
    event,
    questions: questionGroups[event.id] ?? [],
  }));
}

export async function fetchBonusResponses(
  userId: string,
  eventIds: string[]
): Promise<Record<string, BonusResponseEntry[]>> {
  if (!eventIds.length) return {};

  const { data, error } = await supabaseAdmin
    .from("bonus_prediction_responses")
    .select("*")
    .eq("user_id", userId)
    .in("event_id", eventIds);

  if (error) {
    throw new Error(`Failed to fetch bonus responses: ${error.message}`);
  }

  const rows = (data as DbResponseRow[] | null | undefined) ?? [];
  return rows.reduce<Record<string, BonusResponseEntry[]>>((acc, row) => {
    const list = acc[row.event_id] || [];
    list.push(row);
    acc[row.event_id] = list;
    return acc;
  }, {});
}

function evaluateResponseScore(question: DbQuestionRow, response: DbResponseRow): number {
  if (!question || !question.points) return 0;

  const correctIds = (question.correct_option_ids ?? []).filter(
    (id): id is string => typeof id === "string" && id.length > 0
  );
  if (!correctIds.length) {
    return 0;
  }

  const selection = (response.selected_option_ids ?? []).filter(
    (id): id is string => typeof id === "string" && id.length > 0
  );

  if (question.max_selections && question.max_selections > 1) {
    if (selection.length !== correctIds.length) {
      return 0;
    }
    const selectedSet = new Set(selection);
    const correctSet = new Set(correctIds);
    if (selection.every((id) => correctSet.has(id)) && correctIds.every((id) => selectedSet.has(id))) {
      return question.points;
    }
    return 0;
  }

  if (!selection.length) return 0;
  return correctIds.includes(selection[0]) ? question.points : 0;
}

export interface ScoreBonusEventResult {
  processedResponses: number;
  updatedUsers: number;
  totalAwarded: number;
}

export async function scoreBonusEvent(eventId: string): Promise<ScoreBonusEventResult> {
  const timestamp = new Date().toISOString();
  const { data: event, error: eventError } = await supabaseAdmin
    .from("bonus_prediction_events")
    .select("*")
    .eq("id", eventId)
    .single();

  if (eventError || !event) {
    throw new Error(eventError?.message ?? "Bonus event not found");
  }

  const multiplier = event.points_multiplier ?? 1;
  const responses = await fetchResponsesForEvent(eventId);
  if (!responses.length) {
    await supabaseAdmin
      .from("bonus_prediction_events")
      .update({ status: "scored", published_at: timestamp, updated_at: timestamp })
      .eq("id", eventId);
    return { processedResponses: 0, updatedUsers: 0, totalAwarded: 0 };
  }

  const responseUpdates: Array<{ id: string; points_awarded: number }> = [];
  const userDeltas = new Map<string, number>();
  let totalAwarded = 0;

  responses.forEach((row) => {
    const question = row.question as DbQuestionRow;
    const baseScore = evaluateResponseScore(question, row);
    const weightedScore = Math.round(baseScore * multiplier);
    const previousScore = row.points_awarded ?? 0;
    const delta = weightedScore - previousScore;

    if (delta !== 0) {
      userDeltas.set(row.user_id, (userDeltas.get(row.user_id) ?? 0) + delta);
    }

    totalAwarded += weightedScore;
    responseUpdates.push({ id: row.id, points_awarded: weightedScore });
  });

  if (responseUpdates.length) {
    await Promise.all(
      responseUpdates.map(({ id, points_awarded }) =>
        supabaseAdmin
          .from("bonus_prediction_responses")
          .update({ points_awarded, scored_at: timestamp, updated_at: timestamp })
          .eq("id", id)
      )
    );
  }

  const userIds = Array.from(userDeltas.keys()).filter((id) => typeof id === "string" && id.length > 0);
  let updatedUsers = 0;

  if (userIds.length) {
    const { data: existingUsers, error: usersError } = await supabaseAdmin
      .from("users")
      .select("id, total_points, bonus_points")
      .in("id", userIds);

    if (usersError) {
      throw new Error(usersError.message ?? "Failed to load users for bonus scoring");
    }

    await Promise.all(
      (existingUsers ?? []).map(async (user) => {
        const delta = userDeltas.get(user.id) ?? 0;
        if (!delta) return;
        updatedUsers += 1;
        await supabaseAdmin
          .from("users")
          .update({
            total_points: (user.total_points ?? 0) + delta,
            bonus_points: (user.bonus_points ?? 0) + delta,
            updated_at: timestamp,
          })
          .eq("id", user.id);
      })
    );
  }

  await supabaseAdmin
    .from("bonus_prediction_events")
    .update({ status: "scored", published_at: timestamp, updated_at: timestamp })
    .eq("id", eventId);

  return {
    processedResponses: responses.length,
    updatedUsers,
    totalAwarded,
  };
}

function assertValidQuestions(questions: BonusQuestionInput[]) {
  if (!Array.isArray(questions) || !questions.length) {
    throw new Error("At least one question is required for a bonus event.");
  }

  questions.forEach((question, index) => {
    if (!question.prompt?.trim()) {
      throw new Error(`Question #${index + 1} is missing a prompt.`);
    }
    if (!question.responseType) {
      throw new Error(`Question #${index + 1} is missing a response type.`);
    }
    if (question.points <= 0) {
      throw new Error(`Question #${index + 1} must be worth at least 1 point.`);
    }
    if (!question.options?.length) {
      throw new Error(`Question #${index + 1} requires at least one option.`);
    }
  });
}

export async function saveBonusEvent(payload: SaveBonusEventPayload): Promise<BonusEventBundle> {
  assertValidQuestions(payload.questions);

  const nowIso = new Date().toISOString();

  if (payload.eventId) {
    return updateExistingEvent(payload.eventId, payload, nowIso);
  }

  const status = payload.status ?? "draft";
  return createNewBonusEvent(payload, nowIso, status);
}

async function createNewBonusEvent(
  payload: SaveBonusEventPayload,
  timestamp: string,
  status: BonusPredictionEventStatus
): Promise<BonusEventBundle> {
  const { data: eventRow, error: insertError } = await supabaseAdmin
    .from("bonus_prediction_events")
    .insert({
      type: payload.type,
      status,
      title: payload.title,
      description: payload.description ?? null,
      race_id: payload.raceId ?? null,
      opens_at: payload.opensAt,
      locks_at: payload.locksAt,
      points_multiplier: payload.pointsMultiplier ?? 1,
      created_at: timestamp,
      updated_at: timestamp,
    })
    .select()
    .single();

  if (insertError || !eventRow) {
    throw new Error(insertError?.message ?? "Unable to create bonus event");
  }

  const questions = await upsertQuestionsForEvent(eventRow.id, payload.questions);

  return {
    event: eventRow,
    questions,
  };
}

async function updateExistingEvent(
  eventId: string,
  payload: SaveBonusEventPayload,
  timestamp: string
): Promise<BonusEventBundle> {
  const { data: existingEvent, error: loadError } = await supabaseAdmin
    .from("bonus_prediction_events")
    .select("*")
    .eq("id", eventId)
    .single();

  if (loadError || !existingEvent) {
    throw new Error(loadError?.message ?? "Bonus event not found");
  }

  if (existingEvent.status && !["draft", "scheduled"].includes(existingEvent.status)) {
    throw new Error("Only draft or scheduled events can be edited.");
  }

  const status = payload.status ?? existingEvent.status ?? "draft";

  const { error: updateError } = await supabaseAdmin
    .from("bonus_prediction_events")
    .update({
      type: payload.type,
      status,
      title: payload.title,
      description: payload.description ?? null,
      race_id: payload.raceId ?? null,
      opens_at: payload.opensAt,
      locks_at: payload.locksAt,
      points_multiplier: payload.pointsMultiplier ?? 1,
      updated_at: timestamp,
    })
    .eq("id", eventId);

  if (updateError) {
    throw new Error(updateError.message ?? "Failed to update bonus event");
  }

  // Drop existing questions/options to keep logic simple for now.
  await supabaseAdmin.from("bonus_prediction_questions").delete().eq("event_id", eventId);

  const questions = await upsertQuestionsForEvent(eventId, payload.questions);

  return {
    event: {
      ...existingEvent,
      type: payload.type,
      status,
      title: payload.title,
      description: payload.description ?? null,
      race_id: payload.raceId ?? null,
      opens_at: payload.opensAt,
      locks_at: payload.locksAt,
      points_multiplier: payload.pointsMultiplier ?? 1,
      updated_at: timestamp,
    },
    questions,
  };
}

async function upsertQuestionsForEvent(
  eventId: string,
  questions: BonusQuestionInput[]
): Promise<Array<DbQuestionRow & { options: DbOptionRow[] }>> {
  const results: Array<DbQuestionRow & { options: DbOptionRow[] }> = [];

  for (const question of questions) {
    const { data: questionRow, error: questionError } = await supabaseAdmin
      .from("bonus_prediction_questions")
      .insert({
        event_id: eventId,
        prompt: question.prompt,
        response_type: question.responseType,
        max_selections: question.maxSelections,
        points: question.points,
        order_index: question.order,
      })
      .select()
      .single();

    if (questionError || !questionRow) {
      throw new Error(questionError?.message ?? "Failed to create bonus question");
    }

    let options: DbOptionRow[] = [];
    if (question.options.length) {
      const normalizedOptions = question.options.map((option) => ({
        question_id: questionRow.id,
        label: option.label,
        driver_id: option.driverId ?? null,
        team_id: option.teamId ?? null,
        order_index: option.order,
      }));

      const { data: optionRows, error: optionsError } = await supabaseAdmin
        .from("bonus_prediction_options")
        .insert(normalizedOptions)
        .select();

      if (optionsError) {
        throw new Error(optionsError.message ?? "Failed to create bonus options");
      }

      options = optionRows ?? [];
    }

    results.push({
      ...questionRow,
      options,
    });
  }

  return results;
}

export async function deleteBonusEvent(eventId: string): Promise<void> {
  const { error } = await supabaseAdmin.from("bonus_prediction_events").delete().eq("id", eventId);
  if (error) {
    throw new Error(error.message ?? "Failed to delete bonus event");
  }
}

export async function updateBonusEventStatus(
  eventId: string,
  nextStatus: BonusPredictionEventStatus
): Promise<DbEventRow> {
  const { data, error } = await supabaseAdmin
    .from("bonus_prediction_events")
    .update({
      status: nextStatus,
      updated_at: new Date().toISOString(),
    })
    .eq("id", eventId)
    .select()
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to update bonus event status");
  }

  return data;
}

export interface BonusAnswerPayload {
  questionId: string;
  correctOptionIds?: string[] | null;
}

export async function setBonusAnswers(eventId: string, answers: BonusAnswerPayload[]): Promise<void> {
  if (!answers.length) return;

  const timestamp = new Date().toISOString();

  for (const answer of answers) {
    const { error } = await supabaseAdmin
      .from("bonus_prediction_questions")
      .update({
        correct_option_ids: answer.correctOptionIds ?? null,
        correct_free_text: null,
        updated_at: timestamp,
      })
      .eq("id", answer.questionId)
      .eq("event_id", eventId);

    if (error) {
      throw new Error(error.message ?? "Failed to update bonus answer key");
    }
  }
}

export async function fetchEventParticipants(eventId: string): Promise<string[]> {
  const { data, error } = await supabaseAdmin
    .from("bonus_prediction_responses")
    .select("user_id")
    .eq("event_id", eventId);

  if (error) {
    throw new Error(error.message ?? "Failed to load bonus participants");
  }

  const rows = data ?? [];
  const unique = new Set<string>();
  rows.forEach((row) => {
    if (row.user_id) unique.add(row.user_id);
  });
  return Array.from(unique);
}

export async function fetchResponsesForEvent(
  eventId: string
): Promise<Array<DbResponseRow & { question: DbQuestionRow }>> {
  const { data, error } = await supabaseAdmin
    .from("bonus_prediction_responses")
    .select("*, question:bonus_prediction_questions(*)")
    .eq("event_id", eventId);

  if (error) {
    throw new Error(error.message ?? "Failed to load bonus responses for scoring");
  }

  return (data as Array<DbResponseRow & { question: DbQuestionRow }>) ?? [];
}

export async function upsertBonusResponses(rows: BonusResponseUpsertRow[]): Promise<void> {
  if (!rows.length) return;

  const payload = rows.map((row) => ({
    event_id: row.event_id,
    question_id: row.question_id,
    user_id: row.user_id,
    selected_option_ids: row.selected_option_ids ?? [],
    free_text_answer: row.free_text_answer ?? null,
    submitted_at: row.submitted_at,
    points_awarded: typeof row.points_awarded === "number" ? row.points_awarded : 0,
    scored_at: row.scored_at ?? null,
    updated_at: new Date().toISOString(),
  }));

  const { error } = await supabaseAdmin
    .from("bonus_prediction_responses")
    .upsert(payload, { onConflict: "event_id,question_id,user_id" });

  if (error) {
    throw new Error(error.message ?? "Failed to save bonus responses");
  }
}

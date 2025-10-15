import { NextRequest, NextResponse } from "next/server";

import { fetchBonusEvents, fetchBonusResponses } from "~/lib/bonusPredictions";
import { supabaseAdmin } from "~/lib/supabase";

type RaceCategoryStatus = "pending" | "correct" | "incorrect" | "missing";

interface RaceCategoryPayload {
  key: string;
  label: string;
  actual: string | null;
  predicted: string | null;
  pointsAvailable: number;
  pointsEarned: number;
  status: RaceCategoryStatus;
}

interface RaceResultPayload {
  raceId: string;
  name: string;
  circuit: string | null;
  round: number | null;
  raceDate: string | null;
  wildcardQuestion: string | null;
  totalPointsEarned: number;
  categories: RaceCategoryPayload[];
}

type BonusQuestionStatus = "pending" | "correct" | "incorrect" | "missing";

interface BonusQuestionPayload {
  questionId: string;
  prompt: string;
  pointsAvailable: number;
  pointsEarned: number;
  correctOptions: string[];
  userSelections: string[];
  status: BonusQuestionStatus;
}

interface BonusEventPayload {
  eventId: string;
  title: string;
  type: string;
  locksAt: string | null;
  publishedAt: string | null;
  pointsMultiplier: number;
  relatedRaceId: string | null;
  relatedRaceName: string | null;
  totalPointsAvailable: number;
  totalPointsEarned: number;
  questions: BonusQuestionPayload[];
}

interface SeasonResultsPayload {
  season: number;
  races: RaceResultPayload[];
  bonusEvents: BonusEventPayload[];
}

interface ResultsResponsePayload {
  seasons: SeasonResultsPayload[];
}

function coerceSeason(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }
  return new Date().getUTCFullYear();
}

function buildDriverLookup(drivers: any[] | null | undefined): Map<string, { name: string; number: string | null }> {
  const map = new Map<string, { name: string; number: string | null }>();
  (drivers ?? []).forEach((driver) => {
    if (!driver?.id) return;
    map.set(String(driver.id), {
      name: driver.name ?? "",
      number: driver.number ?? null,
    });
  });
  return map;
}

function buildTeamLookup(teams: any[] | null | undefined): Map<string, string> {
  const map = new Map<string, string>();
  (teams ?? []).forEach((team) => {
    if (!team?.id) return;
    map.set(String(team.id), team.name ?? "");
  });
  return map;
}

function resolveDriverName(driverId: string | null | undefined, driverMap: Map<string, { name: string; number: string | null }>): string | null {
  if (!driverId) return null;
  const record = driverMap.get(String(driverId));
  if (!record) return null;
  const prefix = record.number ? `#${record.number} ` : "";
  return `${prefix}${record.name}`.trim();
}

function resolveTeamName(teamId: string | null | undefined, teamMap: Map<string, string>): string | null {
  if (!teamId) return null;
  const name = teamMap.get(String(teamId));
  return name ?? null;
}

function booleanLabel(value: boolean | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  return value ? "Yes" : "No";
}

function normalizeSeasonFromEvent(event: any, relatedRace: any | null): number {
  if (relatedRace?.season) {
    return coerceSeason(relatedRace.season);
  }
  const referenceTimestamp = event?.locks_at ?? event?.opens_at ?? event?.published_at ?? null;
  if (referenceTimestamp) {
    const date = new Date(referenceTimestamp);
    if (!Number.isNaN(date.getTime())) {
      return date.getUTCFullYear();
    }
  }
  return new Date().getUTCFullYear();
}

export async function GET(request: NextRequest) {
  try {
    const fidParam = request.nextUrl.searchParams.get("fid");
    if (!fidParam) {
      return NextResponse.json({ error: "Missing fid parameter" }, { status: 400 });
    }

    const fid = Number(fidParam);
    if (Number.isNaN(fid)) {
      return NextResponse.json({ error: "Invalid fid parameter" }, { status: 400 });
    }

    const { data: user } = await supabaseAdmin
      .from("users")
      .select("id")
      .eq("fid", fid)
      .maybeSingle();

    if (!user?.id) {
      const emptyPayload: ResultsResponsePayload = { seasons: [] };
      return NextResponse.json(emptyPayload);
    }

    const [{ data: driversResult }, { data: teamsResult }] = await Promise.all([
      supabaseAdmin.from("drivers").select("id, name, number"),
      supabaseAdmin.from("teams").select("id, name"),
    ]);

    const driverMap = buildDriverLookup(driversResult);
    const teamMap = buildTeamLookup(teamsResult);

    const { data: raceResults, error: raceResultsError } = await supabaseAdmin
      .from("race_results")
      .select("*");

    if (raceResultsError) {
      throw raceResultsError;
    }

    const raceIds = (raceResults ?? []).map((row) => row.race_id).filter((id): id is string => typeof id === "string" && id.length > 0);

    const { data: raceRows, error: racesError } = raceIds.length
      ? await supabaseAdmin
          .from("races")
          .select("id, name, circuit, race_date, season, round, wildcard_question")
          .in("id", raceIds)
      : { data: [], error: null };

    if (racesError) {
      throw racesError;
    }

    const racesById = new Map<string, any>();
    (raceRows ?? []).forEach((race) => {
      if (race?.id) {
        racesById.set(String(race.id), race);
      }
    });

    const { data: predictionsRows, error: predictionsError } = raceIds.length
      ? await supabaseAdmin
          .from("predictions")
          .select("*")
          .eq("user_id", user.id)
          .in("race_id", raceIds)
      : { data: [], error: null };

    if (predictionsError) {
      throw predictionsError;
    }

    const predictionsByRace = new Map<string, any>();
    (predictionsRows ?? []).forEach((row) => {
      if (row?.race_id) {
        predictionsByRace.set(String(row.race_id), row);
      }
    });

    const raceResultEntries: Array<{ race: any; results: any; prediction: any | null }> = [];
    (raceResults ?? []).forEach((resultsRow) => {
      const race = racesById.get(String(resultsRow.race_id));
      if (!race) return;
      raceResultEntries.push({
        race,
        results: resultsRow,
        prediction: predictionsByRace.get(String(resultsRow.race_id)) ?? null,
      });
    });

    raceResultEntries.sort((a, b) => {
      const roundA = typeof a.race?.round === "number" ? a.race.round : Number.POSITIVE_INFINITY;
      const roundB = typeof b.race?.round === "number" ? b.race.round : Number.POSITIVE_INFINITY;
      if (roundA !== roundB) return roundA - roundB;
      const dateA = a.race?.race_date ? new Date(a.race.race_date).getTime() : 0;
      const dateB = b.race?.race_date ? new Date(b.race.race_date).getTime() : 0;
      return dateA - dateB;
    });

    const scoredBonusBundles = await fetchBonusEvents({
      includeLocked: true,
      includeScored: true,
      includeArchived: true,
    });

    const relevantBonusBundles = scoredBonusBundles.filter((bundle) => {
      const status = bundle.event?.status;
      return status === "scored" || status === "archived";
    });

    const bonusEventIds = relevantBonusBundles.map((bundle) => bundle.event.id).filter((id): id is string => typeof id === "string" && id.length > 0);
    const bonusResponsesMap = bonusEventIds.length
      ? await fetchBonusResponses(user.id, bonusEventIds)
      : {};

    const seasonBuckets = new Map<number, { races: RaceResultPayload[]; bonusEvents: BonusEventPayload[] }>();

    const ensureSeasonBucket = (season: number) => {
      if (!seasonBuckets.has(season)) {
        seasonBuckets.set(season, { races: [], bonusEvents: [] });
      }
      return seasonBuckets.get(season)!;
    };

    raceResultEntries.forEach(({ race, results, prediction }) => {
      const season = coerceSeason(race?.season);

      const categories: RaceCategoryPayload[] = [];

      const pushCategory = (
        categoryKey: RaceCategoryPayload["key"],
        label: string,
        actual: string | null,
        predicted: string | null,
        pointsAvailable: number,
        isActualAvailable: boolean,
        userHasSelection: boolean,
        isCorrect: boolean | null
      ) => {
        let status: RaceCategoryStatus = "pending";
        if (!isActualAvailable) {
          status = "pending";
        } else if (!userHasSelection) {
          status = "missing";
        } else if (isCorrect) {
          status = "correct";
        } else {
          status = "incorrect";
        }

        categories.push({
          key: categoryKey,
          label,
          actual,
          predicted,
          pointsAvailable,
          pointsEarned: status === "correct" ? pointsAvailable : 0,
          status,
        });
      };

      const wildcardLabel = race?.wildcard_question ?? "Wildcard";

      const actualPole = resolveDriverName(results?.pole_driver_id, driverMap);
      const predictedPole = resolveDriverName(prediction?.pole_driver_id, driverMap);
      pushCategory(
        "pole",
        "Pole Position",
        actualPole,
        predictedPole,
        15,
        Boolean(results?.pole_driver_id),
        Boolean(prediction?.pole_driver_id),
        results?.pole_driver_id && prediction?.pole_driver_id
          ? String(results.pole_driver_id) === String(prediction.pole_driver_id)
          : null
      );

      const actualWinner = resolveDriverName(results?.winner_driver_id, driverMap);
      const predictedWinner = resolveDriverName(prediction?.winner_driver_id, driverMap);
      pushCategory(
        "winner",
        "Winner",
        actualWinner,
        predictedWinner,
        15,
        Boolean(results?.winner_driver_id),
        Boolean(prediction?.winner_driver_id),
        results?.winner_driver_id && prediction?.winner_driver_id
          ? String(results.winner_driver_id) === String(prediction.winner_driver_id)
          : null
      );

      const actualSecond = resolveDriverName(results?.second_driver_id, driverMap);
      const predictedSecond = resolveDriverName(prediction?.second_driver_id, driverMap);
      pushCategory(
        "second",
        "Second Place",
        actualSecond,
        predictedSecond,
        10,
        Boolean(results?.second_driver_id),
        Boolean(prediction?.second_driver_id),
        results?.second_driver_id && prediction?.second_driver_id
          ? String(results.second_driver_id) === String(prediction.second_driver_id)
          : null
      );

      const actualThird = resolveDriverName(results?.third_driver_id, driverMap);
      const predictedThird = resolveDriverName(prediction?.third_driver_id, driverMap);
      pushCategory(
        "third",
        "Third Place",
        actualThird,
        predictedThird,
        10,
        Boolean(results?.third_driver_id),
        Boolean(prediction?.third_driver_id),
        results?.third_driver_id && prediction?.third_driver_id
          ? String(results.third_driver_id) === String(prediction.third_driver_id)
          : null
      );

      const actualFastestLap = resolveDriverName(results?.fastest_lap_driver_id, driverMap);
      const predictedFastestLap = resolveDriverName(prediction?.fastest_lap_driver_id, driverMap);
      pushCategory(
        "fastestLap",
        "Fastest Lap",
        actualFastestLap,
        predictedFastestLap,
        10,
        Boolean(results?.fastest_lap_driver_id),
        Boolean(prediction?.fastest_lap_driver_id),
        results?.fastest_lap_driver_id && prediction?.fastest_lap_driver_id
          ? String(results.fastest_lap_driver_id) === String(prediction.fastest_lap_driver_id)
          : null
      );

      const actualFastestPit = resolveTeamName(results?.fastest_pit_team_id, teamMap);
      const predictedFastestPit = resolveTeamName(prediction?.fastest_pit_team_id, teamMap);
      pushCategory(
        "fastestPit",
        "Fastest Pit Stop Team",
        actualFastestPit,
        predictedFastestPit,
        10,
        Boolean(results?.fastest_pit_team_id),
        Boolean(prediction?.fastest_pit_team_id),
        results?.fastest_pit_team_id && prediction?.fastest_pit_team_id
          ? String(results.fastest_pit_team_id) === String(prediction.fastest_pit_team_id)
          : null
      );

      const actualNoDnf = Boolean(results?.no_dnf);
      const actualFirstDnfDriver = resolveDriverName(results?.first_dnf_driver_id, driverMap);

      let firstDnfActualText: string | null = null;
      if (actualNoDnf) {
        firstDnfActualText = "No DNFs";
      } else {
        firstDnfActualText = actualFirstDnfDriver;
      }

      let firstDnfPredictedText: string | null = null;
      let firstDnfUserHasSelection = false;
      let firstDnfIsCorrect: boolean | null = null;

      if (prediction) {
        if (prediction.no_dnf) {
          firstDnfPredictedText = "No DNFs";
          firstDnfUserHasSelection = true;
          if (results) {
            firstDnfIsCorrect = Boolean(results.no_dnf);
          }
        } else if (prediction.first_dnf_driver_id) {
          firstDnfPredictedText = resolveDriverName(prediction.first_dnf_driver_id, driverMap);
          firstDnfUserHasSelection = Boolean(prediction.first_dnf_driver_id);
          if (results?.first_dnf_driver_id) {
            firstDnfIsCorrect = String(prediction.first_dnf_driver_id) === String(results.first_dnf_driver_id);
          } else if (results?.no_dnf) {
            firstDnfIsCorrect = false;
          }
        }
      }

      const firstDnfActualAvailable = actualNoDnf || Boolean(results?.first_dnf_driver_id);

      pushCategory(
        "firstDnf",
        "First DNF",
        firstDnfActualText,
        firstDnfPredictedText,
        10,
        firstDnfActualAvailable,
        firstDnfUserHasSelection,
        firstDnfIsCorrect
      );

      const safetyCarActual = booleanLabel(results?.safety_car ?? null);
      const safetyCarPredicted = booleanLabel(
        prediction && typeof prediction.safety_car === "boolean" ? prediction.safety_car : null
      );

      pushCategory(
        "safetyCar",
        "Safety Car",
        safetyCarActual,
        safetyCarPredicted,
        10,
        typeof results?.safety_car === "boolean",
        typeof prediction?.safety_car === "boolean",
        typeof results?.safety_car === "boolean" && typeof prediction?.safety_car === "boolean"
          ? results.safety_car === prediction.safety_car
          : null
      );

      const winningMarginActual = typeof results?.winning_margin === "string" ? results.winning_margin : null;
      const winningMarginPredicted = typeof prediction?.winning_margin === "string" ? prediction.winning_margin : null;

      pushCategory(
        "winningMargin",
        "Winning Margin",
        winningMarginActual,
        winningMarginPredicted,
        10,
        Boolean(winningMarginActual),
        Boolean(winningMarginPredicted),
        winningMarginActual && winningMarginPredicted ? winningMarginActual === winningMarginPredicted : null
      );

      const wildcardActual = typeof results?.wildcard_result === "boolean" ? booleanLabel(results.wildcard_result) : null;
      const wildcardPredicted =
        typeof prediction?.wildcard_answer === "boolean" ? booleanLabel(prediction.wildcard_answer) : null;

      pushCategory(
        "wildcard",
        wildcardLabel,
        wildcardActual,
        wildcardPredicted,
        10,
        typeof results?.wildcard_result === "boolean",
        typeof prediction?.wildcard_answer === "boolean",
        typeof results?.wildcard_result === "boolean" && typeof prediction?.wildcard_answer === "boolean"
          ? results.wildcard_result === prediction.wildcard_answer
          : null
      );

      const totalPointsEarned = categories.reduce((total, category) => total + category.pointsEarned, 0);

      const bucket = ensureSeasonBucket(season);
      bucket.races.push({
        raceId: String(race.id),
        name: race.name ?? "Race",
        circuit: race.circuit ?? null,
        round: typeof race.round === "number" ? race.round : null,
        raceDate: race.race_date ?? null,
        wildcardQuestion: race.wildcard_question ?? null,
        totalPointsEarned,
        categories,
      });
    });

    relevantBonusBundles.forEach((bundle) => {
      const event = bundle.event;
      const relatedRace = event?.race_id ? racesById.get(String(event.race_id)) ?? null : null;
      const season = normalizeSeasonFromEvent(event, relatedRace);
      const bucket = ensureSeasonBucket(season);

      const responses = bonusResponsesMap[event.id] ?? [];

      const responseByQuestion = new Map<string, typeof responses[number]>();
      responses.forEach((row) => {
        responseByQuestion.set(String(row.question_id), row);
      });

      const multiplier = typeof event.points_multiplier === "number" && Number.isFinite(event.points_multiplier)
        ? event.points_multiplier
        : 1;

      const questions: BonusQuestionPayload[] = [];
      let totalPointsAvailable = 0;
      let totalPointsEarned = 0;

      bundle.questions
        .slice()
        .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))
        .forEach((question) => {
          const response = responseByQuestion.get(String(question.id)) ?? null;
          const correctIds = Array.isArray(question.correct_option_ids)
            ? question.correct_option_ids.filter((id): id is string => typeof id === "string" && id.length > 0)
            : [];

          const options = question.options ?? [];
          const labelByOptionId = new Map<string, string>();
          options.forEach((option) => {
            if (!option?.id) return;
            labelByOptionId.set(String(option.id), option.label ?? "");
          });

          const correctOptions = correctIds
            .map((id) => labelByOptionId.get(String(id)) ?? null)
            .filter((label): label is string => Boolean(label));

          const selectionIds = Array.isArray(response?.selected_option_ids)
            ? response.selected_option_ids.filter((id): id is string => typeof id === "string" && id.length > 0)
            : [];

          const userSelections = selectionIds
            .map((id) => labelByOptionId.get(String(id)) ?? null)
            .filter((label): label is string => Boolean(label));

          const computedPointsAvailable = Math.round((question.points ?? 0) * multiplier);
          const earned = typeof response?.points_awarded === "number" ? Math.round(response.points_awarded) : 0;

          totalPointsAvailable += computedPointsAvailable;
          totalPointsEarned += earned;

          let status: BonusQuestionStatus = "pending";
          if (!correctIds.length) {
            status = "pending";
          } else if (!selectionIds.length && !userSelections.length) {
            status = "missing";
          } else if (earned >= computedPointsAvailable && computedPointsAvailable > 0) {
            status = "correct";
          } else {
            status = "incorrect";
          }

          questions.push({
            questionId: String(question.id),
            prompt: question.prompt ?? "Question",
            pointsAvailable: computedPointsAvailable,
            pointsEarned: earned,
            correctOptions,
            userSelections,
            status,
          });
        });

      bucket.bonusEvents.push({
        eventId: event.id,
        title: event.title ?? "Bonus Event",
        type: event.type ?? "open",
        locksAt: event.locks_at ?? null,
        publishedAt: event.published_at ?? null,
        pointsMultiplier: multiplier,
        relatedRaceId: event.race_id ?? null,
        relatedRaceName: relatedRace?.name ?? null,
        totalPointsAvailable,
        totalPointsEarned,
        questions,
      });
    });

    const seasons = Array.from(seasonBuckets.entries())
      .sort((a, b) => b[0] - a[0])
      .map<SeasonResultsPayload>(([season, value]) => ({
        season,
        races: value.races.sort((a, b) => {
          if (a.round !== null && b.round !== null && a.round !== b.round) {
            return a.round - b.round;
          }
          const dateA = a.raceDate ? new Date(a.raceDate).getTime() : 0;
          const dateB = b.raceDate ? new Date(b.raceDate).getTime() : 0;
          return dateA - dateB;
        }),
        bonusEvents: value.bonusEvents.sort((a, b) => {
          const aTime = a.locksAt ? new Date(a.locksAt).getTime() : 0;
          const bTime = b.locksAt ? new Date(b.locksAt).getTime() : 0;
          return aTime - bTime;
        }),
      }));

    const payload: ResultsResponsePayload = { seasons };
    return NextResponse.json(payload);
  } catch (error) {
    console.error("Failed to load results:", error);
    return NextResponse.json({ error: "Failed to load results" }, { status: 500 });
  }
}

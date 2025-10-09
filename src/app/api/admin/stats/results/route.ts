import { NextResponse } from 'next/server';

import { supabaseAdmin } from '~/lib/supabase';

type PredictionRow = {
  id: string;
  user_id: string;
  score?: number | null;
  pole_driver_id?: string | null;
  winner_driver_id?: string | null;
  second_driver_id?: string | null;
  third_driver_id?: string | null;
  fastest_lap_driver_id?: string | null;
  fastest_pit_team_id?: string | null;
  first_dnf_driver_id?: string | null;
  no_dnf?: boolean;
  safety_car?: boolean;
  wildcard_answer?: boolean | null;
  winning_margin?: string | null;
};

const CATEGORY_LABELS: Record<string, string> = {
  pole_driver_id: 'Pole',
  winner_driver_id: 'Winner',
  second_driver_id: 'Second',
  third_driver_id: 'Third',
  fastest_lap_driver_id: 'Fastest Lap',
  fastest_pit_team_id: 'Fastest Pit Team',
};

function percentage(count: number, total: number): number {
  if (!total) return 0;
  return Math.round((count / total) * 100);
}

function evaluateBasePrediction(prediction: PredictionRow, results: any): { score: number; correctCount: number } {
  if (!results) {
    const score = typeof prediction.score === 'number' ? Math.max(0, Math.min(100, prediction.score)) : 0;
    return { score, correctCount: 0 };
  }

  let score = 0;
  let correctCount = 0;

  if (prediction.pole_driver_id === results.pole_driver_id) {
    score += 15;
    correctCount += 1;
  }
  if (prediction.winner_driver_id === results.winner_driver_id) {
    score += 15;
    correctCount += 1;
  }
  if (prediction.second_driver_id === results.second_driver_id) {
    score += 10;
    correctCount += 1;
  }
  if (prediction.third_driver_id === results.third_driver_id) {
    score += 10;
    correctCount += 1;
  }
  if (prediction.fastest_lap_driver_id === results.fastest_lap_driver_id) {
    score += 10;
    correctCount += 1;
  }
  if (prediction.fastest_pit_team_id === results.fastest_pit_team_id) {
    score += 10;
    correctCount += 1;
  }

  if (results.no_dnf) {
    if (prediction.no_dnf) {
      score += 10;
      correctCount += 1;
    }
  } else if (!results.no_dnf && prediction.first_dnf_driver_id === results.first_dnf_driver_id) {
    score += 10;
    correctCount += 1;
  }

  if (prediction.safety_car === results.safety_car) {
    score += 10;
    correctCount += 1;
  }
  if (prediction.winning_margin && prediction.winning_margin === results.winning_margin) {
    score += 10;
    correctCount += 1;
  }

  return { score, correctCount };
}

export async function GET() {
  try {
    const { data: race } = await supabaseAdmin
      .from('races')
      .select('id, name, race_date, lock_time')
      .eq('status', 'completed')
      .order('race_date', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!race?.id) {
      return NextResponse.json({
        race: null,
        results: null,
        accuracy: [],
        perfectSlates: [],
        nearPerfect: [],
        topScores: [],
        scoreDistribution: [],
      });
    }

    const { data: results } = await supabaseAdmin
      .from('race_results')
      .select('*')
      .eq('race_id', race.id)
      .maybeSingle();

    const { data: predictions } = await supabaseAdmin
      .from('predictions')
      .select('id, user_id, score, pole_driver_id, winner_driver_id, second_driver_id, third_driver_id, fastest_lap_driver_id, fastest_pit_team_id, first_dnf_driver_id, no_dnf, safety_car, wildcard_answer, winning_margin')
      .eq('race_id', race.id);

    const scoredPredictions = (predictions || []).map((row) => {
      const evaluation = evaluateBasePrediction(row, results);
      const baseScore = evaluation.score;
      const baseCorrectCount = evaluation.correctCount;
      const wildcardBonus =
        results && Object.prototype.hasOwnProperty.call(results, 'wildcard_result') && row.wildcard_answer === results.wildcard_result
          ? 10
          : 0;
      const totalScore = baseScore + wildcardBonus;
      return {
        ...row,
        baseScore,
        baseCorrectCount,
        wildcardBonus,
        totalScore,
      };
    });

    const totalPredictions = scoredPredictions.length;

    const userIds = new Set<string>();
    scoredPredictions.forEach((row) => userIds.add(row.user_id));
    const { data: users } = await supabaseAdmin
      .from('users')
      .select('id, username, display_name')
      .in('id', Array.from(userIds));
    const userNameMap = new Map<string, string>();
    users?.forEach((user) => {
      const name = user.display_name || user.username || user.id;
      userNameMap.set(user.id, name);
    });

    const driverIds = new Set<string>();
    const teamIds = new Set<string>();

    if (results) {
      [
        results.pole_driver_id,
        results.winner_driver_id,
        results.second_driver_id,
        results.third_driver_id,
        results.fastest_lap_driver_id,
        results.first_dnf_driver_id,
      ].forEach((id: string | null | undefined) => {
        if (id) driverIds.add(String(id));
      });
      if (results.fastest_pit_team_id) {
        teamIds.add(String(results.fastest_pit_team_id));
      }
    }

    scoredPredictions.forEach((row) => {
      [
        row.pole_driver_id,
        row.winner_driver_id,
        row.second_driver_id,
        row.third_driver_id,
        row.fastest_lap_driver_id,
        row.first_dnf_driver_id,
      ].forEach((id) => {
        if (id) driverIds.add(String(id));
      });
      if (row.fastest_pit_team_id) teamIds.add(String(row.fastest_pit_team_id));
    });

    const driverNameMap = new Map<string, string>();
    if (driverIds.size) {
      const { data: driverRows } = await supabaseAdmin
        .from('drivers')
        .select('id, name, number, team');
      driverRows?.forEach((driver) => {
        if (driver?.id && driver?.name) {
          driverNameMap.set(
            String(driver.id),
            driver.number ? `#${driver.number} ${driver.name}` : String(driver.name)
          );
        }
      });
    }

    const teamNameMap = new Map<string, string>();
    if (teamIds.size) {
      const { data: teamRows } = await supabaseAdmin
        .from('teams')
        .select('id, name');
      teamRows?.forEach((team) => {
        if (team?.id && team?.name) {
          teamNameMap.set(String(team.id), String(team.name));
        }
      });
    }

    const accuracy: Array<{ label: string; count: number; percentage: number }> = [];

    const addAccuracy = (label: string, count: number) => {
      accuracy.push({ label, count, percentage: percentage(count, totalPredictions) });
    };

    if (results) {
      Object.entries(CATEGORY_LABELS).forEach(([key, label]) => {
        const correctCount = scoredPredictions.filter((row) => row[key as keyof PredictionRow] && row[key as keyof PredictionRow] === results[key as keyof typeof results]).length;
        addAccuracy(label, correctCount);
      });

      if ('no_dnf' in results) {
        const correct = scoredPredictions.filter((row) => {
          if (results.no_dnf) {
            return row.no_dnf === true;
          }
          return !row.no_dnf && row.first_dnf_driver_id && results.first_dnf_driver_id && row.first_dnf_driver_id === results.first_dnf_driver_id;
        }).length;
        addAccuracy('No DNF / First DNF', correct);
      }

      if ('safety_car' in results) {
        const correct = scoredPredictions.filter((row) => row.safety_car === results.safety_car).length;
        addAccuracy('Safety Car', correct);
      }

      if ('winning_margin' in results) {
        const correct = scoredPredictions.filter((row) => row.winning_margin && results.winning_margin && row.winning_margin === results.winning_margin).length;
        addAccuracy('Winning Margin', correct);
      }

      if ('wildcard_result' in results) {
        const correct = scoredPredictions.filter((row) => row.wildcard_answer === results.wildcard_result).length;
        addAccuracy('Wildcard', correct);
      }
    }

    const perfectSlates = scoredPredictions
      .filter((row) => row.baseScore === 100)
      .map((row) => ({
        userId: row.user_id,
        name: userNameMap.get(row.user_id) || row.user_id,
        score: row.totalScore,
      }));

    const nearPerfect = scoredPredictions
      .filter((row) => row.baseCorrectCount === 8)
      .map((row) => ({
        userId: row.user_id,
        name: userNameMap.get(row.user_id) || row.user_id,
        score: row.totalScore,
      }))
      .sort((a, b) => (b.score || 0) - (a.score || 0));

    const topScores = scoredPredictions
      .slice()
      .sort((a, b) => (b.totalScore ?? 0) - (a.totalScore ?? 0))
      .slice(0, 10)
      .map((row) => ({
        userId: row.user_id,
        name: userNameMap.get(row.user_id) || row.user_id,
        score: row.totalScore,
      }));

    const scoreDistributionMap = new Map<number, number>();
    scoredPredictions.forEach((row) => {
      const score = typeof row.totalScore === 'number' ? Math.max(0, Math.min(110, Math.round(row.totalScore))) : 0;
      const bucket = Math.min(110, Math.floor(score / 10) * 10);
      scoreDistributionMap.set(bucket, (scoreDistributionMap.get(bucket) ?? 0) + 1);
    });
    const scoreDistribution = Array.from({ length: 12 }).map((_, idx) => {
      const bucket = idx * 10;
      return {
        bucket,
        count: scoreDistributionMap.get(bucket) ?? 0,
        percentage: percentage(scoreDistributionMap.get(bucket) ?? 0, totalPredictions)
      };
    });

    const mappedResults = results
      ? {
          pole: results.pole_driver_id ? driverNameMap.get(String(results.pole_driver_id)) ?? String(results.pole_driver_id) : null,
          winner: results.winner_driver_id ? driverNameMap.get(String(results.winner_driver_id)) ?? String(results.winner_driver_id) : null,
          second: results.second_driver_id ? driverNameMap.get(String(results.second_driver_id)) ?? String(results.second_driver_id) : null,
          third: results.third_driver_id ? driverNameMap.get(String(results.third_driver_id)) ?? String(results.third_driver_id) : null,
          fastestLap: results.fastest_lap_driver_id ? driverNameMap.get(String(results.fastest_lap_driver_id)) ?? String(results.fastest_lap_driver_id) : null,
          fastestPitTeam: results.fastest_pit_team_id ? teamNameMap.get(String(results.fastest_pit_team_id)) ?? String(results.fastest_pit_team_id) : null,
          firstDnf: results.first_dnf_driver_id ? driverNameMap.get(String(results.first_dnf_driver_id)) ?? String(results.first_dnf_driver_id) : null,
          winningMargin: results.winning_margin ? String(results.winning_margin) : null,
          noDnf: results.no_dnf,
          safetyCar: results.safety_car,
          wildcard: results.wildcard_result,
        }
      : null;

    return NextResponse.json({
      race,
      results: mappedResults,
      accuracy,
      perfectSlates,
      nearPerfect,
      topScores,
      scoreDistribution,
    });
  } catch (error) {
    console.error('Admin results stats error:', error);
    return NextResponse.json({ error: 'Failed to fetch results stats' }, { status: 500 });
  }
}

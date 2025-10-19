import { NextRequest, NextResponse } from 'next/server';
import { authenticateAdmin } from '~/lib/auth';
import { supabaseAdmin } from '~/lib/supabase';

function extractHeaderToken(request: NextRequest): string | null {
  const headerToken = request.headers.get('x-admin-token')?.trim();
  if (headerToken) return headerToken;

  const bearer = request.headers.get('authorization');
  if (bearer?.startsWith('Bearer ')) {
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
    token
  });

  return authResult.authenticated;
}

function unauthorizedResponse() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
}

// POST - Submit race results and score all predictions
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    if (!isAuthorized(body, request)) {
      return unauthorizedResponse();
    }
    const {
      raceId,
      poleDriverId,
      winnerDriverId,
      secondDriverId,
      thirdDriverId,
      fastestLapDriverId,
      fastestPitTeamId,
      firstDnfDriverId,
      noDnf,
      safetyCar,
      winningMargin,
      wildcardResult
    } = body;

    const normalizeUuid = (value?: string | null) => {
      if (typeof value !== 'string') return value ?? null;
      const trimmed = value.trim();
      return trimmed === '' ? null : trimmed;
    };

    if (!raceId) {
      return NextResponse.json(
        { error: 'Missing raceId' },
        { status: 400 }
      );
    }

    // Insert race results
    const { data: results, error: resultsError } = await supabaseAdmin
      .from('race_results')
      .upsert({
        race_id: raceId,
        pole_driver_id: normalizeUuid(poleDriverId),
        winner_driver_id: normalizeUuid(winnerDriverId),
        second_driver_id: normalizeUuid(secondDriverId),
        third_driver_id: normalizeUuid(thirdDriverId),
        fastest_lap_driver_id: normalizeUuid(fastestLapDriverId),
        fastest_pit_team_id: normalizeUuid(fastestPitTeamId),
        first_dnf_driver_id: noDnf ? null : normalizeUuid(firstDnfDriverId),
        no_dnf: noDnf,
        safety_car: safetyCar,
        winning_margin: winningMargin,
        wildcard_result: wildcardResult
      }, {
        onConflict: 'race_id'
      })
      .select()
      .single();

    if (resultsError) throw resultsError;

    // Get all predictions for this race
    const { data: predictions, error: predictionsError } = await supabaseAdmin
      .from('predictions')
      .select('*')
      .eq('race_id', raceId);

    if (predictionsError) throw predictionsError;

    const uniquePredictionsMap = new Map<string, any>();

    (predictions ?? []).forEach((prediction) => {
      if (!prediction?.user_id) return;
      const existing = uniquePredictionsMap.get(prediction.user_id);
      if (!existing) {
        uniquePredictionsMap.set(prediction.user_id, prediction);
        return;
      }

      const existingTime = extractTimestamp(existing.updated_at ?? existing.created_at);
      const candidateTime = extractTimestamp(prediction.updated_at ?? prediction.created_at);

      if (candidateTime >= existingTime) {
        uniquePredictionsMap.set(prediction.user_id, prediction);
      }
    });

    const uniquePredictions = Array.from(uniquePredictionsMap.values());
    const impactedUserIds = new Set<string>();

    const scoringPromises = uniquePredictions.map(async (prediction) => {
      let baseScore = 0;
      impactedUserIds.add(prediction.user_id);

      // Pole Position (15 pts)
      if (prediction.pole_driver_id === poleDriverId) {
        baseScore += 15;
        await awardBadge(prediction.user_id, 'Pole Prophet', raceId);
      }

      // Winner (15 pts from 35 podium points)
      if (prediction.winner_driver_id === winnerDriverId) {
        baseScore += 15;
        await awardBadge(prediction.user_id, 'Winner Wizard', raceId);
      }

      // 2nd Place (10 pts)
      if (prediction.second_driver_id === secondDriverId) {
        baseScore += 10;
        await awardBadge(prediction.user_id, 'Silver Seer', raceId);
      }

      // 3rd Place (10 pts)
      if (prediction.third_driver_id === thirdDriverId) {
        baseScore += 10;
        await awardBadge(prediction.user_id, 'Bronze Brainiac', raceId);
      }

      // Perfect Podium bonus
      if (prediction.winner_driver_id === winnerDriverId &&
          prediction.second_driver_id === secondDriverId &&
          prediction.third_driver_id === thirdDriverId) {
        await awardBadge(prediction.user_id, 'Podium Prophet', raceId);
      }

      // Fastest Lap (10 pts)
      if (prediction.fastest_lap_driver_id === fastestLapDriverId) {
        baseScore += 10;
        await awardBadge(prediction.user_id, 'Lap Legend', raceId);
      }

      // Fastest Pit Stop (10 pts)
      if (prediction.fastest_pit_team_id === fastestPitTeamId) {
        baseScore += 10;
        await awardBadge(prediction.user_id, 'Pit Psychic', raceId);
      }

      // First DNF / No DNF (10 pts)
      if (noDnf && prediction.no_dnf) {
        baseScore += 10;
        await awardBadge(prediction.user_id, 'DNF Detective', raceId);
      } else if (!noDnf && prediction.first_dnf_driver_id === firstDnfDriverId) {
        baseScore += 10;
        await awardBadge(prediction.user_id, 'DNF Detective', raceId);
      }

      // Safety Car (10 pts)
      if (prediction.safety_car === safetyCar) {
        baseScore += 10;
        await awardBadge(prediction.user_id, 'Safety Sage', raceId);
      }

      // Winning Margin (10 pts)
      if (prediction.winning_margin === winningMargin) {
        baseScore += 10;
        await awardBadge(prediction.user_id, 'Margin Master', raceId);
      }

      // Award special badges
      if (baseScore >= 50) {
        await awardBadge(prediction.user_id, 'Half Century', raceId);
      }

      if (baseScore === 100) {
        await awardBadge(prediction.user_id, 'Perfect Slate', raceId);
        // Increment perfect slates count
        const { data: user } = await supabaseAdmin
          .from('users')
          .select('perfect_slates')
          .eq('id', prediction.user_id)
          .single();

        if (user) {
          await supabaseAdmin
            .from('users')
            .update({ perfect_slates: user.perfect_slates + 1 })
            .eq('id', prediction.user_id);
        }
      }

      let bonusScore = 0;
      const wildcardCorrect = prediction.wildcard_answer === wildcardResult;

      if (wildcardCorrect) {
        bonusScore = 10;
        await awardBadge(prediction.user_id, 'Wildcard Wizard', raceId);

        if (baseScore === 100) {
          await awardBadge(prediction.user_id, 'Grand Prix Master', raceId);
        }
      }

      const finalScore = baseScore + bonusScore;
      const previousScore = normalizeScore(prediction.score) ?? 0;
      const alreadyScored = typeof prediction.scored_at === 'string' && prediction.scored_at.length > 0;

      if (alreadyScored && previousScore === finalScore) {
        return;
      }

      // Update prediction with score
      return supabaseAdmin
        .from('predictions')
        .update({
          score: finalScore,
          scored_at: new Date().toISOString()
        })
        .eq('id', prediction.id);
    });

    await Promise.all(scoringPromises);

    await recomputeUserTotalPoints(Array.from(impactedUserIds));

    // Update race status to completed
    await supabaseAdmin
      .from('races')
      .update({ status: 'completed' })
      .eq('id', raceId);

    return NextResponse.json({
      success: true,
      message: `Scored ${predictions.length} predictions`,
      results
    });
  } catch (error) {
    console.error('Error submitting results:', error);
    return NextResponse.json(
      { error: 'Failed to submit results' },
      { status: 500 }
    );
  }
}

// Helper function to award badges
async function awardBadge(userId: string, badgeName: string, raceId: string) {
  try {
    // Get badge ID
    const { data: badge } = await supabaseAdmin
      .from('badges')
      .select('id')
      .eq('name', badgeName)
      .single();

    if (!badge) return;

    // Award badge (will ignore if already exists due to UNIQUE constraint)
    await supabaseAdmin
      .from('user_badges')
      .insert({
        user_id: userId,
        badge_id: badge.id,
        race_id: raceId
      })
      .select();
  } catch (error) {
    // Ignore duplicate badge errors
    console.log(`Badge ${badgeName} already awarded or error:`, error);
  }
}

function extractTimestamp(value: unknown): number {
  if (typeof value === 'string') {
    const parsed = new Date(value).getTime();
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return 0;
}

function normalizeScore(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

async function recomputeUserTotalPoints(userIds: string[]) {
  if (!Array.isArray(userIds) || userIds.length === 0) {
    return;
  }

  const uniqueUserIds = Array.from(new Set(userIds.filter((id): id is string => typeof id === 'string' && id.length > 0)));
  if (!uniqueUserIds.length) {
    return;
  }

  const { data: predictionRows, error: predictionsError } = await supabaseAdmin
    .from('predictions')
    .select('user_id, race_id, score')
    .in('user_id', uniqueUserIds);

  if (predictionsError) {
    throw predictionsError;
  }

  const scoreMap = new Map<string, Map<string, number>>();

  (predictionRows ?? []).forEach((row: any) => {
    const userId = typeof row?.user_id === 'string' ? row.user_id : null;
    const raceId = typeof row?.race_id === 'string' ? row.race_id : null;
    const scoreValue = normalizeScore(row?.score);

    if (!userId || !raceId || scoreValue === null) {
      return;
    }

    if (!scoreMap.has(userId)) {
      scoreMap.set(userId, new Map<string, number>());
    }

    const raceScores = scoreMap.get(userId)!;
    const existingScore = raceScores.get(raceId);

    if (typeof existingScore === 'number') {
      raceScores.set(raceId, Math.max(existingScore, scoreValue));
    } else {
      raceScores.set(raceId, scoreValue);
    }
  });

  const { data: users, error: usersError } = await supabaseAdmin
    .from('users')
    .select('id, bonus_points')
    .in('id', uniqueUserIds);

  if (usersError) {
    throw usersError;
  }

  const bonusMap = new Map<string, number>();
  (users ?? []).forEach((user) => {
    if (!user?.id) return;
    const bonus = typeof user.bonus_points === 'number' && Number.isFinite(user.bonus_points) ? user.bonus_points : 0;
    bonusMap.set(user.id, bonus);
  });

  const updatePromises = uniqueUserIds.map(async (userId) => {
    const raceScores = scoreMap.get(userId);
    let predictionTotal = 0;

    if (raceScores) {
      raceScores.forEach((score) => {
        if (typeof score === 'number' && Number.isFinite(score)) {
          predictionTotal += score;
        }
      });
    }

    const bonusPoints = bonusMap.get(userId) ?? 0;
    const totalPoints = predictionTotal + bonusPoints;

    await supabaseAdmin
      .from('users')
      .update({ total_points: totalPoints })
      .eq('id', userId);
  });

  await Promise.all(updatePromises);
}

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '~/lib/supabase';

const ADMIN_TOKENS = (process.env.ADMIN_SECRET || process.env.ADMIN_FID_1 || '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);

function isAuthorized(request: NextRequest): boolean {
  if (!ADMIN_TOKENS.length) return false;
  const token = request.headers.get('x-admin-token')?.trim();
  if (token && ADMIN_TOKENS.includes(token)) return true;

  const bearer = request.headers.get('authorization');
  if (bearer?.startsWith('Bearer ')) {
    const value = bearer.slice(7).trim();
    if (value && ADMIN_TOKENS.includes(value)) return true;
  }

  return false;
}

function unauthorizedResponse() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
}

// POST - Submit race results and score all predictions
export async function POST(request: NextRequest) {
  try {
    if (!isAuthorized(request)) {
      return unauthorizedResponse();
    }

    const body = await request.json();
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

    // Score each prediction
    const userDeltas = new Map<string, number>();

    const scoringPromises = predictions.map(async (prediction) => {
      let score = 0;

      // Pole Position (15 pts)
      if (prediction.pole_driver_id === poleDriverId) {
        score += 15;
        await awardBadge(prediction.user_id, 'Pole Prophet', raceId);
      }

      // Winner (15 pts from 35 podium points)
      if (prediction.winner_driver_id === winnerDriverId) {
        score += 15;
        await awardBadge(prediction.user_id, 'Winner Wizard', raceId);
      }

      // 2nd Place (10 pts)
      if (prediction.second_driver_id === secondDriverId) {
        score += 10;
        await awardBadge(prediction.user_id, 'Silver Seer', raceId);
      }

      // 3rd Place (10 pts)
      if (prediction.third_driver_id === thirdDriverId) {
        score += 10;
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
        score += 10;
        await awardBadge(prediction.user_id, 'Lap Legend', raceId);
      }

      // Fastest Pit Stop (10 pts)
      if (prediction.fastest_pit_team_id === fastestPitTeamId) {
        score += 10;
        await awardBadge(prediction.user_id, 'Pit Psychic', raceId);
      }

      // First DNF / No DNF (10 pts)
      if (noDnf && prediction.no_dnf) {
        score += 10;
        await awardBadge(prediction.user_id, 'DNF Detective', raceId);
      } else if (!noDnf && prediction.first_dnf_driver_id === firstDnfDriverId) {
        score += 10;
        await awardBadge(prediction.user_id, 'DNF Detective', raceId);
      }

      // Safety Car (10 pts)
      if (prediction.safety_car === safetyCar) {
        score += 10;
        await awardBadge(prediction.user_id, 'Safety Sage', raceId);
      }

      // Winning Margin (10 pts)
      if (prediction.winning_margin === winningMargin) {
        score += 10;
        await awardBadge(prediction.user_id, 'Margin Master', raceId);
      }

      // Wildcard (10 pts)
      if (prediction.wildcard_answer === wildcardResult) {
        score += 10;
      }

      // Award special badges
      if (score >= 50) {
        await awardBadge(prediction.user_id, 'Half Century', raceId);
      }

      if (score === 100) {
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

      const previousScore = prediction.score ?? 0;
      const scoreDelta = score - previousScore;
      if (scoreDelta !== 0) {
        userDeltas.set(
          prediction.user_id,
          (userDeltas.get(prediction.user_id) ?? 0) + scoreDelta
        );
      }

      // Update prediction with score
      return supabaseAdmin
        .from('predictions')
        .update({
          score,
          scored_at: new Date().toISOString()
        })
        .eq('id', prediction.id);
    });

    await Promise.all(scoringPromises);

    // Update user totals if necessary
    const userUpdates = Array.from(userDeltas.entries()).map(async ([userId, delta]) => {
      if (!delta) return;
      const { data: user } = await supabaseAdmin
        .from('users')
        .select('total_points')
        .eq('id', userId)
        .single();

      if (!user) return;

      await supabaseAdmin
        .from('users')
        .update({ total_points: (user.total_points ?? 0) + delta })
        .eq('id', userId);
    });

    await Promise.all(userUpdates);

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

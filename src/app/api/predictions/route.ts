import { NextRequest, NextResponse } from 'next/server';
import { supabase, supabaseAdmin, ensureUserByFid } from '~/lib/supabase';

// GET - Fetch user's prediction for a race
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const fid = searchParams.get('fid');
    const raceId = searchParams.get('raceId');

    if (!fid || !raceId) {
      return NextResponse.json(
        { error: 'Missing fid or raceId' },
        { status: 400 }
      );
    }

    // Get user
    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('fid', parseInt(fid))
      .single();

    if (!user) {
      return NextResponse.json({ prediction: null });
    }

    // Get prediction
    const { data: prediction, error } = await supabase
      .from('predictions')
      .select('*')
      .eq('user_id', user.id)
      .eq('race_id', raceId)
      .single();

    if (error && error.code !== 'PGRST116') {
      throw error;
    }

    return NextResponse.json({ prediction: prediction || null });
  } catch (error) {
    console.error('Error fetching prediction:', error);
    return NextResponse.json(
      { error: 'Failed to fetch prediction' },
      { status: 500 }
    );
  }
}

// POST - Submit prediction
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      fid,
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
      wildcardAnswer,
      profile
    } = body;

    if (!fid || !raceId) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Check if race is still open for predictions
    const { data: race } = await supabaseAdmin
      .from('races')
      .select('lock_time, status')
      .eq('id', raceId)
      .single();

    if (!race || race.status === 'locked' || race.status === 'completed') {
      return NextResponse.json(
        { error: 'Predictions are locked for this race' },
        { status: 400 }
      );
    }

    if (new Date(race.lock_time) < new Date()) {
      return NextResponse.json(
        { error: 'Prediction deadline has passed' },
        { status: 400 }
      );
    }

    // Get or create user
    const profileData = profile && typeof profile === 'object'
      ? {
          username: profile.username ?? undefined,
          display_name: profile.displayName ?? undefined,
          pfp_url: profile.pfpUrl ?? undefined
        }
      : undefined;

    const user = await ensureUserByFid(parseInt(fid), profileData);
    if (!user) {
      return NextResponse.json(
        { error: 'Failed to get user' },
        { status: 500 }
      );
    }

    // Upsert prediction
    const { data: prediction, error } = await supabaseAdmin
      .from('predictions')
      .upsert({
        user_id: user.id,
        race_id: raceId,
        pole_driver_id: poleDriverId ?? null,
        winner_driver_id: winnerDriverId ?? null,
        second_driver_id: secondDriverId ?? null,
        third_driver_id: thirdDriverId ?? null,
        fastest_lap_driver_id: fastestLapDriverId ?? null,
        fastest_pit_team_id: fastestPitTeamId ?? null,
        first_dnf_driver_id: firstDnfDriverId ?? null,
        no_dnf: noDnf,
        safety_car: safetyCar,
        winning_margin: winningMargin ?? null,
        wildcard_answer: wildcardAnswer,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'user_id,race_id'
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ 
      success: true,
      prediction 
    });
  } catch (error) {
    console.error('Error submitting prediction:', error);
    return NextResponse.json(
      { error: 'Failed to submit prediction' },
      { status: 500 }
    );
  }
}

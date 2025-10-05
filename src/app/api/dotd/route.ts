import { NextRequest, NextResponse } from 'next/server';
import { supabase, supabaseAdmin, ensureUserByFid } from '~/lib/supabase';

// GET - Fetch DOTD votes for a race
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const raceId = searchParams.get('raceId');
    const fid = searchParams.get('fid');

    if (!raceId) {
      return NextResponse.json(
        { error: 'Missing raceId' },
        { status: 400 }
      );
    }

    // Get all votes for this race with driver info
    const { data: votes, error } = await supabase
      .from('dotd_votes')
      .select(`
        driver_id,
        drivers (
          id,
          name,
          team,
          number,
          color
        )
      `)
      .eq('race_id', raceId);

    if (error) throw error;

    // Aggregate votes by driver
    const voteCounts: Record<string, any> = {};
    let totalVotes = 0;

    votes?.forEach((vote: any) => {
      const driverId = vote.driver_id;
      if (!voteCounts[driverId]) {
        voteCounts[driverId] = {
          driver: vote.drivers,
          votes: 0
        };
      }
      voteCounts[driverId].votes += 1;
      totalVotes += 1;
    });

    // Convert to array and calculate percentages
    const voteResults = Object.entries(voteCounts)
      .map(([driverId, data]: [string, any]) => ({
        driver: data.driver,
        votes: data.votes,
        percentage: Math.round((data.votes / totalVotes) * 100)
      }))
      .sort((a, b) => b.votes - a.votes);

    let userVote = null;

    if (fid) {
      const { data: user } = await supabase
        .from('users')
        .select('id')
        .eq('fid', parseInt(fid))
        .single();

      if (user) {
        const { data: existingVotes } = await supabase
          .from('dotd_votes')
          .select(`
            driver_id,
            drivers (
              id,
              name,
              team,
              number,
              color
            )
          `)
          .eq('race_id', raceId)
          .eq('user_id', user.id);

        const existingVote = existingVotes?.[0];

        if (existingVote?.drivers) {
          userVote = {
            driver: existingVote.drivers
          };
        }
      }
    }

    return NextResponse.json({
      votes: voteResults,
      totalVotes,
      userVote
    });
  } catch (error) {
    console.error('Error fetching DOTD votes:', error);
    return NextResponse.json(
      { error: 'Failed to fetch votes' },
      { status: 500 }
    );
  }
}

// POST - Submit DOTD vote
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { fid, raceId, driverId, profile } = body;

    if (!fid || !raceId || !driverId) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Get or create user using service role
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

    // Check if race is completed
    const { data: race } = await supabaseAdmin
      .from('races')
      .select('status')
      .eq('id', raceId)
      .single();

    if (!race || race.status !== 'completed') {
      return NextResponse.json(
        { error: 'Can only vote on completed races' },
        { status: 400 }
      );
    }

    // Upsert vote (allows changing vote)
    const { data: vote, error } = await supabaseAdmin
      .from('dotd_votes')
      .upsert({
        user_id: user.id,
        race_id: raceId,
        driver_id: driverId
      }, {
        onConflict: 'race_id,user_id'
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({
      success: true,
      vote
    });
  } catch (error) {
    console.error('Error submitting DOTD vote:', error);
    return NextResponse.json(
      { error: 'Failed to submit vote' },
      { status: 500 }
    );
  }
}

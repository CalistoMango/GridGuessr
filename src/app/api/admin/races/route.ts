import { NextRequest, NextResponse } from 'next/server';
import { authenticateAdmin } from '~/lib/auth';
import { ensureDriverOfDaySummaryJob, ensureLockReminderJobsForRace } from '~/lib/farcaster';
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

interface FarcasterSyncResult {
  lockReminders: boolean;
  driverOfDay: boolean;
  errors: string[];
}

async function syncFarcasterSchedules(race: any): Promise<FarcasterSyncResult> {
  const result: FarcasterSyncResult = {
    lockReminders: false,
    driverOfDay: false,
    errors: []
  };

  if (!race?.id) {
    return result;
  }

  if (race.lock_time) {
    try {
      await ensureLockReminderJobsForRace({
        raceId: race.id,
        lockTime: race.lock_time
      });
      result.lockReminders = true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('Failed to ensure lock reminder jobs:', error);
      result.errors.push(`Lock reminders: ${message}`);
    }
  }

  if (race.status === 'completed') {
    try {
      await ensureDriverOfDaySummaryJob({
        raceId: race.id,
        raceDate: race.race_date ?? null,
        lockTime: race.lock_time ?? undefined
      });
      result.driverOfDay = true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('Failed to ensure Driver of the Day job:', error);
      result.errors.push(`Driver of the Day: ${message}`);
    }
  }

  return result;
}

// GET - Fetch all races
export async function GET(request: NextRequest) {
  try {
    const { data: races, error } = await supabaseAdmin
      .from('races')
      .select('*')
      .order('race_date', { ascending: false });

    if (error) throw error;

    return NextResponse.json({ races: races || [] });
  } catch (error) {
    console.error('Error fetching races:', error);
    return NextResponse.json(
      { error: 'Failed to fetch races' },
      { status: 500 }
    );
  }
}

// POST - Create a new race
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    if (!isAuthorized(body, request)) {
      return unauthorizedResponse();
    }

    const {
      name,
      circuit,
      country,
      raceDate,
      lockTime,
      season,
      round,
      wildcardQuestion
    } = body;

    if (!name || !circuit || !raceDate || !lockTime || !season || !round) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Insert race
    const { data: race, error } = await supabaseAdmin
      .from('races')
      .insert({
        name,
        circuit,
        country,
        race_date: raceDate,
        lock_time: lockTime,
        season: parseInt(season),
        round: parseInt(round),
        wildcard_question: wildcardQuestion,
        status: 'upcoming'
      })
      .select()
      .single();

    if (error) throw error;

    const farcaster = await syncFarcasterSchedules(race);

    return NextResponse.json({
      success: true,
      race,
      farcaster
    });
  } catch (error) {
    console.error('Error creating race:', error);
    return NextResponse.json(
      { error: 'Failed to create race' },
      { status: 500 }
    );
  }
}

// DELETE - Delete a race
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    if (!isAuthorized(body, request)) {
      return unauthorizedResponse();
    }

    const { raceId } = body;

    if (!raceId) {
      return NextResponse.json(
        { error: 'Missing raceId' },
        { status: 400 }
      );
    }

    const { error } = await supabaseAdmin
      .from('races')
      .delete()
      .eq('id', raceId);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting race:', error);
    return NextResponse.json(
      { error: 'Failed to delete race' },
      { status: 500 }
    );
  }
}

// PUT - Update a race
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    if (!isAuthorized(body, request)) {
      return unauthorizedResponse();
    }

    const {
      raceId,
      name,
      circuit,
      country,
      raceDate,
      lockTime,
      season,
      round,
      status,
      wildcardQuestion
    } = body;

    if (!raceId) {
      return NextResponse.json({ error: 'Missing raceId' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from('races')
      .update({
        ...(name !== undefined ? { name } : {}),
        ...(circuit !== undefined ? { circuit } : {}),
        ...(country !== undefined ? { country } : {}),
        ...(raceDate !== undefined ? { race_date: raceDate } : {}),
        ...(lockTime !== undefined ? { lock_time: lockTime } : {}),
        ...(season !== undefined ? { season: parseInt(season, 10) } : {}),
        ...(round !== undefined ? { round: parseInt(round, 10) } : {}),
        ...(status ? { status } : {}),
        ...(wildcardQuestion !== undefined ? { wildcard_question: wildcardQuestion } : {})
      })
      .eq('id', raceId)
      .select()
      .single();

    if (error) throw error;

    const farcaster = await syncFarcasterSchedules(data);

    return NextResponse.json({ success: true, race: data, farcaster });
  } catch (error) {
    console.error('Error updating race:', error);
    return NextResponse.json(
      { error: 'Failed to update race' },
      { status: 500 }
    );
  }
}

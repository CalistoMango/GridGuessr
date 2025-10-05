import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '~/lib/supabase';

const ADMIN_TOKENS = (process.env.ADMIN_SECRET || process.env.ADMIN_FID_1 || '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);

function isAuthorized(request: NextRequest): boolean {
  if (!ADMIN_TOKENS.length) return false;
  const headerToken = request.headers.get('x-admin-token')?.trim();
  if (headerToken && ADMIN_TOKENS.includes(headerToken)) return true;

  const bearer = request.headers.get('authorization');
  if (bearer?.startsWith('Bearer ')) {
    const token = bearer.slice(7).trim();
    if (token && ADMIN_TOKENS.includes(token)) return true;
  }

  return false;
}

function unauthorizedResponse() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
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
    if (!isAuthorized(request)) {
      return unauthorizedResponse();
    }

    const body = await request.json();
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

    return NextResponse.json({
      success: true,
      race
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
    if (!isAuthorized(request)) {
      return unauthorizedResponse();
    }

    const body = await request.json();
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
    if (!isAuthorized(request)) {
      return unauthorizedResponse();
    }

    const body = await request.json();
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

    return NextResponse.json({ success: true, race: data });
  } catch (error) {
    console.error('Error updating race:', error);
    return NextResponse.json(
      { error: 'Failed to update race' },
      { status: 500 }
    );
  }
}

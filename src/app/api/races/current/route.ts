import { NextResponse } from 'next/server';
import { supabase } from '~/lib/supabase';

export async function GET() {
  try {
    // Get current race
    const { data: races, error: raceError } = await supabase
      .from('races')
      .select('*')
      .in('status', ['upcoming', 'locked'])
      .order('race_date', { ascending: true })
      .limit(1);

    if (raceError) throw raceError;

    const race = races && races.length > 0 ? races[0] : null;

    // Get active drivers
    const { data: drivers, error: driversError } = await supabase
      .from('drivers')
      .select('*')
      .eq('active', true)
      .order('name');

    if (driversError) throw driversError;

    // Get active teams
    const { data: teams, error: teamsError } = await supabase
      .from('teams')
      .select('*')
      .eq('active', true)
      .order('name');

    if (teamsError) throw teamsError;

    return NextResponse.json({
      race,
      drivers: drivers || [],
      teams: teams || []
    });
  } catch (error) {
    console.error('Error fetching current race:', error);
    return NextResponse.json(
      { error: 'Failed to fetch race data' },
      { status: 500 }
    );
  }
}
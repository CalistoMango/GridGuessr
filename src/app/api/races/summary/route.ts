import { NextResponse } from 'next/server';
import { supabase } from '~/lib/supabase';

export async function GET() {
  try {
    const { data: races, error: racesError } = await supabase
      .from('races')
      .select('*')
      .order('race_date', { ascending: true });

    if (racesError) throw racesError;

    const allRaces = races || [];

    const lockedRace = allRaces.find((race) => race.status === 'locked') || null;
    const upcomingRace = allRaces.find((race) => race.status === 'upcoming') || null;

    const currentRace = lockedRace ?? upcomingRace ?? null;
    const displayRace = lockedRace ?? upcomingRace ?? null;

    const relevantDate = currentRace ? new Date(currentRace.race_date).getTime() : Number.POSITIVE_INFINITY;

    const completedRaces = allRaces.filter((race) => race.status === 'completed');
    const previousCompleted = currentRace
      ? completedRaces
          .filter((race) => new Date(race.race_date).getTime() < relevantDate)
          .sort((a, b) => new Date(a.race_date).getTime() - new Date(b.race_date).getTime())
          .pop() || null
      : completedRaces.length
        ? completedRaces[completedRaces.length - 1]
        : null;

    const { data: drivers, error: driversError } = await supabase
      .from('drivers')
      .select('*')
      .eq('active', true)
      .order('name');

    if (driversError) throw driversError;

    const { data: teams, error: teamsError } = await supabase
      .from('teams')
      .select('*')
      .eq('active', true)
      .order('name');

    if (teamsError) throw teamsError;

    return NextResponse.json({
      races: allRaces,
      currentRace,
      displayRace,
      lockedRace,
      upcomingRace,
      previousCompletedRace: previousCompleted,
      drivers: drivers || [],
      teams: teams || []
    });
  } catch (error) {
    console.error('Error fetching race summary:', error);
    return NextResponse.json(
      { error: 'Failed to fetch race summary' },
      { status: 500 }
    );
  }
}

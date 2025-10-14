import { NextResponse } from 'next/server';
import { supabaseAdmin } from '~/lib/supabase';

type PredictionRow = {
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
};

function percentage(count: number, total: number): number {
  if (!total) return 0;
  return Math.round((count / total) * 100);
}

export async function GET() {
  try {
    // Resolve latest completed race (for DOTD)
    const { data: dotdRace } = await supabaseAdmin
      .from('races')
      .select('id, name, race_date')
      .eq('status', 'completed')
      .order('race_date', { ascending: false })
      .limit(1)
      .maybeSingle();

    // Resolve next prediction race (upcoming/locked, future lock)
    const nowIso = new Date().toISOString();
    const { data: predictionRace } = await supabaseAdmin
      .from('races')
      .select('id, name, lock_time')
      .in('status', ['upcoming', 'locked'])
      .gte('lock_time', nowIso)
      .order('lock_time', { ascending: true })
      .limit(1)
      .maybeSingle();

    // Aggregate DOTD votes
    let dotd = { total: 0, options: [] as Array<{ driverId: string; name: string; count: number; percentage: number }> };
    if (dotdRace?.id) {
      const { data: votes } = await supabaseAdmin
        .from('dotd_votes')
        .select('driver_id')
        .eq('race_id', dotdRace.id);

      const counts = new Map<string, number>();
      (votes || []).forEach((v: any) => {
        const id = String(v.driver_id);
        counts.set(id, (counts.get(id) ?? 0) + 1);
      });
      const total = (votes || []).length;

      const driverIds = Array.from(counts.keys());
      let nameMap = new Map<string, string>();
      if (driverIds.length) {
        const { data: drivers } = await supabaseAdmin
          .from('drivers')
          .select('id, name')
          .in('id', driverIds);
        drivers?.forEach((d: any) => {
          if (d?.id) nameMap.set(String(d.id), String(d.name));
        });
      }

      dotd = {
        total,
        options: driverIds
          .map((id) => ({
            driverId: id,
            name: nameMap.get(id) || id,
            count: counts.get(id) || 0,
            percentage: percentage(counts.get(id) || 0, total)
          }))
          .sort((a, b) => b.count - a.count)
      };
    }

    // Aggregate predictions for the prediction race
    const predictions = {
      total: 0,
      pole: [] as Array<{ id: string; name: string; count: number; percentage: number }>,
      winner: [] as Array<{ id: string; name: string; count: number; percentage: number }>,
      second: [] as Array<{ id: string; name: string; count: number; percentage: number }>,
      third: [] as Array<{ id: string; name: string; count: number; percentage: number }>,
      fastestLap: [] as Array<{ id: string; name: string; count: number; percentage: number }>,
      fastestPitTeam: [] as Array<{ id: string; name: string; count: number; percentage: number }>,
      firstDnf: [] as Array<{ id: string; name: string; count: number; percentage: number }>,
      safetyCar: [] as Array<{ value: string; count: number; percentage: number }>,
      wildcard: [] as Array<{ value: string; count: number; percentage: number }>
    };

    if (predictionRace?.id) {
      const { data: rows } = await supabaseAdmin
        .from('predictions')
        .select('pole_driver_id, winner_driver_id, second_driver_id, third_driver_id, fastest_lap_driver_id, fastest_pit_team_id, first_dnf_driver_id, no_dnf, safety_car, wildcard_answer')
        .eq('race_id', predictionRace.id);

      const total = (rows || []).length;
      predictions.total = total;

      const driverFields: Array<{ key: keyof PredictionRow; target: keyof typeof predictions; label?: string }> = [
        { key: 'pole_driver_id', target: 'pole' },
        { key: 'winner_driver_id', target: 'winner' },
        { key: 'second_driver_id', target: 'second' },
        { key: 'third_driver_id', target: 'third' },
        { key: 'fastest_lap_driver_id', target: 'fastestLap' }
      ];

      const teamFields: Array<{ key: keyof PredictionRow; target: keyof typeof predictions }> = [
        { key: 'fastest_pit_team_id', target: 'fastestPitTeam' }
      ];

      // Count drivers per field
      const driverIdsNeeded = new Set<string>();
      const driverCountsPerField = new Map<string, Map<string, number>>();
      driverFields.forEach(({ key }) => driverCountsPerField.set(String(key), new Map()))
      ;(rows || []).forEach((row: PredictionRow) => {
        driverFields.forEach(({ key }) => {
          const id = row[key] as string | null | undefined;
          if (id) {
            const map = driverCountsPerField.get(String(key))!;
            const s = String(id);
            map.set(s, (map.get(s) ?? 0) + 1);
            driverIdsNeeded.add(s);
          }
        });
      });

      // Load driver names
      const driverNameMap = new Map<string, string>();
      if (driverIdsNeeded.size) {
        const { data: drivers } = await supabaseAdmin
          .from('drivers')
          .select('id, name, number, team');
        drivers?.forEach((d: any) => {
          if (d?.id && d?.name) driverNameMap.set(String(d.id), d.number ? `#${d.number} ${d.name}` : String(d.name));
        });
      }

      // Map counts to arrays
      driverFields.forEach(({ key, target }) => {
        const counts = driverCountsPerField.get(String(key))!;
        (predictions as any)[target] = Array.from(counts.entries())
          .map(([id, count]) => ({ id, name: driverNameMap.get(id) || id, count, percentage: percentage(count, total) }))
          .sort((a, b) => b.count - a.count);
      });

      // Teams counts
      const teamCountsPerField = new Map<string, Map<string, number>>();
      teamFields.forEach(({ key }) => teamCountsPerField.set(String(key), new Map()));
      const teamIdsNeeded = new Set<string>();
      (rows || []).forEach((row: PredictionRow) => {
        teamFields.forEach(({ key }) => {
          const id = row[key] as string | null | undefined;
          if (id) {
            const map = teamCountsPerField.get(String(key))!;
            const s = String(id);
            map.set(s, (map.get(s) ?? 0) + 1);
            teamIdsNeeded.add(s);
          }
        });
      });
      const teamNameMap = new Map<string, string>();
      if (teamIdsNeeded.size) {
        const { data: teams } = await supabaseAdmin
          .from('teams')
          .select('id, name');
        teams?.forEach((t: any) => {
          if (t?.id && t?.name) teamNameMap.set(String(t.id), String(t.name));
        });
      }
      teamFields.forEach(({ key, target }) => {
        const counts = teamCountsPerField.get(String(key))!;
        (predictions as any)[target] = Array.from(counts.entries())
          .map(([id, count]) => ({ id, name: teamNameMap.get(id) || id, count, percentage: percentage(count, total) }))
          .sort((a, b) => b.count - a.count);
      });

      // First DNF vs No DNF
      const firstDnfCounts = new Map<string, number>();
      (rows || []).forEach((row: PredictionRow) => {
        if (row.no_dnf) {
          firstDnfCounts.set('no_dnf', (firstDnfCounts.get('no_dnf') ?? 0) + 1);
        } else if (row.first_dnf_driver_id) {
          const id = String(row.first_dnf_driver_id);
          firstDnfCounts.set(id, (firstDnfCounts.get(id) ?? 0) + 1);
          driverIdsNeeded.add(id);
        }
      });
      const firstDnfArray = Array.from(firstDnfCounts.entries());
      const mappedFirstDnf = firstDnfArray.map(([id, count]) => ({
        id,
        name: id === 'no_dnf' ? 'No DNF' : driverNameMap.get(id) || id,
        count,
        percentage: percentage(count, total)
      })).sort((a, b) => b.count - a.count);
      (predictions as any).firstDnf = mappedFirstDnf;

      // Safety car boolean distribution
      const safety = new Map<string, number>();
      (rows || []).forEach((row: PredictionRow) => {
        const val = row.safety_car === true ? 'Yes' : 'No';
        safety.set(val, (safety.get(val) ?? 0) + 1);
      });
      (predictions as any).safetyCar = Array.from(safety.entries()).map(([value, count]) => ({ value, count, percentage: percentage(count, total) }));

      // Wildcard boolean distribution (if present)
      const wildcard = new Map<string, number>();
      (rows || []).forEach((row: PredictionRow) => {
        if (row.wildcard_answer === true) wildcard.set('Yes', (wildcard.get('Yes') ?? 0) + 1);
        else if (row.wildcard_answer === false) wildcard.set('No', (wildcard.get('No') ?? 0) + 1);
      });
      (predictions as any).wildcard = Array.from(wildcard.entries()).map(([value, count]) => ({ value, count, percentage: percentage(count, total) }));
    }

    const { count: totalUsers } = await supabaseAdmin
      .from('users')
      .select('id', { count: 'exact', head: true });

    return NextResponse.json({
      predictionRace: predictionRace || null,
      predictions,
      dotdRace: dotdRace || null,
      dotd,
      totalUsers: typeof totalUsers === 'number' ? totalUsers : null
    });
  } catch (error) {
    console.error('Admin stats error:', error);
    return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 });
  }
}

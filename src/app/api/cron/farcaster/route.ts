import { NextRequest, NextResponse } from 'next/server';

import { supabaseAdmin } from '~/lib/supabase';
import {
  claimCastJob,
  dispatchCastJob,
  ensureDriverOfDaySummaryJob,
  ensureLockReminderJobsForRace,
  fetchDueCastJobs
} from '~/lib/farcaster';

const AUTH_HEADER = 'authorization';
const MAX_JOBS_PER_RUN = 10;

interface SchedulerStats {
  racesProcessed: number;
  errors: string[];
}

interface DispatchStats {
  sent: number;
  failed: number;
  skipped: number;
}

function authorize(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return true;
  }

  const header = request.headers.get(AUTH_HEADER);
  if (!header?.startsWith('Bearer ')) {
    return false;
  }

  const token = header.slice('Bearer '.length).trim();
  return token === secret;
}

async function scheduleLockReminders(): Promise<SchedulerStats> {
  const stats: SchedulerStats = { racesProcessed: 0, errors: [] };

  const { data, error } = await supabaseAdmin
    .from('races')
    .select('id, lock_time, status')
    .in('status', ['upcoming', 'locked'])
    .gte('lock_time', new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString())
    .order('lock_time', { ascending: true })
    .limit(25);

  if (error) {
    stats.errors.push(`Failed to load races: ${error.message ?? error}`);
    return stats;
  }

  await Promise.all(
    (data ?? []).map(async (race: any) => {
      const lockTime: string | null = race?.lock_time ?? null;
      if (!lockTime) {
        return;
      }
      try {
        await ensureLockReminderJobsForRace({
          raceId: race.id,
          lockTime
        });
        stats.racesProcessed += 1;
      } catch (err) {
        stats.errors.push(`Race ${race?.id}: ${(err as Error).message}`);
      }
    })
  );

  return stats;
}

async function scheduleDriverOfDaySummaries(): Promise<SchedulerStats> {
  const stats: SchedulerStats = { racesProcessed: 0, errors: [] };

  const { data, error } = await supabaseAdmin
    .from('races')
    .select('id, race_date, lock_time, status')
    .eq('status', 'completed')
    .order('race_date', { ascending: false })
    .limit(20);

  if (error) {
    stats.errors.push(`Failed to load completed races: ${error.message ?? error}`);
    return stats;
  }

  await Promise.all(
    (data ?? []).map(async (race: any) => {
      try {
        await ensureDriverOfDaySummaryJob({
          raceId: race.id,
          raceDate: race.race_date,
          lockTime: race.lock_time ?? undefined
        });
        stats.racesProcessed += 1;
      } catch (err) {
        stats.errors.push(`Driver of the Day scheduling failed for ${race?.id}: ${(err as Error).message}`);
      }
    })
  );

  return stats;
}

async function dispatchDueJobs(): Promise<DispatchStats & { jobsConsidered: number }> {
  const nowIso = new Date().toISOString();
  const dueJobs = await fetchDueCastJobs(nowIso, MAX_JOBS_PER_RUN);

  const stats: DispatchStats & { jobsConsidered: number } = {
    sent: 0,
    failed: 0,
    skipped: 0,
    jobsConsidered: dueJobs.length
  };

  for (const job of dueJobs) {
    const claimed = await claimCastJob(job);
    if (!claimed) {
      continue;
    }

    const result = await dispatchCastJob(claimed);
    if (result.status === 'sent') {
      stats.sent += 1;
    } else if (result.status === 'skipped') {
      stats.skipped += 1;
    } else {
      stats.failed += 1;
    }
  }

  return stats;
}

export async function GET(request: NextRequest) {
  if (!authorize(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const [lockStats, dotdStats, dispatchStats] = await Promise.all([
    scheduleLockReminders(),
    scheduleDriverOfDaySummaries(),
    dispatchDueJobs()
  ]);

  const response = {
    ok: true,
    scheduled: {
      lockReminders: lockStats,
      driverOfDay: dotdStats
    },
    dispatched: dispatchStats
  };

  return NextResponse.json(response);
}

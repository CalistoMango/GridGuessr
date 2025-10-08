import { supabaseAdmin } from '~/lib/supabase';
import { APP_URL } from '~/lib/constants';

import {
  CAST_TEXT_MAX_LENGTH,
  DEFAULT_DRIVER_OF_DAY_OFFSET_HOURS
} from './constants';
import type {
  CastPayload,
  DriverOfDayArgs,
  LockReminderArgs
} from './types';

interface RaceRecord {
  id: string;
  name: string;
  circuit?: string | null;
  race_date?: string | null;
  lock_time: string;
  season?: number | null;
  round?: number | null;
}

interface DriverRecord {
  id: string;
  name: string;
  team?: string | null;
  number?: string | null;
}

interface NormalizedVote {
  driverId: string;
  driver: DriverRecord;
}

function truncate(text: string): string {
  if (text.length <= CAST_TEXT_MAX_LENGTH) {
    return text;
  }
  return `${text.slice(0, CAST_TEXT_MAX_LENGTH - 3)}...`;
}

function formatMinutes(minutes: number): string {
  if (minutes >= 60) {
    const hours = minutes / 60;
    if (Number.isInteger(hours)) {
      return `${hours}h`;
    }
    return `${hours.toFixed(1)}h`;
  }

  return `${minutes}m`;
}

function formatTimeUTC(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'UTC',
    hour12: true
  }).format(date) + ' UTC';
}

function formatRaceContext(race: RaceRecord): string {
  const segments = [];
  if (race.season) {
    segments.push(`S${race.season}`);
  }
  if (race.round) {
    segments.push(`R${race.round}`);
  }
  if (race.circuit) {
    segments.push(race.circuit);
  }

  return segments.length ? segments.join(' | ') : '';
}

function raceLink(raceId: string): string {
  return `${APP_URL}/races/${raceId}`;
}

async function loadRace(raceId: string): Promise<RaceRecord> {
  const { data, error } = await supabaseAdmin
    .from('races')
    .select('id, name, circuit, race_date, lock_time, season, round')
    .eq('id', raceId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load race ${raceId}: ${error.message ?? error}`);
  }
  if (!data) {
    throw new Error(`Race ${raceId} not found`);
  }

  return data as RaceRecord;
}

export async function buildLockReminderCast(args: LockReminderArgs): Promise<CastPayload> {
  if (!args?.raceId) {
    throw new Error('Lock reminder template requires a raceId.');
  }

  const race = await loadRace(args.raceId);
  const lockDate = new Date(race.lock_time);
  const context = formatRaceContext(race);

  const lines = [
    `LOCK REMINDER: ${race.name} closes in ${formatMinutes(args.leadMinutes)}`,
    `Set your picks before ${formatTimeUTC(lockDate)}.`,
  ];

  if (context) {
    lines.push(context);
  }

  const text = truncate(lines.join('\n'));

  return {
    text,
    embeds: [{ url: raceLink(race.id) }],
    channelId: args.channelId ?? null
  };
}

function computeDriverOfDayPublishAt(race: RaceRecord): string {
  const raceDate = race.race_date ? new Date(race.race_date) : new Date(race.lock_time);
  const publishDate = new Date(raceDate.getTime());
  publishDate.setUTCHours(18, 0, 0, 0);
  publishDate.setUTCDate(publishDate.getUTCDate() + Math.round(DEFAULT_DRIVER_OF_DAY_OFFSET_HOURS / 24));
  return publishDate.toISOString();
}

function summarizeDriver(driver: DriverRecord, index: number, votes: number, percentage: number): string {
  const place = index + 1;
  const number = driver.number ? `#${driver.number} ` : '';
  const team = driver.team ? ` (${driver.team})` : '';
  return `${place}. ${number}${driver.name}${team} - ${percentage}% (${votes})`;
}

function normalizeDriverRecord(value: any): DriverRecord | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const id = value.id ?? value.driver_id;
  const name = value.name;

  if (!id || !name) {
    return null;
  }

  return {
    id: String(id),
    name: String(name),
    team: value.team ? String(value.team) : null,
    number: value.number ? String(value.number) : null
  };
}

function normalizeDotdVotes(raw: unknown): NormalizedVote[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  const normalized: NormalizedVote[] = [];

  raw.forEach((entry) => {
    if (!entry || typeof entry !== 'object') {
      return;
    }

    const driverId = (entry as any).driver_id;
    const driverCandidate = Array.isArray((entry as any).drivers)
      ? (entry as any).drivers[0]
      : (entry as any).drivers;

    const driver = normalizeDriverRecord(driverCandidate);

    if (!driverId || !driver) {
      return;
    }

    normalized.push({
      driverId: String(driverId),
      driver
    });
  });

  return normalized;
}

export async function buildDriverOfDayCast(args: DriverOfDayArgs): Promise<{ payload: CastPayload; defaultPublishAt: string; totalVotes: number }> {
  if (!args?.raceId) {
    throw new Error('Driver of the Day template requires a raceId.');
  }

  const race = await loadRace(args.raceId);

  const { data: votes, error } = await supabaseAdmin
    .from('dotd_votes')
    .select(`
      driver_id,
      drivers (
        id,
        name,
        team,
        number
      )
    `)
    .eq('race_id', args.raceId);

  if (error) {
    throw new Error(`Failed to load Driver of the Day votes: ${error.message ?? error}`);
  }

  const tally = new Map<string, { driver: DriverRecord; votes: number }>();
  let totalVotes = 0;

  const normalizedVotes = normalizeDotdVotes(votes);

  normalizedVotes.forEach((vote) => {
    const existing = tally.get(vote.driverId);
    if (existing) {
      existing.votes += 1;
    } else {
      tally.set(vote.driverId, {
        driver: vote.driver,
        votes: 1
      });
    }
    totalVotes += 1;
  });

  const sorted = Array.from(tally.values())
    .map((entry) => ({
      driver: entry.driver,
      votes: entry.votes,
      percentage: totalVotes ? Math.round((entry.votes / totalVotes) * 100) : 0
    }))
    .sort((a, b) => b.votes - a.votes);

  const context = formatRaceContext(race);
  const lines: string[] = [
    `Driver of the Day - ${race.name}`,
  ];

  if (context) {
    lines.push(context);
  }

  if (!sorted.length) {
    lines.push('No votes recorded yet. Keep the picks coming!');
  } else {
    sorted.slice(0, 3).forEach((entry, index) => {
    lines.push(summarizeDriver(entry.driver, index, entry.votes, entry.percentage));
    });
    lines.push(`Total votes: ${totalVotes}`);
  }

  lines.push('#GridGuessr #F1');

  const payload: CastPayload = {
    text: truncate(lines.join('\n')),
    embeds: [{ url: raceLink(race.id) }],
    channelId: args.channelId ?? null
  };

  return {
    payload,
    defaultPublishAt: computeDriverOfDayPublishAt(race),
    totalVotes
  };
}

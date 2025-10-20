import { supabaseAdmin } from '~/lib/supabase';
import { APP_URL } from '~/lib/constants';

import {
  CAST_TEXT_MAX_LENGTH,
  DEFAULT_DRIVER_OF_DAY_OFFSET_HOURS
} from './constants';
import type {
  CastPayload,
  DriverOfDayArgs,
  LockReminderArgs,
  PredictionConsensusArgs,
  PerfectSlateArgs,
  RaceResultsSummaryArgs,
  CloseCallsArgs,
  LeaderboardUpdateArgs
} from './types';

type TemplateContext = Record<string, string | undefined | null>;

// Default link dropped into every cast embed so users can open the mini app.
const DEFAULT_EMBED_URL = `https://farcaster.xyz/miniapps/nw5lvCQqZ8rd/gridguessr`;

const LOCK_REMINDER_TEMPLATE_LINES = [
  '🚨 Predictions close in {{leadTime}} for {{raceName}}.',
  '',
  'Get your slate in now: pole, podium, safety car, DNF...',
  'Most-picked pole/winner: {{topPole}}/{{topWinner}}…',
  'Go contrarian or ride the wave?',
  '',
  'Set your picks before it\'s too late 👇'
] as const;

const DRIVER_OF_DAY_TEMPLATE_LINES = [
  '🗳️ Driver of the Day - {{raceName}}',
  '',
  'Current leaderboard:',
  '{{leaderboard}}',
  '',
  'Still time to make your voice heard 👇',
  'Tap “Cast Your Vote” in-app.'
] as const;

const PREDICTION_CONSENSUS_TEMPLATE_LINES = {
  pole: [
    '🧠 Prediction Statistics',
    '',
    '📊 {{percentage}}% picking {{driverName}} for pole for the {{raceName}}.',
    '',
    'Going with the crowd or betting against the odds?',
    'Where do you stand? 👇'
  ] as const,
  winner: [
    '🧠 Prediction Statistics',
    '',
    'Most of the grid’s already locked in their picks!',
    '📊 {{percentage}}% have {{driverName}} winning the {{raceName}}.',
    '',
    'What’s your call? 👇',
  ] as const
};

const RACE_RESULTS_TEMPLATE_LINES = [
  '🏁 {{raceName}} - Results are in!',
  '',
  'Real winner: {{winnerName}} 🏆',
  'Top 3 GridGuessr predictors:',
  '{{leaderboard}}',
  '',
  'New standings are live — check your rank 👀'
] as const;

const PERFECT_SLATE_TEMPLATE_LINES = [
  '💯 Perfect Slate Alert!',
  '',
  'Only {{count}} user(s) predicted everything right for the {{raceName}}!',
  '{{list}}',
  '',
  '100 points. Zero misses. Unreal 🔥'
] as const;

const CLOSE_CALLS_TEMPLATE_LINES = [
  '⚙️ Close Calls',
  '',
  'These legends almost pulled off perfection:',
  '{{names}} — all but one.',
  '8/9 correct answers...',
  '',
  'One wrong guess from glory 🫡'
] as const;

const LEADERBOARD_UPDATE_TEMPLATE_LINES = [
  '🏆 Global Leaderboard Update — {{raceName}}',
  '',
  '{{leaderboard}}',
  '',
  'Can anyone catch them next round? 👀'
] as const;

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

interface PredictionRow {
  winner_driver_id?: string | null;
  pole_driver_id?: string | null;
}

function truncate(text: string): string {
  if (text.length <= CAST_TEXT_MAX_LENGTH) {
    return text;
  }
  return `${text.slice(0, CAST_TEXT_MAX_LENGTH - 3)}...`;
}

function formatLeadTime(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) {
    return 'moments';
  }

  const totalMinutes = Math.round(minutes);

  if (totalMinutes >= 48 * 60) {
    const days = Math.floor(totalMinutes / (60 * 24));
    const remainingHours = Math.floor((totalMinutes - days * 60 * 24) / 60);
    return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`;
  }

  if (totalMinutes >= 60) {
    const hours = Math.floor(totalMinutes / 60);
    const remainingMinutes = totalMinutes % 60;
    return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
  }

  return `${totalMinutes}m`;
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

function renderTemplate(lines: readonly string[], context: TemplateContext): string {
  const rendered: string[] = [];

  lines.forEach((templateLine) => {
    if (templateLine.trim().length === 0) {
      rendered.push('');
      return;
    }

    const replaced = templateLine.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
      const value = context[key];
      return value === undefined || value === null ? '' : value;
    });

    const cleaned = replaced.trim();
    if (cleaned.length > 0) {
      rendered.push(cleaned);
    }
  });

  return rendered.join('\n');
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

  let topPoleLabel = '—';
  let topWinnerLabel = '—';
  try {
    const { topPoleName, topWinnerName } = await loadTopPredictionDrivers(race.id);
    if (topPoleName) {
      topPoleLabel = topPoleName;
    }
    if (topWinnerName) {
      topWinnerLabel = topWinnerName;
    }
  } catch (predictionError) {
    console.error('Failed to load top prediction picks:', predictionError);
  }

  const text = truncate(
    renderTemplate(LOCK_REMINDER_TEMPLATE_LINES, {
      raceName: race.name,
      leadTime: formatLeadTime(args.leadMinutes),
      topPole: topPoleLabel,
      topWinner: topWinnerLabel
    })
  );

  return {
    text,
    embeds: [{ url: DEFAULT_EMBED_URL }],
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
  const emoji = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
  const number = driver.number ? `#${driver.number} ` : '';
  const team = driver.team ? ` (${driver.team})` : '';
  return `${emoji} ${number}${driver.name}${team} — ${percentage}% (${votes})`;
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

function normalizeUserName(candidate: any): string | null {
  if (!candidate || typeof candidate !== 'object') {
    return null;
  }

  const displayName = candidate.display_name ?? candidate.displayName;
  if (typeof displayName === 'string' && displayName.trim().length) {
    return displayName.trim();
  }

  const username = candidate.username ?? candidate.user_name;
  if (typeof username === 'string' && username.trim().length) {
    return username.trim();
  }

  return null;
}

function evaluateBaseCategories(prediction: any, results: any): { score: number; correctCount: number } {
  if (!results) {
    return { score: 0, correctCount: 0 };
  }

  let score = 0;
  let correctCount = 0;

  if (prediction?.pole_driver_id && prediction.pole_driver_id === results.pole_driver_id) {
    score += 15;
    correctCount += 1;
  }
  if (prediction?.winner_driver_id && prediction.winner_driver_id === results.winner_driver_id) {
    score += 15;
    correctCount += 1;
  }
  if (prediction?.second_driver_id && prediction.second_driver_id === results.second_driver_id) {
    score += 10;
    correctCount += 1;
  }
  if (prediction?.third_driver_id && prediction.third_driver_id === results.third_driver_id) {
    score += 10;
    correctCount += 1;
  }
  if (prediction?.fastest_lap_driver_id && prediction.fastest_lap_driver_id === results.fastest_lap_driver_id) {
    score += 10;
    correctCount += 1;
  }
  if (prediction?.fastest_pit_team_id && prediction.fastest_pit_team_id === results.fastest_pit_team_id) {
    score += 10;
    correctCount += 1;
  }

  if (results.no_dnf) {
    if (prediction?.no_dnf) {
      score += 10;
      correctCount += 1;
    }
  } else if (!results.no_dnf && prediction?.first_dnf_driver_id && prediction.first_dnf_driver_id === results.first_dnf_driver_id) {
    score += 10;
    correctCount += 1;
  }

  if (typeof prediction?.safety_car === 'boolean' && prediction.safety_car === results.safety_car) {
    score += 10;
    correctCount += 1;
  }

  if (prediction?.winning_margin && prediction.winning_margin === results.winning_margin) {
    score += 10;
    correctCount += 1;
  }

  return { score, correctCount };
}

function pickTopId(counts: Map<string, number>): string | null {
  let topId: string | null = null;
  let topCount = 0;

  counts.forEach((count, id) => {
    if (count > topCount || (count === topCount && topId === null)) {
      topId = id;
      topCount = count;
    }
  });

  return topId && topCount > 0 ? topId : null;
}

async function loadTopPredictionDrivers(raceId: string): Promise<{ topPoleName: string | null; topWinnerName: string | null }> {
  const { data, error } = await supabaseAdmin
    .from('predictions')
    .select('pole_driver_id, winner_driver_id')
    .eq('race_id', raceId);

  if (error) {
    throw new Error(`Failed to load prediction picks: ${error.message ?? error}`);
  }

  const poleCounts = new Map<string, number>();
  const winnerCounts = new Map<string, number>();

  (data as PredictionRow[] | null)?.forEach((prediction) => {
    const poleId = prediction.pole_driver_id;
    if (poleId) {
      const key = String(poleId);
      poleCounts.set(key, (poleCounts.get(key) ?? 0) + 1);
    }

    const winnerId = prediction.winner_driver_id;
    if (winnerId) {
      const key = String(winnerId);
      winnerCounts.set(key, (winnerCounts.get(key) ?? 0) + 1);
    }
  });

  const topPoleId = pickTopId(poleCounts);
  const topWinnerId = pickTopId(winnerCounts);

  const uniqueDriverIds = Array.from(new Set([topPoleId, topWinnerId].filter((value): value is string => Boolean(value))));
  if (!uniqueDriverIds.length) {
    return { topPoleName: null, topWinnerName: null };
  }

  const { data: driverRows, error: driverError } = await supabaseAdmin
    .from('drivers')
    .select('id, name')
    .in('id', uniqueDriverIds);

  if (driverError) {
    throw new Error(`Failed to load driver details: ${driverError.message ?? driverError}`);
  }

  const driverNameMap = new Map<string, string>();
  driverRows?.forEach((driver: any) => {
    if (driver?.id && driver?.name) {
      driverNameMap.set(String(driver.id), String(driver.name));
    }
  });

  return {
    topPoleName: topPoleId ? driverNameMap.get(topPoleId) ?? null : null,
    topWinnerName: topWinnerId ? driverNameMap.get(topWinnerId) ?? null : null
  };
}

interface ConsensusResult {
  driverId: string | null;
  driverName: string | null;
  percentage: number;
}

async function loadConsensus(raceId: string, field: 'pole_driver_id' | 'winner_driver_id'): Promise<ConsensusResult> {
  const { data, error } = await supabaseAdmin
    .from('predictions')
    .select(field)
    .eq('race_id', raceId);

  if (error) {
    throw new Error(`Failed to load prediction consensus: ${error.message ?? error}`);
  }

  const counts = new Map<string, number>();
  let total = 0;

  (data as PredictionRow[] | null)?.forEach((row) => {
    const value = row?.[field as keyof PredictionRow] as string | null | undefined;
    if (value) {
      const key = String(value);
      counts.set(key, (counts.get(key) ?? 0) + 1);
      total += 1;
    }
  });

  if (total === 0 || counts.size === 0) {
    return { driverId: null, driverName: null, percentage: 0 };
  }

  const topId = pickTopId(counts);

  if (!topId) {
    return { driverId: null, driverName: null, percentage: 0 };
  }

  const percentage = Math.round(((counts.get(topId) ?? 0) / total) * 100);

  const { data: driverData, error: driverError } = await supabaseAdmin
    .from('drivers')
    .select('id, name')
    .eq('id', topId)
    .maybeSingle();

  if (driverError) {
    throw new Error(`Failed to load driver ${topId}: ${driverError.message ?? driverError}`);
  }

  const driverName = driverData?.name ? String(driverData.name) : null;

  return {
    driverId: topId,
    driverName,
    percentage
  };
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

  const leaderboardText = sorted.length
    ? sorted
        .slice(0, 3)
        .map((entry, index) => summarizeDriver(entry.driver, index, entry.votes, entry.percentage))
        .join('\n')
    : 'No votes recorded yet. Keep the picks coming!';

  const totalVotesLine = totalVotes ? `Total votes: ${totalVotes}` : '';

  const payload: CastPayload = {
    text: truncate(
      renderTemplate(DRIVER_OF_DAY_TEMPLATE_LINES, {
        raceName: race.name,
        raceContext: context,
        leaderboard: leaderboardText,
        totalVotesLine
      })
    ),
    embeds: [{ url: DEFAULT_EMBED_URL }],
    channelId: args.channelId ?? null
  };

  return {
    payload,
    defaultPublishAt: computeDriverOfDayPublishAt(race),
    totalVotes
  };
}

export async function buildPredictionConsensusCast(args: PredictionConsensusArgs): Promise<CastPayload> {
  if (!args?.raceId) {
    throw new Error('Prediction consensus template requires a raceId.');
  }

  const race = await loadRace(args.raceId);
  const result = await loadConsensus(args.raceId, args.category === 'pole' ? 'pole_driver_id' : 'winner_driver_id');

  if (!result.driverName || result.percentage === 0) {
    throw new Error('Not enough picks yet to calculate consensus.');
  }

  const lines = args.category === 'pole'
    ? PREDICTION_CONSENSUS_TEMPLATE_LINES.pole
    : PREDICTION_CONSENSUS_TEMPLATE_LINES.winner;

  const text = truncate(
    renderTemplate(lines, {
      percentage: String(result.percentage),
      driverName: result.driverName,
      raceName: race.name,
      oppositePercentage: String(100 - result.percentage)
    })
  );

  return {
    text,
    embeds: [{ url: DEFAULT_EMBED_URL }],
    channelId: args.channelId ?? null
  };
}

async function loadRaceWinnerName(raceId: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from('race_results')
    .select('winner_driver_id')
    .eq('race_id', raceId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load race results: ${error.message ?? error}`);
  }

  const winnerDriverId = data?.winner_driver_id;
  if (!winnerDriverId) {
    return null;
  }

  const { data: driverRow, error: driverError } = await supabaseAdmin
    .from('drivers')
    .select('name, number, team')
    .eq('id', winnerDriverId)
    .maybeSingle();

  if (driverError) {
    throw new Error(`Failed to load winner driver ${winnerDriverId}: ${driverError.message ?? driverError}`);
  }

  if (!driverRow?.name) {
    return null;
  }

  const number = driverRow.number ? `#${driverRow.number} ` : '';
  const team = driverRow.team ? ` (${driverRow.team})` : '';
  return `${number}${driverRow.name}${team}`.trim();
}

async function loadUserNameMap(userIds: string[]): Promise<Map<string, { displayName: string; username: string }>> {
  const map = new Map<string, { displayName: string; username: string }>();
  if (!userIds.length) {
    return map;
  }

  const { data, error } = await supabaseAdmin
    .from('users')
    .select('id, display_name, username')
    .in('id', Array.from(new Set(userIds)));

  if (error) {
    throw new Error(`Failed to load user names: ${error.message ?? error}`);
  }

  (data ?? []).forEach((user) => {
    const displayName = normalizeUserName(user) ?? (typeof user.id === 'string' ? user.id : '');
    const username = (user.username ?? user.display_name ?? user.id ?? '').trim();
    if (displayName && username) {
      map.set(String(user.id), { displayName, username });
    }
  });

  return map;
}

function formatUserMention(displayName: string, username: string): string {
  return `${displayName} (@${username})`;
}

function formatLeaderboard(entries: Array<{ displayName: string; username: string; score: number }>): string {
  if (!entries.length) {
    return 'No predictions have been scored yet.';
  }

  return entries
    .map((entry, index) => {
      const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
      const userMention = formatUserMention(entry.displayName, entry.username);
      return `${medal} ${userMention} — ${Math.round(entry.score)} pts`;
    })
    .join('\n');
}

export async function buildRaceResultsSummaryCast(args: RaceResultsSummaryArgs): Promise<CastPayload> {
  if (!args?.raceId) {
    throw new Error('Race results template requires a raceId.');
  }

  const race = await loadRace(args.raceId);
  const winnerName = await loadRaceWinnerName(race.id);

  const { data: predictionRows, error: predictionsError } = await supabaseAdmin
    .from('predictions')
    .select('user_id, score')
    .eq('race_id', race.id)
    .not('score', 'is', null)
    .order('score', { ascending: false })
    .order('user_id', { ascending: true })
    .limit(3);

  if (predictionsError) {
    throw new Error(`Failed to load race predictions: ${predictionsError.message ?? predictionsError}`);
  }

  const scoredEntries = (predictionRows ?? []).filter(
    (row): row is { user_id: string; score: number } =>
      typeof row?.user_id === 'string' && typeof row?.score === 'number'
  );

  if (!scoredEntries.length) {
    throw new Error('No scored predictions found for this race.');
  }

  const userIds = scoredEntries.map((row) => row.user_id);
  const userNameMap = await loadUserNameMap(userIds);

  const leaderboardEntries = scoredEntries.map((row) => {
    const userData = userNameMap.get(row.user_id);
    return {
      displayName: userData?.displayName ?? row.user_id,
      username: userData?.username ?? row.user_id,
      score: row.score
    };
  });

  const leaderboard = formatLeaderboard(leaderboardEntries);

  const text = truncate(
    renderTemplate(RACE_RESULTS_TEMPLATE_LINES, {
      raceName: race.name,
      winnerName: winnerName ?? '—',
      leaderboard
    })
  );

  return {
    text,
    embeds: [{ url: DEFAULT_EMBED_URL }],
    channelId: args.channelId ?? null
  };
}

export async function buildPerfectSlateCast(args: PerfectSlateArgs): Promise<{ payload: CastPayload; perfectCount: number; displayedUsers: string[] }> {
  if (!args?.raceId) {
    throw new Error('Perfect slate template requires a raceId.');
  }

  const race = await loadRace(args.raceId);

  const { data: predictionRows, error: predictionsError } = await supabaseAdmin
    .from('predictions')
    .select('user_id, score')
    .eq('race_id', race.id)
    .eq('score', 110);

  if (predictionsError) {
    throw new Error(`Failed to load perfect slate predictions: ${predictionsError.message ?? predictionsError}`);
  }

  const perfectRows = (predictionRows ?? []).filter(
    (row): row is { user_id: string; score: number } =>
      typeof row?.user_id === 'string' && typeof row?.score === 'number'
  );

  if (!perfectRows.length) {
    throw new Error('No perfect slates recorded for this race.');
  }

  const userIds = perfectRows.map((row) => row.user_id);
  const userNameMap = await loadUserNameMap(userIds);

  const sortedUsers = perfectRows
    .map((row) => {
      const userData = userNameMap.get(row.user_id);
      return {
        displayName: userData?.displayName ?? row.user_id,
        username: userData?.username ?? row.user_id
      };
    })
    .sort((a, b) => a.displayName.localeCompare(b.displayName, undefined, { sensitivity: 'base' }));

  const DISPLAY_LIMIT = 5;
  const displayedUsers = sortedUsers.slice(0, DISPLAY_LIMIT);
  let list = displayedUsers.map((user) => `🏁 ${formatUserMention(user.displayName, user.username)}`).join('\n');

  if (sortedUsers.length > DISPLAY_LIMIT) {
    const remaining = sortedUsers.length - DISPLAY_LIMIT;
    list = `${list}\n…and ${remaining} more`;
  }

  const text = truncate(
    renderTemplate(PERFECT_SLATE_TEMPLATE_LINES, {
      raceName: race.name,
      count: String(sortedUsers.length),
      list
    })
  );

  return {
    payload: {
      text,
      embeds: [{ url: DEFAULT_EMBED_URL }],
      channelId: args.channelId ?? null
    },
    perfectCount: sortedUsers.length,
    displayedUsers: displayedUsers.map(u => u.displayName)
  };
}

export async function buildCloseCallsCast(args: CloseCallsArgs): Promise<{ payload: CastPayload; closeCount: number; displayedUsers: string[] }> {
  if (!args?.raceId) {
    throw new Error('Close calls template requires a raceId.');
  }

  const race = await loadRace(args.raceId);

  const { data: resultsRow, error: resultsError } = await supabaseAdmin
    .from('race_results')
    .select('pole_driver_id, winner_driver_id, second_driver_id, third_driver_id, fastest_lap_driver_id, fastest_pit_team_id, first_dnf_driver_id, no_dnf, safety_car, winning_margin')
    .eq('race_id', race.id)
    .maybeSingle();

  if (resultsError) {
    throw new Error(`Failed to load race results: ${resultsError.message ?? resultsError}`);
  }

  if (!resultsRow) {
    throw new Error('Race results not recorded yet.');
  }

  const { data: predictionRows, error: predictionsError } = await supabaseAdmin
    .from('predictions')
    .select('user_id, pole_driver_id, winner_driver_id, second_driver_id, third_driver_id, fastest_lap_driver_id, fastest_pit_team_id, first_dnf_driver_id, no_dnf, safety_car, winning_margin, wildcard_answer, score')
    .eq('race_id', race.id);

  if (predictionsError) {
    throw new Error(`Failed to load predictions: ${predictionsError.message ?? predictionsError}`);
  }

  const candidates = (predictionRows ?? []).filter((row) => typeof row?.user_id === 'string').map((row) => {
    const evaluation = evaluateBaseCategories(row, resultsRow);
    return {
      userId: String(row!.user_id),
      baseCorrectCount: evaluation.correctCount,
      score: typeof row?.score === 'number' ? row.score : 0
    };
  });

  const closeCalls = candidates.filter((entry) => entry.baseCorrectCount === 8);

  if (!closeCalls.length) {
    throw new Error('No near-perfect predictions to highlight.');
  }

  const userIds = closeCalls.map((entry) => entry.userId);
  const userNameMap = await loadUserNameMap(userIds);

  const sorted = closeCalls
    .map((entry) => {
      const userData = userNameMap.get(entry.userId);
      return {
        displayName: userData?.displayName ?? entry.userId,
        username: userData?.username ?? entry.userId,
        score: entry.score
      };
    })
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

  const DISPLAY_LIMIT = 3;
  const displayedUsers = sorted.slice(0, DISPLAY_LIMIT);
  const formattedNames = displayedUsers.map((entry) => formatUserMention(entry.displayName, entry.username));

  const namesLine =
    formattedNames.length === 0
      ? ''
      : formattedNames.join(', ') +
        (sorted.length > DISPLAY_LIMIT ? `, +${sorted.length - DISPLAY_LIMIT} more` : '');

  const text = truncate(
    renderTemplate(CLOSE_CALLS_TEMPLATE_LINES, {
      names: namesLine || '—'
    })
  );

  return {
    payload: {
      text,
      embeds: [{ url: DEFAULT_EMBED_URL }],
      channelId: args.channelId ?? null
    },
    closeCount: closeCalls.length,
    displayedUsers: displayedUsers.map(u => u.displayName)
  };
}

export async function buildLeaderboardUpdateCast(args: LeaderboardUpdateArgs): Promise<CastPayload> {
  if (!args?.raceId) {
    throw new Error('Leaderboard update template requires a raceId.');
  }

  const race = await loadRace(args.raceId);

  const { data: leaderboardRows, error } = await supabaseAdmin
    .from('users')
    .select('display_name, username, total_points')
    .order('total_points', { ascending: false })
    .limit(3);

  if (error) {
    throw new Error(`Failed to load leaderboard: ${error.message ?? error}`);
  }

  const topEntries = (leaderboardRows ?? [])
    .map((row, index) => {
      const displayName = normalizeUserName(row) ?? 'Player';
      const username = row?.username ?? displayName;
      const points = typeof row?.total_points === 'number' ? row.total_points : 0;
      const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : '🥉';
      const userMention = formatUserMention(displayName, username);
      return `${medal} ${userMention} — ${points} pts`;
    });

  if (!topEntries.length) {
    throw new Error('Leaderboard is empty.');
  }

  const text = truncate(
    renderTemplate(LEADERBOARD_UPDATE_TEMPLATE_LINES, {
      raceName: race.name,
      leaderboard: topEntries.join('\n')
    })
  );

  return {
    text,
    embeds: [{ url: DEFAULT_EMBED_URL }],
    channelId: args.channelId ?? null
  };
}

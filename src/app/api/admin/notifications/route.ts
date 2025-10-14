import { NextRequest, NextResponse } from 'next/server';

import { authenticateAdmin } from '~/lib/auth';
import {
  publishFrameNotifications,
  type FrameNotificationFilters,
  type FrameNotificationTarget
} from '~/lib/farcaster';
import { supabaseAdmin } from '~/lib/supabase';
import { APP_URL } from '~/lib/constants';

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

function parseInteger(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value)) {
    return value > 0 ? value : null;
  }
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value.trim(), 10);
    if (Number.isInteger(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return null;
}

function parseNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number.parseFloat(value.trim());
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

function parseFidArray(value: unknown): number[] | undefined {
  if (Array.isArray(value)) {
    const normalized = value
      .map((candidate) => parseInteger(candidate))
      .filter((candidate): candidate is number => candidate !== null);
    return normalized.length > 0 ? normalized : [];
  }

  if (typeof value === 'string') {
    const normalized = value
      .split(/[,\s]+/)
      .map((candidate) => parseInteger(candidate))
      .filter((candidate): candidate is number => candidate !== null);
    return normalized.length > 0 ? normalized : [];
  }

  return undefined;
}

function parseFilters(value: unknown): FrameNotificationFilters | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const filtersValue = value as Record<string, unknown>;
  const filters: FrameNotificationFilters = {};

  const excludeFids = parseFidArray(filtersValue.excludeFids ?? filtersValue.exclude_fids);
  if (excludeFids) {
    filters.excludeFids = excludeFids;
  }

  const followingFid = parseInteger(filtersValue.followingFid ?? filtersValue.following_fid);
  if (followingFid !== null) {
    filters.followingFid = followingFid;
  }

  const minimumUserScore = parseNumber(filtersValue.minimumUserScore ?? filtersValue.minimum_user_score);
  if (minimumUserScore !== null) {
    filters.minimumUserScore = minimumUserScore;
  }

  const nearLocationValue =
    (filtersValue.nearLocation as Record<string, unknown> | undefined) ??
    (filtersValue.near_location as Record<string, unknown> | undefined);

  if (nearLocationValue) {
    const latitude = parseNumber(nearLocationValue.latitude);
    const longitude = parseNumber(nearLocationValue.longitude);
    const radius = parseNumber(nearLocationValue.radius);

    if (latitude !== null && longitude !== null) {
      filters.nearLocation = {
        latitude,
        longitude,
        ...(radius !== null ? { radius } : {})
      };
    }
  }

  return Object.keys(filters).length > 0 ? filters : undefined;
}

function parseNotification(body: any): FrameNotificationTarget {
  const candidate = body?.notification ?? {};

  const title =
    typeof candidate.title === 'string' ? candidate.title :
    typeof body?.title === 'string' ? body.title : '';

  const messageBody =
    typeof candidate.body === 'string' ? candidate.body :
    typeof body?.body === 'string' ? body.body : '';

  const targetUrl =
    typeof candidate.targetUrl === 'string' ? candidate.targetUrl :
    typeof candidate.target_url === 'string' ? candidate.target_url :
    typeof body?.targetUrl === 'string' ? body.targetUrl :
    typeof body?.target_url === 'string' ? body.target_url :
    undefined;

  return {
    title,
    body: messageBody,
    targetUrl
  };
}

async function resolveNextPredictionRace(): Promise<{ id: string; name: string; lock_time: string } | null> {
  const nowIso = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from('races')
    .select('id, name, lock_time')
    .in('status', ['upcoming', 'locked'])
    .gte('lock_time', nowIso)
    .order('lock_time', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to resolve next prediction race: ${error.message ?? error}`);
  }

  return data ?? null;
}

async function resolveLatestCompletedRace(): Promise<{ id: string; name: string } | null> {
  const { data, error } = await supabaseAdmin
    .from('races')
    .select('id, name')
    .eq('status', 'completed')
    .order('race_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to resolve latest completed race: ${error.message ?? error}`);
  }

  return data ?? null;
}

async function fetchUsersWithoutPrediction(raceId: string): Promise<number[]> {
  const { data: predictions, error: predictionsError } = await supabaseAdmin
    .from('predictions')
    .select('user_id')
    .eq('race_id', raceId);

  if (predictionsError) {
    throw new Error(`Failed to load predictions for race ${raceId}: ${predictionsError.message ?? predictionsError}`);
  }

  const predictedUserIds = new Set<string>(
    (predictions ?? [])
      .map((row) => row?.user_id)
      .filter((userId): userId is string => typeof userId === 'string' && userId.length > 0)
  );

  const { data: users, error: usersError } = await supabaseAdmin
    .from('users')
    .select('id, fid')
    .gt('fid', 0);

  if (usersError) {
    throw new Error(`Failed to load users for notification targeting: ${usersError.message ?? usersError}`);
  }

  return (users ?? [])
    .filter((user) => {
      if (!user) return false;
      if (predictedUserIds.has(user.id)) return false;
      return typeof user.fid === 'number' && Number.isInteger(user.fid) && user.fid > 0;
    })
    .map((user) => user.fid as number);
}

function computeLockLeadLabel(lockTimeIso: string): { hours: number; label: string } {
  const lockTimestamp = new Date(lockTimeIso).getTime();
  if (!Number.isFinite(lockTimestamp)) {
    return { hours: 0, label: '0h' };
  }
  const diffMs = lockTimestamp - Date.now();
  if (!Number.isFinite(diffMs) || diffMs <= 0) {
    return { hours: 0, label: '0h' };
  }
  const hours = Math.max(1, Math.round(diffMs / 3600000));
  return { hours, label: `${hours}h` };
}

export async function POST(request: NextRequest) {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
  }

  if (!isAuthorized(body, request)) {
    return unauthorizedResponse();
  }

  const actionRaw = typeof body?.action === 'string' ? body.action.trim() : '';
  const action = actionRaw.length > 0 ? actionRaw : 'manual-notification';

  try {
    switch (action) {
      case 'manual':
      case 'manual-notification': {
        const notification = parseNotification(body);

        if (!notification.title || !notification.title.trim()) {
          return NextResponse.json({ error: 'Notification title is required.' }, { status: 400 });
        }

        if (!notification.body || !notification.body.trim()) {
          return NextResponse.json({ error: 'Notification body is required.' }, { status: 400 });
        }

        const targetFids = parseFidArray(body?.targetFids ?? body?.target_fids) ?? [];
        const filters = parseFilters(body?.filters);
        const campaignIdRaw =
          typeof body?.campaignId === 'string' ? body.campaignId :
          typeof body?.campaign_id === 'string' ? body.campaign_id :
          undefined;
        const campaignId = campaignIdRaw?.trim() ? campaignIdRaw.trim() : undefined;

        const result = await publishFrameNotifications({
          notification,
          targetFids,
          filters,
          campaignId
        });

        return NextResponse.json({
          success: true,
          dryRun: result.dryRun,
          result: result.raw
        });
      }

      case 'race-lock-reminder': {
        let race: { id: string; name: string; lock_time: string } | null = null;

        if (typeof body?.raceId === 'string' && body.raceId.trim().length > 0) {
          const { data, error } = await supabaseAdmin
            .from('races')
            .select('id, name, lock_time')
            .eq('id', body.raceId.trim())
            .maybeSingle();

          if (error) {
            throw new Error(`Failed to load race ${body.raceId.trim()} for lock notification: ${error.message ?? error}`);
          }

          race = data ?? null;
        } else {
          race = await resolveNextPredictionRace();
        }

        if (!race?.id) {
          return NextResponse.json(
            { error: 'No upcoming race found for lock notifications.' },
            { status: 404 }
          );
        }

        const { hours, label } = computeLockLeadLabel(race.lock_time);

        if (hours <= 0) {
          return NextResponse.json(
            { error: 'Race lock has already passed for the next race.' },
            { status: 409 }
          );
        }

        const targetFids = await fetchUsersWithoutPrediction(race.id);

        if (!targetFids.length) {
          return NextResponse.json(
            { error: `No eligible users without predictions for ${race.name}.` },
            { status: 409 }
          );
        }

        const result = await publishFrameNotifications({
          notification: {
            title: `Race lock in ${label}`,
            body: `Predictions close in ${label} for ${race.name}. Pole, podium, FL, safety car—lock your slate now.`,
            targetUrl: APP_URL
          },
          targetFids,
          campaignId: `lock-reminder-${race.id}-${hours}h`
        });

        return NextResponse.json({
          success: true,
          dryRun: result.dryRun,
          result: result.raw,
          raceId: race.id,
          targetFidCount: targetFids.length,
          hours
        });
      }

      case 'race-results-broadcast': {
        let race: { id: string; name: string } | null = null;

        if (typeof body?.raceId === 'string' && body.raceId.trim().length > 0) {
          const { data, error } = await supabaseAdmin
            .from('races')
            .select('id, name')
            .eq('id', body.raceId.trim())
            .maybeSingle();

          if (error) {
            throw new Error(`Failed to load race ${body.raceId.trim()} for results notification: ${error.message ?? error}`);
          }

          race = data ?? null;
        } else {
          race = await resolveLatestCompletedRace();
        }

        if (!race?.id) {
          return NextResponse.json(
            { error: 'No completed race found for results notification.' },
            { status: 404 }
          );
        }

        const result = await publishFrameNotifications({
          notification: {
            title: `${race.name} results & scores live`,
            body: 'Scores posted. Check your score and vote for the Driver of the Day!',
            targetUrl: APP_URL
          },
          campaignId: `results-live-${race.id}`
        });

        return NextResponse.json({
          success: true,
          dryRun: result.dryRun,
          result: result.raw,
          raceId: race.id
        });
      }

      default:
        return NextResponse.json(
          { error: `Unsupported notification action: ${action}` },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('Failed to publish frame notifications:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to publish notifications.'
      },
      { status: 500 }
    );
  }
}

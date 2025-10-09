import { NextRequest, NextResponse } from 'next/server';

import { authenticateAdmin } from '~/lib/auth';
import {
  publishFrameNotifications,
  type FrameNotificationFilters,
  type FrameNotificationTarget
} from '~/lib/farcaster';

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

  const notification = parseNotification(body);

  if (!notification.title || !notification.title.trim()) {
    return NextResponse.json({ error: 'Notification title is required.' }, { status: 400 });
  }

  if (!notification.body || !notification.body.trim()) {
    return NextResponse.json({ error: 'Notification body is required.' }, { status: 400 });
  }

  const targetFids = parseFidArray(body?.targetFids ?? body?.target_fids);
  const filters = parseFilters(body?.filters);
  const campaignIdRaw =
    typeof body?.campaignId === 'string' ? body.campaignId :
    typeof body?.campaign_id === 'string' ? body.campaign_id :
    undefined;
  const campaignId = campaignIdRaw?.trim() ? campaignIdRaw.trim() : undefined;

  try {
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

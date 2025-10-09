import { NextRequest, NextResponse } from 'next/server';

import { authenticateAdmin } from '~/lib/auth';
import { FARCASTER_CAST_JOBS_TABLE } from '~/lib/farcaster';
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

type RawJob = {
  id: string;
  template: string;
  payload_args: Record<string, unknown> | null;
  job_key: string | null;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  scheduled_for: string;
  attempt_count: number | null;
  last_attempt_at: string | null;
  completed_at: string | null;
  channel_id: string | null;
  last_error: string | null;
  response_body: Record<string, unknown> | null;
  created_at: string | null;
  updated_at: string | null;
};

function mapJob(job: RawJob) {
  return {
    id: job.id,
    template: job.template,
    payloadArgs: job.payload_args ?? {},
    jobKey: job.job_key ?? undefined,
    status: job.status,
    scheduledFor: job.scheduled_for,
    attemptCount: job.attempt_count ?? 0,
    lastAttemptAt: job.last_attempt_at ?? undefined,
    completedAt: job.completed_at ?? undefined,
    channelId: job.channel_id ?? undefined,
    lastError: job.last_error ?? undefined,
    responseBody: job.response_body ?? undefined,
    createdAt: job.created_at ?? undefined,
    updatedAt: job.updated_at ?? undefined
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (!isAuthorized(body, request)) {
      return unauthorizedResponse();
    }

    const limitCandidate = Number.parseInt(body?.limit ?? '50', 10);
    const limit = Number.isFinite(limitCandidate) && limitCandidate > 0 && limitCandidate <= 200
      ? limitCandidate
      : 50;

    const statusFilter = typeof body?.status === 'string' ? body.status : null;
    const onlyUpcoming = body?.upcoming === true || body?.upcoming === 'true';

    let query = supabaseAdmin
      .from(FARCASTER_CAST_JOBS_TABLE)
      .select('*')
      .order('scheduled_for', { ascending: true })
      .limit(limit);

    if (statusFilter) {
      query = query.eq('status', statusFilter);
    }

    if (onlyUpcoming) {
      query = query.gte('scheduled_for', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
    }

    const { data, error } = await query;

    if (error) {
      throw error;
    }

    const jobs = (data as RawJob[]).map(mapJob);

    return NextResponse.json({ jobs });
  } catch (error) {
    console.error('Failed to load Farcaster jobs:', error);
    return NextResponse.json(
      { error: 'Failed to load Farcaster job queue.' },
      { status: 500 }
    );
  }
}

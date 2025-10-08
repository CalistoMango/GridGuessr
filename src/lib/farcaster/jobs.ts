import { supabaseAdmin } from '~/lib/supabase';

import {
  FARCASTER_CAST_JOBS_TABLE,
  FARCASTER_MAX_ATTEMPTS,
  LOCK_REMINDER_OFFSETS_MINUTES
} from './constants';
import { postCast } from './client';
import {
  type CastJobRecord,
  type CastDispatchResult,
  type CastTemplate,
  type CreateCastJobInput,
  type DriverOfDayArgs,
  type LockReminderArgs
} from './types';
import {
  buildDriverOfDayCast,
  buildLockReminderCast
} from './templates';

type SupabaseRow = {
  id: string;
  template: CastTemplate;
  payload_args: Record<string, unknown>;
  job_key?: string | null;
  status: CastJobRecord['status'];
  scheduled_for: string;
  attempt_count: number;
  last_attempt_at?: string | null;
  completed_at?: string | null;
  channel_id?: string | null;
  last_error?: string | null;
  response_body?: Record<string, unknown> | null;
  created_at?: string;
  updated_at?: string;
};

function stableSerialize(value: unknown): string {
  if (value === null || value === undefined) {
    return 'null';
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }
  if (typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableSerialize).join(',')}]`;
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([key, val]) => `${JSON.stringify(key)}:${stableSerialize(val)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function computeJobKey(template: CastTemplate, payloadArgs: Record<string, unknown>): string {
  return `${template}:${stableSerialize(payloadArgs)}`;
}

function mapRow(row: SupabaseRow): CastJobRecord {
  return {
    id: row.id,
    template: row.template,
    payloadArgs: row.payload_args ?? {},
    jobKey: row.job_key ?? undefined,
    status: row.status,
    scheduledFor: row.scheduled_for,
    attemptCount: row.attempt_count ?? 0,
    lastAttemptAt: row.last_attempt_at ?? undefined,
    completedAt: row.completed_at ?? undefined,
    channelId: row.channel_id ?? undefined,
    lastError: row.last_error ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    responseBody: row.response_body ?? undefined
  };
}

function normalizedNow() {
  return new Date().toISOString();
}

async function fetchJobByKey(jobKey: string, status?: CastJobRecord['status']) {
  let query = supabaseAdmin
    .from(FARCASTER_CAST_JOBS_TABLE)
    .select('*')
    .eq('job_key', jobKey);

  if (status) {
    query = query.eq('status', status);
  }

  const { data, error } = await query.maybeSingle();

  if (error && error.code !== 'PGRST116') {
    throw error;
  }

  return data ? mapRow(data as unknown as SupabaseRow) : null;
}

async function insertJob(input: CreateCastJobInput & { jobKey: string }): Promise<CastJobRecord> {
  const payload = {
    template: input.template,
    payload_args: input.payloadArgs,
    job_key: input.jobKey,
    status: 'pending' as const,
    scheduled_for: input.scheduledFor,
    channel_id: input.channelId ?? null
  };

  const { data, error } = await supabaseAdmin
    .from(FARCASTER_CAST_JOBS_TABLE)
    .insert(payload)
    .select()
    .single();

  if (error) {
    throw error;
  }

  return mapRow(data as unknown as SupabaseRow);
}

async function updateJobById(id: string, updates: Record<string, unknown>): Promise<CastJobRecord | null> {
  const { data, error } = await supabaseAdmin
    .from(FARCASTER_CAST_JOBS_TABLE)
    .update(updates)
    .eq('id', id)
    .select()
    .maybeSingle();

  if (error && error.code !== 'PGRST116') {
    throw error;
  }

  return data ? mapRow(data as unknown as SupabaseRow) : null;
}

async function ensureScheduledJob(input: CreateCastJobInput): Promise<CastJobRecord> {
  const jobKey = input.jobKey ?? computeJobKey(input.template, input.payloadArgs);
  const nowIso = normalizedNow();
  const scheduledFor = new Date(input.scheduledFor);
  const scheduledIso = Number.isNaN(scheduledFor.getTime()) ? nowIso : scheduledFor.toISOString();

  const existing = await fetchJobByKey(jobKey);

  if (!existing) {
    return insertJob({
      ...input,
      jobKey,
      scheduledFor: scheduledIso
    });
  }

  if (existing.status === 'completed') {
    return existing;
  }

  const updates: Record<string, unknown> = {
    scheduled_for: scheduledIso,
    channel_id: input.channelId ?? existing.channelId ?? null
  };

  if (existing.status === 'failed') {
    updates.status = 'pending';
    updates.last_error = null;
  }

  const updated = await updateJobById(existing.id, updates);
  return updated ?? existing;
}

export async function ensureLockReminderJobsForRace(params: {
  raceId: string;
  lockTime: string;
  leadOffsets?: number[];
  channelId?: string | null;
}) {
  const lockDate = new Date(params.lockTime);
  if (Number.isNaN(lockDate.getTime())) {
    throw new Error(`Invalid lock time for race ${params.raceId}`);
  }

  const now = Date.now();
  const offsets = params.leadOffsets?.length ? params.leadOffsets : LOCK_REMINDER_OFFSETS_MINUTES;

  for (const minutes of offsets) {
    const triggerAt = new Date(lockDate.getTime() - minutes * 60 * 1000);
    const scheduledFor = triggerAt.getTime() < now ? new Date(now + 5_000).toISOString() : triggerAt.toISOString();

    await ensureScheduledJob({
      template: 'race-lock-reminder',
      payloadArgs: {
        raceId: params.raceId,
        leadMinutes: minutes
      },
      scheduledFor,
      channelId: params.channelId ?? null
    });
  }
}

export async function ensureDriverOfDaySummaryJob(params: DriverOfDayArgs & { raceDate?: string | null; lockTime?: string }) {
  const publishAt = params.publishAt ?? (() => {
    if (params.lockTime) {
      const lock = new Date(params.lockTime);
      lock.setUTCDate(lock.getUTCDate() + 4);
      lock.setUTCHours(18, 0, 0, 0);
      return lock.toISOString();
    }
    if (params.raceDate) {
      const raceDate = new Date(params.raceDate);
      raceDate.setUTCDate(raceDate.getUTCDate() + 4);
      raceDate.setUTCHours(18, 0, 0, 0);
      return raceDate.toISOString();
    }
    return new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();
  })();

  await ensureScheduledJob({
    template: 'driver-of-day-summary',
    payloadArgs: { raceId: params.raceId },
    scheduledFor: publishAt,
    channelId: params.channelId ?? null
  });
}

export async function fetchDueCastJobs(nowIso: string, limit = 20): Promise<CastJobRecord[]> {
  const { data, error } = await supabaseAdmin
    .from(FARCASTER_CAST_JOBS_TABLE)
    .select('*')
    .lte('scheduled_for', nowIso)
    .eq('status', 'pending')
    .order('scheduled_for', { ascending: true })
    .limit(limit);

  if (error) {
    throw error;
  }

  return (data as unknown as SupabaseRow[]).map(mapRow);
}

export async function claimCastJob(job: CastJobRecord): Promise<CastJobRecord | null> {
  const { data, error } = await supabaseAdmin
    .from(FARCASTER_CAST_JOBS_TABLE)
    .update({
      status: 'processing',
      last_attempt_at: normalizedNow(),
      attempt_count: job.attemptCount + 1
    })
    .eq('id', job.id)
    .eq('status', 'pending')
    .select()
    .maybeSingle();

  if (error && error.code !== 'PGRST116') {
    throw error;
  }

  return data ? mapRow(data as unknown as SupabaseRow) : null;
}

export async function markJobCompleted(jobId: string, response: Record<string, unknown> | undefined) {
  await supabaseAdmin
    .from(FARCASTER_CAST_JOBS_TABLE)
    .update({
      status: 'completed',
      completed_at: normalizedNow(),
      response_body: response ?? null,
      last_error: null
    })
    .eq('id', jobId);
}

function computeBackoffMillis(attemptCount: number): number {
  const base = 5 * 60 * 1000; // 5 minutes
  const cappedAttempt = Math.min(attemptCount, FARCASTER_MAX_ATTEMPTS);
  return base * Math.pow(2, cappedAttempt - 1);
}

export async function markJobFailure(job: CastJobRecord, error: Error | string) {
  const message = typeof error === 'string' ? error : error.message ?? 'Unknown error';
  const shouldRetry = job.attemptCount < FARCASTER_MAX_ATTEMPTS;
  const updates: Record<string, unknown> = {
    status: shouldRetry ? 'pending' : 'failed',
    last_error: message
  };

  if (shouldRetry) {
    const delay = computeBackoffMillis(job.attemptCount);
    updates.scheduled_for = new Date(Date.now() + delay).toISOString();
  }

  await supabaseAdmin
    .from(FARCASTER_CAST_JOBS_TABLE)
    .update(updates)
    .eq('id', job.id);
}

function coerceLockArgs(args: Record<string, unknown>, channelId?: string | null): LockReminderArgs {
  const raceId = typeof args.raceId === 'string' ? args.raceId : String(args.raceId);
  const leadRaw = typeof args.leadMinutes === 'string' ? parseInt(args.leadMinutes, 10) : args.leadMinutes;
  const leadMinutes = Number.isFinite(leadRaw) ? Number(leadRaw) : NaN;

  if (!raceId || Number.isNaN(leadMinutes)) {
    throw new Error('Invalid lock reminder payload arguments.');
  }

  return {
    raceId,
    leadMinutes,
    channelId: (typeof args.channelId === 'string' ? args.channelId : channelId) ?? null
  };
}

function coerceDriverOfDayArgs(args: Record<string, unknown>, channelId?: string | null): DriverOfDayArgs {
  const raceId = typeof args.raceId === 'string' ? args.raceId : String(args.raceId);
  if (!raceId) {
    throw new Error('Invalid Driver of the Day payload arguments.');
  }

  return {
    raceId,
    channelId: (typeof args.channelId === 'string' ? args.channelId : channelId) ?? null
  };
}

export async function dispatchCastJob(job: CastJobRecord): Promise<CastDispatchResult> {
  try {
    let payload;

    switch (job.template) {
      case 'race-lock-reminder': {
        const args = coerceLockArgs(job.payloadArgs, job.channelId);
        payload = await buildLockReminderCast(args);
        break;
      }
      case 'driver-of-day-summary': {
        const args = coerceDriverOfDayArgs(job.payloadArgs, job.channelId);
        const { payload: dotdPayload, totalVotes } = await buildDriverOfDayCast(args);

        if (!totalVotes) {
          // No votes yet - skip to allow reschedule later in the week.
          await markJobFailure(job, 'No Driver of the Day votes yet.');
          return {
            jobId: job.id,
            status: 'skipped',
            error: 'No Driver of the Day votes yet.'
          };
        }

        payload = dotdPayload;
        break;
      }
      case 'custom':
        throw new Error('Custom cast jobs must provide a handler.');
      default:
        throw new Error(`Unsupported cast template: ${job.template}`);
    }

    // Respect any channel override defined on the job record.
    if (job.channelId && !payload.channelId) {
      payload = { ...payload, channelId: job.channelId };
    }

    const response = await postCast(payload);
    await markJobCompleted(job.id, response.raw);

    return {
      jobId: job.id,
      status: 'sent',
      response: response.raw
    };
  } catch (error) {
    await markJobFailure(job, error instanceof Error ? error : new Error(String(error)));
    return {
      jobId: job.id,
      status: 'failed',
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

export type CastTemplate =
  | 'race-lock-reminder'
  | 'driver-of-day-summary'
  | 'custom';

export interface CastEmbed {
  url: string;
}

export interface CastPayload {
  text: string;
  embeds?: CastEmbed[];
  channelId?: string | null;
}

export interface CastJobRecord {
  id: string;
  template: CastTemplate;
  payloadArgs: Record<string, unknown>;
  jobKey?: string | null;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  scheduledFor: string;
  attemptCount: number;
  lastAttemptAt?: string | null;
  completedAt?: string | null;
  channelId?: string | null;
  lastError?: string | null;
  createdAt?: string;
  updatedAt?: string;
  responseBody?: Record<string, unknown> | null;
}

export interface CreateCastJobInput {
  template: CastTemplate;
  payloadArgs: Record<string, unknown>;
  scheduledFor: string;
  channelId?: string | null;
  jobKey?: string;
}

export interface ClaimCastJobResult {
  job: CastJobRecord;
}

export interface CastDispatchResult {
  jobId: string;
  status: 'sent' | 'skipped' | 'failed';
  error?: string;
  response?: Record<string, unknown>;
}

export interface LockReminderArgs {
  raceId: string;
  leadMinutes: number;
  channelId?: string | null;
}

export interface DriverOfDayArgs {
  raceId: string;
  publishAt?: string;
  channelId?: string | null;
}

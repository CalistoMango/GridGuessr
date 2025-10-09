/**
 * Shared admin types used across tabs so every section speaks the same language.
 */

export interface Driver {
  id: string;
  name: string;
  team: string;
  number: string;
}

export interface Team {
  id: string;
  name: string;
}

export interface Race {
  id: string;
  name: string;
  circuit: string;
  country: string;
  race_date: string;
  lock_time: string;
  status: string;
  season: number;
  round: number;
  wildcard_question?: string;
}

export interface AdminCredential {
  fid?: number;
  password?: string;
}

export type AdminMessage = { type: 'success' | 'error'; text: string };

export interface CastJob {
  id: string;
  template: string;
  payloadArgs: Record<string, unknown>;
  jobKey?: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  scheduledFor: string;
  attemptCount: number;
  lastAttemptAt?: string;
  completedAt?: string;
  channelId?: string;
  lastError?: string;
  responseBody?: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
}

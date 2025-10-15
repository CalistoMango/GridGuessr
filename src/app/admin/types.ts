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

export type BonusEventType = 'sprint' | 'open' | 'winter';
export type BonusEventStatus = 'draft' | 'scheduled' | 'open' | 'locked' | 'scored' | 'archived';
export type BonusResponseType = 'choice_driver' | 'choice_team' | 'choice_custom';

export interface AdminBonusOption {
  id: string;
  label: string;
  order: number;
  driverId?: string | null;
  teamId?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface AdminBonusQuestion {
  id: string;
  prompt: string;
  responseType: BonusResponseType;
  maxSelections: number;
  points: number;
  order: number;
  correctOptionIds?: string[] | null;
  options: AdminBonusOption[];
  createdAt?: string;
  updatedAt?: string;
}

export interface AdminBonusEvent {
  id: string;
  type: BonusEventType;
  status: BonusEventStatus;
  title: string;
  description?: string | null;
  raceId?: string | null;
  opensAt: string;
  locksAt: string;
  publishedAt?: string | null;
  pointsMultiplier: number;
  createdAt?: string;
  updatedAt?: string;
  participantCount?: number;
  questions: AdminBonusQuestion[];
}

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

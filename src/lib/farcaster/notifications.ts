import { APP_URL } from '~/lib/constants';

const NEYNAR_NOTIFICATIONS_ENDPOINT = 'https://api.neynar.com/v2/farcaster/frame/notifications';

function getEnv(name: string): string | undefined {
  const value = process.env[name];
  if (typeof value === 'string' && value.trim().length > 0) {
    return value;
  }
  return undefined;
}

function resolveApiKey(): string {
  const key =
    getEnv('FARCASTER_API_KEY') ??
    getEnv('NEYNAR_API_KEY');

  if (!key) {
    throw new Error('Missing Neynar API key. Set FARCASTER_API_KEY or NEYNAR_API_KEY.');
  }
  return key;
}

function resolveClientId(): string {
  const clientId =
    getEnv('FARCASTER_CLIENT_ID') ??
    getEnv('NEYNAR_CLIENT_ID');

  if (!clientId) {
    throw new Error('Missing Neynar client ID. Set FARCASTER_CLIENT_ID or NEYNAR_CLIENT_ID.');
  }

  return clientId;
}

function shouldDryRun(explicit?: boolean): boolean {
  if (typeof explicit === 'boolean') return explicit;
  const env = getEnv('FARCASTER_DRY_RUN') ?? getEnv('NEYNAR_DRY_RUN');
  return env === 'true' || env === '1';
}

export type FrameNotificationTarget = {
  title: string;
  body: string;
  targetUrl?: string;
};

export type FrameNotificationFilters = {
  excludeFids?: number[];
  followingFid?: number;
  minimumUserScore?: number;
  nearLocation?: {
    latitude: number;
    longitude: number;
    radius?: number;
  };
};

export interface PublishFrameNotificationsOptions {
  notification: FrameNotificationTarget;
  targetFids?: number[];
  filters?: FrameNotificationFilters;
  campaignId?: string;
  dryRun?: boolean;
}

export interface PublishFrameNotificationsResult {
  dryRun: boolean;
  raw: Record<string, unknown>;
}

function buildFiltersPayload(filters?: FrameNotificationFilters): Record<string, unknown> | undefined {
  if (!filters) return undefined;

  const payload: Record<string, unknown> = {};

  if (Array.isArray(filters.excludeFids) && filters.excludeFids.length > 0) {
    payload.exclude_fids = filters.excludeFids;
  }

  if (typeof filters.followingFid === 'number' && Number.isFinite(filters.followingFid)) {
    payload.following_fid = filters.followingFid;
  }

  if (typeof filters.minimumUserScore === 'number' && Number.isFinite(filters.minimumUserScore)) {
    payload.minimum_user_score = filters.minimumUserScore;
  }

  if (filters.nearLocation) {
    const { latitude, longitude, radius } = filters.nearLocation;
    if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
      const nearLocationPayload: Record<string, number> = {
        latitude,
        longitude
      };
      if (typeof radius === 'number' && Number.isFinite(radius)) {
        nearLocationPayload.radius = radius;
      }
      payload.near_location = nearLocationPayload;
    }
  }

  return Object.keys(payload).length > 0 ? payload : undefined;
}

function sanitizeTargetFids(targetFids?: number[]): number[] | undefined {
  if (!targetFids) return undefined;
  const normalized = targetFids.filter((fid) => Number.isInteger(fid) && fid > 0);
  return normalized.length > 0 ? normalized : undefined;
}

export async function publishFrameNotifications(
  options: PublishFrameNotificationsOptions
): Promise<PublishFrameNotificationsResult> {
  if (!options?.notification?.title || !options.notification.title.trim()) {
    throw new Error('Notification title is required.');
  }
  if (!options?.notification?.body || !options.notification.body.trim()) {
    throw new Error('Notification body is required.');
  }

  const apiKey = resolveApiKey();
  const clientId = resolveClientId();
  const dryRun = shouldDryRun(options?.dryRun);

  const targetUrl = options.notification.targetUrl?.trim() || APP_URL;
  if (!targetUrl) {
    throw new Error('Unable to determine notification target URL.');
  }

  const targetFids = sanitizeTargetFids(options.targetFids);
  const filtersPayload = buildFiltersPayload(options.filters);

  const requestBody: Record<string, unknown> = {
    client_id: clientId,
    notification: {
      title: options.notification.title.trim(),
      body: options.notification.body.trim(),
      target_url: targetUrl
    }
  };

  if (targetFids) {
    requestBody.target_fids = targetFids;
  }

  if (filtersPayload) {
    requestBody.filters = filtersPayload;
  }

  if (options.campaignId && options.campaignId.trim()) {
    requestBody.campaign_id = options.campaignId.trim();
  }

  if (dryRun) {
    return {
      dryRun: true,
      raw: {
        dryRun: true,
        request: requestBody
      }
    };
  }

  const response = await fetch(NEYNAR_NOTIFICATIONS_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey
    },
    body: JSON.stringify(requestBody)
  });

  const raw = (await response.json()) as Record<string, unknown>;

  if (!response.ok) {
    const message = typeof raw?.message === 'string' ? raw.message : JSON.stringify(raw);
    throw new Error(`Failed to publish notifications (${response.status}): ${message}`);
  }

  return {
    dryRun: false,
    raw
  };
}

import { CAST_TEXT_MAX_LENGTH } from './constants';
import type { CastPayload } from './types';

const NEYNAR_BASE_URL = 'https://api.neynar.com/v2/farcaster';

export interface PostCastOptions {
  dryRun?: boolean;
  signerUuid?: string;
  channelId?: string | null;
}

export interface PostCastResponse {
  hash?: string;
  url?: string;
  raw: Record<string, unknown>;
}

function getEnv(name: string): string | undefined {
  const value = process.env[name];
  if (typeof value === 'string' && value.trim().length > 0) {
    return value;
  }
  return undefined;
}

function resolveSignerUuid(explicit?: string): string {
  const fromArgs = explicit?.trim();
  if (fromArgs) return fromArgs;

  const fromEnv =
    getEnv('FARCASTER_SIGNER_UUID') ??
    getEnv('FARCASTER_NEYNAR_SIGNER_UUID') ??
    getEnv('NEYNAR_SIGNER_UUID');

  if (!fromEnv) {
    throw new Error('Missing Farcaster signer UUID. Set FARCASTER_SIGNER_UUID or NEYNAR_SIGNER_UUID.');
  }
  return fromEnv;
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

function determineChannelId(payloadChannelId?: string | null, override?: string | null): string | undefined {
  const explicit = override ?? payloadChannelId ?? null;
  if (explicit && explicit.trim().length > 0) {
    return explicit;
  }
  const fromEnv =
    getEnv('FARCASTER_DEFAULT_CHANNEL_ID') ??
    getEnv('NEYNAR_DEFAULT_CHANNEL_ID');

  return fromEnv;
}

function shouldDryRun(explicit?: boolean): boolean {
  if (typeof explicit === 'boolean') return explicit;
  const env = getEnv('FARCASTER_DRY_RUN');
  return env === 'true' || env === '1';
}

function validatePayload(payload: CastPayload) {
  if (!payload?.text || typeof payload.text !== 'string') {
    throw new Error('Cast payload requires text.');
  }
  if (payload.text.length > CAST_TEXT_MAX_LENGTH) {
    throw new Error(`Cast text exceeds ${CAST_TEXT_MAX_LENGTH} characters.`);
  }
}

export async function postCast(
  payload: CastPayload,
  options?: PostCastOptions
): Promise<PostCastResponse> {
  validatePayload(payload);

  const dryRun = shouldDryRun(options?.dryRun);
  const signerUuid = resolveSignerUuid(options?.signerUuid);
  const channelId = determineChannelId(payload.channelId, options?.channelId ?? null);

  if (dryRun) {
    return {
      raw: {
        dryRun: true,
        payload: {
          text: payload.text,
          embeds: payload.embeds ?? [],
          signer_uuid: signerUuid,
          channel_id: channelId
        }
      }
    };
  }

  const apiKey = resolveApiKey();
  const endpoint = `${NEYNAR_BASE_URL}/cast/`;

  const body: Record<string, unknown> = {
    text: payload.text,
    signer_uuid: signerUuid
  };

  if (payload.embeds?.length) {
    body.embeds = payload.embeds;
  }
  if (channelId) {
    body.channel_id = channelId;
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey
    },
    body: JSON.stringify(body)
  });

  const raw = (await response.json()) as Record<string, unknown>;

  if (!response.ok) {
    const message = typeof raw?.message === 'string' ? raw.message : JSON.stringify(raw);
    throw new Error(`Farcaster cast failed (${response.status}): ${message}`);
  }

  return {
    hash: typeof raw?.hash === 'string' ? raw.hash : undefined,
    url: typeof raw?.cast_url === 'string' ? raw.cast_url : undefined,
    raw
  };
}

const ADMIN_FIDS = (process.env.ADMIN_FIDS ?? process.env.ADMIN_FID_1 ?? '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean)
  .map((value) => Number.parseInt(value, 10))
  .filter((value) => Number.isInteger(value));

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

function parseFid(candidate: unknown): number | null {
  if (typeof candidate === 'number' && Number.isInteger(candidate)) {
    return candidate;
  }

  if (typeof candidate === 'string') {
    const trimmed = candidate.trim();
    if (!trimmed) return null;
    const parsed = Number.parseInt(trimmed, 10);
    return Number.isNaN(parsed) ? null : parsed;
  }

  return null;
}

export function isAdminFid(fid: number | null | undefined): boolean {
  if (fid === null || fid === undefined) return false;
  return ADMIN_FIDS.includes(fid);
}

export function isValidAdminPassword(password: string | null | undefined): boolean {
  if (!ADMIN_PASSWORD) return false;
  return typeof password === 'string' && password === ADMIN_PASSWORD;
}

export type AdminAuthResult = {
  authenticated: boolean;
  method?: 'fid' | 'password';
};

export type AdminAuthPayload = {
  fid?: unknown;
  adminFid?: unknown;
  password?: unknown;
  adminPassword?: unknown;
  token?: unknown;
};

export function authenticateAdmin(payload: AdminAuthPayload): AdminAuthResult {
  const fidCandidate = parseFid(payload.adminFid ?? payload.fid);
  if (fidCandidate !== null && isAdminFid(fidCandidate)) {
    return { authenticated: true, method: 'fid' };
  }

  const tokenCandidate = parseFid(payload.token);
  if (tokenCandidate !== null && isAdminFid(tokenCandidate)) {
    return { authenticated: true, method: 'fid' };
  }

  const passwordCandidate = ((): string | undefined => {
    if (typeof payload.password === 'string') return payload.password;
    if (typeof payload.adminPassword === 'string') return payload.adminPassword;
    if (typeof payload.token === 'string') return payload.token;
    return undefined;
  })();

  if (passwordCandidate && isValidAdminPassword(passwordCandidate)) {
    return { authenticated: true, method: 'password' };
  }

  return { authenticated: false };
}

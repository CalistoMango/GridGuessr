import { NextRequest, NextResponse } from 'next/server';
import { supabase, supabaseAdmin } from '~/lib/supabase';

interface NeynarUser {
  fid: number;
  username?: string;
  displayName?: string;
  custodyAddress?: string;
  pfp?: {
    url?: string;
  };
}

interface ProfileInfo {
  username?: string;
  display_name?: string;
  pfp_url?: string;
}

/**
 * Cached friend FIDs that already have GridGuessr accounts.
 * Storing just the FIDs keeps the cache payload lightweight.
 */
interface CachedFriendFids {
  friendFids: number[];
  expiresAt: number;
}

/**
 * In-memory cache keyed by the viewer's fid.
 * We mirror this in Supabase so the cache survives across server restarts.
 */
const FRIENDS_FOLLOW_CACHE = new Map<string, CachedFriendFids>();

// --- Neynar follow fetch tuning ---
const FOLLOW_CACHE_TTL_MS = 60 * 60 * 1000; // 60 minutes cache window
const FOLLOW_PAGE_LIMIT = 100;
const FOLLOW_TOTAL_CAP = 300;
const FOLLOW_CACHE_TABLE = 'friends_follow_cache';

function isProfileInfo(value: any): value is ProfileInfo {
  return value && typeof value === 'object' && ('display_name' in value || 'pfp_url' in value || 'username' in value);
}

function isNeynarUser(value: any): value is NeynarUser {
  return value && typeof value === 'object' && 'fid' in value;
}

async function fetchProfilesFromNeynar(fids: number[]): Promise<Map<number, NeynarUser>> {
  const apiKey = process.env.NEYNAR_API_KEY;
  const result = new Map<number, NeynarUser>();
  if (!apiKey || !fids.length) return result;

  const unique = Array.from(new Set(fids.filter((fid) => Number.isFinite(fid))));
  const chunkSize = 150;

  try {
    for (let i = 0; i < unique.length; i += chunkSize) {
      const chunk = unique.slice(i, i + chunkSize);
      const url = new URL('https://api.neynar.com/v2/farcaster/user/bulk');
      url.searchParams.set('fids', chunk.join(','));

      const response = await fetch(url, {
        headers: {
          accept: 'application/json',
          'api-key': apiKey
        }
      });

      if (!response.ok) {
        console.error('Failed to fetch Neynar profiles', await response.text());
        continue;
      }

      const data = await response.json();
      const users: NeynarUser[] = data?.users || data?.result?.users || [];
      users.forEach((user) => {
        if (user?.fid) {
          result.set(user.fid, user);
        }
      });
    }
  } catch (error) {
    console.error('Error fetching Neynar profiles:', error);
  }

  return result;
}

/**
 * Paginate through Neynar's following endpoint until we either
 * exhaust the follow list or hit the configured cap.
 */
async function fetchFollowingFromNeynar(fid: string): Promise<NeynarUser[]> {
  const apiKey = process.env.NEYNAR_API_KEY;
  if (!apiKey) return [];

  try {
    const collected: NeynarUser[] = [];
    let cursor: string | undefined;

    while (collected.length < FOLLOW_TOTAL_CAP) {
      const remaining = FOLLOW_TOTAL_CAP - collected.length;
      const url = new URL('https://api.neynar.com/v2/farcaster/following/');
      url.searchParams.set('fid', fid);
      url.searchParams.set('limit', String(Math.min(FOLLOW_PAGE_LIMIT, remaining)));
      if (cursor) {
        url.searchParams.set('cursor', cursor);
      }

      const response = await fetch(url, {
        headers: {
          accept: 'application/json',
          'x-api-key': apiKey,
          'x-neynar-experimental': 'false'
        }
      });

      if (!response.ok) {
        console.error('Failed to fetch Neynar follows', await response.text());
        break;
      }

      const data = await response.json();
      const followEntries: any[] = Array.isArray(data?.users) ? data.users : [];
      followEntries.forEach((entry) => {
        const user: NeynarUser | undefined = entry?.user;
        if (user?.fid) {
          collected.push(user);
        }
      });

      cursor = data?.next?.cursor;
      if (!cursor || followEntries.length === 0) {
        break;
      }
    }

    return collected;
  } catch (error) {
    console.error('Error fetching Neynar follows:', error);
    return [];
  }
}

/**
 * Load the cached friend FIDs for a user from Supabase.
 * Returns null on cache miss or if the cache has expired.
 */
async function loadCachedFriendFids(fid: string): Promise<CachedFriendFids | null> {
  try {
    const { data, error } = await supabaseAdmin
      .from(FOLLOW_CACHE_TABLE)
      .select('friend_fids, expires_at')
      .eq('fid', fid)
      .maybeSingle();

    if (error || !data) {
      if (error && error.code !== 'PGRST116') {
        console.error('Error reading cached follows:', error);
      }
      return null;
    }

    const expiresAt = data.expires_at ? new Date(data.expires_at).getTime() : 0;
    const friendFids = Array.isArray(data.friend_fids) ? (data.friend_fids as number[]) : [];
    return { friendFids, expiresAt };
  } catch (error) {
    console.error('Failed to load cached follows:', error);
    return null;
  }
}

/**
 * Upsert the filtered friend FID list and expiry timestamp into Supabase.
 */
async function persistCachedFriendFids(fid: string, friendFids: number[], expiresAt: number) {
  try {
    const payload = {
      fid,
      friend_fids: friendFids,
      expires_at: new Date(expiresAt).toISOString()
    };

    const { error } = await supabaseAdmin
      .from(FOLLOW_CACHE_TABLE)
      .upsert(payload, { onConflict: 'fid' });

    if (error) {
      console.error('Failed to persist cached follows:', error);
    }
  } catch (error) {
    console.error('Unexpected error persisting cached follows:', error);
  }
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const type = searchParams.get('type') || 'global'; // global or friends
    const fid = searchParams.get('fid');
    const limit = parseInt(searchParams.get('limit') || '100');

    if (type === 'friends' && !fid) {
      return NextResponse.json(
        { error: 'FID required for friends leaderboard' },
        { status: 400 }
      );
    }

    let leaderboardData: any[] = [];

    if (type === 'global') {
      // Get global leaderboard
      const { data, error } = await supabase
        .from('users')
        .select('fid, username, display_name, pfp_url, total_points, perfect_slates')
        .order('total_points', { ascending: false })
        .limit(limit);

      if (error) throw error;
      leaderboardData = data || [];

      if (leaderboardData.length) {
        const missingProfiles = leaderboardData
          .filter((entry) => !entry.display_name && !entry.username)
          .map((entry) => entry.fid);

        const neynarProfileMap = await fetchProfilesFromNeynar(missingProfiles);

        leaderboardData = leaderboardData.map((entry) => {
          const profile = neynarProfileMap.get(entry.fid);
          if (!profile) return entry;

          const fallbackUsername = profile.username || '';
          const displayName = profile.displayName || fallbackUsername;
          const pfpUrl = profile.pfp?.url || '';

          return {
            ...entry,
            username: entry.username || fallbackUsername,
            display_name: entry.display_name || displayName,
            pfp_url: entry.pfp_url || pfpUrl
          };
        });
      }
    } else if (type === 'friends') {
      const fidNumber = parseInt(fid!, 10);
      if (Number.isNaN(fidNumber)) {
        return NextResponse.json({ leaderboard: [] });
      }

      const neynarProfiles = new Map<number, ProfileInfo>();
      const now = Date.now();
      let cachedFriends: CachedFriendFids | null = FRIENDS_FOLLOW_CACHE.get(fid!) ?? null;
      if (!cachedFriends || cachedFriends.expiresAt <= now) {
        const persistent = await loadCachedFriendFids(fid!);
        if (persistent && persistent.expiresAt > now) {
          cachedFriends = persistent;
          FRIENDS_FOLLOW_CACHE.set(fid!, persistent);
        } else {
          cachedFriends = null;
        }
      }

      let activeFriendFids: number[] = cachedFriends?.friendFids ?? [];
      let supabaseData: any[] = [];

      if (!cachedFriends) {
        const neynarUsers = await fetchFollowingFromNeynar(fid!);
        const followedFids = new Set<number>();

        // Keep supabase lookups lean by only tracking friends with app accounts.
        neynarUsers.forEach((user) => {
          if (!user?.fid) return;
          followedFids.add(user.fid);
          neynarProfiles.set(user.fid, {
            username: user.username,
            display_name: user.displayName,
            pfp_url: user.pfp?.url
          });
        });

        const followedFidsArray = Array.from(followedFids);
        const queryFids = followedFidsArray.length ? [...followedFidsArray, fidNumber] : [fidNumber];

        const { data, error } = await supabase
          .from('users')
          .select('fid, username, display_name, pfp_url, total_points, perfect_slates')
          .in('fid', queryFids);

        if (error) throw error;

        supabaseData = data || [];
        activeFriendFids = supabaseData.map((user) => user.fid).filter((friendFid) => friendFid !== fidNumber);

        const expiresAt = now + FOLLOW_CACHE_TTL_MS;
        const cachePayload: CachedFriendFids = { friendFids: activeFriendFids, expiresAt };
        FRIENDS_FOLLOW_CACHE.set(fid!, cachePayload);
        await persistCachedFriendFids(fid!, activeFriendFids, expiresAt);
      } else {
        // Cache hit: only fetch the latest scores for the cached set.
        const queryFids = activeFriendFids.length ? [...activeFriendFids, fidNumber] : [fidNumber];
        const { data, error } = await supabase
          .from('users')
          .select('fid, username, display_name, pfp_url, total_points, perfect_slates')
          .in('fid', queryFids);

        if (error) throw error;

        supabaseData = data || [];
      }

      const supabaseProfiles = new Map<number, any>();
      supabaseData.forEach((user) => {
        supabaseProfiles.set(user.fid, user);
      });

      // Always include the viewing user so they can see their own rank among friends.
      const leaderboardFids = Array.from(
        new Set([fidNumber, ...activeFriendFids.filter((friendFid) => friendFid !== fidNumber)])
      );

      if (!leaderboardFids.length) {
        return NextResponse.json({ leaderboard: [] });
      }

      const neynarProfileMap = await fetchProfilesFromNeynar(activeFriendFids);
      neynarProfileMap.forEach((profile, key) => {
        const existing = neynarProfiles.get(key) || {};
        neynarProfiles.set(key, {
          username: existing.username || profile.username,
          display_name: existing.display_name || profile.displayName,
          pfp_url: existing.pfp_url || profile.pfp?.url
        } as ProfileInfo);
      });

      const combined = leaderboardFids.map((entryFid) => {
        const supa = supabaseProfiles.get(entryFid);
        const neynarProfile = neynarProfiles.get(entryFid) || neynarProfileMap.get(entryFid);

        let profileUsername = '';
        let profileDisplayName = '';
        let profilePfp = '';

        if (isProfileInfo(neynarProfile)) {
          profileUsername = neynarProfile.username || '';
          profileDisplayName = neynarProfile.display_name || profileUsername;
          profilePfp = neynarProfile.pfp_url || '';
        } else if (isNeynarUser(neynarProfile)) {
          profileUsername = neynarProfile.username || '';
          profileDisplayName = neynarProfile.displayName || neynarProfile.username || '';
          profilePfp = neynarProfile.pfp?.url || '';
        }

        return {
          fid: entryFid,
          username: supa?.username ?? profileUsername ?? '',
          display_name: supa?.display_name ?? profileDisplayName ?? '',
          pfp_url: supa?.pfp_url ?? profilePfp ?? '',
          total_points: supa?.total_points ?? 0,
          perfect_slates: supa?.perfect_slates ?? 0
        };
      });

      combined.sort((a, b) => {
        if (b.total_points !== a.total_points) return (b.total_points ?? 0) - (a.total_points ?? 0);
        return (a.display_name || a.username || '').localeCompare(b.display_name || b.username || '');
      });

      leaderboardData = combined;
    }

    // Add ranks
    const leaderboard = leaderboardData.map((user, index) => ({
      ...user,
      rank: index + 1
    }));

    return NextResponse.json({ leaderboard });
  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    return NextResponse.json(
      { error: 'Failed to fetch leaderboard' },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '~/lib/supabase';

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

async function fetchFollowingFromNeynar(fid: string): Promise<NeynarUser[]> {
  const apiKey = process.env.NEYNAR_API_KEY;
  if (!apiKey) return [];

  try {
    const url = new URL('https://api.neynar.com/v2/farcaster/user/follows');
    url.searchParams.set('fid', fid);
    url.searchParams.set('direction', 'following');
    url.searchParams.set('limit', '1500');

    const response = await fetch(url, {
      headers: {
        'accept': 'application/json',
        'api-key': apiKey
      }
    });

    if (!response.ok) {
      console.error('Failed to fetch Neynar follows', await response.text());
      return [];
    }

    const data = await response.json();
    const users: NeynarUser[] = data?.result?.users || data?.users || [];
    return users;
  } catch (error) {
    console.error('Error fetching Neynar follows:', error);
    return [];
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

      // Fetch following list from Neynar when possible
      const neynarUsers = await fetchFollowingFromNeynar(fid!);
      const neynarProfiles = new Map<number, ProfileInfo>();
      const friendFids = new Set<number>();

      neynarUsers.forEach((user) => {
        if (!user?.fid) return;
        friendFids.add(user.fid);
        neynarProfiles.set(user.fid, {
          username: user.username,
          display_name: user.displayName,
          pfp_url: user.pfp?.url
        });
      });

      // Always include the requesting user
      friendFids.add(fidNumber);

      const friendFidsArray = Array.from(friendFids);

      if (!friendFidsArray.length) {
        return NextResponse.json({ leaderboard: [] });
      }

      const { data, error } = await supabase
        .from('users')
        .select('fid, username, display_name, pfp_url, total_points, perfect_slates')
        .in('fid', friendFidsArray);

      if (error) throw error;

      const supabaseProfiles = new Map<number, any>();
      (data || []).forEach((user) => {
        supabaseProfiles.set(user.fid, user);
      });

      const neynarProfileMap = await fetchProfilesFromNeynar(friendFidsArray);
      neynarProfileMap.forEach((profile, key) => {
        const existing = neynarProfiles.get(key) || {};
        neynarProfiles.set(key, {
          username: existing.username || profile.username,
          display_name: existing.display_name || profile.displayName,
          pfp_url: existing.pfp_url || profile.pfp?.url
        } as ProfileInfo);
      });

      const combined = friendFidsArray.map((friendFid) => {
        const supa = supabaseProfiles.get(friendFid);
        const neynarProfile = neynarProfiles.get(friendFid) || neynarProfileMap.get(friendFid);

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
          fid: friendFid,
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

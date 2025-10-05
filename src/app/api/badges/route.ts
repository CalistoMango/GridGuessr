import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '~/lib/supabase';

// GET - Fetch user's badges with counts
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const fid = searchParams.get('fid');

    if (!fid) {
      return NextResponse.json(
        { error: 'Missing fid' },
        { status: 400 }
      );
    }

    // Get user
    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('fid', parseInt(fid))
      .single();

    if (!user) {
      return NextResponse.json({
        badges: {},
        earnedCount: 0,
        totalCount: 0
      });
    }

    // Get all badges
    const { data: allBadges, error: badgesError } = await supabase
      .from('badges')
      .select('*')
      .order('name');

    if (badgesError) throw badgesError;

    // Get user's earned badges
    const { data: userBadges, error: userBadgesError } = await supabase
      .from('user_badges')
      .select('badge_id, badges(id, name)')
      .eq('user_id', user.id);

    if (userBadgesError) throw userBadgesError;

    // Count earned badges by badge_id
    const badgeCounts: Record<string, number> = {};
    userBadges?.forEach((ub: any) => {
      const badgeId = ub.badge_id;
      badgeCounts[badgeId] = (badgeCounts[badgeId] || 0) + 1;
    });

    // Map badge IDs to badge names
    const badgeIdToName: Record<string, string> = {};
    allBadges?.forEach(badge => {
      badgeIdToName[badge.id] = badge.name;
    });

    // Convert to name-based structure for easier frontend use
    const badgesByName: Record<string, { earned: boolean; count: number }> = {};
    
    allBadges?.forEach(badge => {
      // Convert badge name to camelCase key
      const key = badge.name
        .split(' ')
        .map((word: string, i: number) => 
          i === 0 
            ? word.toLowerCase() 
            : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
        )
        .join('');
      
      badgesByName[key] = {
        earned: badgeCounts[badge.id] > 0,
        count: badgeCounts[badge.id] || 0
      };
    });

    return NextResponse.json({
      badges: badgesByName,
      earnedCount: Object.values(badgeCounts).filter(c => c > 0).length,
      totalCount: allBadges?.length || 0
    });
  } catch (error) {
    console.error('Error fetching badges:', error);
    return NextResponse.json(
      { error: 'Failed to fetch badges' },
      { status: 500 }
    );
  }
}
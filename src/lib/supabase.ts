import { createClient } from '@supabase/supabase-js';

// Client-side Supabase client (uses anon key)
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Server-side Supabase client (uses service role key for admin operations)
export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Database types
export interface User {
  id: string;
  fid: number;
  username?: string;
  display_name?: string;
  pfp_url?: string;
  total_points: number;
  bonus_points?: number | null;
  perfect_slates: number;
  created_at: string;
  updated_at: string;
}

export interface Race {
  id: string;
  name: string;
  circuit: string;
  country?: string;
  race_date: string;
  lock_time: string;
  status: 'upcoming' | 'locked' | 'completed';
  wildcard_question?: string;
  season: number;
  round: number;
  created_at: string;
  updated_at: string;
}

export interface Driver {
  id: string;
  name: string;
  team: string;
  number: string;
  color: string;
  active: boolean;
  created_at: string;
}

export interface Team {
  id: string;
  name: string;
  color: string;
  active: boolean;
  created_at: string;
}

export interface Prediction {
  id: string;
  user_id: string;
  race_id: string;
  pole_driver_id?: string;
  winner_driver_id?: string;
  second_driver_id?: string;
  third_driver_id?: string;
  fastest_lap_driver_id?: string;
  fastest_pit_team_id?: string;
  first_dnf_driver_id?: string;
  no_dnf: boolean;
  safety_car?: boolean;
  winning_margin?: string;
  wildcard_answer?: boolean;
  score?: number;
  scored_at?: string;
  created_at: string;
  updated_at: string;
}

export interface Badge {
  id: string;
  name: string;
  description: string;
  icon: string;
  type: 'prediction' | 'achievement';
  created_at: string;
}

export interface UserBadge {
  id: string;
  user_id: string;
  badge_id: string;
  race_id?: string;
  earned_at: string;
  badge?: Badge;
}

export interface DotdVote {
  id: string;
  race_id: string;
  user_id: string;
  driver_id: string;
  created_at: string;
}

export type BonusPredictionEventType = 'sprint' | 'open' | 'winter';

export type BonusPredictionEventStatus =
  | 'draft'
  | 'scheduled'
  | 'open'
  | 'locked'
  | 'scored'
  | 'archived';

export type BonusPredictionResponseType =
  | 'choice_driver'
  | 'choice_team'
  | 'choice_custom';

export interface BonusPredictionEvent {
  id: string;
  type: BonusPredictionEventType;
  status: BonusPredictionEventStatus;
  title: string;
  description?: string | null;
  race_id?: string | null;
  opens_at: string;
  locks_at: string;
  published_at?: string | null;
  points_multiplier: number;
  created_at: string;
  updated_at: string;
}

export interface BonusPredictionQuestion {
  id: string;
  event_id: string;
  prompt: string;
  response_type: BonusPredictionResponseType;
  max_selections: number;
  points: number;
  order_index: number;
  correct_option_ids?: string[] | null;
  correct_free_text?: string | null;
  created_at: string;
  updated_at: string;
}

export interface BonusPredictionOption {
  id: string;
  question_id: string;
  label: string;
  driver_id?: string | null;
  team_id?: string | null;
  order_index: number;
  created_at: string;
  updated_at: string;
}

export interface BonusPredictionResponse {
  id: string;
  event_id: string;
  question_id: string;
  user_id: string;
  selected_option_ids: string[] | null;
  free_text_answer?: string | null;
  submitted_at: string;
  updated_at: string;
  points_awarded?: number | null;
  scored_at?: string | null;
}

export interface BonusPredictionUserSummary {
  user_id: string;
  event_id: string;
  total_points: number;
  scored_at?: string | null;
}

// Helper functions

/**
 * Get or create a user by FID
 */
export async function getOrCreateUser(fid: number, userData?: Partial<User>): Promise<User | null> {
  try {
    // Try to get existing user
    const { data: existingUser } = await supabase
      .from('users')
      .select('*')
      .eq('fid', fid)
      .single();

    if (existingUser) {
      // Update user data if provided
      if (userData) {
        const { data: updatedUser } = await supabase
          .from('users')
          .update(userData)
          .eq('fid', fid)
          .select()
          .single();
        return updatedUser;
      }
      return existingUser;
    }

    // Create new user
    const { data: newUser, error } = await supabase
      .from('users')
      .insert({
        fid,
        ...userData
      })
      .select()
      .single();

    if (error) throw error;
    return newUser;
  } catch (error) {
    console.error('Error getting/creating user:', error);
    return null;
  }
}

/**
 * Ensure a user exists using the service role client.
 * Creates the user if necessary and returns the record.
 */
export async function ensureUserByFid(fid: number, userData?: Partial<User>): Promise<User | null> {
  try {
    const filteredData = userData
      ? Object.entries(userData).reduce((acc, [key, value]) => {
          if (value !== undefined && value !== null && value !== '') {
            (acc as Record<string, unknown>)[key] = value;
          }
          return acc;
        }, {} as Partial<User>)
      : undefined;

    const { data: existingUser } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('fid', fid)
      .single();

    if (existingUser) {
      if (filteredData && Object.keys(filteredData).length > 0) {
        const { data: updated } = await supabaseAdmin
          .from('users')
          .update(filteredData)
          .eq('fid', fid)
          .select()
          .single();
        return updated ?? existingUser;
      }
      return existingUser;
    }

    const insertPayload = {
      fid,
      ...(filteredData || {})
    };

    const { data: newUser, error } = await supabaseAdmin
      .from('users')
      .insert(insertPayload)
      .select()
      .single();

    if (error) throw error;
    return newUser;
  } catch (error) {
    console.error('Error ensuring user with service role:', error);
    return null;
  }
}

/**
 * Get the current active race
 */
export async function getCurrentRace(): Promise<Race | null> {
  try {
    const { data, error } = await supabase
      .from('races')
      .select('*')
      .in('status', ['upcoming', 'locked'])
      .order('race_date', { ascending: true })
      .limit(1)
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error getting current race:', error);
    return null;
  }
}

/**
 * Get user's prediction for a race
 */
export async function getUserPrediction(userId: string, raceId: string): Promise<Prediction | null> {
  try {
    const { data, error } = await supabase
      .from('predictions')
      .select('*')
      .eq('user_id', userId)
      .eq('race_id', raceId)
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    return null;
  }
}

/**
 * Get global leaderboard
 */
export async function getGlobalLeaderboard(limit: number = 100) {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .order('total_points', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error getting leaderboard:', error);
    return [];
  }
}

/**
 * Get friends leaderboard
 */
export async function getFriendsLeaderboard(userId: string) {
  try {
    const { data: friendships, error: friendshipsError } = await supabase
      .from('friendships')
      .select('friend_fid')
      .eq('user_id', userId);

    if (friendshipsError) throw friendshipsError;

    const friendFids = friendships.map(f => f.friend_fid);
    
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .in('fid', friendFids)
      .order('total_points', { ascending: false });

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error getting friends leaderboard:', error);
    return [];
  }
}

/**
 * Get active drivers
 */
export async function getActiveDrivers(): Promise<Driver[]> {
  try {
    const { data, error } = await supabase
      .from('drivers')
      .select('*')
      .eq('active', true)
      .order('name');

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error getting drivers:', error);
    return [];
  }
}

/**
 * Get active teams
 */
export async function getActiveTeams(): Promise<Team[]> {
  try {
    const { data, error } = await supabase
      .from('teams')
      .select('*')
      .eq('active', true)
      .order('name');

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error getting teams:', error);
    return [];
  }
}

/**
 * Get user's badges
 */
export async function getUserBadges(userId: string): Promise<UserBadge[]> {
  try {
    const { data, error } = await supabase
      .from('user_badges')
      .select('*, badge:badges(*)')
      .eq('user_id', userId)
      .order('earned_at', { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error getting user badges:', error);
    return [];
  }
}

/**
 * Get DOTD votes for a race
 */
export async function getDotdVotes(raceId: string) {
  try {
    const { data, error } = await supabase
      .from('dotd_votes')
      .select('driver_id, count')
      .eq('race_id', raceId);

    if (error) throw error;

    // Aggregate votes
    const voteCounts: Record<string, number> = {};
    data?.forEach((vote: any) => {
      voteCounts[vote.driver_id] = (voteCounts[vote.driver_id] || 0) + 1;
    });

    return voteCounts;
  } catch (error) {
    console.error('Error getting DOTD votes:', error);
    return {};
  }
}

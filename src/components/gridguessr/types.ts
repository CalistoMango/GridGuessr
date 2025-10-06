export interface Driver {
  id: string;
  name: string;
  team: string;
  number: string;
  color: string;
}

export interface Team {
  id: string;
  name: string;
  color: string;
}

export interface Race {
  id: string;
  name: string;
  circuit: string;
  race_date: string;
  lock_time: string;
  status: string;
  wildcard_question?: string;
}

export type PodiumPositions = [Driver | null, Driver | null, Driver | null];

export interface Predictions {
  pole: Driver | null;
  podium: PodiumPositions;
  fastestLap: Driver | null;
  fastestPitStop: Team | null;
  firstDNF: Driver | "none" | null;
  safetyCar: boolean | null;
  winningMargin: string | null;
  wildcard: boolean | null;
}

export type PredictionSetter = <K extends keyof Predictions>(prop: K, value: Predictions[K]) => void;

export type PodiumSetter = (index: number, driver: Driver | null) => void;

export interface LeaderboardEntry {
  fid: string | number;
  rank: number;
  display_name?: string;
  username?: string;
  total_points: number;
  perfect_slates: number;
  pfp_url?: string;
}

export interface BadgeStatus {
  earned: boolean;
  count: number;
}

export type UserBadges = Record<string, BadgeStatus> | null;

export interface DotdVoteEntry {
  driver: Driver;
  votes: number;
  percentage: number;
}

export interface DotdData {
  votes: DotdVoteEntry[];
  totalVotes?: number;
  userVote?: {
    driver: Driver | null;
  } | null;
}

export type ViewState = "home" | "predict" | "leaderboard" | "dotd" | "badges" | "submitted";

export type LeaderboardTab = "global" | "friends";

export type PredictionModalId =
  | "pole"
  | "fastestLap"
  | "fastestPit"
  | "firstDNF"
  | "winningMargin"
  | "podium-0"
  | "podium-1"
  | "podium-2";

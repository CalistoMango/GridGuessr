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

export type BonusEventType = "sprint" | "open" | "winter";

export type BonusResponseType = "choice_driver" | "choice_team" | "choice_custom";

export type BonusEventStatus = "draft" | "scheduled" | "open" | "locked" | "scored" | "archived";

export interface BonusPredictionOption {
  id: string;
  label: string;
  order: number;
  driverId?: string | null;
  teamId?: string | null;
}

export interface BonusPredictionQuestion {
  id: string;
  prompt: string;
  responseType: BonusResponseType;
  maxSelections: number;
  points: number;
  order: number;
  options: BonusPredictionOption[];
  correctOptionIds?: string[] | null;
}

export interface BonusPredictionEvent {
  id: string;
  type: BonusEventType;
  status: BonusEventStatus;
  title: string;
  description?: string | null;
  opensAt: string;
  locksAt: string;
  publishedAt?: string | null;
  pointsMultiplier: number;
  raceId?: string | null;
  questions: BonusPredictionQuestion[];
  totalPointsAwarded?: number;
}

export interface BonusPredictionUserState {
  responses: Record<
    string,
    {
      selectedOptionIds: string[] | null;
      pointsAwarded?: number | null;
    }
  >;
  totalPoints?: number;
  scoredAt?: string | null;
}

export type ViewState = "home" | "predict" | "leaderboard" | "dotd" | "badges" | "submitted" | "bonus" | "results";

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

export type RaceCategoryStatus = "pending" | "correct" | "incorrect" | "missing";

export interface RaceCategoryResult {
  key: string;
  label: string;
  actual: string | null;
  predicted: string | null;
  pointsAvailable: number;
  pointsEarned: number;
  status: RaceCategoryStatus;
}

export interface RaceResultEntry {
  raceId: string;
  name: string;
  circuit: string | null;
  round: number | null;
  raceDate: string | null;
  wildcardQuestion: string | null;
  totalPointsEarned: number;
  categories: RaceCategoryResult[];
}

export type BonusQuestionStatus = "pending" | "correct" | "incorrect" | "missing";

export interface BonusQuestionResult {
  questionId: string;
  prompt: string;
  pointsAvailable: number;
  pointsEarned: number;
  correctOptions: string[];
  userSelections: string[];
  status: BonusQuestionStatus;
}

export interface BonusEventResult {
  eventId: string;
  title: string;
  type: string;
  locksAt: string | null;
  publishedAt: string | null;
  pointsMultiplier: number;
  relatedRaceId: string | null;
  relatedRaceName: string | null;
  totalPointsAvailable: number;
  totalPointsEarned: number;
  questions: BonusQuestionResult[];
}

export interface SeasonResults {
  season: number;
  races: RaceResultEntry[];
  bonusEvents: BonusEventResult[];
}

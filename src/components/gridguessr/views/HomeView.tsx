import React from "react";
import { Sparkles, ThumbsUp, Trophy } from "lucide-react";

import AddMiniAppButton from "~/components/AddMiniAppButton";
import {
  BonusPredictionEvent,
  DotdData,
  DotdVoteEntry,
  LeaderboardEntry,
  Race,
} from "../types";

// Landing screen that highlights the next race, voting teaser, and leaderboard
// snapshot. Keeps copy and CTA wiring separate from the container logic.

interface HomeViewProps {
  displayRace: Race | null;
  lockCountdownText: string;
  lockLocalTimeText: string;
  hasSubmittedSlate: boolean;
  onOpenPredict: () => void;
  onOpenDotd: () => void;
  onOpenLeaderboard: () => void;
  previousRace: Race | null;
  topDotdVote?: DotdVoteEntry;
  dotdData: DotdData | null;
  userLeaderboardEntry: LeaderboardEntry | null;
  currentLeader: LeaderboardEntry | undefined;
  bonusEvent: BonusPredictionEvent | null;
  bonusCompletion: { completed: number; total: number; percentage: number } | null;
  bonusLockText: string | null;
  onOpenBonus: () => void;
  bonusLocked: boolean;
}

const HomeView: React.FC<HomeViewProps> = ({
  displayRace,
  lockCountdownText,
  lockLocalTimeText,
  hasSubmittedSlate,
  onOpenPredict,
  onOpenDotd,
  onOpenLeaderboard,
  previousRace,
  topDotdVote,
  dotdData,
  userLeaderboardEntry,
  currentLeader,
  bonusEvent,
  bonusCompletion,
  bonusLockText,
  onOpenBonus,
  bonusLocked,
}) => {
  return (
    <div className="space-y-6 px-4 pb-8 pt-5 sm:p-6">
      {/* Hero card for upcoming or in-progress race */}
      <div className="rounded-2xl border border-red-500/30 bg-gradient-to-br from-red-600/30 via-red-700/30 to-red-900/50 p-6">
        <p className="text-sm uppercase tracking-[0.3em] text-red-100/80">Next up</p>
        <h2 className="mt-2 text-2xl font-bold text-white sm:text-3xl">{displayRace?.name ?? "TBD"}</h2>
        <p className="text-red-100/90">
          {displayRace?.circuit ? `${displayRace.circuit} • ` : ""}
          {lockCountdownText}
        </p>
        {lockLocalTimeText && (
          <p className="mt-1 text-xs text-red-100/70">Local lock: {lockLocalTimeText}</p>
        )}
        <div className="mt-5 flex flex-col gap-3">
          <button
            onClick={onOpenPredict}
            className="w-full rounded-xl bg-white/15 px-5 py-3 text-center font-semibold text-white transition-all hover:bg-white/25"
          >
            {hasSubmittedSlate ? "View Slate" : "Set Predictions"}
          </button>
        </div>
      </div>

      <AddMiniAppButton />

      {bonusEvent && (
        <div className="rounded-2xl border border-purple-500/40 bg-gradient-to-br from-purple-600/20 via-purple-800/20 to-purple-900/40 p-5">
          <div className="mb-3 flex items-center gap-2 text-sm text-purple-100/80">
            <Sparkles className="h-5 w-5 text-purple-200" />
            <span>Bonus Predictions</span>
          </div>
          <h3 className="text-lg font-semibold text-white">{bonusEvent.title}</h3>
          {bonusEvent.description && (
            <p className="mt-1 text-sm text-purple-100/80">{bonusEvent.description}</p>
          )}
          <p className="mt-2 text-xs text-purple-100/70">
            {bonusLockText ?? "Vote before this bonus locks."}
          </p>
          {bonusCompletion && bonusCompletion.total > 0 && (
            <div className="mt-4">
              <div className="flex items-center justify-between text-xs text-purple-100/80">
                <span>
                  {bonusCompletion.completed}/{bonusCompletion.total} answered
                </span>
                <span>{bonusCompletion.percentage}%</span>
              </div>
              <div className="relative mt-1 h-2 rounded-full bg-purple-900/60">
                <div
                  className="absolute left-0 top-0 h-full rounded-full bg-purple-400 transition-all"
                  style={{ width: `${bonusCompletion.percentage}%` }}
                />
              </div>
            </div>
          )}
          <button
            onClick={onOpenBonus}
            className="mt-4 w-full rounded-lg bg-purple-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-purple-600"
            disabled={bonusLocked}
          >
            {bonusLocked ? "Bonus locked" : "Make Bonus Picks"}
          </button>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {/* Driver of the Day teaser highlights how voting currently looks */}
        <div className="rounded-2xl border border-gray-700 bg-gray-800/90 p-5">
          <div className="mb-4 flex items-center gap-2 text-sm text-gray-400">
            <ThumbsUp className="h-5 w-5 text-blue-300" />
            <span>Driver of the Day</span>
          </div>
          <h3 className="text-lg font-semibold text-white">
            {previousRace ? `Vote for ${previousRace.name}` : "Vote for the standout driver"}
          </h3>
          <p className="mt-1 text-sm text-gray-400">
            {previousRace
              ? topDotdVote
                ? `${topDotdVote.driver.name} leads with ${topDotdVote.percentage}% of ${dotdData?.totalVotes ?? 0} votes.`
                : `Help decide the Farcaster-favorite driver from the ${previousRace.name}.`
              : "Help decide the Farcaster-favorite driver from the last race."}
          </p>
          <button
            onClick={onOpenDotd}
            className="mt-5 w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-blue-700"
          >
            Cast Your Vote
          </button>
        </div>

        {/* Leaderboard teaser encourages users to explore standings */}
        <div className="rounded-2xl border border-gray-700 bg-gray-800/90 p-5">
          <div className="mb-4 flex items-center gap-2 text-sm text-gray-400">
            <Trophy className="h-5 w-5 text-yellow-300" />
            <span>Leaderboard</span>
          </div>
          <h3 className="text-lg font-semibold text-white">Chase the top spot</h3>
          <p className="mt-1 text-sm text-gray-400">
            {userLeaderboardEntry
              ? `You're currently #${userLeaderboardEntry.rank} with ${userLeaderboardEntry.total_points} pts.`
              : currentLeader
              ? `${currentLeader.display_name || currentLeader.username || "Top player"} leads with ${currentLeader.total_points} pts.`
              : "Standings update after each race."}
          </p>
          <button
            onClick={onOpenLeaderboard}
            className="mt-5 w-full rounded-lg border border-yellow-400/60 px-4 py-2 text-sm font-semibold text-yellow-200 transition-all hover:bg-yellow-500 hover:text-gray-900"
          >
            See Standings
          </button>
        </div>
      </div>
    </div>
  );
};

export default HomeView;

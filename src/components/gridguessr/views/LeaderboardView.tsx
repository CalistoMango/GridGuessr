import React from "react";
import { Award, Globe, Share2, Trophy, Users } from "lucide-react";

import { sdk } from "@farcaster/miniapp-sdk";

import { APP_NAME, APP_URL } from "~/lib/constants";
import { LeaderboardEntry, LeaderboardTab } from "../types";

// Dedicated leaderboard view so the main container can just control which tab
// is active. Handles share CTA and both global/friends rendering.

interface LeaderboardViewProps {
  leaderboard: LeaderboardEntry[];
  friendsLeaderboard: LeaderboardEntry[];
  activeTab: LeaderboardTab;
  onTabChange: (tab: LeaderboardTab) => void;
  fid: string | number | null;
  onBackToPredict: () => void;
}

const LeaderboardView: React.FC<LeaderboardViewProps> = ({
  leaderboard,
  friendsLeaderboard,
  activeTab,
  onTabChange,
  fid,
  onBackToPredict,
}) => {
  const data = activeTab === "global" ? leaderboard : friendsLeaderboard;
  const userEntry = fid
    ? data.find((entry) => entry.fid === fid) ?? null
    : null;

  const handleShare = async () => {
    // Share current rank contextually based on the selected tab.
    try {
      await sdk.actions.composeCast?.({
        text: `🏆 #${userEntry?.rank ?? "?"} ${
          activeTab === "friends" ? "among my degen friends" : "globally"
        } on ${APP_NAME}\n\n${userEntry?.total_points ?? 0} pts — ${
          userEntry?.perfect_slates ?? 0
        } perfect rounds! 🏎️\n\nCan you beat me? Come compete and climb the leaderboard 👇`,
        embeds: [`${APP_URL}`],
      });
    } catch (error) {
      console.error("Error sharing cast:", error);
    }
  };

  return (
    <div className="px-4 pb-8 pt-5 sm:p-6">
      <h2 className="mb-5 flex items-center gap-2 text-2xl font-bold text-white">
        <Trophy className="h-7 w-7 text-yellow-400" />
        Season Standings
      </h2>

      <div className="mb-5 flex gap-2">
        <button
          onClick={() => onTabChange("global")}
          className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-3 font-semibold transition-all ${
            activeTab === "global" ? "bg-red-600 text-white" : "bg-gray-800 text-gray-400 hover:bg-gray-700"
          }`}
        >
          <Globe className="h-4 w-4" />
          Global
        </button>
        <button
          onClick={() => onTabChange("friends")}
          className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-3 font-semibold transition-all ${
            activeTab === "friends" ? "bg-red-600 text-white" : "bg-gray-800 text-gray-400 hover:bg-gray-700"
          }`}
        >
          <Users className="h-4 w-4" />
          Friends
        </button>
      </div>

      <div className="mb-6 space-y-2">
        {data.map((entry, index) => {
          const isCurrentUser = fid !== null && entry.fid === fid;
          // Highlight the active user's row so they can spot themselves quickly.
          return (
            <div
              key={`${entry.fid}-${entry.rank}`}
              className={`rounded-xl border-2 bg-gray-800 p-4 ${
                isCurrentUser ? "border-red-500 bg-gray-700" : "border-gray-700"
              }`}
            >
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold ${
                      index === 0
                        ? "bg-yellow-500 text-gray-900"
                        : index === 1
                        ? "bg-gray-400 text-gray-900"
                        : index === 2
                        ? "bg-orange-600 text-white"
                        : "bg-gray-700 text-gray-300"
                    }`}
                  >
                    #{entry.rank}
                  </div>
                  <div className="relative h-10 w-10">
                    {entry.pfp_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={entry.pfp_url}
                        alt={`${entry.display_name || entry.username || "User"} avatar`}
                        className="h-10 w-10 rounded-full border border-gray-600 object-cover"
                        onError={(event) => {
                          event.currentTarget.style.display = "none";
                          const fallback = event.currentTarget.nextElementSibling as HTMLElement | null;
                          if (fallback) fallback.style.display = "flex";
                        }}
                      />
                    ) : null}
                    <div
                      className="absolute inset-0 hidden items-center justify-center rounded-full bg-gray-600 text-xs font-semibold text-gray-200"
                      style={{ display: entry.pfp_url ? "none" : "flex" }}
                    >
                      {(entry.display_name || entry.username || "?").slice(0, 2).toUpperCase()}
                    </div>
                  </div>
                  <div>
                    <p className="font-bold text-white">
                      {entry.display_name || entry.username || `User ${entry.fid}`}
                      {isCurrentUser ? " (You)" : ""}
                    </p>
                    <div className="flex items-center gap-2">
                      <p className="text-xs text-gray-400">{entry.perfect_slates} perfect slates</p>
                      {entry.perfect_slates > 0 && <Award className="h-3 w-3 text-yellow-400" />}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-red-400">{entry.total_points}</p>
                  <p className="text-xs text-gray-500">points</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex gap-3">
        <button
          onClick={onBackToPredict}
          className="flex-1 rounded-xl bg-red-600 p-4 font-semibold text-white transition-all hover:bg-red-700"
        >
          Back to Predictions
        </button>
        <button
          onClick={handleShare}
          className="flex items-center justify-center rounded-xl bg-purple-600 px-6 text-white transition-all hover:bg-purple-700"
        >
          <Share2 className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
};

export default LeaderboardView;

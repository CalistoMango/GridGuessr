import React, { useMemo } from "react";
import { Award, CheckCircle, Share2 } from "lucide-react";

import { sdk } from "@farcaster/miniapp-sdk";

import { APP_NAME, APP_URL } from "~/lib/constants";
import { UserBadges } from "../types";

// Badge gallery and progress tracker. Reads a pre-defined badge catalogue and
// merges it with user state to show earned vs locked achievements.

interface BadgeDefinition {
  id: string;
  name: string;
  icon: string;
  color: string;
  description: string;
}

// Static catalogue that powers the grid. The ids must match backend keys.
const BADGE_DEFINITIONS: BadgeDefinition[] = [
  { id: "perfectSlate", name: "Perfect Slate", icon: "💯", color: "from-purple-600 to-pink-600", description: "All predictions correct" },
  { id: "podiumProphet", name: "Podium Prophet", icon: "🔮", color: "from-yellow-500 to-orange-500", description: "Exact podium prediction" },
  { id: "halfCentury", name: "Half Century", icon: "🎯", color: "from-green-500 to-emerald-600", description: "Score 50+ points" },
  { id: "pole", name: "Pole Prophet", icon: "⚡", color: "from-blue-500 to-cyan-500", description: "Correct pole position" },
  { id: "winner", name: "Winner Wizard", icon: "🏆", color: "from-yellow-600 to-yellow-500", description: "Correct race winner" },
  { id: "second", name: "Silver Seer", icon: "🥈", color: "from-gray-400 to-gray-500", description: "Correct 2nd place" },
  { id: "third", name: "Bronze Brainiac", icon: "🥉", color: "from-orange-700 to-orange-600", description: "Correct 3rd place" },
  { id: "fastestLap", name: "Lap Legend", icon: "⏱️", color: "from-purple-500 to-purple-600", description: "Correct fastest lap" },
  { id: "fastestPit", name: "Pit Psychic", icon: "🔧", color: "from-blue-600 to-indigo-600", description: "Correct fastest pit" },
  { id: "dnf", name: "DNF Detective", icon: "🔍", color: "from-red-600 to-red-700", description: "Correct first DNF" },
  { id: "safetyCar", name: "Safety Sage", icon: "🚗", color: "from-yellow-500 to-yellow-600", description: "Correct safety car" },
  { id: "margin", name: "Margin Master", icon: "📊", color: "from-green-600 to-teal-600", description: "Correct win margin" },
];

interface BadgesViewProps {
  userBadges: UserBadges;
  onBackToPredict: () => void;
  isAdmin?: boolean;
}

const BadgesView: React.FC<BadgesViewProps> = ({ userBadges, onBackToPredict, isAdmin = false }) => {
  const earnedCount = useMemo(
    // Count badges once per render - list is small but this avoids repeated work.
    () => (userBadges ? Object.values(userBadges).filter((badge) => badge.earned).length : 0),
    [userBadges]
  );

  const handleShare = async () => {
    // Share a simple progress update anchored to the earned badge count.
    try {
      await sdk.actions.composeCast?.({
        text: `Progress check 🏅\n${earnedCount}/12 badges earned on ${APP_NAME}! Keep racing, keep winning 🏁\n\nHow many can you collect? 👇`,
        embeds: [`${APP_URL}`],
      });
    } catch (error) {
      console.error("Error sharing cast:", error);
    }
  };

  return (
    <div className="px-4 pb-8 pt-5 sm:p-6">
      <h2 className="mb-5 flex items-center gap-2 text-2xl font-bold text-white">
        <Award className="h-7 w-7 text-yellow-400" />
        Your Badges
      </h2>

      <div className="mb-6 grid grid-cols-2 gap-3">
        {BADGE_DEFINITIONS.map((badge) => {
          const status = userBadges?.[badge.id];
          const earned = Boolean(status?.earned);
          const count = status?.count ?? 0;

          return (
            <div
              key={badge.id}
              className={`rounded-xl border-2 p-4 transition-all ${
                earned ? `bg-gradient-to-br ${badge.color} border-transparent` : "border-gray-700 bg-gray-800 opacity-50"
              }`}
            >
              <div className="text-center">
                <div className="mb-2 text-4xl">{badge.icon}</div>
                <p className={`mb-1 text-sm font-bold ${earned ? "text-white" : "text-gray-400"}`}>{badge.name}</p>
                {earned && count > 0 && (
                  <div className="mb-2 flex items-center justify-center gap-1">
                    <CheckCircle className="h-3 w-3 text-white" />
                    <span className="text-xs font-semibold text-white">×{count}</span>
                  </div>
                )}
                <p className={`text-xs ${earned ? "text-white opacity-90" : "text-gray-500"}`}>{badge.description}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Simple progress meter so users see how close they are to full collection */}
      <div className="mb-5 rounded-xl border border-gray-700 bg-gray-800 p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-bold text-white">Badge Progress</h3>
          <span className="font-bold text-red-400">{earnedCount}/12</span>
        </div>
        <div className="h-2 w-full rounded-full bg-gray-700">
          <div
            className="h-2 rounded-full bg-gradient-to-r from-red-500 to-red-600 transition-all"
            style={{ width: `${(earnedCount / 12) * 100}%` }}
          />
        </div>
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

      {isAdmin && (
        <div className="mt-4 text-right">
          <a
            href="/admin"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-semibold text-gray-500 transition-colors hover:text-red-400"
          >
            Admin Panel
          </a>
        </div>
      )}
    </div>
  );
};

export default BadgesView;

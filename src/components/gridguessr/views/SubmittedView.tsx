import React from "react";
import { Trophy } from "lucide-react";

import { sdk } from "@farcaster/miniapp-sdk";

import { APP_URL } from "~/lib/constants";
import { Driver, Predictions, Race } from "../types";

// Confirmation screen shown once a slate is submitted or locked. Focuses on the
// recap card and sharing CTA while exposing shortcuts back to editing/leaderboard.

interface SubmittedViewProps {
  race: Race | null;
  predictions: Predictions;
  isLocked: boolean;
  onEditSlate: () => void;
  onViewLeaderboard: () => void;
}

const SubmittedView: React.FC<SubmittedViewProps> = ({
  race,
  predictions,
  isLocked,
  onEditSlate,
  onViewLeaderboard,
}) => {
  const handleShare = async () => {
    // Fire-and-forget cast so users can brag about their picks straight away.
    try {
      await sdk.actions.composeCast?.({
        text: `🏁 Grid set for the ${race?.name ?? "race"}! 🏁\n\nPole: ${
          predictions.pole?.name ?? "TBD"
        }\nWinner: ${predictions.podium[0]?.name ?? "TBD"}\n\nThink I'm wrong? Prove it 👇`,
        embeds: [`${APP_URL}`],
      });
    } catch (error) {
      console.error("Error sharing cast:", error);
    }
  };

  const getFirstDnfLabel = () => {
    // Convert the union type into a friendly string for the summary list.
    if (predictions.firstDNF === "none") return "No DNF";
    return (predictions.firstDNF as Driver | null)?.name ?? "-";
  };

  return (
    <div className="px-4 pb-8 pt-10 text-center sm:p-8">
      <div className="mb-6 rounded-2xl border-2 border-green-500 bg-green-900 p-8">
        <Trophy className="mx-auto mb-4 h-16 w-16 text-green-400" />
        <h2 className="mb-2 text-3xl font-bold text-white">Slate Locked!</h2>
        <p className="mb-4 text-gray-300">Your predictions are submitted</p>
        <button
          onClick={handleShare}
          className="w-full rounded-xl bg-purple-600 px-4 py-3 font-semibold text-white transition-all hover:bg-purple-700"
        >
          Share My Slate
        </button>
      </div>

      {/* Snapshot of the submitted slate so users can double-check picks */}
      <div className="mb-4 rounded-xl border border-gray-700 bg-gray-800 p-6 text-left">
        <h3 className="mb-3 font-bold text-white">Your Slate</h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-400">Pole:</span>
            <span className="text-white">{predictions.pole?.name ?? "-"}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Winner:</span>
            <span className="text-white">{predictions.podium[0]?.name ?? "-"}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">2nd:</span>
            <span className="text-white">{predictions.podium[1]?.name ?? "-"}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">3rd:</span>
            <span className="text-white">{predictions.podium[2]?.name ?? "-"}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Fastest Lap:</span>
            <span className="text-white">{predictions.fastestLap?.name ?? "-"}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Fastest Pit:</span>
            <span className="text-white">{predictions.fastestPitStop?.name ?? "-"}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">First DNF:</span>
            <span className="text-white">{getFirstDnfLabel()}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Safety Car:</span>
            <span className="text-white">
              {predictions.safetyCar === null ? "-" : predictions.safetyCar ? "Yes" : "No"}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Win Margin:</span>
            <span className="text-white">{predictions.winningMargin ?? "-"}</span>
          </div>
          {race?.wildcard_question && (
            <div className="flex justify-between">
              <span className="text-gray-400">Wildcard:</span>
              <span className="text-white">
                {predictions.wildcard === null ? "-" : predictions.wildcard ? "Yes / Over" : "No / Under"}
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="flex gap-3">
        <button
          onClick={onEditSlate}
          className="flex-1 rounded-xl border border-gray-700 bg-gray-800 p-4 font-semibold text-white transition-all hover:bg-gray-700"
        >
          {isLocked ? "Viewing Slate" : "Edit Slate"}
        </button>
        <button
          onClick={onViewLeaderboard}
          className="flex-1 rounded-xl bg-red-600 p-4 font-semibold text-white transition-all hover:bg-red-700"
        >
          Leaderboard
        </button>
      </div>
    </div>
  );
};

export default SubmittedView;

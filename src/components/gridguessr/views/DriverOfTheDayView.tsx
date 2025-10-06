import React from "react";
import { CheckCircle, Share2, ThumbsUp } from "lucide-react";

import { sdk } from "@farcaster/miniapp-sdk";

import { APP_NAME, APP_URL } from "~/lib/constants";
import { DotdData, Driver, Race } from "../types";

// Standalone voting surface for Driver of the Day. Presents the selection grid,
// submission feedback, and live standings with minimal container involvement.

interface DriverOfTheDayViewProps {
  previousRace: Race | null;
  drivers: Driver[];
  dotdVote: Driver | null;
  dotdData: DotdData | null;
  dotdSubmitted: boolean;
  dotdMessage: string | null;
  onSelectDriver: (driver: Driver) => void;
  onSubmitVote: () => void;
  onBack: () => void;
}

const DriverOfTheDayView: React.FC<DriverOfTheDayViewProps> = ({
  previousRace,
  drivers,
  dotdVote,
  dotdData,
  dotdSubmitted,
  dotdMessage,
  onSelectDriver,
  onSubmitVote,
  onBack,
}) => {
  const handleShare = async () => {
    if (!dotdVote) return;
    // Build a share message using the active vote and race context.
    try {
      await sdk.actions.composeCast?.({
        text: `🔥 Voted ${dotdVote.name} as Driver of the Day on ${APP_NAME} for the ${
          previousRace?.name ?? "previous race"
        }!\n\nWho's yours? Vote now 👇`,
        embeds: [`${APP_URL}`],
      });
    } catch (error) {
      console.error("Error sharing cast:", error);
    }
  };

  return (
    <div className="space-y-6 px-4 pb-8 pt-5 sm:p-6">
      {/* Hero banner establishes the context (which race the vote references) */}
      <div className="rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 p-5 text-white">
        <div className="mb-3 flex items-center gap-3">
          <ThumbsUp className="h-8 w-8" />
          <div>
            <h2 className="text-2xl font-bold">Driver of the Day</h2>
            <p className="text-sm text-blue-100">{previousRace?.name ?? "Previous race"}</p>
          </div>
        </div>
      </div>

      <div className="space-y-4 rounded-xl border border-gray-700 bg-gray-800 p-5">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-white">Cast Your Vote</h3>
          <div className="text-sm text-gray-400">{dotdData?.totalVotes ?? 0} votes</div>
        </div>
        {dotdMessage && (
          <div className="rounded-lg border border-blue-500/40 bg-blue-900/30 px-3 py-2 text-sm text-blue-100">
            {dotdMessage}
          </div>
        )}

        {!dotdSubmitted ? (
          <>
            <div className="grid gap-2">
              {drivers.map((driver) => {
                const isSelected = dotdVote?.id === driver.id;
                return (
                  <button
                    key={driver.id}
                    onClick={() => onSelectDriver(driver)}
                    className={`flex items-center justify-between rounded-xl border-2 px-3 py-2 text-left transition-all ${
                      isSelected ? "border-blue-500 bg-blue-900/40" : "border-gray-600 bg-gray-700 hover:border-gray-500"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-1.5 rounded-full" style={{ backgroundColor: driver.color }} />
                      <div>
                        <p className="text-sm font-semibold text-white">{driver.name}</p>
                        <p className="text-xs text-gray-400">#{driver.number} • {driver.team}</p>
                      </div>
                    </div>
                    {isSelected && <CheckCircle className="h-5 w-5 text-blue-300" />}
                  </button>
                );
              })}
            </div>
            <div className="flex gap-3">
              <button
                onClick={onBack}
                className="flex-1 rounded-xl border border-gray-700 bg-gray-800 px-4 py-3 text-white transition-all hover:bg-gray-700"
              >
                Back
              </button>
              <button
                onClick={onSubmitVote}
                disabled={!dotdVote}
                className={`flex-1 rounded-xl px-4 py-3 font-bold transition-all ${
                  dotdVote ? "bg-blue-600 text-white hover:bg-blue-700" : "cursor-not-allowed bg-gray-700 text-gray-500"
                }`}
              >
                Submit Vote
              </button>
              <button
                onClick={handleShare}
                disabled={!dotdVote}
                className={`flex items-center justify-center rounded-xl px-5 transition-all ${
                  dotdVote ? "bg-purple-600 text-white hover:bg-purple-700" : "cursor-not-allowed bg-gray-700 text-gray-500"
                }`}
              >
                <Share2 className="h-5 w-5" />
              </button>
            </div>
          </>
        ) : (
          <div className="space-y-3 rounded-xl border border-blue-600 bg-blue-900/40 px-4 py-5 text-left">
            <div>
              <p className="text-sm font-semibold text-white">
                Thanks for voting! Your pick {dotdVote?.name ?? ""} is locked in for {previousRace?.name ?? "the race"}.
              </p>
              <p className="mt-2 text-xs text-blue-100">Check back to see how the standings evolve.</p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={onBack}
                className="flex-1 rounded-xl border border-gray-700 bg-gray-800 px-4 py-3 text-white transition-all hover:bg-gray-700"
              >
                Back
              </button>
              <button
                onClick={handleShare}
                className="flex-1 rounded-xl bg-purple-600 px-4 py-3 text-white transition-all hover:bg-purple-700"
              >
                Share Vote
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Live tally helps users see how their vote compares */}
      <div className="rounded-xl border border-gray-700 bg-gray-800 p-5">
        <h3 className="mb-4 text-lg font-bold text-white">Current Standings</h3>
        <div className="space-y-2">
          {(dotdData?.votes ?? []).map((entry, index) => {
            const isSelected = dotdVote?.id === entry.driver.id;
            const isLeader = index === 0;
            return (
              <div
                key={entry.driver.id}
                className={`flex items-center justify-between rounded-xl border px-3 py-2 ${
                  isLeader ? "border-blue-500 bg-blue-900/30" : "border-gray-700 bg-gray-700"
                } ${isSelected ? "ring-2 ring-blue-400" : ""}`}
              >
                <div className="flex items-center gap-3">
                  <div className="h-8 w-1.5 rounded-full" style={{ backgroundColor: entry.driver.color }} />
                  <div>
                    <p className="text-sm font-semibold text-white">{entry.driver.name}</p>
                    <p className="text-xs text-gray-400">{entry.votes} vote{entry.votes === 1 ? "" : "s"}</p>
                  </div>
                </div>
                <span className="text-sm font-bold text-blue-200">{entry.percentage}%</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default DriverOfTheDayView;

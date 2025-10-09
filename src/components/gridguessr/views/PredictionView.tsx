import React from "react";
import {
  AlertTriangle,
  CheckCircle,
  Clock,
  Flag,
  Target,
  Timer,
  TrendingUp,
  Trophy,
  Zap,
} from "lucide-react";

import { Driver, PodiumSetter, PredictionModalId, PredictionSetter, Predictions, Race } from "../types";

// Main form experience for building a slate. This component is intentionally
// dumb: it receives all state via props and emits callbacks for changes.

interface CompletionMeta {
  completed: number;
  total: number;
  percentage: number;
}

interface PredictionViewProps {
  race: Race;
  drivers: Driver[];
  predictions: Predictions;
  completion: CompletionMeta;
  lockCountdownText: string;
  isLocked: boolean;
  onOpenModal: (id: PredictionModalId) => void;
  onSetPrediction: PredictionSetter;
  onSetPodium: PodiumSetter;
  onSubmit: () => void;
  isSubmitting: boolean;
  isSubmitDisabled: boolean;
  submitError: string | null;
}

const podiumBadges = [
  "bg-yellow-500 text-gray-900",
  "bg-gray-400 text-gray-900",
  "bg-orange-600 text-white",
];

const PredictionView: React.FC<PredictionViewProps> = ({
  race,
  drivers,
  predictions,
  completion,
  lockCountdownText,
  isLocked,
  onOpenModal,
  onSetPrediction,
  onSetPodium,
  onSubmit,
  isSubmitting,
  isSubmitDisabled,
  submitError,
}) => {
  // Convenience handlers so button callbacks stay tidy.
  const handleSafetyCar = (value: boolean) => {
    onSetPrediction("safetyCar", value);
  };

  const handleWildcard = (value: boolean) => {
    onSetPrediction("wildcard", value);
  };

  const handleClearPole = () => onSetPrediction("pole", null);

  return (
    <div className="relative px-4 pb-8 pt-5 sm:p-6">
      {/* Dim the underlying form if the slate is locked so users know it's read-only */}
      <div className={isLocked ? "pointer-events-none opacity-40 transition-opacity" : ""}>
        <div className="mb-5 rounded-xl border border-gray-600 bg-gradient-to-r from-gray-800 to-gray-700 p-5">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h2 className="mb-1 text-2xl font-bold text-white">{race.name}</h2>
              <p className="text-sm text-gray-300">{race.circuit}</p>
            </div>
            <Flag className="h-8 w-8 text-red-400" />
          </div>
          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-2 text-yellow-400">
              <Clock className="h-4 w-4" />
              <span>{lockCountdownText}</span>
            </div>
          </div>
        </div>

        {/* Progress tracker mirrors the hook's completion calculation */}
        <div className="mb-5 rounded-xl border border-gray-700 bg-gray-800 p-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="font-semibold text-white">Slate Progress</span>
            <span className="font-bold text-red-400">{completion.percentage}%</span>
          </div>
          <div className="h-2 w-full rounded-full bg-gray-700">
            <div
              className="h-2 rounded-full bg-gradient-to-r from-red-500 to-red-600 transition-all"
              style={{ width: `${completion.percentage}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-gray-400">
            {completion.completed}/{completion.total} predictions completed
          </p>
        </div>

        <div className="mb-3 rounded-xl border border-gray-700 bg-gray-800 p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-yellow-400" />
              <span className="font-bold text-white">Pole Position</span>
              <span className="rounded bg-gray-700 px-2 py-1 text-xs text-gray-400">15 pts</span>
            </div>
            {predictions.pole && <CheckCircle className="h-5 w-5 text-green-400" />}
          </div>
          {!predictions.pole ? (
            <button
              onClick={() => onOpenModal("pole")}
              className="w-full rounded-lg border border-gray-600 bg-gray-700 p-3 text-gray-300 transition-all hover:bg-gray-600"
            >
              Select driver
            </button>
          ) : (
            <div className="flex items-center justify-between rounded-lg bg-gray-700 p-3">
              <div className="flex items-center gap-3">
                <div className="h-8 w-1 rounded-full" style={{ backgroundColor: predictions.pole.color }} />
                <div>
                  <p className="font-bold text-white">{predictions.pole.name}</p>
                  <p className="text-sm text-gray-400">#{predictions.pole.number}</p>
                </div>
              </div>
              <button
                onClick={handleClearPole}
                className="text-sm text-red-400 transition-colors hover:text-red-300"
              >
                Change
              </button>
            </div>
          )}
        </div>

        <div className="mb-3 rounded-xl border border-gray-700 bg-gray-800 p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Trophy className="h-5 w-5 text-yellow-400" />
              <span className="font-bold text-white">Podium Finish</span>
              <span className="rounded bg-gray-700 px-2 py-1 text-xs text-gray-400">35 pts</span>
            </div>
            {predictions.podium.filter(Boolean).length === 3 && (
              <CheckCircle className="h-5 w-5 text-green-400" />
            )}
          </div>
          <div className="space-y-2">
            {["1st", "2nd", "3rd"].map((position, idx) => {
              const driver = predictions.podium[idx];
              return (
                <div key={position} className="flex items-center gap-2">
                  <div className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${podiumBadges[idx]}`}>
                    {position}
                  </div>
                  {!driver ? (
                    <button
                      onClick={() => onOpenModal(`podium-${idx}` as PredictionModalId)}
                      className="flex-1 rounded-lg border border-gray-600 bg-gray-700 p-2 text-sm text-gray-300 transition-all hover:bg-gray-600"
                    >
                      Select driver
                    </button>
                  ) : (
                    <div className="flex flex-1 items-center justify-between rounded-lg bg-gray-700 p-2">
                      <span className="text-sm font-semibold text-white">{driver.name}</span>
                      <button
                        onClick={() => onSetPodium(idx, null)}
                        className="text-xs text-red-400 transition-colors hover:text-red-300"
                      >
                        Change
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="mb-5 space-y-3">
          <button
            onClick={() => onOpenModal("fastestLap")}
            className="w-full rounded-xl border border-gray-700 bg-gray-800 p-4 text-left transition-all hover:border-purple-500"
          >
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Timer className="h-5 w-5 text-purple-400" />
                <span className="font-bold text-white">Fastest Lap</span>
                <span className="rounded bg-gray-700 px-2 py-1 text-xs text-gray-400">10 pts</span>
              </div>
              {predictions.fastestLap && <CheckCircle className="h-5 w-5 text-green-400" />}
            </div>
            {!predictions.fastestLap ? (
              <div className="text-sm text-gray-300">Select driver</div>
            ) : (
              <div className="flex items-center gap-3">
                <div className="h-8 w-1 rounded-full" style={{ backgroundColor: predictions.fastestLap.color }} />
                <div>
                  <p className="font-semibold text-white">{predictions.fastestLap.name}</p>
                  <p className="text-sm text-gray-400">#{predictions.fastestLap.number}</p>
                </div>
              </div>
            )}
          </button>

          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => onOpenModal("fastestPit")}
              className="rounded-xl border border-gray-700 bg-gray-800 p-3 text-left transition-all hover:border-blue-500"
            >
              <div className="mb-2 flex items-center gap-2">
                <Zap className="h-4 w-4 text-blue-400" />
                <span className="text-sm font-bold text-white">Fastest Pit</span>
              </div>
              <span className="rounded bg-gray-700 px-2 py-1 text-xs text-gray-400">10 pts</span>
              <p className="mt-2 text-xs text-gray-400">
                {predictions.fastestPitStop ? predictions.fastestPitStop.name : "Not selected"}
              </p>
            </button>

            <button
              onClick={() => onOpenModal("firstDNF")}
              className="rounded-xl border border-gray-700 bg-gray-800 p-3 text-left transition-all hover:border-orange-500"
            >
              <div className="mb-2 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-orange-400" />
                <span className="text-sm font-bold text-white">First DNF</span>
              </div>
              <span className="rounded bg-gray-700 px-2 py-1 text-xs text-gray-400">10 pts</span>
              <p className="mt-2 text-xs text-gray-400">
                {predictions.firstDNF === "none"
                  ? "No DNF"
                  : predictions.firstDNF
                  ? (predictions.firstDNF as Driver).name
                  : "Not selected"}
              </p>
            </button>

            <div className="rounded-xl border border-gray-700 bg-gray-800 p-3">
              <div className="mb-2 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-yellow-400" />
                <span className="text-sm font-bold text-white">Safety Car</span>
              </div>
              <span className="rounded bg-gray-700 px-2 py-1 text-xs text-gray-400">10 pts</span>
              <div className="mt-2 flex gap-1">
                <button
                  onClick={() => handleSafetyCar(true)}
                  className={`flex-1 rounded py-1 text-xs ${
                    predictions.safetyCar === true
                      ? "bg-green-600 text-white"
                      : "bg-gray-700 text-gray-400"
                  }`}
                >
                  Yes
                </button>
                <button
                  onClick={() => handleSafetyCar(false)}
                  className={`flex-1 rounded py-1 text-xs ${
                    predictions.safetyCar === false
                      ? "bg-red-600 text-white"
                      : "bg-gray-700 text-gray-400"
                  }`}
                >
                  No
                </button>
              </div>
            </div>

            <button
              onClick={() => onOpenModal("winningMargin")}
              className="rounded-xl border border-gray-700 bg-gray-800 p-3 text-left transition-all hover:border-green-500"
            >
              <div className="mb-2 flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-green-400" />
                <span className="text-sm font-bold text-white">Win Margin</span>
              </div>
              <span className="rounded bg-gray-700 px-2 py-1 text-xs text-gray-400">10 pts</span>
              <p className="mt-2 text-xs text-gray-400">
                {predictions.winningMargin ?? "Not selected"}
              </p>
            </button>
          </div>

          {race.wildcard_question && (
            <div className="rounded-xl border border-gray-700 bg-gray-800 p-4">
              <div className="mb-2 flex items-center gap-2">
                <Target className="h-5 w-5 text-pink-400" />
                <span className="font-bold text-white">Wildcard (bonus)</span>
                <span className="rounded bg-gray-700 px-2 py-1 text-xs text-gray-400">10 pts</span>
              </div>
              <p className="mb-3 text-sm text-gray-300">{race.wildcard_question}</p>
              <div className="flex gap-2">
                <button
                  onClick={() => handleWildcard(true)}
                  className={`flex-1 rounded py-2 text-sm ${
                    predictions.wildcard === true
                      ? "bg-green-600 text-white"
                      : "bg-gray-700 text-gray-400"
                  }`}
                >
                  Yes / Over
                </button>
                <button
                  onClick={() => handleWildcard(false)}
                  className={`flex-1 rounded py-2 text-sm ${
                    predictions.wildcard === false
                      ? "bg-red-600 text-white"
                      : "bg-gray-700 text-gray-400"
                  }`}
                >
                  No / Under
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Submission button inherits disabled state from parent hook */}
        <button
          onClick={onSubmit}
          disabled={isSubmitDisabled}
          className={`mb-2 w-full rounded-xl p-4 font-bold transition-all ${
            !isSubmitDisabled
              ? "bg-red-600 text-white hover:bg-red-700"
              : "cursor-not-allowed bg-gray-700 text-gray-500"
          }`}
        >
          {isLocked ? "Grid Locked" : isSubmitting ? "Submitting..." : "Submit Slate"}
        </button>
        {submitError && <p className="mb-4 text-sm text-red-400">{submitError}</p>}
      </div>
    </div>
  );
};

export default PredictionView;

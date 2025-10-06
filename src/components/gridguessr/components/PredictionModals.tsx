import React from "react";

import { Driver, PodiumSetter, PredictionModalId, PredictionSetter, Team } from "../types";
import Modal from "./Modal";

// Centralised renderer for all prediction selection modals. Keeps the
// conditional logic together so the main view only flips `showModal` identifiers.

interface PredictionModalsProps {
  showModal: PredictionModalId | null;
  drivers: Driver[];
  teams: Team[];
  marginBuckets: string[];
  onClose: () => void;
  onSelectDriver: PredictionSetter;
  onSelectPodium: PodiumSetter;
}

const PredictionModals: React.FC<PredictionModalsProps> = ({
  showModal,
  drivers,
  teams,
  marginBuckets,
  onClose,
  onSelectDriver,
  onSelectPodium,
}) => {
  // Collapse to nothing when no modal is requested.
  if (!showModal) return null;

  if (showModal === "pole") {
    return (
      <Modal title="Select Pole Position" onClose={onClose}>
        <div className="space-y-2">
          {drivers.map((driver) => (
            <button
              key={driver.id}
              onClick={() => onSelectDriver("pole", driver)}
              className="flex w-full items-center gap-3 rounded-lg border border-gray-700 bg-gray-700 p-3 transition-all hover:bg-gray-600"
            >
              <div className="h-10 w-1 rounded-full" style={{ backgroundColor: driver.color }} />
              <div className="text-left">
                <p className="font-bold text-white">{driver.name}</p>
                <p className="text-sm text-gray-400">#{driver.number} • {driver.team}</p>
              </div>
            </button>
          ))}
        </div>
      </Modal>
    );
  }

  if (showModal.startsWith("podium-")) {
    const position = Number.parseInt(showModal.split("-")[1] ?? "0", 10);
    const label = ["1st", "2nd", "3rd"][position] ?? "Podium";

    // Reuse the same list UI for all podium slots by deriving the label/index.
    return (
      <Modal title={`Select ${label} Place`} onClose={onClose}>
        <div className="space-y-2">
          {drivers.map((driver) => (
            <button
              key={driver.id}
              onClick={() => onSelectPodium(position, driver)}
              className="flex w-full items-center gap-3 rounded-lg border border-gray-700 bg-gray-700 p-3 transition-all hover:bg-gray-600"
            >
              <div className="h-10 w-1 rounded-full" style={{ backgroundColor: driver.color }} />
              <div className="text-left">
                <p className="font-bold text-white">{driver.name}</p>
                <p className="text-sm text-gray-400">#{driver.number} • {driver.team}</p>
              </div>
            </button>
          ))}
        </div>
      </Modal>
    );
  }

  if (showModal === "fastestLap") {
    return (
      <Modal title="Select Fastest Lap" onClose={onClose}>
        <div className="space-y-2">
          {drivers.map((driver) => (
            <button
              key={driver.id}
              onClick={() => onSelectDriver("fastestLap", driver)}
              className="flex w-full items-center gap-3 rounded-lg border border-gray-700 bg-gray-700 p-3 transition-all hover:bg-gray-600"
            >
              <div className="h-10 w-1 rounded-full" style={{ backgroundColor: driver.color }} />
              <div className="text-left">
                <p className="font-bold text-white">{driver.name}</p>
                <p className="text-sm text-gray-400">#{driver.number} • {driver.team}</p>
              </div>
            </button>
          ))}
        </div>
      </Modal>
    );
  }

  if (showModal === "fastestPit") {
    return (
      <Modal title="Select Fastest Pit Stop Team" onClose={onClose}>
        <div className="space-y-2">
          {teams.map((team) => (
            <button
              key={team.id}
              onClick={() => onSelectDriver("fastestPitStop", team)}
              className="flex w-full items-center gap-3 rounded-lg border border-gray-700 bg-gray-700 p-3 transition-all hover:bg-gray-600"
            >
              <div className="h-10 w-4 rounded-full" style={{ backgroundColor: team.color }} />
              <p className="font-bold text-white">{team.name}</p>
            </button>
          ))}
        </div>
      </Modal>
    );
  }

  if (showModal === "firstDNF") {
    return (
      <Modal title="First DNF" onClose={onClose}>
        <div className="space-y-2">
          {/* Offer a friendly shortcut for the "no retirements" outcome */}
          <button
            onClick={() => onSelectDriver("firstDNF", "none")}
            className="w-full rounded-lg border border-green-700 bg-green-700 p-3 font-bold text-white transition-all hover:bg-green-600"
          >
            No DNF
          </button>
          {drivers.map((driver) => (
            <button
              key={driver.id}
              onClick={() => onSelectDriver("firstDNF", driver)}
              className="flex w-full items-center gap-3 rounded-lg border border-gray-700 bg-gray-700 p-3 transition-all hover:bg-gray-600"
            >
              <div className="h-10 w-1 rounded-full" style={{ backgroundColor: driver.color }} />
              <div className="text-left">
                <p className="font-bold text-white">{driver.name}</p>
                <p className="text-sm text-gray-400">#{driver.number} • {driver.team}</p>
              </div>
            </button>
          ))}
        </div>
      </Modal>
    );
  }

  if (showModal === "winningMargin") {
    return (
      <Modal title="Select Winning Margin" onClose={onClose}>
        <div className="space-y-2">
          {/* Buckets supplied by utils so margin values stay consistent across the app */}
          {marginBuckets.map((bucket) => (
            <button
              key={bucket}
              onClick={() => onSelectDriver("winningMargin", bucket)}
              className="w-full rounded-lg border border-gray-700 bg-gray-700 p-3 font-bold text-white transition-all hover:bg-gray-600"
            >
              {bucket}
            </button>
          ))}
        </div>
      </Modal>
    );
  }

  return null;
};

export default PredictionModals;

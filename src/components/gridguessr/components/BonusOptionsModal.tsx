"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Check } from "lucide-react";

import type { BonusPredictionOption, BonusPredictionQuestion, Driver, Team } from "../types";
import Modal from "./Modal";

interface BonusOptionsModalProps {
  question: BonusPredictionQuestion;
  selectedOptionIds: string[];
  drivers: Driver[];
  teams: Team[];
  onCommit: (optionIds: string[]) => void;
  onClose: () => void;
}

function resolveDriver(option: BonusPredictionOption, drivers: Driver[]) {
  if (option.driverId) {
    return drivers.find((entry) => entry.id === option.driverId) ?? null;
  }
  return null;
}

function resolveTeam(option: BonusPredictionOption, teams: Team[]) {
  if (option.teamId) {
    return teams.find((entry) => entry.id === option.teamId) ?? null;
  }
  return null;
}

function resolveOptionLabel(option: BonusPredictionOption, drivers: Driver[], teams: Team[]) {
  const driver = resolveDriver(option, drivers);
  if (driver) return driver.name;
  const team = resolveTeam(option, teams);
  if (team) return team.name;
  if (option.label?.trim()) return option.label;
  return "Option";
}

const BonusOptionsModal: React.FC<BonusOptionsModalProps> = ({
  question,
  selectedOptionIds,
  drivers,
  teams,
  onCommit,
  onClose,
}) => {
  const maxSelections = question.maxSelections || 1;
  const isMultiple = maxSelections > 1;
  const [draftSelection, setDraftSelection] = useState<string[]>(selectedOptionIds);

  useEffect(() => {
    setDraftSelection(selectedOptionIds);
  }, [question.id, selectedOptionIds]);

  const toggleOption = (optionId: string) => {
    if (!isMultiple) {
      onCommit([optionId]);
      onClose();
      return;
    }

    setDraftSelection((previous) => {
      if (previous.includes(optionId)) {
        return previous.filter((id) => id !== optionId);
      }
      if (previous.length >= maxSelections) {
        return previous;
      }
      return [...previous, optionId];
    });
  };

  const handleSave = () => {
    onCommit(draftSelection);
    onClose();
  };

  const handleClear = () => {
    if (isMultiple) {
      setDraftSelection([]);
    } else {
      onCommit([]);
      onClose();
    }
  };

  const title = useMemo(() => {
    if (question.prompt.trim().length) {
      return question.prompt;
    }
    return "Select option";
  }, [question.prompt]);

  const activeSelection = isMultiple ? draftSelection : selectedOptionIds;

  return (
    <Modal title={title} onClose={onClose}>
      <div className="space-y-2">
        {question.options.map((option) => {
          const driver = resolveDriver(option, drivers);
          const team = resolveTeam(option, teams);
          const label = resolveOptionLabel(option, drivers, teams);
          const secondary = driver
            ? `#${driver.number} • ${driver.team}`
            : team
            ? team.name
            : option.label ?? "";
          const color = driver?.color ?? team?.color ?? "#6b7280";
          const isSelected = activeSelection.includes(option.id);

          return (
            <button
              key={option.id}
              onClick={() => toggleOption(option.id)}
              className={`flex w-full items-center justify-between rounded-lg border px-4 py-3 text-left transition ${
                isSelected
                  ? "border-purple-400 bg-purple-600/30 text-white"
                  : "border-gray-700 bg-gray-800 text-gray-200 hover:border-purple-400 hover:bg-purple-900/30"
              }`}
            >
              <div className="flex items-center gap-3">
                <div
                  className="h-10 w-1 rounded-full"
                  style={{ backgroundColor: color }}
                  aria-hidden
                />
                <div>
                  <p className="font-semibold text-white">{label}</p>
                  {secondary && <p className="text-xs text-gray-400">{secondary}</p>}
                </div>
              </div>
              {isSelected && <Check className="h-4 w-4 text-purple-200" />}
            </button>
          );
        })}
      </div>

      {isMultiple && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={handleClear}
            className="rounded-lg border border-gray-600 px-3 py-2 text-sm text-gray-200 hover:bg-gray-700"
          >
            Clear selection
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={draftSelection.length === 0}
            className="rounded-lg bg-purple-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-purple-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Save choices
          </button>
        </div>
      )}
    </Modal>
  );
};

export default BonusOptionsModal;

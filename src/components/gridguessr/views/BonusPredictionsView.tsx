"use client";

import React, { useMemo } from "react";
import { CalendarCheck, CheckCircle, CheckSquare, Flame, Flag, LucideIcon, Trophy, Users } from "lucide-react";

import type {
  BonusPredictionEvent,
  BonusPredictionOption,
  BonusPredictionUserState,
  Driver,
  Team,
} from "../types";

interface BonusPredictionsViewProps {
  event: BonusPredictionEvent;
  responses: BonusPredictionUserState | undefined;
  drivers: Driver[];
  teams: Team[];
  completion: { completed: number; total: number; percentage: number };
  isLocked: boolean;
  submitting: boolean;
  canSubmit: boolean;
  submitError: string | null;
  onOpenQuestion: (questionId: string) => void;
  onSubmit: () => void;
  onBack: () => void;
  hasSubmitted: boolean;
}

const emptySelection: Record<string, never> = {};

const questionIcons: LucideIcon[] = [Flag, Trophy, Flame, Users, CheckSquare, CalendarCheck];

function resolveOptionLabel(option: BonusPredictionOption, drivers: Driver[], teams: Team[]) {
  if (option.label?.trim()) {
    return option.label;
  }

  if (option.driverId) {
    const driver = drivers.find((entry) => entry.id === option.driverId);
    if (driver) {
      return `${driver.name}`;
    }
  }

  if (option.teamId) {
    const team = teams.find((entry) => entry.id === option.teamId);
    if (team) {
      return team.name;
    }
  }

  return "Option";
}

function formatLockCountdown(locksAt: string): string {
  const lockDate = new Date(locksAt);
  const now = new Date();

  if (Number.isNaN(lockDate.getTime())) {
    return "Lock time TBD";
  }

  if (lockDate <= now) {
    return "Bonus locked";
  }

  const diffMs = lockDate.getTime() - now.getTime();
  const totalMinutes = Math.round(diffMs / (1000 * 60));
  const totalHours = Math.floor(totalMinutes / 60);

  const parts: string[] = [];
  if (totalHours >= 48) {
    const days = Math.floor(totalHours / 24);
    const hours = totalHours % 24;
    const minutes = totalMinutes % 60;
    parts.push(`${days}d`);
    if (hours > 0) {
      parts.push(`${hours}h`);
    } else if (minutes > 0) {
      parts.push(`${minutes}m`);
    }
  } else {
    if (totalHours > 0) {
      parts.push(`${totalHours}h`);
    }
    parts.push(`${totalMinutes % 60}m`);
  }

  return `Locks in ${parts.join(" ")}`;
}

const BonusPredictionsView: React.FC<BonusPredictionsViewProps> = ({
  event,
  responses,
  drivers,
  teams,
  completion,
  isLocked,
  submitting,
  canSubmit,
  submitError,
  onOpenQuestion,
  onSubmit,
  onBack,
  hasSubmitted,
}) => {
  const selectionState = responses?.responses ?? emptySelection;
  const hasQuestions = event.questions.length > 0;

  const resultSummary = useMemo(() => {
    if (!responses?.totalPoints) return null;
    return `Scored ${responses.totalPoints} pts${responses.scoredAt ? " • Final" : ""}`;
  }, [responses?.totalPoints, responses?.scoredAt]);

  const lockCountdown = useMemo(() => formatLockCountdown(event.locksAt), [event.locksAt]);
  const isReadOnly = hasSubmitted || isLocked;

  return (
    <div className="flex min-h-full flex-col gap-6 px-4 pb-8 pt-6 sm:p-6">
      <div className="rounded-2xl border border-purple-500/40 bg-gradient-to-br from-purple-600/30 via-purple-800/30 to-purple-900/50 p-6">
        <button
          onClick={onBack}
          className="text-xs uppercase tracking-[0.3em] text-purple-100/80 hover:text-purple-50"
        >
          ← Back
        </button>
        <h2 className="mt-2 text-2xl font-bold text-white sm:text-3xl">{event.title}</h2>
        {event.description && <p className="mt-2 text-sm text-purple-100/90">{event.description}</p>}

        <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-purple-100/80">
          <span className="rounded-full bg-purple-900/60 px-3 py-1 text-xs uppercase tracking-wide">
            {event.type === "sprint"
              ? "Sprint bonus"
              : event.type === "winter"
              ? "Winter test"
              : "Community vote"}
          </span>
          <span>{lockCountdown}</span>
          {resultSummary && <span className="text-emerald-200">{resultSummary}</span>}
        </div>

        {hasQuestions && (
          <div className="mt-6">
            <div className="flex items-center justify-between text-sm text-purple-100/90">
              <span>
                {completion.completed}/{completion.total} answered
              </span>
              <span>{completion.percentage}% complete</span>
            </div>
            <div className="relative mt-2 h-2 rounded-full bg-purple-900/60">
              <div
                className="absolute left-0 top-0 h-full rounded-full bg-purple-400 transition-all"
                style={{ width: `${completion.percentage}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {!hasQuestions && (
        <div className="rounded-xl border border-gray-700 bg-gray-800/80 p-6 text-sm text-gray-300">
          No questions configured for this bonus event yet. Check back soon!
        </div>
      )}

      {hasQuestions && (
        <div className="space-y-3">
          {event.questions.map((question, index) => {
            const selection = selectionState[question.id];
            const selectedOptionIds = selection?.selectedOptionIds ?? [];
            const maxSelections = question.maxSelections || 1;
            const isMultiple = maxSelections > 1;
            const selectedOptions = question.options.filter((option) =>
              selectedOptionIds.includes(option.id)
            );
            const selectedDetails = selectedOptions.map((option) => {
              const label = resolveOptionLabel(option, drivers, teams);
              const secondary = (() => {
                const driver = drivers.find((d) => d.id === option.driverId);
                if (driver) return `#${driver.number} • ${driver.team}`;
                const team = teams.find((t) => t.id === option.teamId);
                if (team) return team.name;
                return option.label ?? "";
              })();
              const color = (() => {
                const driver = drivers.find((d) => d.id === option.driverId);
                if (driver?.color) return driver.color;
                const team = teams.find((t) => t.id === option.teamId);
                if (team?.color) return team.color;
                return "#6b7280";
              })();
              return { label, secondary, color };
            });
            const isCompleted = selectedDetails.length > 0;
            const disableSelection = isReadOnly || submitting;
            const Icon = questionIcons[index % questionIcons.length];

            return (
              <button
                key={question.id}
                type="button"
                onClick={() => onOpenQuestion(question.id)}
                disabled={disableSelection}
                className={`w-full rounded-2xl border px-4 py-4 text-left shadow-sm transition ${
                  isCompleted
                    ? "border-purple-400/60 bg-gradient-to-br from-purple-900/50 via-purple-900/40 to-purple-800/40"
                    : "border-gray-700 bg-gray-900/70"
                } ${
                  disableSelection
                    ? "cursor-not-allowed opacity-60"
                    : "hover:border-purple-400/70 hover:bg-purple-900/20"
                }`}
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-purple-500/20 text-purple-200">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="text-base font-semibold text-white leading-tight">{question.prompt}</h3>
                      {isMultiple && (
                        <p className="text-[11px] uppercase tracking-wide text-gray-400">
                          Select up to {maxSelections}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full border border-purple-500/40 px-3 py-1 text-xs text-purple-100/80">
                      {question.points} pts
                    </span>
                    {isCompleted && <CheckCircle className="h-4 w-4 text-emerald-300" />}
                  </div>
                </div>

                <div className="mt-3 space-y-1.5">
                  {isCompleted ? (
                    selectedDetails.map((detail) => (
                      <div
                        key={`${detail.label}-${detail.secondary}`}
                        className="flex items-center justify-between rounded-lg bg-gray-800/80 px-3 py-2"
                      >
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-1 rounded-full" style={{ backgroundColor: detail.color }} />
                          <div>
                            <p className="text-sm font-semibold text-white leading-tight">{detail.label}</p>
                            {detail.secondary && <p className="text-[11px] text-gray-400">{detail.secondary}</p>}
                          </div>
                        </div>
                        <span className="text-[11px] uppercase tracking-wide text-purple-200">
                          {disableSelection ? "View" : "Edit"}
                        </span>
                      </div>
                    ))
                  ) : (
                    <span className="text-sm text-gray-400">
                      {isLocked
                        ? "Locked"
                        : hasSubmitted
                        ? "Submitted"
                        : isMultiple
                        ? "Tap to choose options"
                        : "Tap to choose"}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {hasQuestions && !hasSubmitted && (
        <button
          onClick={onSubmit}
          disabled={isLocked || submitting || !canSubmit}
          className="mt-2 w-full rounded-xl bg-purple-500 px-5 py-3 text-center text-base font-semibold text-white shadow-lg shadow-purple-900/30 transition hover:bg-purple-600 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isLocked
            ? "This event is locked"
            : submitting
            ? "Submitting..."
            : !canSubmit
            ? "Answer every question"
            : "Lock Your Bonus Picks"}
        </button>
      )}
      {hasQuestions && hasSubmitted && (
        <div className="mt-2 w-full rounded-xl border border-purple-500/40 bg-purple-900/40 px-5 py-3 text-center text-base font-semibold text-purple-100/90">
          {isLocked ? "Final Picks" : "Picks Submitted"}
        </div>
      )}
      {submitError && (
        <p className="mt-3 text-center text-sm text-red-300">{submitError}</p>
      )}
    </div>
  );
};

export default BonusPredictionsView;

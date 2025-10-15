import React, { useState } from "react";
import { ArrowLeft, BarChart3, CalendarDays, ChevronDown, ChevronUp, RefreshCcw, Trophy } from "lucide-react";

import { cn } from "~/lib/utils";
import type {
  BonusEventResult,
  BonusQuestionResult,
  RaceCategoryResult,
  RaceResultEntry,
  SeasonResults,
} from "../types";

interface ResultsViewProps {
  fid: number | string | null;
  seasons: SeasonResults[];
  loading: boolean;
  error: string | null;
  onReload: () => Promise<void>;
  onBack: () => void;
}

const statusLabelMap: Record<RaceCategoryResult["status"], string> = {
  correct: "Correct",
  incorrect: "Off target",
  missing: "No pick",
  pending: "Awaiting results",
};

const bonusStatusLabelMap: Record<BonusQuestionResult["status"], string> = {
  correct: "Correct",
  incorrect: "Off target",
  missing: "No pick",
  pending: "Awaiting results",
};

function formatDate(isoString: string | null): string {
  if (!isoString) return "—";
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function formatText(value: string | null): string {
  if (!value) return "—";
  return value;
}

interface RaceCardProps {
  race: RaceResultEntry;
  expanded: boolean;
  onToggle: () => void;
}

function RaceCard({ race, expanded, onToggle }: RaceCardProps) {
  return (
    <div className="rounded-2xl border border-gray-700 bg-gray-800/90 p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <button
          type="button"
          onClick={onToggle}
          className="group flex flex-1 items-start justify-between gap-3 text-left"
        >
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-lg font-semibold text-white">
                {race.round !== null ? `Round ${race.round} • ` : ""}
                {race.name}
              </h4>
              {expanded ? (
                <ChevronUp className="h-4 w-4 text-gray-400 transition group-hover:text-white" />
              ) : (
                <ChevronDown className="h-4 w-4 text-gray-400 transition group-hover:text-white" />
              )}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-400">
              <span>{formatDate(race.raceDate)}</span>
              {race.circuit && (
                <>
                  <span>•</span>
                  <span>{race.circuit}</span>
                </>
              )}
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs uppercase tracking-widest text-gray-400">Points</p>
            <p className="text-2xl font-bold text-red-400">{race.totalPointsEarned}</p>
          </div>
        </button>
      </div>

      {expanded && (
        <div className="mt-5 space-y-3">
          {race.categories.map((category) => {
            const statusLabel = statusLabelMap[category.status];
            return (
              <div
                key={category.key}
                className={cn(
                  "rounded-xl border bg-gray-900/60 px-4 py-3 transition",
                  category.status === "correct" && "border-green-500/60 bg-green-500/10",
                  category.status === "incorrect" && "border-red-500/40",
                  category.status === "missing" && "border-gray-700 text-gray-400",
                  category.status === "pending" && "border-dashed border-gray-600 text-gray-500"
                )}
              >
                <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-white">{category.label}</p>
                    <p className="text-xs text-gray-400">
                      Actual: <span className="text-gray-200">{formatText(category.actual)}</span>
                    </p>
                    <p className="text-xs text-gray-400">
                      Your pick:
                      <span className="text-gray-200"> {formatText(category.predicted)}</span>
                    </p>
                  </div>
                  <div className="text-left sm:text-right">
                    <p className="text-xs uppercase tracking-wide text-gray-400">{statusLabel}</p>
                    <p className="text-sm font-semibold text-white">
                      {category.pointsEarned}/{category.pointsAvailable} pts
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

interface BonusEventCardProps {
  event: BonusEventResult;
  expanded: boolean;
  onToggle: () => void;
}

function BonusEventCard({ event, expanded, onToggle }: BonusEventCardProps) {
  const hasQuestions = event.questions.length > 0;

  return (
    <div className="rounded-2xl border border-purple-600/40 bg-purple-900/20 p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <button
          type="button"
          onClick={onToggle}
          className="group flex flex-1 items-start justify-between gap-3 text-left"
        >
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-lg font-semibold text-white">{event.title}</h4>
              {expanded ? (
                <ChevronUp className="h-4 w-4 text-purple-200/80 transition group-hover:text-white" />
              ) : (
                <ChevronDown className="h-4 w-4 text-purple-200/80 transition group-hover:text-white" />
              )}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-purple-200/90">
              <span className="uppercase tracking-widest">{event.type}</span>
              {event.relatedRaceName && (
                <>
                  <span>•</span>
                  <span>{event.relatedRaceName}</span>
                </>
              )}
              {(event.locksAt || event.publishedAt) && (
                <>
                  <span>•</span>
                  <span>{formatDate(event.locksAt ?? event.publishedAt)}</span>
                </>
              )}
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs uppercase tracking-widest text-purple-200/80">Points</p>
            <p className="text-2xl font-bold text-purple-200">
              {event.totalPointsEarned}/{event.totalPointsAvailable}
            </p>
          </div>
        </button>
      </div>

      {expanded &&
        (hasQuestions ? (
          <div className="mt-5 space-y-3">
            {event.questions.map((question) => {
              const statusLabel = bonusStatusLabelMap[question.status];
              return (
                <div
                  key={question.questionId}
                  className={cn(
                    "rounded-xl border border-purple-500/30 bg-purple-800/20 px-4 py-3",
                    question.status === "correct" && "border-green-500/60 bg-green-500/10",
                    question.status === "incorrect" && "border-red-500/40",
                    question.status === "missing" && "border-purple-700/50 text-purple-200/70",
                    question.status === "pending" && "border-dashed border-purple-600/40 text-purple-200/70"
                  )}
                >
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-white">{question.prompt}</p>
                      <p className="text-xs text-purple-100/80">
                        Correct:
                        <span className="text-purple-50">
                          {" "}
                          {question.correctOptions.length ? question.correctOptions.join(", ") : "—"}
                        </span>
                      </p>
                      <p className="text-xs text-purple-100/80">
                        Your picks:
                        <span className="text-purple-50">
                          {" "}
                          {question.userSelections.length ? question.userSelections.join(", ") : "—"}
                        </span>
                      </p>
                    </div>
                    <div className="text-left sm:text-right">
                      <p className="text-xs uppercase tracking-wide text-purple-100/80">{statusLabel}</p>
                      <p className="text-sm font-semibold text-white">
                        {question.pointsEarned}/{question.pointsAvailable} pts
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="mt-4 text-sm text-purple-100/80">No question data available for this event.</p>
        ))}
    </div>
  );
}

const ResultsView: React.FC<ResultsViewProps> = ({ fid, seasons, loading, error, onReload, onBack }) => {
  const hasResults = seasons.some((season) => season.races.length > 0 || season.bonusEvents.length > 0);
  const [expandedRaces, setExpandedRaces] = useState<Record<string, boolean>>({});
  const [expandedEvents, setExpandedEvents] = useState<Record<string, boolean>>({});

  return (
    <div className="flex-1 px-4 pb-8 pt-5 sm:p-6">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 text-2xl font-bold text-white">
          <BarChart3 className="h-7 w-7 text-green-300" />
          Results
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-2 rounded-lg border border-gray-600 px-4 py-2 text-sm text-gray-200 transition-all hover:bg-gray-700"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
          <button
            type="button"
            onClick={() => {
              void onReload();
            }}
            disabled={loading || !fid}
            className={cn(
              "flex items-center gap-2 rounded-lg border border-green-500/60 px-4 py-2 text-sm text-green-200 transition-all hover:bg-green-500 hover:text-gray-900",
              (loading || !fid) && "cursor-not-allowed opacity-60 hover:bg-transparent hover:text-green-200"
            )}
          >
            <RefreshCcw className={cn("h-4 w-4", loading && "animate-spin")} />
            Refresh
          </button>
        </div>
      </div>

      {!fid && (
        <div className="rounded-2xl border border-gray-700 bg-gray-800/80 p-6 text-center text-sm text-gray-300">
          Connect your Farcaster account to see how your predictions scored.
        </div>
      )}

      {fid && error && (
        <div className="mb-5 rounded-2xl border border-red-500/60 bg-red-500/10 p-4 text-sm text-red-200">
          {error}
        </div>
      )}

      {fid && loading && !hasResults && (
        <div className="rounded-2xl border border-gray-700 bg-gray-800/80 p-6 text-center text-sm text-gray-300">
          Loading results…
        </div>
      )}

      {fid && !loading && !error && !hasResults && (
        <div className="rounded-2xl border border-gray-700 bg-gray-800/80 p-6 text-center text-sm text-gray-300">
          No scored races or bonus events yet. Check back after the next event wraps.
        </div>
      )}

      {fid &&
        seasons.map((season) => {
          const seasonHasContent = season.races.length > 0 || season.bonusEvents.length > 0;
          if (!seasonHasContent) return null;

          const sortedRaces = season.races
            .slice()
            .sort((a, b) => {
              if (a.round !== null && b.round !== null && a.round !== b.round) {
                return b.round - a.round;
              }
              const dateA = a.raceDate ? new Date(a.raceDate).getTime() : 0;
              const dateB = b.raceDate ? new Date(b.raceDate).getTime() : 0;
              return dateB - dateA;
            });

          const sortedEvents = season.bonusEvents
            .slice()
            .sort((a, b) => {
              const timeA = a.locksAt
                ? new Date(a.locksAt).getTime()
                : a.publishedAt
                  ? new Date(a.publishedAt).getTime()
                  : 0;
              const timeB = b.locksAt
                ? new Date(b.locksAt).getTime()
                : b.publishedAt
                  ? new Date(b.publishedAt).getTime()
                  : 0;
              return timeB - timeA;
            });

          return (
            <div key={season.season} className="mb-8">
              <div className="mb-4 flex items-center gap-2 text-xl font-semibold text-white">
                <Trophy className="h-5 w-5 text-yellow-400" />
                Season {season.season}
              </div>

              {sortedRaces.length > 0 && (
                <div className="space-y-4">
                  {sortedRaces.map((race) => {
                    const isExpanded = expandedRaces[race.raceId] ?? false;
                    return (
                      <RaceCard
                        key={race.raceId}
                        race={race}
                        expanded={isExpanded}
                        onToggle={() =>
                          setExpandedRaces((previous) => ({
                            ...previous,
                            [race.raceId]: !isExpanded,
                          }))
                        }
                      />
                    );
                  })}
                </div>
              )}

              {sortedEvents.length > 0 && (
                <div className="mt-6 space-y-4">
                  <div className="flex items-center gap-2 text-lg font-semibold text-purple-200">
                    <CalendarDays className="h-5 w-5 text-purple-300" />
                    Bonus Events
                  </div>
                  {sortedEvents.map((event) => {
                    const isExpanded = expandedEvents[event.eventId] ?? false;
                    return (
                      <BonusEventCard
                        key={event.eventId}
                        event={event}
                        expanded={isExpanded}
                        onToggle={() =>
                          setExpandedEvents((previous) => ({
                            ...previous,
                            [event.eventId]: !isExpanded,
                          }))
                        }
                      />
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
    </div>
  );
};

export default ResultsView;

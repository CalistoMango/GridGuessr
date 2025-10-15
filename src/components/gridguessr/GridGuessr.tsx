"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useMiniApp } from "@neynar/react";

// High-level orchestration hooks and helpers. Each hook owns the data lifecycle
// for a specific feature surface (predictions, DOTD, etc.). This file's job is to
// glue those pieces together and decide which view to render.

import { useLeaderboards } from "./hooks/useLeaderboards";
import { useDriverOfTheDay } from "./hooks/useDriverOfTheDay";
import { useBonusPredictions } from "./hooks/useBonusPredictions";
import { usePredictionsState } from "./hooks/usePredictionsState";
import { useRaceSummary } from "./hooks/useRaceSummary";
import { useUserBadges } from "./hooks/useUserBadges";
import { useResults } from "./hooks/useResults";
import { computeBonusLockText, computeLockMetadata, useMarginBuckets } from "./utils";
import {
  LeaderboardEntry,
  LeaderboardTab,
  PodiumSetter,
  PredictionModalId,
  PredictionSetter,
  ViewState,
} from "./types";
import GridGuessrHeader from "./components/GridGuessrHeader";
import HomeView from "./views/HomeView";
import PredictionView from "./views/PredictionView";
import SubmittedView from "./views/SubmittedView";
import LeaderboardView from "./views/LeaderboardView";
import DriverOfTheDayView from "./views/DriverOfTheDayView";
import BadgesView from "./views/BadgesView";
import BonusPredictionsView from "./views/BonusPredictionsView";
import ResultsView from "./views/ResultsView";
import PredictionModals from "./components/PredictionModals";
import BonusOptionsModal from "./components/BonusOptionsModal";

export default function GridGuessr() {
  const { context: frameContext } = useMiniApp();
  const frameFid = frameContext?.user?.fid ?? null;
  const [fid, setFid] = useState<number | string | null>(frameFid ?? null);
  const frameUser = (frameContext?.user as Record<string, any>) ?? null;
  // Normalize the Farcaster user object so we can pass a consistent profile shape
  // into hooks regardless of which fields happen to be present.
  const frameProfile = useMemo(
    () => ({
      username: frameUser?.username ?? null,
      displayName: frameUser?.displayName ?? frameUser?.name ?? null,
      pfpUrl: frameUser?.pfpUrl ?? frameUser?.pfp?.url ?? null,
    }),
    [frameUser?.displayName, frameUser?.name, frameUser?.pfp?.url, frameUser?.pfpUrl, frameUser?.username]
  );

  useEffect(() => {
    const normalizeFid = (candidate: string | number | null | undefined): number | string | null => {
      if (candidate === null || candidate === undefined) return null;
      if (typeof candidate === "number" && Number.isInteger(candidate)) return candidate;
      if (typeof candidate === "string") {
        const trimmed = candidate.trim();
        if (!trimmed) return null;
        const parsed = Number(trimmed);
        if (!Number.isNaN(parsed) && Number.isInteger(parsed)) {
          return parsed;
        }
        return trimmed;
      }
      return null;
    };

    const trySetFid = (candidate: number | string | null) => {
      if (candidate === null || candidate === undefined) return false;
      setFid((current) => (current === candidate ? current : candidate));
      if (typeof window !== "undefined" && candidate !== null) {
        window.localStorage.setItem("gridguessr_dev_fid", String(candidate));
      }
      return true;
    };

    if (frameFid !== null && frameFid !== undefined) {
      const resolved = Number.isNaN(Number(frameFid))
        ? frameFid
        : Number(frameFid);
      trySetFid(resolved);
      return;
    }

    const candidates: Array<string | number | null> = [];

    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      candidates.push(params.get("devFid"));
      candidates.push(params.get("fid"));
      candidates.push(window.localStorage.getItem("gridguessr_dev_fid"));
    }

    candidates.push(process.env.NEXT_PUBLIC_DEV_FID ?? null);

    const adminEnv =
      process.env.NEXT_PUBLIC_ADMIN_FIDS ??
      process.env.ADMIN_FIDS ??
      "";

    adminEnv
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean)
      .forEach((entry) => candidates.push(entry));

    candidates.push("1"); // absolute fallback – make choosing a fid deterministic locally

    for (const candidate of candidates) {
      const resolved = normalizeFid(candidate);
      if (trySetFid(resolved)) {
        return;
      }
    }

    setFid(null);
  }, [frameFid]);

  // Buckets shown in the winning margin modal (memoised helper).
  const marginBuckets = useMarginBuckets();
  const [view, setView] = useState<ViewState>("home");
  const [leaderboardTab, setLeaderboardTab] = useState<LeaderboardTab>("global");
  const [showModal, setShowModal] = useState<PredictionModalId | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [activeBonusQuestionId, setActiveBonusQuestionId] = useState<string | null>(null);
  const [bonusSubmitError, setBonusSubmitError] = useState<string | null>(null);

  const {
    race,
    displayRace,
    previousRace,
    drivers,
    teams,
    loading,
  } = useRaceSummary(fid);

  // Derived race lock metadata is computed once and reused across views.
  const { lockCountdownText, lockLocalTimeText, isLocked } = useMemo(
    () => computeLockMetadata(displayRace, race),
    [displayRace, race]
  );

  const {
    predictions,
    hasSubmittedSlate,
    isEditingSlate,
    setIsEditingSlate,
    isSubmitting,
    submitError,
    setPredictionValue: updatePrediction,
    setPodiumPosition: updatePodium,
    submitPredictions,
    completion,
  } = usePredictionsState({
    fid,
    race,
    drivers,
    teams,
    isLocked,
    frameProfile,
    onSubmitSuccess: () => setView("submitted"),
  });

  const {
    activeEvent: activeBonusEvent,
    responses: bonusResponses,
    loading: bonusLoading,
    submittingEventId: bonusSubmittingEventId,
    updateSelection: updateBonusSelection,
    submitEvent: submitBonusEvent,
    getCompletion: getBonusCompletion,
  } = useBonusPredictions({
    fid,
    frameProfile,
  });

  // Modal callbacks close the modal after pushing the selected value down
  // into the shared predictions hook.
  const handleSetPrediction: PredictionSetter = (prop, value) => {
    updatePrediction(prop, value);
    setShowModal(null);
  };

  const handleSetPodium: PodiumSetter = (position, driver) => {
    updatePodium(position, driver);
    setShowModal(null);
  };

  const activeBonusState = activeBonusEvent ? bonusResponses[activeBonusEvent.id] : undefined;
  const bonusCompletion = activeBonusEvent ? getBonusCompletion(activeBonusEvent.id) : null;
  const bonusLockInfo = activeBonusEvent
    ? computeBonusLockText(activeBonusEvent.locksAt, activeBonusEvent.status)
    : null;
  const isBonusLocked = bonusLockInfo?.isLocked ?? false;
  const isSubmittingBonus = activeBonusEvent
    ? bonusSubmittingEventId === activeBonusEvent.id
    : false;
  const canSubmitBonus = Boolean(
    bonusCompletion && bonusCompletion.total > 0 && bonusCompletion.percentage === 100
  );

  useEffect(() => {
    if (canSubmitBonus && bonusSubmitError) {
      setBonusSubmitError(null);
    }
  }, [canSubmitBonus, bonusSubmitError]);

  const handleBonusCommitSelection = (questionId: string, optionIds: string[]) => {
    if (!activeBonusEvent) return;
    updateBonusSelection(activeBonusEvent.id, questionId, { selectedOptionIds: optionIds });
  };

  const handleSubmitBonus = async () => {
    if (!activeBonusEvent) return;
    if (!fid) {
      setBonusSubmitError("Connect your Farcaster account to submit bonus picks.");
      return;
    }
    if (!canSubmitBonus) {
      setBonusSubmitError("Answer every question before locking.");
      return;
    }
    setBonusSubmitError(null);
    const success = await submitBonusEvent(activeBonusEvent.id);
    if (success) {
      setView("home");
    }
    if (!success) {
      setBonusSubmitError("Unable to submit bonus picks. Please try again.");
    }
  };

  const activeBonusModalQuestion = activeBonusQuestionId
    ? activeBonusEvent?.questions.find((question) => question.id === activeBonusQuestionId) ?? null
    : null;
  const activeBonusModalSelection = activeBonusModalQuestion && activeBonusEvent
    ? bonusResponses[activeBonusEvent.id]?.responses?.[activeBonusModalQuestion.id]?.selectedOptionIds ?? []
    : [];

  const { leaderboard, friendsLeaderboard } = useLeaderboards(fid);
  const { userBadges } = useUserBadges(fid);
  const {
    seasons: resultSeasons,
    loading: resultsLoading,
    error: resultsError,
    refresh: refreshResults,
  } = useResults(fid, { enabled: view === "results" });
  // On each FID change, re-check admin privileges so we can unlock extra UI affordances (e.g. hidden links).
  useEffect(() => {
    let cancelled = false;

    const checkAdmin = async () => {
      if (!fid) {
        if (!cancelled) setIsAdmin(false);
        return;
      }

      try {
        const response = await fetch("/api/admin/auth", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fid }),
        });

        if (cancelled) return;

        if (response.ok) {
          const data = await response.json();
          setIsAdmin(Boolean(data?.authenticated));
        } else {
          setIsAdmin(false);
        }
      } catch {
        if (!cancelled) setIsAdmin(false);
      }
    };

    checkAdmin();

    return () => {
      cancelled = true;
    };
  }, [fid]);

  const {
    dotdVote,
    dotdData,
    dotdSubmitted,
    dotdMessage,
    selectDriver: handleDotdSelection,
    submitVote: submitDotdVote,
  } = useDriverOfTheDay({
    fid,
    previousRace,
    activeView: view,
    frameProfile,
  });

  // Disable submission while locked, incomplete, or already submitting.
  const isSubmitDisabled = isLocked || completion.percentage < 100 || isSubmitting;
  const topDotdVote = dotdData?.votes?.[0];
  const currentLeader = leaderboard[0];
  const userLeaderboardEntry = fid
    ? leaderboard.find((entry: LeaderboardEntry) => entry.fid === fid) ?? null
    : null;

  // Hard gate for production so the mini-app only works inside Farcaster.
  if (process.env.NODE_ENV === "production" && !frameContext) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-gray-900 via-black to-gray-900 p-4">
        <div className="max-w-md p-8 text-center text-white">
          <h2 className="mb-4 text-2xl font-bold">Access via Farcaster</h2>
          <p className="text-gray-400">This app must be opened through the Farcaster app.</p>
        </div>
      </div>
    );
  }

  // In production we also require a resolved FID before showing the UI.
  if (process.env.NODE_ENV === "production" && !fid) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-gray-900 via-black to-gray-900 p-4">
        <div className="max-w-md p-8 text-center text-white">
          <h2 className="mb-4 text-2xl font-bold">Authentication Required</h2>
          <p className="text-gray-400">Unable to get your Farcaster ID. Please try reopening the app.</p>
        </div>
      </div>
    );
  }

  // Global loading fallback while we bootstrap the race context.
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black">
        <div className="text-white">Loading...</div>
      </div>
    );
  }

  // If there is no active race we keep the rest of the UI hidden and show
  // a simple empty-state instead.
  if (!race) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-gray-900 via-black to-gray-900">
        <div className="p-8 text-center text-white">
          <h2 className="mb-4 text-2xl font-bold">No Active Race</h2>
          <p className="text-gray-400">Check back when the next race is scheduled!</p>
        </div>
      </div>
    );
  }

  // Compose the shared chrome plus whichever view matches the current state.
  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-gray-900 via-black to-gray-900 sm:flex sm:items-center sm:justify-center sm:p-6">
      <div className="mx-auto flex min-h-screen w-full flex-col bg-gray-900 text-white sm:min-h-0 sm:max-w-3xl sm:overflow-hidden sm:rounded-2xl sm:border-2 sm:border-red-500 sm:shadow-2xl">
        <GridGuessrHeader
          activeView={view}
          onNavigateHome={() => setView("home")}
          onNavigateBadges={() => setView("badges")}
        />

        {view === "home" && (
          <HomeView
            displayRace={displayRace}
            lockCountdownText={lockCountdownText}
            lockLocalTimeText={lockLocalTimeText}
            hasSubmittedSlate={hasSubmittedSlate}
            onOpenPredict={() => {
              setIsEditingSlate(false);
              setView("predict");
            }}
            onOpenDotd={() => setView("dotd")}
            onOpenLeaderboard={() => setView("leaderboard")}
            onOpenResults={() => setView("results")}
            previousRace={previousRace}
            topDotdVote={topDotdVote}
            dotdData={dotdData}
            userLeaderboardEntry={userLeaderboardEntry}
            currentLeader={currentLeader}
            bonusEvent={activeBonusEvent}
            bonusCompletion={bonusCompletion}
            bonusLockText={bonusLockInfo?.text ?? null}
            onOpenBonus={() => {
              if (!activeBonusEvent) return;
              setView("bonus");
            }}
            bonusLocked={isBonusLocked}
          />
        )}

        {view === "predict" && (!hasSubmittedSlate || isEditingSlate) && !isLocked && (
          <PredictionView
            race={race}
            lockCountdownText={lockCountdownText}
            predictions={predictions}
            drivers={drivers}
            completion={completion}
            isLocked={isLocked}
            onOpenModal={(modalId) => {
              if (isLocked) return;
              setShowModal(modalId);
            }}
            onSetPrediction={handleSetPrediction}
            onSetPodium={handleSetPodium}
            onSubmit={submitPredictions}
            isSubmitting={isSubmitting}
            isSubmitDisabled={isSubmitDisabled}
            submitError={submitError}
          />
        )}

        {(view === "submitted" || (view === "predict" && ((hasSubmittedSlate && !isEditingSlate) || isLocked))) && (
          <SubmittedView
            race={race}
            predictions={predictions}
            isLocked={isLocked}
            onEditSlate={() => {
              if (!isLocked) {
                setIsEditingSlate(true);
                setView("predict");
              }
            }}
            onViewLeaderboard={() => setView("leaderboard")}
          />
        )}

        {view === "leaderboard" && (
          <LeaderboardView
            leaderboard={leaderboard}
            friendsLeaderboard={friendsLeaderboard}
            activeTab={leaderboardTab}
            onTabChange={setLeaderboardTab}
            fid={fid}
            onBackToPredict={() => setView("home")}
          />
        )}

        {view === "dotd" && (
          <DriverOfTheDayView
            previousRace={previousRace}
            drivers={drivers}
            dotdVote={dotdVote}
            dotdData={dotdData}
            dotdSubmitted={dotdSubmitted}
            dotdMessage={dotdMessage}
            onSelectDriver={handleDotdSelection}
            onSubmitVote={submitDotdVote}
            onBack={() => setView("home")}
          />
        )}

        {view === "bonus" && bonusLoading && (
          <div className="flex-1 px-6 py-10 text-center text-sm text-gray-400">
            Loading bonus event…
          </div>
        )}

        {view === "bonus" && !bonusLoading && (
          activeBonusEvent ? (
            <BonusPredictionsView
              event={activeBonusEvent}
              responses={activeBonusState}
              drivers={drivers}
              teams={teams}
              completion={
                bonusCompletion ?? {
                  completed: 0,
                  total: activeBonusEvent.questions.length,
                  percentage: 0,
                }
              }
              isLocked={isBonusLocked}
              submitting={isSubmittingBonus}
              canSubmit={canSubmitBonus}
              submitError={bonusSubmitError}
              onOpenQuestion={(questionId) => {
                if (isBonusLocked) return;
                setActiveBonusQuestionId(questionId);
              }}
              onSubmit={handleSubmitBonus}
              onBack={() => setView("home")}
            />
          ) : (
            <div className="flex-1 px-6 py-10 text-center text-sm text-gray-400">
              No bonus event is open right now. Check back soon!
            </div>
          )
        )}

        {view === "results" && (
          <ResultsView
            fid={fid}
            seasons={resultSeasons}
            loading={resultsLoading}
            error={resultsError}
            onReload={refreshResults}
            onBack={() => setView("home")}
          />
        )}

        {view === "badges" && (
          <BadgesView
            userBadges={userBadges}
            isAdmin={isAdmin}
            adminFid={typeof fid === "number" ? fid : null}
            onBackToPredict={() => setView("home")}
          />
        )}
      </div>

      <PredictionModals
        showModal={showModal}
        drivers={drivers}
        teams={teams}
        marginBuckets={marginBuckets}
        onClose={() => setShowModal(null)}
        onSelectDriver={handleSetPrediction}
        onSelectPodium={handleSetPodium}
      />
      {activeBonusModalQuestion && activeBonusEvent && (
        <BonusOptionsModal
          question={activeBonusModalQuestion}
          selectedOptionIds={activeBonusModalSelection}
          drivers={drivers}
          teams={teams}
          onCommit={(optionIds) => {
            handleBonusCommitSelection(activeBonusModalQuestion.id, optionIds);
            setActiveBonusQuestionId(null);
          }}
          onClose={() => setActiveBonusQuestionId(null)}
        />
      )}
    </div>
  );
}

"use client";

import React, { useMemo, useState } from "react";
import { useMiniApp } from "@neynar/react";

// High-level orchestration hooks and helpers. Each hook owns the data lifecycle
// for a specific feature surface (predictions, DOTD, etc.). This file's job is to
// glue those pieces together and decide which view to render.

import { useLeaderboards } from "./hooks/useLeaderboards";
import { useDriverOfTheDay } from "./hooks/useDriverOfTheDay";
import { usePredictionsState } from "./hooks/usePredictionsState";
import { useRaceSummary } from "./hooks/useRaceSummary";
import { useUserBadges } from "./hooks/useUserBadges";
import { computeLockMetadata, useMarginBuckets } from "./utils";
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
import PredictionModals from "./components/PredictionModals";

export default function GridGuessr() {
  const { context: frameContext } = useMiniApp();
  const fid = frameContext?.user?.fid ?? null;
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

  // Buckets shown in the winning margin modal (memoised helper).
  const marginBuckets = useMarginBuckets();
  const [view, setView] = useState<ViewState>("home");
  const [leaderboardTab, setLeaderboardTab] = useState<LeaderboardTab>("global");
  const [showModal, setShowModal] = useState<PredictionModalId | null>(null);

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

  const { leaderboard, friendsLeaderboard } = useLeaderboards(fid);
  const { userBadges } = useUserBadges(fid);

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
            previousRace={previousRace}
            topDotdVote={topDotdVote}
            dotdData={dotdData}
            userLeaderboardEntry={userLeaderboardEntry}
            currentLeader={currentLeader}
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
            onBackToPredict={() => setView("predict")}
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

        {view === "badges" && (
          <BadgesView
            userBadges={userBadges}
            onBackToPredict={() => setView("predict")}
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
    </div>
  );
}

"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { Trophy, Flag, Users, TrendingUp, Clock, Zap, Timer, AlertTriangle, Target, Globe, Share2, Award, ThumbsUp, CheckCircle, Star, X, Home } from 'lucide-react';
import { useMiniApp } from '@neynar/react';
import { APP_URL, APP_NAME } from '~/lib/constants';
import { sdk } from '@farcaster/miniapp-sdk';

interface Driver {
  id: string;
  name: string;
  team: string;
  number: string;
  color: string;
}

interface Team {
  id: string;
  name: string;
  color: string;
}

interface Race {
  id: string;
  name: string;
  circuit: string;
  race_date: string;
  lock_time: string;
  status: string;
  wildcard_question?: string;
}

export default function GridGuessr() {
  // ---- Farcaster context ----
  const { context: frameContext, actions } = useMiniApp();
  const fid = frameContext?.user?.fid;
  const frameUser: any = frameContext?.user;
  const frameUsername = frameUser?.username ?? null;
  const frameDisplayName = frameUser?.displayName ?? frameUser?.name ?? null;
  const framePfpUrl = frameUser?.pfpUrl ?? frameUser?.pfp?.url ?? null;

  // ---- Local view state ----
  const [view, setView] = useState<'home' | 'predict' | 'leaderboard' | 'dotd' | 'badges' | 'submitted'>('home');
  const [leaderboardTab, setLeaderboardTab] = useState('global');
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState<string | null>(null);
  const [hasSubmittedSlate, setHasSubmittedSlate] = useState(false);
  const [isEditingSlate, setIsEditingSlate] = useState(false);
  
  // ---- Race data ----
  const [race, setRace] = useState<Race | null>(null);
  const [displayRace, setDisplayRace] = useState<Race | null>(null);
  const [previousRace, setPreviousRace] = useState<Race | null>(null);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  
  // Predictions
  const [predictions, setPredictions] = useState({
    pole: null as Driver | null,
    podium: [null, null, null] as (Driver | null)[],
    fastestLap: null as Driver | null,
    fastestPitStop: null as Team | null,
    firstDNF: null as Driver | string | null,
    safetyCar: null as boolean | null,
    winningMargin: null as string | null,
    wildcard: null as boolean | null
  });

  // Leaderboard data
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [friendsLeaderboard, setFriendsLeaderboard] = useState<any[]>([]);
  const [dotdVote, setDotdVote] = useState<Driver | null>(null);
  const [dotdData, setDotdData] = useState<any>(null);
  const [dotdMessage, setDotdMessage] = useState<string | null>(null);
  const [dotdSubmitted, setDotdSubmitted] = useState(false);
  const [userBadges, setUserBadges] = useState<any>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const marginBuckets = ['0-2s', '2-4s', '4-7s', '7-12s', '12-20s', '20s+'];

  // Reset vote UI whenever the reference race changes
  useEffect(() => {
    setDotdVote(null);
    setDotdMessage(null);
    setDotdSubmitted(false);
  }, [previousRace?.id]);

  const shareCast = useCallback(async (text: string) => {
    try {
      if (actions?.composeCast) {
        await actions.composeCast({ text });
      } else {
        console.log('Share to cast:', text);
      }
    } catch (error) {
      console.error('Error composing cast:', error);
    }
  }, [actions]);

  const handleDotdSelection = (driver: Driver) => {
    setDotdMessage(null);
    setDotdVote(driver);
    setDotdSubmitted(false);
  };

  const fetchUserPrediction = useCallback(async (
    raceId: string,
    driverList: Driver[],
    teamList: Team[]
  ) => {
    try {
      const res = await fetch(`/api/predictions?fid=${fid}&raceId=${raceId}`);
      const data = await res.json();
      if (data.prediction) {
      setPredictions({
        pole: driverList.find(d => d.id === data.prediction.pole_driver_id) || null,
        podium: [
          driverList.find(d => d.id === data.prediction.winner_driver_id) || null,
          driverList.find(d => d.id === data.prediction.second_driver_id) || null,
          driverList.find(d => d.id === data.prediction.third_driver_id) || null
        ],
        fastestLap: driverList.find(d => d.id === data.prediction.fastest_lap_driver_id) || null,
        fastestPitStop: teamList.find(t => t.id === data.prediction.fastest_pit_team_id) || null,
        firstDNF: data.prediction.no_dnf
          ? 'none'
          : driverList.find(d => d.id === data.prediction.first_dnf_driver_id) || null,
        safetyCar: data.prediction.safety_car,
        winningMargin: data.prediction.winning_margin,
        wildcard: data.prediction.wildcard_answer
      });
      setHasSubmittedSlate(true);
      setIsEditingSlate(false);
    }
  } catch (error) {
    console.error('Error fetching prediction:', error);
    setHasSubmittedSlate(false);
    setIsEditingSlate(false);
  }
}, [fid]);

  // Fetch current race context plus driver/team roster
  const fetchRaceData = useCallback(async () => {
    try {
      const res = await fetch('/api/races/summary');
      const data = await res.json();
      setRace(data.currentRace ?? null);
      setDisplayRace(data.displayRace ?? data.currentRace ?? null);
      setPreviousRace(data.previousCompletedRace ?? null);
      setDrivers(data.drivers ?? []);
      setTeams(data.teams ?? []);

      if (fid && data.currentRace) {
        await fetchUserPrediction(data.currentRace.id, data.drivers ?? [], data.teams ?? []);
      } else {
        setHasSubmittedSlate(false);
        setIsEditingSlate(false);
      }
    } catch (error) {
      console.error('Error fetching race data:', error);
    } finally {
      setLoading(false);
    }
  }, [fid, fetchUserPrediction]);

  const fetchLeaderboards = useCallback(async () => {
    try {
      const [globalRes, friendsRes] = await Promise.all([
        fetch('/api/leaderboard?type=global&limit=100'),
        fetch(`/api/leaderboard?type=friends&fid=${fid}`)
      ]);

      const globalData = await globalRes.json();
      const friendsData = await friendsRes.json();

      setLeaderboard(globalData.leaderboard || []);
      setFriendsLeaderboard(friendsData.leaderboard || []);
    } catch (error) {
      console.error('Error fetching leaderboards:', error);
    }
  }, [fid]);

  const fetchUserBadges = useCallback(async () => {
    if (!fid) return;
    try {
      const res = await fetch(`/api/badges?fid=${fid}`);
      const data = await res.json();
      setUserBadges(data.badges || {});
    } catch (error) {
      console.error('Error fetching badges:', error);
    }
  }, [fid]);

  const fetchDotdData = useCallback(async (raceId: string, fidParam?: string | number | null) => {
    try {
      const fidQuery = fidParam ? `&fid=${fidParam}` : fid ? `&fid=${fid}` : '';
      const res = await fetch(`/api/dotd?raceId=${raceId}${fidQuery}`);
      const data = await res.json();
      const sortedVotes = Array.isArray(data?.votes)
        ? [...data.votes].sort((a, b) => (b.votes ?? 0) - (a.votes ?? 0))
        : [];
      setDotdData({
        ...data,
        votes: sortedVotes,
      });
      if (data?.userVote?.driver) {
        setDotdVote(data.userVote.driver);
        setDotdSubmitted(true);
      } else {
        setDotdSubmitted(false);
        setDotdVote(null);
      }
    } catch (error) {
      console.error('Error fetching DOTD:', error);
    }
  }, [fid]);

  useEffect(() => {
    fetchRaceData();
    if (fid) {
      fetchLeaderboards();
      fetchUserBadges();
    }
  }, [fid, fetchLeaderboards, fetchRaceData, fetchUserBadges]);

  // Whenever the DOTD view is visible, load the vote data for the most recent completed race
  useEffect(() => {
    if (!previousRace?.id) return;
    if (view === 'dotd' || view === 'home') {
      fetchDotdData(previousRace.id, fid);
    }
  }, [view, previousRace, fetchDotdData, fid]);

  // ---- Derived lock metadata ----
  const lockReference = displayRace ?? race;
  const lockDate = lockReference ? new Date(lockReference.lock_time) : null;
  const now = new Date();
  let lockCountdownText = 'Lock time TBD';
  let lockLocalTimeText = '';
  let isLocked = false;

  if (lockDate) {
    const diffMs = lockDate.getTime() - now.getTime();
    if (diffMs > 0) {
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
        const hours = totalHours;
        const minutes = totalMinutes % 60;
        if (hours > 0) parts.push(`${hours}h`);
        parts.push(`${minutes}m`);
      }

      lockCountdownText = `Locks in ${parts.join(' ')}`;
    } else {
      lockCountdownText = 'Grid locked';
      isLocked = true;
    }

    lockLocalTimeText = lockDate.toLocaleString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short'
    });

    if (lockReference?.status === 'locked' || lockReference?.status === 'completed') {
      isLocked = true;
      lockCountdownText = 'Grid locked';
    }
  } else if (lockReference?.status === 'locked' || lockReference?.status === 'completed') {
    isLocked = true;
    lockCountdownText = 'Grid locked';
  }

  // NOW we can do conditional returns after all hooks
  // Block access if not in Farcaster context (except in development)
  if (process.env.NODE_ENV === 'production' && !frameContext) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900 p-4">
        <div className="text-center text-white p-8 max-w-md">
          <h2 className="text-2xl font-bold mb-4">Access via Farcaster</h2>
          <p className="text-gray-400">This app must be opened through the Farcaster app.</p>
        </div>
      </div>
    );
  }

  // Allow in dev without FID, but require it in production
  if (process.env.NODE_ENV === 'production' && !fid) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900 p-4">
        <div className="text-center text-white p-8 max-w-md">
          <h2 className="text-2xl font-bold mb-4">Authentication Required</h2>
          <p className="text-gray-400">Unable to get your Farcaster ID. Please try reopening the app.</p>
        </div>
      </div>
    );
  }

  async function submitDotdVote() {
    if (!fid || !previousRace || !dotdVote) return;
    try {
      const res = await fetch('/api/dotd', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fid,
          raceId: previousRace.id,
          driverId: dotdVote.id,
          profile: {
            username: frameUsername,
            displayName: frameDisplayName,
            pfpUrl: framePfpUrl
          }
        })
      });
      if (res.ok) {
        await fetchDotdData(previousRace.id, fid);
        setDotdMessage('Vote submitted! Thanks for weighing in.');
        setDotdSubmitted(true);
      } else {
        const body = await res.json().catch(() => ({}));
        setDotdMessage(body?.error || 'Unable to submit vote. Please try again.');
        setDotdSubmitted(false);
      }
    } catch (error) {
      console.error('Error submitting vote:', error);
      setDotdMessage('Unable to submit vote. Please try again.');
      setDotdSubmitted(false);
    }
  }

  async function submitPredictions() {
    if (!fid || !race || isSubmitting) return;
    if (isLocked) {
      setSubmitError('This slate is locked. Head back to the home page to explore other actions.');
      return;
    }

    setSubmitError(null);
    setIsSubmitting(true);

    try {
      const profile = {
        username: frameUsername,
        displayName: frameDisplayName,
        pfpUrl: framePfpUrl
      };

      const res = await fetch('/api/predictions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fid,
          raceId: race.id,
          profile,
          poleDriverId: predictions.pole?.id ?? null,
          winnerDriverId: predictions.podium[0]?.id ?? null,
          secondDriverId: predictions.podium[1]?.id ?? null,
          thirdDriverId: predictions.podium[2]?.id ?? null,
          fastestLapDriverId: predictions.fastestLap?.id ?? null,
          fastestPitTeamId: predictions.fastestPitStop?.id ?? null,
          firstDnfDriverId: predictions.firstDNF === 'none' ? null : (predictions.firstDNF as Driver)?.id ?? null,
          noDnf: predictions.firstDNF === 'none',
          safetyCar: predictions.safetyCar ?? null,
          winningMargin: predictions.winningMargin ?? null,
          wildcardAnswer: predictions.wildcard
        })
      });

      if (!res.ok) {
        const message = await res.text();
        setSubmitError(message || 'Failed to submit predictions. Try again.');
        return;
      }

      setHasSubmittedSlate(true);
      setIsEditingSlate(false);
      setView('submitted');
    } catch (error) {
      console.error('Error submitting predictions:', error);
      setSubmitError('Unable to submit predictions. Check your connection and try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  function calculateCompletion() {
    let completed = 0;
    const total = 8;
    
    if (predictions.pole) completed++;
    if (predictions.podium.filter(p => p).length === 3) completed++;
    if (predictions.fastestLap) completed++;
    if (predictions.fastestPitStop) completed++;
    if (predictions.firstDNF !== null) completed++;
    if (predictions.safetyCar !== null) completed++;
    if (predictions.winningMargin) completed++;
    if (predictions.wildcard !== null) completed++;
    
    return { completed, total, percentage: Math.round((completed / total) * 100) };
  }

  function setPrediction(prop: string, value: any) {
    if (isLocked) return;
    setPredictions(prev => ({
      ...prev,
      [prop]: value
    }));
    setShowModal(null);
  }

  function setPodiumPosition(position: number, driver: Driver | null) {
    if (isLocked) return;
    setPredictions(prev => ({
      ...prev,
      podium: prev.podium.map((p, i) => i === position ? driver : p)
    }));
    setShowModal(null);
  }

  const completion = calculateCompletion();
  const isSubmitDisabled = isLocked || completion.percentage < 100 || isSubmitting;
  const topDotdVote = dotdData?.votes?.[0];
  const currentLeader = leaderboard[0];
  const userLeaderboardEntry = fid ? leaderboard.find(entry => entry.fid === fid) : null;

  const openModal = (modalId: string) => {
    if (isLocked) return;
    setShowModal(modalId);
  };

  // ---- Render fallbacks ----
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-black">
        <div className="text-white">Loading...</div>
      </div>
    );
  }

  if (!race) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900">
        <div className="text-center text-white p-8">
          <h2 className="text-2xl font-bold mb-4">No Active Race</h2>
          <p className="text-gray-400">Check back when the next race is scheduled!</p>
        </div>
      </div>
    );
  }

  // Modal Component
  const Modal = ({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) => (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 px-3 pb-4 pt-20 sm:items-center sm:p-8"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-2xl border border-gray-700 bg-gray-900 shadow-2xl sm:max-w-2xl sm:rounded-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-800 px-4 py-3">
          <h3 className="text-white font-bold text-lg">{title}</h3>
          <button onClick={onClose} className="text-gray-400 transition-colors hover:text-white">
            <X className="h-6 w-6" />
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto px-4 pb-6 pt-2 touch-pan-y">
          {children}
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-gray-900 via-black to-gray-900 sm:flex sm:items-center sm:justify-center sm:p-6">
      <div className="mx-auto flex min-h-screen w-full flex-col bg-gray-900 text-white sm:min-h-0 sm:max-w-3xl sm:rounded-2xl sm:border-2 sm:border-red-500 sm:shadow-2xl sm:overflow-hidden">
        
        {/* ---- Header / Global navigation ---- */}
        <div className="bg-gradient-to-r from-red-600 to-red-700 px-4 py-5 sm:p-6 text-white">
          <div className="flex items-center justify-between">
            <button
              onClick={() => setView('home')}
              className="flex items-center gap-3 rounded-lg px-2 py-1 text-left transition-colors hover:bg-red-700/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
            >
              <img src={`${APP_URL}/logo-transparent.png`} alt="GridGuessr Logo" className="h-8" />
              <span>
              <span className="block text-lg font-semibold tracking-widest text-red-100">GridGuessr</span>
              <span className="block text-sm text-red-100/80">Predict. Score. Compete.</span>
              </span>
            </button>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setView('home')}
                className="rounded-lg p-2 transition-all hover:bg-red-600"
              >
                <Home className="h-6 w-6" />
              </button>
              <button
                onClick={() => setView('badges')}
                className="rounded-lg p-2 transition-all hover:bg-red-600"
              >
                <Award className="w-6 h-6" />
              </button>
            </div>
          </div>
        </div>

        {/* Home / Landing View */}
        {view === 'home' && (
          <div className="space-y-6 px-4 pb-8 pt-5 sm:p-6">
            <div className="rounded-2xl border border-red-500/30 bg-gradient-to-br from-red-600/30 via-red-700/30 to-red-900/50 p-6">
              <p className="text-sm uppercase tracking-[0.3em] text-red-100/80">Next up</p>
              <h2 className="mt-2 text-2xl font-bold text-white sm:text-3xl">{displayRace?.name || 'TBD'}</h2>
              <p className="text-red-100/90">
                {displayRace?.circuit ? `${displayRace.circuit} • ` : ''}
                {lockCountdownText}
              </p>
              {lockLocalTimeText && (
                <p className="mt-1 text-xs text-red-100/70">Local lock: {lockLocalTimeText}</p>
              )}
              <div className="mt-5 flex flex-col gap-3">
                <button
                  onClick={() => {
                    setIsEditingSlate(false);
                    setView('predict');
                  }}
                  className="w-full rounded-xl bg-white/15 px-5 py-3 text-center font-semibold text-white transition-all hover:bg-white/25"
                >
                  {isLocked || hasSubmittedSlate ? 'View Slate' : 'Set Predictions'}
                </button>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl border border-gray-700 bg-gray-800/90 p-5">
                <div className="mb-4 flex items-center gap-2 text-sm text-gray-400">
                  <ThumbsUp className="h-5 w-5 text-blue-300" />
                  <span>Driver of the Day</span>
                </div>
                <h3 className="text-lg font-semibold text-white">
                  {previousRace ? `Vote for ${previousRace.name}` : 'Vote for the standout driver'}
                </h3>
                <p className="mt-1 text-sm text-gray-400">
                  {previousRace
                    ? topDotdVote
                      ? `${topDotdVote.driver.name} leads with ${topDotdVote.percentage}% of ${dotdData?.totalVotes ?? 0} votes.`
                      : `Help decide the Farcaster-favorite driver from the ${previousRace.name}.`
                    : 'Help decide the Farcaster-favorite driver from the last race.'}
                </p>
                <button
                  onClick={() => setView('dotd')}
                  className="mt-5 w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-blue-700"
                >
                  Cast Your Vote
                </button>
              </div>

              <div className="rounded-2xl border border-gray-700 bg-gray-800/90 p-5">
                <div className="mb-4 flex items-center gap-2 text-sm text-gray-400">
                  <Trophy className="h-5 w-5 text-yellow-300" />
                  <span>Leaderboard</span>
                </div>
                <h3 className="text-lg font-semibold text-white">Chase the top spot</h3>
                <p className="mt-1 text-sm text-gray-400">
                  {userLeaderboardEntry
                    ? `You're currently #${userLeaderboardEntry.rank} with ${userLeaderboardEntry.total_points} pts.`
                    : currentLeader
                      ? `${currentLeader.display_name || currentLeader.username || 'Top player'} leads with ${currentLeader.total_points} pts.`
                      : 'Standings update after each race.'}
                </p>
                <button
                  onClick={() => setView('leaderboard')}
                  className="mt-5 w-full rounded-lg border border-yellow-400/60 px-4 py-2 text-sm font-semibold text-yellow-200 transition-all hover:bg-yellow-500 hover:text-gray-900"
                >
                  See Standings
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Prediction View */}
        {view === 'predict' && (!hasSubmittedSlate || isEditingSlate) && !isLocked && (
          <div className="relative px-4 pb-8 pt-5 sm:p-6">
            <div className={isLocked ? 'pointer-events-none opacity-40 transition-opacity' : ''}>
              {/* Race Info */}
              <div className="bg-gradient-to-r from-gray-800 to-gray-700 rounded-xl p-5 mb-5 border border-gray-600">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h2 className="text-2xl font-bold text-white mb-1">{race.name}</h2>
                    <p className="text-gray-300 text-sm">{race.circuit}</p>
                  </div>
                  <Flag className="w-8 h-8 text-red-400" />
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <div className="flex items-center gap-2 text-yellow-400">
                    <Clock className="w-4 h-4" />
                    <span>{lockCountdownText}</span>
                  </div>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="bg-gray-800 rounded-xl p-4 mb-5 border border-gray-700">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-white font-semibold">Slate Progress</span>
                  <span className="text-red-400 font-bold">{completion.percentage}%</span>
                </div>
                <div className="w-full bg-gray-700 rounded-full h-2">
                  <div 
                    className="bg-gradient-to-r from-red-500 to-red-600 h-2 rounded-full transition-all"
                    style={{ width: `${completion.percentage}%` }}
                  />
                </div>
                <p className="text-gray-400 text-xs mt-2">{completion.completed}/{completion.total} predictions completed</p>
              </div>

              {/* Pole Position */}
              <div className="bg-gray-800 rounded-xl p-4 mb-3 border border-gray-700">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Zap className="w-5 h-5 text-yellow-400" />
                    <span className="text-white font-bold">Pole Position</span>
                    <span className="text-xs text-gray-400 bg-gray-700 px-2 py-1 rounded">15 pts</span>
                  </div>
                  {predictions.pole && <CheckCircle className="w-5 h-5 text-green-400" />}
                </div>
                {!predictions.pole ? (
                  <button 
                    onClick={() => openModal('pole')}
                    className="w-full bg-gray-700 hover:bg-gray-600 rounded-lg p-3 text-gray-300 border border-gray-600 transition-all"
                  >
                    Select driver
                  </button>
                ) : (
                  <div className="bg-gray-700 rounded-lg p-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-1 h-8 rounded-full" style={{ backgroundColor: predictions.pole.color }} />
                    <div>
                      <p className="text-white font-bold">{predictions.pole.name}</p>
                      <p className="text-gray-400 text-sm">#{predictions.pole.number}</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setPrediction('pole', null)}
                    className="text-red-400 hover:text-red-300 text-sm"
                  >
                    Change
                  </button>
                </div>
              )}
            </div>

            {/* Podium */}
            <div className="bg-gray-800 rounded-xl p-4 mb-3 border border-gray-700">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Trophy className="w-5 h-5 text-yellow-400" />
                  <span className="text-white font-bold">Podium Finish</span>
                  <span className="text-xs text-gray-400 bg-gray-700 px-2 py-1 rounded">35 pts</span>
                </div>
                {predictions.podium.filter(p => p).length === 3 && <CheckCircle className="w-5 h-5 text-green-400" />}
              </div>
              <div className="space-y-2">
                {['1st', '2nd', '3rd'].map((position, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                      idx === 0 ? 'bg-yellow-500 text-gray-900' :
                      idx === 1 ? 'bg-gray-400 text-gray-900' :
                      'bg-orange-600 text-white'
                    }`}>
                      {position}
                    </div>
                    {!predictions.podium[idx] ? (
                      <button 
                        onClick={() => openModal(`podium-${idx}`)}
                        className="flex-1 bg-gray-700 hover:bg-gray-600 rounded-lg p-2 text-gray-300 text-sm border border-gray-600 transition-all"
                      >
                        Select driver
                      </button>
                    ) : (
                      <div className="flex-1 bg-gray-700 rounded-lg p-2 flex items-center justify-between">
                        <span className="text-white text-sm font-semibold">{predictions.podium[idx]!.name}</span>
                        <button 
                          onClick={() => setPodiumPosition(idx, null)}
                          className="text-red-400 hover:text-red-300 text-xs"
                        >
                          Change
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Quick Grid */}
            <div className="space-y-3 mb-5">
              {/* Fastest Lap - Full Width */}
                <button 
                  onClick={() => openModal('fastestLap')}
                className="w-full bg-gray-800 rounded-xl p-4 border border-gray-700 hover:border-purple-500 transition-all text-left"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Timer className="w-5 h-5 text-purple-400" />
                    <span className="text-white font-bold">Fastest Lap</span>
                    <span className="text-xs text-gray-400 bg-gray-700 px-2 py-1 rounded">10 pts</span>
                  </div>
                  {predictions.fastestLap && <CheckCircle className="w-5 h-5 text-green-400" />}
                </div>
                {!predictions.fastestLap ? (
                  <div className="text-gray-300 text-sm">Select driver</div>
                ) : (
                  <div className="flex items-center gap-3">
                    <div className="w-1 h-8 rounded-full" style={{ backgroundColor: predictions.fastestLap.color }} />
                    <div>
                      <p className="text-white font-semibold">{predictions.fastestLap.name}</p>
                      <p className="text-gray-400 text-sm">#{predictions.fastestLap.number}</p>
                    </div>
                  </div>
                )}
              </button>

              {/* 2x2 Grid for remaining cards */}
              <div className="grid grid-cols-2 gap-3">
                {/* Fastest Pit Stop */}
                <button
                  onClick={() => openModal('fastestPit')}
                  className="bg-gray-800 rounded-xl p-3 border border-gray-700 hover:border-blue-500 transition-all text-left"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <Zap className="w-4 h-4 text-blue-400" />
                    <span className="text-white text-sm font-bold">Fastest Pit</span>
                  </div>
                  <span className="text-xs text-gray-400 bg-gray-700 px-2 py-1 rounded">10 pts</span>
                  <p className="text-gray-400 text-xs mt-2">
                    {predictions.fastestPitStop ? predictions.fastestPitStop.name : 'Not selected'}
                  </p>
                </button>

                {/* First DNF */}
                <button
                  onClick={() => openModal('firstDNF')}
                  className="bg-gray-800 rounded-xl p-3 border border-gray-700 hover:border-orange-500 transition-all text-left"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle className="w-4 h-4 text-orange-400" />
                    <span className="text-white text-sm font-bold">First DNF</span>
                  </div>
                  <span className="text-xs text-gray-400 bg-gray-700 px-2 py-1 rounded">10 pts</span>
                  <p className="text-gray-400 text-xs mt-2">
                    {predictions.firstDNF === 'none' ? 'No DNF' : predictions.firstDNF ? (predictions.firstDNF as Driver).name : 'Not selected'}
                  </p>
                </button>

                {/* Safety Car */}
                <div className="bg-gray-800 rounded-xl p-3 border border-gray-700">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle className="w-4 h-4 text-yellow-400" />
                    <span className="text-white text-sm font-bold">Safety Car</span>
                  </div>
                  <span className="text-xs text-gray-400 bg-gray-700 px-2 py-1 rounded">10 pts</span>
                  <div className="flex gap-1 mt-2">
                    <button 
                      onClick={() => setPrediction('safetyCar', true)}
                      className={`flex-1 text-xs py-1 rounded ${predictions.safetyCar === true ? 'bg-green-600 text-white' : 'bg-gray-700 text-gray-400'}`}
                    >
                      Yes
                    </button>
                    <button 
                      onClick={() => setPrediction('safetyCar', false)}
                      className={`flex-1 text-xs py-1 rounded ${predictions.safetyCar === false ? 'bg-red-600 text-white' : 'bg-gray-700 text-gray-400'}`}
                    >
                      No
                    </button>
                  </div>
                </div>

                {/* Winning Margin */}
                <button
                  onClick={() => openModal('winningMargin')}
                  className="bg-gray-800 rounded-xl p-3 border border-gray-700 hover:border-green-500 transition-all text-left"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <TrendingUp className="w-4 h-4 text-green-400" />
                    <span className="text-white text-sm font-bold">Win Margin</span>
                  </div>
                  <span className="text-xs text-gray-400 bg-gray-700 px-2 py-1 rounded">10 pts</span>
                  <p className="text-gray-400 text-xs mt-2">
                    {predictions.winningMargin || 'Not selected'}
                  </p>
                </button>
              </div>

              {/* Wildcard - Full Width if exists */}
              {race.wildcard_question && (
                <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
                  <div className="flex items-center gap-2 mb-2">
                    <Target className="w-5 h-5 text-pink-400" />
                    <span className="text-white font-bold">Wildcard</span>
                    <span className="text-xs text-gray-400 bg-gray-700 px-2 py-1 rounded">10 pts</span>
                  </div>
                  <p className="text-gray-300 text-sm mb-3">{race.wildcard_question}</p>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => setPrediction('wildcard', true)}
                      className={`flex-1 text-sm py-2 rounded ${predictions.wildcard === true ? 'bg-green-600 text-white' : 'bg-gray-700 text-gray-400'}`}
                    >
                      Yes / Over
                    </button>
                    <button 
                      onClick={() => setPrediction('wildcard', false)}
                      className={`flex-1 text-sm py-2 rounded ${predictions.wildcard === false ? 'bg-red-600 text-white' : 'bg-gray-700 text-gray-400'}`}
                    >
                      No / Under
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <button
              onClick={submitPredictions}
              disabled={isSubmitDisabled}
              className={`mb-2 w-full rounded-xl p-4 font-bold transition-all ${
                !isSubmitDisabled
                  ? 'bg-red-600 hover:bg-red-700 text-white'
                  : 'bg-gray-700 text-gray-500 cursor-not-allowed'
              }`}
            >
              {isLocked ? 'Grid Locked' : isSubmitting ? 'Submitting...' : 'Submit Slate'}
            </button>
            {submitError && (
              <p className="text-sm text-red-400 mb-4">{submitError}</p>
            )}
          </div>

          {isLocked && (
              <div className="pointer-events-auto absolute inset-0 flex items-start justify-center bg-black/80 px-4 pt-24 sm:pt-32">
                <div className="w-full max-w-md rounded-2xl border border-red-500 bg-gray-900 p-6 text-center text-white space-y-4">
                  <Trophy className="mx-auto h-12 w-12 text-red-400" />
                  <div>
                    <h3 className="text-2xl font-bold">Grid Locked</h3>
                    <p className="mt-2 text-sm text-gray-300">
                      Predictions for this race are closed. Head back to the landing page to track results and explore other actions.
                    </p>
                  </div>
                  <button
                    onClick={() => setView('home')}
                    className="w-full rounded-xl bg-red-600 px-4 py-3 font-semibold text-white transition-all hover:bg-red-700"
                  >
                    Return Home
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Modals */}
        {showModal === 'pole' && (
          <Modal title="Select Pole Position" onClose={() => setShowModal(null)}>
            <div className="space-y-2">
              {drivers.map(driver => (
                <button
                  key={driver.id}
                  onClick={() => setPrediction('pole', driver)}
                  className="w-full bg-gray-700 hover:bg-gray-600 rounded-lg p-3 flex items-center gap-3 transition-all"
                >
                  <div className="w-1 h-10 rounded-full" style={{ backgroundColor: driver.color }} />
                  <div className="text-left flex-1">
                    <p className="text-white font-bold">{driver.name}</p>
                    <p className="text-gray-400 text-sm">#{driver.number} • {driver.team}</p>
                  </div>
                </button>
              ))}
            </div>
          </Modal>
        )}

        {showModal?.startsWith('podium-') && (
          <Modal title={`Select ${['1st', '2nd', '3rd'][parseInt(showModal.split('-')[1])]} Place`} onClose={() => setShowModal(null)}>
            <div className="space-y-2">
              {drivers.map(driver => (
                <button
                  key={driver.id}
                  onClick={() => setPodiumPosition(parseInt(showModal.split('-')[1]), driver)}
                  className="w-full bg-gray-700 hover:bg-gray-600 rounded-lg p-3 flex items-center gap-3 transition-all"
                >
                  <div className="w-1 h-10 rounded-full" style={{ backgroundColor: driver.color }} />
                  <div className="text-left flex-1">
                    <p className="text-white font-bold">{driver.name}</p>
                    <p className="text-gray-400 text-sm">#{driver.number} • {driver.team}</p>
                  </div>
                </button>
              ))}
            </div>
          </Modal>
        )}

        {showModal === 'fastestLap' && (
          <Modal title="Select Fastest Lap" onClose={() => setShowModal(null)}>
            <div className="space-y-2">
              {drivers.map(driver => (
                <button
                  key={driver.id}
                  onClick={() => setPrediction('fastestLap', driver)}
                  className="w-full bg-gray-700 hover:bg-gray-600 rounded-lg p-3 flex items-center gap-3 transition-all"
                >
                  <div className="w-1 h-10 rounded-full" style={{ backgroundColor: driver.color }} />
                  <div className="text-left flex-1">
                    <p className="text-white font-bold">{driver.name}</p>
                    <p className="text-gray-400 text-sm">#{driver.number} • {driver.team}</p>
                  </div>
                </button>
              ))}
            </div>
          </Modal>
        )}

        {showModal === 'fastestPit' && (
          <Modal title="Select Fastest Pit Stop Team" onClose={() => setShowModal(null)}>
            <div className="space-y-2">
              {teams.map(team => (
                <button
                  key={team.id}
                  onClick={() => setPrediction('fastestPitStop', team)}
                  className="w-full bg-gray-700 hover:bg-gray-600 rounded-lg p-3 flex items-center gap-3 transition-all"
                >
                  <div className="w-4 h-10 rounded-full" style={{ backgroundColor: team.color }} />
                  <p className="text-white font-bold">{team.name}</p>
                </button>
              ))}
            </div>
          </Modal>
        )}

        {showModal === 'firstDNF' && (
          <Modal title="First DNF" onClose={() => setShowModal(null)}>
            <div className="space-y-2">
              <button
                onClick={() => setPrediction('firstDNF', 'none')}
                className="w-full bg-green-700 hover:bg-green-600 rounded-lg p-3 transition-all"
              >
                <p className="text-white font-bold">No DNF</p>
              </button>
              {drivers.map(driver => (
                <button
                  key={driver.id}
                  onClick={() => setPrediction('firstDNF', driver)}
                  className="w-full bg-gray-700 hover:bg-gray-600 rounded-lg p-3 flex items-center gap-3 transition-all"
                >
                  <div className="w-1 h-10 rounded-full" style={{ backgroundColor: driver.color }} />
                  <div className="text-left flex-1">
                    <p className="text-white font-bold">{driver.name}</p>
                    <p className="text-gray-400 text-sm">#{driver.number} • {driver.team}</p>
                  </div>
                </button>
              ))}
            </div>
          </Modal>
        )}

        {showModal === 'winningMargin' && (
          <Modal title="Select Winning Margin" onClose={() => setShowModal(null)}>
            <div className="space-y-2">
              {marginBuckets.map(bucket => (
                <button
                  key={bucket}
                  onClick={() => setPrediction('winningMargin', bucket)}
                  className="w-full bg-gray-700 hover:bg-gray-600 rounded-lg p-3 transition-all"
                >
                  <p className="text-white font-bold">{bucket}</p>
                </button>
              ))}
            </div>
          </Modal>
        )}

        {/* Submitted View */}
        {(view === 'submitted' || (view === 'predict' && (hasSubmittedSlate && !isEditingSlate || isLocked))) && (
          <div className="px-4 pb-8 pt-10 text-center sm:p-8">
            <div className="bg-green-900 border-2 border-green-500 rounded-2xl p-8 mb-6">
              <Trophy className="w-16 h-16 text-green-400 mx-auto mb-4" />
              <h2 className="text-3xl font-bold text-white mb-2">Slate Locked!</h2>
              <p className="text-gray-300 mb-4">Your predictions are submitted</p>
              <button
                onClick={async () => {
                  try {
                    await sdk.actions.composeCast({
                      text: `🏁 Grid set for the ${race?.name}! 🏁\n\nPole: ${predictions.pole?.name}\nWinner: ${predictions.podium[0]?.name}\n\nThink I'm wrong? Prove it 👇`,
                      embeds: [`${APP_URL}`]
                    });
                  } catch (error) {
                    console.error('Error sharing cast:', error);
                  }
                }}
                className="w-full rounded-xl bg-purple-600 px-4 py-3 text-white font-semibold transition-all hover:bg-purple-700"
              >
                Share My Slate
              </button>
            </div>

            <div className="bg-gray-800 rounded-xl p-6 mb-4 border border-gray-700 text-left">
              <h3 className="text-white font-bold mb-3">Your Slate</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-400">Pole:</span>
                  <span className="text-white">{predictions.pole?.name || '-'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Winner:</span>
                  <span className="text-white">{predictions.podium[0]?.name || '-'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">2nd:</span>
                  <span className="text-white">{predictions.podium[1]?.name || '-'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">3rd:</span>
                  <span className="text-white">{predictions.podium[2]?.name || '-'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Fastest Lap:</span>
                  <span className="text-white">{predictions.fastestLap?.name || '-'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Fastest Pit:</span>
                  <span className="text-white">{predictions.fastestPitStop?.name || '-'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">First DNF:</span>
                  <span className="text-white">{predictions.firstDNF === 'none' ? 'No DNF' : (predictions.firstDNF as Driver)?.name || '-'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Safety Car:</span>
                  <span className="text-white">{predictions.safetyCar === null ? '-' : predictions.safetyCar ? 'Yes' : 'No'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Win Margin:</span>
                  <span className="text-white">{predictions.winningMargin || '-'}</span>
                </div>
                {race.wildcard_question && (
                  <div className="flex justify-between">
                    <span className="text-gray-400">Wildcard:</span>
                    <span className="text-white">
                      {predictions.wildcard === null ? '-' : predictions.wildcard ? 'Yes / Over' : 'No / Under'}
                    </span>
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  if (!isLocked) {
                    setIsEditingSlate(true);
                    setView('predict');
                  }
                }}
                className="flex-1 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-xl p-4 text-white font-semibold transition-all"
              >
                {isLocked ? 'Viewing Slate' : 'Edit Slate'}
              </button>
              <button
                onClick={() => setView('leaderboard')}
                className="flex-1 bg-red-600 hover:bg-red-700 rounded-xl p-4 text-white font-semibold transition-all"
              >
                Leaderboard
              </button>
            </div>
          </div>
        )}

        {/* Leaderboard View */}
        {view === 'leaderboard' && (
          <div className="px-4 pb-8 pt-5 sm:p-6">
            <h2 className="text-2xl font-bold text-white mb-5 flex items-center gap-2">
              <Trophy className="w-7 h-7 text-yellow-400" />
              Season Standings
            </h2>

            <div className="flex gap-2 mb-5">
              <button
                onClick={() => setLeaderboardTab('global')}
                className={`flex-1 py-3 rounded-lg font-semibold transition-all flex items-center justify-center gap-2 ${
                  leaderboardTab === 'global'
                    ? 'bg-red-600 text-white'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                }`}
              >
                <Globe className="w-4 h-4" />
                Global
              </button>
              <button
                onClick={() => setLeaderboardTab('friends')}
                className={`flex-1 py-3 rounded-lg font-semibold transition-all flex items-center justify-center gap-2 ${
                  leaderboardTab === 'friends'
                    ? 'bg-red-600 text-white'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                }`}
              >
                <Users className="w-4 h-4" />
                Friends
              </button>
            </div>

              <div className="space-y-2 mb-6">
                {(leaderboardTab === 'global' ? leaderboard : friendsLeaderboard).map((entry, index) => {
                  const isCurrentUser = entry.fid === fid;
                  return (
                    <div
                      key={index}
                      className={`bg-gray-800 rounded-xl p-4 border-2 ${
                        isCurrentUser
                          ? 'border-red-500 bg-gray-700' 
                          : 'border-gray-700'
                      }`}
                    >
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-4">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm ${
                          index === 0 ? 'bg-yellow-500 text-gray-900' :
                          index === 1 ? 'bg-gray-400 text-gray-900' :
                          index === 2 ? 'bg-orange-600 text-white' :
                          'bg-gray-700 text-gray-300'
                        }`}>
                          #{entry.rank}
                        </div>
                        <div className="relative h-10 w-10">
                          {entry.pfp_url && (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img
                              src={entry.pfp_url}
                              alt={`${entry.display_name || entry.username || 'User'} avatar`}
                              className="h-10 w-10 rounded-full border border-gray-600 object-cover"
                              onError={(e) => {
                                e.currentTarget.style.display = 'none';
                                const fallback = e.currentTarget.nextElementSibling as HTMLElement | null;
                                if (fallback) fallback.style.display = 'flex';
                              }}
                            />
                          )}
                          <div
                            className="absolute inset-0 hidden items-center justify-center rounded-full bg-gray-600 text-xs font-semibold text-gray-200"
                            style={{ display: entry.pfp_url ? 'none' : 'flex' }}
                          >
                            {(entry.display_name || entry.username || '?').slice(0, 2).toUpperCase()}
                          </div>
                        </div>
                        <div>
                          <p className="text-white font-bold">
                            {entry.display_name || entry.username || `User ${entry.fid}`}
                            {isCurrentUser && ' (You)'}
                          </p>
                          <div className="flex items-center gap-2">
                            <p className="text-gray-400 text-xs">{entry.perfect_slates} perfect slates</p>
                            {entry.perfect_slates > 0 && <Award className="w-3 h-3 text-yellow-400" />}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-2xl font-bold text-red-400">{entry.total_points}</p>
                        <p className="text-gray-500 text-xs">points</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setView('predict')}
                className="flex-1 bg-red-600 hover:bg-red-700 rounded-xl p-4 text-white font-semibold transition-all"
              >
                Back to Predictions
              </button>
              <button
                onClick={async () => {
                  try {
                    const userEntry = leaderboardTab === 'global' 
                      ? leaderboard.find(e => e.fid === fid)
                      : friendsLeaderboard.find(e => e.fid === fid);
                    await sdk.actions.composeCast({
                      text: `🏆 #${userEntry?.rank || '?'} ${leaderboardTab === 'friends' ? 'among my degen friends' : 'globally'} on ${APP_NAME}\n\n${userEntry?.total_points || 0} pts — ${userEntry?.perfect_slates || 0} perfect rounds! 🏎️\n\nCan you beat me? Come compete and climb the leaderboard 👇`,
                      embeds: [`${APP_URL}`]
                    });
                  } catch (error) {
                    console.error('Error sharing cast:', error);
                  }
                }}
                className="bg-purple-600 hover:bg-purple-700 rounded-xl px-6 text-white transition-all flex items-center justify-center"
              >
                <Share2 className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}

        {/* Driver of the Day View */}
        {view === 'dotd' && (
          <div className="px-4 pb-8 pt-5 sm:p-6 space-y-6">
            <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-xl p-5 text-white">
              <div className="flex items-center gap-3 mb-3">
                <ThumbsUp className="w-8 h-8" />
                <div>
                  <h2 className="text-2xl font-bold">Driver of the Day</h2>
                  <p className="text-blue-100 text-sm">{previousRace?.name || 'Previous race'}</p>
                </div>
              </div>
            </div>
            <div className="bg-gray-800 rounded-xl border border-gray-700 p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-white font-bold text-lg">Cast Your Vote</h3>
                <div className="text-gray-400 text-sm">{dotdData?.totalVotes || 0} votes</div>
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
                          onClick={() => handleDotdSelection(driver)}
                          className={`flex items-center justify-between rounded-xl border-2 px-3 py-2 text-left transition-all ${
                            isSelected
                              ? 'border-blue-500 bg-blue-900/40'
                              : 'border-gray-600 bg-gray-700 hover:border-gray-500'
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
                      onClick={() => setView('home')}
                      className="flex-1 rounded-xl border border-gray-700 bg-gray-800 px-4 py-3 text-white transition-all hover:bg-gray-700"
                    >
                      Back
                    </button>
                    <button
                      onClick={submitDotdVote}
                      disabled={!dotdVote}
                      className={`flex-1 rounded-xl px-4 py-3 font-bold transition-all ${
                        dotdVote
                          ? 'bg-blue-600 hover:bg-blue-700 text-white'
                          : 'bg-gray-700 text-gray-500 cursor-not-allowed'
                      }`}
                    >
                      Submit Vote
                    </button>
                    <button
                      onClick={async () => {
                        try {
                          await sdk.actions.composeCast({
                            text: `🔥 Voted ${dotdVote?.name || 'my favorite driver'} as Driver of the Day on ${APP_NAME} for the ${previousRace?.name || ''}!\n\nWho's yours? Vote now 👇`,
                            embeds: [`${APP_URL}`]
                          });
                        } catch (error) {
                          console.error('Error sharing cast:', error);
                        }
                      }}
                      disabled={!dotdVote}
                      className={`rounded-xl px-5 transition-all flex items-center justify-center ${
                        dotdVote
                          ? 'bg-purple-600 hover:bg-purple-700 text-white'
                          : 'bg-gray-700 text-gray-500 cursor-not-allowed'
                      }`}
                    >
                      <Share2 className="w-5 h-5" />
                    </button>
                  </div>
                </>
              ) : (
                <div className="rounded-xl border border-blue-600 bg-blue-900/40 px-4 py-5 text-left space-y-3">
                  <div>
                    <p className="text-white font-semibold text-sm">
                      Thanks for voting! Your pick {dotdVote?.name || ''} is locked in for {previousRace?.name}.
                    </p>
                    <p className="text-xs text-blue-100 mt-2">Check back to see how the standings evolve.</p>
                  </div>
                  <div className="flex gap-3">
                    <button
                      onClick={() => setView('home')}
                      className="flex-1 rounded-xl border border-gray-700 bg-gray-800 px-4 py-3 text-white transition-all hover:bg-gray-700"
                    >
                      Back
                    </button>
                    <button
                      onClick={async () => {
                        try {
                          await sdk.actions.composeCast({
                            text: `🔥 Voted ${dotdVote?.name || 'my favorite driver'} as Driver of the Day on ${APP_NAME} for the ${previousRace?.name || ''}!\n\nWho's yours? Vote now 👇`,
                            embeds: [`${APP_URL}`]
                          });
                        } catch (error) {
                          console.error('Error sharing cast:', error);
                        }
                      }}
                      className="flex-1 rounded-xl bg-purple-600 px-4 py-3 text-white transition-all hover:bg-purple-700"
                    >
                      Share Vote
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="bg-gray-800 rounded-xl border border-gray-700 p-5">
              <h3 className="mb-4 text-white font-bold text-lg">Current Standings</h3>
              <div className="space-y-2">
                {(dotdData?.votes || []).map((entry: any, index: number) => {
                  const isSelected = dotdVote?.id === entry.driver.id;
                  const isLeader = index === 0;
                  return (
                    <div
                      key={entry.driver.id}
                      className={`flex items-center justify-between rounded-xl border px-3 py-2 ${
                        isLeader ? 'border-blue-500 bg-blue-900/30' : 'border-gray-700 bg-gray-700'
                      } ${isSelected ? 'ring-2 ring-blue-400' : ''}`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-1.5 rounded-full" style={{ backgroundColor: entry.driver.color }} />
                        <div>
                          <p className="text-sm font-semibold text-white">{entry.driver.name}</p>
                          <p className="text-xs text-gray-400">{entry.votes} vote{entry.votes === 1 ? '' : 's'}</p>
                        </div>
                      </div>
                      <span className="text-sm font-bold text-blue-200">{entry.percentage}%</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Badges View */}
        {view === 'badges' && (
          <div className="px-4 pb-8 pt-5 sm:p-6">
            <h2 className="text-2xl font-bold text-white mb-5 flex items-center gap-2">
              <Award className="w-7 h-7 text-yellow-400" />
              Your Badges
            </h2>

            <div className="grid grid-cols-2 gap-3 mb-6">
              {[
                { id: 'perfectSlate', name: 'Perfect Slate', icon: '💯', color: 'from-purple-600 to-pink-600', description: 'All predictions correct' },
                { id: 'podiumProphet', name: 'Podium Prophet', icon: '🔮', color: 'from-yellow-500 to-orange-500', description: 'Exact podium prediction' },
                { id: 'halfCentury', name: 'Half Century', icon: '🎯', color: 'from-green-500 to-emerald-600', description: 'Score 50+ points' },
                { id: 'pole', name: 'Pole Prophet', icon: '⚡', color: 'from-blue-500 to-cyan-500', description: 'Correct pole position' },
                { id: 'winner', name: 'Winner Wizard', icon: '🏆', color: 'from-yellow-600 to-yellow-500', description: 'Correct race winner' },
                { id: 'second', name: 'Silver Seer', icon: '🥈', color: 'from-gray-400 to-gray-500', description: 'Correct 2nd place' },
                { id: 'third', name: 'Bronze Brainiac', icon: '🥉', color: 'from-orange-700 to-orange-600', description: 'Correct 3rd place' },
                { id: 'fastestLap', name: 'Lap Legend', icon: '⏱️', color: 'from-purple-500 to-purple-600', description: 'Correct fastest lap' },
                { id: 'fastestPit', name: 'Pit Psychic', icon: '🔧', color: 'from-blue-600 to-indigo-600', description: 'Correct fastest pit' },
                { id: 'dnf', name: 'DNF Detective', icon: '🔍', color: 'from-red-600 to-red-700', description: 'Correct first DNF' },
                { id: 'safetyCar', name: 'Safety Sage', icon: '🚗', color: 'from-yellow-500 to-yellow-600', description: 'Correct safety car' },
                { id: 'margin', name: 'Margin Master', icon: '📊', color: 'from-green-600 to-teal-600', description: 'Correct win margin' }
              ].map(badge => {
                const earned = userBadges?.[badge.id]?.earned || false;
                const count = userBadges?.[badge.id]?.count || 0;
                
                return (
                  <div
                    key={badge.id}
                    className={`rounded-xl p-4 border-2 transition-all ${
                      earned
                        ? `bg-gradient-to-br ${badge.color} border-transparent`
                        : 'bg-gray-800 border-gray-700 opacity-50'
                    }`}
                  >
                    <div className="text-center">
                      <div className="text-4xl mb-2">{badge.icon}</div>
                      <p className={`font-bold text-sm mb-1 ${earned ? 'text-white' : 'text-gray-400'}`}>
                        {badge.name}
                      </p>
                      {earned && count > 0 && (
                        <div className="flex items-center justify-center gap-1 mb-2">
                          <CheckCircle className="w-3 h-3 text-white" />
                          <span className="text-white text-xs font-semibold">×{count}</span>
                        </div>
                      )}
                      <p className={`text-xs ${earned ? 'text-white opacity-90' : 'text-gray-500'}`}>
                        {badge.description}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="bg-gray-800 rounded-xl p-5 mb-5 border border-gray-700">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-white font-bold">Badge Progress</h3>
                <span className="text-red-400 font-bold">
                  {userBadges ? Object.values(userBadges).filter((b: any) => b.earned).length : 0}/12
                </span>
              </div>
              <div className="w-full bg-gray-700 rounded-full h-2">
                <div 
                  className="bg-gradient-to-r from-red-500 to-red-600 h-2 rounded-full transition-all"
                  style={{ 
                    width: `${userBadges ? (Object.values(userBadges).filter((b: any) => b.earned).length / 12) * 100 : 0}%` 
                  }}
                />
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setView('predict')}
                className="flex-1 bg-red-600 hover:bg-red-700 rounded-xl p-4 text-white font-semibold transition-all"
              >
                Back to Predictions
              </button>
              <button
                onClick={async () => {
                  try {
                    const earnedCount = userBadges ? Object.values(userBadges).filter((b: any) => b.earned).length : 0;
                    await sdk.actions.composeCast({
                      text: `Progress check 🏅\n${earnedCount}/12 badges earned on ${APP_NAME}! Keep racing, keep winning 🏁\n\nHow many can you collect? 👇`,
                      embeds: [`${APP_URL}`]
                    });
                  } catch (error) {
                    console.error('Error sharing cast:', error);
                  }
                }}
                className="bg-purple-600 hover:bg-purple-700 rounded-xl px-6 text-white transition-all flex items-center justify-center"
              >
                <Share2 className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

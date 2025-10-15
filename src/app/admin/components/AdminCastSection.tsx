'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, RefreshCcw, Send, Trophy, Trash2 } from 'lucide-react';

import type { AdminMessage, CastJob, Race } from '../types';
import { formatLocalDate, formatLocalDateTime } from '../utils';
import { CAST_TEXT_MAX_LENGTH } from '~/lib/farcaster/constants';

type AdminCastSectionProps = {
  races: Race[];
  getAuthPayload: () => Record<string, unknown> | null;
  setMessage: (message: AdminMessage | null) => void;
};

type CastFormState = {
  text: string;
  embedUrl: string;
  channelId: string;
};

// Baseline values for the manual cast composer form.
const initialCastForm: CastFormState = {
  text: '',
  embedUrl: '',
  channelId: ''
};

function formatCountdownLabel(minutes: number | null): string {
  if (minutes === null || !Number.isFinite(minutes)) {
    return '—';
  }
  if (minutes <= 0) {
    return 'lock passed';
  }
  if (minutes >= 60 * 24 * 2) {
    const days = Math.floor(minutes / (60 * 24));
    const remainingMinutes = minutes - days * 60 * 24;
    const hours = Math.floor(remainingMinutes / 60);
    return hours > 0 ? `${days}d ${hours}h left` : `${days}d left`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (hours > 0) {
    return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m left` : `${hours}h left`;
  }
  return `${minutes}m left`;
}

/**
 * Admin surface for sending casts, triggering Farcaster templates, and
 * monitoring the queued cast jobs. Every API call goes through the shared
 * `getAuthPayload` helper so only authenticated admins can trigger actions.
 */
export function AdminCastSection({
  races,
  getAuthPayload,
  setMessage
}: AdminCastSectionProps) {
  const [castForm, setCastForm] = useState<CastFormState>(initialCastForm);
  const [castSubmitting, setCastSubmitting] = useState(false);
  const [templateSubmitting, setTemplateSubmitting] = useState<string | null>(null);
  const [castJobs, setCastJobs] = useState<CastJob[]>([]);
  const [castJobsLoading, setCastJobsLoading] = useState(false);
  const [castJobsLoaded, setCastJobsLoaded] = useState(false);
  // Form state for deleting an existing cast by hash.
  const [deleteForm, setDeleteForm] = useState({ targetHash: '' });
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);

  const channelPlaceholder = useMemo(() => castForm.channelId || 'gridguessr', [castForm.channelId]);

  /**
   * Load the upcoming Farcaster jobs so admins can check what the scheduler
   * will publish next. Quiet mode avoids flashing the loading indicator when
   * we refresh after a manual cast.
   */
  const fetchCastJobs = useCallback(async (options?: { quiet?: boolean }) => {
    const authPayload = getAuthPayload();
    if (!authPayload) return;

    if (!options?.quiet) {
      setCastJobsLoading(true);
    }

    try {
      const response = await fetch('/api/admin/farcaster/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...authPayload,
          limit: 100,
          upcoming: true
        })
      });

      const data = await response.json();

      if (!response.ok) {
        if (!options?.quiet) {
          setMessage({ type: 'error', text: data?.error || 'Failed to load Farcaster cast jobs.' });
        }
        return;
      }

      setCastJobs(Array.isArray(data?.jobs) ? data.jobs : []);
      setCastJobsLoaded(true);
    } catch (error) {
      if (!options?.quiet) {
        setMessage({ type: 'error', text: 'Network error while loading Farcaster cast jobs.' });
      }
    } finally {
      if (!options?.quiet) {
        setCastJobsLoading(false);
      }
    }
  }, [getAuthPayload, setMessage]);

  useEffect(() => {
    if (!castJobsLoaded) {
      fetchCastJobs({ quiet: false });
    }
  }, [castJobsLoaded, fetchCastJobs]);

  const handleSendManualCast = async (event: React.FormEvent) => {
    event.preventDefault();
    const authPayload = getAuthPayload();
    if (!authPayload) return;

    if (!castForm.text.trim()) {
      setMessage({ type: 'error', text: 'Cast text is required.' });
      return;
    }

    setCastSubmitting(true);
    setMessage(null);

    try {
      const response = await fetch('/api/admin/farcaster', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'manual-cast',
          text: castForm.text.trim(),
          embedUrl: castForm.embedUrl.trim() || undefined,
          channelId: castForm.channelId.trim() || undefined,
          ...authPayload
        })
      });

      const data = await response.json();

      if (!response.ok) {
        setMessage({ type: 'error', text: data?.error || 'Failed to send cast.' });
        return;
      }

      const dryRunNotice = data?.dryRun ? ' (dry run mode)' : '';
      setMessage({ type: 'success', text: `Cast dispatched successfully${dryRunNotice}.` });
      setCastForm((previous) => ({
        text: '',
        embedUrl: '',
        channelId: previous.channelId
      }));
      fetchCastJobs({ quiet: true });
    } catch (error) {
      setMessage({ type: 'error', text: 'Network error while sending cast.' });
    } finally {
      setCastSubmitting(false);
    }
  };

  /**
   * Quick trigger for the Driver of the Day summary template. This reuses the
   * same channel override as the manual form so the admin can pivot casts
   * between channels without duplicate inputs.
   */
  const latestCompletedRace = useMemo(() => {
    return races
      .filter((race) => race.status === 'completed')
      .sort((a, b) => new Date(b.race_date).getTime() - new Date(a.race_date).getTime())[0];
  }, [races]);

  const nextPredictionRace = useMemo(() => {
    return races
      .filter((race) => (race.status === 'upcoming' || race.status === 'locked') && new Date(race.lock_time).getTime() > Date.now())
      .sort((a, b) => new Date(a.lock_time).getTime() - new Date(b.lock_time).getTime())[0];
  }, [races]);

  const triggerTemplate = useCallback(async (
    action: string,
    payload: Record<string, unknown>,
    trackerKey?: string
  ) => {
    const authPayload = getAuthPayload();
    if (!authPayload) return;

    const submissionKey = trackerKey ?? action;
    setTemplateSubmitting(submissionKey);
    setMessage(null);

    try {
      const response = await fetch('/api/admin/farcaster', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          channelId: castForm.channelId.trim() || undefined,
          ...payload,
          ...authPayload
        })
      });

      const data = await response.json();

      if (!response.ok) {
        setMessage({ type: 'error', text: data?.error || 'Failed to trigger cast.' });
        return;
      }

      const dryRunNotice = data?.dryRun ? ' (dry run mode)' : '';
      setMessage({ type: 'success', text: `Cast sent${dryRunNotice}.` });
      fetchCastJobs({ quiet: true });
    } catch (error) {
      setMessage({ type: 'error', text: 'Network error while triggering template cast.' });
    } finally {
      setTemplateSubmitting(null);
    }
  }, [getAuthPayload, setMessage, castForm.channelId, fetchCastJobs]);

  const handleTriggerDriverOfTheDay = async () => {
    if (!latestCompletedRace) {
      setMessage({ type: 'error', text: 'No completed races found for Driver of the Day cast.' });
      return;
    }
    await triggerTemplate('driver-of-day-summary', { raceId: latestCompletedRace.id }, 'driver-of-day-summary');
  };

  const handleTriggerRaceResultsSummary = async () => {
    if (!latestCompletedRace) {
      setMessage({ type: 'error', text: 'No completed race available for results summary.' });
      return;
    }
    await triggerTemplate('race-results-summary', { raceId: latestCompletedRace.id }, 'race-results-summary');
  };

  const handleTriggerPerfectSlateAlert = async () => {
    if (!latestCompletedRace) {
      setMessage({ type: 'error', text: 'No completed race available for perfect slate alert.' });
      return;
    }
    await triggerTemplate('perfect-slate-alert', { raceId: latestCompletedRace.id }, 'perfect-slate-alert');
  };

  const handleTriggerCloseCalls = async () => {
    if (!latestCompletedRace) {
      setMessage({ type: 'error', text: 'No completed race available for close calls cast.' });
      return;
    }
    await triggerTemplate('close-calls', { raceId: latestCompletedRace.id }, 'close-calls');
  };

  const handleTriggerLeaderboardUpdate = async () => {
    if (!latestCompletedRace) {
      setMessage({ type: 'error', text: 'No completed race available for leaderboard update.' });
      return;
    }
    await triggerTemplate('leaderboard-update', { raceId: latestCompletedRace.id }, 'leaderboard-update');
  };

  const handleTriggerLockReminder = async () => {
    if (!nextPredictionRace) {
      setMessage({ type: 'error', text: 'No upcoming race available for lock reminder.' });
      return;
    }

    const lockTime = new Date(nextPredictionRace.lock_time).getTime();
    const diffMinutes = Math.round((lockTime - Date.now()) / 60000);

    if (!Number.isFinite(diffMinutes) || diffMinutes <= 0) {
      setMessage({ type: 'error', text: 'Lock time has already passed for the next race.' });
      return;
    }

    await triggerTemplate(
      'lock-reminder',
      {
        raceId: nextPredictionRace.id,
        leadMinutes: diffMinutes
      },
      'lock-reminder'
    );
  };

  const handleTriggerConsensus = async (category: 'pole' | 'winner') => {
    if (!nextPredictionRace) {
      setMessage({ type: 'error', text: 'No upcoming race available for prediction consensus.' });
      return;
    }

    await triggerTemplate(
      'prediction-consensus',
      {
        raceId: nextPredictionRace.id,
        category
      },
      `prediction-consensus:${category}`
    );
  };

  /**
   * Remove a cast from Farcaster by hash. Useful for pulling accidental posts.
   */
  const handleDeleteCast = async (event: React.FormEvent) => {
    event.preventDefault();
    const authPayload = getAuthPayload();
    if (!authPayload) return;

    const targetHash = deleteForm.targetHash.trim();
    if (!targetHash) {
      setMessage({ type: 'error', text: 'Cast hash is required for deletion.' });
      return;
    }

    setDeleteSubmitting(true);
    setMessage(null);

    try {
      const response = await fetch('/api/admin/farcaster', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'delete-cast',
          targetHash,
          ...authPayload
        })
      });

      const data = await response.json();

      if (!response.ok) {
        setMessage({ type: 'error', text: data?.error || 'Failed to delete cast.' });
        return;
      }

      const dryRunNotice = data?.dryRun ? ' (dry run mode)' : '';
      const message = data?.result?.message
        ? `${data.result.message}${dryRunNotice}`
        : `Cast deleted${dryRunNotice}.`;
      setMessage({ type: 'success', text: message });
      setDeleteForm({ targetHash: '' });
      fetchCastJobs({ quiet: true });
    } catch (error) {
      setMessage({ type: 'error', text: 'Network error while deleting cast.' });
    } finally {
      setDeleteSubmitting(false);
    }
  };

  const lockCountdownMinutes = nextPredictionRace
    ? Math.round((new Date(nextPredictionRace.lock_time).getTime() - Date.now()) / 60000)
    : null;
  const templateInFlight = templateSubmitting !== null;
  const driverSubmitting = templateSubmitting === 'driver-of-day-summary';
  const raceResultsSubmitting = templateSubmitting === 'race-results-summary';
  const perfectSlateSubmitting = templateSubmitting === 'perfect-slate-alert';
  const closeCallsSubmitting = templateSubmitting === 'close-calls';
  const leaderboardSubmitting = templateSubmitting === 'leaderboard-update';
  const lockSubmitting = templateSubmitting === 'lock-reminder';
  const poleSubmitting = templateSubmitting === 'prediction-consensus:pole';
  const winnerSubmitting = templateSubmitting === 'prediction-consensus:winner';
  const lockReminderLabel = formatCountdownLabel(lockCountdownMinutes);
  const driverDisabled = templateInFlight || !latestCompletedRace;
  const raceResultsDisabled = templateInFlight || !latestCompletedRace;
  const perfectSlateDisabled = templateInFlight || !latestCompletedRace;
  const closeCallsDisabled = templateInFlight || !latestCompletedRace;
  const leaderboardDisabled = templateInFlight;
  const lockReminderDisabled =
    templateInFlight || lockCountdownMinutes === null || !Number.isFinite(lockCountdownMinutes) || lockCountdownMinutes <= 0;
  const poleConsensusDisabled = templateInFlight || !nextPredictionRace;
  const winnerConsensusDisabled = templateInFlight || !nextPredictionRace;

  return (
    <div className="space-y-6">
      <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
        <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
          <Send className="w-5 h-5 text-red-400" />
          Send Cast
        </h2>
        <p className="text-sm text-gray-400 mb-4">
          Compose a one-off Farcaster cast. Embeds appear as previews inside Farcaster and can be used to link the mini app.
        </p>
        <form onSubmit={handleSendManualCast} className="space-y-4">
          <div>
            <label className="block text-white mb-2">Cast Text *</label>
            <textarea
              value={castForm.text}
              onChange={(event) => setCastForm((previous) => ({ ...previous, text: event.target.value }))}
              className="w-full bg-gray-700 text-white rounded-lg p-3 border border-gray-600 min-h-[120px]"
              maxLength={CAST_TEXT_MAX_LENGTH}
              placeholder="What would you like to cast?"
              required
            />
            <p className="text-xs text-gray-500 mt-1">
              {castForm.text.length}/{CAST_TEXT_MAX_LENGTH} characters
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-white mb-2">Embed URL (optional)</label>
              <input
                type="url"
                value={castForm.embedUrl}
                onChange={(event) => setCastForm((previous) => ({ ...previous, embedUrl: event.target.value }))}
                placeholder="https://gridguessr.vercel.app"
                className="w-full bg-gray-700 text-white rounded-lg p-3 border border-gray-600"
              />
            </div>
            <div>
              <label className="block text-white mb-2">Channel (optional)</label>
              <input
                type="text"
                value={castForm.channelId}
                onChange={(event) => setCastForm((previous) => ({ ...previous, channelId: event.target.value }))}
                placeholder={channelPlaceholder}
                className="w-full bg-gray-700 text-white rounded-lg p-3 border border-gray-600"
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={castSubmitting}
            className="bg-red-600 hover:bg-red-700 disabled:bg-gray-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            {castSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
            Send Cast
          </button>
        </form>
      </div>

      <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
        <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
          <Trophy className="w-5 h-5 text-red-400" />
          Template Casts
        </h2>
        <p className="text-sm text-gray-400 mb-4">
          Trigger pre-built cast templates for quick updates: spotlight fan voting, remind people of upcoming locks, recap race-week highlights, and share leaderboard shake-ups.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="bg-gray-700/70 rounded-lg p-4 border border-gray-600">
            <p className="text-sm text-gray-400">Driver of the Day race</p>
            <p className="text-white font-semibold">
              {latestCompletedRace ? latestCompletedRace.name : 'No completed race'}
            </p>
            <p className="text-xs text-gray-500">
              {latestCompletedRace ? formatLocalDate(latestCompletedRace.race_date) : 'Awaiting results'}
            </p>
          </div>
          <div className="bg-gray-700/70 rounded-lg p-4 border border-gray-600">
            <p className="text-sm text-gray-400">Next prediction lock</p>
            <p className="text-white font-semibold">
              {nextPredictionRace ? nextPredictionRace.name : 'No upcoming race'}
            </p>
            <p className="text-xs text-gray-500">
              {nextPredictionRace ? `${formatLocalDateTime(nextPredictionRace.lock_time)} lock` : 'Awaiting schedule'}
            </p>
          </div>
        </div>
        <div className="mt-4">
          <label className="block text-white mb-2">Channel override (optional)</label>
          <input
            type="text"
            value={castForm.channelId}
            onChange={(event) => setCastForm((previous) => ({ ...previous, channelId: event.target.value }))}
            placeholder={channelPlaceholder}
            className="w-full bg-gray-700 text-white rounded-lg p-3 border border-gray-600"
          />
          <p className="text-xs text-gray-500 mt-1">
            Applies to both manual and template casts.
          </p>
        </div>
        <div className="mt-6 space-y-6">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">Latest Completed Race</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={handleTriggerDriverOfTheDay}
                  disabled={driverDisabled}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 text-white font-semibold py-3 rounded-lg transition-colors flex items-center justify-center gap-2"
                >
                  {driverSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  Cast Driver of the Day
                </button>
                <p className="text-xs text-gray-500 text-center">
                  Target: {latestCompletedRace ? latestCompletedRace.name : 'No completed race'}
                </p>
              </div>
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={handleTriggerRaceResultsSummary}
                  disabled={raceResultsDisabled}
                  className="w-full bg-rose-600 hover:bg-rose-700 disabled:bg-gray-700 text-white font-semibold py-3 rounded-lg transition-colors flex items-center justify-center gap-2"
                >
                  {raceResultsSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  Cast Race Results Recap
                </button>
                <p className="text-xs text-gray-500 text-center">
                  Target: {latestCompletedRace ? latestCompletedRace.name : 'No completed race'}
                </p>
              </div>
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={handleTriggerPerfectSlateAlert}
                  disabled={perfectSlateDisabled}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-700 text-white font-semibold py-3 rounded-lg transition-colors flex items-center justify-center gap-2"
                >
                  {perfectSlateSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  Cast Perfect Slate Alert
                </button>
                <p className="text-xs text-gray-500 text-center">
                  Target: {latestCompletedRace ? latestCompletedRace.name : 'No completed race'}
                </p>
              </div>
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={handleTriggerCloseCalls}
                  disabled={closeCallsDisabled}
                  className="w-full bg-slate-600 hover:bg-slate-700 disabled:bg-gray-700 text-white font-semibold py-3 rounded-lg transition-colors flex items-center justify-center gap-2"
                >
                  {closeCallsSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  Cast Close Calls
                </button>
                <p className="text-xs text-gray-500 text-center">
                  Target: {latestCompletedRace ? latestCompletedRace.name : 'No completed race'}
                </p>
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">Next Prediction Lock</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={handleTriggerLockReminder}
                  disabled={lockReminderDisabled}
                  className="w-full bg-yellow-600 hover:bg-yellow-700 disabled:bg-gray-700 text-white font-semibold py-3 rounded-lg transition-colors flex items-center justify-center gap-2"
                >
                  {lockSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  Cast Lock Reminder ({lockReminderLabel})
                </button>
                <p className="text-xs text-gray-500 text-center">
                  Target: {nextPredictionRace ? nextPredictionRace.name : 'No upcoming race'}
                </p>
              </div>
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => handleTriggerConsensus('pole')}
                  disabled={poleConsensusDisabled}
                  className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 text-white font-semibold py-3 rounded-lg transition-colors flex items-center justify-center gap-2"
                >
                  {poleSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  Cast Pole Consensus
                </button>
                <p className="text-xs text-gray-500 text-center">
                  Target: {nextPredictionRace ? nextPredictionRace.name : 'No upcoming race'}
                </p>
              </div>
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => handleTriggerConsensus('winner')}
                  disabled={winnerConsensusDisabled}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-700 text-white font-semibold py-3 rounded-lg transition-colors flex items-center justify-center gap-2"
                >
                  {winnerSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  Cast Winner Consensus
                </button>
                <p className="text-xs text-gray-500 text-center">
                  Target: {nextPredictionRace ? nextPredictionRace.name : 'No upcoming race'}
                </p>
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">Global Highlights</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={handleTriggerLeaderboardUpdate}
                  disabled={leaderboardDisabled}
                  className="w-full bg-cyan-600 hover:bg-cyan-700 disabled:bg-gray-700 text-white font-semibold py-3 rounded-lg transition-colors flex items-center justify-center gap-2"
                >
                  {leaderboardSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  Cast Leaderboard Update
                </button>
                <p className="text-xs text-gray-500 text-center">
                  Target: Global standings
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
        <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
          <Trash2 className="w-5 h-5 text-red-400" />
          Delete Cast
        </h2>
        <p className="text-sm text-gray-400 mb-4">
          Remove a previously published cast by hash. Uses the signer configured in environment variables.
        </p>
        <form onSubmit={handleDeleteCast} className="space-y-4">
          <div>
            <label className="block text-white mb-2">Cast Hash *</label>
            <input
              type="text"
              value={deleteForm.targetHash}
              onChange={(event) => setDeleteForm({ targetHash: event.target.value })}
              placeholder="0x..."
              className="w-full bg-gray-700 text-white rounded-lg p-3 border border-gray-600"
              required
            />
            <p className="text-xs text-gray-500 mt-1">
              You can copy this from the cast URL (`/cast/&lt;hash&gt;`).
            </p>
          </div>
          <button
            type="submit"
            disabled={deleteSubmitting}
            className="bg-red-600 hover:bg-red-700 disabled:bg-gray-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            {deleteSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
            Delete Cast
          </button>
        </form>
      </div>

      <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold text-white">Scheduled Cast Jobs</h2>
            <p className="text-sm text-gray-400">
              View upcoming Farcaster jobs generated by the scheduler and admin actions.
            </p>
          </div>
          <button
            type="button"
            onClick={() => fetchCastJobs({ quiet: false })}
            className="bg-gray-700 hover:bg-gray-600 text-white px-3 py-2 rounded-lg flex items-center gap-2 text-sm font-semibold"
          >
            <RefreshCcw className="w-4 h-4" />
            Refresh
          </button>
        </div>
        {castJobsLoading ? (
          <div className="flex items-center gap-3 text-gray-300">
            <Loader2 className="w-5 h-5 animate-spin" />
            Loading scheduled casts...
          </div>
        ) : castJobs.length === 0 ? (
          <p className="text-gray-400">No upcoming casts queued.</p>
        ) : (
          <div className="space-y-3">
            {castJobs.map((job) => {
              const statusClass = {
                pending: 'bg-yellow-500/10 text-yellow-300 border-yellow-500/40',
                processing: 'bg-blue-500/10 text-blue-300 border-blue-500/40',
                completed: 'bg-green-500/10 text-green-300 border-green-500/40',
                failed: 'bg-red-500/10 text-red-300 border-red-500/40'
              }[job.status] ?? 'bg-yellow-500/10 text-yellow-300 border-yellow-500/40';

              return (
                <div key={job.id} className="bg-gray-900 rounded-lg p-4 border border-gray-700">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm text-gray-400 uppercase tracking-wide">Template</p>
                      <h3 className="text-white font-semibold">{job.template}</h3>
                      <p className="text-xs text-gray-500 mt-1">
                        Scheduled for {formatLocalDateTime(job.scheduledFor)}
                      </p>
                    </div>
                    <span className={`px-3 py-1 rounded-full border text-xs font-semibold ${statusClass}`}>
                      {job.status.toUpperCase()}
                    </span>
                  </div>
                  <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm text-gray-300">
                    <div>
                      <span className="block text-xs text-gray-500 uppercase">Attempts</span>
                      {job.attemptCount}
                    </div>
                    <div>
                      <span className="block text-xs text-gray-500 uppercase">Channel</span>
                      {job.channelId || '—'}
                    </div>
                    <div>
                      <span className="block text-xs text-gray-500 uppercase">Last Attempt</span>
                      {formatLocalDateTime(job.lastAttemptAt)}
                    </div>
                    <div>
                      <span className="block text-xs text-gray-500 uppercase">Completed</span>
                      {formatLocalDateTime(job.completedAt)}
                    </div>
                  </div>
                  {job.lastError && (
                    <div className="mt-3 text-sm text-red-300">
                      <span className="block text-xs text-red-400 uppercase">Last Error</span>
                      {job.lastError}
                    </div>
                  )}
                  {job.payloadArgs && Object.keys(job.payloadArgs).length > 0 && (
                    <div className="mt-3">
                      <span className="block text-xs text-gray-500 uppercase mb-1">Payload</span>
                      <pre className="bg-gray-950 rounded-md p-3 text-xs text-gray-300 overflow-x-auto">
                        {JSON.stringify(job.payloadArgs, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

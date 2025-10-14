'use client';

import React, { useCallback, useMemo, useState } from 'react';
import { Bell, Clock, Flag, Loader2 } from 'lucide-react';

import type { AdminMessage, Race } from '../types';

type AdminNotificationsSectionProps = {
  races: Race[];
  getAuthPayload: () => Record<string, unknown> | null;
  setMessage: (message: AdminMessage | null) => void;
};

type NotificationFormState = {
  title: string;
  body: string;
  targetUrl: string;
  campaignId: string;
  targetFids: string;
  excludeFids: string;
  followingFid: string;
  minimumUserScore: string;
  nearLatitude: string;
  nearLongitude: string;
  nearRadius: string;
};

const defaultNotificationTargetUrl =
  process.env.NEXT_PUBLIC_URL ?? 'https://gridguessr.vercel.app';

const initialNotificationForm: NotificationFormState = {
  title: '',
  body: '',
  targetUrl: defaultNotificationTargetUrl,
  campaignId: '',
  targetFids: '',
  excludeFids: '',
  followingFid: '',
  minimumUserScore: '',
  nearLatitude: '',
  nearLongitude: '',
  nearRadius: ''
};

function parseFidInput(value: string): number[] {
  return value
    .split(/[,\s]+/)
    .map((candidate) => Number.parseInt(candidate.trim(), 10))
    .filter((fid) => Number.isInteger(fid) && fid > 0);
}

function parseIntegerInput(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number.parseInt(trimmed, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function parseNumberInput(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number.parseFloat(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

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

export function AdminNotificationsSection({
  races,
  getAuthPayload,
  setMessage
}: AdminNotificationsSectionProps) {
  const [notificationForm, setNotificationForm] = useState<NotificationFormState>(initialNotificationForm);
  const [notificationSubmitting, setNotificationSubmitting] = useState(false);
  const [templateSubmitting, setTemplateSubmitting] = useState<string | null>(null);

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

  const lockCountdownMinutes = nextPredictionRace
    ? Math.round((new Date(nextPredictionRace.lock_time).getTime() - Date.now()) / 60000)
    : null;
  const lockCountdownLabel = formatCountdownLabel(lockCountdownMinutes);
  const templateInFlight = templateSubmitting !== null;
  const lockTemplateSubmitting = templateSubmitting === 'race-lock-reminder';
  const resultsTemplateSubmitting = templateSubmitting === 'race-results-broadcast';
  const lockCountdownValid = lockCountdownMinutes !== null && Number.isFinite(lockCountdownMinutes);
  const lockDisabled =
    templateInFlight || !nextPredictionRace || !lockCountdownValid || (lockCountdownMinutes ?? 0) <= 0;
  const resultsDisabled = templateInFlight || !latestCompletedRace;

  const triggerTemplate = useCallback(async (action: string, payload: Record<string, unknown>, trackerKey?: string) => {
    const authPayload = getAuthPayload();
    if (!authPayload) return;

    const submissionKey = trackerKey ?? action;
    setTemplateSubmitting(submissionKey);
    setMessage(null);

    try {
      const response = await fetch('/api/admin/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          ...payload,
          ...authPayload
        })
      });

      const data = await response.json();

      if (!response.ok) {
        setMessage({ type: 'error', text: data?.error || 'Failed to send notification template.' });
        return;
      }

      const dryRunNotice = data?.dryRun ? ' (dry run mode)' : '';
      const targetedSuffix =
        typeof data?.targetFidCount === 'number'
          ? ` Targeted ${data.targetFidCount} user${data.targetFidCount === 1 ? '' : 's'}.`
          : '';

      setMessage({ type: 'success', text: `Notification dispatched${dryRunNotice}.${targetedSuffix}` });
    } catch (error) {
      setMessage({ type: 'error', text: 'Network error while sending notification template.' });
    } finally {
      setTemplateSubmitting(null);
    }
  }, [getAuthPayload, setMessage]);

  const handleTriggerRaceLock = useCallback(async () => {
    if (!nextPredictionRace) {
      setMessage({ type: 'error', text: 'No upcoming race found for lock notification.' });
      return;
    }

    const lockTime = new Date(nextPredictionRace.lock_time).getTime();
    const diffMinutes = Math.round((lockTime - Date.now()) / 60000);

    if (!Number.isFinite(diffMinutes) || diffMinutes <= 0) {
      setMessage({ type: 'error', text: 'Race lock has already passed for the next race.' });
      return;
    }

    await triggerTemplate(
      'race-lock-reminder',
      { raceId: nextPredictionRace.id },
      'race-lock-reminder'
    );
  }, [nextPredictionRace, setMessage, triggerTemplate]);

  const handleTriggerRaceResults = useCallback(async () => {
    if (!latestCompletedRace) {
      setMessage({ type: 'error', text: 'No completed race found for results notification.' });
      return;
    }

    await triggerTemplate(
      'race-results-broadcast',
      { raceId: latestCompletedRace.id },
      'race-results-broadcast'
    );
  }, [latestCompletedRace, setMessage, triggerTemplate]);

  const handleSendNotification = async (event: React.FormEvent) => {
    event.preventDefault();
    const authPayload = getAuthPayload();
    if (!authPayload) return;

    const title = notificationForm.title.trim();
    const bodyText = notificationForm.body.trim();

    if (!title) {
      setMessage({ type: 'error', text: 'Notification title is required.' });
      return;
    }
    if (!bodyText) {
      setMessage({ type: 'error', text: 'Notification body is required.' });
      return;
    }

    const targetUrl = notificationForm.targetUrl.trim();
    const targetFids = parseFidInput(notificationForm.targetFids);
    const excludeFids = parseFidInput(notificationForm.excludeFids);
    const followingFid = parseIntegerInput(notificationForm.followingFid);
    const minimumUserScore = parseNumberInput(notificationForm.minimumUserScore);
    const nearLatitude = parseNumberInput(notificationForm.nearLatitude);
    const nearLongitude = parseNumberInput(notificationForm.nearLongitude);
    const nearRadius = parseNumberInput(notificationForm.nearRadius);

    const filtersPayload: Record<string, unknown> = {};

    if (excludeFids.length > 0) {
      filtersPayload.excludeFids = excludeFids;
    }

    if (followingFid !== null) {
      filtersPayload.followingFid = followingFid;
    }

    if (minimumUserScore !== null) {
      filtersPayload.minimumUserScore = minimumUserScore;
    }

    if (nearLatitude !== null && nearLongitude !== null) {
      filtersPayload.nearLocation = {
        latitude: nearLatitude,
        longitude: nearLongitude,
        ...(nearRadius !== null ? { radius: nearRadius } : {})
      };
    }

    const payload: Record<string, unknown> = {
      action: 'manual-notification',
      notification: {
        title,
        body: bodyText,
        ...(targetUrl ? { targetUrl } : {})
      },
      ...authPayload,
      ...(targetFids.length > 0 ? { targetFids } : { targetFids: [] })
    };

    if (notificationForm.campaignId.trim()) {
      payload.campaignId = notificationForm.campaignId.trim();
    }

    if (Object.keys(filtersPayload).length > 0) {
      payload.filters = filtersPayload;
    }

    setNotificationSubmitting(true);
    setMessage(null);

    try {
      const response = await fetch('/api/admin/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (!response.ok) {
        setMessage({ type: 'error', text: data?.error || 'Failed to send notification.' });
        return;
      }

      const dryRunNotice = data?.dryRun ? ' (dry run mode)' : '';
      setMessage({ type: 'success', text: `Notification dispatched${dryRunNotice}.` });

      setNotificationForm((previous) => ({
        ...initialNotificationForm,
        targetUrl: previous.targetUrl || initialNotificationForm.targetUrl
      }));
    } catch (error) {
      setMessage({ type: 'error', text: 'Network error while sending notification.' });
    } finally {
      setNotificationSubmitting(false);
    }
  };

  const nextRaceSubtitle = nextPredictionRace
    ? `Targets users without predictions for ${nextPredictionRace.name}.`
    : 'Need an upcoming race with an open prediction window.';

  const completedRaceSubtitle = latestCompletedRace
    ? `Broadcasts to all users for ${latestCompletedRace.name}.`
    : 'Complete a race to enable this template.';

  return (
    <div className="space-y-6">
      <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
        <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
          <Bell className="w-5 h-5 text-red-400" />
          Notification Templates
        </h2>
        <p className="text-sm text-gray-400 mb-4">
          Trigger preset alerts without retyping copy. Templates reuse your admin credentials and deliver instantly.
        </p>
        <div className="grid grid-cols-1 gap-4">
          <button
            type="button"
            onClick={handleTriggerRaceLock}
            disabled={lockDisabled}
            className={`w-full rounded-lg border border-gray-700 p-4 transition-colors text-left ${
              lockDisabled
                ? 'bg-gray-800 text-gray-500 cursor-not-allowed'
                : 'bg-gray-900 hover:bg-gray-800 text-white'
            }`}
          >
            <div className="flex items-center gap-2">
              {lockTemplateSubmitting ? (
                <Loader2 className="w-4 h-4 animate-spin text-white" />
              ) : (
                <Clock className="w-4 h-4 text-red-400" />
              )}
              <span className="font-semibold">
                {nextPredictionRace ? `Race lock reminder (${lockCountdownLabel})` : 'No upcoming race found'}
              </span>
            </div>
            <p className="text-sm text-gray-400 mt-2">{nextRaceSubtitle}</p>
          </button>
          <button
            type="button"
            onClick={handleTriggerRaceResults}
            disabled={resultsDisabled}
            className={`w-full rounded-lg border border-gray-700 p-4 transition-colors text-left ${
              resultsDisabled
                ? 'bg-gray-800 text-gray-500 cursor-not-allowed'
                : 'bg-gray-900 hover:bg-gray-800 text-white'
            }`}
          >
            <div className="flex items-center gap-2">
              {resultsTemplateSubmitting ? (
                <Loader2 className="w-4 h-4 animate-spin text-white" />
              ) : (
                <Flag className="w-4 h-4 text-red-400" />
              )}
              <span className="font-semibold">
                {latestCompletedRace ? `${latestCompletedRace.name} results & scores live` : 'No completed race found'}
              </span>
            </div>
            <p className="text-sm text-gray-400 mt-2">{completedRaceSubtitle}</p>
          </button>
        </div>
      </div>

      <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
        <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
          <Bell className="w-5 h-5 text-red-400" />
          Mini App Notifications
        </h2>
        <p className="text-sm text-gray-400 mb-4">
          Reach users who added GridGuessr and opted into notifications. Leave the target FIDs field empty to broadcast to every subscribed user.
        </p>
        <form onSubmit={handleSendNotification} className="space-y-4">
          <div>
            <label className="block text-white mb-2">Notification Title *</label>
            <input
              type="text"
              value={notificationForm.title}
              onChange={(event) => setNotificationForm((previous) => ({ ...previous, title: event.target.value }))}
              placeholder="Race week update"
              className="w-full bg-gray-700 text-white rounded-lg p-3 border border-gray-600"
              required
            />
          </div>
          <div>
            <label className="block text-white mb-2">Notification Body *</label>
            <textarea
              value={notificationForm.body}
              onChange={(event) => setNotificationForm((previous) => ({ ...previous, body: event.target.value }))}
              className="w-full bg-gray-700 text-white rounded-lg p-3 border border-gray-600 min-h-[96px]"
              placeholder="Lock closes in 1 hour. Finalize your slate now!"
              required
            />
            <p className="text-xs text-gray-500 mt-1">
              Keep it concise — most Farcaster clients only show the first couple of lines.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-white mb-2">Target URL</label>
              <input
                type="url"
                value={notificationForm.targetUrl}
                onChange={(event) => setNotificationForm((previous) => ({ ...previous, targetUrl: event.target.value }))}
                placeholder="https://gridguessr.vercel.app"
                className="w-full bg-gray-700 text-white rounded-lg p-3 border border-gray-600"
              />
              <p className="text-xs text-gray-500 mt-1">
                Defaults to the GridGuessr home page when left empty.
              </p>
            </div>
            <div>
              <label className="block text-white mb-2">Campaign ID (optional)</label>
              <input
                type="text"
                value={notificationForm.campaignId}
                onChange={(event) => setNotificationForm((previous) => ({ ...previous, campaignId: event.target.value }))}
                placeholder="lock-reminder-weekend"
                className="w-full bg-gray-700 text-white rounded-lg p-3 border border-gray-600"
              />
              <p className="text-xs text-gray-500 mt-1">
                Use campaign IDs to track analytics inside Neynar.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-white mb-2">Target FIDs (optional)</label>
              <textarea
                value={notificationForm.targetFids}
                onChange={(event) => setNotificationForm((previous) => ({ ...previous, targetFids: event.target.value }))}
                placeholder="12345, 67890"
                className="w-full bg-gray-700 text-white rounded-lg p-3 border border-gray-600 min-h-[80px]"
              />
              <p className="text-xs text-gray-500 mt-1">
                Provide comma or space separated FIDs. Leave blank to notify everyone.
              </p>
            </div>
            <div>
              <label className="block text-white mb-2">Exclude FIDs (optional)</label>
              <textarea
                value={notificationForm.excludeFids}
                onChange={(event) => setNotificationForm((previous) => ({ ...previous, excludeFids: event.target.value }))}
                placeholder="111, 222"
                className="w-full bg-gray-700 text-white rounded-lg p-3 border border-gray-600 min-h-[80px]"
              />
              <p className="text-xs text-gray-500 mt-1">
                Skip internal accounts or testers by listing their FIDs here.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-white mb-2">Following FID Filter (optional)</label>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={notificationForm.followingFid}
                onChange={(event) => setNotificationForm((previous) => ({ ...previous, followingFid: event.target.value }))}
                placeholder="Follower FID"
                className="w-full bg-gray-700 text-white rounded-lg p-3 border border-gray-600"
              />
              <p className="text-xs text-gray-500 mt-1">
                Only users following this FID will receive the notification.
              </p>
            </div>
            <div>
              <label className="block text-white mb-2">Minimum User Score (optional)</label>
              <input
                type="text"
                inputMode="decimal"
                value={notificationForm.minimumUserScore}
                onChange={(event) => setNotificationForm((previous) => ({ ...previous, minimumUserScore: event.target.value }))}
                placeholder="0.5"
                className="w-full bg-gray-700 text-white rounded-lg p-3 border border-gray-600"
              />
              <p className="text-xs text-gray-500 mt-1">
                Target only highly engaged users by setting a score between 0 and 1.
              </p>
            </div>
          </div>
          <div>
            <label className="block text-white mb-2">Near Location Filter (optional)</label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <input
                type="text"
                inputMode="decimal"
                value={notificationForm.nearLatitude}
                onChange={(event) => setNotificationForm((previous) => ({ ...previous, nearLatitude: event.target.value }))}
                placeholder="Latitude"
                className="w-full bg-gray-700 text-white rounded-lg p-3 border border-gray-600"
              />
              <input
                type="text"
                inputMode="decimal"
                value={notificationForm.nearLongitude}
                onChange={(event) => setNotificationForm((previous) => ({ ...previous, nearLongitude: event.target.value }))}
                placeholder="Longitude"
                className="w-full bg-gray-700 text-white rounded-lg p-3 border border-gray-600"
              />
              <input
                type="text"
                inputMode="decimal"
                value={notificationForm.nearRadius}
                onChange={(event) => setNotificationForm((previous) => ({ ...previous, nearRadius: event.target.value }))}
                placeholder="Radius (m)"
                className="w-full bg-gray-700 text-white rounded-lg p-3 border border-gray-600"
              />
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Latitude and longitude use decimal degrees. Radius defaults to 50,000 meters when omitted.
            </p>
          </div>
          <button
            type="submit"
            disabled={notificationSubmitting}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            {notificationSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
            Send Notification
          </button>
        </form>
      </div>
    </div>
  );
}

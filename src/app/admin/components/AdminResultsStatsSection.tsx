'use client';

import React, { useEffect, useState } from 'react';
import { formatLocalDate, formatLocalDateTime } from '../utils';

interface ScoreEntry {
  userId: string;
  name: string;
  score: number;
}

interface AccuracyEntry {
  label: string;
  count: number;
  percentage: number;
}

interface ScoreBucket {
  bucket: number;
  count: number;
  percentage: number;
}

type ResultsResponse = {
  race: { id: string; name: string; race_date: string; lock_time: string } | null;
  results: Record<string, unknown> | null;
  accuracy: AccuracyEntry[];
  perfectSlates: ScoreEntry[];
  nearPerfect: ScoreEntry[];
  topScores: ScoreEntry[];
  scoreDistribution: ScoreBucket[];
};

function renderScoreList(title: string, items: ScoreEntry[]) {
  return (
    <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
      <h3 className="text-white font-semibold mb-2">{title}</h3>
      {items.length === 0 ? (
        <p className="text-gray-400 text-sm">None yet</p>
      ) : (
        <div className="space-y-1">
          {items.map((item) => (
            <div key={item.userId} className="flex items-center justify-between text-sm text-gray-300">
              <span>{item.name}</span>
              <span className="text-gray-400">{item.score}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function renderResultsSummary(results: Record<string, unknown> | null) {
  if (!results) {
    return <p className="text-gray-400 text-sm">Race results not available.</p>;
  }

  const dnfValue = typeof results.noDnf === 'boolean'
    ? results.noDnf
      ? 'No DNF'
      : String(results.firstDnf ?? '—')
    : '—';

  const entries: Array<{ label: string; value: string }> = [
    { label: 'Pole', value: String(results.pole ?? '—') },
    { label: 'Winner', value: String(results.winner ?? '—') },
    { label: 'Second', value: String(results.second ?? '—') },
    { label: 'Third', value: String(results.third ?? '—') },
    { label: 'Fastest Lap', value: String(results.fastestLap ?? '—') },
    { label: 'Fastest Pit Team', value: String(results.fastestPitTeam ?? '—') },
    { label: 'No DNF / First DNF', value: dnfValue },
    { label: 'Safety Car', value: typeof results.safetyCar === 'boolean' ? (results.safetyCar ? 'Yes' : 'No') : '—' },
    { label: 'Winning Margin', value: String(results.winningMargin ?? '—') },
    { label: 'Wildcard', value: typeof results.wildcard === 'boolean' ? (results.wildcard ? 'Yes' : 'No') : '—' },
  ];

  return (
    <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
      <h3 className="text-white font-semibold mb-2">Race Results</h3>
      <div className="space-y-1 text-sm text-gray-300">
        {entries.map((entry) => (
          <div key={entry.label} className="flex items-center justify-between">
            <span className="text-gray-400">{entry.label}</span>
            <span>{entry.value || '—'}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function renderAccuracy(items: AccuracyEntry[]) {
  return (
    <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
      <h3 className="text-white font-semibold mb-2">Prediction Accuracy</h3>
      {items.length === 0 ? (
        <p className="text-gray-400 text-sm">No predictions scored yet.</p>
      ) : (
        <div className="space-y-1">
          {items.map((item) => (
            <div key={item.label} className="flex items-center justify-between text-sm text-gray-300">
              <span>{item.label}</span>
              <span className="text-gray-400">{item.count} · {item.percentage}%</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function renderDistribution(buckets: ScoreBucket[]) {
  return (
    <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
      <h3 className="text-white font-semibold mb-2">Score Distribution</h3>
      <div className="space-y-1 text-sm text-gray-300">
        {buckets.map((bucket) => (
          <div key={bucket.bucket} className="flex items-center justify-between">
            <span>{bucket.bucket === 110 ? '110+' : `${bucket.bucket}-${bucket.bucket + 9}`}</span>
            <span className="text-gray-400">{bucket.count} · {bucket.percentage}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function AdminResultsStatsSection() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ResultsResponse | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch('/api/admin/stats/results');
        const json = await res.json();
        if (!res.ok) {
          setError(json?.error || 'Failed to load results stats');
          return;
        }
        setData(json);
      } catch (e) {
        setError('Network error while loading results stats');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  if (loading) {
    return <div className="text-gray-300">Loading results stats…</div>;
  }

  if (error) {
    return <div className="text-red-400">{error}</div>;
  }

  if (!data?.race) {
    return <div className="text-gray-400">No completed race data available yet.</div>;
  }

  return (
    <div className="space-y-6">
      <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
        <h2 className="text-xl font-bold text-white mb-3">Latest Race Summary</h2>
        <p className="text-gray-400 text-sm mb-4">
          Race: <span className="text-white font-semibold">{data.race.name}</span> · {formatLocalDate(data.race.race_date)}
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {renderResultsSummary(data.results)}
          {renderAccuracy(data.accuracy)}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {renderScoreList('Perfect Slates', data.perfectSlates)}
        {renderScoreList('Close Calls (8/9)', data.nearPerfect)}
        {renderScoreList('Top Scores', data.topScores)}
      </div>

      {renderDistribution(data.scoreDistribution)}
    </div>
  );
}

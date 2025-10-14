'use client';

import React, { useEffect, useState } from 'react';
import { formatLocalDateTime } from '../utils';

type StatEntry = { id?: string; name?: string; value?: string; count: number; percentage: number };

type PredictionsStats = {
  total: number;
  pole: StatEntry[];
  winner: StatEntry[];
  second: StatEntry[];
  third: StatEntry[];
  fastestLap: StatEntry[];
  fastestPitTeam: StatEntry[];
  firstDnf: StatEntry[];
  safetyCar: StatEntry[];
  wildcard: StatEntry[];
};

export function AdminStatsSection() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [predictionRace, setPredictionRace] = useState<any | null>(null);
  const [predictions, setPredictions] = useState<PredictionsStats | null>(null);
  const [dotdRace, setDotdRace] = useState<any | null>(null);
  const [dotd, setDotd] = useState<{ total: number; options: StatEntry[] } | null>(null);
  const [totalUsers, setTotalUsers] = useState<number | null>(null);

  useEffect(() => {
    const run = async () => {
      try {
        const res = await fetch('/api/admin/stats');
        const data = await res.json();
        if (!res.ok) {
          setError(data?.error || 'Failed to load stats');
          return;
        }
        setPredictionRace(data.predictionRace || null);
        setPredictions(data.predictions || null);
        setDotdRace(data.dotdRace || null);
        setDotd(data.dotd || null);
        setTotalUsers(typeof data.totalUsers === 'number' ? data.totalUsers : null);
      } catch (e) {
        setError('Network error while loading stats');
      } finally {
        setLoading(false);
      }
    };
    run();
  }, []);

  if (loading) {
    return <div className="text-gray-300">Loading stats…</div>;
  }

  if (error) {
    return <div className="text-red-400">{error}</div>;
  }

  const renderTable = (title: string, items: StatEntry[], valueKey: 'name' | 'value' = 'name') => (
    <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
      <h3 className="text-white font-semibold mb-2">{title}</h3>
      {items.length === 0 ? (
        <p className="text-gray-400 text-sm">No data</p>
      ) : (
        <div className="space-y-1">
          {items.map((it, idx) => (
            <div key={(it.id || it.value || String(idx)) + title} className="flex items-center justify-between text-sm">
              <span className="text-gray-300">
                {it[valueKey] || '-'}
              </span>
              <span className="text-gray-400">
                {it.count} · {it.percentage}%
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
        <h2 className="text-xl font-bold text-white mb-4">Prediction Stats</h2>
        {predictionRace ? (
          <p className="text-gray-400 text-sm mb-4">
            Race: <span className="text-white font-semibold">{predictionRace.name}</span> · Lock {formatLocalDateTime(predictionRace.lock_time)} ·
            Total predictions: <span className="text-white font-semibold">{predictions?.total ?? 0}</span> out of <span className="text-white font-semibold">{totalUsers ?? '—'}</span> users.
          </p>
        ) : (
          <p className="text-gray-400 text-sm mb-4">No upcoming race with open predictions</p>
        )}

        {predictions && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {renderTable('Pole', predictions.pole)}
            {renderTable('Winner', predictions.winner)}
            {renderTable('Second', predictions.second)}
            {renderTable('Third', predictions.third)}
            {renderTable('Fastest Lap', predictions.fastestLap)}
            {renderTable('Fastest Pit Team', predictions.fastestPitTeam)}
            {renderTable('First DNF / No DNF', predictions.firstDnf)}
            {renderTable('Safety Car', predictions.safetyCar, 'value')}
            {renderTable('Wildcard', predictions.wildcard, 'value')}
          </div>
        )}
      </div>

      <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
        <h2 className="text-xl font-bold text-white mb-4">Driver of the Day</h2>
        {dotdRace ? (
          <p className="text-gray-400 text-sm mb-4">
            Race: <span className="text-white font-semibold">{dotdRace.name}</span> · Total votes: <span className="text-white font-semibold">{dotd?.total ?? 0}</span>
          </p>
        ) : (
          <p className="text-gray-400 text-sm mb-4">No completed race found</p>
        )}

        {dotd && (
          <div>
            {renderTable('Current Votes', dotd.options)}
          </div>
        )}
      </div>
    </div>
  );
}

"use client";

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, Calendar, CheckCircle, Megaphone, Trophy } from 'lucide-react';

import { AdminCastSection } from './components/AdminCastSection';
import { AdminStatsSection } from './components/AdminStatsSection';
import { AdminResultsStatsSection } from './components/AdminResultsStatsSection';
import { AdminRaceSection } from './components/AdminRaceSection';
import { AdminResultsSection } from './components/AdminResultsSection';
import type {
  AdminCredential,
  AdminMessage,
  Driver,
  Race,
  Team
} from './types';

interface AdminPanelProps {
  authCredential: AdminCredential | null;
}

type AdminTab = 'races' | 'results' | 'casts' | 'stats' | 'resultsStats';

/**
 * Top-level coordinator for the admin experience.
 * Handles shared data loading, credential checks, and tab routing while the
 * individual feature blocks (races, results, casts) manage their own UI logic.
 */
export default function AdminPanel({ authCredential }: AdminPanelProps) {
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<AdminTab>('races');
  const [message, setMessage] = useState<AdminMessage | null>(null);

  const [races, setRaces] = useState<Race[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);

  /**
   * Normalize the credential we pass down to API calls so the child sections
   * can use the same helper to authenticate requests.
   */
  const authPayload = useMemo(() => {
    if (!authCredential) return null;
    if (typeof authCredential.fid === 'number') {
      return { adminFid: authCredential.fid };
    }
    if (authCredential.password) {
      return { adminPassword: authCredential.password };
    }
    return null;
  }, [authCredential]);

  const getAuthPayload = useCallback(() => {
    if (authPayload) return authPayload;
    setMessage({ type: 'error', text: 'Admin credentials missing. Please re-authenticate.' });
    return null;
  }, [authPayload, setMessage]);

  const authSummary = useMemo(() => {
    if (!authCredential) return 'unauthenticated';
    if (typeof authCredential.fid === 'number') {
      return `FID #${authCredential.fid}`;
    }
    if (authCredential.password) {
      return 'admin password';
    }
    return 'unknown';
  }, [authCredential]);

  /**
   * Load the admin datasets (races, drivers, teams). Child sections re-use this
   * when they need to refresh state after a mutation.
   */
  const fetchData = useCallback(async (options?: { quiet?: boolean }) => {
    if (!options?.quiet) {
      setLoading(true);
    }

    try {
      const [racesRes, currentRes] = await Promise.all([
        fetch('/api/admin/races'),
        fetch('/api/races/current')
      ]);

      const racesData = await racesRes.json();
      const currentData = await currentRes.json();

      setRaces(racesData?.races ?? []);
      setDrivers(currentData?.drivers ?? []);
      setTeams(currentData?.teams ?? []);
    } catch (error) {
      console.error('Error fetching admin data:', error);
      if (!options?.quiet) {
        setMessage({ type: 'error', text: 'Failed to load admin data.' });
      }
    } finally {
      if (!options?.quiet) {
        setLoading(false);
      }
    }
  }, [setMessage]);

  useEffect(() => {
    fetchData({ quiet: false });
  }, [fetchData]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-white">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="bg-gray-800 rounded-xl p-6 border-2 border-red-500">
          <h1 className="text-3xl font-bold text-white mb-2 flex items-center gap-3">
            <Trophy className="w-8 h-8 text-red-500" />
            GridGuessr Admin Panel
          </h1>
          <p className="text-gray-400">Manage races, results, and Farcaster casts</p>
        </div>

        <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
          <h2 className="text-xl font-bold text-white mb-2">Admin Session</h2>
          <p className="text-sm text-gray-400">
            Authenticated via <span className="text-white font-semibold">{authSummary}</span>. Refresh or reopen the admin
            page to authenticate with a different method.
          </p>
        </div>

        <div className="grid gap-2 grid-cols-2 md:grid-cols-4">
          <button
            onClick={() => setActiveTab('races')}
            className={`py-3 rounded-lg font-semibold transition-all ${
              activeTab === 'races'
                ? 'bg-red-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
          >
            <Calendar className="w-5 h-5 inline mr-2" />
            Manage Races
          </button>
          <button
            onClick={() => setActiveTab('results')}
            className={`py-3 rounded-lg font-semibold transition-all ${
              activeTab === 'results'
                ? 'bg-red-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
          >
            <Trophy className="w-5 h-5 inline mr-2" />
            Enter Results
          </button>
          <button
            onClick={() => setActiveTab('casts')}
            className={`py-3 rounded-lg font-semibold transition-all col-span-2 md:col-span-1 ${
              activeTab === 'casts'
                ? 'bg-red-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
          >
            <Megaphone className="w-5 h-5 inline mr-2" />
            Farcaster Casts
          </button>
          <button
            onClick={() => setActiveTab('stats')}
            className={`py-3 rounded-lg font-semibold transition-all col-span-2 md:col-span-1 ${
              activeTab === 'stats'
                ? 'bg-red-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
          >
            📊 Predictions & Votes
          </button>
          <button
            onClick={() => setActiveTab('resultsStats')}
            className={`py-3 rounded-lg font-semibold transition-all col-span-2 md:col-span-1 ${
              activeTab === 'resultsStats'
                ? 'bg-red-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
          >
            🏁 Results Insights
          </button>
        </div>

        {message && (
          <div
            className={`p-4 rounded-xl border-2 ${
              message.type === 'success'
                ? 'bg-green-900 border-green-500 text-green-100'
                : 'bg-red-900 border-red-500 text-red-100'
            }`}
          >
            <div className="flex items-center gap-2">
              {message.type === 'success' ? <CheckCircle className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
              <span>{message.text}</span>
            </div>
          </div>
        )}

        {activeTab === 'races' && (
          <AdminRaceSection
            races={races}
            getAuthPayload={getAuthPayload}
            setMessage={setMessage}
            refreshData={fetchData}
          />
        )}

        {activeTab === 'results' && (
          <AdminResultsSection
            races={races}
            drivers={drivers}
            teams={teams}
            getAuthPayload={getAuthPayload}
            setMessage={setMessage}
            refreshData={fetchData}
          />
        )}

        {activeTab === 'casts' && (
          <AdminCastSection
            races={races}
            getAuthPayload={getAuthPayload}
            setMessage={setMessage}
          />
        )}

        {activeTab === 'stats' && (
          <AdminStatsSection />
        )}

        {activeTab === 'resultsStats' && (
          <AdminResultsStatsSection />
        )}
      </div>
    </div>
  );
}

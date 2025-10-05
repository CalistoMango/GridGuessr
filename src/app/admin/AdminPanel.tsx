"use client";

import React, { useState, useEffect } from 'react';
import { CheckCircle, Trophy, AlertCircle, Plus, Trash2, Calendar } from 'lucide-react';

interface Driver {
  id: string;
  name: string;
  team: string;
  number: string;
}

interface Team {
  id: string;
  name: string;
}

interface Race {
  id: string;
  name: string;
  circuit: string;
  country: string;
  race_date: string;
  lock_time: string;
  status: string;
  season: number;
  round: number;
  wildcard_question?: string;
}

export default function AdminPanel() {
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'results' | 'races'>('races');
  const [races, setRaces] = useState<Race[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedRace, setSelectedRace] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [adminFid, setAdminFid] = useState<string>('');

  // Results form state
  const [results, setResults] = useState({
    poleDriverId: '',
    winnerDriverId: '',
    secondDriverId: '',
    thirdDriverId: '',
    fastestLapDriverId: '',
    fastestPitTeamId: '',
    firstDnfDriverId: '',
    noDnf: false,
    safetyCar: false,
    winningMargin: '',
    wildcardResult: false
  });

  // New race form state
  const [newRace, setNewRace] = useState({
    name: '',
    circuit: '',
    country: '',
    raceDate: '',
    lockTime: '',
    season: new Date().getFullYear().toString(),
    round: '',
    wildcardQuestion: ''
  });
  const [editingRaceId, setEditingRaceId] = useState<string | null>(null);

  const marginBuckets = ['0-2s', '2-4s', '4-7s', '7-12s', '12-20s', '20s+'];

  const formatDateTimeForInput = (value: string | null | undefined) => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const offset = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - offset).toISOString().slice(0, 16);
  };

  const resetRaceForm = () => {
    setNewRace({
      name: '',
      circuit: '',
      country: '',
      raceDate: '',
      lockTime: '',
      season: new Date().getFullYear().toString(),
      round: '',
      wildcardQuestion: ''
    });
    setEditingRaceId(null);
  };

  useEffect(() => {
    fetchData();
    // Try to get admin FID from localStorage
    const storedFid = localStorage.getItem('gridguessr_admin_fid');
    if (storedFid) setAdminFid(storedFid);
  }, []);

  const fetchData = async () => {
    try {
      const [racesRes, currentRes] = await Promise.all([
        fetch('/api/admin/races'),
        fetch('/api/races/current')
      ]);

      const racesData = await racesRes.json();
      const currentData = await currentRes.json();
      
      setRaces(racesData.races || []);
      setDrivers(currentData.drivers || []);
      setTeams(currentData.teams || []);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const adminCode = adminFid.trim();

  const requireAdminCode = () => {
    if (!adminCode) {
      setMessage({ type: 'error', text: 'Set your admin code in the Admin Access section first.' });
      return false;
    }
    return true;
  };

  const handleSaveAdminCode = () => {
    const trimmed = adminFid.trim();
    if (!trimmed) {
      localStorage.removeItem('gridguessr_admin_fid');
      setMessage({ type: 'success', text: 'Admin code cleared from this device.' });
      return;
    }

    localStorage.setItem('gridguessr_admin_fid', trimmed);
    setAdminFid(trimmed);
    setMessage({ type: 'success', text: 'Admin code saved locally.' });
  };

  const handleCreateOrUpdateRace = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!requireAdminCode()) return;

    setSubmitting(true);
    setMessage(null);

    try {
      const res = await fetch('/api/admin/races', {
        method: editingRaceId ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-token': adminCode
        },
        body: JSON.stringify({
          ...(editingRaceId ? { raceId: editingRaceId } : {}),
          ...newRace
        })
      });

      const data = await res.json();

      if (res.ok) {
        setMessage({ type: 'success', text: editingRaceId ? 'Race updated successfully!' : 'Race created successfully!' });
        resetRaceForm();
        fetchData();
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to create race' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Network error' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteRace = async (raceId: string) => {
    if (!confirm('Are you sure you want to delete this race? This will also delete all predictions!')) {
      return;
    }

    if (!requireAdminCode()) return;

    try {
      const res = await fetch('/api/admin/races', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-token': adminCode
        },
        body: JSON.stringify({ raceId })
      });

      if (res.ok) {
        setMessage({ type: 'success', text: 'Race deleted successfully!' });
        fetchData();
      } else {
        const data = await res.json();
        setMessage({ type: 'error', text: data.error || 'Failed to delete race' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Network error' });
    }
  };

  const handleSubmitResults = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!requireAdminCode()) return;

    setSubmitting(true);
    setMessage(null);

    try {
      const res = await fetch('/api/admin/results', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-token': adminCode
        },
        body: JSON.stringify({
          raceId: selectedRace,
          ...results
        })
      });

      const data = await res.json();

      if (res.ok) {
        setMessage({ type: 'success', text: `Success! ${data.message}` });
        setResults({
          poleDriverId: '',
          winnerDriverId: '',
          secondDriverId: '',
          thirdDriverId: '',
          fastestLapDriverId: '',
          fastestPitTeamId: '',
          firstDnfDriverId: '',
          noDnf: false,
          safetyCar: false,
          winningMargin: '',
          wildcardResult: false
        });
        fetchData();
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to submit results' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Network error' });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-white">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 p-6">
      <div className="max-w-4xl mx-auto">
        <div className="bg-gray-800 rounded-xl p-6 border-2 border-red-500 mb-6">
          <h1 className="text-3xl font-bold text-white mb-2 flex items-center gap-3">
            <Trophy className="w-8 h-8 text-red-500" />
            GridGuessr Admin Panel
          </h1>
          <p className="text-gray-400">Manage races and enter results</p>
        </div>

        <div className="bg-gray-800 rounded-xl p-6 border border-gray-700 mb-6">
          <h2 className="text-xl font-bold text-white mb-2">Admin Access</h2>
          <p className="text-sm text-gray-400 mb-4">
            Set the admin code that matches the value configured on the server. It stays in this browser only.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              type="text"
              value={adminFid}
              onChange={(e) => setAdminFid(e.target.value)}
              placeholder="Enter admin code"
              className="flex-1 rounded-lg border border-gray-600 bg-gray-700 p-3 text-white focus:border-red-500 focus:outline-none"
            />
            <button
              onClick={handleSaveAdminCode}
              className="rounded-lg bg-red-600 px-4 py-3 text-sm font-semibold text-white transition-all hover:bg-red-700"
            >
              Save Code
            </button>
          </div>
          <p className="mt-2 text-xs text-gray-500">
            Tip: clear the field and save to remove the stored code from this device.
          </p>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setActiveTab('races')}
            className={`flex-1 py-3 rounded-lg font-semibold transition-all ${
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
            className={`flex-1 py-3 rounded-lg font-semibold transition-all ${
              activeTab === 'results'
                ? 'bg-red-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
          >
            <Trophy className="w-5 h-5 inline mr-2" />
            Enter Results
          </button>
        </div>

        {message && (
          <div className={`mb-6 p-4 rounded-xl border-2 ${
            message.type === 'success' 
              ? 'bg-green-900 border-green-500 text-green-100' 
              : 'bg-red-900 border-red-500 text-red-100'
          }`}>
            <div className="flex items-center gap-2">
              {message.type === 'success' ? (
                <CheckCircle className="w-5 h-5" />
              ) : (
                <AlertCircle className="w-5 h-5" />
              )}
              <span>{message.text}</span>
            </div>
          </div>
        )}

        {/* Races Tab */}
        {activeTab === 'races' && (
          <div className="space-y-6">
            {/* Create New Race Form */}
            <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
              <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                <Plus className="w-6 h-6" />
                {editingRaceId ? 'Update Race' : 'Create New Race'}
              </h2>
              <form onSubmit={handleCreateOrUpdateRace} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-white mb-2">Race Name *</label>
                    <input
                      type="text"
                      value={newRace.name}
                      onChange={(e) => setNewRace({...newRace, name: e.target.value})}
                      placeholder="Abu Dhabi Grand Prix"
                      className="w-full bg-gray-700 text-white rounded-lg p-3 border border-gray-600"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-white mb-2">Circuit *</label>
                    <input
                      type="text"
                      value={newRace.circuit}
                      onChange={(e) => setNewRace({...newRace, circuit: e.target.value})}
                      placeholder="Yas Marina Circuit"
                      className="w-full bg-gray-700 text-white rounded-lg p-3 border border-gray-600"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-white mb-2">Country</label>
                    <input
                      type="text"
                      value={newRace.country}
                      onChange={(e) => setNewRace({...newRace, country: e.target.value})}
                      placeholder="UAE"
                      className="w-full bg-gray-700 text-white rounded-lg p-3 border border-gray-600"
                    />
                  </div>
                  <div>
                    <label className="block text-white mb-2">Season *</label>
                    <input
                      type="number"
                      value={newRace.season}
                      onChange={(e) => setNewRace({...newRace, season: e.target.value})}
                      className="w-full bg-gray-700 text-white rounded-lg p-3 border border-gray-600"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-white mb-2">Round *</label>
                    <input
                      type="number"
                      value={newRace.round}
                      onChange={(e) => setNewRace({...newRace, round: e.target.value})}
                      placeholder="1"
                      className="w-full bg-gray-700 text-white rounded-lg p-3 border border-gray-600"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-white mb-2">Race Date & Time *</label>
                    <input
                      type="datetime-local"
                      value={newRace.raceDate}
                      onChange={(e) => setNewRace({...newRace, raceDate: e.target.value})}
                      className="w-full bg-gray-700 text-white rounded-lg p-3 border border-gray-600"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-white mb-2">Lock Time *</label>
                    <input
                      type="datetime-local"
                      value={newRace.lockTime}
                      onChange={(e) => setNewRace({...newRace, lockTime: e.target.value})}
                      className="w-full bg-gray-700 text-white rounded-lg p-3 border border-gray-600"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-white mb-2">Wildcard Question (Optional)</label>
                  <input
                    type="text"
                    value={newRace.wildcardQuestion}
                    onChange={(e) => setNewRace({...newRace, wildcardQuestion: e.target.value})}
                    placeholder="Will there be more than 5 overtakes in the first lap?"
                    className="w-full bg-gray-700 text-white rounded-lg p-3 border border-gray-600"
                  />
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full bg-red-600 hover:bg-red-700 disabled:bg-gray-700 text-white font-bold py-3 rounded-xl transition-all"
                >
                  {submitting
                    ? (editingRaceId ? 'Updating...' : 'Creating...')
                    : editingRaceId ? 'Update Race' : 'Create Race'}
                </button>
                {editingRaceId && (
                  <button
                    type="button"
                    onClick={resetRaceForm}
                    className="w-full border border-gray-600 text-gray-300 hover:bg-gray-700 py-2 rounded-xl transition-all"
                  >
                    Cancel Edit
                  </button>
                )}
              </form>
            </div>

            {/* Races List */}
            <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
              <h2 className="text-xl font-bold text-white mb-4">All Races</h2>
              <div className="space-y-3">
                {races.map(race => (
                  <div key={race.id} className="bg-gray-700 rounded-lg p-4 flex items-center justify-between gap-4">
                    <div>
                      <h3 className="text-white font-bold">{race.name}</h3>
                      <p className="text-gray-400 text-sm">{race.circuit}</p>
                      <p className="text-gray-500 text-xs mt-1">
                        {new Date(race.race_date).toLocaleString()} • Round {race.round} • {race.status}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          setEditingRaceId(race.id);
                          setActiveTab('races');
                          setNewRace({
                            name: race.name,
                            circuit: race.circuit,
                            country: race.country || '',
                            raceDate: formatDateTimeForInput(race.race_date),
                            lockTime: formatDateTimeForInput(race.lock_time),
                            season: String(race.season ?? new Date().getFullYear()),
                            round: String(race.round ?? ''),
                            wildcardQuestion: race.wildcard_question || ''
                          });
                          window.scrollTo({ top: 0, behavior: 'smooth' });
                        }}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-lg text-sm font-semibold"
                      >
                        Modify
                      </button>
                      <button
                        onClick={() => handleDeleteRace(race.id)}
                        className="bg-red-600 hover:bg-red-700 text-white px-3 py-2 rounded-lg text-sm font-semibold"
                        title="Delete race"
                      >
                        <Trash2 className="w-4 h-4 inline mr-1" />
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
                {races.length === 0 && (
                  <p className="text-gray-400 text-center py-8">No races yet. Create one above!</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Results Tab */}
        {activeTab === 'results' && (
          <form onSubmit={handleSubmitResults} className="space-y-6">
            <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
              <label className="block text-white font-bold mb-3">Select Race</label>
              <select
                value={selectedRace}
                onChange={(e) => setSelectedRace(e.target.value)}
                className="w-full bg-gray-700 text-white rounded-lg p-3 border border-gray-600"
                required
              >
                <option value="">Select a race...</option>
                {races.filter(r => r.status !== 'completed').map(race => (
                  <option key={race.id} value={race.id}>
                    {race.name} - {new Date(race.race_date).toLocaleDateString()}
                  </option>
                ))}
              </select>
            </div>

            <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
              <h2 className="text-xl font-bold text-white mb-4">Race Results</h2>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-white mb-2">Pole Position</label>
                  <select
                    value={results.poleDriverId}
                    onChange={(e) => setResults({...results, poleDriverId: e.target.value})}
                    className="w-full bg-gray-700 text-white rounded-lg p-3 border border-gray-600"
                    required
                  >
                    <option value="">Select driver...</option>
                    {drivers.map(d => (
                      <option key={d.id} value={d.id}>#{d.number} {d.name} - {d.team}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-white mb-2">Winner (1st)</label>
                  <select
                    value={results.winnerDriverId}
                    onChange={(e) => setResults({...results, winnerDriverId: e.target.value})}
                    className="w-full bg-gray-700 text-white rounded-lg p-3 border border-gray-600"
                    required
                  >
                    <option value="">Select driver...</option>
                    {drivers.map(d => (
                      <option key={d.id} value={d.id}>#{d.number} {d.name} - {d.team}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-white mb-2">2nd Place</label>
                  <select
                    value={results.secondDriverId}
                    onChange={(e) => setResults({...results, secondDriverId: e.target.value})}
                    className="w-full bg-gray-700 text-white rounded-lg p-3 border border-gray-600"
                    required
                  >
                    <option value="">Select driver...</option>
                    {drivers.map(d => (
                      <option key={d.id} value={d.id}>#{d.number} {d.name} - {d.team}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-white mb-2">3rd Place</label>
                  <select
                    value={results.thirdDriverId}
                    onChange={(e) => setResults({...results, thirdDriverId: e.target.value})}
                    className="w-full bg-gray-700 text-white rounded-lg p-3 border border-gray-600"
                    required
                  >
                    <option value="">Select driver...</option>
                    {drivers.map(d => (
                      <option key={d.id} value={d.id}>#{d.number} {d.name} - {d.team}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-white mb-2">Fastest Lap</label>
                  <select
                    value={results.fastestLapDriverId}
                    onChange={(e) => setResults({...results, fastestLapDriverId: e.target.value})}
                    className="w-full bg-gray-700 text-white rounded-lg p-3 border border-gray-600"
                    required
                  >
                    <option value="">Select driver...</option>
                    {drivers.map(d => (
                      <option key={d.id} value={d.id}>#{d.number} {d.name} - {d.team}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-white mb-2">Fastest Pit Stop Team</label>
                  <select
                    value={results.fastestPitTeamId}
                    onChange={(e) => setResults({...results, fastestPitTeamId: e.target.value})}
                    className="w-full bg-gray-700 text-white rounded-lg p-3 border border-gray-600"
                    required
                  >
                    <option value="">Select team...</option>
                    {teams.map(t => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-white mb-2">First DNF</label>
                  <div className="flex items-center gap-3 mb-2">
                    <input
                      type="checkbox"
                      checked={results.noDnf}
                      onChange={(e) => setResults({...results, noDnf: e.target.checked, firstDnfDriverId: ''})}
                      className="w-5 h-5"
                    />
                    <span className="text-white">No DNF</span>
                  </div>
                  {!results.noDnf && (
                    <select
                      value={results.firstDnfDriverId}
                      onChange={(e) => setResults({...results, firstDnfDriverId: e.target.value})}
                      className="w-full bg-gray-700 text-white rounded-lg p-3 border border-gray-600"
                      required={!results.noDnf}
                    >
                      <option value="">Select driver...</option>
                      {drivers.map(d => (
                        <option key={d.id} value={d.id}>#{d.number} {d.name} - {d.team}</option>
                      ))}
                    </select>
                  )}
                </div>

                <div>
                  <label className="block text-white mb-2">Safety Car</label>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => setResults({...results, safetyCar: true})}
                      className={`flex-1 py-2 rounded-lg ${results.safetyCar ? 'bg-green-600 text-white' : 'bg-gray-700 text-gray-400'}`}
                    >
                      Yes
                    </button>
                    <button
                      type="button"
                      onClick={() => setResults({...results, safetyCar: false})}
                      className={`flex-1 py-2 rounded-lg ${!results.safetyCar ? 'bg-red-600 text-white' : 'bg-gray-700 text-gray-400'}`}
                    >
                      No
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-white mb-2">Winning Margin</label>
                  <select
                    value={results.winningMargin}
                    onChange={(e) => setResults({...results, winningMargin: e.target.value})}
                    className="w-full bg-gray-700 text-white rounded-lg p-3 border border-gray-600"
                    required
                  >
                    <option value="">Select margin...</option>
                    {marginBuckets.map(bucket => (
                      <option key={bucket} value={bucket}>{bucket}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-white mb-2">Wildcard Result</label>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => setResults({...results, wildcardResult: true})}
                      className={`flex-1 py-2 rounded-lg ${results.wildcardResult ? 'bg-green-600 text-white' : 'bg-gray-700 text-gray-400'}`}
                    >
                      Yes / Over
                    </button>
                    <button
                      type="button"
                      onClick={() => setResults({...results, wildcardResult: false})}
                      className={`flex-1 py-2 rounded-lg ${!results.wildcardResult ? 'bg-red-600 text-white' : 'bg-gray-700 text-gray-400'}`}
                    >
                      No / Under
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting || !selectedRace}
              className="w-full bg-red-600 hover:bg-red-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-bold py-4 rounded-xl transition-all"
            >
              {submitting ? 'Submitting...' : 'Submit Results & Score Predictions'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

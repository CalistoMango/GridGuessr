'use client';

import React, { useMemo, useState } from 'react';

import type { AdminMessage, Driver, Race, Team } from '../types';
import { formatLocalDate } from '../utils';

type AdminResultsSectionProps = {
  races: Race[];
  drivers: Driver[];
  teams: Team[];
  getAuthPayload: () => Record<string, unknown> | null;
  setMessage: (message: AdminMessage | null) => void;
  refreshData: (options?: { quiet?: boolean }) => Promise<void>;
};

type ResultsFormState = {
  poleDriverId: string;
  winnerDriverId: string;
  secondDriverId: string;
  thirdDriverId: string;
  fastestLapDriverId: string;
  fastestPitTeamId: string;
  firstDnfDriverId: string;
  noDnf: boolean;
  safetyCar: boolean;
  winningMargin: string;
  wildcardResult: boolean;
};

// Default values for the scoring form so we can easily reset state.
const createInitialResultsForm = (): ResultsFormState => ({
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

/**
 * Race results scoring surface. Admins can lock in podiums, fastest laps, and
 * other stats which triggers prediction scoring on the backend.
 */
export function AdminResultsSection({
  races,
  drivers,
  teams,
  getAuthPayload,
  setMessage,
  refreshData
}: AdminResultsSectionProps) {
  const [selectedRace, setSelectedRace] = useState<string>('');
  const [formState, setFormState] = useState<ResultsFormState>(createInitialResultsForm());
  const [submitting, setSubmitting] = useState(false);

  const marginBuckets = useMemo(
    () => ['0-2s', '2-4s', '4-7s', '7-12s', '12-20s', '20s+'],
    []
  );

  const handleChange = <Field extends keyof ResultsFormState>(field: Field, value: ResultsFormState[Field]) => {
    setFormState((previous) => ({
      ...previous,
      [field]: value
    }));
  };

  /**
   * Submit race results to the backend; scoring and badge awarding happen there.
   */
  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedRace) {
      setMessage({ type: 'error', text: 'Please select a race.' });
      return;
    }

    const authPayload = getAuthPayload();
    if (!authPayload) return;

    setSubmitting(true);
    setMessage(null);

    try {
      const response = await fetch('/api/admin/results', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          raceId: selectedRace,
          ...formState,
          ...authPayload
        })
      });

      const data = await response.json();

      if (!response.ok) {
        setMessage({ type: 'error', text: data?.error || 'Failed to submit race results.' });
        return;
      }

      setMessage({ type: 'success', text: data?.message || 'Race results submitted successfully!' });
      setFormState(createInitialResultsForm());
      setSelectedRace('');
      await refreshData({ quiet: true });
    } catch (error) {
      setMessage({ type: 'error', text: 'Network error while submitting race results.' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
        <label className="block text-white font-bold mb-3">Select Race</label>
        <select
          value={selectedRace}
          onChange={(event) => setSelectedRace(event.target.value)}
          className="w-full bg-gray-700 text-white rounded-lg p-3 border border-gray-600"
          required
        >
          <option value="">Select a race...</option>
          {races
            .filter((race) => race.status !== 'completed')
            .map((race) => (
              <option key={race.id} value={race.id}>
                {race.name} - {formatLocalDate(race.race_date)}
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
              value={formState.poleDriverId}
              onChange={(event) => handleChange('poleDriverId', event.target.value)}
              className="w-full bg-gray-700 text-white rounded-lg p-3 border border-gray-600"
              required
            >
              <option value="">Select driver...</option>
              {drivers.map((driver) => (
                <option key={driver.id} value={driver.id}>
                  #{driver.number} {driver.name} - {driver.team}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-white mb-2">Winner (1st)</label>
            <select
              value={formState.winnerDriverId}
              onChange={(event) => handleChange('winnerDriverId', event.target.value)}
              className="w-full bg-gray-700 text-white rounded-lg p-3 border border-gray-600"
              required
            >
              <option value="">Select driver...</option>
              {drivers.map((driver) => (
                <option key={driver.id} value={driver.id}>
                  #{driver.number} {driver.name} - {driver.team}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-white mb-2">2nd Place</label>
            <select
              value={formState.secondDriverId}
              onChange={(event) => handleChange('secondDriverId', event.target.value)}
              className="w-full bg-gray-700 text-white rounded-lg p-3 border border-gray-600"
              required
            >
              <option value="">Select driver...</option>
              {drivers.map((driver) => (
                <option key={driver.id} value={driver.id}>
                  #{driver.number} {driver.name} - {driver.team}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-white mb-2">3rd Place</label>
            <select
              value={formState.thirdDriverId}
              onChange={(event) => handleChange('thirdDriverId', event.target.value)}
              className="w-full bg-gray-700 text-white rounded-lg p-3 border border-gray-600"
              required
            >
              <option value="">Select driver...</option>
              {drivers.map((driver) => (
                <option key={driver.id} value={driver.id}>
                  #{driver.number} {driver.name} - {driver.team}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-white mb-2">Fastest Lap</label>
            <select
              value={formState.fastestLapDriverId}
              onChange={(event) => handleChange('fastestLapDriverId', event.target.value)}
              className="w-full bg-gray-700 text-white rounded-lg p-3 border border-gray-600"
              required
            >
              <option value="">Select driver...</option>
              {drivers.map((driver) => (
                <option key={driver.id} value={driver.id}>
                  #{driver.number} {driver.name} - {driver.team}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-white mb-2">Fastest Pit Stop Team</label>
            <select
              value={formState.fastestPitTeamId}
              onChange={(event) => handleChange('fastestPitTeamId', event.target.value)}
              className="w-full bg-gray-700 text-white rounded-lg p-3 border border-gray-600"
              required
            >
              <option value="">Select team...</option>
              {teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-white mb-2">First DNF</label>
            <div className="flex items-center gap-3 mb-2">
              <input
                type="checkbox"
                checked={formState.noDnf}
                onChange={(event) =>
                  setFormState((previous) => ({
                    ...previous,
                    noDnf: event.target.checked,
                    firstDnfDriverId: ''
                  }))
                }
                className="w-5 h-5"
              />
              <span className="text-white">No DNF</span>
            </div>
            {!formState.noDnf && (
              <select
                value={formState.firstDnfDriverId}
                onChange={(event) => handleChange('firstDnfDriverId', event.target.value)}
                className="w-full bg-gray-700 text-white rounded-lg p-3 border border-gray-600"
                required={!formState.noDnf}
              >
                <option value="">Select driver...</option>
                {drivers.map((driver) => (
                  <option key={driver.id} value={driver.id}>
                    #{driver.number} {driver.name} - {driver.team}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div>
            <label className="block text-white mb-2">Safety Car</label>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => handleChange('safetyCar', true)}
                className={`flex-1 py-2 rounded-lg ${formState.safetyCar ? 'bg-green-600 text-white' : 'bg-gray-700 text-gray-400'}`}
              >
                Yes
              </button>
              <button
                type="button"
                onClick={() => handleChange('safetyCar', false)}
                className={`flex-1 py-2 rounded-lg ${!formState.safetyCar ? 'bg-red-600 text-white' : 'bg-gray-700 text-gray-400'}`}
              >
                No
              </button>
            </div>
          </div>

          <div>
            <label className="block text-white mb-2">Winning Margin</label>
            <select
              value={formState.winningMargin}
              onChange={(event) => handleChange('winningMargin', event.target.value)}
              className="w-full bg-gray-700 text-white rounded-lg p-3 border border-gray-600"
              required
            >
              <option value="">Select margin...</option>
              {marginBuckets.map((bucket) => (
                <option key={bucket} value={bucket}>
                  {bucket}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-white mb-2">Wildcard Result</label>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => handleChange('wildcardResult', true)}
                className={`flex-1 py-2 rounded-lg ${formState.wildcardResult ? 'bg-green-600 text-white' : 'bg-gray-700 text-gray-400'}`}
              >
                Yes / Over
              </button>
              <button
                type="button"
                onClick={() => handleChange('wildcardResult', false)}
                className={`flex-1 py-2 rounded-lg ${!formState.wildcardResult ? 'bg-red-600 text-white' : 'bg-gray-700 text-gray-400'}`}
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
  );
}

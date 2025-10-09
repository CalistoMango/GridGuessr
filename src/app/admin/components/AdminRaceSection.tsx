'use client';

import React, { useMemo, useState } from 'react';
import { Loader2, Plus, Trash2 } from 'lucide-react';

import type { AdminMessage, Race } from '../types';
import { formatDateTimeForInput, formatLocalDateTime } from '../utils';

type AdminRaceSectionProps = {
  races: Race[];
  getAuthPayload: () => Record<string, unknown> | null;
  setMessage: (message: AdminMessage | null) => void;
  refreshData: (options?: { quiet?: boolean }) => Promise<void>;
};

type RaceFormState = {
  name: string;
  circuit: string;
  country: string;
  raceDate: string;
  lockTime: string;
  season: string;
  round: string;
  wildcardQuestion: string;
};

// Provide predictable defaults for the race form when creating or clearing edits.
const createInitialRaceForm = (): RaceFormState => ({
  name: '',
  circuit: '',
  country: '',
  raceDate: '',
  lockTime: '',
  season: new Date().getFullYear().toString(),
  round: '',
  wildcardQuestion: ''
});

/**
 * Race management surface: lets admins create, update, and delete race rows.
 * Mutations immediately re-sync the shared race list passed down from the parent.
 */
export function AdminRaceSection({
  races,
  getAuthPayload,
  setMessage,
  refreshData
}: AdminRaceSectionProps) {
  const [formState, setFormState] = useState<RaceFormState>(createInitialRaceForm);
  const [editingRaceId, setEditingRaceId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const formTitle = useMemo(
    () => (editingRaceId ? 'Update Race' : 'Create New Race'),
    [editingRaceId]
  );

  const handleChange = <Field extends keyof RaceFormState>(field: Field, value: RaceFormState[Field]) => {
    setFormState((previous) => ({
      ...previous,
      [field]: value
    }));
  };

  const resetForm = () => {
    setFormState(createInitialRaceForm());
    setEditingRaceId(null);
  };

  /**
   * Create or update a race depending on whether we're editing an existing record.
   */
  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const authPayload = getAuthPayload();
    if (!authPayload) return;

    setSubmitting(true);
    setMessage(null);

    try {
      const response = await fetch('/api/admin/races', {
        method: editingRaceId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(editingRaceId ? { raceId: editingRaceId } : {}),
          ...formState,
          ...authPayload
        })
      });

      const data = await response.json();

      if (!response.ok) {
        setMessage({ type: 'error', text: data?.error || 'Failed to save race.' });
        return;
      }

      setMessage({ type: 'success', text: editingRaceId ? 'Race updated successfully!' : 'Race created successfully!' });
      resetForm();
      await refreshData({ quiet: true });
    } catch (error) {
      setMessage({ type: 'error', text: 'Network error while saving race.' });
    } finally {
      setSubmitting(false);
    }
  };

  /**
   * Prefill the form with the selected race and swap the action to "update".
   */
  const handleEdit = (race: Race) => {
    setEditingRaceId(race.id);
    setFormState({
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
  };

  /**
   * Remove the selected race after a quick confirmation (also wipes predictions).
   */
  const handleDelete = async (raceId: string) => {
    if (!window.confirm('Are you sure you want to delete this race? This will also delete all predictions!')) {
      return;
    }

    const authPayload = getAuthPayload();
    if (!authPayload) return;

    setMessage(null);

    try {
      const response = await fetch('/api/admin/races', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ raceId, ...authPayload })
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        setMessage({ type: 'error', text: data?.error || 'Failed to delete race.' });
        return;
      }

      setMessage({ type: 'success', text: 'Race deleted successfully!' });
      await refreshData({ quiet: true });
    } catch (error) {
      setMessage({ type: 'error', text: 'Network error while deleting race.' });
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-white">{formTitle}</h2>
          <Plus className="w-6 h-6 text-red-400" />
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-white mb-2">Race Name *</label>
              <input
                type="text"
                value={formState.name}
                onChange={(event) => handleChange('name', event.target.value)}
                placeholder="Abu Dhabi Grand Prix"
                className="w-full bg-gray-700 text-white rounded-lg p-3 border border-gray-600"
                required
              />
            </div>
            <div>
              <label className="block text-white mb-2">Circuit *</label>
              <input
                type="text"
                value={formState.circuit}
                onChange={(event) => handleChange('circuit', event.target.value)}
                placeholder="Yas Marina Circuit"
                className="w-full bg-gray-700 text-white rounded-lg p-3 border border-gray-600"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="block text-white mb-2">Country</label>
              <input
                type="text"
                value={formState.country}
                onChange={(event) => handleChange('country', event.target.value)}
                placeholder="UAE"
                className="w-full bg-gray-700 text-white rounded-lg p-3 border border-gray-600"
              />
            </div>
            <div>
              <label className="block text-white mb-2">Season *</label>
              <input
                type="number"
                value={formState.season}
                onChange={(event) => handleChange('season', event.target.value)}
                className="w-full bg-gray-700 text-white rounded-lg p-3 border border-gray-600"
                required
              />
            </div>
            <div>
              <label className="block text-white mb-2">Round *</label>
              <input
                type="number"
                value={formState.round}
                onChange={(event) => handleChange('round', event.target.value)}
                placeholder="1"
                className="w-full bg-gray-700 text-white rounded-lg p-3 border border-gray-600"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-white mb-2">Race Date & Time *</label>
              <input
                type="datetime-local"
                value={formState.raceDate}
                onChange={(event) => handleChange('raceDate', event.target.value)}
                className="w-full bg-gray-700 text-white rounded-lg p-3 border border-gray-600"
                required
              />
            </div>
            <div>
              <label className="block text-white mb-2">Lock Time *</label>
              <input
                type="datetime-local"
                value={formState.lockTime}
                onChange={(event) => handleChange('lockTime', event.target.value)}
                className="w-full bg-gray-700 text-white rounded-lg p-3 border border-gray-600"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-white mb-2">Wildcard Question (Optional)</label>
            <input
              type="text"
              value={formState.wildcardQuestion}
              onChange={(event) => handleChange('wildcardQuestion', event.target.value)}
              placeholder="Will there be more than 5 overtakes in the first lap?"
              className="w-full bg-gray-700 text-white rounded-lg p-3 border border-gray-600"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-red-600 hover:bg-red-700 disabled:bg-gray-700 text-white font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-2"
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            {editingRaceId ? 'Update Race' : 'Create Race'}
          </button>

          {editingRaceId && (
            <button
              type="button"
              onClick={resetForm}
              className="w-full border border-gray-600 text-gray-300 hover:bg-gray-700 py-2 rounded-xl transition-all"
            >
              Cancel Edit
            </button>
          )}
        </form>
      </div>

      <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
        <h2 className="text-xl font-bold text-white mb-4">All Races</h2>
        <div className="space-y-3">
          {races.map((race) => (
            <div
              key={race.id}
              className="bg-gray-700 rounded-lg p-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="sm:flex-1">
                <h3 className="text-white font-bold">{race.name}</h3>
                <p className="text-gray-400 text-sm">{race.circuit}</p>
                <p className="text-gray-500 text-xs mt-1">
                  {formatLocalDateTime(race.race_date)} • Round {race.round} • {race.status}
                </p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end w-full sm:w-auto">
                <button
                  onClick={() => handleEdit(race)}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-lg text-sm font-semibold w-full sm:w-auto"
                >
                  Modify
                </button>
                <button
                  onClick={() => handleDelete(race.id)}
                  className="bg-red-600 hover:bg-red-700 text-white px-3 py-2 rounded-lg text-sm font-semibold w-full sm:w-auto"
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
  );
}

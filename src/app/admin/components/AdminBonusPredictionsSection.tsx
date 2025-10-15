'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarClock, Edit3, Flame, ListPlus, Plus, Sparkles, Trash2, UploadCloud, X } from 'lucide-react';

import { formatDateTimeForInput, formatLocalDateTime } from '~/app/admin/utils';
import type {
  AdminBonusEvent,
  AdminBonusQuestion,
  AdminMessage,
  BonusEventStatus,
  BonusEventType,
  BonusResponseType,
  Driver,
  Race,
  Team
} from '../types';

type AdminBonusPredictionsSectionProps = {
  races: Race[];
  drivers: Driver[];
  teams: Team[];
  getAuthPayload: () => Record<string, unknown> | null;
  setMessage: (message: AdminMessage | null) => void;
};

type QuestionDraft = {
  id?: string;
  prompt: string;
  responseType: BonusResponseType;
  maxSelections: number;
  points: number;
  driverOptionIds: string[];
  teamOptionIds: string[];
  customOptions: Array<{ id: string; label: string }>;
};

type AnswerDraft = {
  optionIds: string[];
};

type BonusEventForm = {
  type: BonusEventType;
  title: string;
  description: string;
  raceId: string;
  opensAt: string;
  locksAt: string;
  status: BonusEventStatus;
  pointsMultiplier: string;
  questions: QuestionDraft[];
};

const BONUS_STATUS_LABELS: Record<BonusEventStatus, string> = {
  draft: 'Draft',
  scheduled: 'Scheduled',
  open: 'Open',
  locked: 'Locked',
  scored: 'Scored',
  archived: 'Archived'
};

const BONUS_STATUS_OPTIONS: BonusEventStatus[] = ['draft', 'scheduled', 'open'];

const RESPONSE_TYPE_LABELS: Record<BonusResponseType, string> = {
  choice_driver: 'Drivers (select specific drivers)',
  choice_team: 'Teams (select specific teams)',
  choice_custom: 'Custom options'
};

const defaultQuestion = (order: number): QuestionDraft => ({
  prompt: '',
  responseType: 'choice_custom',
  maxSelections: 1,
  points: 5,
  driverOptionIds: [],
  teamOptionIds: [],
  customOptions: [
    { id: cryptoId(), label: '' },
    { id: cryptoId(), label: '' }
  ]
});

const createInitialForm = (): BonusEventForm => {
  const now = new Date();
  const inTwoHours = new Date(now.getTime() + 2 * 60 * 60 * 1000);
  return {
    type: 'open',
    title: '',
    description: '',
    raceId: '',
    opensAt: formatDateTimeForInput(now.toISOString()),
    locksAt: formatDateTimeForInput(inTwoHours.toISOString()),
    status: 'draft',
    pointsMultiplier: '1',
    questions: [defaultQuestion(0)]
  };
};

function cryptoId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `opt_${Math.random().toString(36).slice(2, 10)}`;
}

function convertEventToForm(event: AdminBonusEvent): BonusEventForm {
  return {
    type: event.type,
    title: event.title,
    description: event.description ?? '',
    raceId: event.raceId ?? '',
    opensAt: formatDateTimeForInput(event.opensAt),
    locksAt: formatDateTimeForInput(event.locksAt),
    status: event.status,
    pointsMultiplier: String(event.pointsMultiplier ?? 1),
    questions: event.questions
      .slice()
      .sort((a, b) => a.order - b.order)
      .map<QuestionDraft>((question) => {
        if (question.responseType === 'choice_driver') {
          return {
            id: question.id,
            prompt: question.prompt,
            responseType: question.responseType,
            maxSelections: question.maxSelections,
            points: question.points,
            driverOptionIds: question.options
              .map((option) => option.driverId)
              .filter((id): id is string => typeof id === 'string' && id.length > 0),
            teamOptionIds: [],
            customOptions: []
          };
        }

        if (question.responseType === 'choice_team') {
          return {
            id: question.id,
            prompt: question.prompt,
            responseType: question.responseType,
            maxSelections: question.maxSelections,
            points: question.points,
            driverOptionIds: [],
            teamOptionIds: question.options
              .map((option) => option.teamId)
              .filter((id): id is string => typeof id === 'string' && id.length > 0),
            customOptions: []
          };
        }

        if (question.responseType === 'choice_custom') {
          return {
            id: question.id,
            prompt: question.prompt,
            responseType: question.responseType,
            maxSelections: question.maxSelections,
            points: question.points,
            driverOptionIds: [],
            teamOptionIds: [],
            customOptions: question.options.length
              ? question.options.map((option) => ({
                  id: option.id ?? cryptoId(),
                  label: option.label
                }))
              : [
                  { id: cryptoId(), label: '' },
                  { id: cryptoId(), label: '' }
                ]
          };
        }

        return {
          id: question.id,
          prompt: question.prompt,
          responseType: question.responseType,
          maxSelections: 1,
          points: question.points,
          driverOptionIds: [],
          teamOptionIds: [],
          customOptions: []
        };
      })
  };
}

function mapQuestionDraftToPayload(
  draft: QuestionDraft,
  index: number,
  drivers: Driver[],
  teams: Team[]
) {
  const base = {
    prompt: draft.prompt,
    responseType: draft.responseType,
    maxSelections: Math.max(1, draft.maxSelections),
    points: draft.points,
    order: index
  };

  if (draft.responseType === 'choice_driver') {
    const driverLookup = new Map(drivers.map((driver) => [driver.id, driver]));
    const options = draft.driverOptionIds
      .map((id) => driverLookup.get(id))
      .filter((driver): driver is Driver => Boolean(driver))
      .map((driver, order) => ({
        label: `${driver.name}`,
        driverId: driver.id,
        teamId: null,
        order
      }));
    return { ...base, options };
  }

  if (draft.responseType === 'choice_team') {
    const teamLookup = new Map(teams.map((team) => [team.id, team]));
    const options = draft.teamOptionIds
      .map((id) => teamLookup.get(id))
      .filter((team): team is Team => Boolean(team))
      .map((team, order) => ({
        label: team.name,
        driverId: null,
        teamId: team.id,
        order
      }));
    return { ...base, options };
  }

  if (draft.responseType === 'choice_custom') {
    const options = draft.customOptions
      .map((option, order) => ({
        label: option.label,
        driverId: null,
        teamId: null,
        order
      }))
      .filter((option) => option.label.trim().length > 0);
    return { ...base, options };
  }

  return { ...base, options: [] };
}

function toIsoString(localValue: string): string | null {
  if (!localValue) return null;
  const date = new Date(localValue);
  if (Number.isNaN(date.getTime())) return null;
  return new Date(date.getTime()).toISOString();
}

function deriveDefaultTitle(type: BonusEventType, raceName: string): string {
  if (!raceName) return '';
  if (type === 'sprint') {
    return `${raceName} Sprint`;
  }
  if (type === 'winter') {
    return `${raceName} Winter Test`;
  }
  return `${raceName} Bonus`;
}

function sortEvents(events: AdminBonusEvent[]): AdminBonusEvent[] {
  return events.slice().sort((a, b) => {
    const aTime = new Date(a.opensAt).getTime();
    const bTime = new Date(b.opensAt).getTime();
    return aTime - bTime;
  });
}

export function AdminBonusPredictionsSection({
  races,
  drivers,
  teams,
  getAuthPayload,
  setMessage
}: AdminBonusPredictionsSectionProps) {
  const [events, setEvents] = useState<AdminBonusEvent[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [formState, setFormState] = useState<BonusEventForm>(createInitialForm);
  const [answerEditor, setAnswerEditor] = useState<{ event: AdminBonusEvent; answers: Record<string, AnswerDraft> } | null>(null);
  const [savingAnswers, setSavingAnswers] = useState(false);
  const [scoringEventId, setScoringEventId] = useState<string | null>(null);

  const sortedEvents = useMemo(() => sortEvents(events), [events]);
  const driverLookup = useMemo(() => new Map(drivers.map((driver) => [driver.id, driver])), [drivers]);
  const teamLookup = useMemo(() => new Map(teams.map((team) => [team.id, team])), [teams]);

  const resolveAdminOptionLabel = useCallback(
    (option: AdminBonusQuestion["options"][number]) => {
      if (option.label?.trim()) return option.label.trim();
      if (option.driverId) {
        const driver = driverLookup.get(option.driverId);
        if (driver) {
          return `#${driver.number} ${driver.name}`;
        }
      }
      if (option.teamId) {
        const team = teamLookup.get(option.teamId);
        if (team) {
          return team.name;
        }
      }
      return option.id;
    },
    [driverLookup, teamLookup]
  );

  const fetchEvents = useCallback(async () => {
    setLoadingEvents(true);
    try {
      const response = await fetch('/api/admin/bonus/events');
      if (!response.ok) {
        throw new Error('Failed to load bonus events');
      }
      const data = await response.json();
      setEvents(Array.isArray(data?.events) ? data.events : []);
    } catch (error) {
      console.error('Failed to load bonus events:', error);
      setMessage({ type: 'error', text: 'Unable to load bonus events.' });
    } finally {
      setLoadingEvents(false);
    }
  }, [setMessage]);

  useEffect(() => {
    fetchEvents().catch((error) => console.error(error));
  }, [fetchEvents]);

  const resetForm = useCallback(() => {
    setFormState(createInitialForm());
    setEditingEventId(null);
  }, []);

  const handleTypeChange = (type: BonusEventType) => {
    setFormState((previous) => {
      const selectedRace = races.find((race) => race.id === previous.raceId);
      const defaultTitle = selectedRace ? deriveDefaultTitle(type, selectedRace.name) : previous.title;
      const nextState: BonusEventForm = {
        ...previous,
        type,
        title: defaultTitle,
        questions: previous.questions.length ? previous.questions : [defaultQuestion(0)]
      };

      if (type === 'sprint') {
        return seedSprintTemplate(nextState, drivers);
      }

      return nextState;
    });
  };

  const seedSprintTemplate = (baseState: BonusEventForm, driverList: Driver[]): BonusEventForm => {
    const driverIds = driverList.map((driver) => driver.id);
    return {
      ...baseState,
      questions: [
        {
          prompt: 'Sprint Pole',
          responseType: 'choice_driver',
          maxSelections: 1,
          points: 10,
          driverOptionIds: driverIds,
          teamOptionIds: [],
          customOptions: []
        },
        {
          prompt: 'Sprint Winner',
          responseType: 'choice_driver',
          maxSelections: 1,
          points: 10,
          driverOptionIds: driverIds,
          teamOptionIds: [],
          customOptions: []
        },
        {
          prompt: 'Sprint P2',
          responseType: 'choice_driver',
          maxSelections: 1,
          points: 7,
          driverOptionIds: driverIds,
          teamOptionIds: [],
          customOptions: []
        },
        {
          prompt: 'Sprint P3',
          responseType: 'choice_driver',
          maxSelections: 1,
          points: 3,
          driverOptionIds: driverIds,
          teamOptionIds: [],
          customOptions: []
        }
      ]
    };
  };

  const handleRaceChange = (raceId: string) => {
    setFormState((previous) => {
      const race = races.find((item) => item.id === raceId);
      const updatedTitle = previous.title.trim().length
        ? previous.title
        : race
        ? deriveDefaultTitle(previous.type, race.name)
        : '';
      return {
        ...previous,
        raceId,
        title: updatedTitle
      };
    });
  };

  const handleQuestionChange = (index: number, updates: Partial<QuestionDraft>) => {
    setFormState((previous) => {
      const questions = previous.questions.map((question, questionIndex) => {
        if (questionIndex !== index) return question;
        return {
          ...question,
          ...updates
        };
      });
      return {
        ...previous,
        questions
      };
    });
  };

  const handleQuestionTypeChange = (index: number, type: BonusResponseType) => {
    setFormState((previous) => {
      const questions = previous.questions.map((question, questionIndex) => {
        if (questionIndex !== index) return question;
        if (type === question.responseType) return question;

        if (type === 'choice_driver') {
          return {
            ...question,
            responseType: type,
            maxSelections: 1,
            driverOptionIds: drivers.map((driver) => driver.id),
            teamOptionIds: [],
            customOptions: []
          };
        }

        if (type === 'choice_team') {
          return {
            ...question,
            responseType: type,
            maxSelections: 1,
            driverOptionIds: [],
            teamOptionIds: teams.map((team) => team.id),
            customOptions: []
          };
        }

        if (type === 'choice_custom') {
          return {
            ...question,
            responseType: type,
            maxSelections: 1,
            driverOptionIds: [],
            teamOptionIds: [],
            customOptions: [
              { id: cryptoId(), label: '' },
              { id: cryptoId(), label: '' }
            ]
          };
        }

        return question;
      });

      return {
        ...previous,
        questions
      };
    });
  };

  const handleAddQuestion = () => {
    setFormState((previous) => ({
      ...previous,
      questions: [...previous.questions, defaultQuestion(previous.questions.length)]
    }));
  };

  const handleRemoveQuestion = (index: number) => {
    setFormState((previous) => {
      if (previous.questions.length <= 1) {
        return previous;
      }
      const questions = previous.questions.filter((_, idx) => idx !== index);
      return {
        ...previous,
        questions
      };
    });
  };

  const updateDriverSelection = (index: number, selected: string[]) => {
    handleQuestionChange(index, { driverOptionIds: selected });
  };

  const updateTeamSelection = (index: number, selected: string[]) => {
    handleQuestionChange(index, { teamOptionIds: selected });
  };

  const updateCustomOptionLabel = (questionIndex: number, optionId: string, label: string) => {
    setFormState((previous) => ({
      ...previous,
      questions: previous.questions.map((question, idx) => {
        if (idx !== questionIndex) return question;
        return {
          ...question,
          customOptions: question.customOptions.map((option) =>
            option.id === optionId ? { ...option, label } : option
          )
        };
      })
    }));
  };

  const addCustomOption = (questionIndex: number) => {
    setFormState((previous) => ({
      ...previous,
      questions: previous.questions.map((question, idx) => {
        if (idx !== questionIndex) return question;
        return {
          ...question,
          customOptions: [...question.customOptions, { id: cryptoId(), label: '' }]
        };
      })
    }));
  };

  const removeCustomOption = (questionIndex: number, optionId: string) => {
    setFormState((previous) => ({
      ...previous,
      questions: previous.questions.map((question, idx) => {
        if (idx !== questionIndex) return question;
        const nextOptions = question.customOptions.filter((option) => option.id !== optionId);
        return {
          ...question,
          customOptions: nextOptions.length ? nextOptions : [{ id: cryptoId(), label: '' }]
        };
      })
    }));
  };

  const handleEditEvent = (event: AdminBonusEvent) => {
    setEditingEventId(event.id);
    setFormState(convertEventToForm(event));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDeleteEvent = async (eventId: string) => {
    if (!window.confirm('Delete this bonus event? This action cannot be undone.')) {
      return;
    }

    const authPayload = getAuthPayload();
    if (!authPayload) return;

    try {
      const response = await fetch('/api/admin/bonus/events', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId, ...authPayload })
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(data?.error || 'Failed to delete bonus event.');
      }

      setMessage({ type: 'success', text: 'Bonus event deleted.' });
      await fetchEvents();
      if (editingEventId === eventId) {
        resetForm();
      }
    } catch (error) {
      console.error('Failed to delete bonus event:', error);
      setMessage({ type: 'error', text: (error as Error)?.message ?? 'Failed to delete bonus event.' });
    }
  };

  const handleStatusChange = async (eventId: string, status: BonusEventStatus) => {
    const authPayload = getAuthPayload();
    if (!authPayload) return;

    try {
      const response = await fetch('/api/admin/bonus/events', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventId,
          action: 'status',
          status,
          ...authPayload
        })
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(data?.error || 'Failed to update event status.');
      }

      setMessage({ type: 'success', text: `Event marked as ${BONUS_STATUS_LABELS[status]}.` });
      await fetchEvents();
    } catch (error) {
      console.error('Failed to update bonus event status:', error);
      setMessage({ type: 'error', text: (error as Error)?.message ?? 'Failed to update event status.' });
    }
  };

  const openAnswerEditor = (event: AdminBonusEvent) => {
    const defaults = event.questions.reduce<Record<string, AnswerDraft>>((acc, question) => {
      acc[question.id] = {
        optionIds: [...(question.correctOptionIds ?? [])],
      };
      return acc;
    }, {});
    setAnswerEditor({ event, answers: defaults });
  };

  const updateAnswerSelection = (questionId: string, value: string[] | string) => {
    setAnswerEditor((previous) => {
      if (!previous) return previous;
      const normalized = Array.isArray(value) ? value : value ? [value] : [];
      return {
        event: previous.event,
        answers: {
          ...previous.answers,
          [questionId]: {
            optionIds: normalized,
          },
        },
      };
    });
  };

  const handleSaveAnswers = async () => {
    if (!answerEditor) return;
    const authPayload = getAuthPayload();
    if (!authPayload) return;

    setSavingAnswers(true);
    try {
      const payload = answerEditor.event.questions.map((question) => {
        const draft = answerEditor.answers[question.id] ?? { optionIds: [] };
        return {
          questionId: question.id,
          correctOptionIds: draft.optionIds.length ? draft.optionIds : undefined,
        };
      });

      const response = await fetch('/api/admin/bonus/events', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventId: answerEditor.event.id,
          action: 'answers',
          answers: payload,
          ...authPayload,
        }),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(data?.error || 'Failed to save answers.');
      }

      setMessage({ type: 'success', text: 'Answer key updated.' });
      setAnswerEditor(null);
      await fetchEvents();
    } catch (error) {
      console.error('Failed to save bonus answers:', error);
      setMessage({ type: 'error', text: (error as Error)?.message ?? 'Failed to save answers.' });
    } finally {
      setSavingAnswers(false);
    }
  };

  const handleScoreEvent = async (eventId: string) => {
    const authPayload = getAuthPayload();
    if (!authPayload) return;

    setScoringEventId(eventId);
    try {
      const response = await fetch('/api/admin/bonus/events', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId, action: 'score', ...authPayload }),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(data?.error || 'Failed to score event.');
      }

      setMessage({ type: 'success', text: 'Bonus event scored and leaderboard updated.' });
      await fetchEvents();
    } catch (error) {
      console.error('Failed to score bonus event:', error);
      setMessage({ type: 'error', text: (error as Error)?.message ?? 'Failed to score event.' });
    } finally {
      setScoringEventId(null);
    }
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const authPayload = getAuthPayload();
    if (!authPayload) return;

    const opensAtIso = toIsoString(formState.opensAt);
    const locksAtIso = toIsoString(formState.locksAt);

    if (!opensAtIso || !locksAtIso) {
      setMessage({ type: 'error', text: 'Please provide valid open and lock times.' });
      return;
    }

    if (!formState.questions.length) {
      setMessage({ type: 'error', text: 'Add at least one question to the event.' });
      return;
    }

    setSubmitting(true);
    setMessage(null);

    const payloadQuestions = formState.questions.map((question, index) =>
      mapQuestionDraftToPayload(question, index, drivers, teams)
    );

    try {
      const response = await fetch('/api/admin/bonus/events', {
        method: editingEventId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(editingEventId ? { eventId: editingEventId } : {}),
          type: formState.type,
          title: formState.title,
          description: formState.description,
          raceId: formState.raceId || null,
          opensAt: opensAtIso,
          locksAt: locksAtIso,
          status: formState.status,
          pointsMultiplier: Number(formState.pointsMultiplier) || 1,
          questions: payloadQuestions,
          ...authPayload
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || 'Failed to save bonus event.');
      }

      setMessage({
        type: 'success',
        text: editingEventId ? 'Bonus event updated.' : 'Bonus event created.'
      });

      await fetchEvents();
      resetForm();
    } catch (error) {
      console.error('Failed to save bonus event:', error);
      setMessage({ type: 'error', text: (error as Error)?.message ?? 'Failed to save bonus event.' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleSeedSprintQuestions = () => {
    setFormState((previous) => seedSprintTemplate(previous, drivers));
  };

  return (
    <div className="space-y-6">
      <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Sparkles className="w-6 h-6 text-amber-400" />
              {editingEventId ? 'Update Bonus Event' : 'Create Bonus Event'}
            </h2>
            <p className="text-sm text-gray-400">
              Configure sprint bonuses, transfer rumours, or winter testing predictions.
            </p>
          </div>
          <button
            type="button"
            onClick={resetForm}
            className="flex items-center gap-2 rounded-lg border border-gray-600 px-4 py-2 text-sm text-gray-200 hover:bg-gray-700"
          >
            <X className="w-4 h-4" />
            Reset
          </button>
        </div>

        <form className="space-y-6" onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <label className="flex flex-col gap-2 text-sm">
              <span className="text-gray-300">Event Type</span>
              <select
                value={formState.type}
                onChange={(event) => handleTypeChange(event.target.value as BonusEventType)}
                className="rounded-lg border border-gray-600 bg-gray-700 p-3 text-white"
              >
                <option value="sprint">Sprint weekend bonus</option>
                <option value="open">Open question</option>
                <option value="winter">Winter testing</option>
              </select>
            </label>

            <label className="flex flex-col gap-2 text-sm">
              <span className="text-gray-300">Status</span>
              <select
                value={formState.status}
                onChange={(event) =>
                  setFormState((previous) => ({
                    ...previous,
                    status: event.target.value as BonusEventStatus
                  }))
                }
                className="rounded-lg border border-gray-600 bg-gray-700 p-3 text-white"
              >
                {BONUS_STATUS_OPTIONS.map((status) => (
                  <option key={status} value={status}>
                    {BONUS_STATUS_LABELS[status]}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-2 text-sm">
              <span className="text-gray-300">Linked Race (optional)</span>
              <select
                value={formState.raceId}
                onChange={(event) => handleRaceChange(event.target.value)}
                className="rounded-lg border border-gray-600 bg-gray-700 p-3 text-white"
              >
                <option value="">No linked race</option>
                {races.map((race) => (
                  <option key={race.id} value={race.id}>
                    {race.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-2 text-sm">
              <span className="text-gray-300">Points Multiplier</span>
              <input
                type="number"
                min={0.1}
                step={0.1}
                value={formState.pointsMultiplier}
                onChange={(event) =>
                  setFormState((previous) => ({
                    ...previous,
                    pointsMultiplier: event.target.value
                  }))
                }
                className="rounded-lg border border-gray-600 bg-gray-700 p-3 text-white"
              />
            </label>
          </div>

          <label className="flex flex-col gap-2 text-sm">
            <span className="text-gray-300">Title</span>
            <input
              type="text"
              value={formState.title}
              onChange={(event) =>
                setFormState((previous) => ({
                  ...previous,
                  title: event.target.value
                }))
              }
              placeholder="e.g. Who aces the Barcelona sprint?"
              className="rounded-lg border border-gray-600 bg-gray-700 p-3 text-white"
              required
            />
          </label>

          <label className="flex flex-col gap-2 text-sm">
            <span className="text-gray-300">Description (optional)</span>
            <textarea
              value={formState.description}
              onChange={(event) =>
                setFormState((previous) => ({
                  ...previous,
                  description: event.target.value
                }))
              }
              rows={3}
              className="rounded-lg border border-gray-600 bg-gray-700 p-3 text-white"
              placeholder="Let players know what to expect."
            />
          </label>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <label className="flex flex-col gap-2 text-sm">
              <span className="text-gray-300">Opens at</span>
              <input
                type="datetime-local"
                value={formState.opensAt}
                onChange={(event) =>
                  setFormState((previous) => ({
                    ...previous,
                    opensAt: event.target.value
                  }))
                }
                className="rounded-lg border border-gray-600 bg-gray-700 p-3 text-white"
                required
              />
            </label>

            <label className="flex flex-col gap-2 text-sm">
              <span className="text-gray-300">Locks at</span>
              <input
                type="datetime-local"
                value={formState.locksAt}
                onChange={(event) =>
                  setFormState((previous) => ({
                    ...previous,
                    locksAt: event.target.value
                  }))
                }
                className="rounded-lg border border-gray-600 bg-gray-700 p-3 text-white"
                required
              />
            </label>
          </div>

          {formState.type === 'sprint' && (
            <div className="rounded-lg border border-amber-400/40 bg-amber-500/10 p-4">
              <div className="flex items-center gap-3 text-sm text-amber-200">
                <Flame className="w-4 h-4" />
                Sprint template includes pole, winner, P2, and P3 with 10/10/7/3 pts. You can tweak drivers or point
                values if needed.
              </div>
              <button
                type="button"
                className="mt-3 flex items-center gap-2 rounded-lg border border-amber-400/70 px-3 py-2 text-sm text-amber-100 transition hover:bg-amber-400/20"
                onClick={handleSeedSprintQuestions}
              >
                <ListPlus className="w-4 h-4" />
                Reseed sprint questions
              </button>
            </div>
          )}

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white">Questions</h3>
              <button
                type="button"
                onClick={handleAddQuestion}
                className="flex items-center gap-2 rounded-lg border border-gray-600 px-3 py-2 text-sm text-gray-100 hover:bg-gray-700"
              >
                <Plus className="w-4 h-4" />
                Add Question
              </button>
            </div>

            {formState.questions.map((question, index) => (
              <div key={index} className="rounded-xl border border-gray-700 bg-gray-900/70 p-4 space-y-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-gray-200">Question #{index + 1}</p>
                    <p className="text-xs text-gray-500">Worth {question.points} pts • {RESPONSE_TYPE_LABELS[question.responseType]}</p>
                  </div>
                  {formState.questions.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveQuestion(index)}
                      className="rounded-full border border-red-500/60 p-2 text-red-300 hover:bg-red-500/20"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>

                <label className="flex flex-col gap-2 text-sm">
                  <span className="text-gray-300">Prompt</span>
                  <input
                    type="text"
                    value={question.prompt}
                    onChange={(event) =>
                      handleQuestionChange(index, {
                        prompt: event.target.value
                      })
                    }
                    placeholder="Who leads the winter mileage charts?"
                    className="rounded-lg border border-gray-600 bg-gray-800 p-3 text-white"
                    required
                  />
                </label>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  <label className="flex flex-col gap-2 text-sm md:col-span-2">
                    <span className="text-gray-300">Response type</span>
                    <select
                      value={question.responseType}
                      onChange={(event) => handleQuestionTypeChange(index, event.target.value as BonusResponseType)}
                      className="rounded-lg border border-gray-600 bg-gray-800 p-3 text-white"
                    >
                      {Object.entries(RESPONSE_TYPE_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="flex flex-col gap-2 text-sm">
                    <span className="text-gray-300">Max selections</span>
                    <input
                      type="number"
                      min={1}
                      value={question.maxSelections}
                      onChange={(event) =>
                        handleQuestionChange(index, {
                          maxSelections: Math.max(1, Number(event.target.value) || 1)
                        })
                      }
                      className="rounded-lg border border-gray-600 bg-gray-800 p-3 text-white"
                    />
                  </label>

                  <label className="flex flex-col gap-2 text-sm">
                    <span className="text-gray-300">Points</span>
                    <input
                      type="number"
                      min={1}
                      value={question.points}
                      onChange={(event) =>
                        handleQuestionChange(index, {
                          points: Math.max(1, Number(event.target.value) || 1)
                        })
                      }
                      className="rounded-lg border border-gray-600 bg-gray-800 p-3 text-white"
                    />
                  </label>
                </div>

                {question.responseType === 'choice_driver' && (
                  <label className="flex flex-col gap-2 text-sm">
                    <span className="text-gray-300">Select eligible drivers</span>
                    <select
                      multiple
                      value={question.driverOptionIds}
                      onChange={(event) => {
                        const selected = Array.from(event.target.selectedOptions).map((option) => option.value);
                        updateDriverSelection(index, selected);
                      }}
                      className="h-48 rounded-lg border border-gray-600 bg-gray-800 p-3 text-white"
                    >
                      {drivers.map((driver) => (
                        <option key={driver.id} value={driver.id}>
                          #{driver.number} {driver.name} — {driver.team}
                        </option>
                      ))}
                    </select>
                    <p className="text-xs text-gray-500">
                      Hold Ctrl / Cmd to select multiple drivers. Selected drivers become options in the frame.
                    </p>
                  </label>
                )}

                {question.responseType === 'choice_team' && (
                  <label className="flex flex-col gap-2 text-sm">
                    <span className="text-gray-300">Select eligible teams</span>
                    <select
                      multiple
                      value={question.teamOptionIds}
                      onChange={(event) => {
                        const selected = Array.from(event.target.selectedOptions).map((option) => option.value);
                        updateTeamSelection(index, selected);
                      }}
                      className="h-40 rounded-lg border border-gray-600 bg-gray-800 p-3 text-white"
                    >
                      {teams.map((team) => (
                        <option key={team.id} value={team.id}>
                          {team.name}
                        </option>
                      ))}
                    </select>
                    <p className="text-xs text-gray-500">
                      Hold Ctrl / Cmd to select multiple teams. Selected entries become options for players.
                    </p>
                  </label>
                )}

                {question.responseType === 'choice_custom' && (
                  <div className="space-y-3">
                    <p className="text-sm text-gray-300">Custom options</p>
                    <div className="space-y-2">
                      {question.customOptions.map((option) => (
                        <div key={option.id} className="flex items-center gap-3">
                          <input
                            type="text"
                            value={option.label}
                            onChange={(event) => updateCustomOptionLabel(index, option.id, event.target.value)}
                            className="flex-1 rounded-lg border border-gray-600 bg-gray-800 p-3 text-white"
                            placeholder="Option label"
                          />
                          <button
                            type="button"
                            onClick={() => removeCustomOption(index, option.id)}
                            className="rounded-lg border border-red-500/60 p-2 text-red-300 hover:bg-red-500/20"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() => addCustomOption(index)}
                      className="flex items-center gap-2 rounded-lg border border-gray-600 px-3 py-2 text-sm text-gray-100 hover:bg-gray-700"
                    >
                      <Plus className="w-4 h-4" />
                      Add option
                    </button>
                  </div>
                )}

              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button
              type="submit"
              disabled={submitting}
              className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <UploadCloud className="w-4 h-4" />
              {submitting ? 'Saving…' : editingEventId ? 'Update Event' : 'Create Event'}
            </button>

            <span className="text-xs text-gray-500">
              Changes apply immediately. Locked events cannot be edited until they re-open.
            </span>
          </div>
        </form>
      </div>

      <div className="bg-gray-800 rounded-xl border border-gray-700">
        <div className="flex items-center justify-between border-b border-gray-700 px-6 py-4">
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <CalendarClock className="w-5 h-5 text-emerald-300" />
            Scheduled Bonus Events
          </h3>
          <button
            type="button"
            onClick={() => fetchEvents()}
            className="flex items-center gap-2 rounded-lg border border-gray-600 px-3 py-2 text-sm text-gray-100 hover:bg-gray-700"
          >
            <Edit3 className="w-4 h-4" />
            Refresh
          </button>
        </div>

        <div className="divide-y divide-gray-700">
          {loadingEvents && (
            <div className="px-6 py-5 text-sm text-gray-400">Loading bonus events…</div>
          )}

          {!loadingEvents && sortedEvents.length === 0 && (
            <div className="px-6 py-5 text-sm text-gray-400">No bonus events configured yet.</div>
          )}

          {!loadingEvents &&
            sortedEvents.map((event) => (
              <div key={event.id} className="px-6 py-5 text-sm text-gray-300">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-base font-semibold text-white">{event.title}</p>
                    <p className="text-xs text-gray-400">
                      {BONUS_STATUS_LABELS[event.status]} • Opens {formatLocalDateTime(event.opensAt)} • Locks{' '}
                      {formatLocalDateTime(event.locksAt)}
                    </p>
                    {event.description && (
                      <p className="mt-1 text-xs text-gray-500">{event.description}</p>
                    )}
                    <p className="mt-2 text-xs text-gray-500">
                      {event.questions.length} question{event.questions.length === 1 ? '' : 's'} • Type:{' '}
                      {event.type}
                    </p>
                    <p className="text-xs text-gray-500">
                      {event.participantCount ?? 0} participant{event.participantCount === 1 ? '' : 's'}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleEditEvent(event)}
                      className="rounded-lg border border-gray-600 px-3 py-2 text-xs text-gray-100 hover:bg-gray-700"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => openAnswerEditor(event)}
                      className="rounded-lg border border-purple-500/60 px-3 py-2 text-xs text-purple-200 hover:bg-purple-500/10"
                    >
                      Answers
                    </button>
                    <button
                      type="button"
                      onClick={() => handleScoreEvent(event.id)}
                      disabled={scoringEventId === event.id}
                      className="rounded-lg border border-emerald-500/60 px-3 py-2 text-xs text-emerald-200 transition hover:bg-emerald-500/10 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {scoringEventId === event.id ? 'Scoring…' : 'Score'}
                    </button>
                    {event.status !== 'draft' && event.status !== 'scheduled' && (
                      <button
                        type="button"
                        onClick={() => handleStatusChange(event.id, 'draft')}
                        className="rounded-lg border border-gray-600 px-3 py-2 text-xs text-gray-100 hover:bg-gray-700"
                      >
                        Mark Draft
                      </button>
                    )}
                    {event.status !== 'open' && (
                      <button
                        type="button"
                        onClick={() => handleStatusChange(event.id, 'open')}
                        className="rounded-lg border border-emerald-500/70 px-3 py-2 text-xs text-emerald-200 hover:bg-emerald-500/20"
                      >
                        Open
                      </button>
                    )}
                    {event.status !== 'locked' && (
                      <button
                        type="button"
                        onClick={() => handleStatusChange(event.id, 'locked')}
                        className="rounded-lg border border-yellow-500/70 px-3 py-2 text-xs text-yellow-200 hover:bg-yellow-500/20"
                      >
                        Lock
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleDeleteEvent(event.id)}
                      className="rounded-lg border border-red-500/60 px-3 py-2 text-xs text-red-300 hover:bg-red-500/20"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
      </div>
    </div>

      {answerEditor && (
        <div className="bg-gray-800 rounded-xl border border-purple-500/40 p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold text-white">Set correct answers</h3>
              <p className="text-sm text-purple-100/80">
                {answerEditor.event.title} • {answerEditor.event.questions.length} question
                {answerEditor.event.questions.length === 1 ? '' : 's'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setAnswerEditor(null)}
              className="rounded-lg border border-purple-400/40 px-3 py-2 text-sm text-purple-100 hover:bg-purple-500/10"
            >
              Close
            </button>
          </div>

          <div className="mt-5 space-y-4">
            {answerEditor.event.questions.map((question) => {
              const draft = answerEditor.answers[question.id] ?? { optionIds: [] };
              const isMulti = question.maxSelections > 1;
              return (
                <div key={question.id} className="rounded-xl border border-gray-700 bg-gray-900/70 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-gray-200">{question.prompt}</p>
                      <p className="text-xs uppercase tracking-wide text-gray-500">{question.responseType}</p>
                    </div>
                    <span className="text-xs text-gray-500">{question.points} pts</span>
                  </div>

                  <div className="mt-4 space-y-2">
                    <label className="text-xs text-gray-400">
                      {isMulti ? 'Select all correct options' : 'Select the correct option'}
                    </label>
                    {isMulti ? (
                      <select
                        multiple
                        value={draft.optionIds}
                        onChange={(event) => {
                          const selected = Array.from(event.target.selectedOptions).map((option) => option.value);
                          updateAnswerSelection(question.id, selected);
                        }}
                        className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white"
                      >
                        {question.options.map((option) => (
                          <option key={option.id} value={option.id}>
                            {resolveAdminOptionLabel(option)}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <select
                        value={draft.optionIds[0] ?? ""}
                        onChange={(event) => {
                          const value = event.target.value;
                          updateAnswerSelection(question.id, value ? [value] : []);
                        }}
                        className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white"
                      >
                        <option value="">— Select option —</option>
                        {question.options.map((option) => (
                          <option key={option.id} value={option.id}>
                            {resolveAdminOptionLabel(option)}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleSaveAnswers}
              disabled={savingAnswers}
              className="rounded-lg bg-purple-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-purple-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {savingAnswers ? 'Saving…' : 'Save answers'}
            </button>
            <button
              type="button"
              onClick={() => setAnswerEditor(null)}
              className="rounded-lg border border-gray-600 px-3 py-2 text-sm text-gray-100 hover:bg-gray-700"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default AdminBonusPredictionsSection;

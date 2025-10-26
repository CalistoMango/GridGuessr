/**
 * Convert an ISO string to the local `datetime-local` format expected by inputs.
 */
export function formatDateTimeForInput(value: string | null | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

/**
 * Convert a `datetime-local` input value to a UTC ISO string for storage.
 * Takes a value like "2024-10-27T14:00" (which represents local time)
 * and converts it to a UTC ISO string like "2024-10-27T12:00:00.000Z".
 */
export function convertLocalInputToUTC(localDateTime: string): string {
  if (!localDateTime) return '';
  // datetime-local is interpreted as local time by the Date constructor
  const date = new Date(localDateTime);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString();
}

/**
 * Present ISO timestamps to admins in their local timezone or a fallback dash.
 */
export function formatLocalDateTime(isoString?: string): string {
  if (!isoString) return '—';
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}

export function formatLocalDate(isoString?: string): string {
  if (!isoString) return '—';
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  }).format(date);
}

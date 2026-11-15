/**
 * Parses Firestore Timestamps, serialized { seconds }, ISO strings, or epoch millis safely.
 */
export const parseAnyDate = (value: any): Date | null => {
  if (!value) return null;
  try {
    if (value instanceof Date) {
      return Number.isNaN(value.getTime()) ? null : value;
    }
    if (typeof value.toDate === 'function') {
      const d = value.toDate();
      return d instanceof Date && !Number.isNaN(d.getTime()) ? d : null;
    }
    if (typeof value.toMillis === 'function') {
      const d = new Date(value.toMillis());
      return !Number.isNaN(d.getTime()) ? d : null;
    }
    if (typeof value === 'object') {
      const sec = value.seconds ?? value._seconds;
      if (typeof sec === 'number') {
        const d = new Date(sec * 1000);
        return !Number.isNaN(d.getTime()) ? d : null;
      }
    }
    if (typeof value === 'string' || typeof value === 'number') {
      const d = new Date(value);
      return !Number.isNaN(d.getTime()) ? d : null;
    }
  } catch {
    // ignore malformed dates
  }
  return null;
};

export const formatDatePart = (value: any, fallback = '—'): string => {
  const d = parseAnyDate(value);
  if (!d) return fallback;
  return d.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

export const formatTimePart = (value: any, fallback = ''): string => {
  const d = parseAnyDate(value);
  if (!d) return fallback;
  return d.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
};

export const formatDateTime = (value: any, fallback = '—'): string => {
  const d = parseAnyDate(value);
  if (!d) return fallback;
  return `${formatDatePart(d)}, ${formatTimePart(d)}`;
};

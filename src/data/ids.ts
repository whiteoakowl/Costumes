import type { ID } from './types';
import { nyToday } from './time';

export function newId(): ID {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return 'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function nowIso(): string {
  return new Date().toISOString();
}

/** Today's date in New York (the studio's time zone), as YYYY-MM-DD. */
export function todayStr(): string {
  return nyToday();
}

import type { ReactNode } from 'react';
import { useDb } from '../data/store';
import { WEEKDAY_NAMES, staffName } from '../data/studio';
import { formatTime } from '../data/selectors';
import type { Option } from './ui';
import type { Database, DanceClass, ID, StaffMember } from '../data/types';

export function money(n: number) {
  return n.toLocaleString(undefined, { style: 'currency', currency: 'USD' });
}

export function classWhen(c: Pick<DanceClass, 'dayOfWeek' | 'startTime' | 'endTime'>) {
  return `${WEEKDAY_NAMES[c.dayOfWeek].slice(0, 3)} ${formatTime(c.startTime)}–${formatTime(c.endTime)}`;
}

export function useStaffOptions(filter?: (s: StaffMember) => boolean): Option[] {
  const db = useDb();
  return db.staff
    .filter((s) => s.status === 'active' && (!filter || filter(s)))
    .sort((a, b) => staffName(a).localeCompare(staffName(b)))
    .map((s) => ({ value: s.id, label: staffName(s), hint: s.title || s.position }));
}

export function classOptions(db: Database, yearId?: ID | null, only?: ID[]): Option[] {
  const years = new Map(db.schoolYears.map((y) => [y.id, y.name]));
  return db.classes
    .filter((c) => (!yearId || c.schoolYearId === yearId) && (!only || only.includes(c.id)))
    .sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.startTime.localeCompare(b.startTime))
    .map((c) => ({ value: c.id, label: c.name, hint: classWhen(c), group: years.get(c.schoolYearId) }));
}

/** The current school year (or the most recent one). */
export function currentYear(db: Database) {
  return db.schoolYears.find((y) => y.status === 'current') ?? [...db.schoolYears].sort((a, b) => b.startDate.localeCompare(a.startDate))[0];
}

export function Pill({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'ready' | 'progress' | 'danger' | 'info' | 'rose' }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function Restricted({ children }: { children: ReactNode }) {
  return <span className="restricted">{children}</span>;
}

/** CSV download from rows. */
export { download, toCsv } from '../lib/export';

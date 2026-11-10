import type { AttendanceStatus, Database, DanceClass, ID, Role, StaffMember, TimeEntry, UserAccount } from './types';
import { newId, nowIso } from './ids';

/*
 * Studio-management logic shared by actions, pages and tests: dates & times,
 * the weekly class schedule (with cancellations, moves and closures),
 * scheduling conflicts, permissions and payroll math. Pure functions only.
 */

/* ------------------------------------------------------------- dates */

const pad = (n: number) => String(n).padStart(2, '0');

export function toDateStr(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseDate(s: string) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function addDays(date: string, days: number) {
  const d = parseDate(date);
  d.setDate(d.getDate() + days);
  return toDateStr(d);
}

export function weekdayOf(date: string) {
  return parseDate(date).getDay();
}

/** Monday-based start of week. */
export function startOfWeek(date: string) {
  const wd = weekdayOf(date);
  return addDays(date, wd === 0 ? -6 : 1 - wd);
}

export function minutes(t: string) {
  const [h, m] = t.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function fromMinutes(m: number) {
  const c = Math.max(0, Math.min(24 * 60 - 1, Math.round(m)));
  return `${pad(Math.floor(c / 60))}:${pad(c % 60)}`;
}

export function durationHours(start: string, end: string) {
  return Math.max(0, (minutes(end) - minutes(start)) / 60);
}

function rangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string) {
  return aStart < bEnd && bStart < aEnd;
}

export const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/* ------------------------------------------------------------- names */

export function staffName(s: Pick<StaffMember, 'firstName' | 'lastName'> | undefined | null) {
  return s ? `${s.firstName} ${s.lastName}`.trim() : '';
}

export function staffById(db: Database, id: ID | null | undefined) {
  return id ? db.staff.find((s) => s.id === id) : undefined;
}

export const positionLabels: Record<StaffMember['position'], string> = {
  teacher: 'Teacher',
  assistant: 'Assistant Teacher',
  substitute: 'Substitute Teacher',
  office: 'Office Staff',
  performance: 'Performance Staff',
  other: 'Other Staff',
};

/* ------------------------------------------------------------ classes */

/** The date range a class meets in: its own dates, or its school year's. */
export function classRange(db: Database, c: DanceClass) {
  const year = db.schoolYears.find((y) => y.id === c.schoolYearId);
  return { start: c.startDate || year?.startDate || '', end: c.endDate || year?.endDate || '' };
}

export function enrolledDancerIds(db: Database, classId: ID) {
  return db.enrollments.filter((e) => e.classId === classId && e.status === 'enrolled').map((e) => e.dancerId);
}

export function waitlistDancerIds(db: Database, classId: ID) {
  return db.enrollments
    .filter((e) => e.classId === classId && e.status === 'waitlist')
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map((e) => e.dancerId);
}

export function dancerClassIds(db: Database, dancerId: ID, status: 'enrolled' | 'waitlist' = 'enrolled') {
  return db.enrollments.filter((e) => e.dancerId === dancerId && e.status === status).map((e) => e.classId);
}

/* ------------------------------------------------- schedule occurrences */

export interface Occurrence {
  key: string; // classId:originalDate
  classId: ID;
  cls: DanceClass;
  originalDate: string;
  date: string;
  start: string;
  end: string;
  classroomId: ID | null;
  teacherId: ID | null; // substitute when set
  regularTeacherId: ID | null;
  assistantId: ID | null;
  substituted: boolean;
  moved: boolean;
  cancelled: boolean;
  cancelReason: string;
  changeId: ID | null;
}

/** Closures / holidays that cancel classes on a date. */
export function closureOn(db: Database, date: string) {
  return db.studioEvents.find((e) => e.cancelsClasses && e.startDate <= date && date <= (e.endDate || e.startDate));
}

/**
 * Every class meeting between `from` and `to` (inclusive), after applying
 * per-date changes (cancel / move / substitute) and studio closures.
 */
export function occurrencesBetween(db: Database, from: string, to: string, opts: { includeCancelled?: boolean; classIds?: Set<ID> } = {}): Occurrence[] {
  const out: Occurrence[] = [];
  const changes = new Map(db.sessionChanges.map((c) => [`${c.classId}:${c.date}`, c]));
  for (const cls of db.classes) {
    if (opts.classIds && !opts.classIds.has(cls.id)) continue;
    const { start, end } = classRange(db, cls);
    if (!start || !end) continue;
    // Look a week either side so occurrences moved into the window are found.
    const lo = from > start ? addDays(from, -14) : start;
    const hi = to < end ? addDays(to, 14) : end;
    let first = lo < start ? start : lo;
    const shift = (cls.dayOfWeek - weekdayOf(first) + 7) % 7;
    first = addDays(first, shift);
    for (let d = first; d <= hi && d <= end; d = addDays(d, 7)) {
      if (d < start) continue;
      const ch = changes.get(`${cls.id}:${d}`);
      const date = ch?.newDate || d;
      if (date < from || date > to) continue;
      const closure = closureOn(db, date);
      const cancelled = !!ch?.cancelled || !!closure;
      if (cancelled && !opts.includeCancelled) continue;
      out.push({
        key: `${cls.id}:${d}`,
        classId: cls.id,
        cls,
        originalDate: d,
        date,
        start: ch?.newStartTime || cls.startTime,
        end: ch?.newEndTime || cls.endTime,
        classroomId: ch?.newClassroomId ?? cls.classroomId,
        teacherId: ch?.substituteId || cls.teacherId,
        regularTeacherId: cls.teacherId,
        assistantId: cls.assistantId,
        substituted: !!ch?.substituteId,
        moved: !!ch && (!!ch.newDate && ch.newDate !== d || !!ch.newStartTime || !!ch.newEndTime || ch.newClassroomId !== null && ch.newClassroomId !== cls.classroomId),
        cancelled,
        cancelReason: ch?.cancelled ? ch.reason || 'Cancelled' : closure ? closure.title : '',
        changeId: ch?.id ?? null,
      });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start) || a.cls.name.localeCompare(b.cls.name));
}

/* ------------------------------------------------------------ conflicts */

type ClassShape = Pick<DanceClass, 'schoolYearId' | 'dayOfWeek' | 'startTime' | 'endTime' | 'classroomId' | 'teacherId' | 'assistantId' | 'startDate' | 'endDate'>;

/** Weekly double-bookings of teachers / assistants / classrooms for a class (excluding itself). */
export function classConflicts(db: Database, c: ClassShape, excludeId?: ID): string[] {
  const out: string[] = [];
  const year = db.schoolYears.find((y) => y.id === c.schoolYearId);
  const aStart = c.startDate || year?.startDate || '0000';
  const aEnd = c.endDate || year?.endDate || '9999';
  for (const o of db.classes) {
    if (o.id === excludeId || o.dayOfWeek !== c.dayOfWeek) continue;
    if (!rangesOverlap(c.startTime, c.endTime, o.startTime, o.endTime)) continue;
    const r = classRange(db, o);
    if (!(aStart <= (r.end || '9999') && (r.start || '0000') <= aEnd)) continue;
    const when = `${WEEKDAY_NAMES[o.dayOfWeek]} ${o.startTime}–${o.endTime}`;
    const people = [c.teacherId, c.assistantId].filter(Boolean) as ID[];
    for (const p of people) {
      if (p === o.teacherId || p === o.assistantId) out.push(`${staffName(staffById(db, p))} already teaches “${o.name}” (${when}).`);
    }
    if (c.classroomId && c.classroomId === o.classroomId) out.push(`${db.classrooms.find((r) => r.id === c.classroomId)?.name ?? 'That classroom'} is already booked for “${o.name}” (${when}).`);
  }
  if (c.teacherId && c.teacherId === c.assistantId) out.push('The teacher and assistant must be different people.');
  return [...new Set(out)];
}

/** Conflicts for one occurrence placed at a specific date/time/room (for moves & drag-and-drop). */
export function occurrenceConflicts(db: Database, occ: { key: string; date: string; start: string; end: string; classroomId: ID | null; teacherId: ID | null; assistantId: ID | null }): string[] {
  const out: string[] = [];
  const closure = closureOn(db, occ.date);
  if (closure) out.push(`The studio is closed on that date (${closure.title}).`);
  for (const o of occurrencesBetween(db, occ.date, occ.date)) {
    if (o.key === occ.key || !rangesOverlap(occ.start, occ.end, o.start, o.end)) continue;
    const people = [occ.teacherId, occ.assistantId].filter(Boolean) as ID[];
    for (const p of people) if (p === o.teacherId || p === o.assistantId) out.push(`${staffName(staffById(db, p))} is teaching “${o.cls.name}” then.`);
    if (occ.classroomId && occ.classroomId === o.classroomId) out.push(`${db.classrooms.find((r) => r.id === occ.classroomId)?.name ?? 'The room'} is in use by “${o.cls.name}”.`);
  }
  return [...new Set(out)];
}

/* ---------------------------------------------------------- attendance */

export const attendanceLabels: Record<AttendanceStatus, string> = { present: 'Present', absent: 'Absent', late: 'Late', excused: 'Excused', makeup: 'Makeup' };

/** Present-like statuses count toward the attendance rate. */
export function attendanceRate(records: { status: AttendanceStatus }[]) {
  const counted = records.filter((r) => r.status !== 'makeup');
  if (!counted.length) return null;
  return Math.round((counted.filter((r) => r.status === 'present' || r.status === 'late').length / counted.length) * 100);
}

/* -------------------------------------------------------------- payroll */

export function entryPay(e: Pick<TimeEntry, 'hours' | 'rate'>) {
  return Math.round(e.hours * e.rate * 100) / 100;
}

export function payrollSummary(db: Database, entries: TimeEntry[]) {
  const byStaff = new Map<ID, { staffId: ID; name: string; approvedHours: number; pendingHours: number; pay: number; byKind: Record<string, number> }>();
  for (const e of entries) {
    if (e.status === 'rejected') continue;
    const row = byStaff.get(e.staffId) ?? { staffId: e.staffId, name: staffName(staffById(db, e.staffId)) || 'Removed staff member', approvedHours: 0, pendingHours: 0, pay: 0, byKind: {} };
    if (e.status === 'approved') {
      row.approvedHours += e.hours;
      row.pay += entryPay(e);
      row.byKind[e.kind] = (row.byKind[e.kind] ?? 0) + e.hours;
    } else row.pendingHours += e.hours;
    byStaff.set(e.staffId, row);
  }
  return [...byStaff.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** Pay period containing `date`. Bi-weekly periods are anchored to Monday 2026-01-05. */
export function payPeriodFor(period: Database['settings']['payPeriod'], date: string) {
  if (period === 'monthly') {
    const start = `${date.slice(0, 8)}01`;
    const d = parseDate(start);
    d.setMonth(d.getMonth() + 1);
    d.setDate(0);
    return { start, end: toDateStr(d) };
  }
  if (period === 'semimonthly') {
    const day = Number(date.slice(8, 10));
    if (day <= 15) return { start: `${date.slice(0, 8)}01`, end: `${date.slice(0, 8)}15` };
    const d = parseDate(date);
    d.setMonth(d.getMonth() + 1);
    d.setDate(0);
    return { start: `${date.slice(0, 8)}16`, end: toDateStr(d) };
  }
  const monday = startOfWeek(date);
  if (period === 'weekly') return { start: monday, end: addDays(monday, 6) };
  const anchor = '2026-01-05';
  const diff = Math.round((parseDate(monday).getTime() - parseDate(anchor).getTime()) / 864e5 / 7);
  const start = addDays(anchor, Math.floor(diff / 2) * 14);
  return { start, end: addDays(start, 13) };
}

export const hoursKindLabels: Record<TimeEntry['kind'], string> = {
  class: 'Class taught',
  additional: 'Additional hours',
  substitute: 'Substitute teaching',
  rehearsal: 'Rehearsal',
  private: 'Private lesson',
  other: 'Other',
};

/* ---------------------------------------------------------- permissions */

export const PERMISSIONS = {
  'dancers.view': 'View dancers',
  'dancers.edit': 'Add & edit dancers',
  'families.view': 'View families & contacts',
  'families.edit': 'Add & edit families',
  'medical.view': 'View medical & allergy info',
  'staff.view': 'View staff',
  'staff.edit': 'Add & edit staff',
  'payroll.view': 'View pay rates, hours & payroll for all staff',
  'hours.approve': 'Approve teacher hours',
  'classes.view': 'View all classes',
  'classes.edit': 'Create & edit classes, school years & enrollment',
  'calendar.edit': 'Change the calendar (cancel, move, closures)',
  'attendance.viewAll': 'View all attendance',
  'attendance.take': 'Take attendance',
  'costumes.view': 'View costumes & props',
  'costumes.edit': 'Edit costumes, props, repairs & storage',
  'shows.view': 'View shows & performances',
  'shows.edit': 'Edit shows & performances',
  'volunteers.view': 'View volunteers',
  'announcements.post': 'Post announcements',
  'reports.view': 'Reports & printing',
  'billing.view': 'View invoices, payments & balances',
  'billing.edit': 'Create invoices, record payments, refunds & credits',
  'productions.manage': 'Recitals, running orders, backstage & costume checkout',
  'events.manage': 'Teams, events, registration, policies, fundraisers & tickets',
  'comms.send': 'Send messages, newsletters & notifications',
  'media.manage': 'Media library & class videos',
  'website.edit': 'Edit & publish the website',
  'accounts.manage': 'Manage accounts & permissions',
  'settings.edit': 'Application settings & data',
} as const;

export type Permission = keyof typeof PERMISSIONS;
const ALL = Object.keys(PERMISSIONS) as Permission[];

export const ROLE_DEFAULTS: Record<Role, Permission[]> = {
  owner: ALL,
  office_admin: ALL.filter((p) => p !== 'accounts.manage'),
  office_assistant: ['dancers.view', 'dancers.edit', 'families.view', 'families.edit', 'staff.view', 'classes.view', 'attendance.viewAll', 'attendance.take', 'costumes.view', 'costumes.edit', 'shows.view', 'volunteers.view', 'reports.view', 'billing.view', 'events.manage', 'comms.send', 'media.manage'],
  teacher: ['attendance.take', 'costumes.view', 'shows.view', 'announcements.post', 'comms.send'],
  assistant_teacher: ['attendance.take', 'costumes.view', 'shows.view'],
  parent: [],
  dancer: [],
  performance_staff: ['costumes.view', 'costumes.edit', 'shows.view', 'shows.edit', 'volunteers.view', 'reports.view', 'productions.manage', 'media.manage'],
};

export const roleLabels: Record<Role, string> = {
  owner: 'Studio Owner / Director',
  office_admin: 'Office Administrator',
  office_assistant: 'Office Assistant',
  teacher: 'Teacher',
  assistant_teacher: 'Assistant Teacher',
  parent: 'Parent / Guardian',
  dancer: 'Dancer',
  performance_staff: 'Performance Staff',
};

export type Portal = 'management' | 'office' | 'teacher' | 'parent' | 'performance';

export const portalOf: Record<Role, Portal> = {
  owner: 'management',
  office_admin: 'office',
  office_assistant: 'office',
  teacher: 'teacher',
  assistant_teacher: 'teacher',
  parent: 'parent',
  dancer: 'parent',
  performance_staff: 'performance',
};

export const portalLabels: Record<Portal, string> = {
  management: 'Studio Management',
  office: 'Office Portal',
  teacher: 'Teacher Portal',
  parent: 'Parent Portal',
  performance: 'Performance Portal',
};

export function permissionsOf(a: Pick<UserAccount, 'role' | 'permissions'>): Set<Permission> {
  if (a.role === 'owner') return new Set(ALL);
  return new Set((a.permissions ?? ROLE_DEFAULTS[a.role]) as Permission[]);
}

/* ------------------------------------------------------------- accounts */

export function ensureOwnerAccount(db: Database) {
  if (!Array.isArray(db.accounts)) db.accounts = [];
  if (db.accounts.some((a) => a.role === 'owner' && a.active)) return db.accounts.find((a) => a.role === 'owner' && a.active)!;
  const t = nowIso();
  const owner: UserAccount = {
    id: newId(),
    createdAt: t,
    updatedAt: t,
    displayName: 'Studio Owner',
    email: db.settings.studioEmail || '',
    role: 'owner',
    active: true,
    staffId: null,
    guardianId: null,
    dancerId: null,
    permissions: null,
    lastActiveAt: t,
    notes: 'Created automatically. Rename this account in Accounts.',
  };
  db.accounts.unshift(owner);
  return owner;
}

/** Family IDs an account may see (parents: their own family; dancers: their family). */
export function accountFamilyId(db: Database, a: UserAccount | undefined): ID | null {
  if (!a) return null;
  if (a.guardianId) return db.guardians.find((g) => g.id === a.guardianId)?.familyId ?? null;
  if (a.dancerId) return db.dancers.find((d) => d.id === a.dancerId)?.familyId ?? null;
  return null;
}

/** Classes a teacher/assistant account works with (regular or substitute). */
export function staffClassIds(db: Database, staffId: ID | null) {
  if (!staffId) return [];
  const ids = new Set(db.classes.filter((c) => c.teacherId === staffId || c.assistantId === staffId).map((c) => c.id));
  for (const ch of db.sessionChanges) if (ch.substituteId === staffId) ids.add(ch.classId);
  return [...ids];
}

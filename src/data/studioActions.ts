import { commit, ValidationError } from './store';
import { newId, nowIso, todayStr } from './ids';
import { actorName } from '../lib/session';
import { fmtClock, fmtDate, fmtWeekdayDate } from './time';
import {
  WEEKDAY_NAMES,
  classConflicts,
  durationHours,
  enrolledDancerIds,
  occurrenceConflicts,
  occurrencesBetween,
  staffById,
  staffName,
} from './studio';
import type {
  Announcement,
  AttendanceStatus,
  Classroom,
  Database,
  DanceClass,
  EmergencyContact,
  Family,
  Guardian,
  ID,
  Notice,
  SchoolYear,
  StaffMember,
  StudioEvent,
  TimeEntry,
  UserAccount,
} from './types';

/* ------------------------------------------------------------- helpers */

function stamp() {
  const t = nowIso();
  return { id: newId(), createdAt: t, updatedAt: t };
}

function required(v: string | undefined | null, label: string) {
  const s = (v ?? '').trim();
  if (!s) throw new ValidationError(`${label} is required.`);
  return s;
}

function date(v: string, label: string, opt = true) {
  if (!v) {
    if (opt) return '';
    throw new ValidationError(`${label} is required.`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(v))) throw new ValidationError(`${label} is not a valid date.`);
  return v;
}

function time(v: string, label: string) {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(v)) throw new ValidationError(`${label} is not a valid time.`);
  return v;
}

function email(v: string) {
  const s = v.trim();
  if (s && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) throw new ValidationError(`“${s}” doesn't look like an email address.`);
  return s;
}

function find<T extends { id: ID }>(list: T[], id: ID, label: string): T {
  const r = list.find((x) => x.id === id);
  if (!r) throw new ValidationError(`${label} no longer exists.`);
  return r;
}

export function logActivity(db: Database, action: string, detail: string, link = '') {
  db.activity.push({ ...stamp(), actor: actorName(), action, detail, link });
  if (db.activity.length > 2000) db.activity.splice(0, db.activity.length - 2000);
}

/** In-app notice to the teachers of a class and the families of its dancers. */
function noticeForClass(db: Database, cls: DanceClass, kind: Notice['kind'], title: string, body: string, extraStaff: (ID | null)[] = []) {
  const staffIds = [cls.teacherId, cls.assistantId, ...extraStaff].filter(Boolean) as ID[];
  const familyIds = [
    ...new Set(
      enrolledDancerIds(db, cls.id)
        .map((d) => db.dancers.find((x) => x.id === d)?.familyId)
        .filter(Boolean) as ID[],
    ),
  ];
  db.notices.push({ ...stamp(), title, body, kind, staffIds: [...new Set(staffIds)], familyIds, classId: cls.id, author: actorName(), readBy: [] });
}

function prettyDate(d: string) {
  return fmtWeekdayDate(d);
}

function prettyTime(t: string) {
  return fmtClock(t);
}

/* ------------------------------------------------------------ accounts */

export type AccountInput = Pick<UserAccount, 'displayName' | 'email' | 'role' | 'staffId' | 'guardianId' | 'dancerId' | 'permissions' | 'notes'>;

export function saveAccount(input: AccountInput, id?: ID): ID {
  const displayName = required(input.displayName, 'Name');
  const mail = email(input.email);
  return commit((db) => {
    if (mail && db.accounts.some((a) => a.id !== id && a.email.toLowerCase() === mail.toLowerCase())) throw new ValidationError(`Another account already uses ${mail}.`);
    if ((input.role === 'parent') && !input.guardianId) throw new ValidationError('Link a parent account to a parent/guardian on a family.');
    if (input.role === 'dancer' && !input.dancerId) throw new ValidationError('Link a dancer account to a dancer.');
    if (['teacher', 'assistant_teacher'].includes(input.role) && !input.staffId) throw new ValidationError('Link a teacher account to a staff member.');
    const clean = { ...input, displayName, email: mail, notes: input.notes.trim() };
    if (id) {
      const a = find(db.accounts, id, 'This account');
      if (a.role === 'owner' && clean.role !== 'owner' && db.accounts.filter((x) => x.role === 'owner' && x.active).length <= 1) throw new ValidationError('The studio needs at least one active owner account.');
      Object.assign(a, clean, { updatedAt: nowIso() });
      logActivity(db, 'Account updated', `${displayName} (${clean.role})`, '/accounts');
      return id;
    }
    const rec: UserAccount = { ...clean, ...stamp(), active: true, lastActiveAt: '' };
    db.accounts.push(rec);
    logActivity(db, 'Account created', `${displayName} (${clean.role})`, '/accounts');
    return rec.id;
  });
}

export function setAccountActive(id: ID, active: boolean) {
  commit((db) => {
    const a = find(db.accounts, id, 'This account');
    if (!active && a.role === 'owner' && db.accounts.filter((x) => x.role === 'owner' && x.active).length <= 1) throw new ValidationError('You cannot deactivate the only owner account.');
    a.active = active;
    a.updatedAt = nowIso();
    logActivity(db, active ? 'Account reactivated' : 'Account deactivated', a.displayName, '/accounts');
  });
}

export function deleteAccount(id: ID) {
  commit((db) => {
    const a = find(db.accounts, id, 'This account');
    if (a.role === 'owner' && db.accounts.filter((x) => x.role === 'owner').length <= 1) throw new ValidationError('You cannot delete the only owner account.');
    db.accounts = db.accounts.filter((x) => x.id !== id);
    logActivity(db, 'Account deleted', a.displayName, '/accounts');
  });
}

export function touchAccount(id: ID) {
  commit((db) => {
    const a = db.accounts.find((x) => x.id === id);
    if (a) a.lastActiveAt = nowIso();
  });
}

/* ------------------------------------------------------------ families */

export type FamilyInput = Pick<Family, 'name' | 'address' | 'city' | 'state' | 'zip' | 'status' | 'notes'>;

export function saveFamily(input: FamilyInput, id?: ID): ID {
  const name = required(input.name, 'Family name');
  const clean = { ...input, name, address: input.address.trim(), city: input.city.trim(), state: input.state.trim(), zip: input.zip.trim(), notes: input.notes.trim() };
  return commit((db) => {
    if (id) {
      Object.assign(find(db.families, id, 'This family'), clean, { updatedAt: nowIso() });
      logActivity(db, 'Family updated', name, `/families/${id}`);
      return id;
    }
    const rec: Family = { ...clean, ...stamp() };
    db.families.push(rec);
    logActivity(db, 'Family added', name, `/families/${rec.id}`);
    return rec.id;
  });
}

/** Delete a family; its dancers are kept (unlinked) and parent logins are deactivated. */
export function deleteFamily(id: ID) {
  commit((db) => {
    const f = find(db.families, id, 'This family');
    const guardianIds = new Set(db.guardians.filter((g) => g.familyId === id).map((g) => g.id));
    for (const d of db.dancers) if (d.familyId === id) d.familyId = null;
    for (const a of db.accounts) if (a.guardianId && guardianIds.has(a.guardianId)) {
      a.guardianId = null;
      a.active = false;
    }
    db.families = db.families.filter((x) => x.id !== id);
    db.guardians = db.guardians.filter((g) => g.familyId !== id);
    db.emergencyContacts = db.emergencyContacts.filter((c) => c.familyId !== id);
    for (const n of db.notices) n.familyIds = n.familyIds.filter((x) => x !== id);
    logActivity(db, 'Family deleted', f.name);
  });
}

export type GuardianInput = Omit<Guardian, 'id' | 'createdAt' | 'updatedAt' | 'isSample'>;

export function saveGuardian(input: GuardianInput, id?: ID): ID {
  const firstName = required(input.firstName, 'First name');
  const mail = email(input.email);
  const phone = input.phone.trim();
  if (phone && phone.replace(/\D/g, '').length < 7) throw new ValidationError('Phone number looks too short.');
  return commit((db) => {
    find(db.families, input.familyId, 'The family');
    const clean = { ...input, firstName, lastName: input.lastName.trim(), relationship: input.relationship.trim(), email: mail, phone };
    let gid = id;
    if (id) Object.assign(find(db.guardians, id, 'This parent/guardian'), clean, { updatedAt: nowIso() });
    else {
      const rec: Guardian = { ...clean, ...stamp() };
      if (!db.guardians.some((g) => g.familyId === input.familyId)) rec.isPrimary = true;
      db.guardians.push(rec);
      gid = rec.id;
    }
    if (clean.isPrimary) for (const g of db.guardians) if (g.familyId === input.familyId && g.id !== gid) g.isPrimary = false;
    logActivity(db, id ? 'Parent/guardian updated' : 'Parent/guardian added', `${firstName} ${clean.lastName}`, `/families/${input.familyId}`);
    return gid!;
  });
}

export function deleteGuardian(id: ID) {
  commit((db) => {
    const g = find(db.guardians, id, 'This parent/guardian');
    db.guardians = db.guardians.filter((x) => x.id !== id);
    for (const a of db.accounts) if (a.guardianId === id) {
      a.guardianId = null;
      a.active = false;
    }
    const rest = db.guardians.filter((x) => x.familyId === g.familyId);
    if (g.isPrimary && rest.length) rest[0].isPrimary = true;
    logActivity(db, 'Parent/guardian removed', `${g.firstName} ${g.lastName}`, `/families/${g.familyId}`);
  });
}

export type EmergencyInput = Omit<EmergencyContact, 'id' | 'createdAt' | 'updatedAt' | 'isSample'>;

export function saveEmergencyContact(input: EmergencyInput, id?: ID): ID {
  const name = required(input.name, 'Contact name');
  const phone = required(input.phone, 'Phone number');
  return commit((db) => {
    find(db.families, input.familyId, 'The family');
    const clean = { ...input, name, phone, relationship: input.relationship.trim(), notes: input.notes.trim() };
    if (id) {
      Object.assign(find(db.emergencyContacts, id, 'This contact'), clean, { updatedAt: nowIso() });
      return id;
    }
    const rec: EmergencyContact = { ...clean, ...stamp() };
    db.emergencyContacts.push(rec);
    return rec.id;
  });
}

export function deleteEmergencyContact(id: ID) {
  commit((db) => {
    db.emergencyContacts = db.emergencyContacts.filter((c) => c.id !== id);
  });
}

export function setDancersFamily(dancerIds: ID[], familyId: ID | null) {
  commit((db) => {
    if (familyId) find(db.families, familyId, 'The family');
    for (const id of dancerIds) {
      const d = find(db.dancers, id, 'A dancer');
      d.familyId = familyId;
      d.updatedAt = nowIso();
    }
    logActivity(db, 'Dancers linked to family', `${dancerIds.length} dancer(s)`, familyId ? `/families/${familyId}` : '');
  });
}

/* ---------------------------------------------------------------- staff */

export type StaffInput = Omit<StaffMember, 'id' | 'createdAt' | 'updatedAt' | 'isSample'>;

export function saveStaff(input: StaffInput, id?: ID): ID {
  const firstName = required(input.firstName, 'First name');
  const lastName = required(input.lastName, 'Last name');
  const mail = email(input.email);
  if (!Number.isFinite(Number(input.payRate)) || Number(input.payRate) < 0) throw new ValidationError('Pay rate must be 0 or more.');
  const clean: StaffInput = { ...input, firstName, lastName, email: mail, phone: input.phone.trim(), hireDate: date(input.hireDate, 'Hire date'), payRate: Number(input.payRate), styles: [...new Set(input.styles.map((s) => s.trim()).filter(Boolean))] };
  return commit((db) => {
    if (id) {
      const s = find(db.staff, id, 'This staff member');
      if (s.payRate !== clean.payRate || s.payType !== clean.payType) logActivity(db, 'Pay rate changed', `${firstName} ${lastName}: ${s.payType} ${s.payRate} → ${clean.payType} ${clean.payRate}`, `/staff/${id}`);
      Object.assign(s, clean, { updatedAt: nowIso() });
      logActivity(db, 'Staff updated', `${firstName} ${lastName}`, `/staff/${id}`);
      return id;
    }
    const rec: StaffMember = { ...clean, ...stamp() };
    db.staff.push(rec);
    logActivity(db, 'Staff added', `${firstName} ${lastName} (${clean.position})`, `/staff/${rec.id}`);
    return rec.id;
  });
}

export function setStaffStatus(id: ID, status: StaffMember['status']) {
  commit((db) => {
    const s = find(db.staff, id, 'This staff member');
    s.status = status;
    s.updatedAt = nowIso();
    if (status === 'inactive') for (const a of db.accounts) if (a.staffId === id) a.active = false;
    logActivity(db, status === 'active' ? 'Staff reactivated' : 'Staff deactivated', staffName(s), `/staff/${id}`);
  });
}

/** Delete a staff member: classes become unassigned; hours history is kept. */
export function deleteStaff(id: ID) {
  commit((db) => {
    const s = find(db.staff, id, 'This staff member');
    for (const c of db.classes) {
      if (c.teacherId === id) c.teacherId = null;
      if (c.assistantId === id) c.assistantId = null;
    }
    for (const ch of db.sessionChanges) if (ch.substituteId === id) ch.substituteId = null;
    for (const a of db.accounts) if (a.staffId === id) {
      a.staffId = null;
      a.active = false;
    }
    db.staff = db.staff.filter((x) => x.id !== id);
    logActivity(db, 'Staff deleted', staffName(s));
  });
}

/* --------------------------------------------------------- school years */

export type SchoolYearInput = Omit<SchoolYear, 'id' | 'createdAt' | 'updatedAt' | 'isSample'>;

export function saveSchoolYear(input: SchoolYearInput, id?: ID): ID {
  const name = required(input.name, 'School year name');
  const startDate = date(input.startDate, 'Start date', false);
  const endDate = date(input.endDate, 'End date', false);
  if (endDate <= startDate) throw new ValidationError('The end date must be after the start date.');
  const registrationStart = date(input.registrationStart, 'Registration opens');
  const registrationEnd = date(input.registrationEnd, 'Registration closes');
  if (registrationStart && registrationEnd && registrationEnd < registrationStart) throw new ValidationError('Registration must close after it opens.');
  return commit((db) => {
    if (db.schoolYears.some((y) => y.id !== id && y.name.toLowerCase() === name.toLowerCase())) throw new ValidationError(`There is already a school year named ${name}.`);
    const clean = { ...input, name, startDate, endDate, registrationStart, registrationEnd };
    let yid = id;
    if (id) Object.assign(find(db.schoolYears, id, 'This school year'), clean, { updatedAt: nowIso() });
    else {
      const rec: SchoolYear = { ...clean, ...stamp() };
      db.schoolYears.push(rec);
      yid = rec.id;
    }
    if (clean.status === 'current') for (const y of db.schoolYears) if (y.id !== yid && y.status === 'current') y.status = 'planning';
    logActivity(db, id ? 'School year updated' : 'School year created', name, '/school-years');
    return yid!;
  });
}

export function setSchoolYearStatus(id: ID, status: SchoolYear['status']) {
  commit((db) => {
    const y = find(db.schoolYears, id, 'This school year');
    if (status === 'current') for (const o of db.schoolYears) if (o.status === 'current') o.status = 'planning';
    y.status = status;
    y.updatedAt = nowIso();
    logActivity(db, status === 'archived' ? 'School year archived' : status === 'current' ? 'School year set as current' : 'School year updated', y.name, '/school-years');
  });
}

export function deleteSchoolYear(id: ID) {
  commit((db) => {
    const y = find(db.schoolYears, id, 'This school year');
    if (db.classes.some((c) => c.schoolYearId === id)) throw new ValidationError('This school year has classes. Archive it instead so its history is kept.');
    db.schoolYears = db.schoolYears.filter((x) => x.id !== id);
    for (const e of db.studioEvents) if (e.schoolYearId === id) e.schoolYearId = null;
    logActivity(db, 'School year deleted', y.name);
  });
}

/** Copy every class (not enrollments) from one school year into another. */
export function copyClassesToYear(fromYearId: ID, toYearId: ID): number {
  if (fromYearId === toYearId) throw new ValidationError('Choose a different school year to copy from.');
  return commit((db) => {
    find(db.schoolYears, toYearId, 'The school year');
    const src = db.classes.filter((c) => c.schoolYearId === fromYearId);
    if (!src.length) throw new ValidationError('That school year has no classes to copy.');
    for (const c of src) db.classes.push({ ...c, ...stamp(), isSample: false, schoolYearId: toYearId, startDate: '', endDate: '' });
    logActivity(db, 'Classes copied', `${src.length} classes into ${db.schoolYears.find((y) => y.id === toYearId)?.name}`, '/classes');
    return src.length;
  });
}

/* ---------------------------------------------------------- classrooms */

export function saveClassroom(input: Pick<Classroom, 'name' | 'capacity' | 'notes'>, id?: ID): ID {
  const name = required(input.name, 'Classroom name');
  return commit((db) => {
    if (db.classrooms.some((r) => r.id !== id && r.name.toLowerCase() === name.toLowerCase())) throw new ValidationError(`There is already a classroom named ${name}.`);
    const clean = { name, capacity: Math.max(0, Math.floor(Number(input.capacity) || 0)), notes: input.notes.trim() };
    if (id) {
      Object.assign(find(db.classrooms, id, 'This classroom'), clean, { updatedAt: nowIso() });
      return id;
    }
    const rec: Classroom = { ...clean, ...stamp() };
    db.classrooms.push(rec);
    return rec.id;
  });
}

export function deleteClassroom(id: ID) {
  commit((db) => {
    for (const c of db.classes) if (c.classroomId === id) c.classroomId = null;
    for (const e of db.studioEvents) if (e.classroomId === id) e.classroomId = null;
    for (const ch of db.sessionChanges) if (ch.newClassroomId === id) ch.newClassroomId = null;
    db.classrooms = db.classrooms.filter((r) => r.id !== id);
  });
}

/* -------------------------------------------------------------- classes */

export type ClassInput = Omit<DanceClass, 'id' | 'createdAt' | 'updatedAt' | 'isSample'>;

export class ConflictError extends ValidationError {
  constructor(public conflicts: string[]) {
    super(`Scheduling conflict: ${conflicts.join(' ')}`);
  }
}

export function saveClass(input: ClassInput, id?: ID, opts: { allowConflicts?: boolean } = {}): ID {
  const name = required(input.name, 'Class name');
  if (!input.schoolYearId) throw new ValidationError('Choose a school year.');
  const startTime = time(input.startTime, 'Start time');
  const endTime = time(input.endTime, 'End time');
  if (endTime <= startTime) throw new ValidationError('The class must end after it starts.');
  if (!(input.dayOfWeek >= 0 && input.dayOfWeek <= 6)) throw new ValidationError('Choose a day of the week.');
  if (input.ageMin !== null && input.ageMax !== null && input.ageMax < input.ageMin) throw new ValidationError('Maximum age must be at least the minimum age.');
  const max = Math.floor(Number(input.maxEnrollment));
  if (!(max >= 1)) throw new ValidationError('Maximum enrollment must be at least 1.');
  if (Number(input.tuition) < 0) throw new ValidationError('Tuition cannot be negative.');
  const clean: ClassInput = { ...input, name, startTime, endTime, maxEnrollment: max, tuition: Number(input.tuition) || 0, startDate: date(input.startDate, 'Start date'), endDate: date(input.endDate, 'End date'), description: input.description.trim(), notes: input.notes.trim() };
  return commit((db) => {
    find(db.schoolYears, clean.schoolYearId, 'The school year');
    const conflicts = classConflicts(db, clean, id);
    if (conflicts.length && !opts.allowConflicts) throw new ConflictError(conflicts);
    if (id) {
      const c = find(db.classes, id, 'This class');
      const scheduleChanged = c.dayOfWeek !== clean.dayOfWeek || c.startTime !== clean.startTime || c.endTime !== clean.endTime || c.classroomId !== clean.classroomId || c.teacherId !== clean.teacherId;
      Object.assign(c, clean, { updatedAt: nowIso() });
      if (scheduleChanged) {
        const room = db.classrooms.find((r) => r.id === c.classroomId)?.name;
        noticeForClass(db, c, 'schedule', `Schedule change: ${c.name}`, `${c.name} now meets ${WEEKDAY_NAMES[c.dayOfWeek]}s ${prettyTime(c.startTime)}–${prettyTime(c.endTime)}${room ? ` in ${room}` : ''}${c.teacherId ? ` with ${staffName(staffById(db, c.teacherId))}` : ''}.`);
      }
      logActivity(db, conflicts.length ? 'Class updated (conflict overridden)' : 'Class updated', `${name}${conflicts.length ? ` — ${conflicts.join(' ')}` : ''}`, `/classes/${id}`);
      return id;
    }
    const rec: DanceClass = { ...clean, ...stamp() };
    db.classes.push(rec);
    logActivity(db, conflicts.length ? 'Class added (conflict overridden)' : 'Class added', name, `/classes/${rec.id}`);
    return rec.id;
  });
}

export function duplicateClass(id: ID): ID {
  return commit((db) => {
    const c = find(db.classes, id, 'This class');
    const copy: DanceClass = { ...c, ...stamp(), isSample: false, name: `${c.name} (copy)`, classroomId: null, teacherId: null, assistantId: null };
    db.classes.push(copy);
    logActivity(db, 'Class duplicated', c.name, `/classes/${copy.id}`);
    return copy.id;
  });
}

/** Delete a class. Classes with attendance history cannot be deleted (history is never lost). */
export function deleteClass(id: ID) {
  commit((db) => {
    const c = find(db.classes, id, 'This class');
    if (db.attendance.some((a) => a.classId === id)) throw new ValidationError('This class has attendance history and cannot be deleted. Archive its school year to keep the record.');
    db.classes = db.classes.filter((x) => x.id !== id);
    db.enrollments = db.enrollments.filter((e) => e.classId !== id);
    db.sessionChanges = db.sessionChanges.filter((s) => s.classId !== id);
    for (const t of db.timeEntries) if (t.classId === id) t.classId = null;
    for (const n of db.notices) if (n.classId === id) n.classId = null;
    logActivity(db, 'Class deleted', c.name);
  });
}

/* ---------------------------------------------------------- enrollment */

/** Enroll dancers; once a class is full, extra dancers go on its waiting list (unless override). */
export function enrollDancers(classId: ID, dancerIds: ID[], opts: { overrideCapacity?: boolean } = {}) {
  return commit((db) => {
    const c = find(db.classes, classId, 'This class');
    let count = enrolledDancerIds(db, classId).length;
    const result = { enrolled: 0, waitlisted: 0 };
    for (const dancerId of dancerIds) {
      const d = find(db.dancers, dancerId, 'A dancer');
      const existing = db.enrollments.find((e) => e.classId === classId && e.dancerId === dancerId);
      if (existing?.status === 'enrolled') continue;
      const full = count >= c.maxEnrollment && !opts.overrideCapacity;
      const status = full ? 'waitlist' : 'enrolled';
      if (existing) Object.assign(existing, { status, enrolledOn: todayStr(), droppedOn: '', updatedAt: nowIso() });
      else db.enrollments.push({ ...stamp(), classId, dancerId, status, enrolledOn: todayStr(), droppedOn: '' });
      if (status === 'enrolled') {
        count += 1;
        result.enrolled += 1;
        if (!d.enrollmentStatus || d.enrollmentStatus === 'prospective') d.enrollmentStatus = 'active';
        if (!d.enrollmentDate) d.enrollmentDate = todayStr();
      } else result.waitlisted += 1;
    }
    logActivity(db, 'Enrollment', `${c.name}: ${result.enrolled} enrolled${result.waitlisted ? `, ${result.waitlisted} waitlisted` : ''}`, `/classes/${classId}`);
    return result;
  });
}

export function dropDancers(classId: ID, dancerIds: ID[]) {
  commit((db) => {
    const c = find(db.classes, classId, 'This class');
    for (const e of db.enrollments) {
      if (e.classId === classId && dancerIds.includes(e.dancerId) && e.status !== 'dropped') {
        e.status = 'dropped';
        e.droppedOn = todayStr();
        e.updatedAt = nowIso();
      }
    }
    logActivity(db, 'Removed from class', `${dancerIds.length} dancer(s) from ${c.name}`, `/classes/${classId}`);
  });
}

export function moveDancers(fromClassId: ID, toClassId: ID, dancerIds: ID[], opts: { overrideCapacity?: boolean } = {}) {
  if (fromClassId === toClassId) throw new ValidationError('Choose a different class.');
  return commit((db) => {
    const to = find(db.classes, toClassId, 'The destination class');
    const room = to.maxEnrollment - enrolledDancerIds(db, toClassId).length;
    const incoming = dancerIds.filter((d) => !enrolledDancerIds(db, toClassId).includes(d));
    if (incoming.length > room && !opts.overrideCapacity) throw new ValidationError(`${to.name} only has ${Math.max(0, room)} open spot(s).`);
    for (const e of db.enrollments) if (e.classId === fromClassId && dancerIds.includes(e.dancerId) && e.status !== 'dropped') Object.assign(e, { status: 'dropped', droppedOn: todayStr(), updatedAt: nowIso() });
    for (const dancerId of incoming) {
      const existing = db.enrollments.find((e) => e.classId === toClassId && e.dancerId === dancerId);
      if (existing) Object.assign(existing, { status: 'enrolled', enrolledOn: todayStr(), droppedOn: '', updatedAt: nowIso() });
      else db.enrollments.push({ ...stamp(), classId: toClassId, dancerId, status: 'enrolled', enrolledOn: todayStr(), droppedOn: '' });
    }
    logActivity(db, 'Dancers moved', `${dancerIds.length} dancer(s) to ${to.name}`, `/classes/${toClassId}`);
    return incoming.length;
  });
}

export function promoteFromWaitlist(classId: ID, dancerId: ID, opts: { overrideCapacity?: boolean } = {}) {
  commit((db) => {
    const c = find(db.classes, classId, 'This class');
    if (enrolledDancerIds(db, classId).length >= c.maxEnrollment && !opts.overrideCapacity) throw new ValidationError(`${c.name} is full.`);
    const e = db.enrollments.find((x) => x.classId === classId && x.dancerId === dancerId && x.status === 'waitlist');
    if (!e) throw new ValidationError('That dancer is not on the waiting list.');
    Object.assign(e, { status: 'enrolled', enrolledOn: todayStr(), updatedAt: nowIso() });
    logActivity(db, 'Moved off waiting list', `${db.dancers.find((d) => d.id === dancerId)?.firstName ?? 'Dancer'} into ${c.name}`, `/classes/${classId}`);
  });
}

/* ------------------------------------------------------------- calendar */

export type StudioEventInput = Omit<StudioEvent, 'id' | 'createdAt' | 'updatedAt' | 'isSample'>;

export function saveStudioEvent(input: StudioEventInput, id?: ID): ID {
  const title = required(input.title, 'Title');
  const startDate = date(input.startDate, 'Date', false);
  const endDate = date(input.endDate || input.startDate, 'End date', false);
  if (endDate < startDate) throw new ValidationError('End date cannot be before the start date.');
  if (!input.allDay) {
    time(input.startTime, 'Start time');
    time(input.endTime, 'End time');
    if (input.endTime <= input.startTime) throw new ValidationError('End time must be after the start time.');
  }
  return commit((db) => {
    const clean = { ...input, title, startDate, endDate, location: input.location.trim(), notes: input.notes.trim() };
    let eid = id;
    const before = id ? { ...find(db.studioEvents, id, 'This calendar entry') } : null;
    if (id) Object.assign(find(db.studioEvents, id, 'This calendar entry'), clean, { updatedAt: nowIso() });
    else {
      const rec: StudioEvent = { ...clean, ...stamp() };
      db.studioEvents.push(rec);
      eid = rec.id;
    }
    // Tell affected teachers & families when a closure cancels classes.
    const newlyCancels = clean.cancelsClasses && (!before || !before.cancelsClasses || before.startDate !== startDate || before.endDate !== endDate);
    if (newlyCancels) {
      const affected = new Map<ID, DanceClass>();
      for (const o of occurrencesBetween(db, startDate, endDate, { includeCancelled: true })) if (o.cancelReason === title) affected.set(o.classId, o.cls);
      const when = startDate === endDate ? prettyDate(startDate) : `${prettyDate(startDate)} – ${prettyDate(endDate)}`;
      for (const c of affected.values()) noticeForClass(db, c, 'cancellation', `${c.name} cancelled: ${title}`, `${c.name} will not meet ${when} (${title}).`);
    }
    logActivity(db, id ? 'Calendar entry updated' : 'Calendar entry added', `${title} (${fmtDate(startDate)}${endDate !== startDate ? ` – ${fmtDate(endDate)}` : ''})`, '/calendar');
    return eid!;
  });
}

export function deleteStudioEvent(id: ID) {
  commit((db) => {
    const e = find(db.studioEvents, id, 'This calendar entry');
    db.studioEvents = db.studioEvents.filter((x) => x.id !== id);
    logActivity(db, 'Calendar entry deleted', e.title, '/calendar');
  });
}

function upsertChange(db: Database, classId: ID, date: string) {
  let ch = db.sessionChanges.find((c) => c.classId === classId && c.date === date);
  if (!ch) {
    ch = { ...stamp(), classId, date, cancelled: false, newDate: '', newStartTime: '', newEndTime: '', newClassroomId: null, substituteId: null, reason: '' };
    db.sessionChanges.push(ch);
  }
  return ch;
}

export function cancelSession(classId: ID, originalDate: string, reason: string) {
  commit((db) => {
    const c = find(db.classes, classId, 'This class');
    const ch = upsertChange(db, classId, originalDate);
    ch.cancelled = true;
    ch.reason = reason.trim() || 'Cancelled';
    ch.updatedAt = nowIso();
    const actual = ch.newDate || originalDate;
    noticeForClass(db, c, 'cancellation', `${c.name} cancelled ${prettyDate(actual)}`, `${c.name} on ${prettyDate(actual)} is cancelled${reason.trim() ? `: ${reason.trim()}` : '.'}`, [ch.substituteId]);
    logActivity(db, 'Class cancelled', `${c.name} on ${fmtDate(actual)}${reason.trim() ? ` — ${reason.trim()}` : ''}`, '/calendar');
  });
}

/** Undo every change to one occurrence (un-cancel, un-move, remove substitute). */
export function restoreSession(classId: ID, originalDate: string) {
  commit((db) => {
    const c = find(db.classes, classId, 'This class');
    const ch = db.sessionChanges.find((x) => x.classId === classId && x.date === originalDate);
    if (!ch) return;
    db.sessionChanges = db.sessionChanges.filter((x) => x !== ch);
    noticeForClass(db, c, 'schedule', `${c.name} back to its regular time ${prettyDate(originalDate)}`, `${c.name} meets as usual on ${prettyDate(originalDate)}, ${prettyTime(c.startTime)}–${prettyTime(c.endTime)}.`);
    logActivity(db, 'Class restored', `${c.name} on ${fmtDate(originalDate)}`, '/calendar');
  });
}

export interface RescheduleInput {
  newDate: string;
  newStartTime: string;
  newEndTime: string;
  newClassroomId: ID | null;
  substituteId: ID | null;
  reason: string;
}

/** Move one occurrence and/or assign a substitute, with conflict checks. */
export function rescheduleSession(classId: ID, originalDate: string, input: RescheduleInput, opts: { allowConflicts?: boolean } = {}) {
  date(input.newDate, 'New date', false);
  time(input.newStartTime, 'Start time');
  time(input.newEndTime, 'End time');
  if (input.newEndTime <= input.newStartTime) throw new ValidationError('The class must end after it starts.');
  commit((db) => {
    const c = find(db.classes, classId, 'This class');
    if (input.substituteId) find(db.staff, input.substituteId, 'The substitute');
    const conflicts = occurrenceConflicts(db, {
      key: `${classId}:${originalDate}`,
      date: input.newDate,
      start: input.newStartTime,
      end: input.newEndTime,
      classroomId: input.newClassroomId,
      teacherId: input.substituteId || c.teacherId,
      assistantId: c.assistantId,
    });
    if (conflicts.length && !opts.allowConflicts) throw new ConflictError(conflicts);
    const ch = upsertChange(db, classId, originalDate);
    const sameAsRegular = input.newDate === originalDate && input.newStartTime === c.startTime && input.newEndTime === c.endTime && input.newClassroomId === c.classroomId && !input.substituteId;
    if (sameAsRegular && !ch.cancelled) {
      db.sessionChanges = db.sessionChanges.filter((x) => x !== ch);
    } else {
      Object.assign(ch, {
        cancelled: false,
        newDate: input.newDate === originalDate ? '' : input.newDate,
        newStartTime: input.newStartTime === c.startTime ? '' : input.newStartTime,
        newEndTime: input.newEndTime === c.endTime ? '' : input.newEndTime,
        newClassroomId: input.newClassroomId === c.classroomId ? null : input.newClassroomId,
        substituteId: input.substituteId,
        reason: input.reason.trim(),
        updatedAt: nowIso(),
      });
    }
    const room = db.classrooms.find((r) => r.id === input.newClassroomId)?.name;
    const sub = input.substituteId ? staffName(staffById(db, input.substituteId)) : '';
    noticeForClass(
      db,
      c,
      'schedule',
      `${c.name}: change on ${prettyDate(originalDate)}`,
      `${c.name} (normally ${prettyDate(originalDate)}) will meet ${prettyDate(input.newDate)}, ${prettyTime(input.newStartTime)}–${prettyTime(input.newEndTime)}${room ? ` in ${room}` : ''}${sub ? `, taught by ${sub}` : ''}.${input.reason.trim() ? ` ${input.reason.trim()}` : ''}`,
      [input.substituteId],
    );
    logActivity(db, conflicts.length ? 'Class rescheduled (conflict overridden)' : 'Class rescheduled', `${c.name}: ${fmtDate(originalDate)} → ${fmtDate(input.newDate)} ${fmtClock(input.newStartTime)}${sub ? ` (sub: ${sub})` : ''}`, '/calendar');
  });
}

/* ----------------------------------------------------------- attendance */

export function saveAttendance(classId: ID, sessionDate: string, rows: { dancerId: ID; status: AttendanceStatus; note: string }[]) {
  date(sessionDate, 'Class date', false);
  return commit((db) => {
    const c = find(db.classes, classId, 'This class');
    const who = actorName();
    let changed = 0;
    for (const r of rows) {
      find(db.dancers, r.dancerId, 'A dancer');
      const existing = db.attendance.find((a) => a.classId === classId && a.date === sessionDate && a.dancerId === r.dancerId);
      if (existing) {
        if (existing.status !== r.status || existing.note !== r.note.trim()) {
          Object.assign(existing, { status: r.status, note: r.note.trim(), takenBy: who, updatedAt: nowIso() });
          changed += 1;
        }
      } else {
        db.attendance.push({ ...stamp(), classId, date: sessionDate, dancerId: r.dancerId, status: r.status, note: r.note.trim(), takenBy: who });
        changed += 1;
      }
    }
    if (changed) logActivity(db, 'Attendance taken', `${c.name} on ${fmtDate(sessionDate)} (${rows.length} dancers)`, `/attendance?class=${classId}&date=${sessionDate}`);
    return changed;
  });
}

/* ------------------------------------------------------- hours & payroll */

export type TimeEntryInput = Pick<TimeEntry, 'staffId' | 'date' | 'kind' | 'classId' | 'hours' | 'description'> & { scheduledHours?: number };

function checkHours(h: number) {
  if (!Number.isFinite(h) || h <= 0 || h > 24) throw new ValidationError('Hours must be more than 0 and no more than 24.');
  return Math.round(h * 100) / 100;
}

/** Teachers (or managers) submit hours; they start as pending approval. */
export function submitHours(input: TimeEntryInput): ID {
  const hours = checkHours(Number(input.hours));
  date(input.date, 'Date worked', false);
  return commit((db) => {
    const s = find(db.staff, input.staffId, 'The staff member');
    if (input.classId) find(db.classes, input.classId, 'The class');
    const who = actorName();
    const rec: TimeEntry = {
      ...stamp(),
      staffId: s.id,
      date: input.date,
      kind: input.kind,
      classId: input.classId,
      scheduledHours: input.scheduledHours ?? 0,
      hours,
      rate: s.payType === 'hourly' ? s.payRate : 0,
      description: input.description.trim(),
      status: 'pending',
      submittedBy: who,
      reviewedBy: '',
      reviewedAt: '',
      reviewNote: '',
      history: [{ at: nowIso(), by: who, change: `Submitted ${hours} h` }],
    };
    db.timeEntries.push(rec);
    logActivity(db, 'Hours submitted', `${staffName(s)}: ${hours} h on ${fmtDate(input.date)}`, '/hours');
    return rec.id;
  });
}

export function reviewHours(ids: ID[], decision: 'approved' | 'rejected', note: string) {
  if (decision === 'rejected' && !note.trim()) throw new ValidationError('Add a short reason when rejecting hours.');
  commit((db) => {
    const who = actorName();
    for (const id of ids) {
      const e = find(db.timeEntries, id, 'A time entry');
      e.status = decision;
      e.reviewedBy = who;
      e.reviewedAt = nowIso();
      e.reviewNote = note.trim();
      e.history.push({ at: e.reviewedAt, by: who, change: `${decision === 'approved' ? 'Approved' : 'Rejected'}${note.trim() ? `: ${note.trim()}` : ''}` });
    }
    logActivity(db, decision === 'approved' ? 'Hours approved' : 'Hours rejected', `${ids.length} entr${ids.length === 1 ? 'y' : 'ies'}`, '/hours');
  });
}

/** Edit an entry. Changes to approved hours need a reason and are kept in the audit trail. */
export function editTimeEntry(id: ID, patch: Partial<Pick<TimeEntry, 'hours' | 'date' | 'kind' | 'description' | 'rate' | 'classId'>>, reason: string) {
  commit((db) => {
    const e = find(db.timeEntries, id, 'This time entry');
    if (e.status === 'approved' && !reason.trim()) throw new ValidationError('Give a reason for changing approved hours.');
    const changes: string[] = [];
    if (patch.hours !== undefined && checkHours(Number(patch.hours)) !== e.hours) changes.push(`hours ${e.hours} → ${checkHours(Number(patch.hours))}`);
    if (patch.date !== undefined && patch.date !== e.date) changes.push(`date ${fmtDate(e.date)} → ${fmtDate(date(patch.date, 'Date', false))}`);
    if (patch.kind !== undefined && patch.kind !== e.kind) changes.push(`type ${e.kind} → ${patch.kind}`);
    if (patch.rate !== undefined && Number(patch.rate) !== e.rate) {
      if (Number(patch.rate) < 0) throw new ValidationError('Rate cannot be negative.');
      changes.push(`rate ${e.rate} → ${Number(patch.rate)}`);
    }
    if (patch.description !== undefined && patch.description.trim() !== e.description) changes.push('description');
    if (patch.classId !== undefined && patch.classId !== e.classId) changes.push('class');
    if (!changes.length) return;
    Object.assign(e, patch, { hours: patch.hours !== undefined ? checkHours(Number(patch.hours)) : e.hours, rate: patch.rate !== undefined ? Number(patch.rate) : e.rate, description: patch.description?.trim() ?? e.description, updatedAt: nowIso() });
    e.history.push({ at: nowIso(), by: actorName(), change: `Edited: ${changes.join(', ')}${reason.trim() ? ` — ${reason.trim()}` : ''}` });
    logActivity(db, e.status === 'approved' ? 'Approved hours adjusted' : 'Hours edited', `${staffName(staffById(db, e.staffId))} ${fmtDate(e.date)}: ${changes.join(', ')}`, '/hours');
  });
}

export function deleteTimeEntry(id: ID) {
  commit((db) => {
    const e = find(db.timeEntries, id, 'This time entry');
    if (e.status === 'approved') throw new ValidationError('Approved hours cannot be deleted. Edit them (with a reason) instead.');
    db.timeEntries = db.timeEntries.filter((x) => x.id !== id);
    logActivity(db, 'Hours deleted', `${staffName(staffById(db, e.staffId))} ${fmtDate(e.date)} ${e.hours} h`, '/hours');
  });
}

/**
 * Create pending "class taught" entries from the schedule for classes that
 * met between `from` and `to` (and not in the future). Existing entries are skipped.
 */
export function generateClassHours(from: string, to: string, staffId?: ID): number {
  date(from, 'From', false);
  date(to, 'To', false);
  return commit((db) => {
    const last = to < todayStr() ? to : todayStr();
    let created = 0;
    for (const o of occurrencesBetween(db, from, last)) {
      const people: { id: ID; kind: TimeEntry['kind'] }[] = [];
      if (o.teacherId) people.push({ id: o.teacherId, kind: o.substituted ? 'substitute' : 'class' });
      if (o.assistantId) people.push({ id: o.assistantId, kind: 'class' });
      for (const p of people) {
        if (staffId && p.id !== staffId) continue;
        const s = staffById(db, p.id);
        if (!s || s.status !== 'active') continue;
        if (db.timeEntries.some((e) => e.staffId === p.id && e.classId === o.classId && e.date === o.date && (e.kind === 'class' || e.kind === 'substitute'))) continue;
        const hrs = Math.round(durationHours(o.start, o.end) * 100) / 100;
        db.timeEntries.push({
          ...stamp(),
          staffId: p.id,
          date: o.date,
          kind: p.kind,
          classId: o.classId,
          scheduledHours: hrs,
          hours: hrs,
          rate: s.payType === 'hourly' ? s.payRate : 0,
          description: `${o.cls.name}${p.id === o.assistantId ? ' (assistant)' : ''}`,
          status: 'pending',
          submittedBy: 'From schedule',
          reviewedBy: '',
          reviewedAt: '',
          reviewNote: '',
          history: [{ at: nowIso(), by: actorName(), change: 'Created from the class schedule' }],
        });
        created += 1;
      }
    }
    logActivity(db, 'Hours generated from schedule', `${created} entries (${fmtDate(from)} – ${fmtDate(last)})`, '/hours');
    return created;
  });
}

/* -------------------------------------------- notices & announcements */

export function markNoticesRead(noticeIds: ID[], accountId: ID) {
  commit((db) => {
    for (const n of db.notices) if (noticeIds.includes(n.id) && !n.readBy.includes(accountId)) n.readBy.push(accountId);
  });
}

export type AnnouncementInput = Pick<Announcement, 'title' | 'body' | 'audience' | 'classId' | 'pinned'>;

export function saveAnnouncement(input: AnnouncementInput, id?: ID): ID {
  const title = required(input.title, 'Title');
  const body = required(input.body, 'Message');
  if (input.audience === 'class' && !input.classId) throw new ValidationError('Choose the class this announcement is for.');
  return commit((db) => {
    const clean = { ...input, title, body, classId: input.audience === 'class' ? input.classId : null };
    if (id) {
      Object.assign(find(db.announcements, id, 'This announcement'), clean, { updatedAt: nowIso() });
      return id;
    }
    const rec: Announcement = { ...clean, ...stamp(), author: actorName() };
    db.announcements.push(rec);
    logActivity(db, 'Announcement posted', title, '/');
    return rec.id;
  });
}

export function deleteAnnouncement(id: ID) {
  commit((db) => {
    db.announcements = db.announcements.filter((a) => a.id !== id);
  });
}

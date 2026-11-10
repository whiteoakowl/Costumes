import { beforeEach, describe, expect, it } from 'vitest';
import { emptyDatabase, getDb, normalizeDatabase, replaceDb, ValidationError } from '../src/data/store';
import * as A from '../src/data/actions';
import * as S from '../src/data/studioActions';
import { buildSampleData } from '../src/data/sample';
import { addDays, attendanceRate, classConflicts, occurrencesBetween, payPeriodFor, payrollSummary, permissionsOf, weekdayOf } from '../src/data/studio';
import { buildViewer } from '../src/lib/session';

beforeEach(() => replaceDb(emptyDatabase()));

const year = () => S.saveSchoolYear({ name: '2026–2027', startDate: '2026-09-07', endDate: '2027-06-12', registrationStart: '', registrationEnd: '', status: 'current', tuitionNotes: '', recitalInfo: '', notes: '' });
const teacher = (first: string, position: 'teacher' | 'assistant' | 'substitute' = 'teacher') =>
  S.saveStaff({ firstName: first, lastName: 'T', email: '', phone: '', address: '', emergencyContact: '', hireDate: '', position, title: '', styles: ['Ballet'], qualifications: '', payType: 'hourly', payRate: 30, status: 'active', notes: '' });
const room = (name: string) => S.saveClassroom({ name, capacity: 10, notes: '' });
const klass = (yearId: string, extra: Partial<S.ClassInput> = {}) =>
  S.saveClass({ schoolYearId: yearId, name: 'Ballet 1', style: 'Ballet', level: 'Level 1', ageMin: 6, ageMax: 8, dayOfWeek: 1, startTime: '16:00', endTime: '17:00', classroomId: null, teacherId: null, assistantId: null, maxEnrollment: 2, description: '', notes: '', tuition: 80, startDate: '', endDate: '', ...extra });
const dancer = (firstName: string) =>
  A.saveDancer({ firstName, lastName: 'D', birthday: '', clothingSize: '', costumeSize: '', shoeSize: '', level: '', pointe: false, notes: '' });

describe('families', () => {
  it('connects several parents and dancers; one primary parent', () => {
    const f = S.saveFamily({ name: 'Chen Family', address: '', city: '', state: '', zip: '', status: 'active', notes: '' });
    const mom = S.saveGuardian({ familyId: f, firstName: 'Mei', lastName: 'Chen', relationship: 'Mother', email: 'mei@example.com', phone: '555 123 4567', isPrimary: false, emailConsent: true, smsConsent: true });
    const dad = S.saveGuardian({ familyId: f, firstName: 'David', lastName: 'Chen', relationship: 'Father', email: '', phone: '', isPrimary: true, emailConsent: true, smsConsent: false });
    expect(getDb().guardians.find((g) => g.id === mom)!.isPrimary).toBe(false);
    expect(getDb().guardians.find((g) => g.id === dad)!.isPrimary).toBe(true);
    const a = dancer('Lily');
    const b = dancer('Zoe');
    S.setDancersFamily([a, b], f);
    expect(getDb().dancers.filter((d) => d.familyId === f)).toHaveLength(2);
    expect(() => S.saveGuardian({ familyId: f, firstName: 'X', lastName: '', relationship: '', email: 'bad', phone: '', isPrimary: false, emailConsent: false, smsConsent: false })).toThrow(/email/);
    S.deleteFamily(f);
    expect(getDb().dancers.every((d) => d.familyId === null)).toBe(true);
    expect(getDb().guardians).toHaveLength(0);
  });
});

describe('classes & scheduling', () => {
  it('blocks double-booking teachers and classrooms unless overridden', () => {
    const y = year();
    const t = teacher('Elena');
    const r = room('Studio A');
    klass(y, { teacherId: t, classroomId: r });
    expect(() => klass(y, { name: 'Ballet 2', startTime: '16:30', endTime: '17:30', teacherId: t })).toThrow(S.ConflictError);
    expect(() => klass(y, { name: 'Jazz', startTime: '16:30', endTime: '17:30', classroomId: r })).toThrow(/Studio A/);
    // Back-to-back is fine; another day is fine.
    klass(y, { name: 'Ballet 2', startTime: '17:00', endTime: '18:00', teacherId: t, classroomId: r });
    klass(y, { name: 'Ballet 3', dayOfWeek: 2, teacherId: t, classroomId: r });
    expect(getDb().classes).toHaveLength(3);
    S.saveClass({ ...getDb().classes[0], name: 'Override' }, undefined, { allowConflicts: true });
    expect(getDb().classes).toHaveLength(4);
    expect(classConflicts(getDb(), getDb().classes[0], getDb().classes[0].id).length).toBeGreaterThan(0);
  });

  it('generates weekly occurrences, skipping closures and cancelled dates, applying moves & subs', () => {
    const y = year();
    const t = teacher('Elena');
    const sub = teacher('Nina', 'substitute');
    const c = klass(y, { teacherId: t });
    const sept = occurrencesBetween(getDb(), '2026-09-01', '2026-09-30');
    expect(sept.map((o) => o.date)).toEqual(['2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28']);
    expect(sept.every((o) => weekdayOf(o.date) === 1)).toBe(true);
    S.saveStudioEvent({ title: 'Labor Day', type: 'holiday', startDate: '2026-09-07', endDate: '2026-09-07', allDay: true, startTime: '', endTime: '', classroomId: null, location: '', cancelsClasses: true, schoolYearId: y, notes: '' });
    S.cancelSession(c, '2026-09-14', 'Teacher sick');
    S.rescheduleSession(c, '2026-09-21', { newDate: '2026-09-23', newStartTime: '18:00', newEndTime: '19:00', newClassroomId: null, substituteId: sub, reason: '' });
    const after = occurrencesBetween(getDb(), '2026-09-01', '2026-09-30');
    expect(after.map((o) => o.date)).toEqual(['2026-09-23', '2026-09-28']);
    expect(after[0]).toMatchObject({ start: '18:00', teacherId: sub, substituted: true, moved: true });
    const all = occurrencesBetween(getDb(), '2026-09-01', '2026-09-30', { includeCancelled: true });
    expect(all.filter((o) => o.cancelled).map((o) => o.cancelReason)).toEqual(['Labor Day', 'Teacher sick']);
    S.restoreSession(c, '2026-09-14');
    expect(occurrencesBetween(getDb(), '2026-09-14', '2026-09-14')).toHaveLength(1);
    // moving onto a closure is a conflict
    expect(() => S.rescheduleSession(c, '2026-09-28', { newDate: '2026-09-07', newStartTime: '16:00', newEndTime: '17:00', newClassroomId: null, substituteId: null, reason: '' })).toThrow(/closed/);
    expect(getDb().notices.length).toBeGreaterThanOrEqual(3);
  });

  it('enrolls up to capacity, waitlists the rest, moves and promotes', () => {
    const y = year();
    const c = klass(y);
    const c2 = klass(y, { name: 'Ballet 1B', dayOfWeek: 3, maxEnrollment: 5 });
    const [a, b, d] = [dancer('A'), dancer('B'), dancer('C')];
    expect(S.enrollDancers(c, [a, b, d])).toEqual({ enrolled: 2, waitlisted: 1 });
    expect(() => S.promoteFromWaitlist(c, d)).toThrow(/full/);
    S.moveDancers(c, c2, [a]);
    S.promoteFromWaitlist(c, d);
    const enrolled = (id: string) => getDb().enrollments.filter((e) => e.classId === id && e.status === 'enrolled').map((e) => e.dancerId).sort();
    expect(enrolled(c)).toEqual([b, d].sort());
    expect(enrolled(c2)).toEqual([a]);
    S.dropDancers(c, [b]);
    expect(enrolled(c)).toEqual([d]);
    expect(getDb().dancers.find((x) => x.id === a)!.enrollmentStatus).toBe('active');
  });

  it('keeps attendance history: classes with attendance cannot be deleted', () => {
    const y = year();
    const c = klass(y);
    const a = dancer('A');
    S.enrollDancers(c, [a]);
    S.saveAttendance(c, '2026-09-07', [{ dancerId: a, status: 'late', note: '' }]);
    S.saveAttendance(c, '2026-09-07', [{ dancerId: a, status: 'present', note: 'fixed' }]);
    expect(getDb().attendance).toHaveLength(1);
    expect(getDb().attendance[0].status).toBe('present');
    expect(() => S.deleteClass(c)).toThrow(/attendance history/);
    expect(attendanceRate([{ status: 'present' }, { status: 'absent' }, { status: 'late' }, { status: 'makeup' }])).toBe(67);
    expect(() => S.deleteSchoolYear(y)).toThrow(/Archive/);
  });
});

describe('teacher hours & payroll', () => {
  it('generates hours from the schedule, approves, audits edits and summarises pay', () => {
    const y = year();
    const t = teacher('Elena');
    const asst = teacher('Olivia', 'assistant');
    klass(y, { teacherId: t, assistantId: asst });
    expect(S.generateClassHours('2026-09-01', '2026-09-30')).toBe(8); // 4 Mondays × 2 people
    expect(S.generateClassHours('2026-09-01', '2026-09-30')).toBe(0); // no duplicates
    const extra = S.submitHours({ staffId: t, date: '2026-09-10', kind: 'additional', classId: null, hours: 1.5, description: 'Fittings' });
    const all = getDb().timeEntries.map((e) => e.id);
    expect(() => S.reviewHours([extra], 'rejected', '')).toThrow(/reason/);
    S.reviewHours(all, 'approved', '');
    expect(() => S.editTimeEntry(extra, { hours: 2 }, '')).toThrow(/reason/);
    S.editTimeEntry(extra, { hours: 2 }, 'Stayed late');
    expect(getDb().timeEntries.find((e) => e.id === extra)!.history.at(-1)!.change).toContain('hours 1.5 → 2');
    expect(() => S.deleteTimeEntry(extra)).toThrow(/Approved/);
    const sum = payrollSummary(getDb(), getDb().timeEntries);
    const elena = sum.find((r) => r.staffId === t)!;
    expect(elena.approvedHours).toBe(6);
    expect(elena.pay).toBe(180);
    expect(payPeriodFor('biweekly', '2026-01-07')).toEqual({ start: '2026-01-05', end: '2026-01-18' });
    expect(payPeriodFor('semimonthly', '2026-02-20')).toEqual({ start: '2026-02-16', end: '2026-02-28' });
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
  });
});

describe('accounts & permissions', () => {
  it('role defaults, custom permissions, family scoping and owner protection', () => {
    const db = buildSampleData(emptyDatabase());
    replaceDb(db);
    const owner = getDb().accounts.find((a) => a.role === 'owner')!;
    expect(() => S.setAccountActive(owner.id, false)).toThrow(/only owner/);
    const parent = getDb().accounts.find((a) => a.displayName === 'Mei Chen')!;
    const v = buildViewer(getDb(), parent);
    expect(v.portal).toBe('parent');
    expect(v.can('families.view')).toBe(false);
    const chen = getDb().families.find((f) => f.name === 'Chen Family')!;
    expect(v.familyId).toBe(chen.id);
    const teacherAcc = getDb().accounts.find((a) => a.role === 'teacher')!;
    expect(permissionsOf(teacherAcc).has('payroll.view')).toBe(false);
    S.saveAccount({ ...teacherAcc, permissions: ['attendance.take', 'medical.view'] }, teacherAcc.id);
    expect(permissionsOf(getDb().accounts.find((a) => a.id === teacherAcc.id)!).has('medical.view')).toBe(true);
    expect(() => S.saveAccount({ displayName: 'P', email: '', role: 'parent', staffId: null, guardianId: null, dancerId: null, permissions: null, notes: '' })).toThrow(ValidationError);
  });

  it('sample studio is complete, removable, and older data upgrades', () => {
    const db = buildSampleData(emptyDatabase());
    expect(db.classes.length).toBe(7);
    expect(db.families.length).toBe(7);
    expect(db.families.some((f) => db.dancers.filter((d) => d.familyId === f.id).length === 2)).toBe(true);
    expect(db.dancers.every((d) => d.familyId)).toBe(true);
    expect(db.enrollments.some((e) => e.status === 'waitlist')).toBe(true);
    expect(db.attendance.length).toBeGreaterThan(0);
    expect(db.accounts.map((a) => a.role)).toEqual(expect.arrayContaining(['owner', 'office_admin', 'teacher', 'assistant_teacher', 'parent', 'performance_staff']));
    replaceDb(db);
    A.removeSampleData();
    const after = getDb();
    expect(after.classes.length + after.families.length + after.staff.length + after.attendance.length + after.timeEntries.length).toBe(0);
    expect(after.accounts.filter((a) => a.role === 'owner')).toHaveLength(1);
    // v3 data with sample dancers upgrades with the sample studio added once
    const v3 = JSON.parse(JSON.stringify(buildSampleData(emptyDatabase())));
    for (const k of ['accounts', 'families', 'guardians', 'emergencyContacts', 'staff', 'schoolYears', 'classrooms', 'classes', 'enrollments', 'studioEvents', 'sessionChanges', 'attendance', 'timeEntries', 'notices', 'announcements', 'activity']) delete v3[k];
    for (const d of v3.dancers) delete d.familyId;
    v3.meta.schemaVersion = 3;
    const up = normalizeDatabase(v3);
    expect(up.classes.length).toBe(7);
    expect(up.accounts.some((a) => a.role === 'owner')).toBe(true);
    expect(normalizeDatabase(JSON.parse(JSON.stringify(up))).classes.length).toBe(7);
  });
});

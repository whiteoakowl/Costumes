import { beforeEach, describe, expect, it } from 'vitest';
import { emptyDatabase, getDb, normalizeDatabase, replaceDb } from '../src/data/store';
import { buildSampleData } from '../src/data/sample';
import * as A from '../src/data/actions';
import * as P from '../src/data/planningActions';
import { dayConflicts, daySlots, familyAppointments, fittingCostumes, formStats, jobSpotsLeft, listProgress, slotDancerIds, unscheduledDancers, visibleTaskLists } from '../src/data/planning';
import { enrolledDancerIds } from '../src/data/studio';
import { addDays } from '../src/data/studio';
import { todayStr } from '../src/data/ids';

const sample = () => replaceDb(buildSampleData(emptyDatabase()));
const dancer = (first: string) => getDb().dancers.find((d) => d.firstName === first)!;
const day = (input: Partial<P.ScheduleDayInput> = {}) =>
  P.saveScheduleDay({ kind: 'fitting', name: 'Fittings', date: addDays(todayStr(), 5), startTime: '16:00', endTime: '18:00', slotMinutes: 15, location: '', recitalId: null, staffIds: [], volunteerIds: [], photographer: '', instructions: '', published: false, familyBooking: false, notes: '', ...input });

beforeEach(sample);

describe('sample planning data', () => {
  it('is loaded, flagged and removable', () => {
    const db = getDb();
    expect(db.scheduleDays.length).toBe(2);
    expect(db.scheduleSlots.length).toBeGreaterThan(5);
    expect(db.volunteerForms.length).toBe(1);
    expect(db.taskLists.length).toBe(3);
    expect([...db.scheduleDays, ...db.scheduleSlots, ...db.volunteerShifts, ...db.tasks].every((r) => r.isSample)).toBe(true);
    A.removeSampleData();
    expect(getDb().scheduleDays.length + getDb().tasks.length + getDb().volunteerShifts.length).toBe(0);
  });

  it('older backups gain the new tables and samples on upgrade', () => {
    const old = buildSampleData(emptyDatabase()) as unknown as Record<string, unknown>;
    for (const k of ['scheduleDays', 'scheduleSlots', 'volunteerForms', 'volunteerShifts', 'taskLists', 'tasks']) delete old[k];
    (old.meta as { schemaVersion: number }).schemaVersion = 5;
    const db = normalizeDatabase(old);
    expect(db.scheduleDays.length).toBe(2);
    expect(db.meta.schemaVersion).toBe(6);
  });
});

describe('fittings & picture day', () => {
  it('validates times and generates slots', () => {
    expect(() => day({ endTime: '15:00' })).toThrow(/end time/);
    const id = day();
    expect(P.generateSlots(id, { from: '16:00', to: '17:00', minutes: 15, capacity: 2, label: 'Open' })).toBe(4);
    // Taken times are skipped.
    expect(P.generateSlots(id, { from: '16:00', to: '17:30', minutes: 15, capacity: 2, label: '' })).toBe(2);
    expect(daySlots(getDb(), id).map((s) => s.start)).toEqual(['16:00', '16:15', '16:30', '16:45', '17:00', '17:15']);
  });

  it('auto-schedules dancers a few at a time, siblings together, without double-booking', () => {
    const id = day();
    const cls = getDb().classes.find((c) => enrolledDancerIds(getDb(), c.id).length >= 2)!;
    const roster = enrolledDancerIds(getDb(), cls.id);
    const r = P.autoSchedule(id, { mode: 'dancers', classIds: [cls.id], teamIds: [], dancerIds: [], start: '16:00', minutes: 10, perSlot: 1, gap: 0, keepSiblingsTogether: true, costumeNote: '' });
    expect(r.dancers).toBe(roster.length);
    expect(r.slots).toBeLessThanOrEqual(roster.length);
    // Running again adds nobody: everyone already has a time.
    expect(() => P.autoSchedule(id, { mode: 'dancers', classIds: [cls.id], teamIds: [], dancerIds: [], start: '18:00', minutes: 10, perSlot: 1, gap: 0, keepSiblingsTogether: true, costumeNote: '' })).toThrow(/already has a time/);
    expect(dayConflicts(getDb(), id)).toEqual([]);
  });

  it('group slots follow the live class roster and flag clashes', () => {
    const id = day({ kind: 'picture_day' });
    const db = getDb();
    const cls = db.classes.find((c) => enrolledDancerIds(db, c.id).length)!;
    const someone = enrolledDancerIds(db, cls.id)[0];
    P.autoSchedule(id, { mode: 'groups', classIds: [cls.id], teamIds: [], dancerIds: [], start: '16:00', minutes: 15, perSlot: 1, gap: 0, keepSiblingsTogether: false, costumeNote: '' });
    const groupSlot = daySlots(getDb(), id)[0];
    expect(groupSlot.classId).toBe(cls.id);
    expect(slotDancerIds(getDb(), groupSlot)).toEqual(expect.arrayContaining(enrolledDancerIds(getDb(), cls.id)));
    // Same dancer individually linked at an overlapping time → conflict.
    const s2 = P.saveSlot(id, { start: '16:10', end: '16:20', label: 'Individual', classId: null, teamId: null, dancerIds: [someone], capacity: 0, costumeNote: '', notes: '' });
    expect(dayConflicts(getDb(), id).map((c) => c.dancerId)).toContain(someone);
    expect(() => P.unlinkDancer(groupSlot.id, someone)).toThrow(/class or team/);
    P.unlinkDancer(s2, someone);
    expect(dayConflicts(getDb(), id)).toEqual([]);
  });

  it('families book open spots for their own dancers, only when published', () => {
    const emma = dancer('Emma');
    const mia = dancer('Mia');
    const id = day({ familyBooking: true });
    P.generateSlots(id, { from: '16:00', to: '16:30', minutes: 15, capacity: 1, label: 'Open' });
    const [a, b] = daySlots(getDb(), id);
    expect(() => P.bookSlot(a.id, emma.id, emma.familyId!)).toThrow(/not open/);
    P.saveScheduleDay({ ...getDb().scheduleDays.find((d) => d.id === id)!, published: true }, id);
    if (mia.familyId !== emma.familyId) expect(() => P.bookSlot(a.id, mia.id, emma.familyId!)).toThrow(/your own/);
    P.bookSlot(a.id, emma.id, emma.familyId!);
    expect(familyAppointments(getDb(), emma.familyId!).some((x) => x.dancerId === emma.id && x.slot.id === a.id)).toBe(true);
    // Full slot.
    const other = getDb().dancers.find((d) => d.familyId && d.familyId !== emma.familyId)!;
    expect(() => P.bookSlot(a.id, other.id, other.familyId!)).toThrow(/just taken/);
    // Re-booking moves the dancer.
    P.bookSlot(b.id, emma.id, emma.familyId!);
    expect(daySlots(getDb(), id)[0].dancerIds).toEqual([]);
    P.cancelBooking(b.id, emma.id, emma.familyId!);
    expect(daySlots(getDb(), id)[1].dancerIds).toEqual([]);
  });

  it('records outcomes, notifies families and cleans up deleted dancers', () => {
    const emma = dancer('Emma');
    const id = day();
    const s = P.saveSlot(id, { start: '16:00', end: '16:15', label: '', classId: null, teamId: null, dancerIds: [emma.id], capacity: 0, costumeNote: '', notes: '' });
    P.setOutcome(s, emma.id, 'alteration', 'Hem 1 inch');
    expect(getDb().scheduleSlots.find((x) => x.id === s)!.outcomes[emma.id]).toEqual({ status: 'alteration', note: 'Hem 1 inch' });
    const before = getDb().notifications.length;
    expect(P.notifyScheduleFamilies(id)).toBe(1);
    expect(getDb().notifications.length).toBe(before + 1);
    expect(getDb().scheduleDays.find((d) => d.id === id)!.published).toBe(true);
    A.deleteDancers([emma.id]);
    const slot = getDb().scheduleSlots.find((x) => x.id === s)!;
    expect(slot.dancerIds).toEqual([]);
    expect(slot.outcomes).toEqual({});
  });

  it('shows recital costumes to fit and who still needs a time', () => {
    const db = getDb();
    const fit = db.scheduleDays.find((d) => d.kind === 'fitting')!;
    const missing = unscheduledDancers(db, fit);
    expect(Array.isArray(missing)).toBe(true);
    const withCostume = db.recitalNumbers.find((n) => n.costumeId && n.classId && enrolledDancerIds(db, n.classId).length)!;
    const d = enrolledDancerIds(db, withCostume.classId!)[0];
    expect(fittingCostumes(db, d, withCostume.recitalId).map((c) => c.id)).toContain(withCostume.costumeId);
  });
});

describe('volunteer sign-ups', () => {
  const form = () =>
    P.saveVolunteerForm({ title: 'Bake sale', description: '', date: '', location: '', recitalId: null, deadline: '', open: true, isPublic: true, notes: '', jobs: [{ id: '', title: 'Table', description: '', date: '', start: '10:00', end: '12:00', needed: 1, skill: '' }, { id: '', title: 'Bakers', description: '', date: '', start: '', end: '', needed: 0, skill: '' }] });

  it('needs jobs and valid times', () => {
    expect(() => P.saveVolunteerForm({ title: 'X', description: '', date: '', location: '', recitalId: null, deadline: '', open: true, isPublic: false, notes: '', jobs: [] })).toThrow(/at least one job/);
    expect(() => P.saveVolunteerForm({ title: 'X', description: '', date: '', location: '', recitalId: null, deadline: '', open: true, isPublic: false, notes: '', jobs: [{ id: '', title: 'A', description: '', date: '', start: '12:00', end: '11:00', needed: 1, skill: '' }] })).toThrow(/after the start/);
  });

  it('matches or creates volunteers, enforces capacity and duplicates', () => {
    const id = form();
    const f = () => getDb().volunteerForms.find((x) => x.id === id)!;
    const [table, bakers] = f().jobs;
    const count = getDb().volunteers.length;
    const r1 = P.signUpForJobs(id, [table.id], { firstName: 'New', lastName: 'Parent', email: 'new.parent@example.com', phone: '' });
    expect(r1.created).toBe(true);
    expect(getDb().volunteers.length).toBe(count + 1);
    expect(jobSpotsLeft(getDb(), f(), table.id)).toBe(0);
    expect(() => P.signUpForJobs(id, [table.id], { firstName: 'Other', lastName: 'Person', email: 'o@example.com', phone: '' })).toThrow(/full/);
    // Same email → same volunteer, no duplicate record.
    const r2 = P.signUpForJobs(id, [bakers.id], { firstName: 'New', lastName: 'Parent', email: 'NEW.parent@example.com', phone: '' });
    expect(r2).toEqual({ volunteerId: r1.volunteerId, created: false });
    expect(() => P.signUpForJobs(id, [bakers.id], { firstName: 'New', lastName: 'Parent', email: 'new.parent@example.com', phone: '' })).toThrow(/already signed up/);
    expect(formStats(getDb(), f())).toMatchObject({ needed: 1, filled: 2, people: 1 });
    // Staff can overfill; closed forms refuse families.
    P.signUpForJobs(id, [table.id], { firstName: '', lastName: '', email: '', phone: '' }, { staff: true, volunteerId: getDb().volunteers[0].id });
    P.saveVolunteerForm({ ...f(), open: false }, id);
    expect(() => P.signUpForJobs(id, [bakers.id], { firstName: 'Late', lastName: '', email: 'late@example.com', phone: '' })).toThrow(/closed/);
    // Removing a job with volunteers is blocked.
    expect(() => P.saveVolunteerForm({ ...f(), jobs: [bakers] }, id)).toThrow(/already has/);
  });

  it('cancelled sign-ups free the spot and deleting a volunteer removes their sign-ups', () => {
    const id = form();
    const table = getDb().volunteerForms.find((x) => x.id === id)!.jobs[0];
    const { volunteerId } = P.signUpForJobs(id, [table.id], { firstName: 'A', lastName: 'B', email: 'ab@example.com', phone: '' });
    const shift = getDb().volunteerShifts.find((s) => s.volunteerId === volunteerId)!;
    P.setShiftStatus(shift.id, 'cancelled');
    P.signUpForJobs(id, [table.id], { firstName: 'C', lastName: 'D', email: 'cd@example.com', phone: '' });
    expect(() => P.setShiftStatus(shift.id, 'signed_up')).toThrow(/full/);
    A.deleteVolunteers([volunteerId]);
    expect(getDb().volunteerShifts.some((s) => s.volunteerId === volunteerId)).toBe(false);
  });
});

describe('checklists & to-dos', () => {
  it('adds pasted lines, checks off, reorders, resets and duplicates', () => {
    const id = P.saveTaskList({ name: 'Packing', kind: 'checklist', description: '', dueDate: '', visibility: 'office', recitalId: null, archived: false });
    const ids = P.addTasks(id, { title: '- Tights\n- Shoes\n\n[ ] Hairspray', notes: '', dueDate: '', assigneeStaffId: null, assigneeVolunteerId: null, priority: 'normal' });
    expect(ids.length).toBe(3);
    expect(getDb().tasks.filter((t) => t.listId === id).map((t) => t.title)).toEqual(['Tights', 'Shoes', 'Hairspray']);
    P.toggleTask(ids[0]);
    expect(listProgress(getDb(), id)).toEqual({ done: 1, total: 3 });
    expect(getDb().tasks.find((t) => t.id === ids[0])!.doneBy).not.toBe('');
    P.moveTask(ids[2], -1);
    expect(getDb().tasks.filter((t) => t.listId === id).sort((a, b) => a.order - b.order).map((t) => t.title)).toEqual(['Tights', 'Hairspray', 'Shoes']);
    const copy = P.duplicateTaskList(id, 'Packing (fall)');
    expect(listProgress(getDb(), copy)).toEqual({ done: 0, total: 3 });
    P.resetTaskList(id);
    expect(listProgress(getDb(), id).done).toBe(0);
    P.toggleTask(ids[1]);
    expect(P.clearCompleted(id)).toBe(1);
    P.deleteTaskList(id);
    expect(getDb().tasks.some((t) => t.listId === id)).toBe(false);
  });

  it('office-only lists are hidden from teachers unless they have a task on it', () => {
    const staffId = getDb().staff[0].id;
    const id = P.saveTaskList({ name: 'Private', kind: 'todo', description: '', dueDate: '', visibility: 'office', recitalId: null, archived: false });
    expect(visibleTaskLists(getDb(), { admin: false, staffId }).some((l) => l.id === id)).toBe(false);
    P.addTasks(id, { title: 'Do it', notes: '', dueDate: '', assigneeStaffId: staffId, assigneeVolunteerId: null, priority: 'high' });
    expect(visibleTaskLists(getDb(), { admin: false, staffId }).some((l) => l.id === id)).toBe(true);
  });
});

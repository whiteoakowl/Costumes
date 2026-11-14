import type { Costume, Database, ID, ScheduleDay, ScheduleKind, ScheduleSlot, ShiftStatus, SlotOutcome, TaskItem, TaskList, TaskPriority, VolunteerForm, VolunteerShift } from './types';
import { todayStr } from './ids';
import { enrolledDancerIds, minutes } from './studio';
import { dancerCostumes } from './selectors';

/*
 * Pure calculations for the planning modules: fitting & picture-day
 * schedules, volunteer sign-up forms and checklists / to-do lists.
 * No store access, so pages, actions and tests can all share them.
 */

export const scheduleKindLabels: Record<ScheduleKind, string> = { fitting: 'Fitting', picture_day: 'Picture day' };

export const outcomeLabels: Record<ScheduleKind, Record<SlotOutcome, string>> = {
  fitting: { scheduled: 'Scheduled', done: 'Fitted', alteration: 'Needs alteration', retake: 'Refit needed', no_show: 'No-show' },
  picture_day: { scheduled: 'Scheduled', done: 'Photographed', alteration: 'Costume issue', retake: 'Retake needed', no_show: 'No-show' },
};

export const outcomeTone: Record<SlotOutcome, 'neutral' | 'ready' | 'progress' | 'danger' | 'info'> = { scheduled: 'neutral', done: 'ready', alteration: 'progress', retake: 'info', no_show: 'danger' };

export const shiftStatusLabels: Record<ShiftStatus, string> = { signed_up: 'Signed up', confirmed: 'Confirmed', checked_in: 'Checked in', no_show: 'No-show', cancelled: 'Cancelled' };

export const priorityLabels: Record<TaskPriority, string> = { low: 'Low', normal: 'Normal', high: 'High' };

/* ============================================================ schedules */

export function daySlots(db: Database, dayId: ID): ScheduleSlot[] {
  return db.scheduleSlots.filter((s) => s.dayId === dayId).sort((a, b) => a.start.localeCompare(b.start) || a.label.localeCompare(b.label));
}

/** Everyone linked to a slot: the class roster, the team, and individually linked dancers. */
export function slotDancerIds(db: Database, slot: ScheduleSlot): ID[] {
  const ids = new Set<ID>();
  if (slot.classId) enrolledDancerIds(db, slot.classId).forEach((d) => ids.add(d));
  if (slot.teamId) db.teams.find((t) => t.id === slot.teamId)?.dancerIds.forEach((d) => ids.add(d));
  slot.dancerIds.forEach((d) => ids.add(d));
  const exists = new Set(db.dancers.map((d) => d.id));
  return [...ids].filter((d) => exists.has(d));
}

/** Spots families can still book in a slot. */
export function slotOpenSpots(slot: ScheduleSlot) {
  return slot.capacity > 0 ? Math.max(0, slot.capacity - slot.dancerIds.length) : 0;
}

export function slotLabelText(db: Database, slot: ScheduleSlot) {
  if (slot.label) return slot.label;
  const c = slot.classId ? db.classes.find((x) => x.id === slot.classId)?.name : '';
  const t = slot.teamId ? db.teams.find((x) => x.id === slot.teamId)?.name : '';
  return [c, t].filter(Boolean).join(' + ') || (slot.capacity > 0 ? 'Open booking' : 'Individual');
}

/** Slots each dancer is in on a day. */
export function dayDancerSlots(db: Database, dayId: ID): Map<ID, ScheduleSlot[]> {
  const map = new Map<ID, ScheduleSlot[]>();
  for (const s of daySlots(db, dayId)) for (const d of slotDancerIds(db, s)) map.set(d, [...(map.get(d) ?? []), s]);
  return map;
}

const overlaps = (a: ScheduleSlot, b: ScheduleSlot) => minutes(a.start) < minutes(b.end) && minutes(b.start) < minutes(a.end);

/** Dancers booked into two slots at the same time (e.g. in two classes photographed together). */
export function dayConflicts(db: Database, dayId: ID): { dancerId: ID; slots: ScheduleSlot[] }[] {
  const out: { dancerId: ID; slots: ScheduleSlot[] }[] = [];
  for (const [dancerId, slots] of dayDancerSlots(db, dayId)) {
    const clash = slots.filter((s) => slots.some((o) => o !== s && overlaps(s, o)));
    if (clash.length) out.push({ dancerId, slots: clash });
  }
  return out;
}

/** Siblings scheduled at different times on the same day (families love one trip). */
export function siblingSplits(db: Database, dayId: ID): { familyId: ID; dancerIds: ID[] }[] {
  const byFamily = new Map<ID, ID[]>();
  for (const [dancerId] of dayDancerSlots(db, dayId)) {
    const f = db.dancers.find((d) => d.id === dancerId)?.familyId;
    if (f) byFamily.set(f, [...(byFamily.get(f) ?? []), dancerId]);
  }
  const map = dayDancerSlots(db, dayId);
  const out: { familyId: ID; dancerIds: ID[] }[] = [];
  for (const [familyId, ids] of byFamily) {
    if (ids.length < 2) continue;
    const firsts = ids.map((d) => minutes(map.get(d)![0].start));
    if (Math.max(...firsts) - Math.min(...firsts) > 60) out.push({ familyId, dancerIds: ids });
  }
  return out;
}

/** Dancers in a recital: class numbers bring their roster, team numbers their team. */
export function recitalDancerIds(db: Database, recitalId: ID | null): ID[] {
  if (!recitalId) return [];
  const ids = new Set<ID>();
  for (const n of db.recitalNumbers.filter((x) => x.recitalId === recitalId)) {
    if (n.classId) enrolledDancerIds(db, n.classId).forEach((d) => ids.add(d));
    if (n.teamId) db.teams.find((t) => t.id === n.teamId)?.dancerIds.forEach((d) => ids.add(d));
  }
  return [...ids];
}

/** Recital dancers who don't have a time on this day yet. */
export function unscheduledDancers(db: Database, day: ScheduleDay): ID[] {
  const booked = dayDancerSlots(db, day.id);
  return recitalDancerIds(db, day.recitalId).filter((d) => !booked.has(d));
}

/** Costumes a dancer should try on: their recital numbers' costumes plus show / performance assignments. */
export function fittingCostumes(db: Database, dancerId: ID, recitalId: ID | null): Costume[] {
  const out = new Map<ID, Costume>();
  if (recitalId) {
    for (const n of db.recitalNumbers.filter((x) => x.recitalId === recitalId && x.costumeId)) {
      const inNumber = (n.classId && enrolledDancerIds(db, n.classId).includes(dancerId)) || (n.teamId && db.teams.find((t) => t.id === n.teamId)?.dancerIds.includes(dancerId));
      const c = db.costumes.find((x) => x.id === n.costumeId);
      if (inNumber && c) out.set(c.id, c);
    }
  }
  // Show / performance assignments: only the recital's own show when the day is linked to a recital.
  const showId = recitalId ? db.recitals.find((r) => r.id === recitalId)?.showId ?? null : null;
  const relevant = (ownerType: string, ownerId: ID) => !recitalId || (!!showId && (ownerType === 'show' ? ownerId === showId : db.performances.find((p) => p.id === ownerId)?.showId === showId));
  for (const e of dancerCostumes(db, dancerId)) if ((e.costume.kind ?? 'costume') === 'costume' && relevant(e.ownerType, e.ownerId)) out.set(e.costume.id, e.costume);
  return [...out.values()];
}

/** The end of the last slot, or the day's start time. */
export function nextFreeTime(db: Database, day: ScheduleDay) {
  const slots = daySlots(db, day.id);
  return slots.reduce((t, s) => (s.end > t ? s.end : t), day.startTime || '09:00');
}

export interface FamilyAppointment {
  day: ScheduleDay;
  slot: ScheduleSlot;
  dancerId: ID;
}

/** A family's upcoming fitting and picture-day times (published days only). */
export function familyAppointments(db: Database, familyId: ID, today = todayStr()): FamilyAppointment[] {
  const mine = new Set(db.dancers.filter((d) => d.familyId === familyId).map((d) => d.id));
  const out: FamilyAppointment[] = [];
  for (const day of db.scheduleDays.filter((d) => d.published && d.date >= today)) {
    for (const slot of daySlots(db, day.id)) for (const d of slotDancerIds(db, slot)) if (mine.has(d)) out.push({ day, slot, dancerId: d });
  }
  return out.sort((a, b) => a.day.date.localeCompare(b.day.date) || a.slot.start.localeCompare(b.slot.start));
}

export function dayProgress(db: Database, dayId: ID) {
  let total = 0;
  let done = 0;
  for (const s of daySlots(db, dayId)) {
    for (const d of slotDancerIds(db, s)) {
      total++;
      const st = s.outcomes[d]?.status;
      if (st && st !== 'scheduled') done++;
    }
  }
  return { total, done };
}

/* ======================================================= volunteer forms */

export const activeShift = (s: VolunteerShift) => s.status !== 'cancelled';

export function jobShifts(db: Database, formId: ID, jobId: ID) {
  return db.volunteerShifts.filter((s) => s.formId === formId && s.jobId === jobId && activeShift(s));
}

export function jobSpotsLeft(db: Database, form: VolunteerForm, jobId: ID): number | null {
  const job = form.jobs.find((j) => j.id === jobId);
  if (!job || !job.needed) return null; // unlimited
  return Math.max(0, job.needed - jobShifts(db, form.id, jobId).length);
}

export function formStats(db: Database, form: VolunteerForm) {
  let needed = 0;
  let filled = 0;
  let openJobs = 0;
  for (const j of form.jobs) {
    const n = jobShifts(db, form.id, j.id).length;
    filled += j.needed ? Math.min(n, j.needed) : n;
    needed += j.needed;
    if (!j.needed || n < j.needed) openJobs++;
  }
  const people = new Set(db.volunteerShifts.filter((s) => s.formId === form.id && activeShift(s)).map((s) => s.volunteerId)).size;
  return { needed, filled, openJobs, people };
}

export function isFormAccepting(form: VolunteerForm, today = todayStr()) {
  return form.open && (!form.deadline || form.deadline >= today);
}

/** Match a sign-up to an existing volunteer by email, or by name + phone. */
export function matchVolunteer(db: Database, p: { firstName: string; lastName: string; email: string; phone: string }) {
  const email = p.email.trim().toLowerCase();
  if (email) {
    const v = db.volunteers.find((x) => x.email.trim().toLowerCase() === email);
    if (v) return v;
  }
  const digits = p.phone.replace(/\D/g, '');
  const name = `${p.firstName} ${p.lastName}`.trim().toLowerCase();
  return db.volunteers.find((x) => `${x.firstName} ${x.lastName}`.trim().toLowerCase() === name && (!!digits && x.phone.replace(/\D/g, '') === digits));
}

/* ============================================================== tasks */

export function listItems(db: Database, listId: ID): TaskItem[] {
  return db.tasks.filter((t) => t.listId === listId).sort((a, b) => a.order - b.order);
}

export function listProgress(db: Database, listId: ID) {
  const items = db.tasks.filter((t) => t.listId === listId);
  return { done: items.filter((t) => t.done).length, total: items.length };
}

export function isTaskOverdue(t: Pick<TaskItem, 'done' | 'dueDate'>, today = todayStr()) {
  return !t.done && !!t.dueDate && t.dueDate < today;
}

/** Lists a viewer may open: office sees all; other staff see shared lists and lists with their tasks. */
export function visibleTaskLists(db: Database, who: { admin: boolean; staffId: ID | null }): TaskList[] {
  return db.taskLists.filter((l) => who.admin || l.visibility === 'staff' || (!!who.staffId && db.tasks.some((t) => t.listId === l.id && t.assigneeStaffId === who.staffId)));
}

/* ============================================================== cleanup */

/** Drop references to deleted dancers, classes, teams, staff, volunteers and recitals. */
export function prunePlanning(db: Database) {
  if (!Array.isArray(db.scheduleDays)) return;
  const dancers = new Set(db.dancers.map((d) => d.id));
  const classes = new Set(db.classes.map((c) => c.id));
  const teams = new Set(db.teams.map((t) => t.id));
  const staff = new Set(db.staff.map((s) => s.id));
  const vols = new Set(db.volunteers.map((v) => v.id));
  const recitals = new Set(db.recitals.map((r) => r.id));
  const days = new Set(db.scheduleDays.map((d) => d.id));
  for (const d of db.scheduleDays) {
    d.staffIds = d.staffIds.filter((x) => staff.has(x));
    d.volunteerIds = d.volunteerIds.filter((x) => vols.has(x));
    if (d.recitalId && !recitals.has(d.recitalId)) d.recitalId = null;
  }
  db.scheduleSlots = db.scheduleSlots.filter((s) => days.has(s.dayId));
  for (const s of db.scheduleSlots) {
    s.dancerIds = s.dancerIds.filter((x) => dancers.has(x));
    if (s.classId && !classes.has(s.classId)) s.classId = null;
    if (s.teamId && !teams.has(s.teamId)) s.teamId = null;
    for (const k of Object.keys(s.outcomes)) if (!dancers.has(k)) delete s.outcomes[k];
    for (const k of Object.keys(s.bookedBy)) if (!dancers.has(k)) delete s.bookedBy[k];
  }
  const forms = new Set(db.volunteerForms.map((f) => f.id));
  for (const f of db.volunteerForms) if (f.recitalId && !recitals.has(f.recitalId)) f.recitalId = null;
  db.volunteerShifts = db.volunteerShifts.filter((s) => forms.has(s.formId) && vols.has(s.volunteerId) && db.volunteerForms.find((f) => f.id === s.formId)!.jobs.some((j) => j.id === s.jobId));
  const lists = new Set(db.taskLists.map((l) => l.id));
  for (const l of db.taskLists) if (l.recitalId && !recitals.has(l.recitalId)) l.recitalId = null;
  db.tasks = db.tasks.filter((t) => lists.has(t.listId));
  for (const t of db.tasks) {
    if (t.assigneeStaffId && !staff.has(t.assigneeStaffId)) t.assigneeStaffId = null;
    if (t.assigneeVolunteerId && !vols.has(t.assigneeVolunteerId)) t.assigneeVolunteerId = null;
  }
}

import { commit, ValidationError } from './store';
import { newId, nowIso, todayStr } from './ids';
import { actorName } from '../lib/session';
import { logActivity } from './studioActions';
import { enrolledDancerIds, fromMinutes, minutes } from './studio';
import { fmtClock, fmtDate } from './time';
import { fullName } from './selectors';
import { daySlots, isFormAccepting, jobShifts, matchVolunteer, outcomeLabels, scheduleKindLabels, slotDancerIds, slotLabelText, slotOpenSpots } from './planning';
import type { Database, ID, ScheduleDay, ScheduleSlot, ShiftStatus, SlotOutcome, TaskItem, TaskList, Volunteer, VolunteerForm, VolunteerJob } from './types';

const stamp = () => {
  const t = nowIso();
  return { id: newId(), createdAt: t, updatedAt: t };
};

function find<T extends { id: ID }>(list: T[], id: ID, label: string): T {
  const r = list.find((x) => x.id === id);
  if (!r) throw new ValidationError(`${label} no longer exists.`);
  return r;
}

const req = (v: string, label: string) => {
  const s = (v ?? '').trim();
  if (!s) throw new ValidationError(`${label} is required.`);
  return s;
};

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function checkTimes(start: string, end: string, label: string) {
  if (!TIME.test(start)) throw new ValidationError(`${label}: choose a start time.`);
  if (!TIME.test(end)) throw new ValidationError(`${label}: choose an end time.`);
  if (end <= start) throw new ValidationError(`${label}: the end time must be after the start time.`);
}

const dayLink = (d: Pick<ScheduleDay, 'id' | 'kind'>) => `/${d.kind === 'fitting' ? 'fittings' : 'picture-day'}/${d.id}`;

/* ============================================================ schedule days */

export type ScheduleDayInput = Omit<ScheduleDay, 'id' | 'createdAt' | 'updatedAt' | 'isSample'>;

export function saveScheduleDay(input: ScheduleDayInput, id?: ID): ID {
  const name = req(input.name, 'Name');
  if (!DATE.test(input.date)) throw new ValidationError('Choose a date.');
  checkTimes(input.startTime, input.endTime, 'Hours');
  const slotMinutes = Math.round(Number(input.slotMinutes));
  if (!(slotMinutes >= 5 && slotMinutes <= 240)) throw new ValidationError('Slot length must be between 5 and 240 minutes.');
  const clean: ScheduleDayInput = { ...input, name, slotMinutes, staffIds: [...new Set(input.staffIds)], volunteerIds: [...new Set(input.volunteerIds)], location: input.location.trim(), photographer: input.photographer.trim(), instructions: input.instructions.trim(), notes: input.notes.trim() };
  return commit((db) => {
    if (id) {
      Object.assign(find(db.scheduleDays, id, 'This schedule'), clean, { updatedAt: nowIso() });
      logActivity(db, `${scheduleKindLabels[clean.kind]} updated`, name, dayLink({ id, kind: clean.kind }));
      return id;
    }
    const rec: ScheduleDay = { ...clean, ...stamp() };
    db.scheduleDays.push(rec);
    logActivity(db, `${scheduleKindLabels[clean.kind]} scheduled`, `${name} · ${fmtDate(clean.date)}`, dayLink(rec));
    return rec.id;
  });
}

export function deleteScheduleDay(id: ID) {
  commit((db) => {
    const d = find(db.scheduleDays, id, 'This schedule');
    db.scheduleDays = db.scheduleDays.filter((x) => x.id !== id);
    db.scheduleSlots = db.scheduleSlots.filter((s) => s.dayId !== id);
    logActivity(db, `${scheduleKindLabels[d.kind]} deleted`, d.name);
  });
}

/** Copy a day (with its slots and linked groups, without results) to a new date. */
export function duplicateScheduleDay(id: ID, date: string): ID {
  if (!DATE.test(date)) throw new ValidationError('Choose a date for the copy.');
  return commit((db) => {
    const src = find(db.scheduleDays, id, 'This schedule');
    const copy: ScheduleDay = { ...structuredClone(src), ...stamp(), isSample: false, name: `${src.name} (copy)`, date, published: false };
    db.scheduleDays.push(copy);
    for (const s of db.scheduleSlots.filter((x) => x.dayId === id)) db.scheduleSlots.push({ ...structuredClone(s), ...stamp(), isSample: false, dayId: copy.id, outcomes: {}, bookedBy: {} });
    return copy.id;
  });
}

/* ================================================================ slots */

export type SlotInput = Pick<ScheduleSlot, 'start' | 'end' | 'label' | 'classId' | 'teamId' | 'dancerIds' | 'capacity' | 'costumeNote' | 'notes'>;

export function saveSlot(dayId: ID, input: SlotInput, id?: ID): ID {
  checkTimes(input.start, input.end, 'Time slot');
  const capacity = Math.round(Number(input.capacity) || 0);
  if (capacity < 0) throw new ValidationError('Open spots cannot be negative.');
  const clean = { ...input, capacity, label: input.label.trim(), costumeNote: input.costumeNote.trim(), notes: input.notes.trim(), dancerIds: [...new Set(input.dancerIds)] };
  return commit((db) => {
    find(db.scheduleDays, dayId, 'This schedule');
    if (id) {
      Object.assign(find(db.scheduleSlots, id, 'This time slot'), clean, { updatedAt: nowIso() });
      return id;
    }
    const rec: ScheduleSlot = { ...stamp(), dayId, outcomes: {}, bookedBy: {}, ...clean };
    db.scheduleSlots.push(rec);
    return rec.id;
  });
}

export function deleteSlots(ids: ID[]) {
  const set = new Set(ids);
  commit((db) => {
    db.scheduleSlots = db.scheduleSlots.filter((s) => !set.has(s.id));
  });
}

/** Fill the day (or a time range) with empty, equal slots. */
export function generateSlots(dayId: ID, opts: { from: string; to: string; minutes: number; capacity: number; label: string; skipTaken?: boolean }): number {
  checkTimes(opts.from, opts.to, 'Time range');
  const len = Math.round(Number(opts.minutes));
  if (!(len >= 5)) throw new ValidationError('Each slot must be at least 5 minutes.');
  return commit((db) => {
    find(db.scheduleDays, dayId, 'This schedule');
    const existing = db.scheduleSlots.filter((s) => s.dayId === dayId);
    let n = 0;
    for (let t = minutes(opts.from); t + len <= minutes(opts.to); t += len) {
      const start = fromMinutes(t);
      const end = fromMinutes(t + len);
      if (opts.skipTaken !== false && existing.some((s) => minutes(s.start) < t + len && t < minutes(s.end))) continue;
      db.scheduleSlots.push({ ...stamp(), dayId, start, end, label: opts.label.trim(), classId: null, teamId: null, dancerIds: [], capacity: Math.max(0, Math.round(opts.capacity)), costumeNote: '', outcomes: {}, bookedBy: {}, notes: '' });
      n++;
    }
    if (!n) throw new ValidationError('No slots fit in that time range (or it is already booked).');
    return n;
  });
}

export interface AutoScheduleInput {
  /** 'groups': one slot per class / team. 'dancers': dancers placed a few at a time. */
  mode: 'groups' | 'dancers';
  classIds: ID[];
  teamIds: ID[];
  dancerIds: ID[];
  /** Add every recital dancer who doesn't have a time yet. */
  recitalUnscheduled?: boolean;
  start: string;
  minutes: number;
  perSlot: number;
  gap: number;
  keepSiblingsTogether: boolean;
  costumeNote: string;
}

/**
 * Link dancers to times automatically, one slot after another from `start`.
 * In dancer mode, dancers who already have a time on this day are skipped,
 * and siblings are placed next to each other so families make one trip.
 */
export function autoSchedule(dayId: ID, input: AutoScheduleInput): { slots: number; dancers: number; endsAt: string } {
  if (!TIME.test(input.start)) throw new ValidationError('Choose a start time.');
  const len = Math.round(Number(input.minutes));
  if (!(len >= 5)) throw new ValidationError('Each slot must be at least 5 minutes.');
  const gap = Math.max(0, Math.round(Number(input.gap) || 0));
  return commit((db) => {
    const day = find(db.scheduleDays, dayId, 'This schedule');
    let t = minutes(input.start);
    let slots = 0;
    let linked = 0;
    const push = (fields: Partial<ScheduleSlot>) => {
      if (t + len > 24 * 60) throw new ValidationError('The schedule would run past midnight. Use shorter slots or fewer dancers.');
      db.scheduleSlots.push({ ...stamp(), dayId, start: fromMinutes(t), end: fromMinutes(t + len), label: '', classId: null, teamId: null, dancerIds: [], capacity: 0, costumeNote: input.costumeNote.trim(), outcomes: {}, bookedBy: {}, notes: '', ...fields });
      t += len + gap;
      slots++;
    };
    if (input.mode === 'groups') {
      const classes = input.classIds.map((id) => find(db.classes, id, 'A selected class')).sort((a, b) => a.name.localeCompare(b.name));
      for (const c of classes) {
        push({ classId: c.id });
        linked += enrolledDancerIds(db, c.id).length;
      }
      for (const id of input.teamIds) {
        const team = find(db.teams, id, 'A selected team');
        push({ teamId: team.id });
        linked += team.dancerIds.length;
      }
      if (input.dancerIds.length) {
        push({ dancerIds: [...new Set(input.dancerIds)], label: 'Individuals' });
        linked += input.dancerIds.length;
      }
    } else {
      const per = Math.max(1, Math.round(Number(input.perSlot) || 1));
      const taken = new Set<ID>();
      for (const s of db.scheduleSlots.filter((x) => x.dayId === dayId)) slotDancerIds(db, s).forEach((d) => taken.add(d));
      const wanted = new Set<ID>(input.dancerIds);
      input.classIds.forEach((c) => enrolledDancerIds(db, c).forEach((d) => wanted.add(d)));
      input.teamIds.forEach((id) => db.teams.find((x) => x.id === id)?.dancerIds.forEach((d) => wanted.add(d)));
      if (input.recitalUnscheduled && day.recitalId) {
        for (const n of db.recitalNumbers.filter((x) => x.recitalId === day.recitalId)) {
          if (n.classId) enrolledDancerIds(db, n.classId).forEach((d) => wanted.add(d));
          if (n.teamId) db.teams.find((x) => x.id === n.teamId)?.dancerIds.forEach((d) => wanted.add(d));
        }
      }
      const dancers = db.dancers.filter((d) => wanted.has(d.id) && !taken.has(d.id));
      dancers.sort((a, b) => {
        if (input.keepSiblingsTogether) {
          const fa = familySortKey(db, a.familyId, a.lastName);
          const fb = familySortKey(db, b.familyId, b.lastName);
          if (fa !== fb) return fa.localeCompare(fb);
        }
        return `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`);
      });
      // Chunk, keeping a family together when it would otherwise be split across two slots.
      let chunk: ID[] = [];
      for (let i = 0; i < dancers.length; i++) {
        const d = dancers[i];
        chunk.push(d.id);
        const next = dancers[i + 1];
        const sameFamily = input.keepSiblingsTogether && next && d.familyId && next.familyId === d.familyId;
        if (chunk.length >= per && !sameFamily) {
          push({ dancerIds: chunk });
          linked += chunk.length;
          chunk = [];
        }
      }
      if (chunk.length) {
        push({ dancerIds: chunk });
        linked += chunk.length;
      }
    }
    if (!slots) throw new ValidationError(input.mode === 'groups' ? 'Choose at least one class, team or dancer.' : 'Everyone you chose already has a time on this day.');
    logActivity(db, `${scheduleKindLabels[day.kind]} times assigned`, `${linked} dancer${linked === 1 ? '' : 's'} in ${slots} slot${slots === 1 ? '' : 's'} · ${day.name}`, dayLink(day));
    return { slots, dancers: linked, endsAt: fromMinutes(t - gap) };
  });
}

function familySortKey(db: Database, familyId: ID | null | undefined, lastName: string) {
  const f = familyId ? db.families.find((x) => x.id === familyId) : undefined;
  return `${f?.name ?? lastName}|${familyId ?? ''}`;
}

/** Link dancers to a slot (staff). Dancers already in another slot that day can be moved. */
export function linkDancers(slotId: ID, dancerIds: ID[], opts: { moveFromOtherSlots?: boolean } = {}) {
  commit((db) => {
    const slot = find(db.scheduleSlots, slotId, 'This time slot');
    for (const d of dancerIds) find(db.dancers, d, 'A selected dancer');
    if (opts.moveFromOtherSlots) {
      for (const s of db.scheduleSlots.filter((x) => x.dayId === slot.dayId && x.id !== slot.id)) {
        s.dancerIds = s.dancerIds.filter((d) => !dancerIds.includes(d));
      }
    }
    slot.dancerIds = [...new Set([...slot.dancerIds, ...dancerIds])];
    slot.updatedAt = nowIso();
  });
}

export function unlinkDancer(slotId: ID, dancerId: ID) {
  commit((db) => {
    const slot = find(db.scheduleSlots, slotId, 'This time slot');
    if (!slot.dancerIds.includes(dancerId)) throw new ValidationError('This dancer is booked through their class or team. Edit the slot to change the group.');
    slot.dancerIds = slot.dancerIds.filter((d) => d !== dancerId);
    delete slot.outcomes[dancerId];
    delete slot.bookedBy[dancerId];
  });
}

/** Move one individually linked dancer to another slot on the same day. */
export function moveDancer(fromSlotId: ID, toSlotId: ID, dancerId: ID) {
  commit((db) => {
    const a = find(db.scheduleSlots, fromSlotId, 'The time slot');
    const b = find(db.scheduleSlots, toSlotId, 'The new time slot');
    if (a.dayId !== b.dayId) throw new ValidationError('Choose a time on the same day.');
    if (!a.dancerIds.includes(dancerId)) throw new ValidationError('This dancer is booked through their class or team.');
    a.dancerIds = a.dancerIds.filter((d) => d !== dancerId);
    delete a.outcomes[dancerId];
    b.dancerIds = [...new Set([...b.dancerIds, dancerId])];
  });
}

export function setOutcome(slotId: ID, dancerId: ID, status: SlotOutcome, note?: string) {
  commit((db) => {
    const slot = find(db.scheduleSlots, slotId, 'This time slot');
    const prev = slot.outcomes[dancerId];
    slot.outcomes[dancerId] = { status, note: note !== undefined ? note.trim() : prev?.note ?? '' };
    slot.updatedAt = nowIso();
  });
}

/** Families book an open spot for their dancer. */
export function bookSlot(slotId: ID, dancerId: ID, familyId: ID) {
  commit((db) => {
    const slot = find(db.scheduleSlots, slotId, 'This time');
    const day = find(db.scheduleDays, slot.dayId, 'This schedule');
    const dancer = find(db.dancers, dancerId, 'This dancer');
    if (dancer.familyId !== familyId) throw new ValidationError('You can only book times for your own dancers.');
    if (!day.published || !day.familyBooking) throw new ValidationError('Booking is not open for this day.');
    if (day.date < todayStr()) throw new ValidationError('This day has already passed.');
    if (slotDancerIds(db, slot).includes(dancerId)) throw new ValidationError(`${dancer.firstName} is already booked at this time.`);
    if (!slotOpenSpots(slot)) throw new ValidationError('Sorry, this time was just taken. Please choose another.');
    const other = db.scheduleSlots.find((s) => s.dayId === day.id && s.id !== slot.id && s.dancerIds.includes(dancerId) && s.capacity > 0);
    if (other) {
      // Re-booking moves the dancer from their previous self-booked time.
      other.dancerIds = other.dancerIds.filter((d) => d !== dancerId);
      delete other.bookedBy[dancerId];
    }
    slot.dancerIds.push(dancerId);
    slot.bookedBy[dancerId] = actorName();
    logActivity(db, `${scheduleKindLabels[day.kind]} booked`, `${fullName(dancer)} · ${fmtDate(day.date)} ${fmtClock(slot.start)}`, dayLink(day));
  });
}

export function cancelBooking(slotId: ID, dancerId: ID, familyId: ID) {
  commit((db) => {
    const slot = find(db.scheduleSlots, slotId, 'This time');
    const dancer = find(db.dancers, dancerId, 'This dancer');
    if (dancer.familyId !== familyId) throw new ValidationError('You can only change your own bookings.');
    if (!slot.bookedBy[dancerId]) throw new ValidationError('This time was set by the studio. Please contact the office to change it.');
    slot.dancerIds = slot.dancerIds.filter((d) => d !== dancerId);
    delete slot.bookedBy[dancerId];
  });
}

/** Publish the schedule and send every family an in-app notice with their dancers' times. */
export function notifyScheduleFamilies(dayId: ID): number {
  return commit((db) => {
    const day = find(db.scheduleDays, dayId, 'This schedule');
    day.published = true;
    const byFamily = new Map<ID, string[]>();
    for (const slot of daySlots(db, dayId)) {
      for (const d of slotDancerIds(db, slot)) {
        const dancer = db.dancers.find((x) => x.id === d);
        if (!dancer?.familyId) continue;
        byFamily.set(dancer.familyId, [...(byFamily.get(dancer.familyId) ?? []), `${dancer.firstName}: ${fmtClock(slot.start)}–${fmtClock(slot.end)} (${slotLabelText(db, slot)})`]);
      }
    }
    const kind = scheduleKindLabels[day.kind];
    for (const [familyId, lines] of byFamily) {
      db.notifications.push({
        ...stamp(),
        key: `schedule:${day.id}:${familyId}:${nowIso()}`,
        kind: 'manual',
        title: `${kind} times — ${day.name}`,
        body: `${fmtDate(day.date)}${day.location ? ` at ${day.location}` : ''}\n${lines.join('\n')}${day.instructions ? `\n\n${day.instructions}` : ''}`,
        familyIds: [familyId],
        staffIds: [],
        admin: false,
        link: '/family/appointments',
        channels: ['email', 'inapp'],
        status: 'sent',
        sendOn: todayStr(),
        sentAt: nowIso(),
        failure: 'EMAIL not sent — provider not connected. Delivered in the app.',
        readBy: [],
      });
    }
    logActivity(db, `${kind} times sent to families`, `${byFamily.size} famil${byFamily.size === 1 ? 'y' : 'ies'} · ${day.name}`, dayLink(day));
    return byFamily.size;
  });
}

export function outcomeText(kind: ScheduleDay['kind'], s: SlotOutcome) {
  return outcomeLabels[kind][s];
}

/* ======================================================= volunteer forms */

export type VolunteerFormInput = Omit<VolunteerForm, 'id' | 'createdAt' | 'updatedAt' | 'isSample'>;

export function saveVolunteerForm(input: VolunteerFormInput, id?: ID): ID {
  const title = req(input.title, 'Title');
  if (input.date && !DATE.test(input.date)) throw new ValidationError('The date is not valid.');
  if (input.deadline && !DATE.test(input.deadline)) throw new ValidationError('The deadline is not valid.');
  const jobs: VolunteerJob[] = input.jobs
    .filter((j) => j.title.trim() || j.description.trim())
    .map((j, i) => {
      const label = `Job ${i + 1}`;
      if (!j.title.trim()) throw new ValidationError(`${label}: add a job title.`);
      if (j.start && !TIME.test(j.start)) throw new ValidationError(`${label}: start time is not valid.`);
      if (j.end && !TIME.test(j.end)) throw new ValidationError(`${label}: end time is not valid.`);
      if (j.start && j.end && j.end <= j.start) throw new ValidationError(`${label}: end time must be after the start time.`);
      const needed = Math.round(Number(j.needed) || 0);
      if (needed < 0) throw new ValidationError(`${label}: people needed cannot be negative.`);
      return { ...j, id: j.id || newId(), title: j.title.trim(), description: j.description.trim(), skill: j.skill.trim(), needed };
    });
  if (!jobs.length) throw new ValidationError('Add at least one job.');
  return commit((db) => {
    const clean = { ...input, title, jobs, description: input.description.trim(), location: input.location.trim(), notes: input.notes.trim() };
    if (id) {
      const f = find(db.volunteerForms, id, 'This sign-up form');
      const removed = f.jobs.filter((j) => !jobs.some((n) => n.id === j.id) && db.volunteerShifts.some((s) => s.formId === id && s.jobId === j.id && s.status !== 'cancelled'));
      if (removed.length) throw new ValidationError(`${removed.map((j) => j.title).join(', ')} already ha${removed.length === 1 ? 's' : 've'} volunteers. Remove them from the job first.`);
      for (const j of jobs) {
        const n = db.volunteerShifts.filter((s) => s.formId === id && s.jobId === j.id && s.status !== 'cancelled').length;
        const prev = f.jobs.find((x) => x.id === j.id)?.needed ?? 0;
        if (j.needed && n > j.needed && (!prev || j.needed < prev)) throw new ValidationError(`${j.title} already has ${n} volunteers — set people needed to at least ${n}.`);
      }
      Object.assign(f, clean, { updatedAt: nowIso() });
      db.volunteerShifts = db.volunteerShifts.filter((s) => s.formId !== id || jobs.some((j) => j.id === s.jobId));
      logActivity(db, 'Volunteer sign-up updated', title, `/volunteer-signups/${id}`);
      return id;
    }
    const rec: VolunteerForm = { ...clean, ...stamp() };
    db.volunteerForms.push(rec);
    logActivity(db, 'Volunteer sign-up created', title, `/volunteer-signups/${rec.id}`);
    return rec.id;
  });
}

export function deleteVolunteerForm(id: ID) {
  commit((db) => {
    const f = find(db.volunteerForms, id, 'This sign-up form');
    db.volunteerForms = db.volunteerForms.filter((x) => x.id !== id);
    db.volunteerShifts = db.volunteerShifts.filter((s) => s.formId !== id);
    logActivity(db, 'Volunteer sign-up deleted', f.title);
  });
}

export function duplicateVolunteerForm(id: ID): ID {
  return commit((db) => {
    const src = find(db.volunteerForms, id, 'This sign-up form');
    const copy: VolunteerForm = { ...structuredClone(src), ...stamp(), isSample: false, title: `${src.title} (copy)`, open: false, jobs: src.jobs.map((j) => ({ ...j, id: newId() })) };
    db.volunteerForms.push(copy);
    return copy.id;
  });
}

export interface VolunteerPerson {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
}

/**
 * Sign someone up for one or more jobs. They are matched to an existing
 * volunteer by email (or name + phone); otherwise a volunteer record is created
 * so they appear in the Volunteers list with their contact details.
 */
export function signUpForJobs(formId: ID, jobIds: ID[], person: VolunteerPerson, opts: { familyId?: ID | null; staff?: boolean; volunteerId?: ID; note?: string } = {}): { volunteerId: ID; created: boolean } {
  if (!jobIds.length) throw new ValidationError('Choose at least one job.');
  return commit((db) => {
    const form = find(db.volunteerForms, formId, 'This sign-up form');
    if (!opts.staff && !isFormAccepting(form)) throw new ValidationError('Sign-ups for this form are closed.');
    let vol: Volunteer | undefined;
    let created = false;
    if (opts.volunteerId) vol = find(db.volunteers, opts.volunteerId, 'This volunteer');
    else {
      const p = { firstName: person.firstName.trim(), lastName: person.lastName.trim(), email: person.email.trim(), phone: person.phone.trim() };
      if (!p.firstName) throw new ValidationError('First name is required.');
      if (!p.email && !p.phone) throw new ValidationError('Add an email or phone number so the studio can reach you.');
      if (p.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email)) throw new ValidationError('Email address does not look right.');
      vol = matchVolunteer(db, p);
      if (vol) {
        if (!vol.email && p.email) vol.email = p.email;
        if (!vol.phone && p.phone) vol.phone = p.phone;
      } else {
        vol = { ...stamp(), ...p, preferredContact: p.email ? 'email' : 'text', skills: [], availability: [], notes: `Signed up through “${form.title}”.` };
        db.volunteers.push(vol);
        created = true;
      }
    }
    const v = vol;
    for (const jobId of jobIds) {
      const job = form.jobs.find((j) => j.id === jobId);
      if (!job) throw new ValidationError('A selected job no longer exists.');
      const shifts = jobShifts(db, formId, jobId);
      if (shifts.some((s) => s.volunteerId === v.id)) throw new ValidationError(`${v.firstName} is already signed up for ${job.title}.`);
      if (job.needed && shifts.length >= job.needed && !opts.staff) throw new ValidationError(`${job.title} is full. Please choose another job.`);
      // A cancelled sign-up is revived instead of duplicated.
      const old = db.volunteerShifts.find((s) => s.formId === formId && s.jobId === jobId && s.volunteerId === v.id);
      if (old) Object.assign(old, { status: 'signed_up', note: (opts.note ?? '').trim(), by: actorName(), updatedAt: nowIso() });
      else db.volunteerShifts.push({ ...stamp(), formId, jobId, volunteerId: v.id, familyId: opts.familyId ?? null, status: 'signed_up', note: (opts.note ?? '').trim(), by: opts.staff ? actorName() : `${v.firstName} ${v.lastName}`.trim() });
    }
    logActivity(db, 'Volunteer signed up', `${v.firstName} ${v.lastName} · ${form.title} (${jobIds.length} job${jobIds.length === 1 ? '' : 's'})`, `/volunteer-signups/${form.id}`);
    return { volunteerId: v.id, created };
  });
}

export function setShiftStatus(id: ID, status: ShiftStatus) {
  commit((db) => {
    const s = find(db.volunteerShifts, id, 'This sign-up');
    if (status !== 'cancelled' && s.status === 'cancelled') {
      const form = find(db.volunteerForms, s.formId, 'This sign-up form');
      const job = form.jobs.find((j) => j.id === s.jobId);
      if (job?.needed && jobShifts(db, s.formId, s.jobId).length >= job.needed) throw new ValidationError(`${job.title} is already full.`);
    }
    s.status = status;
    s.updatedAt = nowIso();
  });
}

/** A family cancels their own sign-up. */
export function cancelOwnShift(id: ID, familyId: ID) {
  commit((db) => {
    const s = find(db.volunteerShifts, id, 'This sign-up');
    if (s.familyId !== familyId) throw new ValidationError('You can only cancel your own sign-ups.');
    s.status = 'cancelled';
    s.updatedAt = nowIso();
  });
}

export function deleteShift(id: ID) {
  commit((db) => {
    db.volunteerShifts = db.volunteerShifts.filter((s) => s.id !== id);
  });
}

export function moveShift(id: ID, toJobId: ID) {
  commit((db) => {
    const s = find(db.volunteerShifts, id, 'This sign-up');
    const form = find(db.volunteerForms, s.formId, 'This sign-up form');
    const job = form.jobs.find((j) => j.id === toJobId);
    if (!job) throw new ValidationError('Choose a job on this form.');
    if (jobShifts(db, form.id, toJobId).some((x) => x.volunteerId === s.volunteerId)) throw new ValidationError('They are already signed up for that job.');
    if (job.needed && jobShifts(db, form.id, toJobId).length >= job.needed) throw new ValidationError(`${job.title} is full.`);
    s.jobId = toJobId;
    s.updatedAt = nowIso();
  });
}

/* ============================================================== tasks */

export type TaskListInput = Omit<TaskList, 'id' | 'createdAt' | 'updatedAt' | 'isSample'>;

export function saveTaskList(input: TaskListInput, id?: ID): ID {
  const name = req(input.name, 'List name');
  if (input.dueDate && !DATE.test(input.dueDate)) throw new ValidationError('The due date is not valid.');
  const clean = { ...input, name, description: input.description.trim() };
  return commit((db) => {
    if (id) {
      Object.assign(find(db.taskLists, id, 'This list'), clean, { updatedAt: nowIso() });
      return id;
    }
    const rec: TaskList = { ...clean, ...stamp() };
    db.taskLists.push(rec);
    logActivity(db, input.kind === 'checklist' ? 'Checklist created' : 'To-do list created', name, `/tasks/${rec.id}`);
    return rec.id;
  });
}

export function deleteTaskList(id: ID) {
  commit((db) => {
    const l = find(db.taskLists, id, 'This list');
    db.taskLists = db.taskLists.filter((x) => x.id !== id);
    db.tasks = db.tasks.filter((t) => t.listId !== id);
    logActivity(db, 'List deleted', l.name);
  });
}

/** Copy a list as a fresh, unchecked list — handy for a checklist used every recital. */
export function duplicateTaskList(id: ID, name?: string): ID {
  return commit((db) => {
    const src = find(db.taskLists, id, 'This list');
    const copy: TaskList = { ...src, ...stamp(), isSample: false, name: (name ?? '').trim() || `${src.name} (copy)`, archived: false };
    db.taskLists.push(copy);
    for (const t of db.tasks.filter((x) => x.listId === id)) db.tasks.push({ ...t, ...stamp(), isSample: false, listId: copy.id, done: false, doneAt: '', doneBy: '' });
    return copy.id;
  });
}

/** Uncheck every item (reuse a checklist). */
export function resetTaskList(id: ID) {
  commit((db) => {
    find(db.taskLists, id, 'This list');
    for (const t of db.tasks) if (t.listId === id) Object.assign(t, { done: false, doneAt: '', doneBy: '' });
  });
}

export function clearCompleted(id: ID): number {
  return commit((db) => {
    const before = db.tasks.length;
    db.tasks = db.tasks.filter((t) => !(t.listId === id && t.done));
    return before - db.tasks.length;
  });
}

export type TaskInput = Pick<TaskItem, 'title' | 'notes' | 'dueDate' | 'assigneeStaffId' | 'assigneeVolunteerId' | 'priority'>;

/** Add items. Each non-empty line of `title` becomes its own item, so a pasted list works. */
export function addTasks(listId: ID, input: TaskInput): ID[] {
  const titles = input.title.split('\n').map((s) => s.replace(/^\s*(?:[-*•]|\[ ?\]|\d+[.)])\s*/, '').trim()).filter(Boolean);
  if (!titles.length) throw new ValidationError('Type an item first.');
  if (input.dueDate && !DATE.test(input.dueDate)) throw new ValidationError('The due date is not valid.');
  return commit((db) => {
    find(db.taskLists, listId, 'This list');
    let order = db.tasks.filter((t) => t.listId === listId).reduce((m, t) => Math.max(m, t.order), 0);
    return titles.map((title) => {
      const rec: TaskItem = { ...stamp(), listId, ...input, title, notes: titles.length === 1 ? input.notes.trim() : '', done: false, doneAt: '', doneBy: '', order: ++order };
      db.tasks.push(rec);
      return rec.id;
    });
  });
}

export function updateTask(id: ID, patch: Partial<TaskInput>) {
  if (patch.title !== undefined) req(patch.title, 'Item');
  if (patch.dueDate && !DATE.test(patch.dueDate)) throw new ValidationError('The due date is not valid.');
  commit((db) => {
    const t = find(db.tasks, id, 'This item');
    Object.assign(t, patch, { updatedAt: nowIso() });
    if (patch.title !== undefined) t.title = patch.title.trim();
  });
}

export function toggleTask(id: ID, done?: boolean) {
  commit((db) => {
    const t = find(db.tasks, id, 'This item');
    t.done = done ?? !t.done;
    t.doneAt = t.done ? nowIso() : '';
    t.doneBy = t.done ? actorName() : '';
    t.updatedAt = nowIso();
  });
}

export function deleteTask(id: ID) {
  commit((db) => {
    db.tasks = db.tasks.filter((t) => t.id !== id);
  });
}

export function moveTask(id: ID, dir: -1 | 1) {
  commit((db) => {
    const t = find(db.tasks, id, 'This item');
    const items = db.tasks.filter((x) => x.listId === t.listId).sort((a, b) => a.order - b.order);
    const i = items.indexOf(t);
    const other = items[i + dir];
    if (!other) return;
    [t.order, other.order] = [other.order, t.order];
  });
}

import type { Database, ID, ScheduleDay, ScheduleSlot, TaskItem, TaskList, VolunteerForm, VolunteerShift } from './types';
import { newId, nowIso, todayStr } from './ids';
import { addDays, enrolledDancerIds } from './studio';

/**
 * Sample data for the planning modules: a costume fitting day with dancers
 * linked to times (one needs an alteration), a picture day with class group
 * photos and open individual times, a volunteer sign-up form for the recital
 * with jobs and sign-ups, a reusable recital-day checklist and an office
 * to-do list. Plain records, all flagged isSample.
 */
export function addSamplePlanning(db: Database): Database {
  if (!Array.isArray(db.scheduleDays)) return db;
  const t = nowIso();
  const base = () => ({ id: newId(), createdAt: t, updatedAt: t, isSample: true as const });
  const today = todayStr();
  const dancer = (first: string) => db.dancers.find((d) => d.isSample && d.firstName === first);
  const did = (first: string) => dancer(first)?.id ?? '';
  const cls = (name: string) => db.classes.find((c) => c.isSample && c.name === name);
  const staff = (first: string) => db.staff.find((s) => s.isSample && s.firstName === first)?.id ?? null;
  const vol = (first: string) => db.volunteers.find((v) => v.isSample && v.firstName === first)?.id ?? null;
  const recital = db.recitals.find((r) => r.isSample) ?? null;
  const team = (name: string) => db.teams.find((x) => x.isSample && x.name === name);
  const ids = (list: (ID | null | undefined)[]) => list.filter(Boolean) as ID[];

  /* fitting day */
  const fitting: ScheduleDay = {
    ...base(),
    kind: 'fitting',
    name: 'Recital Costume Fittings',
    date: addDays(today, 9),
    startTime: '15:30',
    endTime: '19:30',
    slotMinutes: 15,
    location: 'Studio B',
    recitalId: recital?.id ?? null,
    staffIds: ids([staff('Olivia')]),
    volunteerIds: ids([vol('Dana'), vol('Priya')]),
    photographer: '',
    instructions: 'Please arrive in a leotard and tights with hair pulled back. Fittings take about 15 minutes per dancer.',
    published: true,
    familyBooking: true,
    notes: 'Sample fitting day. Dana brings the serger; pins and safety pins in the blue bin.',
  };
  db.scheduleDays.push(fitting);
  const slot = (day: ScheduleDay, start: string, end: string, fields: Partial<ScheduleSlot> = {}): ScheduleSlot => {
    const s: ScheduleSlot = { ...base(), dayId: day.id, start, end, label: '', classId: null, teamId: null, dancerIds: [], capacity: 0, costumeNote: '', outcomes: {}, bookedBy: {}, notes: '', ...fields };
    db.scheduleSlots.push(s);
    return s;
  };
  const f1 = slot(fitting, '15:30', '15:45', { dancerIds: ids([did('Emma'), did('Mia')]), costumeNote: 'Sunshine Jazz Set — check jacket length' });
  f1.outcomes[did('Emma')] = { status: 'done', note: '' };
  f1.outcomes[did('Mia')] = { status: 'alteration', note: 'Take in waist 1 inch' };
  slot(fitting, '15:45', '16:00', { dancerIds: ids([did('Chloe'), did('Lily')]) });
  slot(fitting, '16:00', '16:15', { dancerIds: ids([did('Ava'), did('Sophia')]), costumeNote: 'Contemporary unitards' });
  slot(fitting, '16:15', '16:30', { dancerIds: ids([did('Grace'), did('Harper')]) });
  slot(fitting, '16:30', '16:45', { capacity: 2, label: 'Open fitting' });
  slot(fitting, '16:45', '17:00', { capacity: 2, label: 'Open fitting' });

  /* picture day */
  const pic: ScheduleDay = {
    ...base(),
    kind: 'picture_day',
    name: 'Recital Picture Day',
    date: recital?.pictureDay && recital.pictureDay >= today ? recital.pictureDay : addDays(today, 30),
    startTime: '09:00',
    endTime: '14:00',
    slotMinutes: 15,
    location: 'Studio A',
    recitalId: recital?.id ?? null,
    staffIds: ids([staff('Rachel')]),
    volunteerIds: ids([vol('Tom')]),
    photographer: 'Bright Lights Photography',
    instructions: 'Arrive 15 minutes early, fully dressed in your recital costume with recital hair and makeup. Bring your accessories in a labelled bag.',
    published: true,
    familyBooking: true,
    notes: 'Sample picture day. Class photos first, then individuals and siblings.',
  };
  db.scheduleDays.push(pic);
  let at = 9 * 60;
  const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  for (const name of ['Junior Ballet & Tap Combo', 'Jazz 2', 'Ballet 3', 'Tap 3']) {
    const c = cls(name);
    if (!c || !enrolledDancerIds(db, c.id).length) continue;
    slot(pic, hhmm(at), hhmm(at + 15), { classId: c.id, costumeNote: 'Group photo in recital costume' });
    at += 15;
  }
  const senior = team('Senior Competition Team');
  if (senior) {
    slot(pic, hhmm(at), hhmm(at + 15), { teamId: senior.id, costumeNote: 'Team photo in company jackets' });
    at += 15;
  }
  at += 15;
  const ind1 = slot(pic, hhmm(at), hhmm(at + 10), { label: 'Individuals & siblings', capacity: 3, dancerIds: ids([did('Emma')]) });
  ind1.bookedBy[did('Emma')] = 'Sample parent';
  slot(pic, hhmm(at + 10), hhmm(at + 20), { label: 'Individuals & siblings', capacity: 3 });
  slot(pic, hhmm(at + 20), hhmm(at + 30), { label: 'Individuals & siblings', capacity: 3 });

  /* volunteer sign-up form */
  const job = (title: string, description: string, date: string, start: string, end: string, needed: number, skill: string) => ({ id: newId(), title, description, date, start, end, needed, skill });
  const showDay = recital?.startDate || addDays(today, 60);
  const dress = addDays(showDay, -1);
  const form: VolunteerForm = {
    ...base(),
    title: 'Spring Recital Volunteers',
    description: 'Our recital runs on parent power! Pick one or more jobs below. Volunteers get a free recital DVD.',
    date: showDay,
    location: recital?.venue || 'High School Auditorium',
    recitalId: recital?.id ?? null,
    deadline: addDays(showDay, -14),
    open: true,
    isPublic: true,
    jobs: [
      job('Backstage mom / dad', 'Supervise a dressing room, keep dancers quiet and get them to the wings on time.', showDay, '12:30', '17:00', 6, 'Chaperone'),
      job('Quick-change helper', 'Help dancers with fast costume changes side-stage.', showDay, '12:30', '17:00', 3, 'Quick changes / dressing'),
      job('Hair & makeup station', 'Touch-ups and buns for younger dancers.', showDay, '11:30', '14:00', 2, 'Hair & makeup'),
      job('Usher', 'Hand out programs and help guests find seats.', showDay, '13:00', '15:00', 4, 'Ushering'),
      job('Ticket table', 'Will-call and door sales.', showDay, '12:30', '14:30', 2, 'Ticketing'),
      job('Dress rehearsal runner', 'Line up classes and bring them to the stage.', dress, '16:00', '21:00', 3, ''),
      job('Bake sale donation', 'Bring baked goods for the lobby sale (no nuts please).', showDay, '', '', 0, ''),
    ],
    notes: 'Sample volunteer sign-up form.',
  };
  db.volunteerForms.push(form);
  const shift = (jobIndex: number, volunteerId: ID | null, status: VolunteerShift['status'] = 'signed_up') => {
    if (!volunteerId) return;
    db.volunteerShifts.push({ ...base(), formId: form.id, jobId: form.jobs[jobIndex].id, volunteerId, familyId: null, status, note: '', by: 'Sample' });
  };
  shift(0, vol('Dana'), 'confirmed');
  shift(1, vol('Priya'), 'confirmed');
  shift(2, vol('Priya'));
  shift(3, vol('Tom'));
  shift(4, vol('Tom'));
  shift(5, vol('Marcus'), 'confirmed');

  /* checklists & to-dos */
  const list = (l: Omit<TaskList, 'id' | 'createdAt' | 'updatedAt' | 'isSample'>) => {
    const rec: TaskList = { ...base(), ...l };
    db.taskLists.push(rec);
    return rec;
  };
  let order = 0;
  const item = (listId: ID, title: string, extra: Partial<TaskItem> = {}) =>
    db.tasks.push({ ...base(), listId, title, notes: '', done: false, doneAt: '', doneBy: '', dueDate: '', assigneeStaffId: null, assigneeVolunteerId: null, priority: 'normal', order: ++order, ...extra });

  const recitalDay = list({ name: 'Recital Day Checklist', kind: 'checklist', description: 'Run through this the morning of every recital. Use “Reset” afterwards to reuse it.', dueDate: showDay, visibility: 'staff', recitalId: recital?.id ?? null, archived: false });
  for (const x of ['Music on two devices + USB backup', 'Running order printed for stage manager, sound and each dressing room', 'First-aid kit & ice packs', 'Sewing kit, safety pins, bobby pins, hairspray', 'Spare tights in every size', 'Sign-in sheets and dressing room labels', 'Volunteer badges & lanyards', 'Cash box with change for ticket table', 'Water and snacks for dancers backstage', 'Flowers for teachers'])
    item(recitalDay.id, x);

  const office = list({ name: 'Recital To-Dos', kind: 'todo', description: 'Office tasks leading up to the spring recital.', dueDate: showDay, visibility: 'office', recitalId: recital?.id ?? null, archived: false });
  order = 0;
  item(office.id, 'Order recital costumes for Ballet 3', { done: true, doneAt: t, doneBy: 'Studio Owner', priority: 'high', dueDate: addDays(today, -10) });
  item(office.id, 'Book the photographer for picture day', { done: true, doneAt: t, doneBy: 'Studio Owner' });
  item(office.id, 'Send fitting times to families', { dueDate: addDays(today, 2), priority: 'high', assigneeStaffId: staff('Olivia') });
  item(office.id, 'Confirm auditorium tech rehearsal time', { dueDate: addDays(today, -1), priority: 'high' });
  item(office.id, 'Finalize program ad sales', { dueDate: addDays(today, 21) });
  item(office.id, 'Collect music edits from teachers', { dueDate: addDays(today, 14), assigneeStaffId: staff('Rachel') });
  item(office.id, 'Recruit two more quick-change helpers', { dueDate: addDays(today, 10), assigneeVolunteerId: vol('Dana'), priority: 'low' });

  const teach = list({ name: 'Teacher Prep Before Picture Day', kind: 'checklist', description: 'For every teacher with a class in the recital.', dueDate: '', visibility: 'staff', recitalId: recital?.id ?? null, archived: false });
  order = 0;
  for (const x of ['Confirm costume pieces for every dancer', 'Send hair & makeup instructions to families', 'Plan group photo pose', 'Check accessories are labelled']) item(teach.id, x);
  return db;
}

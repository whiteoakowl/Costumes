import type { AttendanceStatus, Database, DanceClass, ID, StaffMember, UserAccount } from './types';
import { newId, nowIso, todayStr } from './ids';
import { fmtDate } from './time';
import { addDays, durationHours, ensureOwnerAccount, occurrencesBetween, weekdayOf } from './studio';

/**
 * Sample studio: a current school year, classrooms, staff, families with
 * parents and emergency contacts, weekly classes with enrollments (one full
 * class with a waiting list), closures, a cancellation, a substitute,
 * recent attendance, teacher hours, accounts for each portal and
 * announcements. Every record is flagged isSample.
 */
export function addSampleStudio(db: Database): Database {
  const t = nowIso();
  const base = () => ({ id: newId(), createdAt: t, updatedAt: t, isSample: true as const });
  const today = todayStr();
  const y = Number(today.slice(0, 4));
  const startYear = Number(today.slice(5, 7)) >= 7 ? y : y - 1;
  const firstWeekday = (year: number, month: number, weekday: number, from = 1) => {
    let d = `${year}-${String(month).padStart(2, '0')}-${String(from).padStart(2, '0')}`;
    while (weekdayOf(d) !== weekday) d = addDays(d, 1);
    return d;
  };

  /* school year & rooms */
  const year = {
    ...base(),
    name: `${startYear}–${startYear + 1}`,
    startDate: firstWeekday(startYear, 9, 1),
    endDate: `${startYear + 1}-06-13`,
    registrationStart: `${startYear}-07-01`,
    registrationEnd: `${startYear + 1}-05-31`,
    status: (db.schoolYears.some((x) => x.status === 'current') ? 'planning' : 'current') as 'current' | 'planning',
    tuitionNotes: 'Monthly tuition due on the 1st. Sibling discount 10%.',
    recitalInfo: 'Spring Recital in June — see Shows.',
    notes: 'Sample school year.',
  };
  db.schoolYears.push(year);
  const room = (name: string, capacity: number) => {
    const r = { ...base(), name, capacity, notes: '' };
    db.classrooms.push(r);
    return r.id;
  };
  const studioA = room('Studio A', 20);
  const studioB = room('Studio B', 16);
  const studioC = room('Studio C', 12);

  /* staff */
  const staff = (firstName: string, lastName: string, position: StaffMember['position'], title: string, styles: string[], payType: StaffMember['payType'], payRate: number, extra: Partial<StaffMember> = {}) => {
    const s: StaffMember = {
      ...base(),
      firstName,
      lastName,
      email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}@example.com`,
      phone: `(555) 4${String(db.staff.length).padStart(2, '0')}-7${String(db.staff.length * 37).padStart(3, '0').slice(-3)}`,
      address: '',
      emergencyContact: '',
      hireDate: `${startYear - 2 - db.staff.length}-08-15`,
      position,
      title,
      styles,
      qualifications: '',
      payType,
      payRate,
      status: 'active',
      notes: 'Sample staff member.',
      ...extra,
    };
    db.staff.push(s);
    return s.id;
  };
  const elena = staff('Elena', 'Morales', 'teacher', 'Ballet Director', ['Ballet', 'Pointe', 'Creative Movement'], 'hourly', 34, { qualifications: 'RAD certified; BFA Dance' });
  const james = staff('James', 'Carter', 'teacher', 'Jazz & Hip Hop Faculty', ['Jazz', 'Hip Hop'], 'hourly', 28);
  const rachel = staff('Rachel', 'Kim', 'teacher', 'Tap & Contemporary Faculty', ['Tap', 'Contemporary', 'Lyrical'], 'hourly', 30);
  const olivia = staff('Olivia', 'Brooks', 'assistant', 'Assistant Teacher', ['Ballet', 'Jazz'], 'hourly', 16);
  const nina = staff('Nina', 'Patel', 'substitute', 'Substitute Teacher', ['Jazz', 'Contemporary', 'Ballet'], 'hourly', 30);
  const karen = staff('Karen', 'Lewis', 'office', 'Office Manager', [], 'salary', 42000);
  const sam = staff('Sam', 'Ortiz', 'performance', 'Stage Manager', [], 'hourly', 22);

  /* families, parents, emergency contacts */
  const dancer = (first: string) => db.dancers.find((d) => d.isSample && d.firstName === first);
  const family = (name: string, city: string, guardians: [string, string, string][], dancers: string[], emergency: [string, string, string]) => {
    const f = { ...base(), name, address: `${100 + db.families.length * 17} Maple Street`, city, state: 'IL', zip: '62704', status: 'active' as const, notes: 'Sample family.' };
    db.families.push(f);
    guardians.forEach(([firstName, lastName, relationship], i) =>
      db.guardians.push({
        ...base(),
        familyId: f.id,
        firstName,
        lastName,
        relationship,
        email: `${firstName.toLowerCase()}.${lastName.toLowerCase().replace(/\W/g, '')}@example.com`,
        phone: `(555) 2${String(db.guardians.length).padStart(2, '0')}-${String(1000 + db.guardians.length * 97).slice(-4)}`,
        isPrimary: i === 0,
        emailConsent: true,
        smsConsent: i === 0,
      }),
    );
    db.emergencyContacts.push({ ...base(), familyId: f.id, name: emergency[0], relationship: emergency[1], phone: emergency[2], notes: '' });
    for (const first of dancers) {
      const d = dancer(first);
      if (d) Object.assign(d, { familyId: f.id, enrollmentStatus: 'active', enrollmentDate: year.startDate });
    }
    return f.id;
  };
  const thompson = family('Thompson Family', 'Springfield', [['Laura', 'Thompson', 'Mother'], ['Mark', 'Thompson', 'Father']], ['Ava'], ['Ruth Thompson', 'Grandmother', '(555) 310-2201']);
  const chen = family('Chen Family', 'Springfield', [['Mei', 'Chen', 'Mother'], ['David', 'Chen', 'Father']], ['Lily'], ['Grace Wu', 'Aunt', '(555) 310-8890']);
  family('Martinez Family', 'Chatham', [['Rosa', 'Martinez', 'Mother']], ['Sophia'], ['Luis Martinez', 'Uncle', '(555) 310-4471']);
  family('Johnson Family', 'Springfield', [['Kelly', 'Johnson', 'Mother']], ['Emma'], ['Pat Johnson', 'Grandfather', '(555) 310-1192']);
  family('Patel Family', 'Rochester', [['Anita', 'Patel', 'Mother'], ['Raj', 'Patel', 'Father']], ['Grace'], ['Sunita Rao', 'Family friend', '(555) 310-6610']);
  const rn = family('Robinson-Nguyen Family', 'Springfield', [['Tasha', 'Robinson', 'Mother'], ['Minh', 'Nguyen', 'Stepfather']], ['Mia', 'Chloe'], ['Joyce Robinson', 'Grandmother', '(555) 310-7745']);
  family('Williams Family', 'Chatham', [['Brenda', 'Williams', 'Guardian']], ['Harper'], ['Carl Williams', 'Uncle', '(555) 310-3321']);
  const lily = dancer('Lily');
  if (lily) lily.medicalNotes = 'Mild asthma — inhaler is in her dance bag.';
  const grace = dancer('Grace');
  if (grace) grace.allergies = 'Latex';

  /* classes */
  const cls = (name: string, style: string, level: string, ages: [number, number], dayOfWeek: number, startTime: string, endTime: string, classroomId: ID, teacherId: ID, assistantId: ID | null, max: number, tuition: number, dancers: string[], waitlist: string[] = []) => {
    const c: DanceClass = {
      ...base(),
      schoolYearId: year.id,
      name,
      style,
      level,
      ageMin: ages[0],
      ageMax: ages[1],
      dayOfWeek,
      startTime,
      endTime,
      classroomId,
      teacherId,
      assistantId,
      maxEnrollment: max,
      description: `${style} for ${level}.`,
      notes: '',
      tuition,
      startDate: '',
      endDate: '',
    };
    db.classes.push(c);
    for (const n of dancers) {
      const d = dancer(n);
      if (d) db.enrollments.push({ ...base(), classId: c.id, dancerId: d.id, status: 'enrolled', enrolledOn: year.startDate, droppedOn: '' });
    }
    for (const n of waitlist) {
      const d = dancer(n);
      if (d) db.enrollments.push({ ...base(), classId: c.id, dancerId: d.id, status: 'waitlist', enrolledOn: year.startDate, droppedOn: '' });
    }
    return c;
  };
  const levels = db.settings.levels;
  const L = (i: number) => levels[Math.min(i, levels.length - 1)] ?? 'All levels';
  cls('Ballet 3', 'Ballet', L(3), [10, 12], 1, '16:30', '17:30', studioA, elena, olivia, 12, 85, ['Lily', 'Emma', 'Grace']);
  cls('Ballet 5 & Pointe', 'Pointe', L(5), [14, 18], 1, '17:30', '19:00', studioA, elena, null, 10, 105, ['Ava', 'Sophia', 'Harper']);
  const jazz2 = cls('Jazz 2', 'Jazz', L(2), [8, 11], 2, '16:00', '17:00', studioB, james, olivia, 14, 80, ['Emma', 'Mia', 'Chloe']);
  cls('Teen Hip Hop', 'Hip Hop', 'Teen', [13, 18], 2, '17:00', '18:00', studioB, james, null, 16, 80, ['Ava', 'Harper', 'Grace']);
  const tap3 = cls('Tap 3', 'Tap', L(3), [10, 13], 3, '16:30', '17:30', studioC, rachel, null, 12, 80, ['Lily', 'Grace']);
  cls('Contemporary Company', 'Contemporary', 'Company', [13, 18], 4, '17:00', '18:30', studioA, rachel, olivia, 12, 95, ['Ava', 'Sophia', 'Grace', 'Harper']);
  cls('Junior Ballet & Tap Combo', 'Ballet', L(1), [6, 9], 6, '10:00', '11:00', studioC, elena, olivia, 2, 70, ['Mia', 'Chloe'], ['Emma']);

  /* calendar: closures & special entries */
  const ev = (title: string, type: Database['studioEvents'][number]['type'], startDate: string, endDate: string, cancels: boolean, extra: Partial<Database['studioEvents'][number]> = {}) =>
    db.studioEvents.push({ ...base(), title, type, startDate, endDate, allDay: true, startTime: '', endTime: '', classroomId: null, location: '', cancelsClasses: cancels, schoolYearId: year.id, notes: '', ...extra });
  let thanksgiving = firstWeekday(startYear, 11, 4);
  thanksgiving = addDays(thanksgiving, 21);
  ev('Thanksgiving Break', 'holiday', addDays(thanksgiving, -1), addDays(thanksgiving, 2), true);
  ev('Winter Break', 'closure', `${startYear}-12-21`, `${startYear + 1}-01-03`, true);
  ev('Spring Break', 'closure', firstWeekday(startYear + 1, 3, 1, 23), addDays(firstWeekday(startYear + 1, 3, 1, 23), 6), true);
  ev('Guest Master Class: Contemporary', 'master_class', addDays(today, 12 + ((6 - weekdayOf(addDays(today, 12)) + 7) % 7)), addDays(today, 12 + ((6 - weekdayOf(addDays(today, 12)) + 7) % 7)), false, { allDay: false, startTime: '13:00', endTime: '15:00', classroomId: studioA, notes: 'Open to Level 4 and up.' });
  ev('Nutcracker Stage Rehearsal', 'rehearsal', addDays(today, 33), addDays(today, 33), false, { allDay: false, startTime: '16:00', endTime: '20:00', location: 'Riverside Performing Arts Center' });
  ev('Picture Day', 'important', addDays(today, 20), addDays(today, 20), false, { notes: 'Bring recital costumes, hair in a classical bun.' });

  /* one cancelled class and one substitute, both next week */
  const next = (c: DanceClass) => addDays(today, ((c.dayOfWeek - weekdayOf(today) + 7) % 7) || 7);
  const tapDate = next(tap3);
  db.sessionChanges.push({ ...base(), classId: tap3.id, date: tapDate, cancelled: true, newDate: '', newStartTime: '', newEndTime: '', newClassroomId: null, substituteId: null, reason: 'Teacher at a tap conference — makeup class to be scheduled' });
  const jazzDate = next(jazz2);
  db.sessionChanges.push({ ...base(), classId: jazz2.id, date: jazzDate, cancelled: false, newDate: '', newStartTime: '', newEndTime: '', newClassroomId: null, substituteId: nina, reason: 'James is choreographing for competition' });
  const familiesOf = (c: DanceClass) => [...new Set(db.enrollments.filter((e) => e.classId === c.id && e.status === 'enrolled').map((e) => db.dancers.find((d) => d.id === e.dancerId)?.familyId).filter(Boolean) as ID[])];
  db.notices.push(
    { ...base(), title: `Tap 3 cancelled ${fmtDate(tapDate)}`, body: 'Tap 3 is cancelled next week: teacher at a tap conference. A makeup class will be scheduled.', kind: 'cancellation', staffIds: [rachel], familyIds: familiesOf(tap3), classId: tap3.id, author: 'Studio Owner', readBy: [] },
    { ...base(), title: `Jazz 2 substitute ${fmtDate(jazzDate)}`, body: 'Nina Patel will teach Jazz 2 next week.', kind: 'schedule', staffIds: [james, nina, olivia], familyIds: familiesOf(jazz2), classId: jazz2.id, author: 'Studio Owner', readBy: [] },
  );

  /* attendance for the last three weeks */
  const statuses: AttendanceStatus[] = ['present', 'present', 'present', 'late', 'present', 'absent', 'present', 'excused', 'present', 'present'];
  let k = 0;
  const from = addDays(today, -21) > year.startDate ? addDays(today, -21) : year.startDate;
  const past = occurrencesBetween(db, from, addDays(today, -1));
  for (const o of past) {
    for (const e of db.enrollments.filter((x) => x.classId === o.classId && x.status === 'enrolled')) {
      const status = statuses[k++ % statuses.length];
      db.attendance.push({ ...base(), classId: o.classId, date: o.date, dancerId: e.dancerId, status, note: status === 'excused' ? 'Family trip' : '', takenBy: 'Sample' });
    }
  }

  /* teacher hours: class hours from the schedule (older approved, recent pending) + extras */
  const staffMap = new Map(db.staff.map((s) => [s.id, s]));
  for (const o of past) {
    for (const [sid, assistant] of [[o.teacherId, false], [o.assistantId, true]] as [ID | null, boolean][]) {
      if (!sid) continue;
      const s = staffMap.get(sid)!;
      const hrs = durationHours(o.start, o.end);
      const approved = o.date < addDays(today, -7);
      db.timeEntries.push({
        ...base(),
        staffId: sid,
        date: o.date,
        kind: 'class',
        classId: o.classId,
        scheduledHours: hrs,
        hours: hrs,
        rate: s.payRate,
        description: `${o.cls.name}${assistant ? ' (assistant)' : ''}`,
        status: approved ? 'approved' : 'pending',
        submittedBy: 'From schedule',
        reviewedBy: approved ? 'Studio Owner' : '',
        reviewedAt: approved ? t : '',
        reviewNote: '',
        history: [{ at: t, by: 'Sample', change: 'Created from the class schedule' }, ...(approved ? [{ at: t, by: 'Studio Owner', change: 'Approved' }] : [])],
      });
    }
  }
  const extra = (staffId: ID, daysAgo: number, kind: Database['timeEntries'][number]['kind'], hours: number, description: string, status: 'pending' | 'approved') =>
    db.timeEntries.push({ ...base(), staffId, date: addDays(today, -daysAgo), kind, classId: null, scheduledHours: 0, hours, rate: staffMap.get(staffId)!.payRate, description, status, submittedBy: staffMap.get(staffId)!.firstName, reviewedBy: status === 'approved' ? 'Studio Owner' : '', reviewedAt: status === 'approved' ? t : '', reviewNote: '', history: [{ at: t, by: staffMap.get(staffId)!.firstName, change: `Submitted ${hours} h` }] });
  extra(elena, 3, 'additional', 1.5, 'Nutcracker costume fittings', 'pending');
  extra(james, 9, 'rehearsal', 2, 'Competition team rehearsal', 'approved');
  extra(rachel, 5, 'private', 1, 'Private lesson — Sophia M.', 'pending');

  /* accounts for each portal */
  const owner = ensureOwnerAccount(db);
  const acct = (displayName: string, role: UserAccount['role'], link: Partial<UserAccount>) =>
    db.accounts.push({ ...base(), displayName, email: '', role, active: true, staffId: null, guardianId: null, dancerId: null, permissions: null, lastActiveAt: '', notes: 'Sample account for previewing this portal.', ...link });
  const guardian = (familyId: ID, first: string) => db.guardians.find((g) => g.familyId === familyId && g.firstName === first);
  acct('Karen Lewis', 'office_admin', { staffId: karen, email: 'karen.lewis@example.com' });
  acct('Elena Morales', 'teacher', { staffId: elena, email: 'elena.morales@example.com' });
  acct('Olivia Brooks', 'assistant_teacher', { staffId: olivia, email: 'olivia.brooks@example.com' });
  acct('Mei Chen', 'parent', { guardianId: guardian(chen, 'Mei')?.id ?? null, email: 'mei.chen@example.com' });
  acct('David Chen', 'parent', { guardianId: guardian(chen, 'David')?.id ?? null, email: 'david.chen@example.com' });
  acct('Tasha Robinson', 'parent', { guardianId: guardian(rn, 'Tasha')?.id ?? null, email: 'tasha.robinson@example.com' });
  acct('Laura Thompson', 'parent', { guardianId: guardian(thompson, 'Laura')?.id ?? null, email: 'laura.thompson@example.com' });
  acct('Sam Ortiz', 'performance_staff', { staffId: sam, email: 'sam.ortiz@example.com' });
  void owner;

  /* announcements */
  db.announcements.push(
    { ...base(), title: 'Picture Day is coming up', body: 'Picture Day is in about three weeks. Dancers should arrive in their recital costume with hair in a classical bun. Check the calendar for your class time.', audience: 'everyone', classId: null, author: 'Studio Owner', pinned: true },
    { ...base(), title: 'Staff meeting Sunday', body: 'Quick staff meeting Sunday at 4 PM in Studio A to plan Nutcracker backstage assignments.', audience: 'staff', classId: null, author: 'Studio Owner', pinned: false },
  );
  db.activity.push({ ...base(), actor: 'Studio Owner', action: 'Sample studio created', detail: `${db.classes.length} classes, ${db.families.length} families, ${db.staff.length} staff`, link: '/' });
  return db;
}

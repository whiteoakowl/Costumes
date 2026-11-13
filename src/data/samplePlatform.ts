import type { Database, ID, Invoice, InvoiceLine } from './types';
import { newId, nowIso, todayStr } from './ids';
import { addDays } from './studio';

/**
 * Sample data for the platform modules: teams, a recital with numbers, a
 * running order with a tight quick change, checkouts (one overdue), tuition
 * and costume invoices with payments and a credit, events with sign-ups, a
 * pending registration, policies with signatures, fundraisers, ticket sales,
 * messages, a class video, a class note and a teacher's schedule request.
 * Built as plain records (no actions), all flagged isSample.
 */
export function addSamplePlatform(db: Database): Database {
  const t = nowIso();
  const base = () => ({ id: newId(), createdAt: t, updatedAt: t, isSample: true as const });
  const today = todayStr();
  const dancer = (first: string) => db.dancers.find((d) => d.isSample && d.firstName === first);
  const did = (first: string) => dancer(first)?.id ?? '';
  const cls = (name: string) => db.classes.find((c) => c.isSample && c.name === name);
  const costume = (name: string) => db.costumes.find((c) => c.isSample && c.name === name);
  const staff = (first: string) => db.staff.find((s) => s.isSample && s.firstName === first)?.id ?? null;
  const year = db.schoolYears.find((y) => y.isSample) ?? db.schoolYears[0];
  const fam = (first: string) => dancer(first)?.familyId ?? null;
  if (!year) return db;

  /* teams */
  const junior = { ...base(), name: 'Junior Company', description: 'Ages 8–11 performing company.', schoolYearId: year.id, dancerIds: [did('Emma'), did('Mia'), did('Chloe'), did('Lily')].filter(Boolean), teacherIds: [staff('James'), staff('Olivia')].filter(Boolean) as ID[], classIds: [cls('Jazz 2')?.id].filter(Boolean) as ID[], requirements: 'Two technique classes per week plus Saturday rehearsal.', rehearsalSchedule: 'Saturdays 11:15 AM–12:30 PM, Studio B', competitionSchedule: 'Regional Dance Challenge (March) · StarQuest (April)', fee: 350, feeNotes: 'Covers choreography and competition entries.', notes: '', archived: false };
  const senior = { ...base(), name: 'Senior Competition Team', description: 'Ages 13–18 competition team.', schoolYearId: year.id, dancerIds: [did('Ava'), did('Sophia'), did('Grace'), did('Harper')].filter(Boolean), teacherIds: [staff('Rachel'), staff('Elena')].filter(Boolean) as ID[], classIds: [cls('Contemporary Company')?.id].filter(Boolean) as ID[], requirements: 'Ballet 3×/week, contemporary and conditioning.', rehearsalSchedule: 'Sundays 1:00–4:00 PM, Studio A', competitionSchedule: 'Regional Dance Challenge (March) · Nationals (July)', fee: 600, feeNotes: '', notes: '', archived: false };
  db.teams.push(junior, senior);

  /* recital with one number per class */
  const springShow = db.shows.find((s) => s.isSample && s.name.toLowerCase().includes('spring'));
  const recital = { ...base(), name: 'Spring Recital: Through the Seasons', theme: 'Through the Seasons', schoolYearId: year.id, showId: springShow?.id ?? null, startDate: springShow?.startDate || addDays(today, 170), endDate: springShow?.endDate || addDays(today, 171), venue: 'High School Auditorium', address: '500 School Street, Springfield', performanceTimes: 'Saturday 2:00 PM & 6:30 PM · Sunday 1:00 PM', rehearsalSchedule: 'Dress rehearsal Friday 4:00–9:00 PM at the auditorium', pictureDay: addDays(today, 140), ticketInfo: '$18 adults · $12 students · on sale 6 weeks before', notes: 'Sample recital.', status: 'planning' as const };
  db.recitals.push(recital);
  const songs: Record<string, [string, string, string | null, string, number]> = {
    'Ballet 3': ['Spring Waltz', 'Chopin', 'Butterfly Lyrical Dress', 'Pink tights, pink ballet slippers', 4],
    'Ballet 5 & Pointe': ['Vivaldi: Spring', 'Vivaldi', null, 'Pink tights, pointe shoes', 5],
    'Jazz 2': ['Walking on Sunshine', 'Katrina & The Waves', 'Sunshine Jazz Set', 'Tan tights, tan jazz shoes', 3],
    'Teen Hip Hop': ['September', 'Earth, Wind & Fire', 'Hip Hop Crew Set', 'White sneakers', 3],
    'Tap 3': ['Singin’ in the Rain', 'Gene Kelly', 'Tap Sailor Outfit', 'Black tap shoes', 3],
    'Contemporary Company': ['Autumn Leaves', 'Eva Cassidy', 'Contemporary Silver Unitard', 'Bare feet / foot undies', 4],
    'Junior Ballet & Tap Combo': ['Let It Snow', 'Dean Martin', null, 'Pink tights, ballet & tap shoes', 3],
  };
  let order = 0;
  for (const c of db.classes.filter((x) => x.isSample)) {
    const s = songs[c.name] ?? ['TBA', '', null, '', 3];
    db.recitalNumbers.push({ ...base(), recitalId: recital.id, order: ++order, title: c.name, classId: c.id, teamId: null, teacherId: c.teacherId, style: c.style, song: s[0], artist: s[1], songFileId: null, choreographyNotes: '', costumeId: s[2] ? costume(s[2])?.id ?? null : null, accessoryNotes: '', shoesTights: s[3], hairMakeup: 'Classical bun, natural stage makeup, red lip', entranceExit: 'Enter stage left, exit stage right', durationMin: s[4] });
  }
  db.recitalNumbers.push({ ...base(), recitalId: recital.id, order: ++order, title: 'Senior Company: Seasons Change', classId: null, teamId: senior.id, teacherId: staff('Rachel'), style: 'Contemporary', song: 'Seasons', artist: 'Chris Cornell', songFileId: null, choreographyNotes: 'Opening tableau in silhouette.', costumeId: null, accessoryNotes: '', shoesTights: 'Bare feet', hairMakeup: 'Low bun', entranceExit: 'Begins on stage in blackout', durationMin: 4 });

  /* Nutcracker performance: running order with a tight quick change, backstage, check-in */
  const perf = db.performances.find((p) => p.isSample);
  if (perf) {
    const item = (title: string, dancers: string[], costumeName: string | null, minutes: number, kind: 'number' | 'intermission' = 'number', extra: { teacher?: ID | null; song?: string } = {}) =>
      db.lineup.push({ ...base(), performanceId: perf.id, order: db.lineup.filter((l) => l.performanceId === perf.id).length + 1, kind, numberId: null, title, classId: null, teacherId: extra.teacher ?? null, dancerIds: dancers.map(did).filter(Boolean), song: extra.song ?? '', artist: 'Tchaikovsky', costumeId: costumeName ? costume(costumeName)?.id ?? null : null, durationMin: minutes, entranceExit: '', backstageNotes: '' });
    item('Party Scene', ['Lily', 'Emma'], 'Party Scene Dress', 6, 'number', { teacher: staff('Elena'), song: 'March' });
    item('Battle of the Mice', ['Mia', 'Chloe', 'Lily'], 'Mouse Costume', 4, 'number', { teacher: staff('Elena'), song: 'The Battle' });
    item('Land of Snow', ['Sophia', 'Harper'], 'Snowflake Tutu', 6, 'number', { teacher: staff('Elena'), song: 'Waltz of the Snowflakes' });
    item('Intermission', [], null, 15, 'intermission');
    item('Waltz of the Flowers', ['Grace'], 'Waltz of the Flowers Dress', 6, 'number', { teacher: staff('Elena'), song: 'Waltz of the Flowers' });
    item('Sugar Plum Fairy', ['Ava'], 'Sugar Plum Fairy Tutu', 4, 'number', { teacher: staff('Elena'), song: 'Dance of the Sugar Plum Fairy' });
    item('Finale', ['Ava', 'Lily', 'Sophia', 'Harper', 'Mia'], null, 3, 'number', { song: 'Final Waltz' });
    // Lily goes from the Party Scene straight into the battle in her Clara nightgown.
    const battle = db.lineup.find((l) => l.performanceId === perf.id && l.title === 'Battle of the Mice');
    if (battle) {
      db.lineup.push({ ...battle, ...base(), title: 'Clara & the Nutcracker', order: battle.order + 0.5, dancerIds: [did('Lily')].filter(Boolean), costumeId: costume('Clara Nightgown')?.id ?? null, durationMin: 3, song: 'Clara and the Nutcracker' });
      db.lineup.filter((l) => l.performanceId === perf.id).sort((a, b) => a.order - b.order).forEach((l, i) => (l.order = i + 1));
      const clara = db.lineup.find((l) => l.title === 'Clara & the Nutcracker');
      if (clara && did('Lily')) db.quickChanges.push({ ...base(), performanceId: perf.id, dancerId: did('Lily'), toItemId: clara.id, helper: 'Priya Shah', location: 'Stage-left wing', notes: 'Unzip party dress during bow; nightgown pre-set on hook.' });
    }
    db.performanceExtras.push({ ...base(), performanceId: perf.id, warmUpTime: '17:30', stageRehearsal: `${addDays(perf.date, -1)}T16:00`, stageManagerId: staff('Sam'), specialInstructions: 'No jewelry or nail polish. Bring water labelled with your name.', teacherIds: [staff('Elena')].filter(Boolean) as ID[] });
    db.backstageRoles.push(
      { ...base(), performanceId: perf.id, role: 'Stage manager', person: 'Sam Ortiz', volunteerId: null, staffId: staff('Sam'), area: 'Booth / stage left', notes: '' },
      { ...base(), performanceId: perf.id, role: 'Quick-change dresser', person: 'Priya Shah', volunteerId: db.volunteers.find((v) => v.isSample && v.firstName === 'Priya')?.id ?? null, staffId: null, area: 'Stage-left wing', notes: 'Lily Chen: Party → Clara' },
      { ...base(), performanceId: perf.id, role: 'Dressing room parent', person: 'Dana Whitfield', volunteerId: db.volunteers.find((v) => v.isSample && v.firstName === 'Dana')?.id ?? null, staffId: null, area: 'Dressing Room 1', notes: '' },
    );
  }

  /* checkouts: one reserved for the performance, one overdue */
  const sp = costume('Sugar Plum Fairy Tutu');
  if (sp && perf) db.checkouts.push({ ...base(), costumeId: sp.id, dancerId: did('Ava') || null, familyId: fam('Ava'), ownerType: 'performance', ownerId: perf.id, quantity: 1, status: 'reserved', checkedOutAt: '', expectedReturn: perf.date, returnedAt: '', conditionOut: '', conditionIn: '', accessoriesIssued: ['Tiara'], accessoriesReturned: [], missingItems: '', notes: 'For Sugar Plum Fairy', history: [{ at: t, by: 'Sample', change: 'Reserved' }] });
  const red = costume('Red Jazz Competition Costume');
  if (red) db.checkouts.push({ ...base(), costumeId: red.id, dancerId: did('Grace') || null, familyId: fam('Grace'), ownerType: null, ownerId: null, quantity: 1, status: 'checked_out', checkedOutAt: new Date(Date.now() - 12 * 864e5).toISOString(), expectedReturn: addDays(today, -3), returnedAt: '', conditionOut: 'Good — small snag on left fringe', conditionIn: '', accessoriesIssued: ['Red gloves', 'Hair clip'], accessoriesReturned: [], missingItems: '', notes: 'Taken home for a competition photo shoot', history: [{ at: t, by: 'Sample', change: 'Checked out ×1' }] });

  /* finance */
  let num = db.settings.nextInvoiceNumber || 1;
  const invoice = (familyId: ID | null, title: string, lines: Omit<InvoiceLine, 'id'>[], due: string, source: Invoice['source'], extra: Partial<Invoice> = {}) => {
    if (!familyId) return null;
    const inv: Invoice = { ...base(), number: `INV-${String(num++).padStart(4, '0')}`, familyId, title, lines: lines.map((l) => ({ ...l, id: newId() })), discount: 0, taxRate: 0, issueDate: addDays(today, -20), dueDate: due, state: 'sent', notes: '', source, sourceId: null, schoolYearId: year.id, remindersSent: 0, history: [{ at: t, by: 'Sample', change: 'Created and sent to family' }], ...extra };
    db.invoices.push(inv);
    return inv;
  };
  const pay = (inv: Invoice | null, amount: number, method: 'card' | 'cash' | 'check', processor: 'test' | 'offline', daysAgo: number) => {
    if (!inv) return;
    db.payments.push({ ...base(), familyId: inv.familyId, invoiceId: inv.id, amount, method, processor, reference: method === 'check' ? '#1043' : processor === 'test' ? 'TEST-SAMPLE' : '', date: addDays(today, -daysAgo), recordedBy: 'Sample', note: processor === 'test' ? 'Test-mode online payment — no card was charged' : '' });
  };
  const month = today.slice(0, 7);
  const due = `${month}-01`;
  const tuitionFor = (first: string, classNames: string[]) => {
    const d = dancer(first);
    if (!d) return null;
    return invoice(d.familyId ?? null, `Tuition ${month.slice(5)}/${month.slice(0, 4)}`, classNames.map((n) => ({ description: `${n} — ${first}`, category: 'Tuition', quantity: 1, unitPrice: cls(n)?.tuition ?? 80, dancerId: d.id })), due, 'tuition', { sourceId: `${year.id}:${month}` });
  };
  const ava = tuitionFor('Ava', ['Ballet 5 & Pointe', 'Teen Hip Hop', 'Contemporary Company']);
  pay(ava, ava ? ava.lines.reduce((s, l) => s + l.unitPrice, 0) : 0, 'card', 'test', 9);
  const lily = tuitionFor('Lily', ['Ballet 3', 'Tap 3']);
  pay(lily, 80, 'check', 'offline', 6);
  tuitionFor('Emma', ['Ballet 3', 'Jazz 2']);
  const grace = tuitionFor('Grace', ['Ballet 3', 'Teen Hip Hop', 'Tap 3', 'Contemporary Company']);
  pay(grace, grace ? grace.lines.reduce((s, l) => s + l.unitPrice, 0) : 0, 'cash', 'offline', 4);
  const costumeInv = invoice(fam('Lily'), 'Nutcracker costume fees', [{ description: 'Clara costume fee — Lily', category: 'Costume', quantity: 1, unitPrice: 65, dancerId: did('Lily') || null }, { description: 'Party scene costume fee — Lily', category: 'Costume', quantity: 1, unitPrice: 45, dancerId: did('Lily') || null }], addDays(today, 14), 'costume');
  pay(costumeInv, 50, 'card', 'test', 2);
  invoice(fam('Mia'), 'Junior Company fee', [{ description: 'Junior Company — Mia', category: 'Company', quantity: 1, unitPrice: 350, dancerId: did('Mia') || null }, { description: 'Junior Company — Chloe', category: 'Company', quantity: 1, unitPrice: 350, dancerId: did('Chloe') || null }], addDays(today, 21), 'company', { discount: 35, sourceId: junior.id, notes: 'Includes sibling discount.' });
  invoice(fam('Harper'), 'Private lessons (October)', [{ description: 'Private lesson — Harper', category: 'Private lesson', quantity: 2, unitPrice: 55, dancerId: did('Harper') || null }], addDays(today, -8), 'private');
  db.settings.nextInvoiceNumber = num;
  if (fam('Ava')) db.credits.push({ ...base(), familyId: fam('Ava')!, kind: 'issued', amount: 20, invoiceId: null, reason: 'Class cancelled for teacher conference', recordedBy: 'Sample' });

  /* events with sign-ups */
  const party = { ...base(), name: 'Holiday Party & Talent Show', type: 'party' as const, description: 'Pizza, games and a dancer talent show!', date: addDays(today, 30), endDate: '', startTime: '17:00', endTime: '19:00', location: 'Studio A', address: '', registrationDeadline: addDays(today, 24), eligibility: 'all' as const, classIds: [], teamIds: [], dancerIds: [], cost: 10, capacity: 40, signupsOpen: true, questions: [{ id: newId(), label: 'Food allergies?', type: 'text' as const, options: [], required: false }, { id: newId(), label: 'Performing in the talent show?', type: 'yesno' as const, options: [], required: true }], notes: '' };
  const convention = { ...base(), name: 'Spring Dance Convention', type: 'convention' as const, description: 'Weekend of master classes with guest faculty.', date: addDays(today, 95), endDate: addDays(today, 96), startTime: '08:30', endTime: '17:00', location: 'Grand Hotel Ballroom', address: '1 Plaza Drive', registrationDeadline: addDays(today, 60), eligibility: 'teams' as const, classIds: [], teamIds: [senior.id], dancerIds: [], cost: 145, capacity: 0, signupsOpen: true, questions: [{ id: newId(), label: 'T-shirt size', type: 'choice' as const, options: ['Youth M', 'Youth L', 'Adult S', 'Adult M', 'Adult L'], required: true }], notes: '' };
  db.signupEvents.push(party, convention);
  const reg = (eventId: ID, first: string, answers: Record<string, string>) => {
    const d = dancer(first);
    if (d) db.eventRegistrations.push({ ...base(), eventId, dancerId: d.id, familyId: d.familyId ?? null, status: 'registered', answers, invoiceId: null, by: 'Sample' });
  };
  reg(party.id, 'Lily', { [party.questions[0].id]: 'None', [party.questions[1].id]: 'Yes' });
  reg(party.id, 'Mia', { [party.questions[0].id]: 'Peanuts', [party.questions[1].id]: 'No' });
  reg(convention.id, 'Ava', { [convention.questions[0].id]: 'Adult S' });

  /* registration request */
  db.registrations.push({ ...base(), schoolYearId: year.id, status: 'pending', kind: 'new', familyId: null, parent: { firstName: 'Hannah', lastName: 'Bell', email: 'hannah.bell@example.com', phone: '(555) 410-2290', relationship: 'Mother' }, address: '9 Willow Court, Springfield', dancer: { firstName: 'Nora', lastName: 'Bell', birthday: `${Number(today.slice(0, 4)) - 7}-05-14`, clothingSize: 'Child S', shoeSize: '12', level: 'Level 1', allergies: '', medicalNotes: '' }, existingDancerId: null, classIds: [cls('Junior Ballet & Tap Combo')?.id].filter(Boolean) as ID[], dropClassIds: [], emergency: { name: 'Tom Bell', relationship: 'Father', phone: '(555) 410-2291' }, agreedPolicyIds: [], fee: db.settings.registrationFee || 35, invoiceId: null, notes: 'Nora loves to tap!', reviewNote: '', reviewedBy: '', reviewedAt: '', submittedBy: 'Hannah Bell (online)', result: '' });

  /* policies */
  const policy = (title: string, category: string, body: string, audience: 'all' | 'teams', teamIds: ID[] = [], deadline = addDays(today, 10)) => {
    const p = { ...base(), title, category, versions: [{ version: 1, body, fileId: null, createdAt: t, createdBy: 'Studio Owner' }], audience, classIds: [], teamIds, familyIds: [], requiresSignature: true, deadline, annualRenewal: true, active: true };
    db.policies.push(p);
    return p;
  };
  const handbook = policy('Studio Handbook & Tuition Policy', 'Handbook', 'Tuition is due on the 1st of each month. A late fee applies after the 10th. Dancers should arrive 10 minutes early in dress-code attire. Missed classes may be made up within 30 days.', 'all');
  const media = policy('Media Release', 'Media release', 'I give permission for my dancer to appear in studio photos and videos used on the studio website and social media. I can withdraw this permission at any time by contacting the office.', 'all');
  policy('Competition Team Agreement', 'Company / team', 'Team members attend all rehearsals and competitions, pay fees on time, and support their teammates.', 'teams', [senior.id], addDays(today, -2));
  const sign = (policyId: ID, first: string, signer: string) => {
    const f = fam(first);
    if (f) db.policySignatures.push({ ...base(), policyId, version: 1, familyId: f, guardianId: null, signerName: signer, signedAt: new Date(Date.now() - 5 * 864e5).toISOString(), method: 'typed', schoolYearId: year.id, ip: '' });
  };
  sign(handbook.id, 'Ava', 'Laura Thompson');
  sign(media.id, 'Ava', 'Laura Thompson');
  sign(handbook.id, 'Lily', 'Mei Chen');
  sign(handbook.id, 'Sophia', 'Rosa Martinez');

  /* fundraisers */
  const travel = { ...base(), name: 'Competition Team Travel Fund', description: 'Help send our Senior Competition Team to Nationals!', type: 'donation' as const, purpose: 'Travel expenses', startDate: addDays(today, -20), endDate: addDays(today, 60), goal: 2000, teamId: senior.id, dancerIds: [], requirements: '', paymentOptions: 'Online, cash or check', items: [], notes: '', status: 'open' as const };
  const cookie = { ...base(), name: 'Cookie Dough Sale', description: 'Gourmet cookie dough tubs — delivered before the holidays.', type: 'product_sale' as const, purpose: 'Recital expenses', startDate: addDays(today, -10), endDate: addDays(today, 20), goal: 800, teamId: null, dancerIds: [], requirements: 'Each family is encouraged to sell 5 tubs.', paymentOptions: 'Online or cash at the front desk', items: [{ id: newId(), name: 'Chocolate chip tub', price: 16 }, { id: newId(), name: 'Sugar cookie tub', price: 16 }, { id: newId(), name: 'Variety pack', price: 28 }], notes: '', status: 'open' as const };
  db.fundraisers.push(travel, cookie);
  db.fundraiserTransactions.push(
    { ...base(), fundraiserId: travel.id, familyId: fam('Ava'), dancerId: did('Ava') || null, donorName: 'Thompson Family', kind: 'donation', items: [], amount: 250, invoiceId: null, notes: '', fulfilled: true },
    { ...base(), fundraiserId: travel.id, familyId: null, dancerId: did('Harper') || null, donorName: 'Riverside Hardware (sponsor)', kind: 'donation', items: [], amount: 500, invoiceId: null, notes: 'Check #2201', fulfilled: true },
    { ...base(), fundraiserId: cookie.id, familyId: fam('Emma'), dancerId: did('Emma') || null, donorName: 'Johnson Family', kind: 'order', items: [{ itemId: cookie.items[0].id, qty: 3 }, { itemId: cookie.items[2].id, qty: 1 }], amount: 76, invoiceId: null, notes: '', fulfilled: false },
  );

  /* tickets */
  if (perf) {
    const ga = { id: newId(), name: 'Adult', category: 'reserved' as const, price: 18, quantity: 80 };
    const st = { id: newId(), name: 'Student / Senior', category: 'reserved' as const, price: 12, quantity: 30 };
    const comp = { id: newId(), name: 'Complimentary', category: 'comp' as const, price: 0, quantity: 10 };
    const te = { ...base(), name: `${perf.name} — Tickets`, performanceId: perf.id, recitalId: null, date: perf.date, time: perf.time, venue: perf.venue, salesOpen: addDays(today, -14), salesClose: addDays(perf.date, -1), types: [ga, st, comp], seatingRows: 8, seatsPerRow: 14, notes: 'Doors open 30 minutes before curtain.', status: 'on_sale' as const };
    db.ticketEvents.push(te);
    const order = (first: string, buyer: string, lines: { typeId: ID; qty: number; unitPrice: number }[], seats: string[], daysAgo: number) => {
      const familyId = fam(first);
      const total = lines.reduce((s, l) => s + l.qty * l.unitPrice, 0);
      const pid = newId();
      if (familyId && total) db.payments.push({ ...base(), id: pid, familyId, invoiceId: null, amount: total, method: 'card', processor: 'test', reference: 'TEST-TICKETS', date: addDays(today, -daysAgo), recordedBy: buyer, note: `Tickets: ${te.name}` });
      db.ticketOrders.push({ ...base(), ticketEventId: te.id, familyId, buyerName: buyer, buyerEmail: '', lines, seats, total, status: 'paid', paymentId: familyId && total ? pid : null, source: 'parent' });
    };
    order('Lily', 'Mei Chen', [{ typeId: ga.id, qty: 2, unitPrice: 18 }, { typeId: st.id, qty: 1, unitPrice: 12 }], ['C5', 'C6', 'C7'], 6);
    order('Ava', 'Laura Thompson', [{ typeId: ga.id, qty: 4, unitPrice: 18 }], ['B3', 'B4', 'B5', 'B6'], 4);
  }

  /* communications */
  db.messageTemplates.push(
    { ...base(), name: 'Class cancelled', channel: 'sms', subject: '', body: 'Studio alert: {class} is cancelled today. We will see you next week! Reply STOP to opt out.', blocks: [] },
    { ...base(), name: 'Payment reminder', channel: 'email', subject: 'Friendly reminder: tuition is due', body: 'Hi! This is a friendly reminder that tuition is due on the 1st. You can pay online in the Parent Portal. Thank you!', blocks: [] },
  );
  const allFamilies = db.families.filter((f) => f.isSample);
  db.messages.push({
    ...base(),
    channel: 'email',
    subject: 'Welcome to the new season!',
    body: 'We are so excited to dance with you this year. Class schedules are in the Parent Portal, and Picture Day is coming up soon. See you in the studio!',
    blocks: [],
    recipients: [{ kind: 'all_families', ids: [] }],
    deliveries: db.guardians.filter((g) => allFamilies.some((f) => f.id === g.familyId)).map((g) => ({ name: `${g.firstName} ${g.lastName}`, contact: g.email, familyId: g.familyId, staffId: null, status: g.email && g.emailConsent ? ('in_app' as const) : ('skipped_no_consent' as const), external: 'not_connected' as const })),
    attachmentIds: [],
    status: 'sent',
    scheduledFor: '',
    sentAt: new Date(Date.now() - 6 * 864e5).toISOString(),
    sender: 'Studio Owner',
    related: null,
    readBy: [],
  });
  db.messages.push({
    ...base(),
    channel: 'newsletter',
    subject: 'Studio News — Holiday Edition',
    body: '',
    blocks: [
      { id: newId(), type: 'heading', text: 'Happy holidays from the studio!', url: '', fileId: null },
      { id: newId(), type: 'text', text: 'The Nutcracker is almost here. Tickets are on sale in the Parent Portal.', url: '', fileId: null },
      { id: newId(), type: 'events', text: '', url: '', fileId: null },
      { id: newId(), type: 'button', text: 'Buy Nutcracker tickets', url: '/family/tickets', fileId: null },
    ],
    recipients: [{ kind: 'all_families', ids: [] }],
    deliveries: [],
    attachmentIds: [],
    status: 'scheduled',
    scheduledFor: `${addDays(today, 7)}T09:00`,
    sentAt: '',
    sender: 'Studio Owner',
    related: null,
    readBy: [],
  });

  /* teacher tools */
  const b3 = cls('Ballet 3');
  if (b3) {
    db.classVideos.push({ ...base(), classId: b3.id, schoolYearId: year.id, teacherId: b3.teacherId, title: 'Recital combination — part 1', description: 'Practice the first 32 counts at home.', lessonDate: addDays(today, -1 - ((new Date().getDay() + 6) % 7)), fileId: null, url: 'https://www.youtube.com/watch?v=aqz-KE-bpKQ', kind: 'choreography', visibility: 'parents', notes: 'Unlisted link' });
    db.classNotes.push({ ...base(), classId: b3.id, date: addDays(today, -1), body: 'Great energy! Working on pirouette prep — please practice relevés at home.', author: 'Elena Morales', shareWithFamilies: true });
    db.scheduleRequests.push({ ...base(), staffId: b3.teacherId!, classId: b3.id, date: addDays(today, 13), kind: 'substitute', details: 'Family wedding — could Nina cover Ballet 3?', status: 'pending', response: '', respondedBy: '' });
  }
  return db;
}

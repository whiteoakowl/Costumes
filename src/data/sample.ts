import type { Costume, Database, ID, OwnerType, ProgressReason } from './types';
import { newId, nowIso } from './ids';
import { addSampleStudio } from './sampleStudio';
import { createWorkOrderIn, completeWorkOrderIn, ensureWorkOrders } from './workflow';

/**
 * Sample data shown on first launch. Every record is flagged `isSample: true`
 * and is labelled "Sample" in the interface; Settings → Data has a one-click
 * "Remove sample data" button. Dates are relative to today so the dashboard
 * always has upcoming items to show.
 */

function dateFromToday(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function birthdayForAge(age: number, monthOffset: number) {
  const d = new Date();
  d.setFullYear(d.getFullYear() - age);
  d.setMonth(d.getMonth() - monthOffset);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(Math.min(d.getDate(), 28))}`;
}

export function buildSampleData(db: Database): Database {
  const t = nowIso();
  const base = () => ({ id: newId(), createdAt: t, updatedAt: t, isSample: true as const });

  // Categories (show types)
  const cat = (name: string) => {
    const existing = db.categories.find((c) => c.name.toLowerCase() === name.toLowerCase());
    if (existing) return existing.id;
    const rec = { ...base(), name, sortOrder: db.categories.length + 1 };
    db.categories.push(rec);
    return rec.id;
  };
  const nutcracker = cat('Nutcracker');
  const spring = cat('Spring Recital');
  const competition = cat('Competition');

  // Storage locations
  const loc = (name: string, description: string, unitNumber: string, notes = '') => {
    const rec = { ...base(), name, description, unitNumber, notes };
    db.storageLocations.push(rec);
    return rec.id;
  };
  const closetA = loc('Costume Closet A', 'Main hallway closet — hanging tutus and dresses', 'Closet A', 'Keep door closed; dehumidifier inside.');
  const rack1 = loc('Rack 1', 'Rolling rack in Studio 2', 'Rack 1');
  const bin1 = loc('Costume Bin 1', 'Clear bin for accessories and small items', 'Bin 1', 'Headpieces wrapped in tissue.');

  // Dancers
  const levels = db.settings.levels;
  const L = (i: number) => levels[Math.min(i, levels.length - 1)] ?? '';
  const dancer = (firstName: string, lastName: string, age: number, clothingSize: string, costumeSize: string, shoeSize: string, level: string, pointe: boolean, notes = '') => {
    const rec = { ...base(), firstName, lastName, birthday: birthdayForAge(age, (firstName.length * 3) % 12), clothingSize, costumeSize, shoeSize, level, pointe, notes };
    db.dancers.push(rec);
    return rec.id;
  };
  const ava = dancer('Ava', 'Thompson', 16, 'Adult S', 'Adult S', '7', L(6), true, 'Sample dancer. Lead in Nutcracker.');
  const lily = dancer('Lily', 'Chen', 11, 'Child L', 'Child L', '4', L(3), false, 'Sample dancer.');
  const sophia = dancer('Sophia', 'Martinez', 15, 'Adult XS', 'Adult S', '6.5', L(5), true, 'Sample dancer. Prefers bobby pins over combs.');
  const emma = dancer('Emma', 'Johnson', 9, 'Child M', 'Child M', '2', L(2), false, 'Sample dancer.');
  const grace = dancer('Grace', 'Patel', 13, 'Adult XS', 'Adult XS', '5', L(4), false, 'Sample dancer. Allergic to latex — no latex adhesive.');
  const mia = dancer('Mia', 'Robinson', 8, 'Child M', 'Child M', '1', L(1), false, 'Sample dancer.');
  const chloe = dancer('Chloe', 'Nguyen', 10, 'Child S', 'Child M', '3', L(2), false, 'Sample dancer.');
  const harper = dancer('Harper', 'Williams', 17, 'Adult M', 'Adult S', '8', L(6), true, 'Sample dancer.');

  // Costumes
  const prefix = db.settings.costumeIdPrefix || 'COS';
  const costume = (
    name: string,
    categoryId: ID,
    description: string,
    size: string,
    quantity: number,
    storageLocationId: ID,
    accessories: [string, number][],
    status: { reason: ProgressReason; note: string } | null = null,
    daysAgo = 120,
  ) => {
    const inventoryNumber = `${prefix}-${String(db.meta.nextCostumeNumber++).padStart(4, '0')}`;
    const rec: Costume = {
      ...base(),
      inventoryNumber,
      name,
      categoryId,
      description,
      size,
      quantity,
      dateAdded: dateFromToday(-daysAgo),
      storageLocationId,
      status: status ? 'in_progress' : 'ready',
      progressReason: status ? status.reason : null,
      statusUpdatedAt: t,
      repairNotes: status ? status.note : '',
      notes: 'Sample costume.',
    };
    db.costumes.push(rec);
    for (const [aName, qty] of accessories) db.accessories.push({ ...base(), costumeId: rec.id, name: aName, quantity: qty });
    db.costumeNotes.push({ ...base(), costumeId: rec.id, type: 'general', text: 'Costume added to inventory (sample data).' });
    if (status) {
      db.costumeNotes.push({ ...base(), costumeId: rec.id, type: status.reason === 'alteration' ? 'alteration' : 'repair', text: `Marked IN PROGRESS: ${status.note}` });
    }
    return rec.id;
  };

  const snowflake = costume('Snowflake Tutu', nutcracker, 'White platter tutu with silver sequin bodice', 'Adult S', 6, closetA, [['Snowflake headpiece', 6], ['White gloves', 6]], null, 400);
  const sugarPlum = costume('Sugar Plum Fairy Tutu', nutcracker, 'Lilac classical tutu with crystal trim', 'Adult S', 1, closetA, [['Tiara', 1]], null, 700);
  const claraGown = costume('Clara Nightgown', nutcracker, 'Cream cotton nightgown with lace collar', 'Child L', 1, closetA, [['Hair ribbon', 1]], null, 380);
  const mouse = costume('Mouse Costume', nutcracker, 'Grey fleece body suit with hood', 'Child M', 4, rack1, [['Mouse ears', 4], ['Tail', 3]], { reason: 'repair', note: 'Tail seam split on two costumes; one tail missing.' }, 600);
  const partyDress = costume('Party Scene Dress', nutcracker, 'Victorian velvet party dress, assorted jewel tones', 'Child M', 6, rack1, [['Hair bow', 6]], null, 500);
  const waltz = costume('Waltz of the Flowers Dress', nutcracker, 'Rose chiffon romantic-length dress', 'Adult S', 8, closetA, [['Flower headpiece', 0]], { reason: 'alteration', note: 'Taking in bodice on sizes S.' }, 300);
  const butterfly = costume('Butterfly Lyrical Dress', spring, 'Pastel lyrical dress with chiffon wings', 'Child S', 5, rack1, [['Wings', 5], ['Antenna headband', 5]], null, 60);
  const sunshine = costume('Sunshine Jazz Set', spring, 'Yellow sequin top and shorts', 'Child M', 6, bin1, [['Jazz shoes', 6]], null, 45);
  const sailor = costume('Tap Sailor Outfit', spring, 'Navy and white sailor dress', 'Child L', 4, rack1, [['Sailor hat', 4]], null, 200);
  costume('Contemporary Silver Unitard', competition, 'Mesh-panel silver unitard', 'Adult S', 2, bin1, [], null, 90);
  costume('Red Jazz Competition Costume', competition, 'Red fringe two-piece', 'Adult XS', 3, bin1, [['Red gloves', 3], ['Hair clip', 3]], null, 150);
  costume('Hip Hop Crew Set', competition, 'Black cargo pants, cropped hoodie', 'Adult M', 5, bin1, [['Snapback cap', 5]], { reason: 'cleaning', note: 'Out for dry cleaning.' }, 30);

  // Shows
  const nutShow = { ...base(), name: 'The Nutcracker (Sample)', categoryId: nutcracker, description: 'Annual holiday production.', startDate: dateFromToday(35), endDate: dateFromToday(36), venue: 'Riverside Performing Arts Center', notes: 'Sample show.', status: 'active' as const };
  const springShow = { ...base(), name: 'Spring Recital (Sample)', categoryId: spring, description: 'End-of-year recital for all levels.', startDate: dateFromToday(170), endDate: dateFromToday(170), venue: 'High School Auditorium', notes: 'Sample show.', status: 'planning' as const };
  db.shows.push(nutShow, springShow);

  const cast = (ownerType: OwnerType, ownerId: ID, name: string, order: number, members: [ID, string][]) => {
    const rec = { ...base(), ownerType, ownerId, name, sortOrder: order };
    db.casts.push(rec);
    for (const [dancerId, role] of members) db.castMembers.push({ ...base(), castId: rec.id, dancerId, role });
    return rec.id;
  };
  const assign = (ownerType: OwnerType, ownerId: ID, costumeId: ID, castId: ID | null = null, dancerId: ID | null = null) => {
    db.assignments.push({ ...base(), ownerType, ownerId, costumeId, castId, dancerId, notes: '' });
  };

  const nutA = cast('show', nutShow.id, 'Cast A', 1, [[ava, 'Sugar Plum Fairy'], [lily, 'Clara'], [sophia, 'Snowflake'], [harper, 'Snowflake'], [mia, 'Mouse']]);
  const nutB = cast('show', nutShow.id, 'Cast B', 2, [[sophia, 'Sugar Plum Fairy'], [emma, 'Party Child'], [grace, 'Flower'], [chloe, 'Mouse']]);
  for (const c of [snowflake, sugarPlum, claraGown, mouse, partyDress, waltz]) assign('show', nutShow.id, c);
  assign('show', nutShow.id, sugarPlum, nutA, ava);
  assign('show', nutShow.id, claraGown, nutA, lily);
  assign('show', nutShow.id, partyDress, nutA, lily);
  assign('show', nutShow.id, snowflake, nutA, sophia);
  assign('show', nutShow.id, snowflake, nutA, harper);
  assign('show', nutShow.id, mouse, nutA, mia);
  assign('show', nutShow.id, sugarPlum, nutB, sophia);
  assign('show', nutShow.id, partyDress, nutB, emma);
  assign('show', nutShow.id, waltz, nutB, grace);
  assign('show', nutShow.id, mouse, nutB, chloe);

  const springSat = cast('show', springShow.id, 'Saturday Cast', 1, [[emma, ''], [mia, ''], [chloe, ''], [lily, '']]);
  cast('show', springShow.id, 'Understudy Cast', 2, [[grace, '']]);
  for (const c of [butterfly, sunshine, sailor]) assign('show', springShow.id, c);
  assign('show', springShow.id, sunshine, springSat, null); // whole cast

  // Performance plan
  const perf = {
    ...base(),
    name: 'Nutcracker — Opening Weekend (Sample)',
    showId: nutShow.id,
    date: dateFromToday(35),
    time: '19:00',
    venue: 'Riverside Performing Arts Center',
    address: '120 River Road, Springfield',
    callTime: '17:00',
    dressRehearsal: `${dateFromToday(34)}T16:00`,
    notes: 'Sample performance plan. Quick change between Party Scene and Act II for Lily.',
    details: 'Parents drop off at stage door. Hair: classical bun, no bangs.',
  };
  db.performances.push(perf);
  const pEve = cast('performance', perf.id, 'Saturday Evening', 1, [[ava, 'Sugar Plum Fairy'], [lily, 'Clara'], [sophia, 'Snowflake'], [harper, 'Snowflake'], [mia, 'Mouse']]);
  const pMat = cast('performance', perf.id, 'Sunday Matinee', 2, [[sophia, 'Sugar Plum Fairy'], [emma, 'Party Child'], [grace, 'Flower'], [chloe, 'Mouse'], [harper, 'Snowflake']]);
  for (const c of [snowflake, sugarPlum, claraGown, mouse, partyDress, waltz]) assign('performance', perf.id, c);
  assign('performance', perf.id, sugarPlum, pEve, ava);
  assign('performance', perf.id, claraGown, pEve, lily);
  assign('performance', perf.id, partyDress, pEve, lily);
  assign('performance', perf.id, snowflake, pEve, sophia);
  assign('performance', perf.id, snowflake, pEve, harper);
  assign('performance', perf.id, mouse, pEve, mia);
  assign('performance', perf.id, sugarPlum, pMat, sophia);
  assign('performance', perf.id, partyDress, pMat, emma);
  assign('performance', perf.id, waltz, pMat, grace);
  assign('performance', perf.id, mouse, pMat, chloe);
  // Harper in the matinee intentionally has no costume yet, to demonstrate the warnings.

  addSamplePropsAndVolunteers(db);
  addSampleWorkOrders(db);
  addSampleStudio(db);
  db.meta.sampleLoaded = true;
  return db;
}

/** Sample repair / cleaning history: open orders for in-progress samples, one assigned cleaning, one completed job. */
export function addSampleWorkOrders(db: Database): Database {
  if (!Array.isArray(db.workOrders)) db.workOrders = [];
  ensureWorkOrders(db);
  const item = (name: string) => db.costumes.find((c) => c.isSample && c.name === name);
  const vol = (first: string) => db.volunteers.find((v) => v.isSample && v.firstName === first)?.id ?? null;
  const inDays = (days: number, time: string) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}${time ? `T${time}` : ''}`;
  };
  const hipHop = item('Hip Hop Crew Set');
  const cleaning = hipHop && db.workOrders.find((w) => w.costumeId === hipHop.id && w.status !== 'done');
  if (cleaning) {
    cleaning.volunteerId = vol('Tom');
    cleaning.scheduledAt = inDays(2, '10:00');
    cleaning.dueDate = inDays(9, '');
  }
  const mouse = item('Mouse Costume');
  const mouseOrder = mouse && db.workOrders.find((w) => w.costumeId === mouse.id && w.status !== 'done');
  if (mouseOrder) {
    mouseOrder.volunteerId = vol('Dana');
    mouseOrder.status = 'in_progress';
    mouseOrder.startedAt = inDays(-1, '18:30');
    mouseOrder.dueDate = inDays(20, '');
  }
  const snow = item('Snowflake Tutu');
  if (snow) {
    const w = createWorkOrderIn(db, snow, { type: 'cleaning', description: 'Spot clean bodices after fall recital', volunteerId: vol('Priya'), scheduledAt: inDays(-8, '09:00') }, '');
    w.createdAt = new Date(Date.now() - 9 * 864e5).toISOString();
    w.startedAt = inDays(-8, '09:15');
    completeWorkOrderIn(db, w, { completedAt: inDays(-6, '16:00'), note: 'All 6 cleaned and steamed', markReady: true, log: false });
    snow.repairNotes = '';
    db.costumeNotes.push(
      { id: newId(), createdAt: w.createdAt, updatedAt: w.createdAt, isSample: true, costumeId: snow.id, type: 'cleaning', text: 'Cleaning requested: Spot clean bodices after fall recital (assigned to Priya Shah). Marked IN PROGRESS.', workOrderId: w.id, volunteerId: w.volunteerId },
      { id: newId(), createdAt: new Date(Date.now() - 6 * 864e5).toISOString(), updatedAt: w.createdAt, isSample: true, costumeId: snow.id, type: 'cleaning', text: 'Cleaning completed by Priya Shah: All 6 cleaned and steamed.', workOrderId: w.id, volunteerId: w.volunteerId },
    );
  }
  for (const w of db.workOrders) {
    const c = db.costumes.find((x) => x.id === w.costumeId);
    if (c?.isSample) w.isSample = true;
  }
  return db;
}

/**
 * Sample props (linked to the sample shows / casts / dancers when they exist)
 * and sample volunteers. Also used to upgrade databases created before props
 * and volunteers existed.
 */
export function addSamplePropsAndVolunteers(db: Database): Database {
  const t = nowIso();
  const base = () => ({ id: newId(), createdAt: t, updatedAt: t, isSample: true as const });
  const catId = (name: string) => db.categories.find((c) => c.name.toLowerCase() === name.toLowerCase())?.id ?? null;
  const locId = (name: string) => db.storageLocations.find((l) => l.name === name)?.id ?? null;
  const prefix = db.settings.propIdPrefix || 'PROP';
  if (!db.meta.nextPropNumber) db.meta.nextPropNumber = 1;

  const prop = (
    name: string,
    category: string,
    description: string,
    quantity: number,
    location: string,
    parts: [string, number][],
    status: { reason: ProgressReason; note: string } | null = null,
  ) => {
    const rec: Costume = {
      ...base(),
      kind: 'prop',
      inventoryNumber: `${prefix}-${String(db.meta.nextPropNumber++).padStart(4, '0')}`,
      name,
      categoryId: catId(category),
      description,
      size: '',
      quantity,
      dateAdded: dateFromToday(-200),
      storageLocationId: locId(location),
      status: status ? 'in_progress' : 'ready',
      progressReason: status ? status.reason : null,
      statusUpdatedAt: t,
      repairNotes: status ? status.note : '',
      notes: 'Sample prop.',
    };
    db.costumes.push(rec);
    for (const [pName, qty] of parts) db.accessories.push({ ...base(), costumeId: rec.id, name: pName, quantity: qty });
    db.costumeNotes.push({ ...base(), costumeId: rec.id, type: 'general', text: 'Prop added to inventory (sample data).' });
    if (status) db.costumeNotes.push({ ...base(), costumeId: rec.id, type: 'repair', text: `Marked IN PROGRESS: ${status.note}` });
    return rec.id;
  };

  const nutDoll = prop('Nutcracker Doll', 'Nutcracker', 'Painted wooden nutcracker for Clara, Act I', 1, 'Costume Closet A', []);
  const giftBoxes = prop('Party Gift Boxes', 'Nutcracker', 'Wrapped gift boxes for the party scene', 6, 'Costume Bin 1', [['Ribbon bows', 6]]);
  const sword = prop('Mouse King Sword', 'Nutcracker', 'Foam-core sword with silver paint', 2, 'Rack 1', [], { reason: 'repair', note: 'Handle wrap coming loose.' });
  const candle = prop('Battery Candle', 'Nutcracker', 'LED candle with brass holder', 1, 'Costume Bin 1', [['AA batteries (spare set)', 0]]);
  const umbrellas = prop('Spring Umbrellas', 'Spring Recital', 'Pastel parasols for the opening number', 5, 'Rack 1', []);
  prop('Competition Chairs', 'Competition', 'Black folding chairs for contemporary piece', 4, 'Rack 1', []);

  const show = (name: string) => db.shows.find((s) => s.isSample && s.name.toLowerCase().includes(name));
  const dancer = (first: string) => db.dancers.find((d) => d.isSample && d.firstName === first)?.id ?? null;
  const cast = (ownerId: string, name: string) => db.casts.find((c) => c.ownerId === ownerId && c.name === name)?.id ?? null;
  const assign = (ownerType: OwnerType, ownerId: ID, costumeId: ID, castId: ID | null = null, dancerId: ID | null = null) => {
    db.assignments.push({ ...base(), ownerType, ownerId, costumeId, castId, dancerId, notes: '' });
  };

  const nut = show('nutcracker');
  if (nut) {
    for (const p of [nutDoll, giftBoxes, sword, candle]) assign('show', nut.id, p);
    const a = cast(nut.id, 'Cast A');
    const b = cast(nut.id, 'Cast B');
    if (a && dancer('Lily')) assign('show', nut.id, nutDoll, a, dancer('Lily'));
    if (a && dancer('Mia')) assign('show', nut.id, sword, a, dancer('Mia'));
    if (b) assign('show', nut.id, giftBoxes, b, null);
  }
  const spring = show('spring');
  if (spring) {
    assign('show', spring.id, umbrellas);
    const sat = cast(spring.id, 'Saturday Cast');
    if (sat) assign('show', spring.id, umbrellas, sat, null);
  }
  const perf = db.performances.find((p) => p.isSample && nut && p.showId === nut.id);
  if (perf) {
    for (const p of [nutDoll, giftBoxes, sword, candle]) assign('performance', perf.id, p);
    const eve = cast(perf.id, 'Saturday Evening');
    const mat = cast(perf.id, 'Sunday Matinee');
    if (eve && dancer('Lily')) assign('performance', perf.id, nutDoll, eve, dancer('Lily'));
    if (eve && dancer('Lily')) assign('performance', perf.id, candle, eve, dancer('Lily'));
    if (eve && dancer('Mia')) assign('performance', perf.id, sword, eve, dancer('Mia'));
    if (mat && dancer('Chloe')) assign('performance', perf.id, sword, mat, dancer('Chloe'));
    if (mat && dancer('Emma')) assign('performance', perf.id, giftBoxes, mat, dancer('Emma'));
  }

  // Volunteers
  const nutDate = nut?.startDate || dateFromToday(35);
  const dress = perf?.dressRehearsal?.slice(0, 10) || dateFromToday(34);
  const slot = (type: 'date' | 'weekly', dateOrWeekday: string | number, start: string, end: string, note = '') => ({
    id: newId(),
    type,
    date: type === 'date' ? String(dateOrWeekday) : '',
    weekday: type === 'weekly' ? Number(dateOrWeekday) : 0,
    start,
    end,
    note,
  });
  const vol = (firstName: string, lastName: string, email: string, phone: string, preferredContact: 'email' | 'phone' | 'text', skills: string[], availability: ReturnType<typeof slot>[], notes: string) =>
    db.volunteers.push({ ...base(), firstName, lastName, email, phone, preferredContact, skills, availability, notes });
  vol('Dana', 'Whitfield', 'dana.whitfield@example.com', '(555) 201-4410', 'text', ['Sewing', 'Alterations'], [slot('weekly', 2, '18:00', '21:00', 'Tuesday sewing nights'), slot('date', dress, '15:00', '21:00')], 'Sample volunteer. Parent of Ava. Has her own serger.');
  vol('Marcus', 'Lee', 'marcus.lee@example.com', '(555) 330-9182', 'email', ['Backstage / stage crew', 'Set building'], [slot('date', nutDate, '16:00', '22:00'), slot('weekly', 6, '', '', 'Most Saturdays')], 'Sample volunteer.');
  vol('Priya', 'Shah', 'priya.shah@example.com', '(555) 744-0021', 'phone', ['Hair & makeup', 'Quick changes / dressing'], [slot('date', nutDate, '16:30', '21:30'), slot('date', dress, '15:30', '20:00')], 'Sample volunteer. Can do classical buns for up to 10 dancers.');
  vol('Tom', 'Becker', 'tom.becker@example.com', '(555) 618-7735', 'email', ['Ushering', 'Ticketing', 'Photography'], [slot('weekly', 0, '12:00', '18:00')], 'Sample volunteer. Weekends only.');
  return db;
}

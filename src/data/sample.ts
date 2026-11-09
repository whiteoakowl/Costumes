import type { Costume, Database, ID, OwnerType, ProgressReason } from './types';
import { newId, nowIso } from './ids';

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

  db.meta.sampleLoaded = true;
  return db;
}

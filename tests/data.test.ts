import { beforeEach, describe, expect, it } from 'vitest';
import { getDb, replaceDb, emptyDatabase, normalizeDatabase, ValidationError, STORAGE_KEY } from '../src/data/store';
import * as A from '../src/data/actions';
import { buildOverview, buildPropOverview, dancerCostumes, ageFromBirthday, itemsOf, ownerCostumeIds, availableSlots } from '../src/data/selectors';
import { buildSampleData } from '../src/data/sample';

const dancer = (firstName: string, extra: Partial<A.DancerInput> = {}) =>
  A.saveDancer({ firstName, lastName: 'Test', birthday: '', clothingSize: '', costumeSize: '', shoeSize: '', level: '', pointe: false, notes: '', ...extra });
const costume = (name: string, extra: Partial<A.CostumeInput> = {}) =>
  A.saveCostume({ name, categoryId: null, description: '', size: '', quantity: 2, dateAdded: '', storageLocationId: null, repairNotes: '', notes: '', status: 'ready', progressReason: null, accessories: [], ...extra });

beforeEach(() => replaceDb(emptyDatabase()));

describe('persistence', () => {
  it('saves every change to localStorage', () => {
    dancer('Ava');
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(saved.dancers).toHaveLength(1);
  });
  it('sample data has the requested amounts and is flagged', () => {
    const db = buildSampleData(emptyDatabase());
    expect(db.dancers).toHaveLength(8);
    expect(itemsOf(db, 'costume')).toHaveLength(12);
    expect(itemsOf(db, 'prop')).toHaveLength(6);
    expect(db.volunteers).toHaveLength(4);
    expect(db.categories).toHaveLength(3);
    expect(db.storageLocations).toHaveLength(3);
    expect(db.shows).toHaveLength(2);
    expect(db.performances.length).toBeGreaterThanOrEqual(1);
    expect(db.dancers.every((d) => d.isSample)).toBe(true);
    replaceDb(db);
    A.removeSampleData();
    const after = getDb();
    expect(after.dancers.length + after.costumes.length + after.assignments.length + after.casts.length + after.volunteers.length).toBe(0);
  });
});

describe('validation', () => {
  it('requires names', () => {
    expect(() => dancer('  ')).toThrow(ValidationError);
    expect(() => costume('')).toThrow(ValidationError);
  });
  it('rejects duplicate location names', () => {
    A.saveLocation({ name: 'Rack 1', description: '', unitNumber: '', notes: '' });
    expect(() => A.saveLocation({ name: 'rack 1', description: '', unitNumber: '', notes: '' })).toThrow(/already exists/);
  });
  it('computes age from birthday', () => {
    expect(ageFromBirthday('2010-06-15', new Date(2026, 5, 14))).toBe(15);
    expect(ageFromBirthday('2010-06-15', new Date(2026, 5, 15))).toBe(16);
  });
});

describe('costumes', () => {
  it('auto-generates unique inventory numbers', () => {
    const a = costume('A');
    const b = costume('B');
    const c = A.duplicateCostume(a);
    const nums = getDb().costumes.map((x) => x.inventoryNumber);
    expect(new Set(nums).size).toBe(3);
    expect(getDb().costumes.find((x) => x.id === b)!.inventoryNumber).toBe('COS-0002');
    expect(getDb().costumes.find((x) => x.id === c)!.name).toBe('A (copy)');
  });
  it('status changes are logged and never overwrite earlier notes', () => {
    const id = costume('Tutu');
    A.setCostumeStatus([id], 'in_progress', 'repair', 'Hem down');
    A.addCostumeNote(id, 'repair', 'Sewed hem');
    A.setCostumeStatus([id], 'ready', null, '');
    const notes = getDb().costumeNotes.filter((n) => n.costumeId === id);
    expect(notes.map((n) => n.text)).toEqual(['Costume added to inventory.', 'Marked IN PROGRESS (Needs repair): Hem down', 'Sewed hem', 'Marked READY.']);
    const c = getDb().costumes.find((x) => x.id === id)!;
    expect(c.status).toBe('ready');
    expect(c.repairNotes).toBe('Hem down');
  });
  it('moves between locations and logs it', () => {
    const l1 = A.saveLocation({ name: 'Closet A', description: '', unitNumber: '', notes: '' });
    const l2 = A.saveLocation({ name: 'Closet B', description: '', unitNumber: '', notes: '' });
    const id = costume('Tutu', { storageLocationId: l1 });
    A.moveCostumes([id], l2);
    expect(getDb().costumes[0].storageLocationId).toBe(l2);
    expect(getDb().costumeNotes.some((n) => n.text === 'Moved from Closet A to Closet B.')).toBe(true);
  });
  it('deleting a location reassigns its costumes', () => {
    const l1 = A.saveLocation({ name: 'Closet A', description: '', unitNumber: '', notes: '' });
    const l2 = A.saveLocation({ name: 'Closet B', description: '', unitNumber: '', notes: '' });
    const a = costume('A', { storageLocationId: l1 });
    A.deleteLocation(l1, l2);
    expect(getDb().costumes.find((c) => c.id === a)!.storageLocationId).toBe(l2);
    A.deleteLocation(l2, null);
    expect(getDb().costumes.find((c) => c.id === a)!.storageLocationId).toBeNull();
    expect(getDb().costumeNotes.filter((n) => n.type === 'location')).toHaveLength(2);
  });
  it('deleting a category reassigns costumes and shows', () => {
    const c1 = A.saveCategory('Jazz');
    const c2 = A.saveCategory('Tap');
    const id = costume('A', { categoryId: c1 });
    const show = A.saveShow({ name: 'S', categoryId: c1, description: '', startDate: '', endDate: '', venue: '', notes: '', status: 'planning' });
    A.deleteCategory(c1, c2);
    expect(getDb().costumes.find((c) => c.id === id)!.categoryId).toBe(c2);
    expect(getDb().shows.find((s) => s.id === show)!.categoryId).toBe(c2);
  });
});

describe('casts, assignments and readiness', () => {
  function setup() {
    const perf = A.savePerformance({ name: 'P', showId: null, date: '', time: '', venue: '', address: '', callTime: '', dressRehearsal: '', notes: '', details: '' });
    const castA = A.createCast('performance', perf, 'Cast A');
    const castB = A.createCast('performance', perf, 'Cast B');
    const ava = dancer('Ava', { costumeSize: 'Adult S' });
    const lily = dancer('Lily');
    const mia = dancer('Mia');
    A.addDancersToCast(castA, [ava, lily, mia]);
    const tutu = costume('Tutu', { size: 'Adult S', quantity: 1 });
    const dress = costume('Dress', { accessories: [{ name: 'Headpiece', quantity: 0 }] });
    return { perf, castA, castB, ava, lily, mia, tutu, dress };
  }

  it('one dancer can wear several costumes; warnings are computed', () => {
    const s = setup();
    A.assignCostumes({ ownerType: 'performance', ownerId: s.perf, costumeIds: [s.tutu, s.dress], castId: s.castA, dancerIds: [s.ava] });
    A.assignCostumes({ ownerType: 'performance', ownerId: s.perf, costumeIds: [s.tutu], castId: s.castA, dancerIds: [s.lily] });
    const { rows, readiness } = buildOverview(getDb(), 'performance', s.perf);
    expect(rows.filter((r) => r.dancerId === s.ava && r.costume)).toHaveLength(2);
    expect(readiness.unassignedDancers.map((u) => u.dancerId)).toEqual([s.mia]);
    // tutu qty 1 but worn by 2 dancers in the same cast
    expect(rows.find((r) => r.dancerId === s.lily)!.issues).toContain('quantity_short');
    expect(rows.find((r) => r.dancerId === s.ava && r.costume?.id === s.dress)!.issues).toContain('missing_accessory');
    expect(readiness.totalAssignments).toBe(3);
    expect(readiness.percent).toBe(75); // 3 ready / (3 + 1 missing)
  });

  it('status changes update readiness automatically', () => {
    const s = setup();
    A.assignCostumes({ ownerType: 'performance', ownerId: s.perf, costumeIds: [s.dress], castId: s.castA, dancerIds: [] }); // whole cast
    expect(buildOverview(getDb(), 'performance', s.perf).readiness.percent).toBe(100);
    A.setCostumeStatus([s.dress], 'in_progress', 'repair', '');
    const r = buildOverview(getDb(), 'performance', s.perf).readiness;
    expect(r.percent).toBe(0);
    expect(r.needsWork).toBe(3);
  });

  it('moving a dancer between casts carries their costumes', () => {
    const s = setup();
    A.assignCostumes({ ownerType: 'performance', ownerId: s.perf, costumeIds: [s.tutu], castId: s.castA, dancerIds: [s.ava] });
    const m = getDb().castMembers.find((x) => x.dancerId === s.ava)!;
    A.moveCastMembers([m.id], s.castB);
    const rows = buildOverview(getDb(), 'performance', s.perf).rows;
    const avaRow = rows.find((r) => r.dancerId === s.ava)!;
    expect(avaRow.castId).toBe(s.castB);
    expect(avaRow.costume?.id).toBe(s.tutu);
  });

  it('duplicating a cast copies members and assignments', () => {
    const s = setup();
    A.assignCostumes({ ownerType: 'performance', ownerId: s.perf, costumeIds: [s.tutu], castId: s.castA, dancerIds: [s.ava] });
    const copy = A.duplicateCast(s.castA);
    expect(getDb().castMembers.filter((m) => m.castId === copy)).toHaveLength(3);
    expect(getDb().assignments.filter((a) => a.castId === copy)).toHaveLength(1);
    expect(getDb().casts.find((c) => c.id === copy)!.name).toBe('Cast A (copy)');
  });

  it('deleting a dancer or costume cleans up related records', () => {
    const s = setup();
    A.assignCostumes({ ownerType: 'performance', ownerId: s.perf, costumeIds: [s.tutu], castId: s.castA, dancerIds: [s.ava, s.lily] });
    A.deleteDancers([s.ava]);
    expect(getDb().castMembers.some((m) => m.dancerId === s.ava)).toBe(false);
    expect(getDb().assignments.some((a) => a.dancerId === s.ava)).toBe(false);
    A.deleteCostumes([s.tutu]);
    expect(getDb().assignments.some((a) => a.costumeId === s.tutu)).toBe(false);
    expect(dancerCostumes(getDb(), s.lily)).toHaveLength(0);
  });

  it('performance can start from a show’s casts', () => {
    const show = A.saveShow({ name: 'Show', categoryId: null, description: '', startDate: '', endDate: '', venue: '', notes: '', status: 'planning' });
    const c = A.createCast('show', show, 'Saturday Cast');
    const d = dancer('Zoe');
    A.addDancersToCast(c, [d]);
    const t = costume('Tutu');
    A.assignCostumes({ ownerType: 'show', ownerId: show, costumeIds: [t], castId: c, dancerIds: [d] });
    const perf = A.savePerformance({ name: 'P', showId: show, date: '', time: '', venue: '', address: '', callTime: '', dressRehearsal: '', notes: '', details: '' }, undefined, { copyFromShow: true });
    const rows = buildOverview(getDb(), 'performance', perf).rows;
    expect(rows).toHaveLength(1);
    expect(rows[0].costume?.id).toBe(t);
    A.deleteShow(show);
    expect(getDb().performances.find((p) => p.id === perf)!.showId).toBeNull();
    expect(buildOverview(getDb(), 'performance', perf).rows).toHaveLength(1);
  });

  it('backup restore round-trips', () => {
    setup();
    const snapshot = JSON.parse(JSON.stringify(getDb()));
    replaceDb(emptyDatabase());
    A.restoreBackup(snapshot);
    expect(getDb().dancers).toHaveLength(3);
    expect(() => A.restoreBackup({ hello: 'world' })).toThrow(ValidationError);
  });
});

describe('props', () => {
  const prop = (name: string, extra: Partial<A.CostumeInput> = {}) => costume(name, { kind: 'prop', ...extra });

  it('get their own ID sequence and stay out of costume readiness', () => {
    costume('Tutu');
    const p = prop('Umbrella', { quantity: 1 });
    const db = getDb();
    expect(db.costumes.find((c) => c.id === p)!.inventoryNumber).toBe('PROP-0001');
    expect(itemsOf(db, 'costume')).toHaveLength(1);
    expect(itemsOf(db, 'prop')).toHaveLength(1);
    expect(getDb().costumeNotes.find((n) => n.costumeId === p)!.text).toBe('Prop added to inventory.');
    const copy = A.duplicateCostume(p);
    expect(getDb().costumes.find((c) => c.id === copy)!.inventoryNumber).toBe('PROP-0002');
  });

  it('can be assigned to dancers, whole casts or the show, with warnings', () => {
    const show = A.saveShow({ name: 'S', categoryId: null, description: '', startDate: '', endDate: '', venue: '', notes: '', status: 'planning' });
    const cast = A.createCast('show', show, 'Cast A');
    const ava = dancer('Ava');
    const lily = dancer('Lily');
    A.addDancersToCast(cast, [ava, lily]);
    const umbrella = prop('Umbrella', { quantity: 1, accessories: [{ name: 'Handle', quantity: 0 }] });
    const chair = prop('Chair');
    const tutu = costume('Tutu');
    A.assignCostumes({ ownerType: 'show', ownerId: show, costumeIds: [tutu], castId: cast, dancerIds: [] });
    A.assignCostumes({ ownerType: 'show', ownerId: show, costumeIds: [umbrella], castId: cast, dancerIds: [] });
    A.addCostumesToOwner('show', show, [chair]);
    const { rows, readiness } = buildPropOverview(getDb(), 'show', show);
    expect(rows.map((r) => r.target).sort()).toEqual(['cast', 'show']);
    const u = rows.find((r) => r.prop.id === umbrella)!;
    expect(u.issues).toContain('quantity_short'); // 2 dancers, 1 umbrella
    expect(u.issues).toContain('missing_part');
    expect(readiness.total).toBe(2);
    // Costume readiness ignores props entirely.
    const costumeView = buildOverview(getDb(), 'show', show);
    expect(costumeView.rows.every((r) => r.costume?.kind !== 'prop')).toBe(true);
    expect(costumeView.readiness.totalAssignments).toBe(2);
    expect(ownerCostumeIds(getDb(), 'show', show, 'prop')).toHaveLength(2);
    // Dancer profile sees the prop via the whole-cast assignment.
    expect(dancerCostumes(getDb(), ava).some((e) => e.costume.id === umbrella && e.viaCast)).toBe(true);
    A.setCostumeStatus([umbrella], 'in_progress', 'repair', 'bent rib');
    expect(buildPropOverview(getDb(), 'show', show).readiness.needsWork).toBe(1);
  });
});

describe('volunteers', () => {
  const input = (extra: Partial<A.VolunteerInput> = {}): A.VolunteerInput => ({
    firstName: 'Dana', lastName: 'W', email: 'dana@example.com', phone: '555 201 4410', preferredContact: 'text', skills: ['Sewing', ' Sewing ', 'Hair'], notes: '',
    availability: [
      { id: '', type: 'date', date: '2026-12-14', weekday: 0, start: '16:00', end: '22:00', note: '' },
      { id: '', type: 'weekly', date: '', weekday: 2, start: '', end: '', note: 'Tuesdays' },
    ],
    ...extra,
  });

  it('saves contact, de-duplicated skills and availability', () => {
    const id = A.saveVolunteer(input());
    const v = getDb().volunteers.find((x) => x.id === id)!;
    expect(v.skills).toEqual(['Sewing', 'Hair']);
    expect(v.availability.every((s) => s.id)).toBe(true);
    expect(availableSlots(v, '2026-12-14', '19:00')).toHaveLength(1);
    expect(availableSlots(v, '2026-12-14', '23:00')).toHaveLength(0);
    expect(availableSlots(v, '2026-12-15')).toHaveLength(1); // a Tuesday, weekly all-day
    expect(availableSlots(v, '2026-12-16')).toHaveLength(0);
  });

  it('validates input', () => {
    expect(() => A.saveVolunteer(input({ firstName: '' }))).toThrow(/First name/);
    expect(() => A.saveVolunteer(input({ email: 'nope' }))).toThrow(/Email/);
    expect(() => A.saveVolunteer(input({ availability: [{ id: '', type: 'date', date: '', weekday: 0, start: '', end: '', note: '' }] }))).toThrow(/choose a date/);
    expect(() => A.saveVolunteer(input({ availability: [{ id: '', type: 'weekly', date: '', weekday: 1, start: '18:00', end: '17:00', note: '' }] }))).toThrow(/after the start/);
    const id = A.saveVolunteer(input());
    A.deleteVolunteers([id]);
    expect(getDb().volunteers).toHaveLength(0);
  });
});

describe('upgrade from version 1', () => {
  it('adds sample props and volunteers next to existing sample data, once', () => {
    const v1 = buildSampleData(emptyDatabase());
    v1.costumes = v1.costumes.filter((c) => c.kind !== 'prop');
    v1.volunteers = [];
    const raw = JSON.parse(JSON.stringify(v1));
    raw.meta.schemaVersion = 1;
    delete raw.volunteers;
    delete raw.meta.nextPropNumber;
    delete raw.settings.propIdPrefix;
    const db = normalizeDatabase(raw);
    expect(itemsOf(db, 'prop').length).toBe(6);
    expect(db.volunteers.length).toBe(4);
    expect(db.settings.propIdPrefix).toBe('PROP');
    expect(db.assignments.some((a) => itemsOf(db, 'prop').some((p) => p.id === a.costumeId) && a.dancerId)).toBe(true);
    // Running it again does not duplicate.
    expect(itemsOf(normalizeDatabase(JSON.parse(JSON.stringify(db))), 'prop').length).toBe(6);
  });
});

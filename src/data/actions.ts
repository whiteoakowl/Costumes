import { commit, emptyDatabase, normalizeDatabase, replaceDb, ValidationError, getDb } from './store';
import { newId, nowIso, todayStr } from './ids';
import { buildSampleData } from './sample';
import type {
  Accessory,
  CastList,
  Costume,
  CostumeStatus,
  Database,
  Dancer,
  ID,
  NoteType,
  OwnerType,
  PerformancePlan,
  ProgressReason,
  Settings,
  Show,
  StorageLocation,
} from './types';

/* ------------------------------------------------------------------ helpers */

function stamp() {
  const t = nowIso();
  return { id: newId(), createdAt: t, updatedAt: t };
}

function required(value: string | undefined | null, label: string): string {
  const v = (value ?? '').trim();
  if (!v) throw new ValidationError(`${label} is required.`);
  return v;
}

function validDate(value: string, label: string) {
  if (!value) return '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value))) {
    throw new ValidationError(`${label} is not a valid date.`);
  }
  return value;
}

function findOrThrow<T extends { id: ID }>(list: T[], id: ID, label: string): T {
  const rec = list.find((r) => r.id === id);
  if (!rec) throw new ValidationError(`${label} no longer exists. It may have been deleted.`);
  return rec;
}

function sameName(a: string, b: string) {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

function wholeNumber(value: number, label: string) {
  if (!Number.isFinite(value) || value < 0 || !Number.isInteger(value)) {
    throw new ValidationError(`${label} must be a whole number of 0 or more.`);
  }
  return value;
}

function locationName(db: Database, id: ID | null) {
  return id ? db.storageLocations.find((l) => l.id === id)?.name ?? 'Unknown' : 'Unassigned';
}

function categoryName(db: Database, id: ID | null) {
  return id ? db.categories.find((c) => c.id === id)?.name ?? 'Unknown' : 'Uncategorized';
}

function addNote(db: Database, costumeId: ID, type: NoteType, text: string) {
  db.costumeNotes.push({ ...stamp(), costumeId, type, text });
}

/**
 * Remove or detach anything that points at a record that no longer exists.
 * Run after deletes and imports so related data can never break the app.
 */
export function pruneOrphans(db: Database) {
  const costumeIds = new Set(db.costumes.map((c) => c.id));
  const dancerIds = new Set(db.dancers.map((d) => d.id));
  const showIds = new Set(db.shows.map((s) => s.id));
  const perfIds = new Set(db.performances.map((p) => p.id));
  const catIds = new Set(db.categories.map((c) => c.id));
  const locIds = new Set(db.storageLocations.map((l) => l.id));
  const ownerExists = (t: OwnerType, id: ID) => (t === 'show' ? showIds.has(id) : perfIds.has(id));

  for (const c of db.costumes) {
    if (c.categoryId && !catIds.has(c.categoryId)) c.categoryId = null;
    if (c.storageLocationId && !locIds.has(c.storageLocationId)) c.storageLocationId = null;
  }
  for (const s of db.shows) if (s.categoryId && !catIds.has(s.categoryId)) s.categoryId = null;
  for (const p of db.performances) if (p.showId && !showIds.has(p.showId)) p.showId = null;

  db.accessories = db.accessories.filter((a) => costumeIds.has(a.costumeId));
  db.costumeNotes = db.costumeNotes.filter((n) => costumeIds.has(n.costumeId));
  db.casts = db.casts.filter((c) => ownerExists(c.ownerType, c.ownerId));
  const castIds = new Set(db.casts.map((c) => c.id));
  db.castMembers = db.castMembers.filter((m) => castIds.has(m.castId) && dancerIds.has(m.dancerId));
  db.assignments = db.assignments.filter(
    (a) =>
      ownerExists(a.ownerType, a.ownerId) &&
      costumeIds.has(a.costumeId) &&
      (!a.castId || castIds.has(a.castId)) &&
      (!a.dancerId || dancerIds.has(a.dancerId)),
  );
}

/* ------------------------------------------------------------------ dancers */

export type DancerInput = Omit<Dancer, 'id' | 'createdAt' | 'updatedAt' | 'isSample'>;

export function saveDancer(input: DancerInput, id?: ID): ID {
  const firstName = required(input.firstName, 'First name');
  const lastName = required(input.lastName, 'Last name');
  const birthday = validDate(input.birthday, 'Birthday');
  if (birthday && birthday > todayStr()) throw new ValidationError('Birthday cannot be in the future.');
  const clean: DancerInput = {
    ...input,
    firstName,
    lastName,
    birthday,
    clothingSize: input.clothingSize.trim(),
    costumeSize: input.costumeSize.trim(),
    shoeSize: input.shoeSize.trim(),
    level: input.level.trim(),
    notes: input.notes.trim(),
  };
  return commit((db) => {
    if (id) {
      const d = findOrThrow(db.dancers, id, 'This dancer');
      Object.assign(d, clean, { updatedAt: nowIso() });
      return id;
    }
    const rec: Dancer = { ...stamp(), ...clean };
    db.dancers.push(rec);
    return rec.id;
  });
}

export function deleteDancers(ids: ID[]) {
  const set = new Set(ids);
  commit((db) => {
    db.dancers = db.dancers.filter((d) => !set.has(d.id));
    pruneOrphans(db);
  });
}

export function bulkUpdateDancers(ids: ID[], patch: Partial<Pick<Dancer, 'level' | 'pointe'>>) {
  const set = new Set(ids);
  commit((db) => {
    for (const d of db.dancers) if (set.has(d.id)) Object.assign(d, patch, { updatedAt: nowIso() });
  });
}

/* --------------------------------------------------------------- categories */

export function saveCategory(name: string, id?: ID): ID {
  const n = required(name, 'Category name');
  return commit((db) => {
    if (db.categories.some((c) => c.id !== id && sameName(c.name, n))) {
      throw new ValidationError(`A category named "${n}" already exists.`);
    }
    if (id) {
      const c = findOrThrow(db.categories, id, 'This category');
      c.name = n;
      c.updatedAt = nowIso();
      return id;
    }
    const sortOrder = db.categories.reduce((m, c) => Math.max(m, c.sortOrder), 0) + 1;
    const rec = { ...stamp(), name: n, sortOrder };
    db.categories.push(rec);
    return rec.id;
  });
}

export function moveCategory(id: ID, direction: -1 | 1) {
  commit((db) => {
    const sorted = [...db.categories].sort((a, b) => a.sortOrder - b.sortOrder);
    const i = sorted.findIndex((c) => c.id === id);
    const j = i + direction;
    if (i < 0 || j < 0 || j >= sorted.length) return;
    [sorted[i], sorted[j]] = [sorted[j], sorted[i]];
    sorted.forEach((c, idx) => {
      const rec = db.categories.find((x) => x.id === c.id)!;
      rec.sortOrder = idx + 1;
    });
  });
}

/** Delete a category; its costumes and shows move to `reassignTo` (or become uncategorized). */
export function deleteCategory(id: ID, reassignTo: ID | null) {
  if (reassignTo === id) throw new ValidationError('Choose a different category to move costumes into.');
  commit((db) => {
    const cat = findOrThrow(db.categories, id, 'This category');
    const target = categoryName(db, reassignTo);
    for (const c of db.costumes) {
      if (c.categoryId === id) {
        c.categoryId = reassignTo;
        c.updatedAt = nowIso();
        addNote(db, c.id, 'change', `Category "${cat.name}" was deleted; costume moved to ${target}.`);
      }
    }
    for (const s of db.shows) if (s.categoryId === id) s.categoryId = reassignTo;
    db.categories = db.categories.filter((c) => c.id !== id);
  });
}

/* --------------------------------------------------------- storage locations */

export type LocationInput = Pick<StorageLocation, 'name' | 'description' | 'unitNumber' | 'notes'>;

export function saveLocation(input: LocationInput, id?: ID): ID {
  const name = required(input.name, 'Location name');
  const clean = {
    name,
    description: input.description.trim(),
    unitNumber: input.unitNumber.trim(),
    notes: input.notes.trim(),
  };
  return commit((db) => {
    if (db.storageLocations.some((l) => l.id !== id && sameName(l.name, name))) {
      throw new ValidationError(`A storage location named "${name}" already exists.`);
    }
    if (id) {
      const l = findOrThrow(db.storageLocations, id, 'This location');
      Object.assign(l, clean, { updatedAt: nowIso() });
      return id;
    }
    const rec: StorageLocation = { ...stamp(), ...clean };
    db.storageLocations.push(rec);
    return rec.id;
  });
}

/** Delete a location; costumes stored there move to `reassignTo` or become unassigned (and it is logged). */
export function deleteLocation(id: ID, reassignTo: ID | null) {
  if (reassignTo === id) throw new ValidationError('Choose a different location to move costumes into.');
  commit((db) => {
    const loc = findOrThrow(db.storageLocations, id, 'This location');
    const target = locationName(db, reassignTo);
    for (const c of db.costumes) {
      if (c.storageLocationId === id) {
        c.storageLocationId = reassignTo;
        c.updatedAt = nowIso();
        addNote(db, c.id, 'location', `Storage location "${loc.name}" was deleted; costume moved to ${target}.`);
      }
    }
    db.storageLocations = db.storageLocations.filter((l) => l.id !== id);
  });
}

/* ----------------------------------------------------------------- costumes */

export interface AccessoryInput {
  id?: ID;
  name: string;
  quantity: number;
}

export type CostumeInput = Pick<
  Costume,
  'name' | 'categoryId' | 'description' | 'size' | 'quantity' | 'dateAdded' | 'storageLocationId' | 'repairNotes' | 'notes'
> & {
  status: CostumeStatus;
  progressReason: ProgressReason | null;
  accessories: AccessoryInput[];
};

function nextInventoryNumber(db: Database) {
  const prefix = (db.settings.costumeIdPrefix || 'COS').trim();
  let n = db.meta.nextCostumeNumber;
  let code = `${prefix}-${String(n).padStart(4, '0')}`;
  while (db.costumes.some((c) => c.inventoryNumber === code)) {
    n += 1;
    code = `${prefix}-${String(n).padStart(4, '0')}`;
  }
  db.meta.nextCostumeNumber = n + 1;
  return code;
}

function describeAccessories(list: { name: string; quantity: number }[]) {
  return list.length ? list.map((a) => `${a.name} ×${a.quantity}`).join(', ') : 'none';
}

export function saveCostume(input: CostumeInput, id?: ID): ID {
  const name = required(input.name, 'Costume name');
  const quantity = wholeNumber(Number(input.quantity), 'Available quantity');
  const dateAdded = validDate(input.dateAdded, 'Date added') || todayStr();
  const accessories = input.accessories
    .map((a) => ({ ...a, name: a.name.trim(), quantity: Number(a.quantity) }))
    .filter((a) => a.name);
  for (const a of accessories) wholeNumber(a.quantity, `Quantity for "${a.name}"`);

  return commit((db) => {
    if (input.categoryId) findOrThrow(db.categories, input.categoryId, 'The selected category');
    if (input.storageLocationId) findOrThrow(db.storageLocations, input.storageLocationId, 'The selected storage location');
    const t = nowIso();
    const fields = {
      name,
      categoryId: input.categoryId,
      description: input.description.trim(),
      size: input.size.trim(),
      quantity,
      dateAdded,
      storageLocationId: input.storageLocationId,
      repairNotes: input.repairNotes.trim(),
      notes: input.notes.trim(),
    };

    let costume: Costume;
    if (id) {
      costume = findOrThrow(db.costumes, id, 'This costume');
      // Record meaningful changes in the costume's history log.
      if (costume.size !== fields.size) addNote(db, id, 'sizing', `Size changed from "${costume.size || '—'}" to "${fields.size || '—'}".`);
      if (costume.storageLocationId !== fields.storageLocationId)
        addNote(db, id, 'location', `Moved from ${locationName(db, costume.storageLocationId)} to ${locationName(db, fields.storageLocationId)}.`);
      if (costume.categoryId !== fields.categoryId)
        addNote(db, id, 'change', `Category changed from ${categoryName(db, costume.categoryId)} to ${categoryName(db, fields.categoryId)}.`);
      if (costume.quantity !== fields.quantity) addNote(db, id, 'change', `Available quantity changed from ${costume.quantity} to ${fields.quantity}.`);
      if (costume.name !== fields.name) addNote(db, id, 'change', `Renamed from "${costume.name}" to "${fields.name}".`);
      const before = describeAccessories(db.accessories.filter((a) => a.costumeId === id));
      const after = describeAccessories(accessories);
      if (before !== after) addNote(db, id, 'accessory', `Accessories updated: ${after}.`);
      Object.assign(costume, fields, { updatedAt: t });
    } else {
      costume = {
        ...stamp(),
        ...fields,
        inventoryNumber: nextInventoryNumber(db),
        status: 'ready',
        progressReason: null,
        statusUpdatedAt: t,
      };
      db.costumes.push(costume);
      addNote(db, costume.id, 'general', 'Costume added to inventory.');
    }

    // Replace accessory rows, keeping ids for ones that still exist.
    const existing = new Map(db.accessories.filter((a) => a.costumeId === costume.id).map((a) => [a.id, a]));
    db.accessories = db.accessories.filter((a) => a.costumeId !== costume.id);
    for (const a of accessories) {
      const prev = a.id ? existing.get(a.id) : undefined;
      const rec: Accessory = prev
        ? { ...prev, name: a.name, quantity: a.quantity, updatedAt: t }
        : { ...stamp(), costumeId: costume.id, name: a.name, quantity: a.quantity };
      db.accessories.push(rec);
    }

    if (costume.status !== input.status || costume.progressReason !== input.progressReason) {
      applyStatus(db, costume, input.status, input.progressReason, '');
    }
    return costume.id;
  });
}

export const progressReasonLabels: Record<ProgressReason, string> = {
  repair: 'Needs repair',
  alteration: 'Being altered',
  cleaning: 'Cleaning',
  replacement: 'Needs replacement',
  other: 'Other work',
};

function applyStatus(db: Database, c: Costume, status: CostumeStatus, reason: ProgressReason | null, note: string) {
  const t = nowIso();
  c.status = status;
  c.progressReason = status === 'in_progress' ? reason ?? 'repair' : null;
  c.statusUpdatedAt = t;
  c.updatedAt = t;
  const text = note.trim();
  if (status === 'in_progress') {
    if (text) c.repairNotes = text;
    addNote(
      db,
      c.id,
      c.progressReason === 'alteration' ? 'alteration' : 'status',
      `Marked IN PROGRESS (${progressReasonLabels[c.progressReason!]})${text ? `: ${text}` : '.'}`,
    );
  } else {
    addNote(db, c.id, 'status', `Marked READY${text ? `: ${text}` : '.'}`);
  }
}

export function setCostumeStatus(ids: ID[], status: CostumeStatus, reason: ProgressReason | null, note: string) {
  commit((db) => {
    for (const id of ids) applyStatus(db, findOrThrow(db.costumes, id, 'A selected costume'), status, reason, note);
  });
}

export function addCostumeNote(costumeId: ID, type: NoteType, text: string) {
  const t = required(text, 'Note');
  commit((db) => {
    const c = findOrThrow(db.costumes, costumeId, 'This costume');
    addNote(db, costumeId, type, t);
    c.updatedAt = nowIso();
  });
}

export function moveCostumes(ids: ID[], locationId: ID | null) {
  commit((db) => {
    if (locationId) findOrThrow(db.storageLocations, locationId, 'The selected storage location');
    for (const id of ids) {
      const c = findOrThrow(db.costumes, id, 'A selected costume');
      if (c.storageLocationId === locationId) continue;
      addNote(db, id, 'location', `Moved from ${locationName(db, c.storageLocationId)} to ${locationName(db, locationId)}.`);
      c.storageLocationId = locationId;
      c.updatedAt = nowIso();
    }
  });
}

export function setCostumesCategory(ids: ID[], categoryId: ID | null) {
  commit((db) => {
    if (categoryId) findOrThrow(db.categories, categoryId, 'The selected category');
    for (const id of ids) {
      const c = findOrThrow(db.costumes, id, 'A selected costume');
      if (c.categoryId === categoryId) continue;
      addNote(db, id, 'change', `Category changed from ${categoryName(db, c.categoryId)} to ${categoryName(db, categoryId)}.`);
      c.categoryId = categoryId;
      c.updatedAt = nowIso();
    }
  });
}

export function duplicateCostume(id: ID): ID {
  return commit((db) => {
    const src = findOrThrow(db.costumes, id, 'This costume');
    const t = nowIso();
    const copy: Costume = {
      ...src,
      ...stamp(),
      isSample: false,
      name: `${src.name} (copy)`,
      inventoryNumber: nextInventoryNumber(db),
      dateAdded: todayStr(),
      statusUpdatedAt: t,
    };
    db.costumes.push(copy);
    for (const a of db.accessories.filter((x) => x.costumeId === id)) {
      db.accessories.push({ ...a, ...stamp(), isSample: false, costumeId: copy.id });
    }
    addNote(db, copy.id, 'general', `Duplicated from ${src.inventoryNumber} "${src.name}".`);
    return copy.id;
  });
}

export function deleteCostumes(ids: ID[]) {
  const set = new Set(ids);
  commit((db) => {
    db.costumes = db.costumes.filter((c) => !set.has(c.id));
    pruneOrphans(db);
  });
}

/* -------------------------------------------------------------------- shows */

export type ShowInput = Pick<Show, 'name' | 'categoryId' | 'description' | 'startDate' | 'endDate' | 'venue' | 'notes' | 'status'>;

export function saveShow(input: ShowInput, id?: ID): ID {
  const name = required(input.name, 'Show name');
  const startDate = validDate(input.startDate, 'Start date');
  const endDate = validDate(input.endDate, 'End date');
  if (startDate && endDate && endDate < startDate) throw new ValidationError('End date cannot be before the start date.');
  const clean: ShowInput = { ...input, name, startDate, endDate, description: input.description.trim(), venue: input.venue.trim(), notes: input.notes.trim() };
  return commit((db) => {
    if (clean.categoryId) findOrThrow(db.categories, clean.categoryId, 'The selected show type');
    if (id) {
      Object.assign(findOrThrow(db.shows, id, 'This show'), clean, { updatedAt: nowIso() });
      return id;
    }
    const rec: Show = { ...stamp(), ...clean };
    db.shows.push(rec);
    return rec.id;
  });
}

/** Copy casts, members and costume assignments from one owner to another. */
function copyCastsAndAssignments(db: Database, fromType: OwnerType, fromId: ID, toType: OwnerType, toId: ID) {
  const castMap = new Map<ID, ID>();
  const sourceCasts = db.casts.filter((c) => c.ownerType === fromType && c.ownerId === fromId);
  let order = db.casts.filter((c) => c.ownerType === toType && c.ownerId === toId).reduce((m, c) => Math.max(m, c.sortOrder), 0);
  for (const c of sourceCasts.sort((a, b) => a.sortOrder - b.sortOrder)) {
    const copy: CastList = { ...c, ...stamp(), isSample: false, ownerType: toType, ownerId: toId, sortOrder: ++order };
    castMap.set(c.id, copy.id);
    db.casts.push(copy);
    for (const m of db.castMembers.filter((x) => x.castId === c.id)) {
      db.castMembers.push({ ...m, ...stamp(), isSample: false, castId: copy.id });
    }
  }
  for (const a of db.assignments.filter((x) => x.ownerType === fromType && x.ownerId === fromId)) {
    db.assignments.push({
      ...a,
      ...stamp(),
      isSample: false,
      ownerType: toType,
      ownerId: toId,
      castId: a.castId ? castMap.get(a.castId) ?? null : null,
    });
  }
}

export function duplicateShow(id: ID): ID {
  return commit((db) => {
    const src = findOrThrow(db.shows, id, 'This show');
    const copy: Show = { ...src, ...stamp(), isSample: false, name: `${src.name} (copy)`, status: 'planning' };
    db.shows.push(copy);
    copyCastsAndAssignments(db, 'show', id, 'show', copy.id);
    return copy.id;
  });
}

export function deleteShow(id: ID) {
  commit((db) => {
    db.shows = db.shows.filter((s) => s.id !== id);
    pruneOrphans(db);
  });
}

/* ------------------------------------------------------------- performances */

export type PerformanceInput = Omit<PerformancePlan, 'id' | 'createdAt' | 'updatedAt' | 'isSample'>;

export function savePerformance(input: PerformanceInput, id?: ID, opts: { copyFromShow?: boolean } = {}): ID {
  const name = required(input.name, 'Performance name');
  const date = validDate(input.date, 'Performance date');
  if (input.dressRehearsal && Number.isNaN(Date.parse(input.dressRehearsal))) {
    throw new ValidationError('Dress rehearsal date/time is not valid.');
  }
  const clean: PerformanceInput = {
    ...input,
    name,
    date,
    venue: input.venue.trim(),
    address: input.address.trim(),
    notes: input.notes.trim(),
    details: input.details.trim(),
  };
  return commit((db) => {
    if (clean.showId) findOrThrow(db.shows, clean.showId, 'The selected show');
    let perfId = id;
    if (id) {
      Object.assign(findOrThrow(db.performances, id, 'This performance'), clean, { updatedAt: nowIso() });
    } else {
      const rec: PerformancePlan = { ...stamp(), ...clean };
      db.performances.push(rec);
      perfId = rec.id;
    }
    if (opts.copyFromShow && clean.showId) copyCastsAndAssignments(db, 'show', clean.showId, 'performance', perfId!);
    return perfId!;
  });
}

export function importShowCasts(performanceId: ID, showId: ID) {
  commit((db) => {
    findOrThrow(db.performances, performanceId, 'This performance');
    findOrThrow(db.shows, showId, 'The selected show');
    copyCastsAndAssignments(db, 'show', showId, 'performance', performanceId);
  });
}

export function duplicatePerformance(id: ID): ID {
  return commit((db) => {
    const src = findOrThrow(db.performances, id, 'This performance');
    const copy: PerformancePlan = { ...src, ...stamp(), isSample: false, name: `${src.name} (copy)` };
    db.performances.push(copy);
    copyCastsAndAssignments(db, 'performance', id, 'performance', copy.id);
    return copy.id;
  });
}

export function deletePerformance(id: ID) {
  commit((db) => {
    db.performances = db.performances.filter((p) => p.id !== id);
    pruneOrphans(db);
  });
}

/* --------------------------------------------------------------- cast lists */

function ownerMustExist(db: Database, ownerType: OwnerType, ownerId: ID) {
  if (ownerType === 'show') findOrThrow(db.shows, ownerId, 'This show');
  else findOrThrow(db.performances, ownerId, 'This performance');
}

export function createCast(ownerType: OwnerType, ownerId: ID, name: string): ID {
  const n = required(name, 'Cast list name');
  return commit((db) => {
    ownerMustExist(db, ownerType, ownerId);
    const siblings = db.casts.filter((c) => c.ownerType === ownerType && c.ownerId === ownerId);
    if (siblings.some((c) => sameName(c.name, n))) throw new ValidationError(`There is already a cast list named "${n}".`);
    const rec: CastList = { ...stamp(), ownerType, ownerId, name: n, sortOrder: siblings.reduce((m, c) => Math.max(m, c.sortOrder), 0) + 1 };
    db.casts.push(rec);
    return rec.id;
  });
}

export function renameCast(id: ID, name: string) {
  const n = required(name, 'Cast list name');
  commit((db) => {
    const cast = findOrThrow(db.casts, id, 'This cast list');
    if (db.casts.some((c) => c.id !== id && c.ownerType === cast.ownerType && c.ownerId === cast.ownerId && sameName(c.name, n))) {
      throw new ValidationError(`There is already a cast list named "${n}".`);
    }
    cast.name = n;
    cast.updatedAt = nowIso();
  });
}

export function duplicateCast(id: ID): ID {
  return commit((db) => {
    const src = findOrThrow(db.casts, id, 'This cast list');
    const siblings = db.casts.filter((c) => c.ownerType === src.ownerType && c.ownerId === src.ownerId);
    let name = `${src.name} (copy)`;
    let i = 2;
    while (siblings.some((c) => sameName(c.name, name))) name = `${src.name} (copy ${i++})`;
    const copy: CastList = { ...src, ...stamp(), isSample: false, name, sortOrder: siblings.reduce((m, c) => Math.max(m, c.sortOrder), 0) + 1 };
    db.casts.push(copy);
    for (const m of db.castMembers.filter((x) => x.castId === id)) db.castMembers.push({ ...m, ...stamp(), isSample: false, castId: copy.id });
    for (const a of db.assignments.filter((x) => x.castId === id)) db.assignments.push({ ...a, ...stamp(), isSample: false, castId: copy.id });
    return copy.id;
  });
}

export function deleteCast(id: ID) {
  commit((db) => {
    db.casts = db.casts.filter((c) => c.id !== id);
    pruneOrphans(db);
  });
}

export function addDancersToCast(castId: ID, dancerIds: ID[]) {
  commit((db) => {
    findOrThrow(db.casts, castId, 'This cast list');
    for (const dancerId of dancerIds) {
      findOrThrow(db.dancers, dancerId, 'A selected dancer');
      if (db.castMembers.some((m) => m.castId === castId && m.dancerId === dancerId)) continue;
      db.castMembers.push({ ...stamp(), castId, dancerId, role: '' });
    }
  });
}

export function removeCastMembers(membershipIds: ID[]) {
  const set = new Set(membershipIds);
  commit((db) => {
    const removed = db.castMembers.filter((m) => set.has(m.id));
    db.castMembers = db.castMembers.filter((m) => !set.has(m.id));
    // Dancer-specific costume assignments made in that cast go with them.
    for (const m of removed) {
      db.assignments = db.assignments.filter((a) => !(a.castId === m.castId && a.dancerId === m.dancerId));
    }
  });
}

export function setMemberRole(membershipId: ID, role: string) {
  commit((db) => {
    const m = findOrThrow(db.castMembers, membershipId, 'This cast member');
    m.role = role.trim();
    m.updatedAt = nowIso();
  });
}

/** Move dancers to another cast list of the same show/performance, bringing their costume assignments along. */
export function moveCastMembers(membershipIds: ID[], toCastId: ID) {
  commit((db) => {
    const target = findOrThrow(db.casts, toCastId, 'The destination cast list');
    for (const mid of membershipIds) {
      const m = findOrThrow(db.castMembers, mid, 'A cast member');
      if (m.castId === toCastId) continue;
      const from = m.castId;
      const fromCast = db.casts.find((c) => c.id === from);
      if (fromCast && (fromCast.ownerType !== target.ownerType || fromCast.ownerId !== target.ownerId)) {
        throw new ValidationError('Dancers can only be moved between cast lists of the same show or performance.');
      }
      for (const a of db.assignments) {
        if (a.castId === from && a.dancerId === m.dancerId) a.castId = toCastId;
      }
      if (db.castMembers.some((x) => x.castId === toCastId && x.dancerId === m.dancerId)) {
        db.castMembers = db.castMembers.filter((x) => x.id !== mid);
      } else {
        m.castId = toCastId;
        m.updatedAt = nowIso();
      }
    }
  });
}

/* ------------------------------------------------------- costume assignments */

export function addCostumesToOwner(ownerType: OwnerType, ownerId: ID, costumeIds: ID[]) {
  commit((db) => {
    ownerMustExist(db, ownerType, ownerId);
    for (const costumeId of costumeIds) {
      findOrThrow(db.costumes, costumeId, 'A selected costume');
      const exists = db.assignments.some((a) => a.ownerType === ownerType && a.ownerId === ownerId && a.costumeId === costumeId);
      if (exists) continue;
      db.assignments.push({ ...stamp(), ownerType, ownerId, costumeId, castId: null, dancerId: null, notes: '' });
    }
  });
}

/**
 * Assign costumes. With a dancerId the costume goes to that dancer (within castId);
 * with only a castId the whole cast wears it.
 */
export function assignCostumes(opts: { ownerType: OwnerType; ownerId: ID; costumeIds: ID[]; castId: ID | null; dancerIds: ID[] }) {
  const { ownerType, ownerId, costumeIds, castId, dancerIds } = opts;
  if (!costumeIds.length) throw new ValidationError('Choose at least one costume.');
  if (!castId && !dancerIds.length) throw new ValidationError('Choose a cast list or at least one dancer.');
  commit((db) => {
    ownerMustExist(db, ownerType, ownerId);
    if (castId) findOrThrow(db.casts, castId, 'The selected cast list');
    const targets: (ID | null)[] = dancerIds.length ? dancerIds : [null];
    for (const costumeId of costumeIds) {
      findOrThrow(db.costumes, costumeId, 'A selected costume');
      for (const dancerId of targets) {
        const dup = db.assignments.some(
          (a) => a.ownerType === ownerType && a.ownerId === ownerId && a.costumeId === costumeId && a.castId === castId && a.dancerId === dancerId,
        );
        if (dup) continue;
        db.assignments.push({ ...stamp(), ownerType, ownerId, costumeId, castId, dancerId, notes: '' });
      }
    }
  });
}

export function changeAssignmentCostume(assignmentId: ID, costumeId: ID) {
  commit((db) => {
    const a = findOrThrow(db.assignments, assignmentId, 'This assignment');
    findOrThrow(db.costumes, costumeId, 'The selected costume');
    a.costumeId = costumeId;
    a.updatedAt = nowIso();
  });
}

export function removeAssignments(ids: ID[]) {
  const set = new Set(ids);
  commit((db) => {
    db.assignments = db.assignments.filter((a) => !set.has(a.id));
  });
}

/** Remove a costume from a show/performance entirely, including every dancer/cast assignment of it. */
export function removeCostumeFromOwner(ownerType: OwnerType, ownerId: ID, costumeId: ID) {
  commit((db) => {
    db.assignments = db.assignments.filter((a) => !(a.ownerType === ownerType && a.ownerId === ownerId && a.costumeId === costumeId));
  });
}

/* ------------------------------------------------------------ settings/data */

export function updateSettings(patch: Partial<Settings>) {
  if (patch.studioName !== undefined) required(patch.studioName, 'Studio name');
  if (patch.costumeIdPrefix !== undefined) {
    const p = required(patch.costumeIdPrefix, 'Costume ID prefix');
    if (!/^[A-Za-z0-9]{1,8}$/.test(p)) throw new ValidationError('Costume ID prefix must be 1–8 letters or numbers.');
  }
  commit((db) => {
    Object.assign(db.settings, patch);
    db.settings.levels = db.settings.levels.map((s) => s.trim()).filter(Boolean);
    db.settings.sizes = db.settings.sizes.map((s) => s.trim()).filter(Boolean);
  });
}

export function countSampleRecords(db: Database = getDb()) {
  let n = 0;
  for (const key of Object.keys(db) as (keyof Database)[]) {
    const v = db[key];
    if (Array.isArray(v)) n += (v as { isSample?: boolean }[]).filter((r) => r.isSample).length;
  }
  return n;
}

export function removeSampleData() {
  commit((db) => {
    for (const key of Object.keys(db) as (keyof Database)[]) {
      const v = db[key];
      if (Array.isArray(v)) (db as unknown as Record<string, unknown>)[key] = (v as { isSample?: boolean }[]).filter((r) => !r.isSample);
    }
    pruneOrphans(db);
  });
}

export function loadSampleData() {
  commit((db) => {
    if (countSampleRecords(db) > 0) throw new ValidationError('Sample data is already loaded.');
    buildSampleData(db);
  });
}

export function eraseAllData() {
  const db = emptyDatabase();
  db.meta.sampleLoaded = true; // don't re-add samples on next launch
  db.settings = { ...getDb().settings };
  replaceDb(db);
}

export function restoreBackup(raw: unknown) {
  const db = normalizeDatabase(raw);
  pruneOrphans(db);
  db.meta.sampleLoaded = true;
  replaceDb(db);
}

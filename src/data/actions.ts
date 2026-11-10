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
  ItemKind,
  Volunteer,
  AvailabilitySlot,
  Photo,
} from './types';
import {
  completeWorkOrderIn,
  createWorkOrderIn,
  isOpenOrder,
  localNow,
  logNote,
  noteTypeFor,
  openOrdersFor,
  volunteerLabel,
  workSummary,
  workTypeLabels,
} from './workflow';
import { ensureOwnerAccount } from './studio';
import { fmtDate, fmtDateTime } from './time';

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
  if (!Array.isArray(db.workOrders)) db.workOrders = [];
  if (!Array.isArray(db.photos)) db.photos = [];
  db.workOrders = db.workOrders.filter((w) => costumeIds.has(w.costumeId));
  const volunteerIds = new Set(db.volunteers.map((v) => v.id));
  for (const w of db.workOrders) if (w.volunteerId && !volunteerIds.has(w.volunteerId)) w.volunteerId = null;
  db.photos = db.photos.filter((p) => (p.ownerType === 'dancer' ? dancerIds.has(p.ownerId) : costumeIds.has(p.ownerId)));
  // Studio management: enrollments follow their dancer & class; attendance history is kept.
  if (Array.isArray(db.enrollments)) {
    const classIds = new Set(db.classes.map((c) => c.id));
    const familyIds = new Set(db.families.map((f) => f.id));
    db.enrollments = db.enrollments.filter((e) => dancerIds.has(e.dancerId) && classIds.has(e.classId));
    for (const d of db.dancers) if (d.familyId && !familyIds.has(d.familyId)) d.familyId = null;
    for (const a of db.accounts) {
      if (a.dancerId && !dancerIds.has(a.dancerId)) {
        a.dancerId = null;
        a.active = false;
      }
    }
  }
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
    enrollmentDate: input.enrollmentDate ? validDate(input.enrollmentDate, 'Enrollment date') : input.enrollmentDate,
    medicalNotes: input.medicalNotes?.trim() ?? input.medicalNotes,
    allergies: input.allergies?.trim() ?? input.allergies,
  };
  return commit((db) => {
    if (clean.familyId) findOrThrow(db.families, clean.familyId, 'The selected family');
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
  /** Only used when creating; an item's kind never changes. Defaults to costume. */
  kind?: ItemKind;
};

export function itemKind(c: Pick<Costume, 'kind'>): ItemKind {
  return c.kind ?? 'costume';
}

function nextInventoryNumber(db: Database, kind: ItemKind) {
  const isProp = kind === 'prop';
  const prefix = ((isProp ? db.settings.propIdPrefix : db.settings.costumeIdPrefix) || (isProp ? 'PROP' : 'COS')).trim();
  let n = (isProp ? db.meta.nextPropNumber : db.meta.nextCostumeNumber) || 1;
  let code = `${prefix}-${String(n).padStart(4, '0')}`;
  while (db.costumes.some((c) => c.inventoryNumber === code)) {
    n += 1;
    code = `${prefix}-${String(n).padStart(4, '0')}`;
  }
  if (isProp) db.meta.nextPropNumber = n + 1;
  else db.meta.nextCostumeNumber = n + 1;
  return code;
}

function describeAccessories(list: { name: string; quantity: number }[]) {
  return list.length ? list.map((a) => `${a.name} ×${a.quantity}`).join(', ') : 'none';
}

export function saveCostume(input: CostumeInput, id?: ID): ID {
  const name = required(input.name, input.kind === 'prop' ? 'Prop name' : 'Costume name');
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
      const kind = input.kind ?? 'costume';
      costume = {
        ...stamp(),
        ...(kind === 'prop' ? { kind } : {}),
        ...fields,
        inventoryNumber: nextInventoryNumber(db, kind),
        status: 'ready',
        progressReason: null,
        statusUpdatedAt: t,
      };
      db.costumes.push(costume);
      addNote(db, costume.id, 'general', `${kind === 'prop' ? 'Prop' : 'Costume'} added to inventory.`);
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

export interface WorkExtras {
  volunteerId?: ID | null;
  scheduledAt?: string;
  dueDate?: string;
}

/**
 * Change READY / IN PROGRESS. IN PROGRESS opens (or updates) a repair /
 * cleaning work order; READY completes any open work orders. One log entry
 * per change, linked to the work order.
 */
function applyStatus(db: Database, c: Costume, status: CostumeStatus, reason: ProgressReason | null, note: string, extras: WorkExtras = {}) {
  const t = nowIso();
  const text = note.trim();
  if (status === 'in_progress') {
    const type = reason ?? 'repair';
    const existing = openOrdersFor(db, c.id).find((w) => w.type === type);
    const message = `Marked IN PROGRESS (${progressReasonLabels[type]})${text ? `: ${text}` : '.'}`;
    if (existing) {
      if (text) existing.description = text;
      if (extras.volunteerId !== undefined) existing.volunteerId = extras.volunteerId;
      if (extras.scheduledAt !== undefined) existing.scheduledAt = extras.scheduledAt;
      if (extras.dueDate !== undefined) existing.dueDate = extras.dueDate;
      existing.updatedAt = t;
      c.status = 'in_progress';
      c.progressReason = type;
      c.statusUpdatedAt = t;
      c.updatedAt = t;
      if (text) c.repairNotes = text;
      const extra = workSummary(db, existing);
      logNote(db, c.id, type === 'alteration' ? 'alteration' : 'status', message + (extra ? ` (${extra})` : ''), { workOrderId: existing.id, volunteerId: existing.volunteerId });
    } else {
      const draft = { volunteerId: extras.volunteerId ?? null, scheduledAt: extras.scheduledAt ?? '', dueDate: extras.dueDate ?? '' };
      const extra = workSummary(db, draft);
      createWorkOrderIn(db, c, { type, description: text, ...draft }, message + (extra ? ` (${extra})` : ''));
      if (type !== 'alteration' && type !== 'cleaning') {
        // Keep the historical "status" label on plain repair entries.
        const last = db.costumeNotes[db.costumeNotes.length - 1];
        if (last.costumeId === c.id) last.type = 'status';
      }
    }
  } else {
    const open = openOrdersFor(db, c.id);
    for (const w of open) completeWorkOrderIn(db, w, { note: text, log: false });
    c.status = 'ready';
    c.progressReason = null;
    c.statusUpdatedAt = t;
    c.updatedAt = t;
    logNote(db, c.id, 'status', `Marked READY${text ? `: ${text}` : '.'}`, { workOrderId: open.length === 1 ? open[0].id : null, volunteerId: open.length === 1 ? open[0].volunteerId : null });
  }
}

export function setCostumeStatus(ids: ID[], status: CostumeStatus, reason: ProgressReason | null, note: string, extras: WorkExtras = {}) {
  commit((db) => {
    if (extras.volunteerId) findOrThrow(db.volunteers, extras.volunteerId, 'The selected volunteer');
    for (const id of ids) applyStatus(db, findOrThrow(db.costumes, id, 'A selected item'), status, reason, note, extras);
  });
}

/* -------------------------------------------------------- work orders */

export interface WorkOrderInput {
  type: ProgressReason;
  description: string;
  pieces: number;
  volunteerId: ID | null;
  scheduledAt: string;
  dueDate: string;
}

function checkWorkInput(input: Partial<WorkOrderInput>) {
  if (input.scheduledAt && Number.isNaN(Date.parse(input.scheduledAt))) throw new ValidationError('Scheduled date/time is not valid.');
  if (input.dueDate) validDate(input.dueDate, 'Due date');
  if (input.pieces !== undefined && (!Number.isInteger(Number(input.pieces)) || Number(input.pieces) < 1)) throw new ValidationError('Pieces must be a whole number of 1 or more.');
}

/** Send one or more costumes / props for repair, cleaning, etc. */
export function createWorkOrders(costumeIds: ID[], input: WorkOrderInput): ID[] {
  if (!costumeIds.length) throw new ValidationError('Choose at least one costume or prop.');
  checkWorkInput(input);
  return commit((db) => {
    if (input.volunteerId) findOrThrow(db.volunteers, input.volunteerId, 'The selected volunteer');
    return costumeIds.map((id) => {
      const c = findOrThrow(db.costumes, id, 'A selected item');
      return createWorkOrderIn(db, c, { ...input, pieces: costumeIds.length > 1 ? undefined : input.pieces }).id;
    });
  });
}

/** Edit a work order; every meaningful change is written to the item's log. */
export function updateWorkOrder(id: ID, patch: Partial<WorkOrderInput>) {
  checkWorkInput(patch);
  commit((db) => {
    const w = findOrThrow(db.workOrders, id, 'This work order');
    const c = findOrThrow(db.costumes, w.costumeId, 'This item');
    if (patch.volunteerId) findOrThrow(db.volunteers, patch.volunteerId, 'The selected volunteer');
    const changes: string[] = [];
    if (patch.volunteerId !== undefined && patch.volunteerId !== w.volunteerId)
      changes.push(patch.volunteerId ? `assigned to ${volunteerLabel(db, patch.volunteerId)}` : `unassigned from ${volunteerLabel(db, w.volunteerId)}`);
    if (patch.scheduledAt !== undefined && patch.scheduledAt !== w.scheduledAt) changes.push(patch.scheduledAt ? `scheduled for ${formatLocal(patch.scheduledAt)}` : 'schedule cleared');
    if (patch.dueDate !== undefined && patch.dueDate !== w.dueDate) changes.push(patch.dueDate ? `due back ${formatLocal(patch.dueDate)}` : 'due date cleared');
    if (patch.type !== undefined && patch.type !== w.type) changes.push(`type changed to ${workTypeLabels[patch.type]}`);
    if (patch.description !== undefined && patch.description.trim() !== w.description) changes.push(`description: ${patch.description.trim() || '—'}`);
    if (patch.pieces !== undefined && Number(patch.pieces) !== w.pieces) changes.push(`pieces: ${patch.pieces}`);
    Object.assign(w, patch, { description: patch.description?.trim() ?? w.description, pieces: patch.pieces !== undefined ? Number(patch.pieces) : w.pieces, updatedAt: nowIso() });
    if (isOpenOrder(w)) {
      c.progressReason = w.type;
      if (patch.description !== undefined && w.description) c.repairNotes = w.description;
    }
    if (changes.length) logNote(db, c.id, noteTypeFor(w.type), `${workTypeLabels[w.type]} updated — ${changes.join('; ')}.`, { workOrderId: w.id, volunteerId: w.volunteerId });
  });
}

export function startWorkOrder(id: ID, startedAt?: string) {
  commit((db) => {
    const w = findOrThrow(db.workOrders, id, 'This work order');
    if (!isOpenOrder(w)) throw new ValidationError('This work order is already closed.');
    w.status = 'in_progress';
    w.startedAt = startedAt || localNow();
    w.updatedAt = nowIso();
    logNote(db, w.costumeId, noteTypeFor(w.type), `${workTypeLabels[w.type]} started ${formatLocal(w.startedAt)}${w.volunteerId ? ` by ${volunteerLabel(db, w.volunteerId)}` : ''}.`, { workOrderId: w.id, volunteerId: w.volunteerId });
  });
}

export function completeWorkOrder(id: ID, opts: { completedAt: string; note: string; markReady: boolean }) {
  if (opts.completedAt && Number.isNaN(Date.parse(opts.completedAt))) throw new ValidationError('Completed date/time is not valid.');
  commit((db) => {
    const w = findOrThrow(db.workOrders, id, 'This work order');
    if (!isOpenOrder(w)) throw new ValidationError('This work order is already closed.');
    completeWorkOrderIn(db, w, opts);
  });
}

/** Cancel a work order opened by mistake. If nothing else is open, the item goes back to READY. */
export function cancelWorkOrder(id: ID, reason: string) {
  commit((db) => {
    const w = findOrThrow(db.workOrders, id, 'This work order');
    if (!isOpenOrder(w)) throw new ValidationError('This work order is already closed.');
    w.status = 'cancelled';
    w.completedAt = localNow();
    w.completionNote = reason.trim();
    w.updatedAt = nowIso();
    logNote(db, w.costumeId, noteTypeFor(w.type), `${workTypeLabels[w.type]} cancelled${reason.trim() ? `: ${reason.trim()}` : '.'}`, { workOrderId: w.id, volunteerId: w.volunteerId });
    const c = db.costumes.find((x) => x.id === w.costumeId);
    if (c && c.status === 'in_progress' && !openOrdersFor(db, c.id).length) {
      c.status = 'ready';
      c.progressReason = null;
      c.statusUpdatedAt = nowIso();
      c.updatedAt = c.statusUpdatedAt;
      logNote(db, c.id, 'status', 'Marked READY (no open work left).', { workOrderId: w.id });
    }
  });
}

export function reopenWorkOrder(id: ID) {
  commit((db) => {
    const w = findOrThrow(db.workOrders, id, 'This work order');
    if (isOpenOrder(w)) return;
    const c = findOrThrow(db.costumes, w.costumeId, 'This item');
    w.status = 'open';
    w.completedAt = '';
    w.updatedAt = nowIso();
    c.status = 'in_progress';
    c.progressReason = w.type;
    c.statusUpdatedAt = w.updatedAt;
    c.updatedAt = w.updatedAt;
    logNote(db, c.id, noteTypeFor(w.type), `${workTypeLabels[w.type]} reopened. Marked IN PROGRESS.`, { workOrderId: w.id, volunteerId: w.volunteerId });
  });
}

export function addWorkNote(id: ID, text: string) {
  const t = required(text, 'Note');
  commit((db) => {
    const w = findOrThrow(db.workOrders, id, 'This work order');
    logNote(db, w.costumeId, noteTypeFor(w.type), t, { workOrderId: w.id, volunteerId: w.volunteerId });
    w.updatedAt = nowIso();
  });
}

function formatLocal(dt: string) {
  return dt.length > 10 ? fmtDateTime(dt) : fmtDate(dt);
}

/* ------------------------------------------------------------- photos */

export function addPhotoRecord(input: Pick<Photo, 'id' | 'ownerType' | 'ownerId' | 'caption' | 'width' | 'height'>) {
  commit((db) => {
    if (input.ownerType === 'dancer') findOrThrow(db.dancers, input.ownerId, 'This dancer');
    else findOrThrow(db.costumes, input.ownerId, 'This item');
    const first = !db.photos.some((p) => p.ownerType === input.ownerType && p.ownerId === input.ownerId);
    const t = nowIso();
    db.photos.push({ ...input, caption: input.caption.trim(), isPrimary: first, createdAt: t, updatedAt: t });
    if (input.ownerType === 'item') addNote(db, input.ownerId, 'general', `Photo added${input.caption.trim() ? `: ${input.caption.trim()}` : '.'}`);
  });
}

export function setPrimaryPhoto(id: ID) {
  commit((db) => {
    const p = findOrThrow(db.photos, id, 'This photo');
    for (const x of db.photos) if (x.ownerType === p.ownerType && x.ownerId === p.ownerId) x.isPrimary = x.id === id;
  });
}

export function setPhotoCaption(id: ID, caption: string) {
  commit((db) => {
    const p = findOrThrow(db.photos, id, 'This photo');
    p.caption = caption.trim();
    p.updatedAt = nowIso();
  });
}

export function deletePhotoRecord(id: ID) {
  commit((db) => {
    const p = findOrThrow(db.photos, id, 'This photo');
    db.photos = db.photos.filter((x) => x.id !== id);
    if (p.isPrimary) {
      const next = db.photos.find((x) => x.ownerType === p.ownerType && x.ownerId === p.ownerId);
      if (next) next.isPrimary = true;
    }
    if (p.ownerType === 'item') addNote(db, p.ownerId, 'general', 'Photo removed.');
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
      inventoryNumber: nextInventoryNumber(db, itemKind(src)),
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

/* --------------------------------------------------------------- volunteers */

export type VolunteerInput = Omit<Volunteer, 'id' | 'createdAt' | 'updatedAt' | 'isSample'>;

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export function saveVolunteer(input: VolunteerInput, id?: ID): ID {
  const firstName = required(input.firstName, 'First name');
  const lastName = input.lastName.trim();
  const email = input.email.trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ValidationError('Email address does not look right.');
  const phone = input.phone.trim();
  if (phone && phone.replace(/\D/g, '').length < 7) throw new ValidationError('Phone number looks too short.');
  const availability: AvailabilitySlot[] = input.availability.map((slot, i) => {
    const label = `Availability row ${i + 1}`;
    if (slot.type === 'date') {
      if (!slot.date) throw new ValidationError(`${label}: choose a date.`);
      validDate(slot.date, `${label} date`);
    } else if (!(slot.weekday >= 0 && slot.weekday <= 6)) {
      throw new ValidationError(`${label}: choose a day of the week.`);
    }
    if (slot.start && !TIME.test(slot.start)) throw new ValidationError(`${label}: start time is not valid.`);
    if (slot.end && !TIME.test(slot.end)) throw new ValidationError(`${label}: end time is not valid.`);
    if (slot.start && slot.end && slot.end <= slot.start) throw new ValidationError(`${label}: end time must be after the start time.`);
    return { ...slot, id: slot.id || newId(), date: slot.type === 'date' ? slot.date : '', note: slot.note.trim() };
  });
  const skills = [...new Set(input.skills.map((x) => x.trim()).filter(Boolean))];
  const clean: VolunteerInput = { ...input, firstName, lastName, email, phone, skills, availability, notes: input.notes.trim() };
  return commit((db) => {
    if (id) {
      Object.assign(findOrThrow(db.volunteers, id, 'This volunteer'), clean, { updatedAt: nowIso() });
      return id;
    }
    const rec: Volunteer = { ...stamp(), ...clean };
    db.volunteers.push(rec);
    return rec.id;
  });
}

export function deleteVolunteers(ids: ID[]) {
  const set = new Set(ids);
  commit((db) => {
    for (const w of db.workOrders) {
      if (w.volunteerId && set.has(w.volunteerId) && isOpenOrder(w)) {
        logNote(db, w.costumeId, noteTypeFor(w.type), `${workTypeLabels[w.type]} unassigned: ${volunteerLabel(db, w.volunteerId)} was removed from volunteers.`, { workOrderId: w.id });
      }
    }
    db.volunteers = db.volunteers.filter((v) => !set.has(v.id));
    pruneOrphans(db);
  });
}

export function updateSettings(patch: Partial<Settings>) {
  if (patch.studioName !== undefined) required(patch.studioName, 'Studio name');
  for (const [key, label] of [['costumeIdPrefix', 'Costume ID prefix'], ['propIdPrefix', 'Prop ID prefix']] as const) {
    if (patch[key] === undefined) continue;
    const p = required(patch[key], label);
    if (!/^[A-Za-z0-9]{1,8}$/.test(p)) throw new ValidationError(`${label} must be 1–8 letters or numbers.`);
  }
  if (patch.costumeIdPrefix && patch.propIdPrefix && patch.costumeIdPrefix.toUpperCase() === patch.propIdPrefix.toUpperCase()) {
    throw new ValidationError('Costumes and props need different ID prefixes.');
  }
  commit((db) => {
    Object.assign(db.settings, patch);
    db.settings.levels = db.settings.levels.map((s) => s.trim()).filter(Boolean);
    db.settings.sizes = db.settings.sizes.map((s) => s.trim()).filter(Boolean);
    db.settings.skills = db.settings.skills.map((s) => s.trim()).filter(Boolean);
    if (db.settings.costumeIdPrefix.toUpperCase() === db.settings.propIdPrefix.toUpperCase()) {
      throw new ValidationError('Costumes and props need different ID prefixes.');
    }
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
    ensureOwnerAccount(db);
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
  const owner = getDb().accounts?.find((a) => a.role === 'owner' && a.active && !a.isSample);
  if (owner) db.accounts.push({ ...owner });
  else ensureOwnerAccount(db);
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

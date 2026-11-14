import { commit, ValidationError } from './store';
import { prunePlanning } from './planning';
import { newId, nowIso } from './ids';
import { actorName } from '../lib/session';
import { logActivity } from './studioActions';
import { availableQty, classDancers } from './platform';
import { fmtDate } from './time';
import type { CheckInStatus, CostumeCheckout, Database, ID, LineupItem, Recital, RecitalNumber } from './types';

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

/* ------------------------------------------------------------- recitals */

export type RecitalInput = Omit<Recital, 'id' | 'createdAt' | 'updatedAt' | 'isSample'>;

export function saveRecital(input: RecitalInput, id?: ID): ID {
  const name = req(input.name, 'Recital name');
  if (input.startDate && input.endDate && input.endDate < input.startDate) throw new ValidationError('End date cannot be before the start date.');
  return commit((db) => {
    const clean = { ...input, name };
    if (id) {
      Object.assign(find(db.recitals, id, 'This recital'), clean, { updatedAt: nowIso() });
      logActivity(db, 'Recital updated', name, `/recitals/${id}`);
      return id;
    }
    const rec: Recital = { ...clean, ...stamp() };
    db.recitals.push(rec);
    logActivity(db, 'Recital created', name, `/recitals/${rec.id}`);
    return rec.id;
  });
}

export function deleteRecital(id: ID) {
  commit((db) => {
    const r = find(db.recitals, id, 'This recital');
    const nums = new Set(db.recitalNumbers.filter((n) => n.recitalId === id).map((n) => n.id));
    db.recitalNumbers = db.recitalNumbers.filter((n) => n.recitalId !== id);
    for (const l of db.lineup) if (l.numberId && nums.has(l.numberId)) l.numberId = null;
    for (const t of db.ticketEvents) if (t.recitalId === id) t.recitalId = null;
    logActivity(db, 'Recital deleted', r.name);
    db.recitals = db.recitals.filter((x) => x.id !== id);
    prunePlanning(db);
  });
}

export type NumberInput = Omit<RecitalNumber, 'id' | 'createdAt' | 'updatedAt' | 'isSample' | 'order' | 'recitalId'>;

export function saveRecitalNumber(recitalId: ID, input: NumberInput, id?: ID): ID {
  const title = req(input.title, 'Number title');
  if (!(Number(input.durationMin) >= 0)) throw new ValidationError('Duration must be 0 or more minutes.');
  return commit((db) => {
    find(db.recitals, recitalId, 'The recital');
    if (input.costumeId) find(db.costumes, input.costumeId, 'The costume');
    if (input.classId) find(db.classes, input.classId, 'The class');
    const clean = { ...input, title, durationMin: Number(input.durationMin) || 0 };
    if (id) {
      Object.assign(find(db.recitalNumbers, id, 'This number'), clean, { updatedAt: nowIso() });
      return id;
    }
    const order = db.recitalNumbers.filter((n) => n.recitalId === recitalId).reduce((m, n) => Math.max(m, n.order), 0) + 1;
    const rec: RecitalNumber = { ...clean, ...stamp(), recitalId, order };
    db.recitalNumbers.push(rec);
    return rec.id;
  });
}

export function deleteRecitalNumber(id: ID) {
  commit((db) => {
    db.recitalNumbers = db.recitalNumbers.filter((n) => n.id !== id);
    for (const l of db.lineup) if (l.numberId === id) l.numberId = null;
  });
}

/** Reorder recital numbers (or lineup items) to match the given id order. */
export function reorderNumbers(ids: ID[]) {
  commit((db) => {
    ids.forEach((id, i) => {
      const n = db.recitalNumbers.find((x) => x.id === id);
      if (n) n.order = i + 1;
    });
  });
}

/** Add every class in the recital's school year that isn't already in it. */
export function addAllClassesToRecital(recitalId: ID): number {
  return commit((db) => {
    const r = find(db.recitals, recitalId, 'The recital');
    const have = new Set(db.recitalNumbers.filter((n) => n.recitalId === recitalId).map((n) => n.classId));
    let order = db.recitalNumbers.filter((n) => n.recitalId === recitalId).reduce((m, n) => Math.max(m, n.order), 0);
    let added = 0;
    for (const c of db.classes.filter((x) => (!r.schoolYearId || x.schoolYearId === r.schoolYearId) && !have.has(x.id))) {
      db.recitalNumbers.push({ ...stamp(), recitalId, order: ++order, title: c.name, classId: c.id, teamId: null, teacherId: c.teacherId, style: c.style, song: '', artist: '', songFileId: null, choreographyNotes: '', costumeId: null, accessoryNotes: '', shoesTights: '', hairMakeup: '', entranceExit: '', durationMin: 4 });
      added += 1;
    }
    return added;
  });
}

/* ---------------------------------------------------------- running order */

/** Build (or rebuild) a performance's running order from a recital's numbers. */
export function lineupFromRecital(performanceId: ID, recitalId: ID, opts: { replace: boolean; intermissionAfter?: number }) {
  return commit((db) => {
    find(db.performances, performanceId, 'The performance');
    const nums = db.recitalNumbers.filter((n) => n.recitalId === recitalId).sort((a, b) => a.order - b.order);
    if (!nums.length) throw new ValidationError('This recital has no numbers yet.');
    if (opts.replace) db.lineup = db.lineup.filter((l) => l.performanceId !== performanceId);
    let order = db.lineup.filter((l) => l.performanceId === performanceId).reduce((m, l) => Math.max(m, l.order), 0);
    nums.forEach((n, i) => {
      const team = n.teamId ? db.teams.find((t) => t.id === n.teamId) : undefined;
      db.lineup.push({
        ...stamp(),
        performanceId,
        order: ++order,
        kind: 'number',
        numberId: n.id,
        title: n.title,
        classId: n.classId,
        teacherId: n.teacherId,
        dancerIds: team ? [...team.dancerIds] : classDancers(db, n.classId),
        song: n.song,
        artist: n.artist,
        costumeId: n.costumeId,
        durationMin: n.durationMin,
        entranceExit: n.entranceExit,
        backstageNotes: [n.hairMakeup && `Hair/makeup: ${n.hairMakeup}`, n.shoesTights && `Shoes/tights: ${n.shoesTights}`].filter(Boolean).join(' · '),
      });
      if (opts.intermissionAfter && i + 1 === opts.intermissionAfter) db.lineup.push({ ...blankItem(performanceId, ++order), kind: 'intermission', title: 'Intermission', durationMin: 15 });
    });
    logActivity(db, 'Running order built', `${db.performances.find((p) => p.id === performanceId)?.name}: ${nums.length} numbers`, `/performances/${performanceId}`);
    return nums.length;
  });
}

function blankItem(performanceId: ID, order: number): LineupItem {
  return { ...stamp(), performanceId, order, kind: 'number', numberId: null, title: '', classId: null, teacherId: null, dancerIds: [], song: '', artist: '', costumeId: null, durationMin: 4, entranceExit: '', backstageNotes: '' };
}

export type LineupInput = Omit<LineupItem, 'id' | 'createdAt' | 'updatedAt' | 'isSample' | 'performanceId' | 'order'>;

export function saveLineupItem(performanceId: ID, input: LineupInput, id?: ID): ID {
  const title = req(input.title, 'Title');
  if (!(Number(input.durationMin) >= 0)) throw new ValidationError('Duration must be 0 or more minutes.');
  return commit((db) => {
    find(db.performances, performanceId, 'The performance');
    const clean = { ...input, title, durationMin: Number(input.durationMin) || 0 };
    if (id) {
      Object.assign(find(db.lineup, id, 'This item'), clean, { updatedAt: nowIso() });
      return id;
    }
    const order = db.lineup.filter((l) => l.performanceId === performanceId).reduce((m, l) => Math.max(m, l.order), 0) + 1;
    const rec: LineupItem = { ...clean, ...stamp(), performanceId, order };
    db.lineup.push(rec);
    return rec.id;
  });
}

export function deleteLineupItem(id: ID) {
  commit((db) => {
    db.lineup = db.lineup.filter((l) => l.id !== id);
    db.quickChanges = db.quickChanges.filter((q) => q.toItemId !== id);
  });
}

export function reorderLineup(ids: ID[]) {
  commit((db) => {
    ids.forEach((id, i) => {
      const l = db.lineup.find((x) => x.id === id);
      if (l) l.order = i + 1;
    });
  });
}

export function savePerformanceExtras(performanceId: ID, patch: Partial<Pick<Database['performanceExtras'][number], 'warmUpTime' | 'stageRehearsal' | 'stageManagerId' | 'specialInstructions' | 'teacherIds'>>) {
  commit((db) => {
    find(db.performances, performanceId, 'The performance');
    let x = db.performanceExtras.find((e) => e.performanceId === performanceId);
    if (!x) {
      x = { ...stamp(), performanceId, warmUpTime: '', stageRehearsal: '', stageManagerId: null, specialInstructions: '', teacherIds: [] };
      db.performanceExtras.push(x);
    }
    Object.assign(x, patch, { updatedAt: nowIso() });
  });
}

/* ------------------------------------------------------------- backstage */

export function setCheckIn(performanceId: ID, dancerIds: ID[], status: CheckInStatus, extra: { dressingRoom?: string; notes?: string } = {}) {
  commit((db) => {
    for (const dancerId of dancerIds) {
      let c = db.checkIns.find((x) => x.performanceId === performanceId && x.dancerId === dancerId);
      if (!c) {
        c = { ...stamp(), performanceId, dancerId, status: 'not_arrived', dressingRoom: '', notes: '', history: [] };
        db.checkIns.push(c);
      }
      if (c.status !== status) c.history.push({ at: nowIso(), by: actorName(), change: `${c.status} → ${status}` });
      c.status = status;
      if (extra.dressingRoom !== undefined) c.dressingRoom = extra.dressingRoom;
      if (extra.notes !== undefined) c.notes = extra.notes;
      c.updatedAt = nowIso();
    }
  });
}

export function saveQuickChange(input: { performanceId: ID; dancerId: ID; toItemId: ID; helper: string; location: string; notes: string }) {
  commit((db) => {
    let q = db.quickChanges.find((x) => x.performanceId === input.performanceId && x.dancerId === input.dancerId && x.toItemId === input.toItemId);
    if (!q) {
      q = { ...stamp(), ...input };
      db.quickChanges.push(q);
    } else Object.assign(q, input, { updatedAt: nowIso() });
  });
}

export function saveBackstageRole(input: Omit<Database['backstageRoles'][number], 'id' | 'createdAt' | 'updatedAt' | 'isSample'>, id?: ID) {
  req(input.role, 'Role');
  if (!input.person.trim() && !input.volunteerId && !input.staffId) throw new ValidationError('Choose who is doing this job.');
  return commit((db) => {
    if (id) {
      Object.assign(find(db.backstageRoles, id, 'This assignment'), input, { updatedAt: nowIso() });
      return id;
    }
    const rec = { ...input, ...stamp() };
    db.backstageRoles.push(rec);
    return rec.id;
  });
}

export function deleteBackstageRole(id: ID) {
  commit((db) => {
    db.backstageRoles = db.backstageRoles.filter((r) => r.id !== id);
  });
}

/* --------------------------------------------------------------- checkout */

export interface CheckoutInput {
  costumeId: ID;
  dancerId: ID | null;
  ownerType: CostumeCheckout['ownerType'];
  ownerId: ID | null;
  quantity: number;
  status: 'reserved' | 'checked_out';
  expectedReturn: string;
  conditionOut: string;
  accessoriesIssued: string[];
  notes: string;
}

export function createCheckout(input: CheckoutInput, opts: { override?: string } = {}): ID {
  const qty = Math.floor(Number(input.quantity));
  if (!(qty >= 1)) throw new ValidationError('Quantity must be at least 1.');
  return commit((db) => {
    const c = find(db.costumes, input.costumeId, 'The costume');
    const avail = availableQty(db, c.id);
    if (c.status === 'in_progress' && !opts.override?.trim()) throw new ValidationError(`${c.name} is IN PROGRESS (repair / cleaning). Give an override reason to check it out anyway.`);
    if (qty > avail && !opts.override?.trim()) throw new ValidationError(`Only ${avail} of ${c.name} available (${c.quantity} owned). Give an override reason to check out anyway.`);
    const dancer = input.dancerId ? find(db.dancers, input.dancerId, 'The dancer') : undefined;
    const rec: CostumeCheckout = {
      ...stamp(),
      costumeId: c.id,
      dancerId: input.dancerId,
      familyId: dancer?.familyId ?? null,
      ownerType: input.ownerType,
      ownerId: input.ownerId,
      quantity: qty,
      status: input.status,
      checkedOutAt: input.status === 'checked_out' ? nowIso() : '',
      expectedReturn: input.expectedReturn,
      returnedAt: '',
      conditionOut: input.conditionOut.trim(),
      conditionIn: '',
      accessoriesIssued: input.accessoriesIssued,
      accessoriesReturned: [],
      missingItems: '',
      notes: input.notes.trim(),
      history: [{ at: nowIso(), by: actorName(), change: `${input.status === 'reserved' ? 'Reserved' : 'Checked out'} ×${qty}${opts.override ? ` (override: ${opts.override.trim()})` : ''}` }],
    };
    db.checkouts.push(rec);
    const who = dancer ? `${dancer.firstName} ${dancer.lastName}` : 'studio use';
    db.costumeNotes.push({ ...stamp(), costumeId: c.id, type: 'location', text: `${input.status === 'reserved' ? 'Reserved' : 'Checked out'} ×${qty} for ${who}${input.expectedReturn ? `, due back ${fmtDate(input.expectedReturn)}` : ''}${opts.override ? ` — override: ${opts.override.trim()}` : ''}.`, workOrderId: null, volunteerId: null });
    logActivity(db, input.status === 'reserved' ? 'Costume reserved' : 'Costume checked out', `${c.name} ×${qty} → ${who}`, '/checkout');
    return rec.id;
  });
}

export function checkOutReserved(id: ID, conditionOut: string) {
  commit((db) => {
    const r = find(db.checkouts, id, 'This checkout');
    if (r.status !== 'reserved') throw new ValidationError('Only reserved costumes can be checked out here.');
    r.status = 'checked_out';
    r.checkedOutAt = nowIso();
    if (conditionOut.trim()) r.conditionOut = conditionOut.trim();
    r.history.push({ at: nowIso(), by: actorName(), change: 'Checked out' });
    const c = db.costumes.find((x) => x.id === r.costumeId);
    if (c) db.costumeNotes.push({ ...stamp(), costumeId: c.id, type: 'location', text: `Reserved costume checked out ×${r.quantity}.`, workOrderId: null, volunteerId: null });
  });
}

export function returnCheckout(id: ID, input: { conditionIn: string; accessoriesReturned: string[]; missingItems: string; outcome: 'returned' | 'needs_inspection' | 'needs_repair' }) {
  commit((db) => {
    const r = find(db.checkouts, id, 'This checkout');
    if (r.status === 'returned') throw new ValidationError('Already returned.');
    r.status = input.outcome;
    r.returnedAt = nowIso();
    r.conditionIn = input.conditionIn.trim();
    r.accessoriesReturned = input.accessoriesReturned;
    r.missingItems = input.missingItems.trim();
    r.history.push({ at: nowIso(), by: actorName(), change: `Returned (${input.outcome.replace('_', ' ')})${r.missingItems ? ` — missing: ${r.missingItems}` : ''}` });
    const c = db.costumes.find((x) => x.id === r.costumeId);
    if (c) db.costumeNotes.push({ ...stamp(), costumeId: c.id, type: 'location', text: `Returned ×${r.quantity}${r.conditionIn ? `, condition: ${r.conditionIn}` : ''}${r.missingItems ? `. Missing: ${r.missingItems}` : ''}${input.outcome !== 'returned' ? ` — ${input.outcome.replace('_', ' ')}` : ''}.`, workOrderId: null, volunteerId: null });
    logActivity(db, 'Costume returned', `${c?.name} ×${r.quantity}${r.missingItems ? ` (missing ${r.missingItems})` : ''}`, '/checkout');
  });
}

/** After inspection or repair, release the pieces back to the shelf. */
export function clearCheckout(id: ID, note: string) {
  commit((db) => {
    const r = find(db.checkouts, id, 'This checkout');
    r.status = 'returned';
    r.history.push({ at: nowIso(), by: actorName(), change: `Cleared back to inventory${note.trim() ? `: ${note.trim()}` : ''}` });
  });
}

export function cancelCheckout(id: ID) {
  commit((db) => {
    const r = find(db.checkouts, id, 'This checkout');
    if (r.status !== 'reserved') throw new ValidationError('Only reservations can be cancelled. Use Return for checked-out costumes.');
    db.checkouts = db.checkouts.filter((x) => x.id !== id);
    logActivity(db, 'Reservation cancelled', db.costumes.find((c) => c.id === r.costumeId)?.name ?? '', '/checkout');
  });
}

/** Reserve the costumes assigned in a performance for each dancer wearing them. */
export function reserveForPerformance(performanceId: ID): { reserved: number; short: string[] } {
  return commit((db) => {
    const p = find(db.performances, performanceId, 'The performance');
    const short: string[] = [];
    let reserved = 0;
    const pairs = new Map<string, { costumeId: ID; dancerId: ID }>();
    for (const a of db.assignments.filter((x) => x.ownerType === 'performance' && x.ownerId === performanceId)) {
      const c = db.costumes.find((x) => x.id === a.costumeId);
      if (!c || c.kind === 'prop') continue;
      const dancers = a.dancerId ? [a.dancerId] : a.castId ? db.castMembers.filter((m) => m.castId === a.castId).map((m) => m.dancerId) : [];
      dancers.forEach((d) => pairs.set(`${c.id}:${d}`, { costumeId: c.id, dancerId: d }));
    }
    for (const { costumeId, dancerId } of pairs.values()) {
      if (db.checkouts.some((x) => x.costumeId === costumeId && x.dancerId === dancerId && x.ownerId === performanceId && x.status !== 'returned')) continue;
      const c = db.costumes.find((x) => x.id === costumeId)!;
      if (availableQty(db, costumeId) < 1) {
        short.push(c.name);
        continue;
      }
      const d = db.dancers.find((x) => x.id === dancerId);
      db.checkouts.push({ ...stamp(), costumeId, dancerId, familyId: d?.familyId ?? null, ownerType: 'performance', ownerId: performanceId, quantity: 1, status: 'reserved', checkedOutAt: '', expectedReturn: p.date, returnedAt: '', conditionOut: '', conditionIn: '', accessoriesIssued: db.accessories.filter((a) => a.costumeId === costumeId).map((a) => a.name), accessoriesReturned: [], missingItems: '', notes: `For ${p.name}`, history: [{ at: nowIso(), by: actorName(), change: 'Reserved for performance' }] });
      reserved += 1;
    }
    logActivity(db, 'Costumes reserved for performance', `${p.name}: ${reserved} reserved${short.length ? `, short: ${[...new Set(short)].join(', ')}` : ''}`, '/checkout');
    return { reserved, short: [...new Set(short)] };
  });
}

/* --------------------------------------------------------- conflict overrides */

export function overrideConflict(key: string, reason: string) {
  if (!reason.trim()) throw new ValidationError('An explanation is required to override a costume warning.');
  commit((db) => {
    db.conflictOverrides = db.conflictOverrides.filter((o) => o.key !== key);
    db.conflictOverrides.push({ ...stamp(), key, reason: reason.trim(), by: actorName() });
    logActivity(db, 'Costume warning overridden', `${key} — ${reason.trim()}`, '/checkout?tab=conflicts');
  });
}

export function removeOverride(key: string) {
  commit((db) => {
    db.conflictOverrides = db.conflictOverrides.filter((o) => o.key !== key);
  });
}

export const checkInLabels: Record<CheckInStatus, string> = {
  not_arrived: 'Not arrived',
  checked_in: 'Checked in',
  backstage: 'Backstage',
  ready: 'Ready to perform',
  on_stage: 'On stage',
  finished: 'Finished',
  checked_out: 'Checked out',
};


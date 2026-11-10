import type { Costume, Database, ID, NoteType, ProgressReason, WorkOrder } from './types';
import { newId, nowIso } from './ids';

/*
 * Repair / cleaning work orders. These helpers work directly on a database
 * object (inside a store commit), so they can be shared by actions, the
 * sample data and data upgrades without import cycles.
 */

export const workTypeLabels: Record<ProgressReason, string> = {
  repair: 'Repair',
  alteration: 'Alteration',
  cleaning: 'Cleaning',
  replacement: 'Replacement',
  other: 'Other work',
};

export const noteTypeLabels: Record<NoteType, string> = {
  general: 'Note',
  change: 'Change',
  repair: 'Repair',
  alteration: 'Alteration',
  accessory: 'Accessory',
  sizing: 'Sizing',
  status: 'Status',
  location: 'Location',
  cleaning: 'Cleaning',
  work: 'Work order',
  other: 'Other',
};

export const workStatusLabels = { open: 'Waiting', in_progress: 'Being worked on', done: 'Completed', cancelled: 'Cancelled' } as const;

export function noteTypeFor(type: ProgressReason): NoteType {
  return type === 'cleaning' ? 'cleaning' : type === 'alteration' ? 'alteration' : 'repair';
}

/** Current local date/time as 'YYYY-MM-DDTHH:MM' (the format of datetime-local inputs). */
export function localNow(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function isOpenOrder(w: Pick<WorkOrder, 'status'>) {
  return w.status === 'open' || w.status === 'in_progress';
}

export function openOrdersFor(db: Database, costumeId: ID) {
  return db.workOrders.filter((w) => w.costumeId === costumeId && isOpenOrder(w));
}

export function volunteerLabel(db: Database, id: ID | null | undefined) {
  if (!id) return 'nobody';
  const v = db.volunteers.find((x) => x.id === id);
  return v ? `${v.firstName} ${v.lastName}`.trim() : 'a removed volunteer';
}

export function logNote(db: Database, costumeId: ID, type: NoteType, text: string, extra: { workOrderId?: ID | null; volunteerId?: ID | null } = {}) {
  const t = nowIso();
  db.costumeNotes.push({ id: newId(), createdAt: t, updatedAt: t, costumeId, type, text, workOrderId: extra.workOrderId ?? null, volunteerId: extra.volunteerId ?? null });
}

function prettyLocal(dt: string) {
  if (!dt) return '';
  const d = new Date(dt);
  if (Number.isNaN(d.getTime())) return dt;
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', ...(dt.length > 10 ? { hour: 'numeric', minute: '2-digit' } : {}) });
}

export interface WorkFields {
  type: ProgressReason;
  description: string;
  pieces?: number;
  volunteerId?: ID | null;
  scheduledAt?: string;
  dueDate?: string;
}

/** Describe a work order's people and dates for the log. */
export function workSummary(db: Database, w: Pick<WorkOrder, 'volunteerId' | 'scheduledAt' | 'dueDate'>) {
  return [
    w.volunteerId ? `assigned to ${volunteerLabel(db, w.volunteerId)}` : '',
    w.scheduledAt ? `scheduled ${prettyLocal(w.scheduledAt)}` : '',
    w.dueDate ? `due back ${prettyLocal(w.dueDate)}` : '',
  ]
    .filter(Boolean)
    .join(' · ');
}

/**
 * Open a work order and put the item IN PROGRESS.
 * `logText` overrides the default log entry (pass '' to skip logging).
 */
export function createWorkOrderIn(db: Database, c: Costume, f: WorkFields, logText?: string): WorkOrder {
  const t = nowIso();
  const w: WorkOrder = {
    id: newId(),
    createdAt: t,
    updatedAt: t,
    costumeId: c.id,
    type: f.type,
    status: 'open',
    description: f.description.trim(),
    pieces: f.pieces && f.pieces > 0 ? Math.floor(f.pieces) : Math.max(1, c.quantity),
    volunteerId: f.volunteerId ?? null,
    scheduledAt: f.scheduledAt ?? '',
    dueDate: f.dueDate ?? '',
    startedAt: '',
    completedAt: '',
    completionNote: '',
  };
  db.workOrders.push(w);
  c.status = 'in_progress';
  c.progressReason = f.type;
  c.statusUpdatedAt = t;
  c.updatedAt = t;
  if (w.description) c.repairNotes = w.description;
  const extra = workSummary(db, w);
  const text = logText ?? `${workTypeLabels[w.type]} requested${w.description ? `: ${w.description}` : ''}${extra ? ` (${extra})` : ''}. Marked IN PROGRESS.`;
  if (text) logNote(db, c.id, noteTypeFor(w.type), text, { workOrderId: w.id, volunteerId: w.volunteerId });
  return w;
}

/** Finish a work order. With markReady, the item becomes READY once no other work is open. */
export function completeWorkOrderIn(db: Database, w: WorkOrder, opts: { completedAt?: string; note?: string; markReady?: boolean; log?: boolean } = {}) {
  const t = nowIso();
  w.status = 'done';
  w.completedAt = opts.completedAt || localNow();
  if (!w.startedAt) w.startedAt = w.completedAt;
  w.completionNote = (opts.note ?? '').trim();
  w.updatedAt = t;
  const c = db.costumes.find((x) => x.id === w.costumeId);
  if (!c) return;
  if (opts.log !== false) {
    logNote(
      db,
      c.id,
      noteTypeFor(w.type),
      `${workTypeLabels[w.type]} completed ${prettyLocal(w.completedAt)}${w.volunteerId ? ` by ${volunteerLabel(db, w.volunteerId)}` : ''}${w.completionNote ? `: ${w.completionNote}` : '.'}`,
      { workOrderId: w.id, volunteerId: w.volunteerId },
    );
  }
  if (opts.markReady && !openOrdersFor(db, c.id).length && c.status !== 'ready') {
    c.status = 'ready';
    c.progressReason = null;
    c.statusUpdatedAt = t;
    c.updatedAt = t;
    if (opts.log !== false) logNote(db, c.id, 'status', 'Marked READY.', { workOrderId: w.id, volunteerId: w.volunteerId });
  }
}

/** Items marked IN PROGRESS without a work order (older data) get one, silently. */
export function ensureWorkOrders(db: Database) {
  if (!Array.isArray(db.workOrders)) db.workOrders = [];
  for (const c of db.costumes) {
    if (c.status !== 'in_progress' || openOrdersFor(db, c.id).length) continue;
    const keep = { statusUpdatedAt: c.statusUpdatedAt, updatedAt: c.updatedAt };
    const w = createWorkOrderIn(db, c, { type: c.progressReason ?? 'repair', description: c.repairNotes }, '');
    // Keep the original dates rather than "now".
    Object.assign(c, keep);
    w.createdAt = c.statusUpdatedAt || w.createdAt;
    w.updatedAt = w.createdAt;
    if (c.isSample) w.isSample = true;
  }
}

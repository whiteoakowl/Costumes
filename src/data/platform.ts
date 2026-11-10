import type {
  CostumeCheckout,
  Database,
  ID,
  Invoice,
  LineupItem,
  Policy,
  RecipientSpec,
  Delivery,
  SignupEvent,
  Channel,
} from './types';
import { todayStr } from './ids';
import { enrolledDancerIds, addDays } from './studio';
import { fullName } from './selectors';

/*
 * Pure calculations for the platform modules: money, checkout availability,
 * costume conflicts, running-order timing & quick changes, required
 * policies, event eligibility and message recipients.
 */

export const round2 = (n: number) => Math.round(n * 100) / 100;

/* ================================================================ money */

export function invoiceSubtotal(inv: Pick<Invoice, 'lines'>) {
  return round2(inv.lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0));
}

export function invoiceTax(inv: Pick<Invoice, 'lines' | 'discount' | 'taxRate'>) {
  return round2(Math.max(0, invoiceSubtotal(inv) - inv.discount) * (inv.taxRate / 100));
}

export function invoiceTotal(inv: Pick<Invoice, 'lines' | 'discount' | 'taxRate'>) {
  return round2(Math.max(0, invoiceSubtotal(inv) - inv.discount) + invoiceTax(inv));
}

export function refundedFor(db: Database, paymentId: ID) {
  return round2(db.refunds.filter((r) => r.paymentId === paymentId && r.status === 'completed').reduce((s, r) => s + r.amount, 0));
}

/** Money received toward an invoice: payments (net of refunds) + credits applied. */
export function invoicePaid(db: Database, invoiceId: ID) {
  const pays = db.payments.filter((p) => p.invoiceId === invoiceId).reduce((s, p) => s + p.amount - refundedFor(db, p.id), 0);
  const credits = db.credits.filter((c) => c.invoiceId === invoiceId).reduce((s, c) => s + (c.kind === 'applied' ? c.amount : c.kind === 'unapplied' ? -c.amount : 0), 0);
  return round2(pays + credits);
}

export function invoiceCreditApplied(db: Database, invoiceId: ID) {
  return round2(db.credits.filter((c) => c.invoiceId === invoiceId).reduce((s, c) => s + (c.kind === 'applied' ? c.amount : c.kind === 'unapplied' ? -c.amount : 0), 0));
}

export type InvoiceStatus = 'draft' | 'void' | 'paid' | 'partial' | 'overdue' | 'unpaid';

export function invoiceBalance(db: Database, inv: Invoice) {
  if (inv.state === 'void' || inv.state === 'draft') return 0;
  return round2(invoiceTotal(inv) - invoicePaid(db, inv.id));
}

export function invoiceStatus(db: Database, inv: Invoice, today = todayStr()): InvoiceStatus {
  if (inv.state === 'draft') return 'draft';
  if (inv.state === 'void') return 'void';
  const bal = invoiceBalance(db, inv);
  if (bal <= 0.004) return 'paid';
  if (inv.dueDate && inv.dueDate < today) return 'overdue';
  return invoicePaid(db, inv.id) > 0 ? 'partial' : 'unpaid';
}

export const invoiceStatusLabels: Record<InvoiceStatus, string> = { draft: 'Draft', void: 'Void', paid: 'Paid', partial: 'Partly paid', overdue: 'Overdue', unpaid: 'Unpaid' };

/** Credit a family can still apply. */
export function familyCredit(db: Database, familyId: ID) {
  return round2(
    db.credits
      .filter((c) => c.familyId === familyId)
      .reduce((s, c) => s + (c.kind === 'issued' || c.kind === 'unapplied' ? c.amount : -c.amount), 0),
  );
}

/** What the family owes across sent invoices. */
export function familyBalance(db: Database, familyId: ID) {
  return round2(db.invoices.filter((i) => i.familyId === familyId).reduce((s, i) => s + Math.max(0, invoiceBalance(db, i)), 0));
}

export function paymentNet(db: Database, paymentId: ID) {
  const p = db.payments.find((x) => x.id === paymentId);
  return p ? round2(p.amount - refundedFor(db, p.id)) : 0;
}

/* ============================================================ checkouts */

export const ACTIVE_CHECKOUT: CostumeCheckout['status'][] = ['reserved', 'checked_out', 'needs_inspection', 'needs_repair'];

export function checkedOutQty(db: Database, costumeId: ID) {
  return db.checkouts.filter((c) => c.costumeId === costumeId && ACTIVE_CHECKOUT.includes(c.status)).reduce((s, c) => s + c.quantity, 0);
}

/** Pieces actually on the shelf and ready. */
export function availableQty(db: Database, costumeId: ID) {
  const c = db.costumes.find((x) => x.id === costumeId);
  if (!c) return 0;
  const out = checkedOutQty(db, costumeId);
  const inWork = db.workOrders.filter((w) => w.costumeId === costumeId && (w.status === 'open' || w.status === 'in_progress')).reduce((s, w) => s + w.pieces, 0);
  return Math.max(0, c.quantity - out - Math.min(inWork, c.quantity));
}

export type Availability = 'available' | 'partly_available' | 'reserved' | 'checked_out' | 'in_repair' | 'unavailable';

export function availability(db: Database, costumeId: ID): Availability {
  const c = db.costumes.find((x) => x.id === costumeId);
  if (!c) return 'unavailable';
  const avail = availableQty(db, costumeId);
  const active = db.checkouts.filter((x) => x.costumeId === costumeId && ACTIVE_CHECKOUT.includes(x.status));
  if (c.status === 'in_progress' && avail === 0) return 'in_repair';
  if (avail >= c.quantity && c.status === 'ready') return 'available';
  if (avail === 0) return active.some((x) => x.status === 'checked_out') ? 'checked_out' : active.length ? 'reserved' : 'in_repair';
  return 'partly_available';
}

export const availabilityLabels: Record<Availability, string> = {
  available: 'Available',
  partly_available: 'Partly available',
  reserved: 'Reserved',
  checked_out: 'Checked out',
  in_repair: 'In repair',
  unavailable: 'Unavailable',
};

export function isCheckoutOverdue(c: CostumeCheckout, today = todayStr()) {
  return c.status === 'checked_out' && !!c.expectedReturn && c.expectedReturn < today;
}

/* ========================================================= conflicts */

export interface CostumeConflict {
  key: string;
  costumeId: ID;
  kind: 'double_booked' | 'quantity' | 'checked_out' | 'in_progress' | 'accessories';
  message: string;
  date: string;
  performanceIds: ID[];
  overridden: boolean;
  overrideReason: string;
}

/**
 * Costume problems across performances. Performances on the same date are
 * treated as overlapping; quantities are compared with the number of
 * different dancers wearing the costume that day.
 */
export function costumeConflicts(db: Database, opts: { from?: string; performanceId?: ID } = {}): CostumeConflict[] {
  const from = opts.from ?? todayStr();
  const out: CostumeConflict[] = [];
  const overrides = new Map(db.conflictOverrides.map((o) => [o.key, o]));
  const perfs = db.performances.filter((p) => p.date && p.date >= from);
  const byDate = new Map<string, typeof perfs>();
  for (const p of perfs) byDate.set(p.date, [...(byDate.get(p.date) ?? []), p]);
  const castsByPerf = (pid: ID) => db.casts.filter((c) => c.ownerType === 'performance' && c.ownerId === pid);
  const wearers = (pid: ID, costumeId: ID) => {
    const set = new Set<ID>();
    for (const a of db.assignments.filter((x) => x.ownerType === 'performance' && x.ownerId === pid && x.costumeId === costumeId)) {
      if (a.dancerId) set.add(a.dancerId);
      else if (a.castId) db.castMembers.filter((m) => m.castId === a.castId).forEach((m) => set.add(m.dancerId));
    }
    for (const li of db.lineup.filter((l) => l.performanceId === pid && l.costumeId === costumeId)) li.dancerIds.forEach((d) => set.add(d));
    return set;
  };
  const push = (c: Omit<CostumeConflict, 'overridden' | 'overrideReason'>) => {
    const o = overrides.get(c.key);
    out.push({ ...c, overridden: !!o, overrideReason: o?.reason ?? '' });
  };
  for (const [date, list] of byDate) {
    const costumeIds = new Set<ID>();
    for (const p of list) {
      db.assignments.filter((a) => a.ownerType === 'performance' && a.ownerId === p.id).forEach((a) => costumeIds.add(a.costumeId));
      db.lineup.filter((l) => l.performanceId === p.id && l.costumeId).forEach((l) => costumeIds.add(l.costumeId!));
      void castsByPerf;
    }
    for (const cid of costumeIds) {
      const costume = db.costumes.find((c) => c.id === cid);
      if (!costume) continue;
      const perPerf = list.map((p) => ({ p, set: wearers(p.id, cid) })).filter((x) => x.set.size);
      const all = new Set(perPerf.flatMap((x) => [...x.set]));
      if (perPerf.length > 1 && all.size > costume.quantity) {
        push({
          key: `double:${cid}:${date}`,
          costumeId: cid,
          kind: 'double_booked',
          date,
          performanceIds: perPerf.map((x) => x.p.id),
          message: `${costume.name} is worn by ${all.size} different dancers across ${perPerf.length} performances on the same day, but only ${costume.quantity} on hand.`,
        });
      } else {
        for (const x of perPerf) {
          if (x.set.size > costume.quantity) push({ key: `qty:${cid}:${x.p.id}`, costumeId: cid, kind: 'quantity', date, performanceIds: [x.p.id], message: `${costume.name}: ${x.set.size} dancers in ${x.p.name} but only ${costume.quantity} on hand.` });
        }
      }
      const pids = perPerf.map((x) => x.p.id);
      if (!pids.length) continue;
      if (costume.status === 'in_progress') push({ key: `wip:${cid}:${date}`, costumeId: cid, kind: 'in_progress', date, performanceIds: pids, message: `${costume.name} is marked IN PROGRESS (repair / cleaning) and is needed ${date}.` });
      const out = db.checkouts.filter((c) => c.costumeId === cid && c.status === 'checked_out' && (!c.expectedReturn || c.expectedReturn >= date) && !pids.includes(c.ownerId ?? ''));
      if (out.length) push({ key: `out:${cid}:${date}`, costumeId: cid, kind: 'checked_out', date, performanceIds: pids, message: `${costume.name} has ${out.reduce((s, c) => s + c.quantity, 0)} piece(s) checked out elsewhere that won't be back before ${date}.` });
      const missing = db.accessories.filter((a) => a.costumeId === cid && a.quantity < Math.max(1, ...perPerf.map((x) => x.set.size)));
      if (missing.length) push({ key: `acc:${cid}:${date}`, costumeId: cid, kind: 'accessories', date, performanceIds: pids, message: `${costume.name}: not enough ${missing.map((a) => `${a.name} (${a.quantity})`).join(', ')} for the dancers wearing it.` });
    }
  }
  return opts.performanceId ? out.filter((c) => c.performanceIds.includes(opts.performanceId!)) : out;
}

/* ===================================================== running order */

export interface TimedItem extends LineupItem {
  startMin: number; // minutes after curtain
  endMin: number;
  number: number; // 1-based dance number (intermissions not counted)
}

export function timedLineup(db: Database, performanceId: ID): TimedItem[] {
  let t = 0;
  let n = 0;
  return db.lineup
    .filter((l) => l.performanceId === performanceId)
    .sort((a, b) => a.order - b.order)
    .map((l) => {
      const startMin = t;
      t += Math.max(0, l.durationMin);
      if (l.kind === 'number') n += 1;
      return { ...l, startMin, endMin: t, number: l.kind === 'number' ? n : 0 };
    });
}

export function showLength(db: Database, performanceId: ID) {
  const t = timedLineup(db, performanceId);
  return t.length ? t[t.length - 1].endMin : 0;
}

export interface QuickChange {
  dancerId: ID;
  dancerName: string;
  fromItem: TimedItem;
  toItem: TimedItem;
  fromCostumeId: ID | null;
  toCostumeId: ID | null;
  minutes: number;
  tight: boolean;
}

/** Back-to-back appearances where the dancer changes costume, with the time available. */
export function quickChanges(db: Database, performanceId: ID, threshold = db.settings.quickChangeMinutes || 6): QuickChange[] {
  const items = timedLineup(db, performanceId).filter((i) => i.kind === 'number');
  const dancers = new Set(items.flatMap((i) => i.dancerIds));
  const out: QuickChange[] = [];
  for (const d of dancers) {
    const mine = items.filter((i) => i.dancerIds.includes(d));
    for (let k = 1; k < mine.length; k++) {
      const a = mine[k - 1];
      const b = mine[k];
      if (a.costumeId && b.costumeId && a.costumeId === b.costumeId) continue;
      const minutes = b.startMin - a.endMin;
      const dancer = db.dancers.find((x) => x.id === d);
      out.push({ dancerId: d, dancerName: dancer ? fullName(dancer) : 'Removed dancer', fromItem: a, toItem: b, fromCostumeId: a.costumeId, toCostumeId: b.costumeId, minutes, tight: minutes < threshold });
    }
  }
  return out.sort((a, b) => a.toItem.startMin - b.toItem.startMin || a.dancerName.localeCompare(b.dancerName));
}

/** Default dancers for a class number: everyone enrolled. */
export function classDancers(db: Database, classId: ID | null) {
  return classId ? enrolledDancerIds(db, classId) : [];
}

/* ============================================================ policies */

function policyApplies(db: Database, p: Policy, familyId: ID) {
  if (!p.active) return false;
  if (p.audience === 'all') return true;
  if (p.audience === 'families') return p.familyIds.includes(familyId);
  const dancers = db.dancers.filter((d) => d.familyId === familyId).map((d) => d.id);
  if (p.audience === 'classes') return db.enrollments.some((e) => e.status === 'enrolled' && p.classIds.includes(e.classId) && dancers.includes(e.dancerId));
  if (p.audience === 'teams') return db.teams.some((t) => p.teamIds.includes(t.id) && t.dancerIds.some((d) => dancers.includes(d)));
  return false;
}

export function currentVersion(p: Policy) {
  return p.versions[p.versions.length - 1];
}

export function policyStatusForFamily(db: Database, p: Policy, familyId: ID, today = todayStr()): 'not_required' | 'signed' | 'missing' | 'overdue' {
  if (!policyApplies(db, p, familyId) || !p.requiresSignature) return 'not_required';
  const ver = currentVersion(p)?.version ?? 1;
  const yearId = db.schoolYears.find((y) => y.status === 'current')?.id ?? null;
  const signed = db.policySignatures.some((s) => s.policyId === p.id && s.familyId === familyId && s.version === ver && (!p.annualRenewal || s.schoolYearId === yearId));
  if (signed) return 'signed';
  return p.deadline && p.deadline < today ? 'overdue' : 'missing';
}

export function familyPolicies(db: Database, familyId: ID) {
  return db.policies.map((p) => ({ policy: p, status: policyStatusForFamily(db, p, familyId) })).filter((x) => x.status !== 'not_required' || (x.policy.active && policyApplies(db, x.policy, familyId)));
}

/* ============================================================== events */

export function eligibleDancers(db: Database, e: SignupEvent): ID[] {
  const active = db.dancers.filter((d) => d.enrollmentStatus !== 'withdrawn' && d.enrollmentStatus !== 'inactive').map((d) => d.id);
  if (e.eligibility === 'all') return active;
  if (e.eligibility === 'dancers') return e.dancerIds;
  if (e.eligibility === 'classes') return [...new Set(e.classIds.flatMap((c) => enrolledDancerIds(db, c)))];
  return [...new Set(db.teams.filter((t) => e.teamIds.includes(t.id)).flatMap((t) => t.dancerIds))];
}

export function eventCounts(db: Database, eventId: ID) {
  const regs = db.eventRegistrations.filter((r) => r.eventId === eventId);
  return { registered: regs.filter((r) => r.status === 'registered').length, waitlist: regs.filter((r) => r.status === 'waitlist').length, declined: regs.filter((r) => r.status === 'declined').length };
}

/* ========================================================= tickets */

export function ticketsSold(db: Database, ticketEventId: ID, typeId?: ID) {
  return db.ticketOrders
    .filter((o) => o.ticketEventId === ticketEventId && o.status === 'paid')
    .reduce((s, o) => s + o.lines.filter((l) => !typeId || l.typeId === typeId).reduce((a, l) => a + l.qty, 0), 0);
}

export function takenSeats(db: Database, ticketEventId: ID) {
  return new Set(db.ticketOrders.filter((o) => o.ticketEventId === ticketEventId && o.status === 'paid').flatMap((o) => o.seats));
}

/* ======================================================= fundraisers */

export function fundraiserRaised(db: Database, fundraiserId: ID) {
  return round2(db.fundraiserTransactions.filter((t) => t.fundraiserId === fundraiserId).reduce((s, t) => s + t.amount, 0));
}

/* ====================================================== recipients */

/** Turn recipient choices into people, applying contact & consent rules per channel. */
export function resolveRecipients(db: Database, specs: RecipientSpec[], channel: Channel): Delivery[] {
  const familyIds = new Set<ID>();
  const guardianIds = new Set<ID>();
  const staffIds = new Set<ID>();
  const famOf = (dancerId: ID) => db.dancers.find((d) => d.id === dancerId)?.familyId;
  for (const s of specs) {
    if (s.kind === 'all_families') db.families.filter((f) => f.status === 'active').forEach((f) => familyIds.add(f.id));
    if (s.kind === 'families') s.ids.forEach((id) => familyIds.add(id));
    if (s.kind === 'guardians') s.ids.forEach((id) => guardianIds.add(id));
    if (s.kind === 'dancers') s.ids.forEach((id) => famOf(id) && familyIds.add(famOf(id)!));
    if (s.kind === 'classes') s.ids.forEach((c) => enrolledDancerIds(db, c).forEach((d) => famOf(d) && familyIds.add(famOf(d)!)));
    if (s.kind === 'teams') db.teams.filter((t) => s.ids.includes(t.id)).forEach((t) => t.dancerIds.forEach((d) => famOf(d) && familyIds.add(famOf(d)!)));
    if (s.kind === 'teachers') s.ids.forEach((id) => staffIds.add(id));
    if (s.kind === 'all_staff') db.staff.filter((x) => x.status === 'active').forEach((x) => staffIds.add(x.id));
    if (s.kind === 'event') db.eventRegistrations.filter((r) => s.ids.includes(r.eventId) && r.status === 'registered').forEach((r) => famOf(r.dancerId) && familyIds.add(famOf(r.dancerId)!));
    if (s.kind === 'recital') {
      const nums = db.recitalNumbers.filter((n) => s.ids.includes(n.recitalId));
      nums.forEach((n) => classDancers(db, n.classId).forEach((d) => famOf(d) && familyIds.add(famOf(d)!)));
      nums.forEach((n) => db.teams.find((t) => t.id === n.teamId)?.dancerIds.forEach((d) => famOf(d) && familyIds.add(famOf(d)!)));
    }
    if (s.kind === 'performance') {
      const casts = db.casts.filter((c) => c.ownerType === 'performance' && s.ids.includes(c.ownerId)).map((c) => c.id);
      db.castMembers.filter((m) => casts.includes(m.castId)).forEach((m) => famOf(m.dancerId) && familyIds.add(famOf(m.dancerId)!));
    }
  }
  const out: Delivery[] = [];
  const guardians = db.guardians.filter((g) => familyIds.has(g.familyId) || guardianIds.has(g.id));
  for (const g of guardians) {
    const contact = channel === 'sms' ? g.phone : g.email;
    const consent = channel === 'sms' ? g.smsConsent : g.emailConsent;
    out.push({
      name: `${g.firstName} ${g.lastName}`.trim(),
      contact,
      familyId: g.familyId,
      staffId: null,
      status: !contact ? 'skipped_no_contact' : !consent ? 'skipped_no_consent' : 'in_app',
      external: 'not_connected',
    });
  }
  for (const id of staffIds) {
    const s = db.staff.find((x) => x.id === id);
    if (!s) continue;
    const contact = channel === 'sms' ? s.phone : s.email;
    out.push({ name: `${s.firstName} ${s.lastName}`, contact, familyId: null, staffId: s.id, status: contact ? 'in_app' : 'skipped_no_contact', external: 'not_connected' });
  }
  return out;
}

export function upcoming(date: string, days: number, today = todayStr()) {
  return !!date && date >= today && date <= addDays(today, days);
}

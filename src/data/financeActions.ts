import { commit, ValidationError } from './store';
import { newId, nowIso, todayStr } from './ids';
import { actorName } from '../lib/session';
import { logActivity } from './studioActions';
import { familyCredit, invoiceBalance, invoicePaid, invoiceTotal, paymentNet, refundedFor, round2 } from './platform';
import { fmtDate } from './time';
import type { Database, ID, Invoice, InvoiceLine, InvoiceSource, Payment, PaymentMethod } from './types';

/*
 * Invoices, payments, refunds and credits. Online card payments are
 * simulated ("test" processor): no card details are ever collected or
 * stored, and the UI labels them as test payments.
 */

const stamp = () => {
  const t = nowIso();
  return { id: newId(), createdAt: t, updatedAt: t };
};

const money = (n: number) => `$${n.toFixed(2)}`;

function find<T extends { id: ID }>(list: T[], id: ID, label: string): T {
  const r = list.find((x) => x.id === id);
  if (!r) throw new ValidationError(`${label} no longer exists.`);
  return r;
}

function amountOk(n: number, label = 'Amount') {
  const v = round2(Number(n));
  if (!Number.isFinite(v) || v <= 0) throw new ValidationError(`${label} must be more than $0.`);
  return v;
}

function nextNumber(db: Database) {
  let n = db.settings.nextInvoiceNumber || 1;
  let code = `INV-${String(n).padStart(4, '0')}`;
  while (db.invoices.some((i) => i.number === code)) code = `INV-${String(++n).padStart(4, '0')}`;
  db.settings.nextInvoiceNumber = n + 1;
  return code;
}

export interface InvoiceInput {
  familyId: ID;
  title: string;
  lines: Omit<InvoiceLine, 'id'>[] | InvoiceLine[];
  discount: number;
  taxRate: number;
  issueDate: string;
  dueDate: string;
  notes: string;
  source: InvoiceSource;
  sourceId: ID | null;
  schoolYearId: ID | null;
  send: boolean;
}

function cleanLines(lines: InvoiceInput['lines']): InvoiceLine[] {
  const out = lines
    .map((l) => ({ id: (l as InvoiceLine).id || newId(), description: l.description.trim(), category: l.category, quantity: Number(l.quantity), unitPrice: round2(Number(l.unitPrice)), dancerId: l.dancerId ?? null }))
    .filter((l) => l.description);
  if (!out.length) throw new ValidationError('Add at least one line item.');
  for (const l of out) {
    if (!(l.quantity > 0)) throw new ValidationError(`Quantity for “${l.description}” must be more than 0.`);
    if (!Number.isFinite(l.unitPrice)) throw new ValidationError(`Price for “${l.description}” is not valid.`);
  }
  return out;
}

/** Build an invoice record inside a commit (shared by events, fundraisers, registration…). */
export function createInvoiceIn(db: Database, input: InvoiceInput): Invoice {
  find(db.families, input.familyId, 'The family');
  const lines = cleanLines(input.lines);
  const discount = round2(Number(input.discount) || 0);
  if (discount < 0) throw new ValidationError('Discount cannot be negative.');
  const taxRate = Number(input.taxRate) || 0;
  if (taxRate < 0 || taxRate > 50) throw new ValidationError('Tax rate must be between 0 and 50%.');
  const inv: Invoice = {
    ...stamp(),
    number: nextNumber(db),
    familyId: input.familyId,
    title: input.title.trim() || lines[0].description,
    lines,
    discount,
    taxRate,
    issueDate: input.issueDate || todayStr(),
    dueDate: input.dueDate,
    state: input.send ? 'sent' : 'draft',
    notes: input.notes.trim(),
    source: input.source,
    sourceId: input.sourceId,
    schoolYearId: input.schoolYearId,
    remindersSent: 0,
    history: [{ at: nowIso(), by: actorName(), change: input.send ? 'Created and sent to family' : 'Created as draft' }],
  };
  if (invoiceTotal(inv) < 0) throw new ValidationError('The discount is larger than the invoice.');
  db.invoices.push(inv);
  logActivity(db, input.send ? 'Invoice sent' : 'Invoice drafted', `${inv.number} · ${db.families.find((f) => f.id === inv.familyId)?.name} · ${money(invoiceTotal(inv))}`, `/invoices/${inv.id}`);
  return inv;
}

export function createInvoice(input: InvoiceInput): ID {
  return commit((db) => createInvoiceIn(db, input).id);
}

/** Edit an invoice. Only invoices with no payments can change their lines. */
export function updateInvoice(id: ID, input: Omit<InvoiceInput, 'send' | 'source' | 'sourceId' | 'schoolYearId' | 'familyId'>) {
  commit((db) => {
    const inv = find(db.invoices, id, 'This invoice');
    if (inv.state === 'void') throw new ValidationError('Void invoices cannot be edited.');
    if (invoicePaid(db, id) > 0) throw new ValidationError('This invoice has payments or credits. Void it and create a new one, or issue a credit instead.');
    const before = invoiceTotal(inv);
    Object.assign(inv, { title: input.title.trim(), lines: cleanLines(input.lines), discount: round2(Number(input.discount) || 0), taxRate: Number(input.taxRate) || 0, issueDate: input.issueDate, dueDate: input.dueDate, notes: input.notes.trim(), updatedAt: nowIso() });
    inv.history.push({ at: nowIso(), by: actorName(), change: `Edited (total ${money(before)} → ${money(invoiceTotal(inv))})` });
  });
}

export function sendInvoice(id: ID) {
  commit((db) => {
    const inv = find(db.invoices, id, 'This invoice');
    if (inv.state === 'void') throw new ValidationError('This invoice is void.');
    inv.state = 'sent';
    inv.history.push({ at: nowIso(), by: actorName(), change: 'Sent to family (visible in the Parent Portal; email delivery needs an email service)' });
    logActivity(db, 'Invoice sent', inv.number, `/invoices/${id}`);
  });
}

export function voidInvoice(id: ID, reason: string) {
  if (!reason.trim()) throw new ValidationError('Give a reason for voiding the invoice.');
  commit((db) => {
    const inv = find(db.invoices, id, 'This invoice');
    if (invoicePaid(db, id) > 0) throw new ValidationError('Refund or move the payments on this invoice before voiding it.');
    inv.state = 'void';
    inv.history.push({ at: nowIso(), by: actorName(), change: `Voided: ${reason.trim()}` });
    logActivity(db, 'Invoice voided', `${inv.number} — ${reason.trim()}`, `/invoices/${id}`);
  });
}

export function deleteInvoice(id: ID) {
  commit((db) => {
    const inv = find(db.invoices, id, 'This invoice');
    if (inv.state !== 'draft') throw new ValidationError('Only draft invoices can be deleted. Void sent invoices instead so the history is kept.');
    db.invoices = db.invoices.filter((x) => x.id !== id);
    logActivity(db, 'Draft invoice deleted', inv.number);
  });
}

export function duplicateInvoice(id: ID): ID {
  return commit((db) => {
    const src = find(db.invoices, id, 'This invoice');
    return createInvoiceIn(db, { familyId: src.familyId, title: `${src.title} (copy)`, lines: src.lines.map((l) => ({ ...l, id: newId() })), discount: src.discount, taxRate: src.taxRate, issueDate: todayStr(), dueDate: src.dueDate, notes: src.notes, source: src.source, sourceId: src.sourceId, schoolYearId: src.schoolYearId, send: false }).id;
  });
}

/* ------------------------------------------------------------ payments */

export interface PaymentInput {
  familyId: ID;
  invoiceId: ID | null;
  amount: number;
  method: PaymentMethod;
  processor: 'test' | 'offline';
  reference: string;
  date: string;
  note: string;
}

export function recordPaymentIn(db: Database, input: PaymentInput): Payment {
  const amount = amountOk(input.amount);
  find(db.families, input.familyId, 'The family');
  if (input.invoiceId) {
    const inv = find(db.invoices, input.invoiceId, 'The invoice');
    if (inv.familyId !== input.familyId) throw new ValidationError('That invoice belongs to another family.');
    if (inv.state !== 'sent') throw new ValidationError(inv.state === 'draft' ? 'Send the invoice before taking payment.' : 'This invoice is void.');
    const bal = invoiceBalance(db, inv);
    if (amount > bal + 0.004) throw new ValidationError(`That's more than the ${money(bal)} still owed on ${inv.number}.`);
    if (!db.settings.allowPartialPayments && amount < bal - 0.004) throw new ValidationError('Partial payments are turned off — pay the full balance.');
  }
  const p: Payment = {
    ...stamp(),
    familyId: input.familyId,
    invoiceId: input.invoiceId,
    amount,
    method: input.method,
    processor: input.processor,
    reference: input.reference.trim() || (input.processor === 'test' ? `TEST-${Math.random().toString(36).slice(2, 10).toUpperCase()}` : ''),
    date: input.date || todayStr(),
    recordedBy: actorName(),
    note: input.note.trim(),
  };
  db.payments.push(p);
  if (input.invoiceId) {
    const inv = db.invoices.find((i) => i.id === input.invoiceId)!;
    inv.history.push({ at: nowIso(), by: actorName(), change: `${input.processor === 'test' ? 'Test online payment' : `Payment recorded (${input.method})`} ${money(amount)}` });
  }
  logActivity(db, 'Payment received', `${db.families.find((f) => f.id === input.familyId)?.name} · ${money(amount)} · ${input.processor === 'test' ? 'test online payment' : input.method}`, '/payments');
  return p;
}

export function recordPayment(input: PaymentInput): ID {
  return commit((db) => recordPaymentIn(db, input).id);
}

/** Duplicate-click protection for simulated online payments. */
const recentKeys = new Map<string, number>();
export function payOnlineTest(familyId: ID, invoiceId: ID, amount: number, idempotencyKey: string): ID {
  const seen = recentKeys.get(idempotencyKey);
  if (seen && Date.now() - seen < 60_000) throw new ValidationError('This payment is already being processed.');
  recentKeys.set(idempotencyKey, Date.now());
  return recordPayment({ familyId, invoiceId, amount, method: 'card', processor: 'test', reference: '', date: todayStr(), note: 'Test-mode online payment — no card was charged' });
}

/* ------------------------------------------------------------- refunds */

export function issueRefund(paymentId: ID, amount: number, method: 'processor' | 'offline', reason: string): ID {
  const amt = amountOk(amount, 'Refund amount');
  if (!reason.trim()) throw new ValidationError('Give a reason for the refund.');
  return commit((db) => {
    const p = find(db.payments, paymentId, 'This payment');
    const left = paymentNet(db, paymentId);
    if (amt > left + 0.004) throw new ValidationError(`Only ${money(left)} of this payment can still be refunded.`);
    if (method === 'processor' && p.processor !== 'test') throw new ValidationError('This payment was recorded offline — record an offline refund instead.');
    const r = {
      ...stamp(),
      paymentId,
      familyId: p.familyId,
      amount: amt,
      date: todayStr(),
      method,
      // The test processor confirms immediately; a real processor would confirm by webhook.
      status: 'completed' as const,
      reason: reason.trim(),
      recordedBy: actorName(),
    };
    db.refunds.push(r);
    const inv = p.invoiceId ? db.invoices.find((i) => i.id === p.invoiceId) : undefined;
    inv?.history.push({ at: nowIso(), by: actorName(), change: `${method === 'processor' ? 'Refund through test processor' : 'Offline refund recorded'} ${money(amt)}: ${reason.trim()}` });
    for (const o of db.ticketOrders) if (o.paymentId === paymentId && refundedFor(db, paymentId) >= p.amount - 0.004) o.status = 'refunded';
    logActivity(db, 'Refund issued', `${db.families.find((f) => f.id === p.familyId)?.name} · ${money(amt)} · ${reason.trim()}`, '/payments');
    return r.id;
  });
}

/* -------------------------------------------------------------- credits */

export function issueCredit(familyId: ID, amount: number, reason: string) {
  const amt = amountOk(amount, 'Credit');
  if (!reason.trim()) throw new ValidationError('Give a reason for the credit.');
  commit((db) => {
    find(db.families, familyId, 'The family');
    db.credits.push({ ...stamp(), familyId, kind: 'issued', amount: amt, invoiceId: null, reason: reason.trim(), recordedBy: actorName() });
    logActivity(db, 'Credit issued', `${db.families.find((f) => f.id === familyId)?.name} · ${money(amt)} · ${reason.trim()}`, '/payments');
  });
}

export function applyCredit(familyId: ID, invoiceId: ID, amount: number) {
  const amt = amountOk(amount, 'Credit');
  commit((db) => {
    const inv = find(db.invoices, invoiceId, 'The invoice');
    if (inv.familyId !== familyId) throw new ValidationError('Credits can only be used on the same family’s invoices.');
    if (inv.state !== 'sent') throw new ValidationError('Credits can only be applied to sent invoices.');
    if (amt > familyCredit(db, familyId) + 0.004) throw new ValidationError(`The family only has ${money(familyCredit(db, familyId))} of credit.`);
    if (amt > invoiceBalance(db, inv) + 0.004) throw new ValidationError(`Only ${money(invoiceBalance(db, inv))} is owed on ${inv.number}.`);
    db.credits.push({ ...stamp(), familyId, kind: 'applied', amount: amt, invoiceId, reason: `Applied to ${inv.number}`, recordedBy: actorName() });
    inv.history.push({ at: nowIso(), by: actorName(), change: `Credit applied ${money(amt)}` });
  });
}

/** Move credit already applied on one invoice to another invoice of the same family. */
export function transferCredit(fromInvoiceId: ID, toInvoiceId: ID, amount: number) {
  const amt = amountOk(amount, 'Credit');
  commit((db) => {
    const from = find(db.invoices, fromInvoiceId, 'The original invoice');
    const to = find(db.invoices, toInvoiceId, 'The destination invoice');
    if (from.familyId !== to.familyId) throw new ValidationError('Credits can only move between invoices of the same family.');
    const applied = db.credits.filter((c) => c.invoiceId === fromInvoiceId).reduce((s, c) => s + (c.kind === 'applied' ? c.amount : c.kind === 'unapplied' ? -c.amount : 0), 0);
    if (amt > applied + 0.004) throw new ValidationError(`Only ${money(applied)} of credit is on ${from.number}.`);
    if (amt > invoiceBalance(db, to) + 0.004) throw new ValidationError(`Only ${money(invoiceBalance(db, to))} is owed on ${to.number}.`);
    db.credits.push({ ...stamp(), familyId: from.familyId, kind: 'unapplied', amount: amt, invoiceId: fromInvoiceId, reason: `Moved to ${to.number}`, recordedBy: actorName() });
    db.credits.push({ ...stamp(), familyId: from.familyId, kind: 'applied', amount: amt, invoiceId: toInvoiceId, reason: `Moved from ${from.number}`, recordedBy: actorName() });
    from.history.push({ at: nowIso(), by: actorName(), change: `Credit ${money(amt)} moved to ${to.number}` });
    to.history.push({ at: nowIso(), by: actorName(), change: `Credit ${money(amt)} moved from ${from.number}` });
  });
}

export function removeCredit(familyId: ID, amount: number, reason: string) {
  const amt = amountOk(amount, 'Credit');
  if (!reason.trim()) throw new ValidationError('Give a reason for removing credit (kept in the audit trail).');
  commit((db) => {
    if (amt > familyCredit(db, familyId) + 0.004) throw new ValidationError(`The family only has ${money(familyCredit(db, familyId))} of unused credit.`);
    db.credits.push({ ...stamp(), familyId, kind: 'removed', amount: amt, invoiceId: null, reason: reason.trim(), recordedBy: actorName() });
    logActivity(db, 'Credit removed', `${db.families.find((f) => f.id === familyId)?.name} · ${money(amt)} · ${reason.trim()}`, '/payments');
  });
}

/* ------------------------------------------------------- batch invoicing */

export interface BatchInvoiceInput {
  title: string;
  source: InvoiceSource;
  sourceId: ID | null;
  schoolYearId: ID | null;
  dancerIds: ID[];
  lines: { description: string; category: string; unitPrice: number }[]; // per dancer
  dueDate: string;
  notes: string;
  send: boolean;
  siblingDiscount: boolean;
}

/** One invoice per family with a line per dancer (e.g. costume fees for a class). */
export function batchInvoice(input: BatchInvoiceInput): { invoices: number; skipped: string[] } {
  if (!input.dancerIds.length) throw new ValidationError('Choose at least one dancer.');
  if (!input.lines.some((l) => l.description.trim())) throw new ValidationError('Add at least one fee.');
  return commit((db) => {
    const byFamily = new Map<ID, ID[]>();
    const skipped: string[] = [];
    for (const d of input.dancerIds) {
      const dancer = find(db.dancers, d, 'A dancer');
      if (!dancer.familyId) {
        skipped.push(`${dancer.firstName} ${dancer.lastName}`);
        continue;
      }
      byFamily.set(dancer.familyId, [...(byFamily.get(dancer.familyId) ?? []), d]);
    }
    for (const [familyId, dancers] of byFamily) {
      const lines = dancers.flatMap((d) => {
        const name = db.dancers.find((x) => x.id === d)!.firstName;
        return input.lines.filter((l) => l.description.trim()).map((l) => ({ description: `${l.description.trim()} — ${name}`, category: l.category, quantity: 1, unitPrice: l.unitPrice, dancerId: d }));
      });
      const subtotal = lines.reduce((s, l) => s + l.unitPrice, 0);
      const perDancer = subtotal / dancers.length;
      const discount = input.siblingDiscount && dancers.length > 1 ? round2(perDancer * (dancers.length - 1) * (db.settings.siblingDiscountPercent / 100)) : 0;
      createInvoiceIn(db, { familyId, title: input.title, lines, discount, taxRate: db.settings.defaultTaxRate, issueDate: todayStr(), dueDate: input.dueDate, notes: input.notes, source: input.source, sourceId: input.sourceId, schoolYearId: input.schoolYearId, send: input.send });
    }
    return { invoices: byFamily.size, skipped };
  });
}

/** Monthly tuition: one invoice per family for every enrolled class in the school year. */
export function generateTuition(schoolYearId: ID, month: string, dueDate: string, send: boolean): number {
  if (!/^\d{4}-\d{2}$/.test(month)) throw new ValidationError('Choose a month.');
  return commit((db) => {
    const classes = db.classes.filter((c) => c.schoolYearId === schoolYearId && c.tuition > 0);
    const label = fmtDate(`${month}-01`).replace(/\/01\//, '/');
    const byFamily = new Map<ID, InvoiceLine[]>();
    for (const c of classes) {
      for (const e of db.enrollments.filter((x) => x.classId === c.id && x.status === 'enrolled')) {
        const d = db.dancers.find((x) => x.id === e.dancerId);
        if (!d?.familyId) continue;
        const already = db.invoices.some((i) => i.familyId === d.familyId && i.source === 'tuition' && i.sourceId === `${schoolYearId}:${month}` && i.state !== 'void');
        if (already) continue;
        byFamily.set(d.familyId, [...(byFamily.get(d.familyId) ?? []), { id: newId(), description: `${c.name} — ${d.firstName}`, category: 'Tuition', quantity: 1, unitPrice: c.tuition, dancerId: d.id }]);
      }
    }
    for (const [familyId, lines] of byFamily) {
      const dancers = new Set(lines.map((l) => l.dancerId)).size;
      const discount = dancers > 1 ? round2(lines.filter((l) => l.dancerId !== lines[0].dancerId).reduce((s, l) => s + l.unitPrice, 0) * (db.settings.siblingDiscountPercent / 100)) : 0;
      createInvoiceIn(db, { familyId, title: `Tuition ${label}`, lines, discount, taxRate: db.settings.defaultTaxRate, issueDate: todayStr(), dueDate, notes: discount ? `Includes ${db.settings.siblingDiscountPercent}% sibling discount.` : '', source: 'tuition', sourceId: `${schoolYearId}:${month}`, schoolYearId, send });
    }
    return byFamily.size;
  });
}

/** Add a late fee line to overdue invoices past the grace period (once per invoice). */
export function applyLateFees(): number {
  return commit((db) => {
    let n = 0;
    const fee = db.settings.lateFee;
    if (!(fee > 0)) return 0;
    for (const inv of db.invoices) {
      if (inv.state !== 'sent' || !inv.dueDate) continue;
      const grace = new Date(`${inv.dueDate}T12:00:00`);
      grace.setDate(grace.getDate() + (db.settings.lateFeeGraceDays || 0));
      if (todayStr() <= grace.toISOString().slice(0, 10)) continue;
      if (invoiceBalance(db, inv) <= 0) continue;
      if (inv.lines.some((l) => l.category === 'Late fee')) continue;
      inv.lines.push({ id: newId(), description: 'Late fee', category: 'Late fee', quantity: 1, unitPrice: fee, dancerId: null });
      inv.history.push({ at: nowIso(), by: actorName(), change: `Late fee ${money(fee)} added` });
      n += 1;
    }
    if (n) logActivity(db, 'Late fees applied', `${n} invoice(s)`, '/invoices');
    return n;
  });
}

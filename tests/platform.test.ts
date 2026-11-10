import { beforeEach, describe, expect, it } from 'vitest';
import { emptyDatabase, getDb, normalizeDatabase, replaceDb } from '../src/data/store';
import { buildSampleData } from '../src/data/sample';
import * as F from '../src/data/financeActions';
import * as P from '../src/data/productionActions';
import * as E from '../src/data/engagementActions';
import * as C from '../src/data/commsActions';
import * as M from '../src/data/mediaActions';
import * as W from '../src/data/website';
import * as A from '../src/data/actions';
import { availableQty, costumeConflicts, familyBalance, familyCredit, invoiceBalance, invoiceStatus, invoiceTotal, policyStatusForFamily, quickChanges, resolveRecipients, showLength, takenSeats, ticketsSold } from '../src/data/platform';
import { occurrencesBetween } from '../src/data/studio';
import { todayStr } from '../src/data/ids';

const sample = () => replaceDb(buildSampleData(emptyDatabase()));
const famOf = (first: string) => getDb().dancers.find((d) => d.firstName === first)!.familyId!;
const dancer = (first: string) => getDb().dancers.find((d) => d.firstName === first)!;

beforeEach(sample);

describe('finance', () => {
  it('invoices: totals, partial payments, refunds, credits and transfers', () => {
    const fam = famOf('Harper');
    const id = F.createInvoice({ familyId: fam, title: 'Test', lines: [{ description: 'A', category: 'Other', quantity: 2, unitPrice: 50, dancerId: null }], discount: 10, taxRate: 10, issueDate: todayStr(), dueDate: '2099-01-01', notes: '', source: 'custom', sourceId: null, schoolYearId: null, send: false });
    let inv = getDb().invoices.find((i) => i.id === id)!;
    expect(invoiceTotal(inv)).toBe(99); // (100-10)*1.1
    expect(invoiceStatus(getDb(), inv)).toBe('draft');
    expect(() => F.recordPayment({ familyId: fam, invoiceId: id, amount: 10, method: 'cash', processor: 'offline', reference: '', date: '', note: '' })).toThrow(/Send the invoice/);
    F.sendInvoice(id);
    expect(() => F.recordPayment({ familyId: fam, invoiceId: id, amount: 200, method: 'cash', processor: 'offline', reference: '', date: '', note: '' })).toThrow(/more than/);
    const pid = F.recordPayment({ familyId: fam, invoiceId: id, amount: 40, method: 'cash', processor: 'offline', reference: '', date: '', note: '' });
    inv = getDb().invoices.find((i) => i.id === id)!;
    expect(invoiceStatus(getDb(), inv)).toBe('partial');
    expect(() => F.issueRefund(pid, 10, 'processor', 'x')).toThrow(/offline/);
    F.issueRefund(pid, 15, 'offline', 'overcharged');
    expect(invoiceBalance(getDb(), inv)).toBe(74);
    expect(() => F.issueRefund(pid, 30, 'offline', 'again')).toThrow(/Only \$25.00/);
    F.issueCredit(fam, 30, 'goodwill');
    expect(familyCredit(getDb(), fam)).toBe(30);
    F.applyCredit(fam, id, 30);
    expect(invoiceBalance(getDb(), getDb().invoices.find((i) => i.id === id)!)).toBe(44);
    const id2 = F.createInvoice({ familyId: fam, title: 'B', lines: [{ description: 'B', category: 'Other', quantity: 1, unitPrice: 20, dancerId: null }], discount: 0, taxRate: 0, issueDate: '', dueDate: '', notes: '', source: 'custom', sourceId: null, schoolYearId: null, send: true });
    F.transferCredit(id, id2, 20);
    expect(invoiceStatus(getDb(), getDb().invoices.find((i) => i.id === id2)!)).toBe('paid');
    expect(() => F.removeCredit(fam, 5, 'x')).toThrow(/only has \$0.00/);
    expect(() => F.voidInvoice(id, 'mistake')).toThrow(/Refund or move/);
    expect(() => F.deleteInvoice(id)).toThrow(/draft/);
    expect(getDb().invoices.find((i) => i.id === id)!.history.length).toBeGreaterThan(4);
  });

  it('test-mode online payments are protected against double clicks', () => {
    const inv = getDb().invoices.find((i) => i.title.startsWith('Private'))!;
    F.payOnlineTest(inv.familyId, inv.id, 10, 'k1');
    expect(() => F.payOnlineTest(inv.familyId, inv.id, 10, 'k1')).toThrow(/already being processed/);
    expect(getDb().payments.filter((p) => p.invoiceId === inv.id && p.processor === 'test')).toHaveLength(1);
  });

  it('batch costume invoicing: one invoice per family with sibling discount', () => {
    const before = getDb().invoices.length;
    const r = F.batchInvoice({ title: 'Recital costumes', source: 'costume', sourceId: null, schoolYearId: null, dancerIds: [dancer('Mia').id, dancer('Chloe').id, dancer('Emma').id], lines: [{ description: 'Costume fee', category: 'Costume', unitPrice: 60 }], dueDate: '2099-01-01', notes: '', send: true, siblingDiscount: true });
    expect(r.invoices).toBe(2); // Robinson-Nguyen (2 dancers) + Johnson
    const rn = getDb().invoices.slice(before).find((i) => i.familyId === famOf('Mia'))!;
    expect(rn.lines).toHaveLength(2);
    expect(rn.discount).toBe(6); // 10% off the second dancer
  });

  it('monthly tuition generation does not double-bill', () => {
    const year = getDb().schoolYears.find((y) => y.status === 'current')!;
    const m = '2099-02';
    const n = F.generateTuition(year.id, m, '2099-02-01', true);
    expect(n).toBeGreaterThan(0);
    expect(F.generateTuition(year.id, m, '2099-02-01', true)).toBe(0);
    expect(familyBalance(getDb(), famOf('Ava'))).toBeGreaterThan(0);
  });
});

describe('productions', () => {
  it('running order timing and tight quick changes', () => {
    const perf = getDb().performances[0];
    expect(showLength(getDb(), perf.id)).toBe(6 + 3 + 4 + 6 + 15 + 6 + 4 + 3);
    const qc = quickChanges(getDb(), perf.id);
    const lily = qc.find((q) => q.dancerName === 'Lily Chen' && q.toItem.title === 'Clara & the Nutcracker')!;
    expect(lily.minutes).toBe(0);
    expect(lily.tight).toBe(true);
  });

  it('checkout reduces availability, is overdue-aware, and returns', () => {
    const c = getDb().costumes.find((x) => x.name === 'Snowflake Tutu')!;
    const before = availableQty(getDb(), c.id);
    const id = P.createCheckout({ costumeId: c.id, dancerId: dancer('Sophia').id, ownerType: null, ownerId: null, quantity: 2, status: 'checked_out', expectedReturn: '2099-01-01', conditionOut: 'Good', accessoriesIssued: ['Snowflake headpiece'], notes: '' });
    expect(availableQty(getDb(), c.id)).toBe(before - 2);
    expect(() => P.createCheckout({ costumeId: c.id, dancerId: null, ownerType: null, ownerId: null, quantity: 99, status: 'reserved', expectedReturn: '', conditionOut: '', accessoriesIssued: [], notes: '' })).toThrow(/override/);
    P.returnCheckout(id, { conditionIn: 'Sequin loose', accessoriesReturned: [], missingItems: 'Snowflake headpiece', outcome: 'needs_inspection' });
    expect(availableQty(getDb(), c.id)).toBe(before - 2); // still out of circulation until cleared
    P.clearCheckout(id, 'Fixed');
    expect(availableQty(getDb(), c.id)).toBe(before);
    const mouse = getDb().costumes.find((x) => x.name === 'Mouse Costume')!; // IN PROGRESS in sample data
    expect(() => P.createCheckout({ costumeId: mouse.id, dancerId: null, ownerType: null, ownerId: null, quantity: 1, status: 'reserved', expectedReturn: '', conditionOut: '', accessoriesIssued: [], notes: '' })).toThrow(/IN PROGRESS/);
    P.createCheckout({ costumeId: mouse.id, dancerId: null, ownerType: null, ownerId: null, quantity: 1, status: 'reserved', expectedReturn: '', conditionOut: '', accessoriesIssued: [], notes: '' }, { override: 'Only for fitting' });
  });

  it('flags costume conflicts across same-day performances, and overrides need a reason', () => {
    const perf = getDb().performances[0];
    const copy = A.duplicatePerformance(perf.id); // same date, same costumes, same dancers
    const sugar = getDb().costumes.find((c) => c.name === 'Sugar Plum Fairy Tutu')!;
    // give the copy a different Sugar Plum
    const cast = getDb().casts.find((c) => c.ownerId === copy)!;
    A.addDancersToCast(cast.id, [dancer('Harper').id]);
    A.assignCostumes({ ownerType: 'performance', ownerId: copy, costumeIds: [sugar.id], castId: cast.id, dancerIds: [dancer('Harper').id] });
    const list = costumeConflicts(getDb(), { from: '2000-01-01' });
    const dbl = list.find((c) => c.costumeId === sugar.id && c.kind === 'double_booked')!;
    expect(dbl.message).toMatch(/only 1 on hand/);
    expect(list.some((c) => c.kind === 'in_progress')).toBe(true); // Mouse costume
    expect(() => P.overrideConflict(dbl.key, '')).toThrow(/explanation/);
    P.overrideConflict(dbl.key, 'Second tutu borrowed from Ballet Co.');
    expect(costumeConflicts(getDb(), { from: '2000-01-01' }).find((c) => c.key === dbl.key)!.overridden).toBe(true);
  });

  it('builds a running order from a recital and tracks backstage check-in', () => {
    const recital = getDb().recitals[0];
    const perfId = A.savePerformance({ name: 'Recital Saturday', showId: null, date: '2099-06-01', time: '14:00', venue: '', address: '', callTime: '12:30', dressRehearsal: '', notes: '', details: '' });
    expect(P.lineupFromRecital(perfId, recital.id, { replace: true, intermissionAfter: 4 })).toBe(8);
    const items = getDb().lineup.filter((l) => l.performanceId === perfId);
    expect(items.some((l) => l.kind === 'intermission')).toBe(true);
    expect(items.find((l) => l.title === 'Ballet 3')!.dancerIds.length).toBe(3);
    P.setCheckIn(perfId, [dancer('Lily').id], 'checked_in');
    P.setCheckIn(perfId, [dancer('Lily').id], 'ready');
    const ci = getDb().checkIns.find((c) => c.performanceId === perfId)!;
    expect(ci.status).toBe('ready');
    expect(ci.history).toHaveLength(2);
  });
});

describe('teams, events, registration, policies, fundraisers, tickets', () => {
  it('events: eligibility, capacity waitlist, invoices, promotion', () => {
    const id = E.saveSignupEvent({ name: 'Mini camp', type: 'camp', description: '', date: '2099-07-01', endDate: '', startTime: '', endTime: '', location: '', address: '', registrationDeadline: '2099-06-01', eligibility: 'teams', classIds: [], teamIds: [getDb().teams[0].id], dancerIds: [], cost: 25, capacity: 1, signupsOpen: true, questions: [], notes: '' });
    expect(() => E.registerForEvent(id, dancer('Ava').id, {})).toThrow(/eligible/); // Ava is on the senior team
    expect(E.registerForEvent(id, dancer('Mia').id, {})).toBe('registered');
    expect(E.registerForEvent(id, dancer('Emma').id, {})).toBe('waitlist');
    const reg = getDb().eventRegistrations.find((r) => r.eventId === id && r.dancerId === dancer('Mia').id)!;
    expect(reg.invoiceId).toBeTruthy();
    E.cancelRegistration(reg.id);
    expect(getDb().eventRegistrations.find((r) => r.eventId === id && r.dancerId === dancer('Emma').id)!.status).toBe('registered');
    expect(getDb().invoices.find((i) => i.id === reg.invoiceId)!.state).toBe('void');
  });

  it('registration approval creates family, dancer, enrollment and fee — without duplicates', () => {
    const pending = getDb().registrations.find((r) => r.status === 'pending')!;
    const results = E.approveRegistration(pending.id, 'Welcome!');
    expect(results.join(' ')).toMatch(/Created Bell Family/);
    const nora = getDb().dancers.find((d) => d.firstName === 'Nora')!;
    expect(nora.familyId).toBeTruthy();
    // Same dancer registering again is matched, not duplicated.
    const again = E.submitRegistration({ ...pending, kind: 'new', familyId: null, classIds: [getDb().classes[0].id], dropClassIds: [], existingDancerId: null, agreedPolicyIds: getDb().policies.filter((p) => p.audience === 'all').map((p) => p.id) });
    E.approveRegistration(again, '');
    expect(getDb().dancers.filter((d) => d.firstName === 'Nora')).toHaveLength(1);
    expect(getDb().families.filter((f) => f.name === 'Bell Family')).toHaveLength(1);
  });

  it('policies: new versions require signing again; history kept', () => {
    const p = getDb().policies.find((x) => x.title.startsWith('Studio Handbook'))!;
    const fam = famOf('Ava');
    expect(policyStatusForFamily(getDb(), p, fam)).toBe('signed');
    E.savePolicy({ title: p.title, category: p.category, body: p.versions[0].body + ' Updated.', fileId: null, audience: 'all', classIds: [], teamIds: [], familyIds: [], requiresSignature: true, deadline: '2099-01-01', annualRenewal: true, active: true }, p.id);
    const p2 = getDb().policies.find((x) => x.id === p.id)!;
    expect(p2.versions).toHaveLength(2);
    expect(policyStatusForFamily(getDb(), p2, fam)).toBe('missing');
    E.signPolicy(p.id, fam, null, 'Laura Thompson', 'typed');
    expect(policyStatusForFamily(getDb(), getDb().policies.find((x) => x.id === p.id)!, fam)).toBe('signed');
    expect(() => E.deletePolicy(p.id)).toThrow(/signatures/);
  });

  it('fundraiser order invoices the family; tickets enforce quantity and seats; refunds release seats', () => {
    const cookie = getDb().fundraisers.find((f) => f.name === 'Cookie Dough Sale')!;
    E.addFundraiserTransaction({ fundraiserId: cookie.id, familyId: famOf('Lily'), dancerId: dancer('Lily').id, donorName: '', kind: 'order', items: [{ itemId: cookie.items[0].id, qty: 2 }], amount: 0, notes: '', payNow: true });
    const inv = getDb().invoices.at(-1)!;
    expect(invoiceTotal(inv)).toBe(32);
    expect(invoiceStatus(getDb(), inv)).toBe('paid');
    const te = getDb().ticketEvents[0];
    const adult = te.types[0];
    expect(() => E.buyTickets({ ticketEventId: te.id, familyId: famOf('Emma'), buyerName: 'Kelly', buyerEmail: '', lines: [{ typeId: adult.id, qty: 2 }], seats: ['C5', 'D1'], source: 'parent', method: 'card' })).toThrow(/just taken/);
    const oid = E.buyTickets({ ticketEventId: te.id, familyId: famOf('Emma'), buyerName: 'Kelly', buyerEmail: '', lines: [{ typeId: adult.id, qty: 2 }], seats: ['D1', 'D2'], source: 'parent', method: 'card' });
    expect(takenSeats(getDb(), te.id).has('D1')).toBe(true);
    expect(() => E.buyTickets({ ticketEventId: te.id, familyId: null, buyerName: 'X', buyerEmail: '', lines: [{ typeId: te.types[2].id, qty: 1 }], seats: ['A1'], source: 'parent', method: 'card' })).toThrow(/issued by the office/);
    const sold = ticketsSold(getDb(), te.id);
    E.refundTicketOrder(oid, 'Can no longer attend');
    expect(ticketsSold(getDb(), te.id)).toBe(sold - 2);
    expect(takenSeats(getDb(), te.id).has('D1')).toBe(false);
  });
});

describe('communications, reminders, teacher tools, website', () => {
  it('respects SMS consent; scheduled messages send when due; in-app inbox', () => {
    const out = resolveRecipients(getDb(), [{ kind: 'all_families', ids: [] }], 'sms');
    expect(out.some((d) => d.status === 'skipped_no_consent')).toBe(true);
    expect(out.every((d) => d.external === 'not_connected')).toBe(true);
    const id = C.saveMessage({ channel: 'sms', subject: '', body: 'Snow day!', blocks: [], recipients: [{ kind: 'classes', ids: [getDb().classes[0].id] }], attachmentIds: [], related: null });
    expect(() => C.scheduleMessage(id, '2000-01-01T08:00')).toThrow(/future/);
    C.sendMessage(id);
    const m = getDb().messages.find((x) => x.id === id)!;
    expect(m.status).toBe('sent');
    expect(C.inboxFor(getDb(), { familyId: famOf('Lily') }).some((x) => x.id === id)).toBe(true); // Mei Chen consents to SMS
    // the scheduled sample newsletter isn't due yet
    expect(C.processScheduled()).toBe(0);
  });

  it('reminders are created once (no duplicates)', () => {
    const first = C.runReminders();
    expect(first).toBeGreaterThan(0);
    expect(C.runReminders()).toBe(0);
    const kinds = new Set(getDb().notifications.map((n) => n.kind));
    expect(kinds.has('invoice_overdue')).toBe(true); // Harper's private lessons
    expect(kinds.has('return_overdue')).toBe(true); // Grace's red jazz costume
    expect(kinds.has('policy_missing')).toBe(true);
  });

  it('approving a teacher cancellation request cancels the class date', () => {
    const c = getDb().classes.find((x) => x.name === 'Ballet 3')!;
    const date = occurrencesBetween(getDb(), todayStr(), '2099-01-01', { classIds: new Set([c.id]) })[1].originalDate;
    const id = M.submitScheduleRequest({ staffId: c.teacherId!, classId: c.id, date, kind: 'cancel', details: 'Dentist' });
    M.respondScheduleRequest(id, true, 'OK');
    expect(getDb().sessionChanges.some((s) => s.classId === c.id && s.date === date && s.cancelled)).toBe(true);
  });

  it('website: draft vs published, home page protected', () => {
    const home = getDb().sitePages.find((p) => p.slug === 'home')!;
    W.setDraftBlocks(home.id, [W.newBlock('text', { heading: 'Draft change' }), ...home.draft]);
    expect(W.hasUnpublished(getDb().sitePages.find((p) => p.id === home.id)!)).toBe(true);
    expect(getDb().sitePages.find((p) => p.id === home.id)!.live[0].heading).not.toBe('Draft change');
    W.publishPage(home.id);
    expect(getDb().sitePages.find((p) => p.id === home.id)!.live[0].heading).toBe('Draft change');
    expect(() => W.deletePage(home.id)).toThrow(/home page/);
    const id = W.addPage('Summer Camp');
    expect(getDb().sitePages.find((p) => p.id === id)!.published).toBe(false);
  });

  it('upgrade from v4 adds website and sample platform once; remove sample data clears it', () => {
    const v4 = JSON.parse(JSON.stringify(buildSampleData(emptyDatabase())));
    for (const k of ['invoices', 'payments', 'refunds', 'credits', 'recitals', 'recitalNumbers', 'lineup', 'teams', 'sitePages', 'policies', 'signupEvents', 'ticketEvents', 'ticketOrders', 'messages']) delete v4[k];
    v4.meta.schemaVersion = 4;
    const up = normalizeDatabase(v4);
    expect(up.recitals.length).toBe(1);
    expect(up.sitePages.length).toBe(11);
    expect(normalizeDatabase(JSON.parse(JSON.stringify(up))).recitals.length).toBe(1);
    A.removeSampleData();
    const db = getDb();
    expect(db.invoices.length + db.teams.length + db.recitals.length + db.ticketOrders.length + db.messages.length).toBe(0);
    expect(db.sitePages.length).toBe(11); // the website is the studio's, not sample data
  });
});

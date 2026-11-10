import { commit, ValidationError } from './store';
import { newId, nowIso, todayStr } from './ids';
import { actorName } from '../lib/session';
import { logActivity } from './studioActions';
import { createInvoiceIn, recordPaymentIn } from './financeActions';
import { currentVersion, eligibleDancers, eventCounts, round2, takenSeats, ticketsSold } from './platform';
import { enrolledDancerIds } from './studio';
import { fmtDate } from './time';
import type { EventRegistration, Fundraiser, ID, Policy, RegistrationRequest, SignupEvent, Team, TicketedEvent } from './types';

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

const money = (n: number) => `$${n.toFixed(2)}`;

/* ---------------------------------------------------------------- teams */

export type TeamInput = Omit<Team, 'id' | 'createdAt' | 'updatedAt' | 'isSample'>;

export function saveTeam(input: TeamInput, id?: ID): ID {
  const name = req(input.name, 'Team name');
  if (Number(input.fee) < 0) throw new ValidationError('Fee cannot be negative.');
  return commit((db) => {
    if (db.teams.some((t) => t.id !== id && !t.archived && t.name.toLowerCase() === name.toLowerCase())) throw new ValidationError(`There is already a team called ${name}.`);
    const clean = { ...input, name, fee: Number(input.fee) || 0, dancerIds: [...new Set(input.dancerIds)], teacherIds: [...new Set(input.teacherIds)] };
    if (id) {
      Object.assign(find(db.teams, id, 'This team'), clean, { updatedAt: nowIso() });
      logActivity(db, 'Team updated', name, `/teams/${id}`);
      return id;
    }
    const rec: Team = { ...clean, ...stamp() };
    db.teams.push(rec);
    logActivity(db, 'Team created', name, `/teams/${rec.id}`);
    return rec.id;
  });
}

export function setTeamDancers(teamId: ID, add: ID[], remove: ID[]) {
  commit((db) => {
    const t = find(db.teams, teamId, 'This team');
    t.dancerIds = [...new Set([...t.dancerIds.filter((d) => !remove.includes(d)), ...add])];
    t.updatedAt = nowIso();
  });
}

export function moveTeamDancers(fromId: ID, toId: ID, dancerIds: ID[]) {
  if (fromId === toId) throw new ValidationError('Choose a different team.');
  commit((db) => {
    const a = find(db.teams, fromId, 'The team');
    const b = find(db.teams, toId, 'The destination team');
    a.dancerIds = a.dancerIds.filter((d) => !dancerIds.includes(d));
    b.dancerIds = [...new Set([...b.dancerIds, ...dancerIds])];
    logActivity(db, 'Dancers moved between teams', `${dancerIds.length} from ${a.name} to ${b.name}`, `/teams/${toId}`);
  });
}

export function archiveTeam(id: ID, archived: boolean) {
  commit((db) => {
    const t = find(db.teams, id, 'This team');
    t.archived = archived;
    logActivity(db, archived ? 'Team archived' : 'Team restored', t.name, '/teams');
  });
}

export function deleteTeam(id: ID) {
  commit((db) => {
    const t = find(db.teams, id, 'This team');
    if (db.invoices.some((i) => i.source === 'company' && i.sourceId === id && i.state !== 'void')) throw new ValidationError('This team has invoices. Archive it instead so the history is kept.');
    db.teams = db.teams.filter((x) => x.id !== id);
    for (const n of db.recitalNumbers) if (n.teamId === id) n.teamId = null;
    for (const e of db.signupEvents) e.teamIds = e.teamIds.filter((x) => x !== id);
    for (const p of db.policies) p.teamIds = p.teamIds.filter((x) => x !== id);
    for (const f of db.fundraisers) if (f.teamId === id) f.teamId = null;
    logActivity(db, 'Team deleted', t.name);
  });
}

/* --------------------------------------------------------------- events */

export type SignupEventInput = Omit<SignupEvent, 'id' | 'createdAt' | 'updatedAt' | 'isSample'>;

export function saveSignupEvent(input: SignupEventInput, id?: ID): ID {
  const name = req(input.name, 'Event name');
  if (!input.date) throw new ValidationError('Choose the event date.');
  if (input.endDate && input.endDate < input.date) throw new ValidationError('End date cannot be before the start date.');
  if (Number(input.cost) < 0 || Number(input.capacity) < 0) throw new ValidationError('Cost and capacity cannot be negative.');
  return commit((db) => {
    const clean = { ...input, name, cost: round2(Number(input.cost) || 0), capacity: Math.floor(Number(input.capacity) || 0), questions: input.questions.filter((q) => q.label.trim()) };
    if (id) {
      Object.assign(find(db.signupEvents, id, 'This event'), clean, { updatedAt: nowIso() });
      logActivity(db, 'Event updated', name, `/events/${id}`);
      return id;
    }
    const rec: SignupEvent = { ...clean, ...stamp() };
    db.signupEvents.push(rec);
    logActivity(db, 'Event created', `${name} (${fmtDate(input.date)})`, `/events/${rec.id}`);
    return rec.id;
  });
}

export function deleteSignupEvent(id: ID) {
  commit((db) => {
    const e = find(db.signupEvents, id, 'This event');
    if (db.eventRegistrations.some((r) => r.eventId === id && r.invoiceId)) throw new ValidationError('This event has invoiced registrations. Close sign-ups instead of deleting it.');
    db.signupEvents = db.signupEvents.filter((x) => x.id !== id);
    db.eventRegistrations = db.eventRegistrations.filter((r) => r.eventId !== id);
    logActivity(db, 'Event deleted', e.name);
  });
}

/**
 * Register (or decline) a dancer. Respects eligibility, deadline and capacity
 * (extra registrations go on the waiting list) and invoices the fee.
 */
export function registerForEvent(eventId: ID, dancerId: ID, answers: Record<string, string>, opts: { decline?: boolean; staff?: boolean } = {}): EventRegistration['status'] {
  return commit((db) => {
    const e = find(db.signupEvents, eventId, 'This event');
    const d = find(db.dancers, dancerId, 'The dancer');
    if (!opts.staff) {
      if (!e.signupsOpen) throw new ValidationError('Sign-ups for this event are closed.');
      if (e.registrationDeadline && e.registrationDeadline < todayStr()) throw new ValidationError(`The registration deadline was ${fmtDate(e.registrationDeadline)}.`);
      if (!eligibleDancers(db, e).includes(dancerId)) throw new ValidationError(`${d.firstName} isn't eligible for this event.`);
    }
    if (!opts.decline) for (const q of e.questions) if (q.required && !(answers[q.id] ?? '').trim()) throw new ValidationError(`Please answer: ${q.label}`);
    let reg = db.eventRegistrations.find((r) => r.eventId === eventId && r.dancerId === dancerId);
    if (reg && reg.status === 'registered' && !opts.decline) throw new ValidationError(`${d.firstName} is already registered.`);
    const counts = eventCounts(db, eventId);
    const status: EventRegistration['status'] = opts.decline ? 'declined' : e.capacity && counts.registered >= e.capacity ? 'waitlist' : 'registered';
    if (!reg) {
      reg = { ...stamp(), eventId, dancerId, familyId: d.familyId ?? null, status, answers, invoiceId: null, by: actorName() };
      db.eventRegistrations.push(reg);
    } else Object.assign(reg, { status, answers, by: actorName(), updatedAt: nowIso() });
    if (status === 'registered' && e.cost > 0 && d.familyId && !reg.invoiceId) {
      reg.invoiceId = createInvoiceIn(db, { familyId: d.familyId, title: e.name, lines: [{ description: `${e.name} — ${d.firstName}`, category: 'Event', quantity: 1, unitPrice: e.cost, dancerId: d.id }], discount: 0, taxRate: 0, issueDate: todayStr(), dueDate: e.registrationDeadline || e.date, notes: '', source: 'event', sourceId: e.id, schoolYearId: null, send: true }).id;
    }
    logActivity(db, status === 'declined' ? 'Event declined' : status === 'waitlist' ? 'Event waitlist' : 'Event registration', `${d.firstName} ${d.lastName} · ${e.name}`, `/events/${eventId}`);
    return status;
  });
}

export function cancelRegistration(regId: ID) {
  commit((db) => {
    const r = find(db.eventRegistrations, regId, 'This registration');
    const wasRegistered = r.status === 'registered';
    r.status = 'cancelled';
    r.updatedAt = nowIso();
    if (r.invoiceId) {
      const inv = db.invoices.find((i) => i.id === r.invoiceId);
      if (inv && inv.state === 'sent' && !db.payments.some((p) => p.invoiceId === inv.id)) {
        inv.state = 'void';
        inv.history.push({ at: nowIso(), by: actorName(), change: 'Voided: event registration cancelled' });
      }
    }
    // Promote the first person on the waiting list.
    if (wasRegistered) {
      const next = db.eventRegistrations.filter((x) => x.eventId === r.eventId && x.status === 'waitlist').sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
      if (next) {
        next.status = 'registered';
        const e = db.signupEvents.find((x) => x.id === r.eventId)!;
        const d = db.dancers.find((x) => x.id === next.dancerId);
        if (e.cost > 0 && d?.familyId && !next.invoiceId) next.invoiceId = createInvoiceIn(db, { familyId: d.familyId, title: e.name, lines: [{ description: `${e.name} — ${d.firstName}`, category: 'Event', quantity: 1, unitPrice: e.cost, dancerId: d.id }], discount: 0, taxRate: 0, issueDate: todayStr(), dueDate: e.date, notes: 'Moved off the waiting list', source: 'event', sourceId: e.id, schoolYearId: null, send: true }).id;
      }
    }
  });
}

/* ---------------------------------------------------------- registration */

export type RegistrationInput = Omit<RegistrationRequest, 'id' | 'createdAt' | 'updatedAt' | 'isSample' | 'status' | 'invoiceId' | 'reviewNote' | 'reviewedBy' | 'reviewedAt' | 'submittedBy' | 'result' | 'fee'>;

export function submitRegistration(input: RegistrationInput): ID {
  if (input.kind === 'new') {
    req(input.parent.firstName, 'Parent first name');
    if (!input.familyId) {
      req(input.parent.email, 'Parent email');
      req(input.parent.phone, 'Parent phone');
    }
    if (!input.existingDancerId) {
      req(input.dancer.firstName, 'Dancer first name');
      req(input.dancer.lastName, 'Dancer last name');
      req(input.dancer.birthday, 'Dancer birthday');
    }
    if (!input.familyId) req(input.emergency.phone, 'Emergency contact phone');
  } else if (!input.existingDancerId) throw new ValidationError('Choose the dancer.');
  if (!input.classIds.length && !input.dropClassIds.length) throw new ValidationError('Choose at least one class.');
  return commit((db) => {
    const year = input.schoolYearId ? db.schoolYears.find((y) => y.id === input.schoolYearId) : undefined;
    if (year?.registrationEnd && year.registrationEnd < todayStr() && input.kind === 'new') throw new ValidationError(`Registration for ${year.name} closed ${fmtDate(year.registrationEnd)}.`);
    const required = db.policies.filter((p) => p.active && p.requiresSignature && p.audience === 'all');
    const missing = required.filter((p) => !input.agreedPolicyIds.includes(p.id));
    if (input.kind === 'new' && missing.length) throw new ValidationError(`Please agree to: ${missing.map((p) => p.title).join(', ')}.`);
    const rec: RegistrationRequest = { ...input, ...stamp(), status: 'pending', fee: input.kind === 'new' ? db.settings.registrationFee : 0, invoiceId: null, reviewNote: '', reviewedBy: '', reviewedAt: '', submittedBy: actorName(), result: '' };
    db.registrations.push(rec);
    logActivity(db, input.kind === 'new' ? 'Registration submitted' : 'Enrollment change requested', `${input.dancer.firstName || db.dancers.find((d) => d.id === input.existingDancerId)?.firstName} — ${input.classIds.length} class(es)`, '/registration');
    return rec.id;
  });
}

const norm = (s: string) => s.trim().toLowerCase();

/** Approve: create or reuse the family & dancer (no duplicates), enroll (or waitlist), record agreements, invoice the fee. */
export function approveRegistration(id: ID, note: string) {
  return commit((db) => {
    const r = find(db.registrations, id, 'This registration');
    if (r.status !== 'pending') throw new ValidationError('This request was already reviewed.');
    const results: string[] = [];
    // family
    let familyId = r.familyId;
    if (!familyId) {
      const g = db.guardians.find((x) => r.parent.email && norm(x.email) === norm(r.parent.email));
      familyId = g?.familyId ?? null;
      if (familyId) results.push(`Matched existing family by email`);
    }
    if (!familyId) {
      const fam = { ...stamp(), name: `${r.parent.lastName || r.dancer.lastName} Family`, address: r.address, city: '', state: '', zip: '', status: 'active' as const, notes: 'Created from online registration.' };
      db.families.push(fam);
      familyId = fam.id;
      db.guardians.push({ ...stamp(), familyId, firstName: r.parent.firstName, lastName: r.parent.lastName, relationship: r.parent.relationship, email: r.parent.email, phone: r.parent.phone, isPrimary: true, emailConsent: true, smsConsent: false });
      if (r.emergency.name || r.emergency.phone) db.emergencyContacts.push({ ...stamp(), familyId, name: r.emergency.name || 'Emergency contact', relationship: r.emergency.relationship, phone: r.emergency.phone, notes: '' });
      results.push(`Created ${fam.name}`);
    }
    // dancer
    let dancerId = r.existingDancerId;
    if (!dancerId) {
      const match = db.dancers.find((d) => norm(d.firstName) === norm(r.dancer.firstName) && norm(d.lastName) === norm(r.dancer.lastName) && (!d.birthday || !r.dancer.birthday || d.birthday === r.dancer.birthday));
      if (match) {
        dancerId = match.id;
        if (!match.familyId) match.familyId = familyId;
        results.push(`Matched existing dancer ${match.firstName} ${match.lastName}`);
      } else {
        const d = { ...stamp(), firstName: r.dancer.firstName.trim(), lastName: r.dancer.lastName.trim(), birthday: r.dancer.birthday, clothingSize: r.dancer.clothingSize, costumeSize: '', shoeSize: r.dancer.shoeSize, level: r.dancer.level, pointe: false, notes: '', familyId, enrollmentStatus: 'active' as const, enrollmentDate: todayStr(), medicalNotes: r.dancer.medicalNotes, allergies: r.dancer.allergies };
        db.dancers.push(d);
        dancerId = d.id;
        results.push(`Created dancer ${d.firstName} ${d.lastName}`);
      }
    }
    // classes
    for (const classId of r.classIds) {
      const c = db.classes.find((x) => x.id === classId);
      if (!c) continue;
      const existing = db.enrollments.find((e) => e.classId === classId && e.dancerId === dancerId);
      if (existing?.status === 'enrolled') continue;
      const full = enrolledDancerIds(db, classId).length >= c.maxEnrollment;
      const status = full ? 'waitlist' : 'enrolled';
      if (existing) Object.assign(existing, { status, enrolledOn: todayStr(), droppedOn: '' });
      else db.enrollments.push({ ...stamp(), classId, dancerId: dancerId!, status, enrolledOn: todayStr(), droppedOn: '' });
      results.push(`${status === 'enrolled' ? 'Enrolled in' : 'Waiting list for'} ${c.name}`);
    }
    for (const classId of r.dropClassIds) {
      const e = db.enrollments.find((x) => x.classId === classId && x.dancerId === dancerId && x.status !== 'dropped');
      if (e) {
        Object.assign(e, { status: 'dropped', droppedOn: todayStr() });
        results.push(`Dropped ${db.classes.find((c) => c.id === classId)?.name}`);
      }
    }
    // agreements
    const yearId = db.schoolYears.find((y) => y.status === 'current')?.id ?? null;
    for (const pid of r.agreedPolicyIds) {
      const p = db.policies.find((x) => x.id === pid);
      if (!p) continue;
      const ver = currentVersion(p)?.version ?? 1;
      if (!db.policySignatures.some((s) => s.policyId === pid && s.familyId === familyId && s.version === ver)) {
        db.policySignatures.push({ ...stamp(), policyId: pid, version: ver, familyId: familyId!, guardianId: null, signerName: `${r.parent.firstName} ${r.parent.lastName}`.trim(), signedAt: r.createdAt, method: 'acknowledged', schoolYearId: yearId, ip: '' });
      }
    }
    // fee
    if (r.fee > 0) {
      r.invoiceId = createInvoiceIn(db, { familyId: familyId!, title: 'Registration fee', lines: [{ description: `Registration — ${db.dancers.find((d) => d.id === dancerId)?.firstName}`, category: 'Registration', quantity: 1, unitPrice: r.fee, dancerId }], discount: 0, taxRate: 0, issueDate: todayStr(), dueDate: todayStr(), notes: '', source: 'registration', sourceId: r.id, schoolYearId: r.schoolYearId, send: true }).id;
      results.push(`Invoiced ${money(r.fee)} registration fee`);
    }
    Object.assign(r, { status: 'approved', familyId, existingDancerId: dancerId, reviewNote: note.trim(), reviewedBy: actorName(), reviewedAt: nowIso(), result: results.join(' · ') });
    logActivity(db, 'Registration approved', results.join(' · '), `/families/${familyId}`);
    return results;
  });
}

export function denyRegistration(id: ID, note: string) {
  if (!note.trim()) throw new ValidationError('Add a short note explaining why.');
  commit((db) => {
    const r = find(db.registrations, id, 'This registration');
    Object.assign(r, { status: 'denied', reviewNote: note.trim(), reviewedBy: actorName(), reviewedAt: nowIso() });
    logActivity(db, 'Registration denied', `${r.dancer.firstName || ''} — ${note.trim()}`, '/registration');
  });
}

/* ------------------------------------------------------------- policies */

export interface PolicyInput {
  title: string;
  category: string;
  body: string;
  fileId: ID | null;
  audience: Policy['audience'];
  classIds: ID[];
  teamIds: ID[];
  familyIds: ID[];
  requiresSignature: boolean;
  deadline: string;
  annualRenewal: boolean;
  active: boolean;
}

/** Save a policy. Changing the wording creates a new version (families must sign again); old versions are kept. */
export function savePolicy(input: PolicyInput, id?: ID): ID {
  const title = req(input.title, 'Title');
  if (!input.body.trim() && !input.fileId) throw new ValidationError('Write the policy text or attach a document.');
  return commit((db) => {
    const meta = { title, category: input.category, audience: input.audience, classIds: input.classIds, teamIds: input.teamIds, familyIds: input.familyIds, requiresSignature: input.requiresSignature, deadline: input.deadline, annualRenewal: input.annualRenewal, active: input.active };
    if (id) {
      const p = find(db.policies, id, 'This policy');
      const cur = currentVersion(p);
      Object.assign(p, meta, { updatedAt: nowIso() });
      if (cur.body !== input.body.trim() || cur.fileId !== input.fileId) {
        p.versions.push({ version: cur.version + 1, body: input.body.trim(), fileId: input.fileId, createdAt: nowIso(), createdBy: actorName() });
        logActivity(db, 'Policy updated (new version)', `${title} v${cur.version + 1} — families must sign again`, `/policies/${id}`);
      }
      return id;
    }
    const rec: Policy = { ...meta, ...stamp(), versions: [{ version: 1, body: input.body.trim(), fileId: input.fileId, createdAt: nowIso(), createdBy: actorName() }] };
    db.policies.push(rec);
    logActivity(db, 'Policy created', title, `/policies/${rec.id}`);
    return rec.id;
  });
}

export function signPolicy(policyId: ID, familyId: ID, guardianId: ID | null, signerName: string, method: 'typed' | 'acknowledged') {
  const name = req(signerName, 'Your full name');
  commit((db) => {
    const p = find(db.policies, policyId, 'This policy');
    find(db.families, familyId, 'The family');
    const ver = currentVersion(p).version;
    const yearId = db.schoolYears.find((y) => y.status === 'current')?.id ?? null;
    if (db.policySignatures.some((s) => s.policyId === policyId && s.familyId === familyId && s.version === ver && (!p.annualRenewal || s.schoolYearId === yearId))) throw new ValidationError('Already signed.');
    db.policySignatures.push({ ...stamp(), policyId, version: ver, familyId, guardianId, signerName: name, signedAt: nowIso(), method, schoolYearId: yearId, ip: '' });
    logActivity(db, 'Policy signed', `${p.title} v${ver} — ${name} (${db.families.find((f) => f.id === familyId)?.name})`, `/policies/${policyId}`);
  });
}

export function deletePolicy(id: ID) {
  commit((db) => {
    const p = find(db.policies, id, 'This policy');
    if (db.policySignatures.some((s) => s.policyId === id)) throw new ValidationError('This policy has signatures. Turn it off (inactive) instead so signed records are kept.');
    db.policies = db.policies.filter((x) => x.id !== id);
    logActivity(db, 'Policy deleted', p.title);
  });
}

/* ------------------------------------------------------------ fundraisers */

export type FundraiserInput = Omit<Fundraiser, 'id' | 'createdAt' | 'updatedAt' | 'isSample'>;

export function saveFundraiser(input: FundraiserInput, id?: ID): ID {
  const name = req(input.name, 'Fundraiser name');
  if (Number(input.goal) < 0) throw new ValidationError('Goal cannot be negative.');
  return commit((db) => {
    const clean = { ...input, name, goal: round2(Number(input.goal) || 0), items: input.items.filter((i) => i.name.trim()).map((i) => ({ ...i, id: i.id || newId(), price: round2(Number(i.price) || 0) })) };
    if (id) {
      Object.assign(find(db.fundraisers, id, 'This fundraiser'), clean, { updatedAt: nowIso() });
      return id;
    }
    const rec: Fundraiser = { ...clean, ...stamp() };
    db.fundraisers.push(rec);
    logActivity(db, 'Fundraiser created', name, `/fundraisers/${rec.id}`);
    return rec.id;
  });
}

/**
 * Record a donation or order. With a family, it's invoiced to their account;
 * `payNow` takes a test-mode online payment (parents) and `paidOffline` records cash/check (staff).
 */
export function addFundraiserTransaction(input: { fundraiserId: ID; familyId: ID | null; dancerId: ID | null; donorName: string; kind: 'donation' | 'order'; items: { itemId: ID; qty: number }[]; amount: number; notes: string; payNow?: boolean; paidOffline?: 'cash' | 'check' | null }): ID {
  return commit((db) => {
    const f = find(db.fundraisers, input.fundraiserId, 'This fundraiser');
    if (f.status !== 'open') throw new ValidationError('This fundraiser is closed.');
    const items = input.items.filter((i) => i.qty > 0);
    const amount = input.kind === 'order' ? round2(items.reduce((s, i) => s + (f.items.find((x) => x.id === i.itemId)?.price ?? 0) * i.qty, 0)) : round2(Number(input.amount));
    if (!(amount > 0)) throw new ValidationError(input.kind === 'order' ? 'Choose at least one item.' : 'Enter a donation amount.');
    const donor = input.donorName.trim() || (input.familyId ? db.families.find((x) => x.id === input.familyId)?.name ?? '' : '');
    if (!donor) throw new ValidationError('Enter the donor or buyer name.');
    let invoiceId: ID | null = null;
    if (input.familyId) {
      const lines = input.kind === 'order' ? items.map((i) => { const it = f.items.find((x) => x.id === i.itemId)!; return { description: `${f.name}: ${it.name}`, category: 'Fundraiser', quantity: i.qty, unitPrice: it.price, dancerId: input.dancerId }; }) : [{ description: `${f.name}: donation`, category: 'Fundraiser', quantity: 1, unitPrice: amount, dancerId: input.dancerId }];
      const inv = createInvoiceIn(db, { familyId: input.familyId, title: f.name, lines, discount: 0, taxRate: 0, issueDate: todayStr(), dueDate: f.endDate || todayStr(), notes: input.notes, source: 'fundraiser', sourceId: f.id, schoolYearId: null, send: true });
      invoiceId = inv.id;
      if (input.payNow) recordPaymentIn(db, { familyId: input.familyId, invoiceId, amount, method: 'card', processor: 'test', reference: '', date: todayStr(), note: 'Test-mode online payment — no card was charged' });
      else if (input.paidOffline) recordPaymentIn(db, { familyId: input.familyId, invoiceId, amount, method: input.paidOffline, processor: 'offline', reference: '', date: todayStr(), note: 'Fundraiser' });
    }
    const rec = { ...stamp(), fundraiserId: f.id, familyId: input.familyId, dancerId: input.dancerId, donorName: donor, kind: input.kind, items, amount, invoiceId, notes: input.notes.trim(), fulfilled: input.kind === 'donation' };
    db.fundraiserTransactions.push(rec);
    logActivity(db, input.kind === 'donation' ? 'Donation received' : 'Fundraiser order', `${f.name}: ${donor} · ${money(amount)}`, `/fundraisers/${f.id}`);
    return rec.id;
  });
}

export function setOrderFulfilled(id: ID, fulfilled: boolean) {
  commit((db) => {
    find(db.fundraiserTransactions, id, 'This order').fulfilled = fulfilled;
  });
}

/* --------------------------------------------------------------- tickets */

export type TicketEventInput = Omit<TicketedEvent, 'id' | 'createdAt' | 'updatedAt' | 'isSample'>;

export function saveTicketEvent(input: TicketEventInput, id?: ID): ID {
  const name = req(input.name, 'Name');
  if (!input.types.length) throw new ValidationError('Add at least one ticket type.');
  for (const t of input.types) {
    if (!t.name.trim()) throw new ValidationError('Every ticket type needs a name.');
    if (t.price < 0 || t.quantity < 0) throw new ValidationError('Prices and quantities cannot be negative.');
  }
  return commit((db) => {
    const clean = { ...input, name, types: input.types.map((t) => ({ ...t, id: t.id || newId(), price: round2(Number(t.price)), quantity: Math.floor(Number(t.quantity)) })) };
    if (id) {
      const e = find(db.ticketEvents, id, 'This ticketed event');
      for (const t of e.types) {
        const n = clean.types.find((x) => x.id === t.id);
        const sold = ticketsSold(db, id, t.id);
        if (!n && sold) throw new ValidationError(`“${t.name}” tickets have been sold, so that type can't be removed.`);
        if (n && n.quantity < sold) throw new ValidationError(`${sold} “${t.name}” tickets are already sold.`);
      }
      Object.assign(e, clean, { updatedAt: nowIso() });
      return id;
    }
    const rec: TicketedEvent = { ...clean, ...stamp() };
    db.ticketEvents.push(rec);
    logActivity(db, 'Ticketed event created', name, `/tickets/${rec.id}`);
    return rec.id;
  });
}

/** Sell tickets. Online purchases are test-mode; box office sales are recorded as cash/card at the door. */
export function buyTickets(input: { ticketEventId: ID; familyId: ID | null; buyerName: string; buyerEmail: string; lines: { typeId: ID; qty: number }[]; seats: string[]; source: 'parent' | 'box_office'; method: 'card' | 'cash' | 'comp' }): ID {
  const buyer = req(input.buyerName, 'Buyer name');
  return commit((db) => {
    const e = find(db.ticketEvents, input.ticketEventId, 'This show');
    const today = todayStr();
    if (input.source === 'parent') {
      if (e.status !== 'on_sale') throw new ValidationError('Tickets are not on sale.');
      if (e.salesOpen && today < e.salesOpen) throw new ValidationError(`Sales open ${fmtDate(e.salesOpen)}.`);
      if (e.salesClose && today > e.salesClose) throw new ValidationError('Ticket sales have closed.');
    }
    const lines = input.lines.filter((l) => l.qty > 0).map((l) => {
      const t = e.types.find((x) => x.id === l.typeId);
      if (!t) throw new ValidationError('Unknown ticket type.');
      if (input.source === 'parent' && (t.category === 'comp' || t.category === 'staff')) throw new ValidationError(`${t.name} tickets are issued by the office.`);
      const left = t.quantity - ticketsSold(db, e.id, t.id);
      if (l.qty > left) throw new ValidationError(`Only ${left} “${t.name}” ticket(s) left.`);
      return { typeId: t.id, qty: l.qty, unitPrice: t.price };
    });
    if (!lines.length) throw new ValidationError('Choose at least one ticket.');
    const count = lines.reduce((s, l) => s + l.qty, 0);
    if (e.seatingRows > 0) {
      if (input.seats.length !== count) throw new ValidationError(`Pick ${count} seat(s) on the seating chart.`);
      const taken = takenSeats(db, e.id);
      const clash = input.seats.filter((s) => taken.has(s));
      if (clash.length) throw new ValidationError(`Seat(s) ${clash.join(', ')} were just taken.`);
    }
    const total = round2(lines.reduce((s, l) => s + l.qty * l.unitPrice, 0));
    let paymentId: ID | null = null;
    if (total > 0 && input.familyId && input.method !== 'comp') {
      paymentId = recordPaymentIn(db, { familyId: input.familyId, invoiceId: null, amount: total, method: input.method === 'cash' ? 'cash' : 'card', processor: input.source === 'parent' ? 'test' : 'offline', reference: '', date: today, note: `Tickets: ${e.name}` }).id;
    }
    const rec = { ...stamp(), ticketEventId: e.id, familyId: input.familyId, buyerName: buyer, buyerEmail: input.buyerEmail.trim(), lines, seats: input.seats, total, status: 'paid' as const, paymentId, source: input.source };
    db.ticketOrders.push(rec);
    logActivity(db, 'Tickets sold', `${e.name}: ${count} to ${buyer} (${money(total)})`, `/tickets/${e.id}`);
    return rec.id;
  });
}

/** Refund a ticket order (through the test processor / recorded offline) and release its seats. */
export function refundTicketOrder(orderId: ID, reason: string) {
  if (!reason.trim()) throw new ValidationError('Give a reason for the refund.');
  commit((db) => {
    const o = find(db.ticketOrders, orderId, 'This order');
    if (o.status !== 'paid') throw new ValidationError('This order was already refunded or cancelled.');
    const p = o.paymentId ? db.payments.find((x) => x.id === o.paymentId) : undefined;
    if (p) {
      db.refunds.push({ ...stamp(), paymentId: p.id, familyId: p.familyId, amount: o.total, date: todayStr(), method: p.processor === 'test' ? 'processor' : 'offline', status: 'completed', reason: reason.trim(), recordedBy: actorName() });
    }
    o.status = p ? 'refunded' : 'cancelled';
    o.seats = [];
    logActivity(db, 'Tickets refunded', `${o.buyerName} · ${money(o.total)} — ${reason.trim()}`, `/tickets/${o.ticketEventId}`);
  });
}

export function deleteTicketEvent(id: ID) {
  commit((db) => {
    if (db.ticketOrders.some((o) => o.ticketEventId === id && o.status === 'paid')) throw new ValidationError('Tickets have been sold. Close sales instead.');
    db.ticketEvents = db.ticketEvents.filter((x) => x.id !== id);
  });
}

export function deleteFundraiser(id: ID) {
  commit((db) => {
    if (db.fundraiserTransactions.some((t) => t.fundraiserId === id)) throw new ValidationError('This fundraiser has donations or orders. Close it instead.');
    db.fundraisers = db.fundraisers.filter((x) => x.id !== id);
  });
}


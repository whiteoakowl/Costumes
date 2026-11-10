import { commit, getDb, ValidationError } from './store';
import { newId, nowIso, todayStr } from './ids';
import { actorName } from '../lib/session';
import { logActivity } from './studioActions';
import { buildOverview, fullName } from './selectors';
import { familyPolicies, invoiceBalance, invoiceStatus, isCheckoutOverdue, resolveRecipients, upcoming } from './platform';
import { nyNowLocal } from './time';
import { addDays, staffName } from './studio';
import { fmtDate, fmtClock } from './time';
import type { AppNotification, Channel, Database, ID, Message, MessageTemplate, NewsletterBlock, RecipientSpec, ReminderKind } from './types';

const stamp = () => {
  const t = nowIso();
  return { id: newId(), createdAt: t, updatedAt: t };
};

function find<T extends { id: ID }>(list: T[], id: ID, label: string): T {
  const r = list.find((x) => x.id === id);
  if (!r) throw new ValidationError(`${label} no longer exists.`);
  return r;
}

export const SMS_LIMIT = 320;

/* -------------------------------------------------------------- messages */

export interface MessageInput {
  channel: Channel;
  subject: string;
  body: string;
  blocks: NewsletterBlock[];
  recipients: RecipientSpec[];
  attachmentIds: ID[];
  related: Message['related'];
}

function validate(input: MessageInput) {
  if (input.channel !== 'sms' && !input.subject.trim()) throw new ValidationError('Add a subject.');
  if (input.channel === 'newsletter' ? !input.blocks.length : !input.body.trim()) throw new ValidationError(input.channel === 'newsletter' ? 'Add at least one section to the newsletter.' : 'Write a message.');
  if (input.channel === 'sms' && input.body.length > SMS_LIMIT) throw new ValidationError(`Text messages are limited to ${SMS_LIMIT} characters.`);
  if (!input.recipients.length) throw new ValidationError('Choose who should receive it.');
}

export function saveMessage(input: MessageInput, id?: ID): ID {
  return commit((db) => {
    const clean = { ...input, subject: input.subject.trim() };
    if (id) {
      const m = find(db.messages, id, 'This message');
      if (m.status === 'sent') throw new ValidationError('Sent messages cannot be edited. Duplicate it instead.');
      Object.assign(m, clean, { updatedAt: nowIso() });
      return id;
    }
    const rec: Message = { ...clean, ...stamp(), deliveries: [], status: 'draft', scheduledFor: '', sentAt: '', sender: actorName(), readBy: [] };
    db.messages.push(rec);
    return rec.id;
  });
}

function deliver(db: Database, m: Message) {
  m.deliveries = resolveRecipients(db, m.recipients, m.channel);
  m.status = 'sent';
  m.sentAt = nowIso();
  logActivity(db, `${m.channel === 'sms' ? 'Text alert' : m.channel === 'newsletter' ? 'Newsletter' : 'Email'} sent`, `${m.subject || m.body.slice(0, 40)} → ${m.deliveries.filter((d) => d.status === 'in_app').length} recipient(s)`, `/communications/${m.id}`);
}

/** Send now: delivered to recipients' portal inboxes; external email/SMS needs a provider. */
export function sendMessage(id: ID) {
  commit((db) => {
    const m = find(db.messages, id, 'This message');
    validate(m);
    if (m.status === 'sent') throw new ValidationError('Already sent.');
    deliver(db, m);
  });
}

export function scheduleMessage(id: ID, when: string) {
  if (!when || Number.isNaN(Date.parse(when))) throw new ValidationError('Choose when to send it.');
  if (when <= nyNowLocal()) throw new ValidationError('Choose a time in the future (Eastern time).');
  commit((db) => {
    const m = find(db.messages, id, 'This message');
    validate(m);
    m.status = 'scheduled';
    m.scheduledFor = when;
    logActivity(db, 'Message scheduled', `${m.subject || 'Text alert'} for ${fmtDate(when.slice(0, 10))} ${fmtClock(when.slice(11, 16))}`, `/communications/${m.id}`);
  });
}

export function unscheduleMessage(id: ID) {
  commit((db) => {
    const m = find(db.messages, id, 'This message');
    if (m.status !== 'scheduled') return;
    m.status = 'draft';
    m.scheduledFor = '';
  });
}

/** Send any scheduled messages whose time has come (runs when the app opens and every minute). */
export function processScheduled(): number {
  const due = getDb().messages.filter((m) => m.status === 'scheduled' && m.scheduledFor && m.scheduledFor <= nyNowLocal());
  if (!due.length) return 0;
  return commit((db) => {
    let n = 0;
    for (const m of db.messages) if (m.status === 'scheduled' && m.scheduledFor <= nyNowLocal()) {
      deliver(db, m);
      n += 1;
    }
    return n;
  });
}

export function duplicateMessage(id: ID): ID {
  return commit((db) => {
    const m = find(db.messages, id, 'This message');
    const copy: Message = { ...m, ...stamp(), subject: m.subject ? `${m.subject} (copy)` : '', blocks: m.blocks.map((b) => ({ ...b, id: newId() })), deliveries: [], status: 'draft', scheduledFor: '', sentAt: '', sender: actorName(), readBy: [], isSample: false };
    db.messages.push(copy);
    return copy.id;
  });
}

export function deleteMessage(id: ID) {
  commit((db) => {
    const m = find(db.messages, id, 'This message');
    if (m.status === 'sent') throw new ValidationError('Sent messages are kept in the communication history.');
    db.messages = db.messages.filter((x) => x.id !== id);
  });
}

export function markMessageRead(id: ID, accountId: ID) {
  commit((db) => {
    const m = db.messages.find((x) => x.id === id);
    if (m && !m.readBy.includes(accountId)) m.readBy.push(accountId);
  });
}

export function saveTemplate(input: Omit<MessageTemplate, 'id' | 'createdAt' | 'updatedAt' | 'isSample'>, id?: ID): ID {
  if (!input.name.trim()) throw new ValidationError('Name the template.');
  return commit((db) => {
    if (id) {
      Object.assign(find(db.messageTemplates, id, 'This template'), input, { updatedAt: nowIso() });
      return id;
    }
    const rec = { ...input, ...stamp() };
    db.messageTemplates.push(rec);
    return rec.id;
  });
}

export function deleteTemplate(id: ID) {
  commit((db) => {
    db.messageTemplates = db.messageTemplates.filter((t) => t.id !== id);
  });
}

/** Messages a family or staff member received in their portal. */
export function inboxFor(db: Database, who: { familyId?: ID | null; staffId?: ID | null }) {
  return db.messages
    .filter((m) => m.status === 'sent' && m.deliveries.some((d) => d.status === 'in_app' && ((who.familyId && d.familyId === who.familyId) || (who.staffId && d.staffId === who.staffId))))
    .sort((a, b) => b.sentAt.localeCompare(a.sentAt));
}

/* ------------------------------------------------------------ reminders */

export const reminderLabels: Record<ReminderKind, string> = {
  tuition_due: 'Tuition due soon',
  invoice_overdue: 'Overdue invoices',
  policy_missing: 'Missing policy signatures',
  event_upcoming: 'Upcoming events',
  registration_deadline: 'Registration deadlines',
  recital_reminder: 'Recital reminders',
  checkout_due: 'Costume return coming up',
  return_overdue: 'Costume returns overdue',
  call_time: 'Performance call times',
  rehearsal: 'Rehearsal reminders',
  missing_costume: 'Missing costume assignments',
  repair_needed: 'Costumes needing repair',
};

/**
 * Create due reminder notifications. Each reminder has a stable key, so
 * running this again never creates duplicates for the same invoice/event.
 */
export function runReminders(): number {
  const db0 = getDb();
  if (!db0.settings.reminders?.length) return 0;
  return commit((db) => {
    const today = todayStr();
    const keys = new Set(db.notifications.map((n) => n.key));
    let created = 0;
    const rule = (k: ReminderKind) => db.settings.reminders.find((r) => r.kind === k && r.enabled);
    const add = (kind: ReminderKind, key: string, title: string, body: string, target: { familyIds?: ID[]; staffIds?: ID[]; admin?: boolean }, link: string) => {
      const r = rule(kind);
      if (!r || keys.has(key)) return;
      keys.add(key);
      const external = r.channels.filter((c) => c !== 'inapp');
      const n: AppNotification = {
        ...stamp(),
        key,
        kind,
        title,
        body,
        familyIds: target.familyIds ?? [],
        staffIds: target.staffIds ?? [],
        admin: !!target.admin,
        link,
        channels: r.channels,
        status: 'sent',
        sendOn: today,
        sentAt: nowIso(),
        failure: external.length ? `${external.join(' & ').toUpperCase()} not sent — no ${external.map((c) => (c === 'sms' ? 'SMS' : 'email')).join('/')} provider connected. Delivered in the app.` : '',
        readBy: [],
      };
      db.notifications.push(n);
      created += 1;
    };
    const famName = (id: ID) => db.families.find((f) => f.id === id)?.name ?? '';
    for (const inv of db.invoices.filter((i) => i.state === 'sent')) {
      const st = invoiceStatus(db, inv, today);
      const bal = invoiceBalance(db, inv);
      if (inv.source === 'tuition' && (st === 'unpaid' || st === 'partial') && inv.dueDate && upcoming(inv.dueDate, rule('tuition_due')?.daysBefore ?? 3, today))
        add('tuition_due', `tuition_due:${inv.id}`, `Tuition due ${fmtDate(inv.dueDate)}`, `${inv.number} (${inv.title}): $${bal.toFixed(2)} due ${fmtDate(inv.dueDate)}.`, { familyIds: [inv.familyId] }, '/family/billing');
      if (st === 'overdue') add('invoice_overdue', `overdue:${inv.id}`, `Invoice ${inv.number} is overdue`, `${famName(inv.familyId)}: $${bal.toFixed(2)} was due ${fmtDate(inv.dueDate)}.`, { familyIds: [inv.familyId], admin: true }, '/family/billing');
    }
    for (const f of db.families.filter((x) => x.status === 'active')) {
      for (const { policy, status } of familyPolicies(db, f.id)) {
        if (status !== 'missing' && status !== 'overdue') continue;
        const soon = !policy.deadline || policy.deadline <= addDays(today, rule('policy_missing')?.daysBefore ?? 7);
        if (soon) add('policy_missing', `policy:${policy.id}:${f.id}:v${policy.versions.length}`, `Please sign: ${policy.title}`, `${policy.title} needs a signature${policy.deadline ? ` by ${fmtDate(policy.deadline)}` : ''}.`, { familyIds: [f.id] }, '/family/policies');
      }
    }
    for (const e of db.signupEvents) {
      const fams = [...new Set(db.eventRegistrations.filter((r) => r.eventId === e.id && r.status === 'registered').map((r) => r.familyId).filter(Boolean) as ID[])];
      if (upcoming(e.date, rule('event_upcoming')?.daysBefore ?? 3, today) && fams.length) add('event_upcoming', `event:${e.id}`, `${e.name} is coming up`, `${e.name} on ${fmtDate(e.date)}${e.startTime ? ` at ${fmtClock(e.startTime)}` : ''}${e.location ? `, ${e.location}` : ''}.`, { familyIds: fams }, '/family/events');
      if (e.signupsOpen && e.registrationDeadline && upcoming(e.registrationDeadline, rule('registration_deadline')?.daysBefore ?? 5, today)) {
        const registered = new Set(db.eventRegistrations.filter((r) => r.eventId === e.id).map((r) => r.familyId));
        const eligible = [...new Set(db.dancers.map((d) => d.familyId).filter((f) => f && !registered.has(f)) as ID[])];
        if (eligible.length) add('registration_deadline', `regdeadline:${e.id}`, `Sign up for ${e.name} by ${fmtDate(e.registrationDeadline)}`, `Registration for ${e.name} closes ${fmtDate(e.registrationDeadline)}.`, { familyIds: eligible }, '/family/events');
      }
    }
    for (const r of db.recitals.filter((x) => x.status !== 'completed' && upcoming(x.startDate, rule('recital_reminder')?.daysBefore ?? 7, today))) {
      const fams = new Set<ID>();
      for (const n of db.recitalNumbers.filter((x) => x.recitalId === r.id)) {
        const dancers = n.teamId ? db.teams.find((t) => t.id === n.teamId)?.dancerIds ?? [] : db.enrollments.filter((e) => e.classId === n.classId && e.status === 'enrolled').map((e) => e.dancerId);
        dancers.forEach((d) => { const f = db.dancers.find((x) => x.id === d)?.familyId; if (f) fams.add(f); });
      }
      add('recital_reminder', `recital:${r.id}`, `${r.name} is coming up`, `${r.name} — ${fmtDate(r.startDate)} at ${r.venue}. ${r.performanceTimes}`, { familyIds: [...fams], staffIds: db.staff.filter((s) => s.position === 'teacher' || s.position === 'assistant').map((s) => s.id) }, '/family/costumes');
    }
    for (const c of db.checkouts) {
      const costume = db.costumes.find((x) => x.id === c.costumeId)?.name ?? 'Costume';
      if (c.status === 'checked_out' && c.expectedReturn && upcoming(c.expectedReturn, rule('checkout_due')?.daysBefore ?? 2, today) && c.familyId) add('checkout_due', `checkoutdue:${c.id}`, `Please return ${costume}`, `${costume} is due back ${fmtDate(c.expectedReturn)}.`, { familyIds: [c.familyId] }, '/family/costumes');
      if (isCheckoutOverdue(c, today)) add('return_overdue', `returnoverdue:${c.id}`, `${costume} is overdue`, `${costume} was due back ${fmtDate(c.expectedReturn)}.`, { familyIds: c.familyId ? [c.familyId] : [], admin: true }, '/checkout');
    }
    for (const p of db.performances.filter((x) => upcoming(x.date, rule('call_time')?.daysBefore ?? 1, today))) {
      const casts = db.casts.filter((c) => c.ownerType === 'performance' && c.ownerId === p.id).map((c) => c.id);
      const fams = [...new Set(db.castMembers.filter((m) => casts.includes(m.castId)).map((m) => db.dancers.find((d) => d.id === m.dancerId)?.familyId).filter(Boolean) as ID[])];
      if (p.callTime) add('call_time', `calltime:${p.id}`, `Call time ${fmtClock(p.callTime)} — ${p.name}`, `${p.name} on ${fmtDate(p.date)}: call time ${fmtClock(p.callTime)} at ${p.venue}.`, { familyIds: fams }, '/family/costumes');
    }
    for (const p of db.performances.filter((x) => upcoming(x.date, rule('missing_costume')?.daysBefore ?? 14, today))) {
      const r = buildOverview(db, 'performance', p.id).readiness;
      if (r.missingAssignments) add('missing_costume', `missingcostume:${p.id}:${r.missingAssignments}`, `${r.missingAssignments} dancer(s) missing a costume`, `${p.name} (${fmtDate(p.date)}) has dancers without costume assignments.`, { admin: true }, `/performances/${p.id}`);
    }
    for (const e of db.studioEvents.filter((x) => (x.type === 'rehearsal' || x.type === 'competition_rehearsal') && upcoming(x.startDate, rule('rehearsal')?.daysBefore ?? 2, today))) {
      add('rehearsal', `rehearsal:${e.id}`, `Rehearsal: ${e.title}`, `${e.title} on ${fmtDate(e.startDate)}${e.startTime ? ` at ${fmtClock(e.startTime)}` : ''}${e.location ? `, ${e.location}` : ''}.`, { familyIds: db.families.filter((f) => f.status === 'active').map((f) => f.id), staffIds: db.staff.map((s) => s.id) }, '/calendar');
    }
    for (const w of db.workOrders.filter((x) => (x.status === 'open' || x.status === 'in_progress') && !x.volunteerId)) {
      const c = db.costumes.find((x) => x.id === w.costumeId);
      if (c) add('repair_needed', `repair:${w.id}`, `${c.name} needs ${w.type}`, `${c.name}: ${w.description || w.type} — no volunteer assigned yet.`, { admin: true }, '/repairs');
    }
    if (created) logActivity(db, 'Reminders created', `${created} new reminder(s)`, '/notifications');
    return created;
  });
}

export function sendManualNotification(input: { title: string; body: string; familyIds: ID[]; staffIds: ID[]; channels: ('email' | 'sms' | 'inapp')[]; sendOn: string }) {
  if (!input.title.trim()) throw new ValidationError('Add a title.');
  commit((db) => {
    const future = input.sendOn && input.sendOn > todayStr();
    const external = input.channels.filter((c) => c !== 'inapp');
    db.notifications.push({ ...stamp(), key: `manual:${newId()}`, kind: 'manual', title: input.title.trim(), body: input.body.trim(), familyIds: input.familyIds, staffIds: input.staffIds, admin: false, link: '', channels: input.channels, status: future ? 'pending' : 'sent', sendOn: input.sendOn || todayStr(), sentAt: future ? '' : nowIso(), failure: external.length ? `${external.join(' & ').toUpperCase()} not sent — provider not connected. Delivered in the app.` : '', readBy: [] });
  });
}

/** Release pending notifications whose date has arrived. */
export function releasePendingNotifications() {
  const due = getDb().notifications.some((n) => n.status === 'pending' && n.sendOn <= todayStr());
  if (!due) return;
  commit((db) => {
    for (const n of db.notifications) if (n.status === 'pending' && n.sendOn <= todayStr()) {
      n.status = 'sent';
      n.sentAt = nowIso();
    }
  });
}

export function markNotificationsRead(ids: ID[], accountId: ID) {
  commit((db) => {
    for (const n of db.notifications) if (ids.includes(n.id) && !n.readBy.includes(accountId)) n.readBy.push(accountId);
  });
}

export function notificationsFor(db: Database, who: { familyId?: ID | null; staffId?: ID | null; admin?: boolean }) {
  return db.notifications
    .filter((n) => n.status === 'sent' && (!!(who.familyId && n.familyIds.includes(who.familyId)) || !!(who.staffId && n.staffIds.includes(who.staffId)) || (who.admin && n.admin)))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function describeRecipients(db: Database, specs: RecipientSpec[]) {
  const name = (kind: RecipientSpec['kind'], id: ID) => {
    if (kind === 'families') return db.families.find((f) => f.id === id)?.name;
    if (kind === 'guardians') { const g = db.guardians.find((x) => x.id === id); return g ? `${g.firstName} ${g.lastName}` : undefined; }
    if (kind === 'dancers') { const d = db.dancers.find((x) => x.id === id); return d ? `${fullName(d)}'s family` : undefined; }
    if (kind === 'classes') return db.classes.find((c) => c.id === id)?.name;
    if (kind === 'teams') return db.teams.find((t) => t.id === id)?.name;
    if (kind === 'teachers') return staffName(db.staff.find((s) => s.id === id));
    if (kind === 'event') return db.signupEvents.find((e) => e.id === id)?.name;
    if (kind === 'recital') return db.recitals.find((r) => r.id === id)?.name;
    if (kind === 'performance') return db.performances.find((p) => p.id === id)?.name;
    return undefined;
  };
  return specs.map((s) => (s.kind === 'all_families' ? 'All families' : s.kind === 'all_staff' ? 'All staff' : s.ids.map((id) => name(s.kind, id)).filter(Boolean).join(', '))).filter(Boolean).join(' · ');
}

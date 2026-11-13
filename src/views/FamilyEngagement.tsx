import { useState } from 'react';
import { Link } from '../lib/router';
import { CalendarCheck, CheckCircle2, ClipboardSignature, FileSignature, HandCoins, PartyPopper, Ticket } from 'lucide-react';
import { useDb } from '../data/store';
import { cancelRegistration, registerForEvent, signPolicy, submitRegistration, type RegistrationInput } from '../data/engagementActions';
import { currentVersion, eligibleDancers, eventCounts, familyPolicies, fundraiserRaised, invoiceBalance } from '../data/platform';
import { formatDate, formatDateTime, formatTime, fullName } from '../data/selectors';
import { todayStr } from '../data/ids';
import { Badge, Card, CheckList, EmptyState, Field, PageHeader } from '../components/ui';
import { FormModal } from '../components/forms';
import { useConfirm, useRun } from '../components/feedback';
import { classWhen, currentYear, money } from '../components/studioUi';
import { Progress } from '../components/charts';
import { useViewer } from '../lib/session';
import { BuyTicketsDialog, eventTypeLabels, FundraiserEntryDialog } from './Engagement';

import type { Database, Fundraiser, ID, SignupEvent, TicketedEvent } from '../data/types';

function useFamilyCtx() {
  const db = useDb();
  const v = useViewer();
  const familyId = v.familyId;
  const dancers = familyId ? db.dancers.filter((d) => d.familyId === familyId) : [];
  const guardian = familyId ? db.guardians.find((g) => g.familyId === familyId && g.isPrimary) ?? db.guardians.find((g) => g.familyId === familyId) : undefined;
  return { db, v, familyId, dancers, guardian };
}

const NoFamily = () => <EmptyState title="No family linked" message="This login isn't connected to a family yet. Please contact the studio office." />;

/* ================================================================ events */

export function ParentEventsPage() {
  const { db, familyId, dancers } = useFamilyCtx();
  const run = useRun();
  const confirm = useConfirm();
  const [signup, setSignup] = useState<{ e: SignupEvent; dancerId: ID; answers: Record<string, string> } | null>(null);
  if (!familyId) return <NoFamily />;
  const today = todayStr();
  const events = db.signupEvents.filter((e) => (e.endDate || e.date) >= today && dancers.some((d) => eligibleDancers(db, e).includes(d.id))).sort((a, b) => a.date.localeCompare(b.date));
  return (
    <>
      <PageHeader title="Events & Sign-ups" subtitle="Competitions, workshops, parties and more your dancers can join" />
      {!events.length ? (
        <EmptyState icon={<PartyPopper size={28} />} title="No events to sign up for right now" />
      ) : (
        events.map((e) => {
          const c = eventCounts(db, e.id);
          const full = e.capacity > 0 && c.registered >= e.capacity;
          const closed = !e.signupsOpen || (!!e.registrationDeadline && e.registrationDeadline < today);
          return (
            <Card key={e.id} title={e.name} icon={<CalendarCheck size={18} />} actions={<Badge tone="info">{eventTypeLabels[e.type]}</Badge>}>
              <p className="small">
                <strong>
                  {formatDate(e.date)}
                  {e.endDate && e.endDate !== e.date && ` – ${formatDate(e.endDate)}`}
                </strong>
                {e.startTime && ` · ${formatTime(e.startTime)}${e.endTime ? `–${formatTime(e.endTime)}` : ''}`}
                {e.location && ` · ${e.location}`}
                {e.address && <span className="faint"> ({e.address})</span>}
              </p>
              {e.description && <p className="small prewrap">{e.description}</p>}
              <p className="small faint">
                {e.cost ? `${money(e.cost)} per dancer (added to your account)` : 'Free'}
                {e.registrationDeadline && ` · Sign up by ${formatDate(e.registrationDeadline)}`}
                {e.capacity > 0 && ` · ${Math.max(0, e.capacity - c.registered)} spots left`}
              </p>
              <ul className="mini-list">
                {dancers
                  .filter((d) => eligibleDancers(db, e).includes(d.id))
                  .map((d) => {
                    const r = db.eventRegistrations.find((x) => x.eventId === e.id && x.dancerId === d.id && x.status !== 'cancelled');
                    return (
                      <li key={d.id}>
                        <span>
                          <strong>{d.firstName}</strong>{' '}
                          {r && <Badge tone={r.status === 'registered' ? 'ready' : r.status === 'waitlist' ? 'progress' : 'neutral'}>{{ registered: 'Signed up', waitlist: 'On the waiting list', declined: 'Not attending', cancelled: '' }[r.status]}</Badge>}
                        </span>
                        <span className="row-actions">
                          {(!r || r.status === 'declined') && !closed && (
                            <>
                              <button className="btn btn-primary btn-sm" onClick={() => setSignup({ e, dancerId: d.id, answers: {} })}>
                                {full ? 'Join waiting list' : 'Sign up'}
                              </button>
                              {!r && (
                                <button className="btn btn-ghost btn-sm" onClick={() => run(() => registerForEvent(e.id, d.id, {}, { decline: true }), 'Thanks for letting us know.')}>
                                  Can't attend
                                </button>
                              )}
                            </>
                          )}
                          {r && (r.status === 'registered' || r.status === 'waitlist') && !closed && (
                            <button className="btn btn-ghost btn-sm" onClick={async () => { if (await confirm({ title: 'Cancel sign-up?', message: r.invoiceId ? 'An unpaid event invoice is cancelled. Paid fees follow the studio refund policy.' : 'You can sign up again while sign-ups are open.', confirmLabel: 'Cancel sign-up' })) run(() => cancelRegistration(r.id), 'Sign-up cancelled.'); }}>
                              Cancel
                            </button>
                          )}
                          {closed && !r && <span className="small faint">Sign-ups closed</span>}
                        </span>
                      </li>
                    );
                  })}
              </ul>
            </Card>
          );
        })
      )}
      {signup && (
        <FormModal
          open
          onClose={() => setSignup(null)}
          title={`Sign up: ${signup.e.name}`}
          subtitle={db.dancers.find((d) => d.id === signup.dancerId)?.firstName}
          size="sm"
          saveLabel="Sign up"
          onSubmit={() => {
            const st = run(() => registerForEvent(signup.e.id, signup.dancerId, signup.answers));
            if (st) {
              run(() => 0, st === 'waitlist' ? 'The event is full — you are on the waiting list.' : signup.e.cost ? `Signed up! ${money(signup.e.cost)} was added to your account.` : 'Signed up!');
              setSignup(null);
            }
          }}
        >
          {signup.e.questions.map((q) => (
            <Field key={q.id} label={q.label} required={q.required}>
              {q.type === 'text' ? (
                <input className="input" value={signup.answers[q.id] ?? ''} onChange={(ev) => setSignup({ ...signup, answers: { ...signup.answers, [q.id]: ev.target.value } })} />
              ) : (
                <select className="input" value={signup.answers[q.id] ?? ''} onChange={(ev) => setSignup({ ...signup, answers: { ...signup.answers, [q.id]: ev.target.value } })}>
                  <option value="">Choose…</option>
                  {(q.type === 'yesno' ? ['Yes', 'No'] : q.options.filter(Boolean)).map((o) => (
                    <option key={o}>{o}</option>
                  ))}
                </select>
              )}
            </Field>
          ))}
          {!signup.e.questions.length && <p>Confirm sign-up{signup.e.cost ? ` — ${money(signup.e.cost)} will be added to your account` : ''}.</p>}
        </FormModal>
      )}
    </>
  );
}

/* =========================================================== registration */

export function RegistrationForm({ familyId, onDone }: { familyId: ID | null; onDone?: () => void }) {
  const db = useDb();
  const run = useRun();
  const year = db.schoolYears.find((y) => y.status === 'planning' && y.registrationStart <= todayStr()) ?? currentYear(db);
  const famDancers = familyId ? db.dancers.filter((d) => d.familyId === familyId) : [];
  const blank = (): RegistrationInput => ({ schoolYearId: year?.id ?? null, kind: 'new', familyId, parent: { firstName: '', lastName: '', email: '', phone: '', relationship: 'Parent' }, address: '', dancer: { firstName: '', lastName: '', birthday: '', clothingSize: '', shoeSize: '', level: '', allergies: '', medicalNotes: '' }, existingDancerId: null, classIds: [], dropClassIds: [], emergency: { name: '', relationship: '', phone: '' }, agreedPolicyIds: [], notes: '' });
  const [f, setF] = useState<RegistrationInput>(blank);
  const [done, setDone] = useState(false);
  const set = (p: Partial<RegistrationInput>) => setF({ ...f, ...p });
  const g = familyId ? db.guardians.find((x) => x.familyId === familyId && x.isPrimary) : undefined;
  const classes = db.classes.filter((c) => c.schoolYearId === f.schoolYearId).sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.startTime.localeCompare(b.startTime));
  const current = f.existingDancerId ? db.enrollments.filter((e) => e.dancerId === f.existingDancerId && e.status !== 'dropped').map((e) => e.classId) : [];
  const policies = db.policies.filter((p) => p.active && p.requiresSignature && p.audience === 'all');
  if (done)
    return (
      <Card>
        <div className="done-box">
          <CheckCircle2 size={36} />
          <h3>Registration received</h3>
          <p>The studio office will review it and confirm by email{familyId ? ' and in your Parent Portal' : ''}.</p>
          <button className="btn btn-ghost" onClick={() => (setF(blank()), setDone(false))}>
            Register another dancer
          </button>
        </div>
      </Card>
    );
  if (!year) return <EmptyState title="Registration isn't open" message="Please check back soon or contact the studio." />;
  return (
    <form
      className="stack"
      onSubmit={(ev) => {
        ev.preventDefault();
        const payload = familyId && g ? { ...f, parent: { firstName: g.firstName, lastName: g.lastName, email: g.email, phone: g.phone, relationship: g.relationship } } : f;
        if (run(() => submitRegistration(payload), 'Registration sent.')) {
          setDone(true);
          onDone?.();
        }
      }}
    >
      <Card title={`Registration — ${year.name}`}>
        {year.registrationEnd && <p className="small faint">Registration closes {formatDate(year.registrationEnd)}.{db.settings.registrationFee > 0 && ` Registration fee: ${money(db.settings.registrationFee)} per new dancer.`}</p>}
        {familyId && (
          <div className="grid-2">
            <Field label="What would you like to do?">
              <select className="input" value={f.kind} onChange={(e) => set({ kind: e.target.value as 'new' | 'change', existingDancerId: null, classIds: [], dropClassIds: [] })}>
                <option value="new">Register a dancer for classes</option>
                <option value="change">Add or drop classes for a current dancer</option>
              </select>
            </Field>
            <Field label="Dancer">
              <select className="input" value={f.existingDancerId ?? ''} onChange={(e) => set({ existingDancerId: e.target.value || null })}>
                {f.kind === 'new' && <option value="">A new dancer</option>}
                {f.kind === 'change' && <option value="">Choose…</option>}
                {famDancers.map((d) => (
                  <option key={d.id} value={d.id}>
                    {fullName(d)}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        )}
      </Card>
      {!familyId && (
        <Card title="Parent / guardian">
          <div className="grid-2">
            <Field label="First name" required>
              <input className="input" value={f.parent.firstName} onChange={(e) => set({ parent: { ...f.parent, firstName: e.target.value } })} />
            </Field>
            <Field label="Last name" required>
              <input className="input" value={f.parent.lastName} onChange={(e) => set({ parent: { ...f.parent, lastName: e.target.value } })} />
            </Field>
            <Field label="Email" required>
              <input className="input" type="email" value={f.parent.email} onChange={(e) => set({ parent: { ...f.parent, email: e.target.value } })} />
            </Field>
            <Field label="Phone" required>
              <input className="input" type="tel" value={f.parent.phone} onChange={(e) => set({ parent: { ...f.parent, phone: e.target.value } })} />
            </Field>
            <Field label="Relationship">
              <input className="input" value={f.parent.relationship} onChange={(e) => set({ parent: { ...f.parent, relationship: e.target.value } })} />
            </Field>
            <Field label="Address">
              <input className="input" value={f.address} onChange={(e) => set({ address: e.target.value })} />
            </Field>
          </div>
          <h4 className="mini-head">Emergency contact (not the parent above)</h4>
          <div className="grid-3">
            <Field label="Name">
              <input className="input" value={f.emergency.name} onChange={(e) => set({ emergency: { ...f.emergency, name: e.target.value } })} />
            </Field>
            <Field label="Relationship">
              <input className="input" value={f.emergency.relationship} onChange={(e) => set({ emergency: { ...f.emergency, relationship: e.target.value } })} />
            </Field>
            <Field label="Phone" required>
              <input className="input" type="tel" value={f.emergency.phone} onChange={(e) => set({ emergency: { ...f.emergency, phone: e.target.value } })} />
            </Field>
          </div>
        </Card>
      )}
      {f.kind === 'new' && !f.existingDancerId && (
        <Card title="Dancer">
          <div className="grid-3">
            <Field label="First name" required>
              <input className="input" value={f.dancer.firstName} onChange={(e) => set({ dancer: { ...f.dancer, firstName: e.target.value } })} />
            </Field>
            <Field label="Last name" required>
              <input className="input" value={f.dancer.lastName} onChange={(e) => set({ dancer: { ...f.dancer, lastName: e.target.value } })} />
            </Field>
            <Field label="Birthday" required>
              <input className="input" type="date" value={f.dancer.birthday} onChange={(e) => set({ dancer: { ...f.dancer, birthday: e.target.value } })} />
            </Field>
            <Field label="Clothing size">
              <select className="input" value={f.dancer.clothingSize} onChange={(e) => set({ dancer: { ...f.dancer, clothingSize: e.target.value } })}>
                <option value="">—</option>
                {db.settings.sizes.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </Field>
            <Field label="Shoe size">
              <input className="input" value={f.dancer.shoeSize} onChange={(e) => set({ dancer: { ...f.dancer, shoeSize: e.target.value } })} />
            </Field>
            <Field label="Experience / level">
              <select className="input" value={f.dancer.level} onChange={(e) => set({ dancer: { ...f.dancer, level: e.target.value } })}>
                <option value="">Not sure</option>
                {db.settings.levels.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </Field>
          </div>
          <div className="grid-2">
            <Field label="Allergies">
              <input className="input" value={f.dancer.allergies} onChange={(e) => set({ dancer: { ...f.dancer, allergies: e.target.value } })} />
            </Field>
            <Field label="Medical notes">
              <input className="input" value={f.dancer.medicalNotes} onChange={(e) => set({ dancer: { ...f.dancer, medicalNotes: e.target.value } })} />
            </Field>
          </div>
        </Card>
      )}
      <Card title="Classes">
        <CheckList
          options={classes
            .filter((c) => !current.includes(c.id))
            .map((c) => {
              const n = db.enrollments.filter((e) => e.classId === c.id && e.status === 'enrolled').length;
              return { value: c.id, label: c.name, hint: `${classWhen(c)}${c.ageMin || c.ageMax ? ` · ages ${c.ageMin ?? ''}–${c.ageMax ?? ''}` : ''}${c.tuition ? ` · ${money(c.tuition)}/mo` : ''} · ${n >= c.maxEnrollment ? 'Full — waiting list' : `${c.maxEnrollment - n} spots`}` };
            })}
          selected={new Set(f.classIds)}
          onChange={(s) => set({ classIds: [...s] })}
          height={260}
        />
        {f.kind === 'change' && current.length > 0 && (
          <>
            <h4 className="mini-head">Drop a class</h4>
            <CheckList options={current.map((c) => ({ value: c, label: db.classes.find((x) => x.id === c)?.name ?? '' }))} selected={new Set(f.dropClassIds)} onChange={(s) => set({ dropClassIds: [...s] })} height={120} />
          </>
        )}
      </Card>
      {f.kind === 'new' && policies.length > 0 && (
        <Card title="Studio policies">
          {policies.map((p) => (
            <details key={p.id} className="policy-agree">
              <summary>
                <label className="check-inline" onClick={(e) => e.stopPropagation()}>
                  <input type="checkbox" checked={f.agreedPolicyIds.includes(p.id)} onChange={(e) => set({ agreedPolicyIds: e.target.checked ? [...f.agreedPolicyIds, p.id] : f.agreedPolicyIds.filter((x) => x !== p.id) })} /> I have read and agree to the <strong>{p.title}</strong>
                </label>
              </summary>
              <div className="policy-text prewrap small">{currentVersion(p).body}</div>
            </details>
          ))}
        </Card>
      )}
      <Card>
        <Field label="Anything we should know?">
          <textarea className="input" rows={2} value={f.notes} onChange={(e) => set({ notes: e.target.value })} />
        </Field>
        <button type="submit" className="btn btn-primary">
          <ClipboardSignature size={16} /> Submit registration
        </button>
      </Card>
    </form>
  );
}

export function ParentRegisterPage() {
  const { db, familyId } = useFamilyCtx();
  if (!familyId) return <NoFamily />;
  const mine = db.registrations.filter((r) => r.familyId === familyId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return (
    <>
      <PageHeader title="Registration & Class Changes" subtitle="Register a new dancer or request class changes — the office confirms each request" />
      {mine.length > 0 && (
        <Card title="My requests">
          <ul className="mini-list">
            {mine.map((r) => (
              <li key={r.id}>
                <div>
                  <strong>{r.existingDancerId ? db.dancers.find((d) => d.id === r.existingDancerId)?.firstName : r.dancer.firstName}</strong> <span className="small faint">· {r.classIds.map((c) => db.classes.find((x) => x.id === c)?.name).join(', ')}</span>
                  <div className="small faint">
                    Sent {formatDateTime(r.createdAt)}
                    {r.reviewNote && ` · ${r.reviewNote}`}
                  </div>
                </div>
                <Badge tone={r.status === 'approved' ? 'ready' : r.status === 'denied' ? 'danger' : 'progress'}>{{ pending: 'Waiting for the office', approved: 'Approved', denied: 'Not approved' }[r.status]}</Badge>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <RegistrationForm familyId={familyId} />
    </>
  );
}

/** Public registration page (no login) — reached from the website. */
export function PublicRegisterPage() {
  const db = useDb();
  return (
    <div className="public-wrap">
      <header className="public-head">
        <a href="/site">{db.settings.studioName}</a>
      </header>
      <h1 className="public-title">Online Registration</h1>
      <RegistrationForm familyId={null} />
      <p className="small faint center">Already a studio family? Log in to the Parent Portal to register so your details are filled in.</p>
    </div>
  );
}

/* ============================================================== policies */

export function ParentPoliciesPage() {
  const { db, familyId, guardian } = useFamilyCtx();
  const run = useRun();
  const [open, setOpen] = useState<ID | null>(null);
  const [name, setName] = useState('');
  const [agree, setAgree] = useState(false);
  if (!familyId) return <NoFamily />;
  const list = familyPolicies(db, familyId).filter((x) => x.policy.active);
  const p = list.find((x) => x.policy.id === open)?.policy;
  return (
    <>
      <PageHeader title="Policies & Forms" subtitle="Read and sign studio policies, waivers and agreements" />
      {!list.length ? (
        <EmptyState icon={<FileSignature size={28} />} title="Nothing to sign" />
      ) : (
        <Card>
          <ul className="mini-list">
            {list.map(({ policy, status }) => (
              <li key={policy.id}>
                <div>
                  <strong>{policy.title}</strong> <span className="small faint">· {policy.category} · v{currentVersion(policy).version}</span>
                  {policy.deadline && status !== 'signed' && <div className="small faint">Please sign by {formatDate(policy.deadline)}</div>}
                </div>
                <span className="row-actions">
                  <Badge tone={status === 'signed' ? 'ready' : status === 'overdue' ? 'danger' : status === 'missing' ? 'progress' : 'neutral'}>{{ signed: 'Signed', missing: 'Needs signature', overdue: 'Overdue', not_required: 'For your information' }[status]}</Badge>
                  <button className={`btn btn-sm ${status === 'missing' || status === 'overdue' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => (setOpen(policy.id), setName(guardian ? `${guardian.firstName} ${guardian.lastName}` : ''), setAgree(false))}>
                    {status === 'missing' || status === 'overdue' ? 'Read & sign' : 'Read'}
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {p && (
        <FormModal
          open
          onClose={() => setOpen(null)}
          title={p.title}
          subtitle={`Version ${currentVersion(p).version}`}
          size="lg"
          saveLabel={list.find((x) => x.policy.id === p.id)?.status === 'signed' || !p.requiresSignature ? 'Close' : 'Sign'}
          onSubmit={() => {
            const st = list.find((x) => x.policy.id === p.id)?.status;
            if (st === 'signed' || !p.requiresSignature) return setOpen(null);
            if (!agree) return run(() => { throw new Error('Tick the box to confirm you agree.'); });
            if (run(() => (signPolicy(p.id, familyId, guardian?.id ?? null, name, 'typed'), true), 'Signed — thank you.')) setOpen(null);
          }}
        >
          <div className="policy-text prewrap">{currentVersion(p).body}</div>
          {p.requiresSignature && list.find((x) => x.policy.id === p.id)?.status !== 'signed' && (
            <div className="sign-box">
              <label className="check-inline">
                <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} /> I have read and agree to this policy on behalf of my family.
              </label>
              <Field label="Type your full name as your signature" required>
                <input className="input signature" value={name} onChange={(e) => setName(e.target.value)} />
              </Field>
              <p className="small faint">Your name, the date/time and the policy version are saved with your signature.</p>
            </div>
          )}
        </FormModal>
      )}
    </>
  );
}

/* =========================================================== fundraisers */

export function ParentFundraisersPage() {
  const { db, familyId } = useFamilyCtx();
  const [open, setOpen] = useState<Fundraiser | null>(null);
  if (!familyId) return <NoFamily />;
  const list = db.fundraisers.filter((f) => f.status === 'open' || db.fundraiserTransactions.some((t) => t.fundraiserId === f.id && t.familyId === familyId));
  return (
    <>
      <PageHeader title="Fundraisers" subtitle="Donate, order products and see your dancer's progress" />
      {!list.length && <EmptyState icon={<HandCoins size={28} />} title="No fundraisers right now" />}
      <div className="card-grid">
        {list.map((f) => {
          const mine = db.fundraiserTransactions.filter((t) => t.fundraiserId === f.id && t.familyId === familyId);
          const raised = fundraiserRaised(db, f.id);
          return (
            <Card key={f.id} title={f.name} icon={<HandCoins size={18} />}>
              {f.description && <p className="small prewrap">{f.description}</p>}
              {f.goal > 0 && (
                <div className="progress-wrap">
                  <Progress value={raised} max={f.goal} label="Studio progress" />
                  <p className="small">
                    Studio total {money(raised)} of {money(f.goal)}
                  </p>
                </div>
              )}
              <p className="small">
                Your family: <strong>{money(mine.reduce((s, t) => s + t.amount, 0))}</strong> · {mine.length} donation{mine.length === 1 ? '' : 's'} / order{mine.length === 1 ? '' : 's'}
              </p>
              {f.requirements && <p className="small faint">{f.requirements}</p>}
              <p className="small faint">Ends {formatDate(f.endDate)}</p>
              {f.status === 'open' && (
                <button className="btn btn-primary btn-sm" onClick={() => setOpen(f)}>
                  {f.items.length ? 'Order or donate' : 'Donate'}
                </button>
              )}
            </Card>
          );
        })}
      </div>
      {open && <FundraiserEntryDialog open fundraiser={open} familyId={familyId} onClose={() => setOpen(null)} />}
    </>
  );
}

/* ================================================================ tickets */

export function ParentTicketsPage() {
  const { db, familyId, guardian } = useFamilyCtx();
  const [buying, setBuying] = useState<TicketedEvent | null>(null);
  if (!familyId) return <NoFamily />;
  const today = todayStr();
  const onSale = db.ticketEvents.filter((e) => e.status === 'on_sale' && (!e.salesClose || e.salesClose >= today) && e.date >= today);
  const orders = db.ticketOrders.filter((o) => o.familyId === familyId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return (
    <>
      <PageHeader title="Tickets" subtitle="Buy recital and show tickets and see the ones you've bought" />
      <Card title="On sale" icon={<Ticket size={18} />}>
        {!onSale.length ? (
          <p className="faint pad">No tickets on sale right now.</p>
        ) : (
          <ul className="mini-list">
            {onSale.map((e) => (
              <li key={e.id}>
                <div>
                  <strong>{e.name}</strong>
                  <div className="small faint">
                    {formatDate(e.date)} {formatTime(e.time)} · {e.venue} · {e.types.filter((t) => t.category !== 'comp' && t.category !== 'staff').map((t) => `${t.name} ${money(t.price)}`).join(' · ')}
                  </div>
                  {e.salesOpen > today && <div className="small">Sales open {formatDate(e.salesOpen)}</div>}
                </div>
                <button className="btn btn-primary btn-sm" disabled={e.salesOpen > today} onClick={() => setBuying(e)}>
                  Buy tickets
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card title="My tickets">
        {!orders.length ? (
          <p className="faint pad">No tickets yet.</p>
        ) : (
          <ul className="ticket-list">
            {orders.map((o) => {
              const e = db.ticketEvents.find((x) => x.id === o.ticketEventId);
              return (
                <li key={o.id} className={`ticket-stub ${o.status !== 'paid' ? 'void' : ''}`}>
                  <div>
                    <strong>{e?.name}</strong>
                    <div className="small">
                      {e && `${formatDate(e.date)} ${formatTime(e.time)} · ${e.venue}`}
                    </div>
                    <div className="small">
                      {o.lines.map((l) => `${l.qty} × ${e?.types.find((t) => t.id === l.typeId)?.name}`).join(', ')}
                      {o.seats.length > 0 && ` · Seats ${o.seats.join(', ')}`}
                    </div>
                  </div>
                  <div className="ticket-side">
                    <strong>{money(o.total)}</strong>
                    <span className="small">{o.status === 'paid' ? `Order ${o.id.slice(-6).toUpperCase()}` : o.status === 'refunded' ? 'Refunded' : 'Cancelled'}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <p className="small faint">Show this page (or your order number) at will call.</p>
      </Card>
      {buying && <BuyTicketsDialog open e={buying} familyId={familyId} buyer={{ name: guardian ? `${guardian.firstName} ${guardian.lastName}` : '', email: guardian?.email ?? '' }} onClose={() => setBuying(null)} />}
    </>
  );
}

/** Compact "to do" list for the family dashboard. */
export function FamilyTodoCard({ db, familyId }: { db: Database; familyId: ID }) {
  const today = todayStr();
  const dancers = db.dancers.filter((d) => d.familyId === familyId).map((d) => d.id);
  const unsigned = familyPolicies(db, familyId).filter((x) => x.policy.active && (x.status === 'missing' || x.status === 'overdue'));
  const owed = db.invoices.filter((i) => i.familyId === familyId && i.state === 'sent' && invoiceBalance(db, i) > 0);
  const events = db.signupEvents.filter((e) => e.signupsOpen && (!e.registrationDeadline || e.registrationDeadline >= today) && e.date >= today && dancers.some((d) => eligibleDancers(db, e).includes(d) && !db.eventRegistrations.some((r) => r.eventId === e.id && r.dancerId === d && r.status !== 'cancelled')));
  if (!unsigned.length && !owed.length && !events.length) return null;
  return (
    <Card title="To do" icon={<CheckCircle2 size={18} />}>
      <ul className="mini-list">
        {unsigned.map((x) => (
          <li key={x.policy.id}>
            <span>
              Sign <strong>{x.policy.title}</strong>
              {x.policy.deadline && <span className="small faint"> · by {formatDate(x.policy.deadline)}</span>}
            </span>
            <Link to="/family/policies" className="btn btn-ghost btn-sm">
              Sign
            </Link>
          </li>
        ))}
        {owed.map((i) => (
          <li key={i.id}>
            <span>
              Pay <strong>{i.number}</strong> <span className="small faint">· {i.title} · due {formatDate(i.dueDate)}</span>
            </span>
            <Link to="/family/billing" className="btn btn-ghost btn-sm">
              {money(invoiceBalance(db, i))}
            </Link>
          </li>
        ))}
        {events.map((e) => (
          <li key={e.id}>
            <span>
              Respond to <strong>{e.name}</strong>
              {e.registrationDeadline && <span className="small faint"> · by {formatDate(e.registrationDeadline)}</span>}
            </span>
            <Link to="/family/events" className="btn btn-ghost btn-sm">
              Respond
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}


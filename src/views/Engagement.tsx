import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from '../lib/router';
import { Archive, ArrowRightLeft, CalendarPlus, Check, ClipboardSignature, DollarSign, FileSignature, HandCoins, Megaphone, PartyPopper, Pencil, Plus, Printer, RotateCcw, Ticket, Trash2, Trophy, UserPlus, Users, X } from 'lucide-react';
import { useDb } from '../data/store';
import {
  addFundraiserTransaction,
  approveRegistration,
  archiveTeam,
  buyTickets,
  cancelRegistration,
  deletePolicy,
  deleteFundraiser,
  deleteSignupEvent,
  deleteTeam,
  deleteTicketEvent,
  denyRegistration,
  moveTeamDancers,
  refundTicketOrder,
  registerForEvent,
  saveFundraiser,
  savePolicy,
  saveSignupEvent,
  saveTeam,
  saveTicketEvent,
  setOrderFulfilled,
  setTeamDancers,
  signPolicy,
  type FundraiserInput,
  type PolicyInput,
  type SignupEventInput,
  type TeamInput,
  type TicketEventInput,
} from '../data/engagementActions';
import { batchInvoice } from '../data/financeActions';
import { currentVersion, eligibleDancers, eventCounts, fundraiserRaised, invoiceStatus, invoiceStatusLabels, policyStatusForFamily, takenSeats, ticketsSold } from '../data/platform';
import { formatDate, formatDateTime, formatTime, fullName } from '../data/selectors';
import { staffName } from '../data/studio';
import { newId, todayStr } from '../data/ids';
import { Badge, Card, CheckList, DataTable, EmptyState, Field, PageHeader, SampleTag, SearchSelect, StatCard, Tabs, type Option } from '../components/ui';
import { FormModal } from '../components/forms';
import { useConfirm, useRun, useToast } from '../components/feedback';
import { classOptions, currentYear, money, useStaffOptions } from '../components/studioUi';
import { Progress } from '../components/charts';
import { openPrint } from './Print';
import { useViewer } from '../lib/session';
import type { Database, EventQuestion, Fundraiser, ID, Policy, RegistrationRequest, SignupEvent, SignupEventType, TicketedEvent, TicketType } from '../data/types';

export const eventTypeLabels: Record<SignupEventType, string> = { recital: 'Recital', competition: 'Competition', convention: 'Convention', workshop: 'Workshop', master_class: 'Master class', fundraiser: 'Fundraiser', party: 'Party', picture_day: 'Picture day', rehearsal: 'Rehearsal', audition: 'Audition', camp: 'Camp', community: 'Community performance', other: 'Other' };
const dancerOpts = (db: Database, only?: ID[]): Option[] =>
  db.dancers
    .filter((d) => !only || only.includes(d.id))
    .sort((a, b) => a.lastName.localeCompare(b.lastName))
    .map((d) => ({ value: d.id, label: fullName(d), hint: [d.level, db.families.find((f) => f.id === d.familyId)?.name].filter(Boolean).join(' · ') }));
const useEdit = () => useViewer().can('events.manage');

function Info({ items }: { items: [string, React.ReactNode][] }) {
  return (
    <dl className="dl">
      {items
        .filter(([, v]) => v !== '' && v !== null && v !== undefined && v !== false)
        .map(([k, v]) => (
          <div key={k} className="dl-row">
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
    </dl>
  );
}

/* ================================================================ teams */

export function TeamsPage() {
  const db = useDb();
  const edit = useEdit();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const list = db.teams.filter((t) => t.archived === showArchived);
  return (
    <>
      <PageHeader
        title="Teams & Companies"
        subtitle="Competition teams, performing companies and their rosters"
        actions={
          <>
            <button className="btn btn-ghost" onClick={() => setShowArchived(!showArchived)}>
              <Archive size={16} /> {showArchived ? 'Active teams' : `Archived (${db.teams.filter((t) => t.archived).length})`}
            </button>
            {edit && (
              <button className="btn btn-primary" onClick={() => setCreating(true)}>
                <Plus size={16} /> New team
              </button>
            )}
          </>
        }
      />
      {!list.length ? (
        <EmptyState icon={<Trophy size={28} />} title={showArchived ? 'No archived teams' : 'No teams yet'} message="Create a competition team or company, add dancers, coaches and schedules." />
      ) : (
        <div className="card-grid">
          {list.map((t) => (
            <Link key={t.id} to={`/teams/${t.id}`} className="card tile-link">
              <div className="tile-head">
                <h3>{t.name}</h3>
                {t.fee > 0 && <Badge tone="info">{money(t.fee)}</Badge>}
              </div>
              {t.description && <p className="small faint clamp-2">{t.description}</p>}
              <div className="tile-stats">
                <span>
                  <strong>{t.dancerIds.length}</strong> dancers
                </span>
                <span>
                  <strong>{t.teacherIds.length}</strong> coaches
                </span>
              </div>
              <SampleTag show={t.isSample} />
            </Link>
          ))}
        </div>
      )}
      <TeamForm open={creating} onClose={() => setCreating(false)} onSaved={(id) => navigate(`/teams/${id}`)} />
    </>
  );
}

function TeamForm({ open, onClose, id, onSaved }: { open: boolean; onClose: () => void; id?: ID; onSaved?: (id: ID) => void }) {
  const db = useDb();
  const run = useRun();
  const staff = useStaffOptions();
  const blank = (): TeamInput => ({ name: '', description: '', schoolYearId: currentYear(db)?.id ?? null, dancerIds: [], teacherIds: [], classIds: [], requirements: '', rehearsalSchedule: '', competitionSchedule: '', fee: 0, feeNotes: '', notes: '', archived: false });
  const [f, setF] = useState<TeamInput>(blank);
  const [last, setLast] = useState<string | null>(null);
  const key = open ? id ?? 'new' : null;
  if (key !== last) {
    setLast(key);
    if (open) {
      const t = id ? db.teams.find((x) => x.id === id) : undefined;
      setF(t ? { ...blank(), ...t } : blank());
    }
  }
  const set = (p: Partial<TeamInput>) => setF({ ...f, ...p });
  return (
    <FormModal open={open} onClose={onClose} title={id ? 'Edit Team' : 'New Team'} size="lg" onSubmit={() => { const s = run(() => saveTeam(f, id), 'Team saved.'); if (s) { onClose(); onSaved?.(s); } }}>
      <div className="grid-2">
        <Field label="Team name" required>
          <input className="input" value={f.name} onChange={(e) => set({ name: e.target.value })} autoFocus />
        </Field>
        <Field label="School year">
          <select className="input" value={f.schoolYearId ?? ''} onChange={(e) => set({ schoolYearId: e.target.value || null })}>
            <option value="">—</option>
            {db.schoolYears.map((y) => (
              <option key={y.id} value={y.id}>
                {y.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Team fee ($)">
          <input className="input" type="number" min={0} step="0.01" value={f.fee} onChange={(e) => set({ fee: Number(e.target.value) })} />
        </Field>
        <Field label="Fee notes">
          <input className="input" value={f.feeNotes} onChange={(e) => set({ feeNotes: e.target.value })} placeholder="e.g. Due in 3 payments" />
        </Field>
      </div>
      <Field label="Description">
        <textarea className="input" rows={2} value={f.description} onChange={(e) => set({ description: e.target.value })} />
      </Field>
      <div className="grid-2">
        <div className="field">
          <span className="field-label">Coaches</span>
          <CheckList options={staff} selected={new Set(f.teacherIds)} onChange={(s) => set({ teacherIds: [...s] })} height={150} />
        </div>
        <div className="field">
          <span className="field-label">Related classes</span>
          <CheckList options={classOptions(db, f.schoolYearId)} selected={new Set(f.classIds)} onChange={(s) => set({ classIds: [...s] })} height={150} />
        </div>
      </div>
      <Field label="Requirements">
        <textarea className="input" rows={2} value={f.requirements} onChange={(e) => set({ requirements: e.target.value })} />
      </Field>
      <Field label="Rehearsal schedule">
        <textarea className="input" rows={2} value={f.rehearsalSchedule} onChange={(e) => set({ rehearsalSchedule: e.target.value })} />
      </Field>
      <Field label="Competition schedule">
        <textarea className="input" rows={2} value={f.competitionSchedule} onChange={(e) => set({ competitionSchedule: e.target.value })} />
      </Field>
      <Field label="Internal notes">
        <textarea className="input" rows={2} value={f.notes} onChange={(e) => set({ notes: e.target.value })} />
      </Field>
    </FormModal>
  );
}

export function TeamDetailPage() {
  const { id } = useParams();
  const db = useDb();
  const edit = useEdit();
  const run = useRun();
  const toast = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState<Set<ID> | null>(null);
  const [sel, setSel] = useState<Set<ID>>(new Set());
  const [moveTo, setMoveTo] = useState<string | null>(null);
  const t = db.teams.find((x) => x.id === id);
  if (!t) return <EmptyState title="Team not found" action={<Link to="/teams" className="btn btn-primary">All teams</Link>} />;
  const dancers = t.dancerIds.map((d) => db.dancers.find((x) => x.id === d)).filter(Boolean).sort((a, b) => a!.lastName.localeCompare(b!.lastName));
  const invoiceFee = () => {
    const r = run(() => batchInvoice({ title: `${t.name} team fee`, source: 'company', sourceId: t.id, schoolYearId: t.schoolYearId, dancerIds: t.dancerIds, lines: [{ description: `${t.name} team fee`, category: 'Competition', unitPrice: t.fee }], dueDate: todayStr(), notes: t.feeNotes, send: true, siblingDiscount: false }));
    if (r) toast.success(`${r.invoices} invoice(s) sent.${r.skipped.length ? ` Skipped (no family): ${r.skipped.join(', ')}` : ''}`);
  };
  return (
    <>
      <PageHeader
        back={{ to: '/teams', label: 'Teams' }}
        title={
          <>
            {t.name} {t.archived && <Badge>Archived</Badge>} <SampleTag show={t.isSample} />
          </>
        }
        subtitle={t.description}
        actions={
          <>
            <button className="btn btn-ghost" onClick={() => openPrint('team', { id: t.id })}>
              <Printer size={16} /> Roster
            </button>
            {edit && (
              <>
                <button className="btn btn-ghost" onClick={() => run(() => archiveTeam(t.id, !t.archived), t.archived ? 'Team restored.' : 'Team archived.')}>
                  <Archive size={16} /> {t.archived ? 'Restore' : 'Archive'}
                </button>
                <button className="btn btn-ghost danger" onClick={async () => { if (await confirm({ title: `Delete ${t.name}?`, message: 'The roster is deleted. Dancers are not affected.', confirmLabel: 'Delete', danger: true })) if (run(() => (deleteTeam(t.id), true), 'Team deleted.')) navigate('/teams'); }}>
                  <Trash2 size={16} /> Delete
                </button>
                {t.fee > 0 && (
                  <button className="btn btn-ghost" onClick={async () => { if (await confirm({ title: 'Invoice team fee?', message: `${money(t.fee)} for each of ${t.dancerIds.length} dancers, one invoice per family.`, confirmLabel: 'Send invoices' })) invoiceFee(); }}>
                    <DollarSign size={16} /> Invoice fee
                  </button>
                )}
                <button className="btn btn-primary" onClick={() => setEditing(true)}>
                  <Pencil size={16} /> Edit
                </button>
              </>
            )}
          </>
        }
      />
      <div className="detail-grid wide-right">
        <div className="stack">
          <Card title="Team details">
            <Info
              items={[
                ['Coaches', t.teacherIds.map((s) => staffName(db.staff.find((x) => x.id === s))).join(', ') || '—'],
                ['School year', db.schoolYears.find((y) => y.id === t.schoolYearId)?.name ?? '—'],
                ['Fee', t.fee ? `${money(t.fee)}${t.feeNotes ? ` · ${t.feeNotes}` : ''}` : 'None'],
                ['Classes', t.classIds.map((c) => db.classes.find((x) => x.id === c)?.name).filter(Boolean).join(', ')],
              ]}
            />
            {t.requirements && <p className="small prewrap"><strong>Requirements:</strong> {t.requirements}</p>}
            {t.rehearsalSchedule && <p className="small prewrap"><strong>Rehearsals:</strong> {t.rehearsalSchedule}</p>}
            {t.competitionSchedule && <p className="small prewrap"><strong>Competitions:</strong> {t.competitionSchedule}</p>}
            {t.notes && <p className="small prewrap faint">{t.notes}</p>}
          </Card>
          <Card title="Events for this team">
            <ul className="mini-list">
              {db.signupEvents.filter((e) => e.teamIds.includes(t.id)).map((e) => (
                <li key={e.id}>
                  <Link to={`/events/${e.id}`}>{e.name}</Link>
                  <span className="small faint">{formatDate(e.date)}</span>
                </li>
              ))}
              {!db.signupEvents.some((e) => e.teamIds.includes(t.id)) && <li className="small faint">None.</li>}
            </ul>
          </Card>
        </div>
        <Card
          title={`Roster (${dancers.length})`}
          icon={<Users size={18} />}
          actions={
            edit && (
              <button className="btn btn-primary btn-sm" onClick={() => setAdding(new Set())}>
                <UserPlus size={14} /> Add dancers
              </button>
            )
          }
        >
          {edit && sel.size > 0 && (
            <div className="bulk-bar">
              <span>{sel.size} selected</span>
              <button className="btn btn-ghost btn-sm" onClick={() => setMoveTo('')}>
                <ArrowRightLeft size={13} /> Move to team…
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => (run(() => setTeamDancers(t.id, [], [...sel]), 'Removed from the team.'), setSel(new Set()))}>
                <X size={13} /> Remove
              </button>
            </div>
          )}
          {!dancers.length ? (
            <p className="faint pad">No dancers on this team yet.</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  {edit && <th />}
                  <th>Dancer</th>
                  <th>Level</th>
                  <th>Family</th>
                  <th className="minor">Fee</th>
                </tr>
              </thead>
              <tbody>
                {dancers.map((d) => {
                  const inv = db.invoices.find((i) => i.source === 'company' && i.sourceId === t.id && i.state !== 'void' && i.lines.some((l) => l.dancerId === d!.id));
                  return (
                    <tr key={d!.id}>
                      {edit && (
                        <td>
                          <input type="checkbox" aria-label={`Select ${fullName(d!)}`} checked={sel.has(d!.id)} onChange={(e) => { const n = new Set(sel); if (e.target.checked) n.add(d!.id); else n.delete(d!.id); setSel(n); }} />
                        </td>
                      )}
                      <td>
                        <Link to={`/dancers/${d!.id}`} className="link-strong">
                          {fullName(d!)}
                        </Link>
                      </td>
                      <td>{d!.level}</td>
                      <td>{db.families.find((f) => f.id === d!.familyId)?.name ?? '—'}</td>
                      <td className="minor">{inv ? <Link to={`/invoices/${inv.id}`}>{invoiceStatusLabels[invoiceStatus(db, inv)]}</Link> : <span className="faint">—</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Card>
      </div>
      <TeamForm open={editing} id={t.id} onClose={() => setEditing(false)} />
      {adding && (
        <FormModal open onClose={() => setAdding(null)} title="Add Dancers" saveLabel={`Add ${adding.size}`} onSubmit={() => run(() => setTeamDancers(t.id, [...adding], []), 'Roster updated.') !== undefined && setAdding(null)}>
          <CheckList options={dancerOpts(db).filter((o) => !t.dancerIds.includes(o.value))} selected={adding} onChange={setAdding} />
        </FormModal>
      )}
      {moveTo !== null && (
        <FormModal open onClose={() => setMoveTo(null)} title="Move Dancers" size="sm" saveLabel="Move" onSubmit={() => run(() => moveTeamDancers(t.id, moveTo, [...sel]), 'Dancers moved.') !== undefined && (setMoveTo(null), setSel(new Set()))}>
          <Field label="Move to">
            <select className="input" value={moveTo} onChange={(e) => setMoveTo(e.target.value)}>
              <option value="">Choose…</option>
              {db.teams.filter((x) => x.id !== t.id && !x.archived).map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          </Field>
        </FormModal>
      )}
    </>
  );
}

/* =============================================================== events */

export function EventsPage() {
  const db = useDb();
  const edit = useEdit();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const [past, setPast] = useState(false);
  const today = todayStr();
  const list = db.signupEvents.filter((e) => (past ? (e.endDate || e.date) < today : (e.endDate || e.date) >= today)).sort((a, b) => (past ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date)));
  return (
    <>
      <PageHeader
        title="Events & Sign-ups"
        subtitle="Competitions, workshops, parties, picture day… with eligibility, deadlines, capacity and waiting lists"
        actions={
          <>
            <button className="btn btn-ghost" onClick={() => setPast(!past)}>
              {past ? 'Upcoming events' : 'Past events'}
            </button>
            {edit && (
              <button className="btn btn-primary" onClick={() => setCreating(true)}>
                <CalendarPlus size={16} /> New event
              </button>
            )}
          </>
        }
      />
      <Card>
        <DataTable
          rows={list}
          getId={(e) => e.id}
          empty={<EmptyState icon={<PartyPopper size={28} />} title={past ? 'No past events' : 'No upcoming events'} />}
          columns={[
            { key: 'n', header: 'Event', render: (e) => <><Link to={`/events/${e.id}`} className="link-strong">{e.name}</Link> <SampleTag show={e.isSample} /><div className="small faint">{eventTypeLabels[e.type]}{e.location && ` · ${e.location}`}</div></>, sortValue: (e) => e.name },
            { key: 'd', header: 'Date', render: (e) => <>{formatDate(e.date)}{e.startTime && <div className="small faint">{formatTime(e.startTime)}</div>}</>, sortValue: (e) => e.date },
            { key: 'dl', header: 'Deadline', render: (e) => formatDate(e.registrationDeadline) || '—', sortValue: (e) => e.registrationDeadline, minor: true },
            { key: 'c', header: 'Cost', render: (e) => (e.cost ? money(e.cost) : 'Free'), sortValue: (e) => e.cost, minor: true },
            { key: 'r', header: 'Signed up', render: (e) => { const c = eventCounts(db, e.id); return <>{c.registered}{e.capacity ? ` / ${e.capacity}` : ''}{c.waitlist > 0 && <span className="small faint"> · {c.waitlist} waiting</span>}</>; }, sortValue: (e) => eventCounts(db, e.id).registered },
            { key: 's', header: 'Sign-ups', render: (e) => <Badge tone={e.signupsOpen ? 'ready' : 'neutral'}>{e.signupsOpen ? 'Open' : 'Closed'}</Badge> },
          ]}
        />
      </Card>
      <EventForm open={creating} onClose={() => setCreating(false)} onSaved={(id) => navigate(`/events/${id}`)} />
    </>
  );
}

function EventForm({ open, onClose, id, onSaved }: { open: boolean; onClose: () => void; id?: ID; onSaved?: (id: ID) => void }) {
  const db = useDb();
  const run = useRun();
  const blank = (): SignupEventInput => ({ name: '', type: 'workshop', description: '', date: '', endDate: '', startTime: '', endTime: '', location: '', address: '', registrationDeadline: '', eligibility: 'all', classIds: [], teamIds: [], dancerIds: [], cost: 0, capacity: 0, signupsOpen: true, questions: [], notes: '' });
  const [f, setF] = useState<SignupEventInput>(blank);
  const [last, setLast] = useState<string | null>(null);
  const key = open ? id ?? 'new' : null;
  if (key !== last) {
    setLast(key);
    if (open) {
      const e = id ? db.signupEvents.find((x) => x.id === id) : undefined;
      setF(e ? { ...blank(), ...e, questions: e.questions.map((q) => ({ ...q })) } : blank());
    }
  }
  const set = (p: Partial<SignupEventInput>) => setF({ ...f, ...p });
  const setQ = (qid: ID, p: Partial<EventQuestion>) => set({ questions: f.questions.map((q) => (q.id === qid ? { ...q, ...p } : q)) });
  return (
    <FormModal open={open} onClose={onClose} title={id ? 'Edit Event' : 'New Event'} size="lg" onSubmit={() => { const s = run(() => saveSignupEvent(f, id), 'Event saved.'); if (s) { onClose(); onSaved?.(s); } }}>
      <div className="grid-2">
        <Field label="Event name" required>
          <input className="input" value={f.name} onChange={(e) => set({ name: e.target.value })} autoFocus />
        </Field>
        <Field label="Type">
          <select className="input" value={f.type} onChange={(e) => set({ type: e.target.value as SignupEventType })}>
            {Object.entries(eventTypeLabels).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Date" required>
          <input className="input" type="date" value={f.date} onChange={(e) => set({ date: e.target.value })} />
        </Field>
        <Field label="End date (multi-day)">
          <input className="input" type="date" value={f.endDate} onChange={(e) => set({ endDate: e.target.value })} />
        </Field>
        <Field label="Start time">
          <input className="input" type="time" value={f.startTime} onChange={(e) => set({ startTime: e.target.value })} />
        </Field>
        <Field label="End time">
          <input className="input" type="time" value={f.endTime} onChange={(e) => set({ endTime: e.target.value })} />
        </Field>
        <Field label="Location">
          <input className="input" value={f.location} onChange={(e) => set({ location: e.target.value })} />
        </Field>
        <Field label="Address">
          <input className="input" value={f.address} onChange={(e) => set({ address: e.target.value })} />
        </Field>
        <Field label="Registration deadline">
          <input className="input" type="date" value={f.registrationDeadline} onChange={(e) => set({ registrationDeadline: e.target.value })} />
        </Field>
        <Field label="Cost per dancer ($)" hint="Invoiced automatically when a dancer registers.">
          <input className="input" type="number" min={0} step="0.01" value={f.cost} onChange={(e) => set({ cost: Number(e.target.value) })} />
        </Field>
        <Field label="Capacity" hint="0 = unlimited. Extra sign-ups go on a waiting list.">
          <input className="input" type="number" min={0} value={f.capacity} onChange={(e) => set({ capacity: Number(e.target.value) })} />
        </Field>
        <Field label="Who can sign up">
          <select className="input" value={f.eligibility} onChange={(e) => set({ eligibility: e.target.value as SignupEvent['eligibility'] })}>
            <option value="all">All active dancers</option>
            <option value="classes">Dancers in chosen classes</option>
            <option value="teams">Members of chosen teams</option>
            <option value="dancers">Chosen dancers only</option>
          </select>
        </Field>
      </div>
      {f.eligibility === 'classes' && (
        <div className="field">
          <span className="field-label">Classes</span>
          <CheckList options={classOptions(db)} selected={new Set(f.classIds)} onChange={(s) => set({ classIds: [...s] })} height={160} />
        </div>
      )}
      {f.eligibility === 'teams' && (
        <div className="field">
          <span className="field-label">Teams</span>
          <CheckList options={db.teams.filter((t) => !t.archived).map((t) => ({ value: t.id, label: t.name }))} selected={new Set(f.teamIds)} onChange={(s) => set({ teamIds: [...s] })} height={140} />
        </div>
      )}
      {f.eligibility === 'dancers' && (
        <div className="field">
          <span className="field-label">Dancers</span>
          <CheckList options={dancerOpts(db)} selected={new Set(f.dancerIds)} onChange={(s) => set({ dancerIds: [...s] })} height={180} />
        </div>
      )}
      <Field label="Description (shown to families)">
        <textarea className="input" rows={3} value={f.description} onChange={(e) => set({ description: e.target.value })} />
      </Field>
      <div className="field">
        <span className="field-label">Sign-up questions</span>
        {f.questions.map((q) => (
          <div key={q.id} className="line-row q-row">
            <input className="input" placeholder="Question" value={q.label} onChange={(e) => setQ(q.id, { label: e.target.value })} aria-label="Question" />
            <select className="input" value={q.type} onChange={(e) => setQ(q.id, { type: e.target.value as EventQuestion['type'] })} aria-label="Answer type">
              <option value="text">Text</option>
              <option value="yesno">Yes / No</option>
              <option value="choice">Choice</option>
            </select>
            {q.type === 'choice' ? <input className="input" placeholder="Options, comma separated" value={q.options.join(', ')} onChange={(e) => setQ(q.id, { options: e.target.value.split(',').map((s) => s.trim()) })} aria-label="Options" /> : <span />}
            <label className="check-inline small">
              <input type="checkbox" checked={q.required} onChange={(e) => setQ(q.id, { required: e.target.checked })} /> Required
            </label>
            <button type="button" className="icon-btn" aria-label="Remove question" onClick={() => set({ questions: f.questions.filter((x) => x.id !== q.id) })}>
              <Trash2 size={14} />
            </button>
          </div>
        ))}
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => set({ questions: [...f.questions, { id: newId(), label: '', type: 'text', options: [], required: false }] })}>
          <Plus size={14} /> Add question
        </button>
      </div>
      <label className="check-inline">
        <input type="checkbox" checked={f.signupsOpen} onChange={(e) => set({ signupsOpen: e.target.checked })} /> Sign-ups are open (families can register in the Parent Portal)
      </label>
    </FormModal>
  );
}

export function EventDetailPage() {
  const { id } = useParams();
  const db = useDb();
  const edit = useEdit();
  const run = useRun();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [dancer, setDancer] = useState('');
  const e = db.signupEvents.find((x) => x.id === id);
  if (!e) return <EmptyState title="Event not found" action={<Link to="/events" className="btn btn-primary">All events</Link>} />;
  const regs = db.eventRegistrations.filter((r) => r.eventId === e.id);
  const c = eventCounts(db, e.id);
  const eligible = eligibleDancers(db, e);
  const pending = eligible.filter((d) => !regs.some((r) => r.dancerId === d && r.status !== 'cancelled'));
  const regTone = { registered: 'ready', waitlist: 'progress', declined: 'neutral', cancelled: 'neutral' } as const;
  return (
    <>
      <PageHeader
        back={{ to: '/events', label: 'Events' }}
        title={
          <>
            {e.name} <SampleTag show={e.isSample} />
          </>
        }
        subtitle={`${eventTypeLabels[e.type]} · ${formatDate(e.date)}${e.endDate && e.endDate !== e.date ? ` – ${formatDate(e.endDate)}` : ''}${e.startTime ? ` · ${formatTime(e.startTime)}${e.endTime ? `–${formatTime(e.endTime)}` : ''}` : ''}`}
        actions={
          <>
            <button className="btn btn-ghost" onClick={() => openPrint('event', { id: e.id })}>
              <Printer size={16} /> Sign-up list
            </button>
            {edit && (
              <>
                <button className="btn btn-ghost danger" onClick={async () => { if (await confirm({ title: `Delete ${e.name}?`, message: 'Registrations for this event are deleted too.', confirmLabel: 'Delete', danger: true })) if (run(() => (deleteSignupEvent(e.id), true), 'Event deleted.')) navigate('/events'); }}>
                  <Trash2 size={16} /> Delete
                </button>
                <button className="btn btn-ghost" onClick={() => run(() => saveSignupEvent({ ...e, signupsOpen: !e.signupsOpen }, e.id), e.signupsOpen ? 'Sign-ups closed.' : 'Sign-ups opened.')}>
                  {e.signupsOpen ? 'Close sign-ups' : 'Open sign-ups'}
                </button>
                <button className="btn btn-primary" onClick={() => setEditing(true)}>
                  <Pencil size={16} /> Edit
                </button>
              </>
            )}
          </>
        }
      />
      <div className="stats stats-4">
        <StatCard label="Registered" value={e.capacity ? `${c.registered}/${e.capacity}` : c.registered} icon={<Check size={20} />} tone="sage" />
        <StatCard label="Waiting list" value={c.waitlist} icon={<Users size={20} />} tone="amber" />
        <StatCard label="Declined" value={c.declined} icon={<X size={20} />} tone="slate" />
        <StatCard label="Not yet answered" value={pending.length} icon={<Megaphone size={20} />} tone="plum" hint={`${eligible.length} eligible`} />
      </div>
      <div className="detail-grid wide-right">
        <Card title="Details">
          <Info
            items={[
              ['Location', <>{e.location}{e.address && <div className="small faint">{e.address}</div>}</>],
              ['Deadline', formatDate(e.registrationDeadline)],
              ['Cost', e.cost ? money(e.cost) : 'Free'],
              ['Capacity', e.capacity || 'Unlimited'],
              ['Eligible', { all: 'All active dancers', classes: `Classes: ${e.classIds.map((x) => db.classes.find((c) => c.id === x)?.name).join(', ')}`, teams: `Teams: ${e.teamIds.map((x) => db.teams.find((t) => t.id === x)?.name).join(', ')}`, dancers: `${e.dancerIds.length} chosen dancers` }[e.eligibility]],
              ['Sign-ups', e.signupsOpen ? 'Open' : 'Closed'],
            ]}
          />
          {e.description && <p className="small prewrap">{e.description}</p>}
          {e.questions.length > 0 && (
            <>
              <h4 className="mini-head">Questions</h4>
              <ul className="small">
                {e.questions.map((q) => (
                  <li key={q.id}>
                    {q.label}
                    {q.required && ' *'}
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>
        <Card
          title="Registrations"
          actions={
            edit && (
              <button className="btn btn-primary btn-sm" onClick={() => (setDancer(''), setAdding(true))}>
                <UserPlus size={14} /> Register a dancer
              </button>
            )
          }
        >
          {!regs.length ? (
            <p className="faint pad">No responses yet.</p>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Dancer</th>
                    <th>Status</th>
                    {e.questions.map((q) => (
                      <th key={q.id} className="minor">
                        {q.label}
                      </th>
                    ))}
                    <th>Invoice</th>
                    {edit && <th />}
                  </tr>
                </thead>
                <tbody>
                  {regs.map((r) => {
                    const d = db.dancers.find((x) => x.id === r.dancerId);
                    const inv = db.invoices.find((i) => i.id === r.invoiceId);
                    return (
                      <tr key={r.id}>
                        <td>
                          {d ? <Link to={`/dancers/${d.id}`}>{fullName(d)}</Link> : 'Removed dancer'}
                          <div className="small faint">by {r.by}</div>
                        </td>
                        <td>
                          <Badge tone={regTone[r.status]}>{{ registered: 'Registered', waitlist: 'Waiting list', declined: 'Declined', cancelled: 'Cancelled' }[r.status]}</Badge>
                        </td>
                        {e.questions.map((q) => (
                          <td key={q.id} className="minor small">
                            {r.answers[q.id]}
                          </td>
                        ))}
                        <td className="small">{inv ? <Link to={`/invoices/${inv.id}`}>{inv.number} · {invoiceStatusLabels[invoiceStatus(db, inv)]}</Link> : '—'}</td>
                        {edit && (
                          <td>
                            {(r.status === 'registered' || r.status === 'waitlist') && (
                              <button className="btn btn-ghost btn-sm" onClick={async () => { if (await confirm({ title: 'Cancel registration?', message: 'An unpaid invoice is voided and the next person on the waiting list moves up.', confirmLabel: 'Cancel registration' })) run(() => cancelRegistration(r.id), 'Registration cancelled.'); }}>
                                Cancel
                              </button>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
      <EventForm open={editing} id={e.id} onClose={() => setEditing(false)} />
      {adding && (
        <FormModal open onClose={() => setAdding(false)} title="Register a Dancer" subtitle="Staff can register any dancer, even after the deadline." size="sm" onSubmit={() => run(() => registerForEvent(e.id, dancer, {}, { staff: true })) && setAdding(false)}>
          <Field label="Dancer">
            <SearchSelect ariaLabel="Dancer" value={dancer} onChange={setDancer} options={dancerOpts(db)} />
          </Field>
        </FormModal>
      )}
    </>
  );
}

/* ========================================================== registration */

export function RegistrationsPage() {
  const db = useDb();
  const edit = useEdit();
  const run = useRun();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as RegistrationRequest['status']) || 'pending';
  const [review, setReview] = useState<RegistrationRequest | null>(null);
  const [note, setNote] = useState('');
  const list = db.registrations.filter((r) => r.status === tab).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const name = (r: RegistrationRequest) => (r.existingDancerId ? fullName(db.dancers.find((d) => d.id === r.existingDancerId) ?? { firstName: r.dancer.firstName, lastName: r.dancer.lastName }) : `${r.dancer.firstName} ${r.dancer.lastName}`);
  return (
    <>
      <PageHeader
        title="Registration"
        subtitle="Online registrations and enrollment changes waiting for review"
        actions={
          <a className="btn btn-ghost" href="/register" target="_blank" rel="noreferrer">
            <ClipboardSignature size={16} /> Open public registration form
          </a>
        }
      />
      <Tabs
        value={tab}
        onChange={(t) => setParams(t === 'pending' ? {} : { tab: t }, { replace: true })}
        tabs={[
          { value: 'pending', label: 'Waiting for review', count: db.registrations.filter((r) => r.status === 'pending').length },
          { value: 'approved', label: 'Approved' },
          { value: 'denied', label: 'Denied' },
        ]}
      />
      <Card>
        <DataTable
          rows={list}
          getId={(r) => r.id}
          empty={<EmptyState icon={<ClipboardSignature size={28} />} title="Nothing here" message="New registrations from the website and Parent Portal appear here." />}
          columns={[
            { key: 'd', header: 'Dancer', render: (r) => <><strong>{name(r)}</strong> <SampleTag show={r.isSample} /><div className="small faint">{r.kind === 'new' ? 'New registration' : 'Enrollment change'}</div></>, sortValue: name },
            { key: 'p', header: 'Parent', render: (r) => (r.familyId ? db.families.find((f) => f.id === r.familyId)?.name : <>{r.parent.firstName} {r.parent.lastName}<div className="small faint">{r.parent.email}</div></>) },
            { key: 'c', header: 'Classes', render: (r) => <span className="small">{r.classIds.map((c) => db.classes.find((x) => x.id === c)?.name).join(', ')}{r.dropClassIds.length > 0 && <div className="faint">Drop: {r.dropClassIds.map((c) => db.classes.find((x) => x.id === c)?.name).join(', ')}</div>}</span> },
            { key: 's', header: 'Submitted', render: (r) => formatDateTime(r.createdAt), sortValue: (r) => r.createdAt, minor: true },
            { key: 'a', header: '', render: (r) => (r.status === 'pending' ? edit && <button className="btn btn-primary btn-sm" onClick={() => (setNote(''), setReview(r))}>Review</button> : <span className="small faint">{r.reviewedBy} · {formatDate(r.reviewedAt)}<div>{r.result || r.reviewNote}</div></span>) },
          ]}
        />
      </Card>
      {review && (
        <FormModal open onClose={() => setReview(null)} title={`Review: ${name(review)}`} size="lg" saveLabel="Approve & enroll" onSubmit={() => { const r = run(() => approveRegistration(review.id, note)); if (r) { toast.success(r.join(' · ')); setReview(null); } }}>
          <div className="grid-2">
            <Card title="Parent / guardian">
              {review.familyId ? (
                <p>
                  Existing family: <Link to={`/families/${review.familyId}`}>{db.families.find((f) => f.id === review.familyId)?.name}</Link>
                </p>
              ) : (
                <Info items={[['Name', `${review.parent.firstName} ${review.parent.lastName}`], ['Relationship', review.parent.relationship], ['Email', review.parent.email], ['Phone', review.parent.phone], ['Address', review.address], ['Emergency', `${review.emergency.name} (${review.emergency.relationship}) ${review.emergency.phone}`]]} />
              )}
            </Card>
            <Card title="Dancer">
              {review.existingDancerId ? (
                <p>
                  Existing dancer: <Link to={`/dancers/${review.existingDancerId}`}>{name(review)}</Link>
                </p>
              ) : (
                <Info items={[['Name', name(review)], ['Birthday', formatDate(review.dancer.birthday)], ['Level', review.dancer.level], ['Sizes', [review.dancer.clothingSize, review.dancer.shoeSize && `shoe ${review.dancer.shoeSize}`].filter(Boolean).join(' · ')], ['Allergies', review.dancer.allergies], ['Medical', review.dancer.medicalNotes]]} />
              )}
            </Card>
          </div>
          <Info
            items={[
              ['Add classes', review.classIds.map((c) => { const cl = db.classes.find((x) => x.id === c); return cl ? `${cl.name} (${db.enrollments.filter((e) => e.classId === c && e.status === 'enrolled').length}/${cl.maxEnrollment})` : ''; }).join(', ')],
              ['Drop classes', review.dropClassIds.map((c) => db.classes.find((x) => x.id === c)?.name).join(', ')],
              ['Agreed to', review.agreedPolicyIds.map((p) => db.policies.find((x) => x.id === p)?.title).join(', ')],
              ['Registration fee', review.fee ? money(review.fee) : 'None'],
              ['Notes', review.notes],
            ]}
          />
          <p className="small faint">Approving matches an existing family (by email) and dancer (by name & birthday) so nothing is duplicated. Full classes put the dancer on the waiting list.</p>
          <Field label="Review note">
            <input className="input" value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
          <button type="button" className="btn btn-ghost danger" onClick={() => run(() => (denyRegistration(review.id, note), true), 'Registration denied.') && setReview(null)}>
            <X size={15} /> Deny (note required)
          </button>
        </FormModal>
      )}
    </>
  );
}

/* ============================================================ policies */

const policyAudience: Record<Policy['audience'], string> = { all: 'All families', classes: 'Families in chosen classes', teams: 'Families on chosen teams', families: 'Chosen families' };
const sigTone = { signed: 'ready', missing: 'progress', overdue: 'danger', not_required: 'neutral' } as const;
const sigLabel = { signed: 'Signed', missing: 'Not signed', overdue: 'Overdue', not_required: 'Not required' };

export function PoliciesPage() {
  const db = useDb();
  const edit = useEdit();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  return (
    <>
      <PageHeader
        title="Policies & Signatures"
        subtitle="Handbooks, waivers, media releases and agreements — versioned, with e-signatures"
        actions={
          edit && (
            <button className="btn btn-primary" onClick={() => setCreating(true)}>
              <Plus size={16} /> New policy
            </button>
          )
        }
      />
      <Card>
        <DataTable
          rows={db.policies}
          getId={(p) => p.id}
          empty={<EmptyState icon={<FileSignature size={28} />} title="No policies yet" />}
          columns={[
            { key: 't', header: 'Policy', render: (p) => <><Link to={`/policies/${p.id}`} className="link-strong">{p.title}</Link> <SampleTag show={p.isSample} /><div className="small faint">{p.category} · v{currentVersion(p).version}</div></>, sortValue: (p) => p.title },
            { key: 'a', header: 'Applies to', render: (p) => policyAudience[p.audience], minor: true },
            { key: 'd', header: 'Deadline', render: (p) => formatDate(p.deadline) || '—', sortValue: (p) => p.deadline },
            {
              key: 's',
              header: 'Signatures',
              render: (p) => {
                if (!p.requiresSignature) return <span className="faint">Read only</span>;
                const st = db.families.filter((f) => f.status === 'active').map((f) => policyStatusForFamily(db, p, f.id)).filter((s) => s !== 'not_required');
                const signed = st.filter((s) => s === 'signed').length;
                return (
                  <div className="progress-cell">
                    <Progress value={signed} max={st.length} label={`${signed} of ${st.length} signed`} />
                    <span className="small">
                      {signed}/{st.length}
                    </span>
                  </div>
                );
              },
            },
            { key: 'x', header: 'Status', render: (p) => <Badge tone={p.active ? 'ready' : 'neutral'}>{p.active ? 'Active' : 'Inactive'}</Badge> },
          ]}
        />
      </Card>
      <PolicyForm open={creating} onClose={() => setCreating(false)} onSaved={(id) => navigate(`/policies/${id}`)} />
    </>
  );
}

function PolicyForm({ open, onClose, id, onSaved }: { open: boolean; onClose: () => void; id?: ID; onSaved?: (id: ID) => void }) {
  const db = useDb();
  const run = useRun();
  const blank: PolicyInput = { title: '', category: 'Studio policy', body: '', fileId: null, audience: 'all', classIds: [], teamIds: [], familyIds: [], requiresSignature: true, deadline: '', annualRenewal: true, active: true };
  const [f, setF] = useState<PolicyInput>(blank);
  const [last, setLast] = useState<string | null>(null);
  const key = open ? id ?? 'new' : null;
  if (key !== last) {
    setLast(key);
    if (open) {
      const p = id ? db.policies.find((x) => x.id === id) : undefined;
      setF(p ? { ...blank, ...p, body: currentVersion(p).body, fileId: currentVersion(p).fileId } : blank);
    }
  }
  const set = (p: Partial<PolicyInput>) => setF({ ...f, ...p });
  const docs = db.media.filter((m) => m.category === 'policy' || m.mime === 'application/pdf');
  return (
    <FormModal open={open} onClose={onClose} title={id ? 'Edit Policy' : 'New Policy'} size="lg" onSubmit={() => { const s = run(() => savePolicy(f, id), 'Policy saved.'); if (s) { onClose(); onSaved?.(s); } }}>
      <div className="grid-2">
        <Field label="Title" required>
          <input className="input" value={f.title} onChange={(e) => set({ title: e.target.value })} autoFocus />
        </Field>
        <Field label="Category">
          <input className="input" list="policy-cats" value={f.category} onChange={(e) => set({ category: e.target.value })} />
          <datalist id="policy-cats">
            {['Studio policy', 'Handbook', 'Waiver', 'Media release', 'Competition agreement', 'Payment agreement', 'Dress code', 'Health & safety'].map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </Field>
        <Field label="Applies to">
          <select className="input" value={f.audience} onChange={(e) => set({ audience: e.target.value as Policy['audience'] })}>
            {Object.entries(policyAudience).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Sign by">
          <input className="input" type="date" value={f.deadline} onChange={(e) => set({ deadline: e.target.value })} />
        </Field>
      </div>
      {f.audience === 'classes' && <CheckList options={classOptions(db)} selected={new Set(f.classIds)} onChange={(s) => set({ classIds: [...s] })} height={140} />}
      {f.audience === 'teams' && <CheckList options={db.teams.map((t) => ({ value: t.id, label: t.name }))} selected={new Set(f.teamIds)} onChange={(s) => set({ teamIds: [...s] })} height={120} />}
      {f.audience === 'families' && <CheckList options={db.families.map((x) => ({ value: x.id, label: x.name }))} selected={new Set(f.familyIds)} onChange={(s) => set({ familyIds: [...s] })} height={160} />}
      <Field label="Policy text" hint={id ? 'Changing the text creates a new version — families will be asked to sign again. Earlier versions and signatures are kept.' : undefined}>
        <textarea className="input" rows={8} value={f.body} onChange={(e) => set({ body: e.target.value })} />
      </Field>
      <Field label="Attached document (from the Media Library)">
        <select className="input" value={f.fileId ?? ''} onChange={(e) => set({ fileId: e.target.value || null })}>
          <option value="">—</option>
          {docs.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </Field>
      <div className="stack-tight">
        <label className="check-inline">
          <input type="checkbox" checked={f.requiresSignature} onChange={(e) => set({ requiresSignature: e.target.checked })} /> Requires a signature
        </label>
        <label className="check-inline">
          <input type="checkbox" checked={f.annualRenewal} onChange={(e) => set({ annualRenewal: e.target.checked })} /> Sign again every school year
        </label>
        <label className="check-inline">
          <input type="checkbox" checked={f.active} onChange={(e) => set({ active: e.target.checked })} /> Active
        </label>
      </div>
    </FormModal>
  );
}

export function PolicyDetailPage() {
  const { id } = useParams();
  const db = useDb();
  const edit = useEdit();
  const run = useRun();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [signing, setSigning] = useState<{ familyId: ID; name: string } | null>(null);
  const [ver, setVer] = useState<number | null>(null);
  const p = db.policies.find((x) => x.id === id);
  if (!p) return <EmptyState title="Policy not found" action={<Link to="/policies" className="btn btn-primary">All policies</Link>} />;
  const cur = currentVersion(p);
  const shown = p.versions.find((v) => v.version === (ver ?? cur.version)) ?? cur;
  const fams = db.families.filter((f) => f.status === 'active').map((f) => ({ f, st: policyStatusForFamily(db, p, f.id) })).filter((x) => x.st !== 'not_required');
  return (
    <>
      <PageHeader
        back={{ to: '/policies', label: 'Policies' }}
        title={
          <>
            {p.title} <Badge tone={p.active ? 'ready' : 'neutral'}>{p.active ? 'Active' : 'Inactive'}</Badge>
          </>
        }
        subtitle={`${p.category} · version ${cur.version} · ${policyAudience[p.audience]}${p.deadline ? ` · sign by ${formatDate(p.deadline)}` : ''}`}
        actions={
          <>
            <button className="btn btn-ghost" onClick={() => openPrint('policy', { id: p.id })}>
              <Printer size={16} /> Print
            </button>
            {edit && (
              <>
                <button className="btn btn-ghost danger" onClick={async () => { if (await confirm({ title: 'Delete policy?', message: 'Only policies without signatures can be deleted.', confirmLabel: 'Delete', danger: true })) if (run(() => (deletePolicy(p.id), true), 'Policy deleted.')) navigate('/policies'); }}>
                  <Trash2 size={16} /> Delete
                </button>
                <button className="btn btn-primary" onClick={() => setEditing(true)}>
                  <Pencil size={16} /> Edit
                </button>
              </>
            )}
          </>
        }
      />
      <div className="detail-grid">
        <Card
          title={`Version ${shown.version}`}
          actions={
            p.versions.length > 1 && (
              <select className="input input-auto input-sm" value={shown.version} onChange={(e) => setVer(Number(e.target.value))} aria-label="Version">
                {[...p.versions].reverse().map((v) => (
                  <option key={v.version} value={v.version}>
                    v{v.version} · {formatDate(v.createdAt)}
                  </option>
                ))}
              </select>
            )
          }
        >
          <div className="policy-text prewrap">{shown.body}</div>
          {shown.fileId && <p className="small">Attached: {db.media.find((m) => m.id === shown.fileId)?.name ?? 'document'}</p>}
          <p className="small faint">
            Written by {shown.createdBy} · {formatDateTime(shown.createdAt)}
          </p>
        </Card>
        <Card title={`Signatures (${fams.filter((x) => x.st === 'signed').length}/${fams.length})`} icon={<FileSignature size={18} />}>
          {!p.requiresSignature ? (
            <p className="faint pad">This policy doesn't need a signature.</p>
          ) : (
            <ul className="mini-list">
              {fams.map(({ f, st }) => {
                const sig = db.policySignatures.filter((s) => s.policyId === p.id && s.familyId === f.id).sort((a, b) => b.signedAt.localeCompare(a.signedAt))[0];
                return (
                  <li key={f.id}>
                    <div>
                      <Link to={`/families/${f.id}`}>{f.name}</Link>
                      {sig && (
                        <div className="small faint">
                          {sig.signerName} · {formatDateTime(sig.signedAt)} · v{sig.version} · {sig.method === 'typed' ? 'typed signature' : 'acknowledged'}
                        </div>
                      )}
                    </div>
                    <span className="row-actions">
                      <Badge tone={sigTone[st]}>{sigLabel[st]}</Badge>
                      {edit && st !== 'signed' && (
                        <button className="btn btn-ghost btn-sm" onClick={() => setSigning({ familyId: f.id, name: '' })}>
                          Record signature
                        </button>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
      <PolicyForm open={editing} id={p.id} onClose={() => setEditing(false)} />
      {signing && (
        <FormModal open onClose={() => setSigning(null)} title="Record Paper Signature" size="sm" onSubmit={() => run(() => (signPolicy(p.id, signing.familyId, null, signing.name, 'acknowledged'), true), 'Signature recorded.') && setSigning(null)}>
          <p className="small">For a signed paper copy handed in at the front desk.</p>
          <Field label="Signed by (parent name)" required>
            <input className="input" value={signing.name} onChange={(e) => setSigning({ ...signing, name: e.target.value })} autoFocus />
          </Field>
        </FormModal>
      )}
    </>
  );
}

/* ========================================================== fundraisers */

export function FundraisersPage() {
  const db = useDb();
  const edit = useEdit();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  return (
    <>
      <PageHeader
        title="Fundraisers"
        subtitle="Donations, product sales and fundraising events with goals and progress"
        actions={
          edit && (
            <button className="btn btn-primary" onClick={() => setCreating(true)}>
              <Plus size={16} /> New fundraiser
            </button>
          )
        }
      />
      {!db.fundraisers.length ? (
        <EmptyState icon={<HandCoins size={28} />} title="No fundraisers yet" />
      ) : (
        <div className="card-grid">
          {db.fundraisers.map((f) => {
            const raised = fundraiserRaised(db, f.id);
            return (
              <Link key={f.id} to={`/fundraisers/${f.id}`} className="card tile-link">
                <div className="tile-head">
                  <h3>{f.name}</h3>
                  <Badge tone={f.status === 'open' ? 'ready' : 'neutral'}>{f.status === 'open' ? 'Open' : 'Closed'}</Badge>
                </div>
                <p className="small faint">
                  {formatDate(f.startDate)} – {formatDate(f.endDate)}
                  {f.teamId && ` · ${db.teams.find((t) => t.id === f.teamId)?.name}`}
                </p>
                <div className="progress-wrap">{f.goal > 0 && <Progress value={raised} max={f.goal} label="Progress toward goal" />}</div>
                <p className="small">
                  <strong>{money(raised)}</strong> raised{f.goal > 0 && ` of ${money(f.goal)}`}
                </p>
                <SampleTag show={f.isSample} />
              </Link>
            );
          })}
        </div>
      )}
      <FundraiserForm open={creating} onClose={() => setCreating(false)} onSaved={(id) => navigate(`/fundraisers/${id}`)} />
    </>
  );
}

function FundraiserForm({ open, onClose, id, onSaved }: { open: boolean; onClose: () => void; id?: ID; onSaved?: (id: ID) => void }) {
  const db = useDb();
  const run = useRun();
  const blank: FundraiserInput = { name: '', description: '', type: 'donation', purpose: '', startDate: todayStr(), endDate: '', goal: 0, teamId: null, dancerIds: [], requirements: '', paymentOptions: 'Pay online (test mode) or add to your account', items: [], notes: '', status: 'open' };
  const [f, setF] = useState<FundraiserInput>(blank);
  const [last, setLast] = useState<string | null>(null);
  const key = open ? id ?? 'new' : null;
  if (key !== last) {
    setLast(key);
    if (open) {
      const x = id ? db.fundraisers.find((y) => y.id === id) : undefined;
      setF(x ? { ...blank, ...x, items: x.items.map((i) => ({ ...i })) } : blank);
    }
  }
  const set = (p: Partial<FundraiserInput>) => setF({ ...f, ...p });
  return (
    <FormModal open={open} onClose={onClose} title={id ? 'Edit Fundraiser' : 'New Fundraiser'} size="lg" onSubmit={() => { const s = run(() => saveFundraiser(f, id), 'Fundraiser saved.'); if (s) { onClose(); onSaved?.(s); } }}>
      <div className="grid-2">
        <Field label="Name" required>
          <input className="input" value={f.name} onChange={(e) => set({ name: e.target.value })} autoFocus />
        </Field>
        <Field label="Type">
          <select className="input" value={f.type} onChange={(e) => set({ type: e.target.value as Fundraiser['type'] })}>
            <option value="donation">Donations</option>
            <option value="product_sale">Product sale</option>
            <option value="event">Fundraising event</option>
            <option value="other">Other</option>
          </select>
        </Field>
        <Field label="Start date">
          <input className="input" type="date" value={f.startDate} onChange={(e) => set({ startDate: e.target.value })} />
        </Field>
        <Field label="End date">
          <input className="input" type="date" value={f.endDate} onChange={(e) => set({ endDate: e.target.value })} />
        </Field>
        <Field label="Goal ($)">
          <input className="input" type="number" min={0} value={f.goal} onChange={(e) => set({ goal: Number(e.target.value) })} />
        </Field>
        <Field label="For team (optional)">
          <select className="input" value={f.teamId ?? ''} onChange={(e) => set({ teamId: e.target.value || null })}>
            <option value="">Whole studio</option>
            {db.teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Status">
          <select className="input" value={f.status} onChange={(e) => set({ status: e.target.value as Fundraiser['status'] })}>
            <option value="open">Open</option>
            <option value="closed">Closed</option>
          </select>
        </Field>
        <Field label="Purpose">
          <input className="input" value={f.purpose} onChange={(e) => set({ purpose: e.target.value })} />
        </Field>
      </div>
      <Field label="Description">
        <textarea className="input" rows={3} value={f.description} onChange={(e) => set({ description: e.target.value })} />
      </Field>
      {(f.type === 'product_sale' || f.items.length > 0) && (
        <div className="field">
          <span className="field-label">Products</span>
          {f.items.map((it, i) => (
            <div key={it.id || i} className="line-row three">
              <input className="input" placeholder="Product" value={it.name} onChange={(e) => set({ items: f.items.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} aria-label="Product name" />
              <span />
              <input className="input" type="number" step="0.01" min={0} value={it.price} onChange={(e) => set({ items: f.items.map((x, j) => (j === i ? { ...x, price: Number(e.target.value) } : x)) })} aria-label="Price" />
              <button type="button" className="icon-btn" aria-label="Remove product" onClick={() => set({ items: f.items.filter((_, j) => j !== i) })}>
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => set({ items: [...f.items, { id: newId(), name: '', price: 0 }] })}>
            <Plus size={14} /> Add product
          </button>
        </div>
      )}
      <Field label="Requirements for dancers">
        <input className="input" value={f.requirements} onChange={(e) => set({ requirements: e.target.value })} />
      </Field>
      <Field label="Payment options (shown to families)">
        <input className="input" value={f.paymentOptions} onChange={(e) => set({ paymentOptions: e.target.value })} />
      </Field>
    </FormModal>
  );
}

export function FundraiserDetailPage() {
  const { id } = useParams();
  const db = useDb();
  const edit = useEdit();
  const run = useRun();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const f = db.fundraisers.find((x) => x.id === id);
  if (!f) return <EmptyState title="Fundraiser not found" action={<Link to="/fundraisers" className="btn btn-primary">All fundraisers</Link>} />;
  const tx = db.fundraiserTransactions.filter((t) => t.fundraiserId === f.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const raised = fundraiserRaised(db, f.id);
  const byDancer = new Map<string, number>();
  for (const t of tx) {
    const k = t.dancerId ? fullName(db.dancers.find((d) => d.id === t.dancerId) ?? { firstName: '?', lastName: '' }) : t.familyId ? db.families.find((x) => x.id === t.familyId)?.name ?? 'Family' : 'Studio';
    byDancer.set(k, (byDancer.get(k) ?? 0) + t.amount);
  }
  return (
    <>
      <PageHeader
        back={{ to: '/fundraisers', label: 'Fundraisers' }}
        title={
          <>
            {f.name} <Badge tone={f.status === 'open' ? 'ready' : 'neutral'}>{f.status === 'open' ? 'Open' : 'Closed'}</Badge>
          </>
        }
        subtitle={`${formatDate(f.startDate)} – ${formatDate(f.endDate)}${f.purpose ? ` · ${f.purpose}` : ''}`}
        actions={
          <>
            <button className="btn btn-ghost" onClick={() => openPrint('fundraiser', { id: f.id })}>
              <Printer size={16} /> Print
            </button>
            {edit && (
              <>
                <button className="btn btn-ghost danger" onClick={async () => { if (await confirm({ title: 'Delete fundraiser?', message: 'Only fundraisers with no donations or orders can be deleted.', confirmLabel: 'Delete', danger: true })) if (run(() => (deleteFundraiser(f.id), true), 'Deleted.')) navigate('/fundraisers'); }}>
                  <Trash2 size={16} /> Delete
                </button>
                <button className="btn btn-ghost" onClick={() => setEditing(true)}>
                  <Pencil size={16} /> Edit
                </button>
                <button className="btn btn-primary" onClick={() => setAdding(true)} disabled={f.status !== 'open'}>
                  <Plus size={16} /> Record {f.items.length ? 'order / donation' : 'donation'}
                </button>
              </>
            )}
          </>
        }
      />
      <div className="stats stats-4">
        <StatCard label="Raised" value={money(raised)} icon={<HandCoins size={20} />} tone="sage" hint={f.goal ? `${Math.round((raised / f.goal) * 100)}% of ${money(f.goal)}` : undefined} />
        <StatCard label="Donations" value={tx.filter((t) => t.kind === 'donation').length} icon={<DollarSign size={20} />} tone="plum" />
        <StatCard label="Orders" value={tx.filter((t) => t.kind === 'order').length} icon={<Ticket size={20} />} tone="amber" />
        <StatCard label="Orders to deliver" value={tx.filter((t) => t.kind === 'order' && !t.fulfilled).length} icon={<Check size={20} />} tone="rose" />
      </div>
      {f.goal > 0 && (
        <Card>
          <Progress value={raised} max={f.goal} label="Progress toward goal" />
        </Card>
      )}
      <div className="detail-grid wide-right">
        <Card title="By dancer / family">
          <ul className="mini-list">
            {[...byDancer].sort((a, b) => b[1] - a[1]).map(([k, v]) => (
              <li key={k}>
                <span>{k}</span>
                <strong>{money(v)}</strong>
              </li>
            ))}
            {!byDancer.size && <li className="faint small">Nothing yet.</li>}
          </ul>
          {f.description && <p className="small prewrap">{f.description}</p>}
        </Card>
        <Card title="Donations & orders">
          <table className="table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Supporter</th>
                <th>For</th>
                <th>Items</th>
                <th className="num">Amount</th>
                <th>Delivered</th>
              </tr>
            </thead>
            <tbody>
              {tx.map((t) => (
                <tr key={t.id}>
                  <td>{formatDate(t.createdAt)}</td>
                  <td>
                    {t.donorName}
                    {t.invoiceId && <div className="small"><Link to={`/invoices/${t.invoiceId}`}>{db.invoices.find((i) => i.id === t.invoiceId)?.number}</Link></div>}
                  </td>
                  <td className="small">{db.dancers.find((d) => d.id === t.dancerId)?.firstName ?? db.families.find((x) => x.id === t.familyId)?.name ?? '—'}</td>
                  <td className="small">{t.kind === 'donation' ? 'Donation' : t.items.map((i) => `${i.qty} × ${f.items.find((x) => x.id === i.itemId)?.name}`).join(', ')}</td>
                  <td className="num">{money(t.amount)}</td>
                  <td>{t.kind === 'order' && <input type="checkbox" aria-label="Delivered" checked={t.fulfilled} disabled={!edit} onChange={(e) => run(() => setOrderFulfilled(t.id, e.target.checked))} />}</td>
                </tr>
              ))}
              {!tx.length && (
                <tr>
                  <td colSpan={6} className="faint">
                    No donations or orders yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      </div>
      <FundraiserForm open={editing} id={f.id} onClose={() => setEditing(false)} />
      <FundraiserEntryDialog open={adding} fundraiser={f} onClose={() => setAdding(false)} staff />
    </>
  );
}

export function FundraiserEntryDialog({ open, fundraiser: f, onClose, staff, familyId }: { open: boolean; fundraiser: Fundraiser; onClose: () => void; staff?: boolean; familyId?: ID }) {
  const db = useDb();
  const run = useRun();
  const [kind, setKind] = useState<'donation' | 'order'>('donation');
  const [fam, setFam] = useState('');
  const [dancer, setDancer] = useState('');
  const [donor, setDonor] = useState('');
  const [amount, setAmount] = useState(25);
  const [qty, setQty] = useState<Record<ID, number>>({});
  const [notes, setNotes] = useState('');
  const [pay, setPay] = useState<'account' | 'now' | 'cash' | 'check'>(staff ? 'cash' : 'now');
  const [last, setLast] = useState(false);
  if (open !== last) {
    setLast(open);
    if (open) {
      setKind(f.items.length ? 'order' : 'donation');
      setFam(familyId ?? '');
      setDancer('');
      setDonor('');
      setAmount(25);
      setQty({});
      setNotes('');
      setPay(staff ? 'cash' : 'now');
    }
  }
  const famId = familyId ?? (fam || null);
  const total = kind === 'order' ? f.items.reduce((s, i) => s + (qty[i.id] ?? 0) * i.price, 0) : amount;
  return (
    <FormModal
      open={open}
      onClose={onClose}
      title={kind === 'donation' ? 'Donation' : 'Order'}
      subtitle={f.name}
      saveLabel={`${pay === 'now' ? 'Pay' : 'Record'} ${money(total)}${pay === 'now' ? ' (test)' : ''}`}
      onSubmit={() => run(() => addFundraiserTransaction({ fundraiserId: f.id, familyId: famId, dancerId: dancer || null, donorName: donor, kind, items: Object.entries(qty).map(([itemId, q]) => ({ itemId, qty: q })), amount, notes, payNow: pay === 'now' && !!famId, paidOffline: pay === 'cash' || pay === 'check' ? pay : null }), pay === 'now' ? 'Thank you! Test payment completed.' : 'Recorded.') && onClose()}
    >
      {f.items.length > 0 && (
        <Field label="Type">
          <select className="input" value={kind} onChange={(e) => setKind(e.target.value as 'donation' | 'order')}>
            <option value="order">Product order</option>
            <option value="donation">Donation</option>
          </select>
        </Field>
      )}
      {staff && (
        <Field label="Family (to credit a dancer and add it to their account)">
          <SearchSelect ariaLabel="Family" value={fam} onChange={setFam} options={db.families.map((x) => ({ value: x.id, label: x.name }))} noneLabel="Not a studio family" />
        </Field>
      )}
      {famId && (
        <Field label="Credit to dancer">
          <select className="input" value={dancer} onChange={(e) => setDancer(e.target.value)}>
            <option value="">Whole family</option>
            {db.dancers.filter((d) => d.familyId === famId).map((d) => (
              <option key={d.id} value={d.id}>
                {d.firstName}
              </option>
            ))}
          </select>
        </Field>
      )}
      <Field label="Supporter / buyer name" hint={famId ? 'Leave blank to use your family name.' : undefined}>
        <input className="input" value={donor} onChange={(e) => setDonor(e.target.value)} placeholder="e.g. Grandma Rose" />
      </Field>
      {kind === 'donation' ? (
        <Field label="Amount ($)">
          <input className="input" type="number" min={1} step="0.01" value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
        </Field>
      ) : (
        <div className="field">
          <span className="field-label">Products</span>
          {f.items.map((i) => (
            <div key={i.id} className="qty-row">
              <span>
                {i.name} <span className="faint small">{money(i.price)}</span>
              </span>
              <input className="input input-qty" type="number" min={0} value={qty[i.id] ?? 0} onChange={(e) => setQty({ ...qty, [i.id]: Math.max(0, Number(e.target.value)) })} aria-label={`Quantity of ${i.name}`} />
            </div>
          ))}
        </div>
      )}
      <Field label="Notes">
        <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      {famId && (
        <Field label="Payment">
          <select className="input" value={pay} onChange={(e) => setPay(e.target.value as typeof pay)}>
            {!staff && <option value="now">Pay now (test mode — no card is charged)</option>}
            <option value="account">Add to family account (invoice)</option>
            {staff && <option value="cash">Paid cash</option>}
            {staff && <option value="check">Paid by check</option>}
          </select>
        </Field>
      )}
      {!famId && <p className="small faint">Non-family supporters: collect payment in person — it's recorded toward the goal.</p>}
    </FormModal>
  );
}

/* ============================================================= ticketing */

export function TicketsPage() {
  const db = useDb();
  const edit = useEdit();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  return (
    <>
      <PageHeader
        title="Ticketing"
        subtitle="Recital and show tickets — ticket types, seating, online sales (test mode) and box office"
        actions={
          edit && (
            <button className="btn btn-primary" onClick={() => setCreating(true)}>
              <Plus size={16} /> New ticketed show
            </button>
          )
        }
      />
      <Card>
        <DataTable
          rows={db.ticketEvents}
          getId={(e) => e.id}
          empty={<EmptyState icon={<Ticket size={28} />} title="No ticketed shows yet" />}
          columns={[
            { key: 'n', header: 'Show', render: (e) => <><Link to={`/tickets/${e.id}`} className="link-strong">{e.name}</Link> <SampleTag show={e.isSample} /><div className="small faint">{e.venue}</div></>, sortValue: (e) => e.name },
            { key: 'd', header: 'Date', render: (e) => `${formatDate(e.date)} ${formatTime(e.time)}`, sortValue: (e) => e.date },
            { key: 's', header: 'Sold', render: (e) => `${ticketsSold(db, e.id)} / ${e.types.reduce((s, t) => s + t.quantity, 0)}` },
            { key: 'r', header: 'Revenue', render: (e) => money(db.ticketOrders.filter((o) => o.ticketEventId === e.id && o.status === 'paid').reduce((s, o) => s + o.total, 0)) },
            { key: 'st', header: 'Status', render: (e) => <Badge tone={e.status === 'on_sale' ? 'ready' : e.status === 'draft' ? 'info' : 'neutral'}>{{ draft: 'Draft', on_sale: 'On sale', closed: 'Closed' }[e.status]}</Badge> },
          ]}
        />
      </Card>
      <TicketEventForm open={creating} onClose={() => setCreating(false)} onSaved={(id) => navigate(`/tickets/${id}`)} />
    </>
  );
}

function TicketEventForm({ open, onClose, id, onSaved }: { open: boolean; onClose: () => void; id?: ID; onSaved?: (id: ID) => void }) {
  const db = useDb();
  const run = useRun();
  const blank = (): TicketEventInput => ({ name: '', performanceId: null, recitalId: null, date: '', time: '', venue: '', salesOpen: todayStr(), salesClose: '', types: [{ id: newId(), name: 'Adult', category: 'reserved', price: 20, quantity: 100 }, { id: newId(), name: 'Child / Student', category: 'student', price: 12, quantity: 50 }], seatingRows: 0, seatsPerRow: 0, notes: '', status: 'draft' });
  const [f, setF] = useState<TicketEventInput>(blank);
  const [last, setLast] = useState<string | null>(null);
  const key = open ? id ?? 'new' : null;
  if (key !== last) {
    setLast(key);
    if (open) {
      const e = id ? db.ticketEvents.find((x) => x.id === id) : undefined;
      setF(e ? { ...blank(), ...e, types: e.types.map((t) => ({ ...t })) } : blank());
    }
  }
  const set = (p: Partial<TicketEventInput>) => setF({ ...f, ...p });
  const setT = (tid: ID, p: Partial<TicketType>) => set({ types: f.types.map((t) => (t.id === tid ? { ...t, ...p } : t)) });
  return (
    <FormModal open={open} onClose={onClose} title={id ? 'Edit Ticketed Show' : 'New Ticketed Show'} size="lg" onSubmit={() => { const s = run(() => saveTicketEvent(f, id), 'Saved.'); if (s) { onClose(); onSaved?.(s); } }}>
      <div className="grid-2">
        <Field label="Performance (fills in the details)">
          <select
            className="input"
            value={f.performanceId ?? ''}
            onChange={(e) => {
              const p = db.performances.find((x) => x.id === e.target.value);
              set({ performanceId: p?.id ?? null, name: f.name || p?.name || '', date: p?.date ?? f.date, time: p?.time ?? f.time, venue: p?.venue ?? f.venue, recitalId: f.recitalId ?? db.recitals.find((r) => r.showId && r.showId === p?.showId)?.id ?? null });
            }}
          >
            <option value="">—</option>
            {db.performances.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · {formatDate(p.date)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Name" required>
          <input className="input" value={f.name} onChange={(e) => set({ name: e.target.value })} />
        </Field>
        <Field label="Date">
          <input className="input" type="date" value={f.date} onChange={(e) => set({ date: e.target.value })} />
        </Field>
        <Field label="Curtain time">
          <input className="input" type="time" value={f.time} onChange={(e) => set({ time: e.target.value })} />
        </Field>
        <Field label="Venue">
          <input className="input" value={f.venue} onChange={(e) => set({ venue: e.target.value })} />
        </Field>
        <Field label="Status">
          <select className="input" value={f.status} onChange={(e) => set({ status: e.target.value as TicketedEvent['status'] })}>
            <option value="draft">Draft (not visible to families)</option>
            <option value="on_sale">On sale</option>
            <option value="closed">Closed</option>
          </select>
        </Field>
        <Field label="Sales open">
          <input className="input" type="date" value={f.salesOpen} onChange={(e) => set({ salesOpen: e.target.value })} />
        </Field>
        <Field label="Sales close">
          <input className="input" type="date" value={f.salesClose} onChange={(e) => set({ salesClose: e.target.value })} />
        </Field>
        <Field label="Seating rows" hint="0 = general admission (no seat map)">
          <input className="input" type="number" min={0} max={40} value={f.seatingRows} onChange={(e) => set({ seatingRows: Number(e.target.value) })} />
        </Field>
        <Field label="Seats per row">
          <input className="input" type="number" min={0} max={40} value={f.seatsPerRow} onChange={(e) => set({ seatsPerRow: Number(e.target.value) })} />
        </Field>
      </div>
      <div className="field">
        <span className="field-label">Ticket types</span>
        {f.types.map((t) => (
          <div key={t.id} className="line-row ticket-row">
            <input className="input" value={t.name} onChange={(e) => setT(t.id, { name: e.target.value })} aria-label="Ticket name" />
            <select className="input" value={t.category} onChange={(e) => setT(t.id, { category: e.target.value as TicketType['category'] })} aria-label="Ticket category">
              {['general', 'reserved', 'vip', 'student', 'comp', 'staff'].map((c) => (
                <option key={c} value={c}>
                  {c === 'vip' ? 'VIP' : c === 'comp' ? 'Complimentary' : c[0].toUpperCase() + c.slice(1)}
                </option>
              ))}
            </select>
            <input className="input" type="number" step="0.01" min={0} value={t.price} onChange={(e) => setT(t.id, { price: Number(e.target.value) })} aria-label="Price" />
            <input className="input" type="number" min={0} value={t.quantity} onChange={(e) => setT(t.id, { quantity: Number(e.target.value) })} aria-label="Quantity available" />
            <button type="button" className="icon-btn" aria-label="Remove ticket type" onClick={() => set({ types: f.types.filter((x) => x.id !== t.id) })}>
              <Trash2 size={14} />
            </button>
          </div>
        ))}
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => set({ types: [...f.types, { id: newId(), name: '', category: 'general', price: 0, quantity: 50 }] })}>
          <Plus size={14} /> Add ticket type
        </button>
        <span className="field-hint">Name · category · price · quantity. Complimentary and staff tickets are issued by the office only.</span>
      </div>
      <Field label="Notes (shown to buyers)">
        <textarea className="input" rows={2} value={f.notes} onChange={(e) => set({ notes: e.target.value })} />
      </Field>
    </FormModal>
  );
}

export function SeatMap({ e, taken, selected, onToggle }: { e: TicketedEvent; taken: Set<string>; selected: Set<string>; onToggle?: (seat: string) => void }) {
  if (!e.seatingRows || !e.seatsPerRow) return null;
  const rows = Array.from({ length: e.seatingRows }, (_, i) => String.fromCharCode(65 + i));
  return (
    <div className="seatmap" role="group" aria-label="Seating chart">
      <div className="stage">Stage</div>
      {rows.map((r) => (
        <div key={r} className="seat-row">
          <span className="seat-row-label">{r}</span>
          {Array.from({ length: e.seatsPerRow }, (_, i) => {
            const s = `${r}${i + 1}`;
            const isTaken = taken.has(s);
            return (
              <button key={s} type="button" className={`seat ${isTaken ? 'taken' : ''} ${selected.has(s) ? 'sel' : ''}`} disabled={isTaken || !onToggle} onClick={() => onToggle?.(s)} aria-label={`Seat ${s}${isTaken ? ' (taken)' : ''}`} aria-pressed={selected.has(s)}>
                {i + 1}
              </button>
            );
          })}
        </div>
      ))}
      <div className="seat-legend small">
        <span className="seat" /> Open <span className="seat sel" /> Selected <span className="seat taken" /> Sold
      </div>
    </div>
  );
}

export function TicketEventPage() {
  const { id } = useParams();
  const db = useDb();
  const edit = useEdit();
  const run = useRun();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [selling, setSelling] = useState(false);
  const [refund, setRefund] = useState<{ id: ID; reason: string } | null>(null);
  const e = db.ticketEvents.find((x) => x.id === id);
  if (!e) return <EmptyState title="Not found" action={<Link to="/tickets" className="btn btn-primary">All ticketed shows</Link>} />;
  const orders = db.ticketOrders.filter((o) => o.ticketEventId === e.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const paid = orders.filter((o) => o.status === 'paid');
  return (
    <>
      <PageHeader
        back={{ to: '/tickets', label: 'Ticketing' }}
        title={
          <>
            {e.name} <Badge tone={e.status === 'on_sale' ? 'ready' : 'neutral'}>{{ draft: 'Draft', on_sale: 'On sale', closed: 'Closed' }[e.status]}</Badge>
          </>
        }
        subtitle={`${formatDate(e.date)} ${formatTime(e.time)} · ${e.venue}`}
        actions={
          <>
            <button className="btn btn-ghost" onClick={() => openPrint('tickets', { id: e.id })}>
              <Printer size={16} /> Attendee list
            </button>
            {edit && (
              <>
                <button className="btn btn-ghost danger" onClick={async () => { if (await confirm({ title: 'Delete?', message: 'Only shows with no paid orders can be deleted.', confirmLabel: 'Delete', danger: true })) if (run(() => (deleteTicketEvent(e.id), true), 'Deleted.')) navigate('/tickets'); }}>
                  <Trash2 size={16} />
                </button>
                <button className="btn btn-ghost" onClick={() => setEditing(true)}>
                  <Pencil size={16} /> Edit
                </button>
                <button className="btn btn-primary" onClick={() => setSelling(true)}>
                  <Ticket size={16} /> Box office sale
                </button>
              </>
            )}
          </>
        }
      />
      <div className="stats stats-4">
        <StatCard label="Tickets sold" value={ticketsSold(db, e.id)} icon={<Ticket size={20} />} tone="plum" hint={`of ${e.types.reduce((s, t) => s + t.quantity, 0)}`} />
        <StatCard label="Revenue" value={money(paid.reduce((s, o) => s + o.total, 0))} icon={<DollarSign size={20} />} tone="sage" />
        <StatCard label="Orders" value={paid.length} icon={<Users size={20} />} tone="amber" />
        <StatCard label="Refunded" value={orders.filter((o) => o.status !== 'paid').length} icon={<RotateCcw size={20} />} tone="slate" />
      </div>
      <div className="detail-grid">
        <Card title="Ticket types">
          <table className="table">
            <thead>
              <tr>
                <th>Type</th>
                <th className="num">Price</th>
                <th className="num">Sold</th>
                <th className="num">Left</th>
              </tr>
            </thead>
            <tbody>
              {e.types.map((t) => (
                <tr key={t.id}>
                  <td>{t.name}</td>
                  <td className="num">{money(t.price)}</td>
                  <td className="num">{ticketsSold(db, e.id, t.id)}</td>
                  <td className="num">{t.quantity - ticketsSold(db, e.id, t.id)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <SeatMap e={e} taken={takenSeats(db, e.id)} selected={new Set()} />
        </Card>
        <Card title="Orders">
          <ul className="mini-list">
            {orders.map((o) => (
              <li key={o.id}>
                <div>
                  <strong>{o.buyerName}</strong> <span className="small faint">· {o.source === 'parent' ? 'Online (test)' : 'Box office'} · {formatDate(o.createdAt)}</span>
                  <div className="small">
                    {o.lines.map((l) => `${l.qty} × ${e.types.find((t) => t.id === l.typeId)?.name}`).join(', ')}
                    {o.seats.length > 0 && ` · Seats ${o.seats.join(', ')}`}
                  </div>
                </div>
                <span className="row-actions">
                  <strong>{money(o.total)}</strong>
                  {o.status === 'paid' ? edit && <button className="btn btn-ghost btn-sm" onClick={() => setRefund({ id: o.id, reason: '' })}>Refund</button> : <Badge>{o.status === 'refunded' ? 'Refunded' : 'Cancelled'}</Badge>}
                </span>
              </li>
            ))}
            {!orders.length && <li className="faint small">No orders yet.</li>}
          </ul>
        </Card>
      </div>
      <TicketEventForm open={editing} id={e.id} onClose={() => setEditing(false)} />
      <BuyTicketsDialog open={selling} e={e} onClose={() => setSelling(false)} boxOffice />
      {refund && (
        <FormModal open onClose={() => setRefund(null)} title="Refund Tickets" size="sm" saveLabel="Refund & release seats" onSubmit={() => run(() => (refundTicketOrder(refund.id, refund.reason), true), 'Refunded.') && setRefund(null)}>
          <Field label="Reason" required>
            <input className="input" value={refund.reason} onChange={(ev) => setRefund({ ...refund, reason: ev.target.value })} autoFocus />
          </Field>
        </FormModal>
      )}
    </>
  );
}

export function BuyTicketsDialog({ open, e, onClose, boxOffice, familyId, buyer }: { open: boolean; e: TicketedEvent; onClose: () => void; boxOffice?: boolean; familyId?: ID; buyer?: { name: string; email: string } }) {
  const db = useDb();
  const run = useRun();
  const [qty, setQty] = useState<Record<ID, number>>({});
  const [seats, setSeats] = useState<Set<string>>(new Set());
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [fam, setFam] = useState('');
  const [method, setMethod] = useState<'card' | 'cash' | 'comp'>('card');
  const [last, setLast] = useState(false);
  if (open !== last) {
    setLast(open);
    if (open) {
      setQty({});
      setSeats(new Set());
      setName(buyer?.name ?? '');
      setEmail(buyer?.email ?? '');
      setFam('');
      setMethod(boxOffice ? 'cash' : 'card');
    }
  }
  const types = e.types.filter((t) => boxOffice || (t.category !== 'comp' && t.category !== 'staff'));
  const count = Object.values(qty).reduce((s, n) => s + n, 0);
  const total = e.types.reduce((s, t) => s + (qty[t.id] ?? 0) * t.price, 0);
  const famId = familyId ?? (fam || null);
  return (
    <FormModal
      open={open}
      onClose={onClose}
      title={boxOffice ? 'Box Office Sale' : 'Buy Tickets'}
      subtitle={`${e.name} · ${formatDate(e.date)} ${formatTime(e.time)}`}
      size="lg"
      saveLabel={boxOffice ? `Record sale (${money(total)})` : `Pay ${money(total)} (test)`}
      onSubmit={() => run(() => buyTickets({ ticketEventId: e.id, familyId: famId, buyerName: name, buyerEmail: email, lines: Object.entries(qty).map(([typeId, q]) => ({ typeId, qty: q })), seats: [...seats], source: boxOffice ? 'box_office' : 'parent', method }), boxOffice ? 'Sale recorded.' : 'Tickets purchased (test mode) — see them under My Tickets.') && onClose()}
    >
      {!boxOffice && (
        <div className="test-mode">
          <strong>Test mode.</strong> No card is charged and no card details are collected.
        </div>
      )}
      <div className="grid-2">
        <div className="field">
          <span className="field-label">Tickets</span>
          {types.map((t) => {
            const left = t.quantity - ticketsSold(db, e.id, t.id);
            return (
              <div key={t.id} className="qty-row">
                <span>
                  {t.name} <span className="faint small">{money(t.price)} · {left} left</span>
                </span>
                <input className="input input-qty" type="number" min={0} max={left} value={qty[t.id] ?? 0} onChange={(ev) => setQty({ ...qty, [t.id]: Math.max(0, Math.min(left, Number(ev.target.value))) })} aria-label={`${t.name} tickets`} />
              </div>
            );
          })}
          <p className="small">
            <strong>
              {count} ticket{count === 1 ? '' : 's'} · {money(total)}
            </strong>
          </p>
          <Field label="Buyer name" required>
            <input className="input" value={name} onChange={(ev) => setName(ev.target.value)} />
          </Field>
          <Field label="Email (for the receipt)">
            <input className="input" type="email" value={email} onChange={(ev) => setEmail(ev.target.value)} />
          </Field>
          {boxOffice && (
            <>
              <Field label="Studio family (optional — records the payment on their account)">
                <SearchSelect ariaLabel="Family" value={fam} onChange={setFam} options={db.families.map((x) => ({ value: x.id, label: x.name }))} noneLabel="Walk-up / not a family" />
              </Field>
              <Field label="Paid by">
                <select className="input" value={method} onChange={(ev) => setMethod(ev.target.value as typeof method)}>
                  <option value="cash">Cash</option>
                  <option value="card">Card (studio terminal)</option>
                  <option value="comp">Complimentary</option>
                </select>
              </Field>
            </>
          )}
        </div>
        {e.seatingRows > 0 && (
          <div>
            <span className="field-label">
              Choose {count} seat{count === 1 ? '' : 's'} ({seats.size} chosen)
            </span>
            <SeatMap
              e={e}
              taken={takenSeats(db, e.id)}
              selected={seats}
              onToggle={(s) => {
                const n = new Set(seats);
                if (n.has(s)) n.delete(s);
                else if (n.size < count) n.add(s);
                setSeats(n);
              }}
            />
          </div>
        )}
      </div>
      {e.notes && <p className="small faint">{e.notes}</p>}
    </FormModal>
  );
}

export { dancerOpts };

import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CheckCircle2, ClipboardList, Copy, HandHeart, Link2, Mail, Pencil, Plus, Printer, Trash2, UserPlus, Users, X } from 'lucide-react';
import { useDb } from '../data/store';
import { cancelOwnShift, deleteShift, deleteVolunteerForm, duplicateVolunteerForm, moveShift, saveVolunteerForm, setShiftStatus, signUpForJobs, type VolunteerFormInput, type VolunteerPerson } from '../data/planningActions';
import { activeShift, formStats, isFormAccepting, jobShifts, jobSpotsLeft, shiftStatusLabels } from '../data/planning';
import { availableSlots, formatDate, formatTime, volunteerName } from '../data/selectors';
import { newId, todayStr } from '../data/ids';
import { Badge, Card, DataTable, EmptyState, Field, PageHeader, SampleTag, SearchSelect, StatCard } from '../components/ui';
import { FormModal } from '../components/forms';
import { useConfirm, useRun, useToast } from '../components/feedback';
import { Progress } from '../components/charts';
import { openPrint } from './Print';
import { useViewer } from '../lib/session';
import type { Database, ID, ShiftStatus, VolunteerForm, VolunteerJob } from '../data/types';

const jobWhen = (j: Pick<VolunteerJob, 'date' | 'start' | 'end'>) => [j.date && formatDate(j.date), j.start && `${formatTime(j.start)}${j.end ? `–${formatTime(j.end)}` : ''}`].filter(Boolean).join(' · ');
const shiftTone: Record<ShiftStatus, 'neutral' | 'ready' | 'info' | 'danger'> = { signed_up: 'neutral', confirmed: 'info', checked_in: 'ready', no_show: 'danger', cancelled: 'neutral' };
const publicUrl = (id: ID) => `${location.origin}${location.pathname}#/volunteer/${id}`;
const sortJobs = (jobs: VolunteerJob[]) => [...jobs].sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999') || (a.start || '99').localeCompare(b.start || '99'));

const COMMON_JOBS: [string, string, number, string][] = [
  ['Backstage mom / dad', 'Supervise a dressing room and get dancers to the wings on time.', 4, 'Chaperone'],
  ['Quick-change helper', 'Help dancers with fast costume changes side-stage.', 2, 'Quick changes / dressing'],
  ['Hair & makeup', 'Buns and touch-ups for younger dancers.', 2, 'Hair & makeup'],
  ['Usher', 'Hand out programs and help guests find seats.', 4, 'Ushering'],
  ['Ticket table', 'Will-call and door sales.', 2, 'Ticketing'],
  ['Set up / clean up', 'Before and after the show.', 4, 'Set building'],
];

/* ============================================================ list page */

export function VolunteerSignupsPage() {
  const db = useDb();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  return (
    <>
      <PageHeader
        title="Volunteer Sign-ups"
        subtitle="Sign-up forms with job lists — families sign up in the Parent Portal or through a shareable link"
        actions={
          <button className="btn btn-primary" onClick={() => setCreating(true)}>
            <Plus size={16} /> New sign-up form
          </button>
        }
      />
      <Card>
        <DataTable
          rows={[...db.volunteerForms].sort((a, b) => (b.date || '').localeCompare(a.date || ''))}
          getId={(f) => f.id}
          empty={<EmptyState icon={<ClipboardList size={28} />} title="No sign-up forms yet" message="Create a form, list the jobs you need help with and how many people each needs, then share it with families." action={<button className="btn btn-primary" onClick={() => setCreating(true)}><Plus size={16} /> New sign-up form</button>} />}
          columns={[
            { key: 't', header: 'Form', render: (f) => <><Link to={`/volunteer-signups/${f.id}`} className="link-strong">{f.title}</Link> <SampleTag show={f.isSample} /><div className="small faint">{[f.date && formatDate(f.date), f.location].filter(Boolean).join(' · ')}</div></>, sortValue: (f) => f.title },
            { key: 'j', header: 'Jobs', render: (f) => f.jobs.length, sortValue: (f) => f.jobs.length, minor: true },
            {
              key: 'p',
              header: 'Filled',
              render: (f) => {
                const s = formStats(db, f);
                return s.needed ? <div className="progress-cell"><Progress value={s.filled} max={s.needed} label="Spots filled" /><span className="small faint">{s.filled}/{s.needed} spots</span></div> : <span className="small">{s.filled} signed up</span>;
              },
              sortValue: (f) => formStats(db, f).filled,
            },
            { key: 'v', header: 'Volunteers', render: (f) => formStats(db, f).people, sortValue: (f) => formStats(db, f).people, minor: true },
            { key: 's', header: 'Status', render: (f) => <div className="chips"><Badge tone={isFormAccepting(f) ? 'ready' : 'neutral'}>{isFormAccepting(f) ? 'Open' : 'Closed'}</Badge>{f.isPublic && <Badge tone="info">Public link</Badge>}</div> },
          ]}
        />
      </Card>
      <VolunteerFormEditor open={creating} onClose={() => setCreating(false)} onSaved={(id) => navigate(`/volunteer-signups/${id}`)} />
    </>
  );
}

/* ================================================================ editor */

function VolunteerFormEditor({ open, onClose, id, onSaved }: { open: boolean; onClose: () => void; id?: ID; onSaved?: (id: ID) => void }) {
  const db = useDb();
  const run = useRun();
  const blankJob = (date = ''): VolunteerJob => ({ id: newId(), title: '', description: '', date, start: '', end: '', needed: 1, skill: '' });
  const blank = (): VolunteerFormInput => ({ title: '', description: '', date: '', location: '', recitalId: null, deadline: '', open: true, isPublic: true, jobs: [blankJob()], notes: '' });
  const [f, setF] = useState<VolunteerFormInput>(blank);
  const [last, setLast] = useState<string | null>(null);
  const key = open ? id ?? 'new' : null;
  if (key !== last) {
    setLast(key);
    if (open) {
      const x = id ? db.volunteerForms.find((y) => y.id === id) : undefined;
      setF(x ? { ...blank(), ...x, jobs: x.jobs.map((j) => ({ ...j })) } : blank());
    }
  }
  const set = (p: Partial<VolunteerFormInput>) => setF({ ...f, ...p });
  const setJob = (jid: ID, p: Partial<VolunteerJob>) => set({ jobs: f.jobs.map((j) => (j.id === jid ? { ...j, ...p } : j)) });
  const skills = [...new Set([...db.settings.skills, ...db.volunteers.flatMap((v) => v.skills)])];
  const pickRecital = (rid: string) => {
    const r = db.recitals.find((x) => x.id === rid);
    set({ recitalId: rid || null, ...(r && !f.date ? { date: r.startDate, location: f.location || r.venue, title: f.title || `${r.name} Volunteers` } : {}) });
  };
  const addCommon = () => {
    const have = new Set(f.jobs.map((j) => j.title.toLowerCase()));
    const add = COMMON_JOBS.filter(([t]) => !have.has(t.toLowerCase())).map(([title, description, needed, skill]) => ({ ...blankJob(f.date), title, description, needed, skill }));
    set({ jobs: [...f.jobs.filter((j) => j.title.trim() || j.description.trim()), ...add] });
  };
  return (
    <FormModal open={open} onClose={onClose} title={id ? 'Edit sign-up form' : 'New volunteer sign-up form'} size="lg" onSubmit={() => { const s = run(() => saveVolunteerForm(f, id), 'Sign-up form saved.'); if (s) { onClose(); onSaved?.(s); } }}>
      <div className="grid-2">
        <Field label="Title" required>
          <input className="input" value={f.title} onChange={(e) => set({ title: e.target.value })} autoFocus placeholder="Spring Recital Volunteers" />
        </Field>
        <Field label="For recital">
          <select className="input" value={f.recitalId ?? ''} onChange={(e) => pickRecital(e.target.value)}>
            <option value="">None</option>
            {db.recitals.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Date">
          <input className="input" type="date" value={f.date} onChange={(e) => set({ date: e.target.value })} />
        </Field>
        <Field label="Location">
          <input className="input" value={f.location} onChange={(e) => set({ location: e.target.value })} />
        </Field>
        <Field label="Sign up by" hint="Leave empty for no deadline.">
          <input className="input" type="date" value={f.deadline} onChange={(e) => set({ deadline: e.target.value })} />
        </Field>
      </div>
      <Field label="Description (shown to volunteers)">
        <textarea className="input" rows={2} value={f.description} onChange={(e) => set({ description: e.target.value })} />
      </Field>
      <div className="field">
        <span className="field-label">Jobs</span>
        <div className="job-editor">
          {f.jobs.map((j, i) => (
            <div key={j.id} className="job-row">
              <div className="job-row-main">
                <input className="input" placeholder={`Job ${i + 1} title`} value={j.title} onChange={(e) => setJob(j.id, { title: e.target.value })} aria-label="Job title" />
                <input className="input" type="date" value={j.date} onChange={(e) => setJob(j.id, { date: e.target.value })} aria-label="Job date" />
                <input className="input" type="time" value={j.start} onChange={(e) => setJob(j.id, { start: e.target.value })} aria-label="Start time" />
                <input className="input" type="time" value={j.end} onChange={(e) => setJob(j.id, { end: e.target.value })} aria-label="End time" />
                <input className="input" type="number" min={0} value={j.needed} onChange={(e) => setJob(j.id, { needed: Number(e.target.value) })} aria-label="People needed" title="People needed (0 = no limit)" />
                <button type="button" className="icon-btn" aria-label="Remove job" onClick={() => set({ jobs: f.jobs.filter((x) => x.id !== j.id) })}>
                  <Trash2 size={14} />
                </button>
              </div>
              <div className="job-row-sub">
                <input className="input" placeholder="What the job involves" value={j.description} onChange={(e) => setJob(j.id, { description: e.target.value })} aria-label="Job description" />
                <select className="input" value={j.skill} onChange={(e) => setJob(j.id, { skill: e.target.value })} aria-label="Skill">
                  <option value="">Any skill</option>
                  {skills.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </div>
            </div>
          ))}
        </div>
        <p className="small faint">People needed: 0 means no limit (e.g. bake sale donations).</p>
        <div className="row-actions">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => set({ jobs: [...f.jobs, blankJob(f.date)] })}>
            <Plus size={14} /> Add job
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={addCommon}>
            <Plus size={14} /> Add common recital jobs
          </button>
        </div>
      </div>
      <Field label="Staff notes">
        <textarea className="input" rows={2} value={f.notes} onChange={(e) => set({ notes: e.target.value })} />
      </Field>
      <label className="check-inline">
        <input type="checkbox" checked={f.open} onChange={(e) => set({ open: e.target.checked })} /> Sign-ups are open (families see it in the Parent Portal)
      </label>
      <label className="check-inline">
        <input type="checkbox" checked={f.isPublic} onChange={(e) => set({ isPublic: e.target.checked })} /> Anyone with the link can sign up (grandparents, friends, alumni)
      </label>
    </FormModal>
  );
}

/* ================================================================ detail */

export function VolunteerFormPage() {
  const { id } = useParams();
  const db = useDb();
  const run = useRun();
  const toast = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState<ID | null>(null);
  const f = db.volunteerForms.find((x) => x.id === id);
  if (!f) {
    return (
      <>
        <PageHeader title="Sign-up form not found" back={{ to: '/volunteer-signups', label: 'Volunteer Sign-ups' }} />
        <EmptyState title="This form no longer exists" action={<Link to="/volunteer-signups" className="btn btn-primary">All sign-up forms</Link>} />
      </>
    );
  }
  const stats = formStats(db, f);
  const shifts = db.volunteerShifts.filter((s) => s.formId === f.id && activeShift(s));
  const emails = [...new Set(shifts.map((s) => db.volunteers.find((v) => v.id === s.volunteerId)?.email).filter(Boolean))] as string[];
  const accepting = isFormAccepting(f);
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(publicUrl(f.id));
      toast.success('Link copied. Paste it into an email, text or newsletter.');
    } catch {
      toast.info(publicUrl(f.id));
    }
  };
  return (
    <>
      <PageHeader
        back={{ to: '/volunteer-signups', label: 'Volunteer Sign-ups' }}
        title={
          <>
            {f.title} <SampleTag show={f.isSample} />
          </>
        }
        subtitle={[f.date && formatDate(f.date), f.location, f.deadline && `Sign up by ${formatDate(f.deadline)}`].filter(Boolean).join(' · ') || 'Volunteer sign-up form'}
        actions={
          <>
            <button className="btn btn-ghost" onClick={() => openPrint('volunteerform', { id: f.id })}>
              <Printer size={16} /> Print sign-up sheet
            </button>
            {emails.length > 0 && (
              <a className="btn btn-ghost" href={`mailto:?bcc=${encodeURIComponent(emails.join(','))}&subject=${encodeURIComponent(f.title)}`} title="Opens your email app with everyone signed up in BCC">
                <Mail size={16} /> Email volunteers ({emails.length})
              </a>
            )}
            {f.isPublic && (
              <button className="btn btn-ghost" onClick={copyLink}>
                <Link2 size={16} /> Copy sign-up link
              </button>
            )}
            <button className="btn btn-ghost danger" onClick={async () => { if (await confirm({ title: `Delete ${f.title}?`, message: 'Its jobs and sign-ups are deleted. Volunteers stay in your Volunteers list.', confirmLabel: 'Delete', danger: true })) if (run(() => (deleteVolunteerForm(f.id), true), 'Deleted.')) navigate('/volunteer-signups'); }}>
              <Trash2 size={16} /> Delete
            </button>
            <button className="btn btn-ghost" onClick={() => { const c = run(() => duplicateVolunteerForm(f.id), 'Copied — it starts closed so you can edit dates first.'); if (c) navigate(`/volunteer-signups/${c}`); }}>
              <Copy size={16} /> Duplicate
            </button>
            <button className="btn btn-ghost" onClick={() => run(() => saveVolunteerForm({ ...f, open: !f.open }, f.id), f.open ? 'Sign-ups closed.' : 'Sign-ups opened.')}>
              {f.open ? 'Close sign-ups' : 'Open sign-ups'}
            </button>
            <button className="btn btn-primary" onClick={() => setEditing(true)}>
              <Pencil size={16} /> Edit
            </button>
          </>
        }
      />
      <div className="stats stats-4">
        <StatCard label="Spots filled" value={stats.needed ? `${stats.filled}/${stats.needed}` : stats.filled} icon={<CheckCircle2 size={20} />} tone="sage" />
        <StatCard label="Volunteers" value={stats.people} icon={<Users size={20} />} tone="rose" />
        <StatCard label="Jobs still needing help" value={stats.openJobs} icon={<HandHeart size={20} />} tone={stats.openJobs ? 'amber' : 'slate'} hint={`${f.jobs.length} jobs`} />
        <StatCard label="Sign-ups" value={accepting ? 'Open' : 'Closed'} icon={<ClipboardList size={20} />} tone={accepting ? 'plum' : 'slate'} hint={f.isPublic ? 'Public link on' : 'Portal families only'} />
      </div>
      {f.description && (
        <Card>
          <p className="prewrap small">{f.description}</p>
        </Card>
      )}
      <div className="job-grid">
        {sortJobs(f.jobs).map((j) => (
          <JobCard key={j.id} db={db} form={f} job={j} onAdd={() => setAdding(j.id)} />
        ))}
      </div>
      <VolunteerFormEditor open={editing} id={f.id} onClose={() => setEditing(false)} />
      {adding && <AddVolunteerDialog form={f} jobId={adding} onClose={() => setAdding(null)} />}
    </>
  );
}

function JobCard({ db, form, job, onAdd }: { db: Database; form: VolunteerForm; job: VolunteerJob; onAdd: () => void }) {
  const run = useRun();
  const confirm = useConfirm();
  const list = jobShifts(db, form.id, job.id);
  const left = jobSpotsLeft(db, form, job.id);
  const cancelled = db.volunteerShifts.filter((s) => s.formId === form.id && s.jobId === job.id && s.status === 'cancelled');
  return (
    <Card
      title={job.title}
      actions={
        <>
          <Badge tone={left === 0 ? 'ready' : left === null ? 'info' : 'progress'}>{left === null ? `${list.length} signed up` : left === 0 ? 'Full' : `${left} of ${job.needed} needed`}</Badge>
          <button className="btn btn-ghost btn-sm" onClick={onAdd}>
            <UserPlus size={14} /> Add
          </button>
        </>
      }
    >
      <div className="small faint">{[jobWhen(job), job.skill && `Skill: ${job.skill}`].filter(Boolean).join(' · ')}</div>
      {job.description && <p className="small">{job.description}</p>}
      {job.needed > 0 && <Progress value={list.length} max={job.needed} label="Filled" />}
      {!list.length ? (
        <p className="faint small pad">Nobody yet.</p>
      ) : (
        <ul className="mini-list">
          {list.map((s) => {
            const v = db.volunteers.find((x) => x.id === s.volunteerId);
            return (
              <li key={s.id}>
                <div>
                  {v ? <Link to={`/volunteers/${v.id}`} className="link-strong">{volunteerName(v)}</Link> : 'Removed volunteer'}
                  <div className="small faint">{[v?.phone, v?.email].filter(Boolean).join(' · ')}</div>
                  {s.note && <div className="small">“{s.note}”</div>}
                </div>
                <span className="row-actions">
                  <select className="input input-sm" value={s.status} onChange={(e) => run(() => setShiftStatus(s.id, e.target.value as ShiftStatus))} aria-label="Status">
                    {(Object.keys(shiftStatusLabels) as ShiftStatus[]).map((k) => (
                      <option key={k} value={k}>
                        {shiftStatusLabels[k]}
                      </option>
                    ))}
                  </select>
                  {form.jobs.length > 1 && (
                    <select className="input input-sm" value="" onChange={(e) => e.target.value && run(() => moveShift(s.id, e.target.value), 'Moved.')} aria-label="Move to another job">
                      <option value="">Move to…</option>
                      {form.jobs
                        .filter((x) => x.id !== job.id)
                        .map((x) => (
                          <option key={x.id} value={x.id}>
                            {x.title}
                          </option>
                        ))}
                    </select>
                  )}
                  <button className="icon-btn" aria-label="Remove from job" onClick={async () => { if (await confirm({ title: 'Remove from this job?', message: `${v ? volunteerName(v) : 'This volunteer'} will be removed from ${job.title}.`, confirmLabel: 'Remove' })) run(() => deleteShift(s.id), 'Removed.'); }}>
                    <X size={15} />
                  </button>
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {cancelled.length > 0 && <p className="small faint">{cancelled.length} cancelled</p>}
    </Card>
  );
}

function AddVolunteerDialog({ form, jobId, onClose }: { form: VolunteerForm; jobId: ID; onClose: () => void }) {
  const db = useDb();
  const run = useRun();
  const job = form.jobs.find((j) => j.id === jobId)!;
  const [mode, setMode] = useState<'existing' | 'new'>(db.volunteers.length ? 'existing' : 'new');
  const [vid, setVid] = useState('');
  const [p, setP] = useState<VolunteerPerson>({ firstName: '', lastName: '', email: '', phone: '' });
  const taken = new Set(jobShifts(db, form.id, jobId).map((s) => s.volunteerId));
  const date = job.date || form.date;
  const opts = db.volunteers
    .filter((v) => !taken.has(v.id))
    .map((v) => {
      const avail = date ? availableSlots(v, date, job.start || undefined).length > 0 : false;
      const skill = job.skill && v.skills.includes(job.skill);
      return { v, avail, skill, score: (avail ? 2 : 0) + (skill ? 1 : 0) };
    })
    .sort((a, b) => b.score - a.score || volunteerName(a.v).localeCompare(volunteerName(b.v)))
    .map(({ v, avail, skill }) => ({ value: v.id, label: volunteerName(v), hint: [avail && 'available', skill && job.skill, !avail && !skill && v.skills.slice(0, 2).join(', ')].filter(Boolean).join(' · '), group: avail || skill ? 'Good match' : 'Other volunteers' }));
  return (
    <FormModal
      open
      onClose={onClose}
      title={`Add to ${job.title}`}
      subtitle={jobWhen(job) || undefined}
      size="sm"
      saveLabel="Add"
      onSubmit={() => run(() => signUpForJobs(form.id, [jobId], p, { staff: true, volunteerId: mode === 'existing' ? vid || undefined : undefined }), 'Added.') && onClose()}
    >
      <div className="segmented full">
        <button type="button" className={mode === 'existing' ? 'on' : ''} onClick={() => setMode('existing')}>
          Existing volunteer
        </button>
        <button type="button" className={mode === 'new' ? 'on' : ''} onClick={() => setMode('new')}>
          New person
        </button>
      </div>
      {mode === 'existing' ? (
        <Field label="Volunteer" hint="Volunteers available on this date or with the right skill are listed first.">
          <SearchSelect ariaLabel="Volunteer" value={vid} onChange={setVid} options={opts} />
        </Field>
      ) : (
        <PersonFields p={p} setP={setP} />
      )}
    </FormModal>
  );
}

function PersonFields({ p, setP }: { p: VolunteerPerson; setP: (p: VolunteerPerson) => void }) {
  const set = (x: Partial<VolunteerPerson>) => setP({ ...p, ...x });
  return (
    <div className="grid-2">
      <Field label="First name" required>
        <input className="input" value={p.firstName} onChange={(e) => set({ firstName: e.target.value })} autoComplete="given-name" />
      </Field>
      <Field label="Last name">
        <input className="input" value={p.lastName} onChange={(e) => set({ lastName: e.target.value })} autoComplete="family-name" />
      </Field>
      <Field label="Email">
        <input className="input" type="email" value={p.email} onChange={(e) => set({ email: e.target.value })} autoComplete="email" />
      </Field>
      <Field label="Phone">
        <input className="input" type="tel" value={p.phone} onChange={(e) => set({ phone: e.target.value })} autoComplete="tel" />
      </Field>
    </div>
  );
}

/** Card for a volunteer's profile: the jobs they've signed up for. */
export function VolunteerShiftsCard({ volunteerId }: { volunteerId: ID }) {
  const db = useDb();
  const shifts = db.volunteerShifts.filter((s) => s.volunteerId === volunteerId);
  return (
    <Card title="Sign-ups" icon={<ClipboardList size={18} />} actions={<Link to="/volunteer-signups" className="btn btn-ghost btn-sm">All forms</Link>}>
      {!shifts.length ? (
        <p className="faint pad">Not signed up for any jobs yet.</p>
      ) : (
        <ul className="mini-list">
          {shifts.map((s) => {
            const f = db.volunteerForms.find((x) => x.id === s.formId);
            const j = f?.jobs.find((x) => x.id === s.jobId);
            if (!f || !j) return null;
            return (
              <li key={s.id}>
                <div>
                  <Link to={`/volunteer-signups/${f.id}`} className="link-strong">
                    {j.title}
                  </Link>
                  <div className="small faint">
                    {f.title}
                    {jobWhen(j) && ` · ${jobWhen(j)}`}
                  </div>
                </div>
                <Badge tone={shiftTone[s.status]}>{shiftStatusLabels[s.status]}</Badge>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

/* ====================================================== family sign-up */

function SignUpBody({ form, familyId, person, onDone }: { form: VolunteerForm; familyId: ID | null; person: VolunteerPerson; onDone: (msg: string) => void }) {
  const db = useDb();
  const run = useRun();
  const [p, setP] = useState<VolunteerPerson>(person);
  const [jobs, setJobs] = useState<Set<ID>>(new Set());
  const [note, setNote] = useState('');
  const toggle = (id: ID) => {
    const n = new Set(jobs);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    setJobs(n);
  };
  const submit = () => {
    const r = run(() => signUpForJobs(form.id, [...jobs], p, { familyId, note }));
    if (r) {
      setJobs(new Set());
      onDone(`Thank you! You're signed up for ${jobs.size} job${jobs.size === 1 ? '' : 's'}.`);
    }
  };
  return (
    <>
      <ul className="job-pick">
        {sortJobs(form.jobs).map((j) => {
          const left = jobSpotsLeft(db, form, j.id);
          const full = left === 0;
          return (
            <li key={j.id} className={full ? 'full' : jobs.has(j.id) ? 'on' : ''}>
              <label>
                <input type="checkbox" disabled={full} checked={jobs.has(j.id)} onChange={() => toggle(j.id)} />
                <span>
                  <strong>{j.title}</strong>
                  <span className="small faint"> {jobWhen(j) && `· ${jobWhen(j)}`}</span>
                  {j.description && <div className="small">{j.description}</div>}
                </span>
                <span className="small">{full ? <Badge>Full</Badge> : left === null ? '' : `${left} spot${left === 1 ? '' : 's'} left`}</span>
              </label>
            </li>
          );
        })}
      </ul>
      <PersonFields p={p} setP={setP} />
      <Field label="Note for the studio (optional)">
        <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. I can stay late" />
      </Field>
      <button className="btn btn-primary" disabled={!jobs.size} onClick={submit}>
        <CheckCircle2 size={16} /> Sign me up{jobs.size ? ` for ${jobs.size} job${jobs.size === 1 ? '' : 's'}` : ''}
      </button>
    </>
  );
}

export function ParentVolunteerPage() {
  const db = useDb();
  const v = useViewer();
  const run = useRun();
  const toast = useToast();
  const confirm = useConfirm();
  const [openForm, setOpenForm] = useState<ID | null>(null);
  const familyId = v.familyId;
  if (!familyId) return <EmptyState title="No family linked" message="This login isn't connected to a family yet. Please contact the studio office." />;
  const g = db.guardians.find((x) => x.familyId === familyId && x.isPrimary) ?? db.guardians.find((x) => x.familyId === familyId);
  const person: VolunteerPerson = { firstName: g?.firstName ?? '', lastName: g?.lastName ?? '', email: g?.email ?? '', phone: g?.phone ?? '' };
  const guardianEmails = new Set(db.guardians.filter((x) => x.familyId === familyId && x.email).map((x) => x.email.toLowerCase()));
  const familyVolunteers = new Set(db.volunteers.filter((x) => x.email && guardianEmails.has(x.email.toLowerCase())).map((x) => x.id));
  const mine = db.volunteerShifts.filter((s) => s.status !== 'cancelled' && (s.familyId === familyId || familyVolunteers.has(s.volunteerId)));
  const today = todayStr();
  const forms = db.volunteerForms.filter((f) => isFormAccepting(f, today) && (!f.date || f.date >= today));
  return (
    <>
      <PageHeader title="Volunteer" subtitle="Lend a hand at recitals and events — pick a job that suits you" />
      {mine.length > 0 && (
        <Card title="Your sign-ups" icon={<HandHeart size={18} />}>
          <ul className="mini-list">
            {mine.map((s) => {
              const f = db.volunteerForms.find((x) => x.id === s.formId);
              const j = f?.jobs.find((x) => x.id === s.jobId);
              const who = db.volunteers.find((x) => x.id === s.volunteerId);
              if (!f || !j) return null;
              return (
                <li key={s.id}>
                  <div>
                    <strong>{j.title}</strong> <span className="small faint">· {f.title}</span>
                    <div className="small faint">{[jobWhen(j), who && volunteerName(who)].filter(Boolean).join(' · ')}</div>
                  </div>
                  <span className="row-actions">
                    <Badge tone={shiftTone[s.status]}>{shiftStatusLabels[s.status]}</Badge>
                    {s.familyId === familyId && s.status === 'signed_up' && (
                      <button className="btn btn-ghost btn-sm" onClick={async () => { if (await confirm({ title: 'Cancel this sign-up?', message: `You'll be removed from ${j.title}.`, confirmLabel: 'Cancel sign-up' })) run(() => cancelOwnShift(s.id, familyId), 'Sign-up cancelled.'); }}>
                        Cancel
                      </button>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
      {!forms.length ? (
        <EmptyState icon={<ClipboardList size={28} />} title="No volunteer sign-ups open right now" message="Thank you for wanting to help! Check back before the next recital." />
      ) : (
        forms.map((f) => {
          const s = formStats(db, f);
          return (
            <Card key={f.id} title={f.title} icon={<ClipboardList size={18} />} actions={openForm !== f.id && <button className="btn btn-primary btn-sm" onClick={() => setOpenForm(f.id)}>Sign up</button>}>
              <p className="small">
                {[f.date && formatDate(f.date), f.location, f.deadline && `Sign up by ${formatDate(f.deadline)}`].filter(Boolean).join(' · ')}
                {s.needed > 0 && <span className="faint"> · {Math.max(0, s.needed - s.filled)} spots still needed</span>}
              </p>
              {f.description && <p className="small prewrap">{f.description}</p>}
              {openForm === f.id && <SignUpBody form={f} familyId={familyId} person={person} onDone={(m) => { toast.success(m); setOpenForm(null); }} />}
            </Card>
          );
        })
      )}
    </>
  );
}

/* ============================================================== public */

export function PublicVolunteerPage() {
  const { id } = useParams();
  const db = useDb();
  const [done, setDone] = useState('');
  const f = db.volunteerForms.find((x) => x.id === id);
  return (
    <div className="public-wrap">
      <header className="public-head">
        <a href="#/site">{db.settings.studioName}</a>
      </header>
      {!f || !f.isPublic ? (
        <EmptyState title="Sign-up form not found" message="Please check the link with the studio." />
      ) : (
        <>
          <h1 className="public-title">{f.title}</h1>
          <p className="center small">{[f.date && formatDate(f.date), f.location, f.deadline && `Sign up by ${formatDate(f.deadline)}`].filter(Boolean).join(' · ')}</p>
          {f.description && <p className="prewrap">{f.description}</p>}
          {done ? (
            <Card>
              <div className="done-box">
                <CheckCircle2 size={28} />
                <h3>{done}</h3>
                <p className="small">The studio has your details and will be in touch. You can close this page.</p>
                <button className="btn btn-ghost" onClick={() => setDone('')}>
                  Sign up someone else
                </button>
              </div>
            </Card>
          ) : !isFormAccepting(f) ? (
            <EmptyState title="Sign-ups are closed" message="Thank you for your interest! Please contact the studio if you'd still like to help." />
          ) : (
            <Card>
              <div className="form">
                <SignUpBody form={f} familyId={null} person={{ firstName: '', lastName: '', email: '', phone: '' }} onDone={setDone} />
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

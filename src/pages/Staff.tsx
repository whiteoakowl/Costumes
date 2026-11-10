import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { GraduationCap, Mail, Pencil, Phone, Plus, Power, Trash2 } from 'lucide-react';
import { useDb } from '../data/store';
import { deleteStaff, saveStaff, setStaffStatus, type StaffInput } from '../data/studioActions';
import { fullName } from '../data/selectors';
import { enrolledDancerIds, hoursKindLabels, occurrencesBetween, payrollSummary, positionLabels, staffName, WEEKDAY_NAMES } from '../data/studio';
import { Badge, Card, DataTable, EmptyState, Field, PageHeader, SampleTag, SearchInput, Tabs, type Column } from '../components/ui';
import { FormModal } from '../components/forms';
import { useConfirm, useRun } from '../components/feedback';
import { classWhen, money } from '../components/studioUi';
import { useViewer } from '../lib/session';
import { addDays } from '../data/studio';
import { todayStr } from '../data/ids';
import type { ID, StaffMember } from '../data/types';

type Tab = 'teacher' | 'assistant' | 'substitute' | 'other';
const tabOf = (s: StaffMember): Tab => (s.position === 'teacher' || s.position === 'assistant' || s.position === 'substitute' ? s.position : 'other');

export function StaffPage() {
  const db = useDb();
  const v = useViewer();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('teacher');
  const [q, setQ] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [adding, setAdding] = useState(() => new URLSearchParams(location.hash.split('?')[1] ?? '').get('new') === '1');
  const rows = db.staff.filter((s) => tabOf(s) === tab && (showInactive || s.status === 'active') && (!q || `${staffName(s)} ${s.email} ${s.styles.join(' ')} ${s.title}`.toLowerCase().includes(q.toLowerCase())));
  const count = (t: Tab) => db.staff.filter((s) => tabOf(s) === t && s.status === 'active').length;
  const columns: Column<StaffMember>[] = [
    {
      key: 'name',
      header: 'Name',
      render: (s) => (
        <>
          <Link to={`/staff/${s.id}`} className="link-strong">
            {staffName(s)}
          </Link>
          <SampleTag show={s.isSample} />
          <div className="small faint">{s.title || positionLabels[s.position]}</div>
        </>
      ),
      sortValue: (s) => `${s.lastName} ${s.firstName}`,
    },
    { key: 'contact', header: 'Contact', render: (s) => <div className="small">{s.email && <div>{s.email}</div>}{s.phone && <div>{s.phone}</div>}</div>, minor: true },
    { key: 'styles', header: 'Dance styles', render: (s) => <span className="small">{s.styles.join(', ') || '—'}</span>, minor: true },
    {
      key: 'classes',
      header: 'Classes',
      render: (s) => db.classes.filter((c) => c.teacherId === s.id || c.assistantId === s.id).length,
      sortValue: (s) => db.classes.filter((c) => c.teacherId === s.id || c.assistantId === s.id).length,
    },
    ...(v.can('payroll.view') ? [{ key: 'pay', header: 'Pay', render: (s: StaffMember) => <span className="small">{s.payType === 'hourly' ? `${money(s.payRate)}/hr` : `${money(s.payRate)}/yr`}</span>, sortValue: (s: StaffMember) => s.payRate }] : []),
    { key: 'status', header: 'Status', render: (s) => <Badge tone={s.status === 'active' ? 'ready' : 'neutral'}>{s.status === 'active' ? 'Active' : 'Inactive'}</Badge> },
  ];
  return (
    <>
      <PageHeader
        title="Teachers & Staff"
        subtitle="Teachers, assistants, substitutes and other studio staff"
        actions={
          v.can('staff.edit') && (
            <button className="btn btn-primary" onClick={() => setAdding(true)}>
              <Plus size={16} /> Add staff member
            </button>
          )
        }
      />
      <Card>
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            { value: 'teacher', label: 'Teachers', count: count('teacher') },
            { value: 'assistant', label: 'Assistant Teachers', count: count('assistant') },
            { value: 'substitute', label: 'Substitutes', count: count('substitute') },
            { value: 'other', label: 'Other Staff', count: count('other') },
          ]}
        />
        <div className="toolbar">
          <SearchInput value={q} onChange={setQ} placeholder="Search name, style, email…" />
          <label className="check-inline">
            <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} /> Show inactive
          </label>
        </div>
        <DataTable rows={rows} columns={columns} getId={(s) => s.id} initialSort={{ key: 'name', dir: 'asc' }} empty={<EmptyState icon={<GraduationCap size={28} />} title="Nobody here yet" message="Add teachers, assistants, substitutes and other staff." />} />
      </Card>
      <StaffForm open={adding} onClose={() => setAdding(false)} defaultPosition={tab === 'other' ? 'office' : tab} onSaved={(id) => navigate(`/staff/${id}`)} />
    </>
  );
}

export function StaffForm({ open, onClose, id, onSaved, defaultPosition = 'teacher' }: { open: boolean; onClose: () => void; id?: ID; onSaved?: (id: ID) => void; defaultPosition?: StaffMember['position'] }) {
  const db = useDb();
  const v = useViewer();
  const run = useRun();
  const empty: StaffInput = { firstName: '', lastName: '', email: '', phone: '', address: '', emergencyContact: '', hireDate: todayStr(), position: defaultPosition, title: '', styles: [], qualifications: '', payType: 'hourly', payRate: 0, status: 'active', notes: '' };
  const [s, setS] = useState<StaffInput>(empty);
  const [last, setLast] = useState<string | null>(null);
  const key = open ? id ?? 'new' : null;
  if (key !== last) {
    setLast(key);
    const x = id ? db.staff.find((y) => y.id === id) : undefined;
    if (open) setS(x ? { ...x, styles: [...x.styles] } : empty);
  }
  const set = <K extends keyof StaffInput>(k: K, val: StaffInput[K]) => setS((p) => ({ ...p, [k]: val }));
  const styles = [...new Set([...db.settings.danceStyles, ...s.styles])];
  return (
    <FormModal
      open={open}
      onClose={onClose}
      title={id ? 'Edit Staff Member' : 'Add Staff Member'}
      size="lg"
      onSubmit={() => {
        const saved = run(() => saveStaff(s, id), id ? 'Staff member updated.' : `${s.firstName.trim()} added.`);
        if (saved) {
          onClose();
          onSaved?.(saved);
        }
      }}
    >
      <div className="grid-2">
        <Field label="First name" required>
          <input className="input" value={s.firstName} onChange={(e) => set('firstName', e.target.value)} autoFocus />
        </Field>
        <Field label="Last name" required>
          <input className="input" value={s.lastName} onChange={(e) => set('lastName', e.target.value)} />
        </Field>
        <Field label="Position">
          <select className="input" value={s.position} onChange={(e) => set('position', e.target.value as StaffMember['position'])}>
            {Object.entries(positionLabels).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Title">
          <input className="input" value={s.title} onChange={(e) => set('title', e.target.value)} placeholder="e.g. Ballet Director" />
        </Field>
        <Field label="Email">
          <input className="input" type="email" value={s.email} onChange={(e) => set('email', e.target.value)} />
        </Field>
        <Field label="Phone">
          <input className="input" type="tel" value={s.phone} onChange={(e) => set('phone', e.target.value)} />
        </Field>
        <Field label="Address" className="span-2">
          <input className="input" value={s.address} onChange={(e) => set('address', e.target.value)} />
        </Field>
        <Field label="Emergency contact">
          <input className="input" value={s.emergencyContact} onChange={(e) => set('emergencyContact', e.target.value)} placeholder="Name & phone" />
        </Field>
        <Field label="Hire date">
          <input className="input" type="date" value={s.hireDate} onChange={(e) => set('hireDate', e.target.value)} />
        </Field>
        {v.can('payroll.view') && (
          <>
            <Field label="Pay type">
              <select className="input" value={s.payType} onChange={(e) => set('payType', e.target.value as StaffMember['payType'])}>
                <option value="hourly">Hourly</option>
                <option value="salary">Salary</option>
              </select>
            </Field>
            <Field label={s.payType === 'hourly' ? 'Hourly rate ($)' : 'Annual salary ($)'}>
              <input className="input" type="number" min={0} step="0.01" value={s.payRate} onChange={(e) => set('payRate', Number(e.target.value))} />
            </Field>
          </>
        )}
      </div>
      <div className="field">
        <span className="field-label">Dance styles</span>
        <div className="chips">
          {styles.map((st) => (
            <button key={st} type="button" className={`chip chip-btn ${s.styles.includes(st) ? 'on' : ''}`} onClick={() => set('styles', s.styles.includes(st) ? s.styles.filter((x) => x !== st) : [...s.styles, st])}>
              {st}
            </button>
          ))}
        </div>
      </div>
      <Field label="Qualifications">
        <textarea className="input" rows={2} value={s.qualifications} onChange={(e) => set('qualifications', e.target.value)} />
      </Field>
      <Field label="Notes">
        <textarea className="input" rows={2} value={s.notes} onChange={(e) => set('notes', e.target.value)} />
      </Field>
    </FormModal>
  );
}

export function StaffDetailPage() {
  const { id } = useParams();
  const db = useDb();
  const v = useViewer();
  const run = useRun();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const s = db.staff.find((x) => x.id === id);
  if (!s) return <EmptyState title="Staff member not found" action={<Link to="/staff" className="btn btn-primary">Back to staff</Link>} />;
  const classes = db.classes.filter((c) => c.teacherId === s.id || c.assistantId === s.id).sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.startTime.localeCompare(b.startTime));
  const students = [...new Set(classes.flatMap((c) => enrolledDancerIds(db, c.id)))].map((d) => db.dancers.find((x) => x.id === d)).filter(Boolean);
  const today = todayStr();
  const upcoming = occurrencesBetween(db, today, addDays(today, 13), { includeCancelled: true }).filter((o) => o.teacherId === s.id || o.assistantId === s.id || o.regularTeacherId === s.id);
  const recent = occurrencesBetween(db, addDays(today, -28), addDays(today, -1)).filter((o) => o.teacherId === s.id || o.assistantId === s.id);
  const entries = db.timeEntries.filter((e) => e.staffId === s.id);
  const summary = payrollSummary(db, entries)[0];
  return (
    <>
      <PageHeader
        back={{ to: '/staff', label: 'Teachers & Staff' }}
        title={
          <>
            {staffName(s)} <SampleTag show={s.isSample} />
          </>
        }
        subtitle={`${s.title || positionLabels[s.position]} · ${s.status === 'active' ? 'Active' : 'Inactive'}`}
        actions={
          v.can('staff.edit') && (
            <>
              <button
                className="btn btn-ghost danger"
                onClick={async () => {
                  if (await confirm({ title: 'Delete staff member?', message: `Delete ${staffName(s)}? Their classes become unassigned and their login is deactivated. Hours history is kept. Consider deactivating instead.`, confirmLabel: 'Delete', danger: true }))
                    if (run(() => (deleteStaff(s.id), true), 'Staff member deleted.')) navigate('/staff');
                }}
              >
                <Trash2 size={16} /> Delete
              </button>
              <button className="btn btn-ghost" onClick={() => run(() => setStaffStatus(s.id, s.status === 'active' ? 'inactive' : 'active'), s.status === 'active' ? 'Deactivated.' : 'Reactivated.')}>
                <Power size={16} /> {s.status === 'active' ? 'Deactivate' : 'Reactivate'}
              </button>
              <button className="btn btn-primary" onClick={() => setEditing(true)}>
                <Pencil size={16} /> Edit
              </button>
            </>
          )
        }
      />
      <div className="detail-grid">
        <div className="stack">
          <Card title="Profile">
            <div className="contact-links">
              {s.email && (
                <a href={`mailto:${s.email}`}>
                  <Mail size={14} /> {s.email}
                </a>
              )}
              {s.phone && (
                <a href={`tel:${s.phone.replace(/[^\d+]/g, '')}`}>
                  <Phone size={14} /> {s.phone}
                </a>
              )}
            </div>
            <dl className="dl">
              <dt>Position</dt>
              <dd>{positionLabels[s.position]}</dd>
              <dt>Hire date</dt>
              <dd>{s.hireDate || '—'}</dd>
              <dt>Dance styles</dt>
              <dd>{s.styles.join(', ') || '—'}</dd>
              <dt>Qualifications</dt>
              <dd className="prewrap">{s.qualifications || '—'}</dd>
              <dt>Address</dt>
              <dd>{s.address || '—'}</dd>
              <dt>Emergency contact</dt>
              <dd>{s.emergencyContact || '—'}</dd>
              {v.can('payroll.view') && (
                <>
                  <dt>Pay</dt>
                  <dd>{s.payType === 'hourly' ? `${money(s.payRate)} per hour` : `${money(s.payRate)} per year`}</dd>
                </>
              )}
              <dt>Notes</dt>
              <dd className="prewrap">{s.notes || '—'}</dd>
            </dl>
          </Card>
          {v.can('payroll.view') && (
            <Card title="Hours" actions={<Link to={`/hours?staff=${s.id}`} className="btn btn-ghost btn-sm">All hours</Link>}>
              {!entries.length ? (
                <p className="faint pad">No hours recorded.</p>
              ) : (
                <dl className="dl">
                  <dt>Approved</dt>
                  <dd>{summary?.approvedHours.toFixed(2) ?? 0} h</dd>
                  <dt>Pending approval</dt>
                  <dd>{summary?.pendingHours.toFixed(2) ?? 0} h</dd>
                  <dt>Approved pay</dt>
                  <dd>{money(summary?.pay ?? 0)}</dd>
                  {summary &&
                    Object.entries(summary.byKind).map(([k, h]) => (
                      <div key={k} className="dl-row">
                        <dt>{hoursKindLabels[k as keyof typeof hoursKindLabels]}</dt>
                        <dd>{h.toFixed(2)} h</dd>
                      </div>
                    ))}
                </dl>
              )}
            </Card>
          )}
        </div>
        <div className="stack">
          <Card title={`Assigned Classes (${classes.length})`}>
            {!classes.length ? (
              <p className="faint pad">Not assigned to any classes. Assign teachers when creating or editing a class.</p>
            ) : (
              <ul className="mini-list">
                {classes.map((c) => {
                  const y = db.schoolYears.find((x) => x.id === c.schoolYearId);
                  return (
                    <li key={c.id}>
                      <div>
                        <Link to={`/classes/${c.id}`} className="link-strong">
                          {c.name}
                        </Link>
                        <div className="small faint">
                          {classWhen(c)} · {db.classrooms.find((r) => r.id === c.classroomId)?.name ?? 'No room'} · {y?.name} · {c.teacherId === s.id ? 'Teacher' : 'Assistant'}
                        </div>
                      </div>
                      <span className="small">{enrolledDancerIds(db, c.id).length} dancers</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
          <Card title="Next Two Weeks">
            {!upcoming.length ? (
              <p className="faint pad">Nothing scheduled.</p>
            ) : (
              <ul className="mini-list">
                {upcoming.map((o) => (
                  <li key={o.key} className={o.cancelled ? 'muted' : ''}>
                    <div>
                      <strong>{WEEKDAY_NAMES[new Date(o.date + 'T12:00').getDay()].slice(0, 3)} {o.date}</strong> · {o.cls.name}
                      <div className="small faint">
                        {o.start}–{o.end}
                        {o.cancelled && ` · Cancelled: ${o.cancelReason}`}
                        {o.substituted && o.regularTeacherId === s.id && ` · Substitute: ${staffName(db.staff.find((x) => x.id === o.teacherId))}`}
                        {o.substituted && o.teacherId === s.id && ' · You are substituting'}
                      </div>
                    </div>
                    {o.cancelled ? <Badge>Cancelled</Badge> : o.substituted ? <Badge tone="info">Substitute</Badge> : null}
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title={`Class History (last 4 weeks: ${recent.length} classes)`}>
            {!recent.length ? (
              <p className="faint pad">No classes taught recently.</p>
            ) : (
              <ul className="mini-list">
                {recent
                  .slice()
                  .reverse()
                  .map((o) => {
                    const taken = db.attendance.filter((a) => a.classId === o.classId && a.date === o.date);
                    return (
                      <li key={o.key}>
                        <span>
                          {o.date} · {o.cls.name}
                        </span>
                        <span className="small faint">{taken.length ? `Attendance: ${taken.filter((a) => a.status === 'present' || a.status === 'late').length}/${taken.length} present` : 'Attendance not taken'}</span>
                      </li>
                    );
                  })}
              </ul>
            )}
          </Card>
          <Card title={`Students (${students.length})`}>
            <div className="chips">
              {students.map((d) => (
                <Link key={d!.id} to={`/dancers/${d!.id}`} className="chip">
                  {fullName(d!)}
                </Link>
              ))}
              {!students.length && <span className="faint small">No students yet.</span>}
            </div>
          </Card>
        </div>
      </div>
      <StaffForm open={editing} id={s.id} onClose={() => setEditing(false)} />
    </>
  );
}

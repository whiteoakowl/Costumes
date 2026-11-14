import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, CalendarClock, Camera, CheckCircle2, Clock, Copy, Pencil, Plus, Printer, Ruler, Send, Shuffle, Trash2, UserPlus, Users, Wrench, X } from 'lucide-react';
import { useDb } from '../data/store';
import {
  autoSchedule,
  bookSlot,
  cancelBooking,
  deleteScheduleDay,
  deleteSlots,
  duplicateScheduleDay,
  generateSlots,
  linkDancers,
  moveDancer,
  notifyScheduleFamilies,
  saveScheduleDay,
  saveSlot,
  setOutcome,
  unlinkDancer,
  type AutoScheduleInput,
  type ScheduleDayInput,
  type SlotInput,
} from '../data/planningActions';
import { createWorkOrders } from '../data/actions';
import { dayConflicts, dayDancerSlots, dayProgress, daySlots, familyAppointments, fittingCostumes, nextFreeTime, outcomeLabels, outcomeTone, scheduleKindLabels, siblingSplits, slotDancerIds, slotLabelText, slotOpenSpots, unscheduledDancers } from '../data/planning';
import { formatDate, formatTime, fullName, volunteerName } from '../data/selectors';
import { enrolledDancerIds, staffName, fromMinutes, minutes } from '../data/studio';
import { todayStr } from '../data/ids';
import { Badge, Card, CheckList, DataTable, EmptyState, Field, PageHeader, SampleTag, StatCard, type Option } from '../components/ui';
import { FormModal } from '../components/forms';
import { useConfirm, useRun, useToast } from '../components/feedback';
import { classOptions, useStaffOptions } from '../components/studioUi';
import { Progress } from '../components/charts';
import { openPrint } from './Print';
import { useViewer } from '../lib/session';
import type { Database, ID, ScheduleDay, ScheduleKind, ScheduleSlot, SlotOutcome } from '../data/types';

/* ------------------------------------------------------------- helpers */

const KIND = {
  fitting: { title: 'Costume Fittings', one: 'fitting day', New: 'New fitting day', base: '/fittings', icon: Ruler, subtitle: 'Schedule fitting times, link dancers together, and track who is fitted or needs alterations' },
  picture_day: { title: 'Picture Day', one: 'picture day', New: 'New picture day', base: '/picture-day', icon: Camera, subtitle: 'Class and team group photos, individual and sibling times, and families booking their own spot' },
} as const;

export const dayPath = (d: Pick<ScheduleDay, 'id' | 'kind'>) => `${KIND[d.kind].base}/${d.id}`;

const timeRange = (start: string, end: string) => `${formatTime(start)}–${formatTime(end)}`;

export function dancerOptions(db: Database, only?: Set<ID>): Option[] {
  const fam = new Map(db.families.map((f) => [f.id, f.name]));
  return db.dancers
    .filter((d) => (d.enrollmentStatus ?? 'active') === 'active' && (!only || only.has(d.id)))
    .sort((a, b) => `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`))
    .map((d) => ({ value: d.id, label: fullName(d), hint: [d.level, d.familyId ? fam.get(d.familyId) : ''].filter(Boolean).join(' · ') }));
}

const useCanEdit = (kind: ScheduleKind) => {
  const v = useViewer();
  return kind === 'fitting' ? v.can('costumes.edit') : v.can('events.manage') || v.can('productions.manage');
};

/* =========================================================== list page */

export function ScheduleListPage({ kind }: { kind: ScheduleKind }) {
  const db = useDb();
  const edit = useCanEdit(kind);
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const [past, setPast] = useState(false);
  const K = KIND[kind];
  const today = todayStr();
  const rows = db.scheduleDays
    .filter((d) => d.kind === kind && (past ? d.date < today : d.date >= today))
    .sort((a, b) => (past ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date)));
  return (
    <>
      <PageHeader
        title={K.title}
        subtitle={K.subtitle}
        actions={
          <>
            <button className="btn btn-ghost" onClick={() => setPast(!past)}>
              {past ? 'Upcoming' : 'Past'}
            </button>
            {edit && (
              <button className="btn btn-primary" onClick={() => setCreating(true)}>
                <Plus size={16} /> {K.New}
              </button>
            )}
          </>
        }
      />
      <Card>
        <DataTable
          rows={rows}
          getId={(d) => d.id}
          initialSort={{ key: 'date', dir: past ? 'desc' : 'asc' }}
          empty={
            <EmptyState
              icon={<K.icon size={28} />}
              title={past ? `No past ${K.one}s` : `No upcoming ${K.one}s`}
              message={kind === 'fitting' ? 'Create a fitting day, then link dancers to times — a few at a time, by class, or let families book.' : 'Create a picture day, add class and team group photos, and open individual times for families to book.'}
              action={edit && !past ? <button className="btn btn-primary" onClick={() => setCreating(true)}><Plus size={16} /> {K.New}</button> : undefined}
            />
          }
          columns={[
            { key: 'name', header: 'Name', render: (d) => <><Link to={dayPath(d)} className="link-strong">{d.name}</Link> <SampleTag show={d.isSample} />{d.location && <div className="small faint">{d.location}</div>}</>, sortValue: (d) => d.name },
            { key: 'date', header: 'Date', render: (d) => <>{formatDate(d.date)}<div className="small faint">{timeRange(d.startTime, d.endTime)}</div></>, sortValue: (d) => d.date },
            { key: 'slots', header: 'Times', render: (d) => daySlots(db, d.id).length, sortValue: (d) => daySlots(db, d.id).length, minor: true },
            {
              key: 'dancers',
              header: 'Dancers',
              render: (d) => {
                const p = dayProgress(db, d.id);
                return p.total ? <div className="progress-cell"><Progress value={p.done} max={p.total} label="Done" /><span className="small faint">{p.done}/{p.total} {kind === 'fitting' ? 'fitted' : 'photographed'}</span></div> : <span className="faint">None yet</span>;
              },
              sortValue: (d) => dayProgress(db, d.id).total,
            },
            {
              key: 'status',
              header: 'Status',
              render: (d) => {
                const c = dayConflicts(db, d.id).length;
                return (
                  <div className="chips">
                    <Badge tone={d.published ? 'ready' : 'neutral'}>{d.published ? 'Families can see' : 'Draft'}</Badge>
                    {d.familyBooking && d.published && <Badge tone="info">Booking open</Badge>}
                    {c > 0 && <Badge tone="danger">{c} clash{c === 1 ? '' : 'es'}</Badge>}
                  </div>
                );
              },
            },
          ]}
        />
      </Card>
      <ScheduleDayForm kind={kind} open={creating} onClose={() => setCreating(false)} onSaved={(id) => navigate(`${K.base}/${id}`)} />
    </>
  );
}

/* ============================================================ day form */

function ScheduleDayForm({ kind, open, onClose, id, onSaved }: { kind: ScheduleKind; open: boolean; onClose: () => void; id?: ID; onSaved?: (id: ID) => void }) {
  const db = useDb();
  const run = useRun();
  const staffOpts = useStaffOptions();
  const blank = (): ScheduleDayInput => {
    const r = db.recitals.filter((x) => x.status !== 'completed').sort((a, b) => a.startDate.localeCompare(b.startDate))[0];
    return {
      kind,
      name: kind === 'fitting' ? 'Costume Fittings' : 'Picture Day',
      date: kind === 'picture_day' && r?.pictureDay >= todayStr() ? r.pictureDay : '',
      startTime: kind === 'fitting' ? '16:00' : '09:00',
      endTime: kind === 'fitting' ? '19:00' : '15:00',
      slotMinutes: kind === 'fitting' ? 15 : 10,
      location: '',
      recitalId: r?.id ?? null,
      staffIds: [],
      volunteerIds: [],
      photographer: '',
      instructions: kind === 'fitting' ? 'Please arrive in a leotard and tights with hair pulled back.' : 'Arrive 15 minutes early, dressed in your costume with recital hair and makeup.',
      published: false,
      familyBooking: false,
      notes: '',
    };
  };
  const [f, setF] = useState<ScheduleDayInput>(blank);
  const [last, setLast] = useState<string | null>(null);
  const key = open ? id ?? 'new' : null;
  if (key !== last) {
    setLast(key);
    if (open) {
      const d = id ? db.scheduleDays.find((x) => x.id === id) : undefined;
      setF(d ? { ...blank(), ...d } : blank());
    }
  }
  const set = (p: Partial<ScheduleDayInput>) => setF({ ...f, ...p });
  const volOpts = db.volunteers.map((v) => ({ value: v.id, label: volunteerName(v), hint: v.skills.join(', ') })).sort((a, b) => a.label.localeCompare(b.label));
  return (
    <FormModal open={open} onClose={onClose} title={id ? `Edit ${KIND[kind].one}` : KIND[kind].New} size="lg" onSubmit={() => { const s = run(() => saveScheduleDay(f, id), 'Saved.'); if (s) { onClose(); onSaved?.(s); } }}>
      <div className="grid-2">
        <Field label="Name" required>
          <input className="input" value={f.name} onChange={(e) => set({ name: e.target.value })} autoFocus />
        </Field>
        <Field label="Recital" hint="Shows which recital dancers still need a time, and the costumes to fit.">
          <select className="input" value={f.recitalId ?? ''} onChange={(e) => set({ recitalId: e.target.value || null })}>
            <option value="">None</option>
            {db.recitals.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Date" required>
          <input className="input" type="date" value={f.date} onChange={(e) => set({ date: e.target.value })} />
        </Field>
        <Field label="Location">
          <input className="input" value={f.location} onChange={(e) => set({ location: e.target.value })} placeholder="Studio B" />
        </Field>
        <Field label="Starts" required>
          <input className="input" type="time" value={f.startTime} onChange={(e) => set({ startTime: e.target.value })} />
        </Field>
        <Field label="Ends" required>
          <input className="input" type="time" value={f.endTime} onChange={(e) => set({ endTime: e.target.value })} />
        </Field>
        <Field label="Usual slot length (minutes)">
          <input className="input" type="number" min={5} max={240} step={5} value={f.slotMinutes} onChange={(e) => set({ slotMinutes: Number(e.target.value) })} />
        </Field>
        {kind === 'picture_day' ? (
          <Field label="Photographer">
            <input className="input" value={f.photographer} onChange={(e) => set({ photographer: e.target.value })} />
          </Field>
        ) : (
          <span />
        )}
      </div>
      <div className="grid-2">
        <div className="field">
          <span className="field-label">{kind === 'fitting' ? 'Fitters (staff)' : 'Staff on duty'}</span>
          <CheckList options={staffOpts} selected={new Set(f.staffIds)} onChange={(s) => set({ staffIds: [...s] })} height={140} emptyText="No active staff." />
        </div>
        <div className="field">
          <span className="field-label">Volunteer helpers</span>
          <CheckList options={volOpts} selected={new Set(f.volunteerIds)} onChange={(s) => set({ volunteerIds: [...s] })} height={140} emptyText="No volunteers yet." />
        </div>
      </div>
      <Field label="Instructions for families" hint="Shown in the Parent Portal and in the notice families receive.">
        <textarea className="input" rows={3} value={f.instructions} onChange={(e) => set({ instructions: e.target.value })} />
      </Field>
      <Field label="Staff notes">
        <textarea className="input" rows={2} value={f.notes} onChange={(e) => set({ notes: e.target.value })} />
      </Field>
      <label className="check-inline">
        <input type="checkbox" checked={f.published} onChange={(e) => set({ published: e.target.checked })} /> Families can see their dancers' times in the Parent Portal
      </label>
      <label className="check-inline">
        <input type="checkbox" checked={f.familyBooking} onChange={(e) => set({ familyBooking: e.target.checked })} /> Families can book open spots themselves
      </label>
    </FormModal>
  );
}

/* ========================================================== detail page */

export function ScheduleDetailPage({ kind }: { kind: ScheduleKind }) {
  const { id } = useParams();
  const db = useDb();
  const edit = useCanEdit(kind);
  const run = useRun();
  const toast = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const K = KIND[kind];
  const [editing, setEditing] = useState(false);
  const [slotEdit, setSlotEdit] = useState<{ id?: ID; defaults?: Partial<SlotInput> } | null>(null);
  const [linking, setLinking] = useState<ID | null>(null);
  const [auto, setAuto] = useState<Partial<AutoScheduleInput> | null>(null);
  const [filling, setFilling] = useState(false);
  const [copying, setCopying] = useState(false);
  const [copyDate, setCopyDate] = useState('');
  const day = db.scheduleDays.find((d) => d.id === id && d.kind === kind);
  if (!day) {
    return (
      <>
        <PageHeader title="Not found" back={{ to: K.base, label: K.title }} />
        <EmptyState title={`This ${K.one} no longer exists`} action={<Link to={K.base} className="btn btn-primary">Back</Link>} />
      </>
    );
  }
  const slots = daySlots(db, day.id);
  const progress = dayProgress(db, day.id);
  const conflicts = dayConflicts(db, day.id);
  const splits = siblingSplits(db, day.id);
  const missing = unscheduledDancers(db, day);
  const open = slots.reduce((n, s) => n + slotOpenSpots(s), 0);
  const recital = db.recitals.find((r) => r.id === day.recitalId);
  const dName = (d: ID) => {
    const x = db.dancers.find((y) => y.id === d);
    return x ? fullName(x) : 'Removed dancer';
  };
  const lastEnd = slots.length ? slots[slots.length - 1].end : day.startTime;
  const overrun = day.endTime && lastEnd > day.endTime;

  const remove = async () => {
    if (await confirm({ title: `Delete ${day.name}?`, message: 'All of its times and results are deleted too.', confirmLabel: 'Delete', danger: true }))
      if (run(() => (deleteScheduleDay(day.id), true), 'Deleted.')) navigate(K.base);
  };
  const notify = async () => {
    if (!slots.length) return toast.error('Add some times first.');
    if (await confirm({ title: 'Send times to families?', message: 'The schedule becomes visible in the Parent Portal and every family with a dancer on it gets a notice with their times. Email delivery is not connected yet, so it arrives in their portal inbox.', confirmLabel: 'Send times' }))
    {
      const n = run(() => notifyScheduleFamilies(day.id));
      if (n !== undefined) toast.success(`Times sent to ${n} famil${n === 1 ? 'y' : 'ies'}.`);
    }
  };

  return (
    <>
      <PageHeader
        back={{ to: K.base, label: K.title }}
        title={
          <>
            {day.name} <SampleTag show={day.isSample} />
          </>
        }
        subtitle={`${scheduleKindLabels[kind]} · ${formatDate(day.date)} · ${timeRange(day.startTime, day.endTime)}${day.location ? ` · ${day.location}` : ''}`}
        actions={
          <>
            <button className="btn btn-ghost" onClick={() => openPrint('schedule', { id: day.id })}>
              <Printer size={16} /> Print schedule
            </button>
            {edit && (
              <>
                <button className="btn btn-ghost danger" onClick={remove}>
                  <Trash2 size={16} /> Delete
                </button>
                <button className="btn btn-ghost" onClick={() => (setCopyDate(''), setCopying(true))}>
                  <Copy size={16} /> Duplicate
                </button>
                <button className="btn btn-ghost" onClick={notify}>
                  <Send size={16} /> Send times to families
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
        <StatCard label="Time slots" value={slots.length} icon={<Clock size={20} />} tone="plum" hint={open ? `${open} open spot${open === 1 ? '' : 's'} for families` : undefined} />
        <StatCard label="Dancers scheduled" value={progress.total} icon={<Users size={20} />} tone="rose" hint={recital ? `${missing.length} recital dancer${missing.length === 1 ? '' : 's'} without a time` : undefined} />
        <StatCard label={kind === 'fitting' ? 'Fitted' : 'Photographed'} value={`${progress.done}/${progress.total}`} icon={<CheckCircle2 size={20} />} tone="sage" />
        <StatCard label="Clashes" value={conflicts.length} icon={<AlertTriangle size={20} />} tone={conflicts.length ? 'amber' : 'slate'} hint="Dancers booked twice at once" />
      </div>

      {(conflicts.length > 0 || splits.length > 0 || missing.length > 0 || overrun) && (
        <Card title="Needs attention" icon={<AlertTriangle size={18} />}>
          <ul className="mini-list">
            {overrun && (
              <li>
                <span>
                  The schedule runs until <strong>{formatTime(lastEnd)}</strong>, past the planned end of {formatTime(day.endTime)}.
                </span>
              </li>
            )}
            {conflicts.map((c) => (
              <li key={c.dancerId}>
                <span>
                  <strong>{dName(c.dancerId)}</strong> is booked at overlapping times: {c.slots.map((s) => `${timeRange(s.start, s.end)} (${slotLabelText(db, s)})`).join(' and ')}
                </span>
                <Badge tone="danger">Clash</Badge>
              </li>
            ))}
            {splits.map((s) => (
              <li key={s.familyId}>
                <span>
                  Siblings <strong>{s.dancerIds.map(dName).join(' & ')}</strong> ({db.families.find((f) => f.id === s.familyId)?.name}) are more than an hour apart.
                </span>
                <Badge tone="info">Siblings</Badge>
              </li>
            ))}
            {missing.length > 0 && (
              <li>
                <span>
                  <strong>{missing.length}</strong> dancer{missing.length === 1 ? '' : 's'} in {recital?.name} {missing.length === 1 ? 'has' : 'have'} no time yet: <span className="small">{missing.slice(0, 8).map(dName).join(', ')}{missing.length > 8 ? `, +${missing.length - 8} more` : ''}</span>
                </span>
                {edit && (
                  <button className="btn btn-ghost btn-sm" onClick={() => setAuto({ mode: 'dancers', recitalUnscheduled: true })}>
                    <Shuffle size={14} /> Schedule them
                  </button>
                )}
              </li>
            )}
          </ul>
        </Card>
      )}

      <div className="detail-grid wide-right">
        <div className="stack">
          <Card title="Details">
            <dl className="dl">
              {recital && (
                <div className="dl-row">
                  <dt>Recital</dt>
                  <dd>
                    <Link to={`/recitals/${recital.id}`}>{recital.name}</Link>
                  </dd>
                </div>
              )}
              {day.photographer && (
                <div className="dl-row">
                  <dt>Photographer</dt>
                  <dd>{day.photographer}</dd>
                </div>
              )}
              <div className="dl-row">
                <dt>{kind === 'fitting' ? 'Fitters' : 'Staff'}</dt>
                <dd>{day.staffIds.map((s) => staffName(db.staff.find((x) => x.id === s))).join(', ') || <span className="faint">None</span>}</dd>
              </div>
              <div className="dl-row">
                <dt>Helpers</dt>
                <dd>
                  {day.volunteerIds.length ? (
                    day.volunteerIds.map((v, i) => {
                      const vol = db.volunteers.find((x) => x.id === v);
                      return vol ? (
                        <span key={v}>
                          {i > 0 && ', '}
                          <Link to={`/volunteers/${v}`}>{volunteerName(vol)}</Link>
                        </span>
                      ) : null;
                    })
                  ) : (
                    <span className="faint">None</span>
                  )}
                </dd>
              </div>
              <div className="dl-row">
                <dt>Families</dt>
                <dd>{day.published ? (day.familyBooking ? 'Can see times and book open spots' : 'Can see their times') : 'Not visible yet (draft)'}</dd>
              </div>
            </dl>
            {day.instructions && (
              <>
                <h4 className="mini-head">Instructions for families</h4>
                <p className="small prewrap">{day.instructions}</p>
              </>
            )}
            {day.notes && (
              <>
                <h4 className="mini-head">Staff notes</h4>
                <p className="small prewrap">{day.notes}</p>
              </>
            )}
          </Card>
        </div>
        <Card
          title="Schedule"
          icon={<CalendarClock size={18} />}
          actions={
            edit && (
              <>
                <button className="btn btn-ghost btn-sm" onClick={() => setFilling(true)}>
                  <Clock size={14} /> Fill with open times
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => setAuto({ mode: kind === 'picture_day' ? 'groups' : 'dancers' })}>
                  <Shuffle size={14} /> Auto-schedule
                </button>
                <button className="btn btn-primary btn-sm" onClick={() => setSlotEdit({ defaults: { start: nextFreeTime(db, day), end: fromMinutes(minutes(nextFreeTime(db, day)) + day.slotMinutes) } })}>
                  <Plus size={14} /> Add time
                </button>
              </>
            )
          }
        >
          {!slots.length ? (
            <EmptyState
              title="No times yet"
              message={kind === 'fitting' ? 'Auto-schedule a class a few dancers at a time, add a time and link dancers to it, or fill the day with open times families can book.' : 'Auto-schedule one group photo per class or team, then fill the rest of the day with open individual and sibling times.'}
            />
          ) : (
            <div className="sched-list">
              {slots.map((s) => (
                <SlotCard key={s.id} db={db} day={day} slot={s} slots={slots} edit={edit} onEdit={() => setSlotEdit({ id: s.id })} onLink={() => setLinking(s.id)} conflicted={new Set(conflicts.map((c) => c.dancerId))} />
              ))}
            </div>
          )}
        </Card>
      </div>

      <ScheduleDayForm kind={kind} open={editing} id={day.id} onClose={() => setEditing(false)} />
      {slotEdit && <SlotForm day={day} id={slotEdit.id} defaults={slotEdit.defaults} onClose={() => setSlotEdit(null)} />}
      {linking && <LinkDialog day={day} slotId={linking} onClose={() => setLinking(null)} />}
      {auto && <AutoDialog day={day} initial={auto} onClose={() => setAuto(null)} />}
      {filling && <FillDialog day={day} onClose={() => setFilling(false)} />}
      {copying && (
        <FormModal open onClose={() => setCopying(false)} title="Duplicate" subtitle="Copies every time and linked group to a new date (results are not copied)." size="sm" saveLabel="Duplicate" onSubmit={() => { const n = run(() => duplicateScheduleDay(day.id, copyDate), 'Copied.'); if (n) { setCopying(false); navigate(`${K.base}/${n}`); } }}>
          <Field label="New date" required>
            <input className="input" type="date" value={copyDate} onChange={(e) => setCopyDate(e.target.value)} autoFocus />
          </Field>
        </FormModal>
      )}
    </>
  );
}

/* -------------------------------------------------------------- slot card */

function SlotCard({ db, day, slot, slots, edit, onEdit, onLink, conflicted }: { db: Database; day: ScheduleDay; slot: ScheduleSlot; slots: ScheduleSlot[]; edit: boolean; onEdit: () => void; onLink: () => void; conflicted: Set<ID> }) {
  const run = useRun();
  const confirm = useConfirm();
  const dancers = slotDancerIds(db, slot)
    .map((id) => db.dancers.find((d) => d.id === id)!)
    .sort((a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName));
  const cls = slot.classId ? db.classes.find((c) => c.id === slot.classId) : undefined;
  const team = slot.teamId ? db.teams.find((t) => t.id === slot.teamId) : undefined;
  const spots = slotOpenSpots(slot);
  const labels = outcomeLabels[day.kind];
  const del = async () => {
    if (await confirm({ title: 'Delete this time?', message: `${timeRange(slot.start, slot.end)} · ${slotLabelText(db, slot)}${dancers.length ? ` — ${dancers.length} dancer${dancers.length === 1 ? '' : 's'} will need a new time.` : ''}`, confirmLabel: 'Delete', danger: true })) run(() => deleteSlots([slot.id]), 'Time deleted.');
  };
  return (
    <section className="sched-slot">
      <header className="sched-slot-head">
        <div className="sched-time">{timeRange(slot.start, slot.end)}</div>
        <div className="sched-title">
          <strong>{slotLabelText(db, slot)}</strong>
          <div className="small faint">
            {[cls && <Link key="c" to={`/classes/${cls.id}`}>Class roster: {cls.name}</Link>, team && <Link key="t" to={`/teams/${team.id}`}>Team: {team.name}</Link>].filter(Boolean).reduce<React.ReactNode[]>((acc, x, i) => (i ? [...acc, ' · ', x] : [x]), [])}
            {slot.capacity > 0 && <span>{cls || team ? ' · ' : ''}{spots ? `${spots} of ${slot.capacity} open spot${slot.capacity === 1 ? '' : 's'}` : 'Fully booked'}</span>}
          </div>
          {slot.costumeNote && <div className="small">👗 {slot.costumeNote}</div>}
          {slot.notes && <div className="small faint prewrap">{slot.notes}</div>}
        </div>
        {edit && (
          <div className="row-actions">
            <button className="btn btn-ghost btn-sm" onClick={onLink}>
              <UserPlus size={14} /> Link dancers
            </button>
            <button className="icon-btn" aria-label="Edit time" onClick={onEdit}>
              <Pencil size={15} />
            </button>
            <button className="icon-btn" aria-label="Delete time" onClick={del}>
              <Trash2 size={15} />
            </button>
          </div>
        )}
      </header>
      {!dancers.length ? (
        <p className="small faint sched-empty">{slot.capacity > 0 ? (day.familyBooking && day.published ? 'Open for families to book.' : 'Open spot — link dancers or turn on family booking.') : 'No dancers linked yet.'}</p>
      ) : (
        <ul className="sched-dancers">
          {dancers.map((d) => {
            const o = slot.outcomes[d.id];
            const individual = slot.dancerIds.includes(d.id);
            const costumes = day.kind === 'fitting' ? fittingCostumes(db, d.id, day.recitalId) : [];
            return (
              <li key={d.id} className={conflicted.has(d.id) ? 'clash' : ''}>
                <div className="sched-dancer">
                  <Link to={`/dancers/${d.id}`} className="link-strong">
                    {fullName(d)}
                  </Link>
                  <span className="small faint">
                    {[d.costumeSize && `Costume ${d.costumeSize}`, d.level, slot.bookedBy[d.id] && `booked by ${slot.bookedBy[d.id]}`, !individual && 'via group'].filter(Boolean).join(' · ')}
                  </span>
                  {costumes.length > 0 && (
                    <div className="chips">
                      {costumes.map((c) => (
                        <Link key={c.id} to={`/costumes/${c.id}`} className="chip">
                          {c.name}
                          {c.size && ` · ${c.size}`}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
                <div className="sched-outcome">
                  {edit ? (
                    <>
                      <select className={`input input-sm outcome-${o?.status ?? 'scheduled'}`} value={o?.status ?? 'scheduled'} onChange={(e) => run(() => setOutcome(slot.id, d.id, e.target.value as SlotOutcome))} aria-label={`Result for ${fullName(d)}`}>
                        {(Object.keys(labels) as SlotOutcome[]).map((k) => (
                          <option key={k} value={k}>
                            {labels[k]}
                          </option>
                        ))}
                      </select>
                      <NoteInput value={o?.note ?? ''} onSave={(v) => run(() => setOutcome(slot.id, d.id, o?.status ?? 'scheduled', v))} />
                    </>
                  ) : (
                    <>
                      <Badge tone={outcomeTone[o?.status ?? 'scheduled']}>{labels[o?.status ?? 'scheduled']}</Badge>
                      {o?.note && <span className="small">{o.note}</span>}
                    </>
                  )}
                </div>
                {edit && (
                  <div className="row-actions">
                    {day.kind === 'fitting' && o?.status === 'alteration' && costumes.length > 0 && <AlterationButton dancer={fullName(d)} costumes={costumes.map((c) => ({ id: c.id, name: c.name }))} note={o.note} />}
                    {individual && slots.length > 1 && (
                      <select className="input input-sm" value="" onChange={(e) => e.target.value && run(() => moveDancer(slot.id, e.target.value, d.id), `${d.firstName} moved.`)} aria-label={`Move ${fullName(d)} to another time`}>
                        <option value="">Move to…</option>
                        {slots
                          .filter((x) => x.id !== slot.id)
                          .map((x) => (
                            <option key={x.id} value={x.id}>
                              {formatTime(x.start)} · {slotLabelText(db, x)}
                            </option>
                          ))}
                      </select>
                    )}
                    {individual && (
                      <button className="icon-btn" aria-label={`Remove ${fullName(d)} from this time`} onClick={() => run(() => unlinkDancer(slot.id, d.id), `${d.firstName} removed from this time.`)}>
                        <X size={15} />
                      </button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function NoteInput({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [v, setV] = useState(value);
  const [last, setLast] = useState(value);
  if (value !== last) {
    setLast(value);
    setV(value);
  }
  return <input className="input input-sm" placeholder="Note (e.g. hem 1 inch)" value={v} onChange={(e) => setV(e.target.value)} onBlur={() => v !== value && onSave(v)} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} aria-label="Result note" />;
}

function AlterationButton({ dancer, costumes, note }: { dancer: string; costumes: { id: ID; name: string }[]; note: string }) {
  const run = useRun();
  const [open, setOpen] = useState(false);
  const [costumeId, setCostumeId] = useState(costumes[0].id);
  return (
    <>
      <button className="btn btn-ghost btn-sm" onClick={() => setOpen(true)} title="Open an alteration job on the Repair & Cleaning page">
        <Wrench size={14} /> Alteration job
      </button>
      {open && (
        <FormModal open onClose={() => setOpen(false)} title="Send for alteration" subtitle="Creates an alteration job and marks the costume IN PROGRESS." size="sm" saveLabel="Create job" onSubmit={() => run(() => createWorkOrders([costumeId], { type: 'alteration', description: `${dancer}: ${note || 'alteration from fitting'}`, pieces: 1, volunteerId: null, scheduledAt: '', dueDate: '' }), 'Alteration job created.') && setOpen(false)}>
          <Field label="Costume">
            <select className="input" value={costumeId} onChange={(e) => setCostumeId(e.target.value)}>
              {costumes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <p className="small faint">Job note: {dancer}: {note || 'alteration from fitting'}</p>
        </FormModal>
      )}
    </>
  );
}

/* ------------------------------------------------------------- dialogs */

function SlotForm({ day, id, defaults, onClose }: { day: ScheduleDay; id?: ID; defaults?: Partial<SlotInput>; onClose: () => void }) {
  const db = useDb();
  const run = useRun();
  const existing = id ? db.scheduleSlots.find((s) => s.id === id) : undefined;
  const [f, setF] = useState<SlotInput>(() => ({ start: '', end: '', label: '', classId: null, teamId: null, dancerIds: [], capacity: 0, costumeNote: '', notes: '', ...defaults, ...(existing ?? {}) }));
  const set = (p: Partial<SlotInput>) => setF({ ...f, ...p });
  return (
    <FormModal open onClose={onClose} title={id ? 'Edit time' : 'Add a time'} size="lg" onSubmit={() => run(() => saveSlot(day.id, f, id), 'Saved.') && onClose()}>
      <div className="grid-3">
        <Field label="Start" required>
          <input className="input" type="time" value={f.start} onChange={(e) => set({ start: e.target.value, end: f.end && f.end > e.target.value ? f.end : fromMinutes(minutes(e.target.value) + day.slotMinutes) })} autoFocus />
        </Field>
        <Field label="End" required>
          <input className="input" type="time" value={f.end} onChange={(e) => set({ end: e.target.value })} />
        </Field>
        <Field label="Open spots for families" hint="0 = studio assigns only">
          <input className="input" type="number" min={0} value={f.capacity} onChange={(e) => set({ capacity: Number(e.target.value) })} />
        </Field>
      </div>
      <div className="grid-2">
        <Field label="Label" hint="Optional, e.g. “Siblings”, “Group photo”.">
          <input className="input" value={f.label} onChange={(e) => set({ label: e.target.value })} />
        </Field>
        <Field label={day.kind === 'fitting' ? 'Costume / what to try on' : 'Costume / what to wear'}>
          <input className="input" value={f.costumeNote} onChange={(e) => set({ costumeNote: e.target.value })} />
        </Field>
        <Field label="Whole class" hint="Everyone enrolled is linked, and stays current as the roster changes.">
          <select className="input" value={f.classId ?? ''} onChange={(e) => set({ classId: e.target.value || null })}>
            <option value="">None</option>
            {classOptions(db).map((o) => (
              <option key={o.value} value={o.value}>
                {o.label} {o.group ? `(${o.group})` : ''}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Whole team">
          <select className="input" value={f.teamId ?? ''} onChange={(e) => set({ teamId: e.target.value || null })}>
            <option value="">None</option>
            {db.teams.filter((t) => !t.archived).map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="field">
        <span className="field-label">Individual dancers</span>
        <CheckList options={dancerOptions(db)} selected={new Set(f.dancerIds)} onChange={(s) => set({ dancerIds: [...s] })} height={200} />
      </div>
      <Field label="Notes">
        <textarea className="input" rows={2} value={f.notes} onChange={(e) => set({ notes: e.target.value })} />
      </Field>
    </FormModal>
  );
}

function LinkDialog({ day, slotId, onClose }: { day: ScheduleDay; slotId: ID; onClose: () => void }) {
  const db = useDb();
  const run = useRun();
  const slot = db.scheduleSlots.find((s) => s.id === slotId);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [move, setMove] = useState(true);
  const [onlyFree, setOnlyFree] = useState(true);
  const [fromClass, setFromClass] = useState('');
  if (!slot) return null;
  const booked = dayDancerSlots(db, day.id);
  const inSlot = new Set(slotDancerIds(db, slot));
  const classRoster = fromClass ? new Set(enrolledDancerIds(db, fromClass)) : undefined;
  const opts = dancerOptions(db, classRoster)
    .filter((o) => !inSlot.has(o.value) && (!onlyFree || !booked.has(o.value)))
    .map((o) => {
      const other = booked.get(o.value);
      return other ? { ...o, hint: `${o.hint ? `${o.hint} · ` : ''}now at ${formatTime(other[0].start)}` } : o;
    });
  return (
    <FormModal open onClose={onClose} title={`Link dancers · ${timeRange(slot.start, slot.end)}`} subtitle="Pick the dancers who come together at this time." size="md" saveLabel={`Link ${sel.size || ''} dancer${sel.size === 1 ? '' : 's'}`} onSubmit={() => run(() => (linkDancers(slot.id, [...sel], { moveFromOtherSlots: move }), true), `${sel.size} dancer${sel.size === 1 ? '' : 's'} linked.`) && onClose()}>
      <div className="toolbar">
        <select className="input input-auto" value={fromClass} onChange={(e) => setFromClass(e.target.value)} aria-label="Show dancers from class">
          <option value="">All dancers</option>
          {classOptions(db).map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <label className="check-inline small">
          <input type="checkbox" checked={onlyFree} onChange={(e) => setOnlyFree(e.target.checked)} /> Only dancers without a time today
        </label>
      </div>
      <CheckList options={opts} selected={sel} onChange={setSel} height={300} emptyText="Everyone already has a time." />
      {!onlyFree && (
        <label className="check-inline small">
          <input type="checkbox" checked={move} onChange={(e) => setMove(e.target.checked)} /> Move them from their other individual times today
        </label>
      )}
    </FormModal>
  );
}

function AutoDialog({ day, initial, onClose }: { day: ScheduleDay; initial: Partial<AutoScheduleInput>; onClose: () => void }) {
  const db = useDb();
  const run = useRun();
  const toast = useToast();
  const [f, setF] = useState<AutoScheduleInput>(() => ({ mode: 'dancers', classIds: [], teamIds: [], dancerIds: [], recitalUnscheduled: false, start: nextFreeTime(db, day), minutes: day.slotMinutes, perSlot: day.kind === 'fitting' ? 2 : 1, gap: 0, keepSiblingsTogether: true, costumeNote: '', ...initial }));
  const set = (p: Partial<AutoScheduleInput>) => setF({ ...f, ...p });
  const recital = db.recitals.find((r) => r.id === day.recitalId);
  const recitalClassIds = recital ? db.recitalNumbers.filter((n) => n.recitalId === recital.id && n.classId).map((n) => n.classId!) : [];
  return (
    <FormModal
      open
      onClose={onClose}
      title="Auto-schedule"
      subtitle="Times are added one after another from the start time."
      size="lg"
      saveLabel="Create times"
      onSubmit={() => {
        const r = run(() => autoSchedule(day.id, f));
        if (!r) return;
        toast.success(`${r.slots} time${r.slots === 1 ? '' : 's'} created for ${r.dancers} dancer${r.dancers === 1 ? '' : 's'}, ending at ${formatTime(r.endsAt)}.`);
        onClose();
      }}
    >
      <div className="segmented full">
        <button type="button" className={f.mode === 'groups' ? 'on' : ''} onClick={() => set({ mode: 'groups' })}>
          One time per class / team
        </button>
        <button type="button" className={f.mode === 'dancers' ? 'on' : ''} onClick={() => set({ mode: 'dancers' })}>
          Dancers a few at a time
        </button>
      </div>
      <p className="small faint">{f.mode === 'groups' ? 'Great for group photos or class fittings: the whole roster is linked to one time.' : 'Each dancer gets a time, with several dancers per time. Dancers who already have a time today are skipped.'}</p>
      <div className="grid-3">
        <Field label="Start at">
          <input className="input" type="time" value={f.start} onChange={(e) => set({ start: e.target.value })} />
        </Field>
        <Field label="Minutes per time">
          <input className="input" type="number" min={5} step={5} value={f.minutes} onChange={(e) => set({ minutes: Number(e.target.value) })} />
        </Field>
        {f.mode === 'dancers' ? (
          <Field label="Dancers per time">
            <input className="input" type="number" min={1} value={f.perSlot} onChange={(e) => set({ perSlot: Number(e.target.value) })} />
          </Field>
        ) : (
          <Field label="Break between (minutes)">
            <input className="input" type="number" min={0} step={5} value={f.gap} onChange={(e) => set({ gap: Number(e.target.value) })} />
          </Field>
        )}
      </div>
      <div className="grid-2">
        <div className="field">
          <span className="field-label">
            Classes{' '}
            {recitalClassIds.length > 0 && (
              <button type="button" className="linkish small" onClick={() => set({ classIds: [...new Set(recitalClassIds)] })}>
                (all classes in {recital?.name})
              </button>
            )}
          </span>
          <CheckList options={classOptions(db)} selected={new Set(f.classIds)} onChange={(s) => set({ classIds: [...s] })} height={170} />
        </div>
        <div className="field">
          <span className="field-label">Teams</span>
          <CheckList options={db.teams.filter((t) => !t.archived).map((t) => ({ value: t.id, label: t.name, hint: `${t.dancerIds.length} dancers` }))} selected={new Set(f.teamIds)} onChange={(s) => set({ teamIds: [...s] })} height={170} emptyText="No teams." />
        </div>
      </div>
      <div className="field">
        <span className="field-label">Individual dancers</span>
        <CheckList options={dancerOptions(db)} selected={new Set(f.dancerIds)} onChange={(s) => set({ dancerIds: [...s] })} height={150} />
      </div>
      <Field label={day.kind === 'fitting' ? 'Costume / what to try on' : 'Costume / what to wear'}>
        <input className="input" value={f.costumeNote} onChange={(e) => set({ costumeNote: e.target.value })} />
      </Field>
      {f.mode === 'dancers' && (
        <>
          <label className="check-inline">
            <input type="checkbox" checked={f.keepSiblingsTogether} onChange={(e) => set({ keepSiblingsTogether: e.target.checked })} /> Keep siblings together (one trip for families)
          </label>
          {recital && (
            <label className="check-inline">
              <input type="checkbox" checked={!!f.recitalUnscheduled} onChange={(e) => set({ recitalUnscheduled: e.target.checked })} /> Also add every {recital.name} dancer who doesn't have a time yet
            </label>
          )}
        </>
      )}
    </FormModal>
  );
}

function FillDialog({ day, onClose }: { day: ScheduleDay; onClose: () => void }) {
  const db = useDb();
  const run = useRun();
  const toast = useToast();
  const [f, setF] = useState({ from: nextFreeTime(db, day), to: day.endTime, minutes: day.slotMinutes, capacity: day.kind === 'fitting' ? 1 : 2, label: day.kind === 'fitting' ? 'Open fitting' : 'Individuals & siblings' });
  const set = (p: Partial<typeof f>) => setF({ ...f, ...p });
  return (
    <FormModal open onClose={onClose} title="Fill with open times" subtitle="Creates equal times that families can book (when booking is on) or you can link dancers to. Times already taken are skipped." size="md" saveLabel="Create times" onSubmit={() => {
        const n = run(() => generateSlots(day.id, f));
        if (n === undefined) return;
        toast.success(`${n} open time${n === 1 ? '' : 's'} created.`);
        onClose();
      }}>
      <div className="grid-2">
        <Field label="From">
          <input className="input" type="time" value={f.from} onChange={(e) => set({ from: e.target.value })} />
        </Field>
        <Field label="To">
          <input className="input" type="time" value={f.to} onChange={(e) => set({ to: e.target.value })} />
        </Field>
        <Field label="Minutes each">
          <input className="input" type="number" min={5} step={5} value={f.minutes} onChange={(e) => set({ minutes: Number(e.target.value) })} />
        </Field>
        <Field label="Dancers per time">
          <input className="input" type="number" min={0} value={f.capacity} onChange={(e) => set({ capacity: Number(e.target.value) })} />
        </Field>
      </div>
      <Field label="Label">
        <input className="input" value={f.label} onChange={(e) => set({ label: e.target.value })} />
      </Field>
    </FormModal>
  );
}

/* ========================================================= parent portal */

export function ParentAppointmentsPage() {
  const db = useDb();
  const v = useViewer();
  const run = useRun();
  const confirm = useConfirm();
  const [booking, setBooking] = useState<{ dayId: ID; dancerId: ID } | null>(null);
  const familyId = v.familyId;
  if (!familyId) return <EmptyState title="No family linked" message="This login isn't connected to a family yet. Please contact the studio office." />;
  const today = todayStr();
  const dancers = db.dancers.filter((d) => d.familyId === familyId);
  const appts = familyAppointments(db, familyId, today);
  const days = db.scheduleDays.filter((d) => d.published && d.date >= today && (appts.some((a) => a.day.id === d.id) || (d.familyBooking && daySlots(db, d.id).some((s) => slotOpenSpots(s) > 0)))).sort((a, b) => a.date.localeCompare(b.date));
  const bookDay = booking ? db.scheduleDays.find((d) => d.id === booking.dayId) : undefined;
  return (
    <>
      <PageHeader title="Fittings & Picture Day" subtitle="Your dancers' costume fitting and photo times" />
      {!days.length ? (
        <EmptyState icon={<CalendarClock size={28} />} title="Nothing scheduled right now" message="When the studio schedules fittings or picture day, your times appear here." />
      ) : (
        days.map((day) => {
          const mine = appts.filter((a) => a.day.id === day.id);
          const Icon = KIND[day.kind].icon;
          const without = dancers.filter((d) => !mine.some((a) => a.dancerId === d.id));
          const canBook = day.familyBooking && daySlots(db, day.id).some((s) => slotOpenSpots(s) > 0);
          return (
            <Card key={day.id} title={day.name} icon={<Icon size={18} />} actions={<Badge tone="info">{scheduleKindLabels[day.kind]}</Badge>}>
              <p className="small">
                <strong>{formatDate(day.date)}</strong> · {timeRange(day.startTime, day.endTime)}
                {day.location && ` · ${day.location}`}
                {day.photographer && ` · ${day.photographer}`}
              </p>
              {day.instructions && <p className="small prewrap notice">{day.instructions}</p>}
              <ul className="mini-list">
                {mine.map((a) => {
                  const d = db.dancers.find((x) => x.id === a.dancerId)!;
                  const self = !!a.slot.bookedBy[d.id];
                  const costumes = day.kind === 'fitting' ? fittingCostumes(db, d.id, day.recitalId) : [];
                  return (
                    <li key={`${a.slot.id}:${d.id}`}>
                      <div>
                        <strong>{d.firstName}</strong> · {timeRange(a.slot.start, a.slot.end)} <span className="small faint">({slotLabelText(db, a.slot)})</span>
                        {a.slot.costumeNote && <div className="small">{a.slot.costumeNote}</div>}
                        {costumes.length > 0 && <div className="small faint">Trying on: {costumes.map((c) => c.name).join(', ')}</div>}
                      </div>
                      <span className="row-actions">
                        {a.slot.outcomes[d.id] && a.slot.outcomes[d.id].status !== 'scheduled' && <Badge tone={outcomeTone[a.slot.outcomes[d.id].status]}>{outcomeLabels[day.kind][a.slot.outcomes[d.id].status]}</Badge>}
                        {self && day.familyBooking && (
                          <>
                            <button className="btn btn-ghost btn-sm" onClick={() => setBooking({ dayId: day.id, dancerId: d.id })}>
                              Change
                            </button>
                            <button className="btn btn-ghost btn-sm" onClick={async () => { if (await confirm({ title: 'Cancel this time?', message: `${d.firstName}'s time at ${formatTime(a.slot.start)} will be released.`, confirmLabel: 'Cancel time' })) run(() => cancelBooking(a.slot.id, d.id, familyId), 'Time cancelled.'); }}>
                              Cancel
                            </button>
                          </>
                        )}
                      </span>
                    </li>
                  );
                })}
                {canBook &&
                  without.map((d) => (
                    <li key={d.id}>
                      <span>
                        <strong>{d.firstName}</strong> <span className="small faint">· no time yet</span>
                      </span>
                      <button className="btn btn-primary btn-sm" onClick={() => setBooking({ dayId: day.id, dancerId: d.id })}>
                        Choose a time
                      </button>
                    </li>
                  ))}
              </ul>
            </Card>
          );
        })
      )}
      {booking && bookDay && (
        <FormModal open onClose={() => setBooking(null)} title={`Choose a time for ${db.dancers.find((d) => d.id === booking.dancerId)?.firstName}`} subtitle={`${bookDay.name} · ${formatDate(bookDay.date)}`} size="sm" saveLabel="Close" onSubmit={() => setBooking(null)}>
          <ul className="mini-list">
            {daySlots(db, bookDay.id)
              .filter((s) => slotOpenSpots(s) > 0)
              .map((s) => (
                <li key={s.id}>
                  <span>
                    <strong>{timeRange(s.start, s.end)}</strong> <span className="small faint">· {slotLabelText(db, s)} · {slotOpenSpots(s)} open</span>
                  </span>
                  <button type="button" className="btn btn-primary btn-sm" onClick={() => run(() => (bookSlot(s.id, booking.dancerId, familyId), true), 'Booked!') && setBooking(null)}>
                    Book
                  </button>
                </li>
              ))}
          </ul>
        </FormModal>
      )}
    </>
  );
}

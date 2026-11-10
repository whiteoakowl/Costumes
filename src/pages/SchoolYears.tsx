import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Archive, CalendarOff, Copy, DoorOpen, GraduationCap, Pencil, Plus, Star, Trash2 } from 'lucide-react';
import { useDb } from '../data/store';
import { copyClassesToYear, deleteClassroom, deleteSchoolYear, deleteStudioEvent, saveClassroom, saveSchoolYear, setSchoolYearStatus, type SchoolYearInput } from '../data/studioActions';
import { formatDate } from '../data/selectors';
import { enrolledDancerIds } from '../data/studio';
import { Badge, Card, EmptyState, Field, PageHeader, SampleTag } from '../components/ui';
import { FormModal } from '../components/forms';
import { useConfirm, useRun } from '../components/feedback';
import { useViewer } from '../lib/session';
import { todayStr } from '../data/ids';
import { CalendarEntryForm, entryTypeLabels } from './Calendar';
import type { Classroom, ID, SchoolYear } from '../data/types';

const statusTone = { current: 'ready', planning: 'info', archived: 'neutral' } as const;

export function SchoolYearsPage() {
  const db = useDb();
  const v = useViewer();
  const run = useRun();
  const confirm = useConfirm();
  const [editing, setEditing] = useState<ID | 'new' | null>(() => (new URLSearchParams(location.hash.split('?')[1] ?? '').get('new') === '1' ? 'new' : null));
  const [copyTo, setCopyTo] = useState<SchoolYear | null>(null);
  const [copyFrom, setCopyFrom] = useState('');
  const [entry, setEntry] = useState<{ yearId: ID; id?: ID } | null>(null);
  const [room, setRoom] = useState<Classroom | 'new' | null>(null);
  const canEdit = v.can('classes.edit');
  const years = [...db.schoolYears].sort((a, b) => b.startDate.localeCompare(a.startDate));

  return (
    <>
      <PageHeader
        title="School Years"
        subtitle="Dates, registration, holidays and closures for each year. Archived years keep all their history."
        actions={
          canEdit && (
            <button className="btn btn-primary" onClick={() => setEditing('new')}>
              <Plus size={16} /> Create school year
            </button>
          )
        }
      />
      {!years.length && (
        <Card>
          <EmptyState icon={<GraduationCap size={28} />} title="No school years yet" message="Create your first school year, then add classes to it." action={canEdit && <button className="btn btn-primary" onClick={() => setEditing('new')}><Plus size={16} /> Create school year</button>} />
        </Card>
      )}
      {years.map((y) => {
        const classes = db.classes.filter((c) => c.schoolYearId === y.id);
        const dancers = new Set(classes.flatMap((c) => enrolledDancerIds(db, c.id)));
        const entries = db.studioEvents.filter((e) => e.schoolYearId === y.id || (!e.schoolYearId && e.startDate >= y.startDate && e.startDate <= y.endDate)).sort((a, b) => a.startDate.localeCompare(b.startDate));
        return (
          <Card
            key={y.id}
            className={`year-card ${y.status}`}
            title={
              <>
                {y.name} <Badge tone={statusTone[y.status]}>{y.status === 'current' ? 'Current' : y.status === 'planning' ? 'Planning' : 'Archived'}</Badge> <SampleTag show={y.isSample} />
              </>
            }
            actions={
              canEdit && (
                <>
                  {y.status !== 'current' && (
                    <button className="btn btn-ghost btn-sm" onClick={() => run(() => setSchoolYearStatus(y.id, 'current'), `${y.name} is now the current year.`)}>
                      <Star size={14} /> Make current
                    </button>
                  )}
                  {y.status !== 'archived' && (
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={async () => {
                        if (await confirm({ title: `Archive ${y.name}?`, message: 'Archived years stay readable with all classes, enrollment and attendance history. Nothing is deleted.', confirmLabel: 'Archive' }))
                          run(() => setSchoolYearStatus(y.id, 'archived'), 'School year archived.');
                      }}
                    >
                      <Archive size={14} /> Archive
                    </button>
                  )}
                  <button className="btn btn-ghost btn-sm" onClick={() => (setCopyTo(y), setCopyFrom(''))}>
                    <Copy size={14} /> Copy classes in
                  </button>
                  <button className="icon-btn" aria-label={`Edit ${y.name}`} onClick={() => setEditing(y.id)}>
                    <Pencil size={15} />
                  </button>
                  <button
                    className="icon-btn danger"
                    aria-label={`Delete ${y.name}`}
                    onClick={async () => {
                      if (await confirm({ title: `Delete ${y.name}?`, message: 'Only years without classes can be deleted.', confirmLabel: 'Delete', danger: true })) run(() => deleteSchoolYear(y.id), 'School year deleted.');
                    }}
                  >
                    <Trash2 size={15} />
                  </button>
                </>
              )
            }
          >
            <div className="year-grid">
              <dl className="dl">
                <dt>Dates</dt>
                <dd>
                  {formatDate(y.startDate)} – {formatDate(y.endDate)}
                </dd>
                <dt>Registration</dt>
                <dd>{y.registrationStart ? `${formatDate(y.registrationStart)} – ${formatDate(y.registrationEnd) || 'open'}` : '—'}</dd>
                <dt>Classes</dt>
                <dd>
                  <Link to={`/classes?year=${y.id}`}>{classes.length} classes</Link> · {dancers.size} dancers enrolled
                </dd>
                <dt>Tuition</dt>
                <dd className="prewrap">{y.tuitionNotes || '—'}</dd>
                <dt>Recital</dt>
                <dd className="prewrap">{y.recitalInfo || '—'}</dd>
                {y.notes && (
                  <>
                    <dt>Notes</dt>
                    <dd className="prewrap">{y.notes}</dd>
                  </>
                )}
              </dl>
              <div>
                <div className="card-header compact">
                  <h3 className="mini-title">
                    <CalendarOff size={14} /> Holidays, closures & important dates
                  </h3>
                  {canEdit && (
                    <button className="btn btn-ghost btn-sm" onClick={() => setEntry({ yearId: y.id })}>
                      <Plus size={14} /> Add date
                    </button>
                  )}
                </div>
                {!entries.length ? (
                  <p className="faint small">None yet.</p>
                ) : (
                  <ul className="mini-list">
                    {entries.map((e) => (
                      <li key={e.id}>
                        <div>
                          <strong>{e.title}</strong>
                          <div className="small faint">
                            {formatDate(e.startDate)}
                            {e.endDate !== e.startDate && ` – ${formatDate(e.endDate)}`} · {entryTypeLabels[e.type]}
                            {e.cancelsClasses && ' · no classes'}
                          </div>
                        </div>
                        {canEdit && (
                          <div className="row-actions">
                            <button className="icon-btn" aria-label={`Edit ${e.title}`} onClick={() => setEntry({ yearId: y.id, id: e.id })}>
                              <Pencil size={14} />
                            </button>
                            <button className="icon-btn danger" aria-label={`Delete ${e.title}`} onClick={() => run(() => deleteStudioEvent(e.id), 'Removed.')}>
                              <Trash2 size={14} />
                            </button>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </Card>
        );
      })}

      <Card
        title="Classrooms"
        icon={<DoorOpen size={18} />}
        actions={
          canEdit && (
            <button className="btn btn-ghost btn-sm" onClick={() => setRoom('new')}>
              <Plus size={14} /> Add classroom
            </button>
          )
        }
      >
        {!db.classrooms.length ? (
          <p className="faint pad">No classrooms yet. Add them so classes can be booked without double-booking a room.</p>
        ) : (
          <ul className="mini-list">
            {db.classrooms.map((r) => (
              <li key={r.id}>
                <div>
                  <strong>{r.name}</strong>
                  <div className="small faint">
                    Capacity {r.capacity || '—'} · {db.classes.filter((c) => c.classroomId === r.id).length} classes
                    {r.notes && ` · ${r.notes}`}
                  </div>
                </div>
                {canEdit && (
                  <div className="row-actions">
                    <button className="icon-btn" aria-label={`Edit ${r.name}`} onClick={() => setRoom(r)}>
                      <Pencil size={14} />
                    </button>
                    <button
                      className="icon-btn danger"
                      aria-label={`Delete ${r.name}`}
                      onClick={async () => {
                        if (await confirm({ title: `Delete ${r.name}?`, message: 'Classes in this room will have no room assigned.', confirmLabel: 'Delete', danger: true })) run(() => deleteClassroom(r.id), 'Classroom deleted.');
                      }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <YearForm open={!!editing} id={editing === 'new' ? undefined : editing ?? undefined} onClose={() => setEditing(null)} />
      <RoomForm room={room} onClose={() => setRoom(null)} />
      <CalendarEntryForm open={!!entry} id={entry?.id} defaults={{ schoolYearId: entry?.yearId ?? null, type: 'holiday', cancelsClasses: true }} onClose={() => setEntry(null)} />
      <FormModal
        open={!!copyTo}
        onClose={() => setCopyTo(null)}
        title={`Copy classes into ${copyTo?.name ?? ''}`}
        size="sm"
        saveLabel="Copy classes"
        onSubmit={() => {
          const n = run(() => copyClassesToYear(copyFrom, copyTo!.id));
          if (n) {
            setCopyTo(null);
            run(() => 0, `${n} classes copied. Teachers, rooms and times are kept; enrollment starts empty.`);
          }
        }}
      >
        <Field label="Copy every class from">
          <select className="input" value={copyFrom} onChange={(e) => setCopyFrom(e.target.value)}>
            <option value="">Choose a school year…</option>
            {db.schoolYears
              .filter((y) => y.id !== copyTo?.id)
              .map((y) => (
                <option key={y.id} value={y.id}>
                  {y.name} ({db.classes.filter((c) => c.schoolYearId === y.id).length} classes)
                </option>
              ))}
          </select>
        </Field>
        <p className="small faint">The original year is untouched. Copied classes keep their schedule, teachers and rooms, with no dancers enrolled.</p>
      </FormModal>
    </>
  );
}

function YearForm({ open, id, onClose }: { open: boolean; id?: ID; onClose: () => void }) {
  const db = useDb();
  const run = useRun();
  const y0 = Number(todayStr().slice(0, 4));
  const empty: SchoolYearInput = { name: `${y0}–${y0 + 1}`, startDate: `${y0}-09-01`, endDate: `${y0 + 1}-06-15`, registrationStart: '', registrationEnd: '', status: 'planning', tuitionNotes: '', recitalInfo: '', notes: '' };
  const [v, setV] = useState<SchoolYearInput>(empty);
  const [last, setLast] = useState<string | null>(null);
  const key = open ? id ?? 'new' : null;
  if (key !== last) {
    setLast(key);
    const y = id ? db.schoolYears.find((x) => x.id === id) : undefined;
    if (open) setV(y ? { name: y.name, startDate: y.startDate, endDate: y.endDate, registrationStart: y.registrationStart, registrationEnd: y.registrationEnd, status: y.status, tuitionNotes: y.tuitionNotes, recitalInfo: y.recitalInfo, notes: y.notes } : empty);
  }
  const set = <K extends keyof SchoolYearInput>(k: K, val: SchoolYearInput[K]) => setV((p) => ({ ...p, [k]: val }));
  return (
    <FormModal open={open} onClose={onClose} title={id ? 'Edit School Year' : 'Create School Year'} onSubmit={() => run(() => saveSchoolYear(v, id), 'School year saved.') && onClose()}>
      <div className="grid-2">
        <Field label="Name" required>
          <input className="input" value={v.name} onChange={(e) => set('name', e.target.value)} autoFocus />
        </Field>
        <Field label="Status">
          <select className="input" value={v.status} onChange={(e) => set('status', e.target.value as SchoolYear['status'])}>
            <option value="planning">Planning</option>
            <option value="current">Current</option>
            <option value="archived">Archived</option>
          </select>
        </Field>
        <Field label="First day" required>
          <input className="input" type="date" value={v.startDate} onChange={(e) => set('startDate', e.target.value)} />
        </Field>
        <Field label="Last day" required>
          <input className="input" type="date" value={v.endDate} onChange={(e) => set('endDate', e.target.value)} />
        </Field>
        <Field label="Registration opens">
          <input className="input" type="date" value={v.registrationStart} onChange={(e) => set('registrationStart', e.target.value)} />
        </Field>
        <Field label="Registration closes">
          <input className="input" type="date" value={v.registrationEnd} onChange={(e) => set('registrationEnd', e.target.value)} />
        </Field>
      </div>
      <Field label="Tuition settings / notes">
        <textarea className="input" rows={2} value={v.tuitionNotes} onChange={(e) => set('tuitionNotes', e.target.value)} />
      </Field>
      <Field label="Recital information">
        <textarea className="input" rows={2} value={v.recitalInfo} onChange={(e) => set('recitalInfo', e.target.value)} />
      </Field>
      <Field label="Notes">
        <textarea className="input" rows={2} value={v.notes} onChange={(e) => set('notes', e.target.value)} />
      </Field>
    </FormModal>
  );
}

function RoomForm({ room, onClose }: { room: Classroom | 'new' | null; onClose: () => void }) {
  const run = useRun();
  const [v, setV] = useState({ name: '', capacity: 0, notes: '' });
  const [last, setLast] = useState<unknown>(null);
  if (room !== last) {
    setLast(room);
    if (room) setV(room === 'new' ? { name: '', capacity: 15, notes: '' } : { name: room.name, capacity: room.capacity, notes: room.notes });
  }
  return (
    <FormModal open={!!room} onClose={onClose} title={room === 'new' ? 'Add Classroom' : 'Edit Classroom'} size="sm" onSubmit={() => run(() => saveClassroom(v, room === 'new' ? undefined : (room as Classroom).id), 'Classroom saved.') && onClose()}>
      <Field label="Name" required>
        <input className="input" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} autoFocus />
      </Field>
      <Field label="Capacity (dancers)">
        <input className="input" type="number" min={0} value={v.capacity} onChange={(e) => setV({ ...v, capacity: Number(e.target.value) })} />
      </Field>
      <Field label="Notes">
        <input className="input" value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} />
      </Field>
    </FormModal>
  );
}

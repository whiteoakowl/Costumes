import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { AlertTriangle, ArrowRightLeft, ClipboardCheck, Copy, Pencil, Plus, School, Trash2, UserMinus, UserPlus } from 'lucide-react';
import { useDb } from '../data/store';
import { deleteClass, dropDancers, duplicateClass, enrollDancers, moveDancers, promoteFromWaitlist, saveClass, type ClassInput } from '../data/studioActions';
import { ageFromBirthday, formatDate, formatTime, fullName } from '../data/selectors';
import { WEEKDAY_NAMES, addDays, attendanceRate, classConflicts, enrolledDancerIds, occurrencesBetween, staffName, waitlistDancerIds } from '../data/studio';
import { Badge, BulkBar, Card, CheckList, DataTable, EmptyState, Field, PageHeader, SampleTag, SearchInput, SearchSelect, type Column } from '../components/ui';
import { FormModal } from '../components/forms';
import { Modal } from '../components/Modal';
import { useConfirm, useRun } from '../components/feedback';
import { Avatar } from '../components/photos';
import { classOptions, classWhen, currentYear, money, useStaffOptions } from '../components/studioUi';
import { useViewer } from '../lib/session';
import { todayStr } from '../data/ids';
import type { DanceClass, ID } from '../data/types';

export function ClassesPage() {
  const db = useDb();
  const v = useViewer();
  const run = useRun();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const yearId = params.get('year') ?? currentYear(db)?.id ?? '';
  const [q, setQ] = useState('');
  const [day, setDay] = useState('');
  const [teacher, setTeacher] = useState('');
  const [style, setStyle] = useState('');
  const [editing, setEditing] = useState<ID | 'new' | null>(() => (params.get('new') === '1' ? 'new' : null));
  const canEdit = v.can('classes.edit');
  const rows = db.classes.filter(
    (c) =>
      (!yearId || c.schoolYearId === yearId) &&
      (day === '' || c.dayOfWeek === Number(day)) &&
      (!teacher || c.teacherId === teacher || c.assistantId === teacher) &&
      (!style || c.style === style) &&
      (!q || `${c.name} ${c.style} ${c.level} ${c.description}`.toLowerCase().includes(q.toLowerCase())),
  );
  const rooms = new Map(db.classrooms.map((r) => [r.id, r.name]));
  const columns: Column<DanceClass>[] = [
    {
      key: 'name',
      header: 'Class',
      render: (c) => (
        <>
          <Link to={`/classes/${c.id}`} className="link-strong">
            {c.name}
          </Link>
          <SampleTag show={c.isSample} />
          <div className="small faint">
            {c.style} · {c.level}
            {c.ageMin !== null && ` · ages ${c.ageMin}${c.ageMax !== null ? `–${c.ageMax}` : '+'}`}
          </div>
        </>
      ),
      sortValue: (c) => c.name,
    },
    { key: 'when', header: 'Schedule', render: (c) => classWhen(c), sortValue: (c) => c.dayOfWeek * 10000 + Number(c.startTime.replace(':', '')) },
    { key: 'room', header: 'Room', render: (c) => rooms.get(c.classroomId ?? '') ?? <span className="faint">—</span>, sortValue: (c) => rooms.get(c.classroomId ?? '') ?? '', minor: true },
    {
      key: 'teacher',
      header: 'Teacher',
      render: (c) => (
        <div className="small">
          {c.teacherId ? <Link to={`/staff/${c.teacherId}`}>{staffName(db.staff.find((s) => s.id === c.teacherId))}</Link> : <span className="warn-text inline">Unassigned</span>}
          {c.assistantId && <div className="faint">Asst: {staffName(db.staff.find((s) => s.id === c.assistantId))}</div>}
        </div>
      ),
      sortValue: (c) => staffName(db.staff.find((s) => s.id === c.teacherId)),
    },
    {
      key: 'enrolled',
      header: 'Enrolled',
      render: (c) => {
        const n = enrolledDancerIds(db, c.id).length;
        const w = waitlistDancerIds(db, c.id).length;
        return (
          <span className={n >= c.maxEnrollment ? 'warn-text inline' : ''}>
            {n}/{c.maxEnrollment}
            {n >= c.maxEnrollment && ' full'}
            {w > 0 && <span className="faint"> · {w} waiting</span>}
          </span>
        );
      },
      sortValue: (c) => enrolledDancerIds(db, c.id).length / c.maxEnrollment,
    },
    ...(v.can('payroll.view') || v.portal === 'management' ? [{ key: 'tuition', header: 'Tuition', render: (c: DanceClass) => <span className="small">{money(c.tuition)}/mo</span>, sortValue: (c: DanceClass) => c.tuition, minor: true }] : []),
    {
      key: 'act',
      header: '',
      render: (c) =>
        canEdit && (
          <div className="row-actions">
            <button className="icon-btn" aria-label={`Edit ${c.name}`} onClick={() => setEditing(c.id)}>
              <Pencil size={15} />
            </button>
            <button className="icon-btn" aria-label={`Duplicate ${c.name}`} title="Duplicate" onClick={() => { const id = run(() => duplicateClass(c.id), 'Class duplicated — assign a teacher and room.'); if (id) setEditing(id); }}>
              <Copy size={15} />
            </button>
            <button
              className="icon-btn danger"
              aria-label={`Delete ${c.name}`}
              onClick={async () => {
                if (await confirm({ title: `Delete ${c.name}?`, message: 'Enrollments and schedule changes for this class are removed. Classes with attendance history cannot be deleted.', confirmLabel: 'Delete class', danger: true })) run(() => deleteClass(c.id), 'Class deleted.');
              }}
            >
              <Trash2 size={15} />
            </button>
          </div>
        ),
    },
  ];
  const styles = [...new Set(db.classes.map((c) => c.style).filter(Boolean))].sort();
  const teachers = db.staff.filter((s) => db.classes.some((c) => c.teacherId === s.id || c.assistantId === s.id));
  return (
    <>
      <PageHeader
        title="Classes"
        subtitle={`${rows.length} classes · ${new Set(rows.flatMap((c) => enrolledDancerIds(db, c.id))).size} dancers enrolled`}
        actions={
          canEdit && (
            <button className="btn btn-primary" onClick={() => setEditing('new')} disabled={!db.schoolYears.length} title={!db.schoolYears.length ? 'Create a school year first' : undefined}>
              <Plus size={16} /> Add class
            </button>
          )
        }
      />
      {!db.schoolYears.length && (
        <div className="hint-bar">
          <span>Classes belong to a school year. <Link to="/school-years">Create a school year</Link> first.</span>
        </div>
      )}
      <Card>
        <div className="toolbar">
          <select className="input input-auto" value={yearId} onChange={(e) => setParams(e.target.value ? { year: e.target.value } : {}, { replace: true })} aria-label="School year">
            {db.schoolYears.map((y) => (
              <option key={y.id} value={y.id}>
                {y.name}
                {y.status === 'current' ? ' (current)' : y.status === 'archived' ? ' (archived)' : ''}
              </option>
            ))}
          </select>
          <SearchInput value={q} onChange={setQ} placeholder="Search classes…" />
          <select className="input input-auto" value={day} onChange={(e) => setDay(e.target.value)} aria-label="Filter by day">
            <option value="">Every day</option>
            {WEEKDAY_NAMES.map((d, i) => (
              <option key={d} value={i}>
                {d}
              </option>
            ))}
          </select>
          <select className="input input-auto" value={teacher} onChange={(e) => setTeacher(e.target.value)} aria-label="Filter by teacher">
            <option value="">All teachers</option>
            {teachers.map((s) => (
              <option key={s.id} value={s.id}>
                {staffName(s)}
              </option>
            ))}
          </select>
          <select className="input input-auto" value={style} onChange={(e) => setStyle(e.target.value)} aria-label="Filter by style">
            <option value="">All styles</option>
            {styles.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </div>
        <DataTable rows={rows} columns={columns} getId={(c) => c.id} initialSort={{ key: 'when', dir: 'asc' }} empty={<EmptyState icon={<School size={28} />} title="No classes" message="Add classes to this school year." />} />
      </Card>
      <ClassForm open={!!editing} id={editing === 'new' ? undefined : editing ?? undefined} defaultYear={yearId} onClose={() => setEditing(null)} onSaved={(id) => editing === 'new' && navigate(`/classes/${id}`)} />
    </>
  );
}

export function ClassForm({ open, id, onClose, onSaved, defaultYear }: { open: boolean; id?: ID; onClose: () => void; onSaved?: (id: ID) => void; defaultYear?: ID }) {
  const db = useDb();
  const run = useRun();
  const teachers = useStaffOptions((s) => s.position !== 'office' && s.position !== 'performance');
  const empty = (): ClassInput => ({
    schoolYearId: defaultYear || currentYear(db)?.id || '',
    name: '',
    style: db.settings.danceStyles[0] ?? '',
    level: '',
    ageMin: null,
    ageMax: null,
    dayOfWeek: 1,
    startTime: '16:00',
    endTime: '17:00',
    classroomId: null,
    teacherId: null,
    assistantId: null,
    maxEnrollment: 12,
    description: '',
    notes: '',
    tuition: 0,
    startDate: '',
    endDate: '',
  });
  const [v, setV] = useState<ClassInput>(empty);
  const [override, setOverride] = useState(false);
  const [last, setLast] = useState<string | null>(null);
  const key = open ? id ?? 'new' : null;
  if (key !== last) {
    setLast(key);
    setOverride(false);
    const c = id ? db.classes.find((x) => x.id === id) : undefined;
    if (open) setV(c ? { ...c } : empty());
  }
  const set = <K extends keyof ClassInput>(k: K, val: ClassInput[K]) => setV((p) => ({ ...p, [k]: val }));
  const conflicts = useMemo(() => (v.schoolYearId && v.startTime < v.endTime ? classConflicts(db, v, id) : []), [db, v, id]);
  const num = (s: string) => (s === '' ? null : Number(s));
  return (
    <FormModal
      open={open}
      onClose={onClose}
      title={id ? 'Edit Class' : 'Add Class'}
      size="lg"
      onSubmit={() => {
        const saved = run(() => saveClass(v, id, { allowConflicts: override }), id ? 'Class updated.' : `${v.name.trim()} added.`);
        if (saved) {
          onClose();
          onSaved?.(saved);
        }
      }}
    >
      <div className="grid-2">
        <Field label="Class name" required>
          <input className="input" value={v.name} onChange={(e) => set('name', e.target.value)} autoFocus placeholder="e.g. Ballet 2" />
        </Field>
        <Field label="School year" required>
          <select className="input" value={v.schoolYearId} onChange={(e) => set('schoolYearId', e.target.value)}>
            {db.schoolYears.map((y) => (
              <option key={y.id} value={y.id}>
                {y.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Dance style">
          <input className="input" list="dance-styles" value={v.style} onChange={(e) => set('style', e.target.value)} />
          <datalist id="dance-styles">
            {db.settings.danceStyles.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </Field>
        <Field label="Level">
          <input className="input" list="levels-list" value={v.level} onChange={(e) => set('level', e.target.value)} />
          <datalist id="levels-list">
            {db.settings.levels.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </Field>
        <Field label="Ages">
          <div className="inline-form">
            <input className="input" type="number" min={0} placeholder="min" value={v.ageMin ?? ''} onChange={(e) => set('ageMin', num(e.target.value))} aria-label="Minimum age" />
            <span className="faint">to</span>
            <input className="input" type="number" min={0} placeholder="max" value={v.ageMax ?? ''} onChange={(e) => set('ageMax', num(e.target.value))} aria-label="Maximum age" />
          </div>
        </Field>
        <Field label="Day of week">
          <select className="input" value={v.dayOfWeek} onChange={(e) => set('dayOfWeek', Number(e.target.value))}>
            {WEEKDAY_NAMES.map((d, i) => (
              <option key={d} value={i}>
                {d}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Start time">
          <input className="input" type="time" value={v.startTime} onChange={(e) => set('startTime', e.target.value)} />
        </Field>
        <Field label="End time" hint={v.startTime < v.endTime ? `${Math.round(((Number(v.endTime.slice(0, 2)) * 60 + Number(v.endTime.slice(3))) - (Number(v.startTime.slice(0, 2)) * 60 + Number(v.startTime.slice(3)))))} minutes` : undefined}>
          <input className="input" type="time" value={v.endTime} onChange={(e) => set('endTime', e.target.value)} />
        </Field>
        <Field label="Classroom">
          <SearchSelect ariaLabel="Classroom" value={v.classroomId ?? ''} onChange={(x) => set('classroomId', x || null)} options={db.classrooms.map((r) => ({ value: r.id, label: r.name, hint: r.capacity ? `fits ${r.capacity}` : undefined }))} noneLabel="No room" />
        </Field>
        <Field label="Teacher">
          <SearchSelect ariaLabel="Teacher" value={v.teacherId ?? ''} onChange={(x) => set('teacherId', x || null)} options={teachers} noneLabel="Not assigned" />
        </Field>
        <Field label="Assistant teacher">
          <SearchSelect ariaLabel="Assistant teacher" value={v.assistantId ?? ''} onChange={(x) => set('assistantId', x || null)} options={teachers} noneLabel="None" />
        </Field>
        <Field label="Maximum enrollment">
          <input className="input" type="number" min={1} value={v.maxEnrollment} onChange={(e) => set('maxEnrollment', Number(e.target.value))} />
        </Field>
        <Field label="Monthly tuition ($)">
          <input className="input" type="number" min={0} step="0.01" value={v.tuition} onChange={(e) => set('tuition', Number(e.target.value))} />
        </Field>
        <Field label="Runs from" hint="Leave blank for the whole school year">
          <input className="input" type="date" value={v.startDate} onChange={(e) => set('startDate', e.target.value)} />
        </Field>
        <Field label="Runs until">
          <input className="input" type="date" value={v.endDate} onChange={(e) => set('endDate', e.target.value)} />
        </Field>
      </div>
      {conflicts.length > 0 && (
        <div className="conflict-box" role="alert">
          <strong>
            <AlertTriangle size={15} /> Scheduling conflict
          </strong>
          <ul>
            {conflicts.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
          <label className="check-inline small">
            <input type="checkbox" checked={override} onChange={(e) => setOverride(e.target.checked)} /> Save anyway — I've checked this is intended (recorded in the activity log)
          </label>
        </div>
      )}
      <Field label="Description">
        <textarea className="input" rows={2} value={v.description} onChange={(e) => set('description', e.target.value)} />
      </Field>
      <Field label="Notes">
        <textarea className="input" rows={2} value={v.notes} onChange={(e) => set('notes', e.target.value)} />
      </Field>
    </FormModal>
  );
}

export function ClassDetailPage() {
  const { id } = useParams();
  const db = useDb();
  const v = useViewer();
  const run = useRun();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [toAdd, setToAdd] = useState<Set<ID>>(new Set());
  const [selected, setSelected] = useState<Set<ID>>(new Set());
  const [moveTo, setMoveTo] = useState('');
  const c = db.classes.find((x) => x.id === id);
  if (!c) return <EmptyState title="Class not found" action={<Link to="/classes" className="btn btn-primary">Back to classes</Link>} />;
  const canEdit = v.can('classes.edit');
  const enrolled = enrolledDancerIds(db, c.id).map((d) => db.dancers.find((x) => x.id === d)!).filter(Boolean);
  const waitlist = waitlistDancerIds(db, c.id).map((d) => db.dancers.find((x) => x.id === d)!).filter(Boolean);
  const year = db.schoolYears.find((y) => y.id === c.schoolYearId);
  const today = todayStr();
  const upcoming = occurrencesBetween(db, today, addDays(today, 42), { includeCancelled: true, classIds: new Set([c.id]) }).slice(0, 6);
  const att = db.attendance.filter((a) => a.classId === c.id);
  const sessionsTaken = [...new Set(att.map((a) => a.date))].sort().reverse();
  const full = enrolled.length >= c.maxEnrollment;
  const ids = [...selected].filter((x) => enrolled.some((d) => d.id === x));
  const fits = (dId: ID) => {
    const d = db.dancers.find((x) => x.id === dId)!;
    const age = ageFromBirthday(d.birthday);
    if (age === null || (c.ageMin === null && c.ageMax === null)) return '';
    if ((c.ageMin !== null && age < c.ageMin) || (c.ageMax !== null && age > c.ageMax)) return ` · age ${age} (outside ${c.ageMin ?? ''}–${c.ageMax ?? ''})`;
    return ` · age ${age}`;
  };
  const candidates = db.dancers
    .filter((d) => !enrolled.some((e) => e.id === d.id) && d.enrollmentStatus !== 'withdrawn')
    .map((d) => ({ value: d.id, label: fullName(d), hint: `${d.level || 'No level'}${fits(d.id)}`, group: d.level || 'No level' }))
    .sort((a, b) => a.group.localeCompare(b.group) || a.label.localeCompare(b.label));

  return (
    <>
      <PageHeader
        back={{ to: '/classes', label: 'Classes' }}
        title={
          <>
            {c.name} <SampleTag show={c.isSample} />
          </>
        }
        subtitle={`${c.style} · ${c.level} · ${classWhen(c)} · ${db.classrooms.find((r) => r.id === c.classroomId)?.name ?? 'No room'} · ${year?.name ?? ''}`}
        actions={
          <>
            {v.can('attendance.take') && (
              <Link className="btn btn-ghost" to={`/attendance?class=${c.id}`}>
                <ClipboardCheck size={16} /> Take attendance
              </Link>
            )}
            {canEdit && (
              <>
                <button
                  className="btn btn-ghost danger"
                  onClick={async () => {
                    if (await confirm({ title: `Delete ${c.name}?`, message: 'Classes with attendance history cannot be deleted.', confirmLabel: 'Delete class', danger: true }))
                      if (run(() => (deleteClass(c.id), true), 'Class deleted.')) navigate('/classes');
                  }}
                >
                  <Trash2 size={16} /> Delete
                </button>
                <button className="btn btn-primary" onClick={() => setEditing(true)}>
                  <Pencil size={16} /> Edit class
                </button>
              </>
            )}
          </>
        }
      />
      <div className="detail-grid">
        <div className="stack">
          <Card title="Class Details">
            <dl className="dl">
              <dt>Teacher</dt>
              <dd>{c.teacherId ? <Link to={`/staff/${c.teacherId}`}>{staffName(db.staff.find((s) => s.id === c.teacherId))}</Link> : 'Not assigned'}</dd>
              <dt>Assistant</dt>
              <dd>{c.assistantId ? <Link to={`/staff/${c.assistantId}`}>{staffName(db.staff.find((s) => s.id === c.assistantId))}</Link> : '—'}</dd>
              <dt>Schedule</dt>
              <dd>
                {WEEKDAY_NAMES[c.dayOfWeek]}s, {classWhen(c).split(' ').slice(1).join(' ')}
              </dd>
              <dt>Runs</dt>
              <dd>
                {formatDate(c.startDate || year?.startDate || '')} – {formatDate(c.endDate || year?.endDate || '')}
              </dd>
              <dt>Ages</dt>
              <dd>{c.ageMin !== null || c.ageMax !== null ? `${c.ageMin ?? ''}–${c.ageMax ?? ''}` : 'Any'}</dd>
              <dt>Enrollment</dt>
              <dd>
                {enrolled.length} of {c.maxEnrollment}
                {full && <Badge tone="progress">Full</Badge>}
              </dd>
              <dt>Tuition</dt>
              <dd>{money(c.tuition)} / month</dd>
              <dt>Description</dt>
              <dd className="prewrap">{c.description || '—'}</dd>
              {c.notes && (
                <>
                  <dt>Notes</dt>
                  <dd className="prewrap">{c.notes}</dd>
                </>
              )}
            </dl>
          </Card>
          <Card title="Upcoming Classes" actions={<Link to="/calendar" className="btn btn-ghost btn-sm">Calendar</Link>}>
            <ul className="mini-list">
              {upcoming.map((o) => (
                <li key={o.key} className={o.cancelled ? 'muted' : ''}>
                  <div>
                    <strong>{formatDate(o.date)}</strong> <span className="small faint">{formatTime(o.start)}–{formatTime(o.end)}</span>
                    {o.cancelled && <div className="small bad-text">Cancelled: {o.cancelReason}</div>}
                    {o.substituted && <div className="small">Substitute: {staffName(db.staff.find((s) => s.id === o.teacherId))}</div>}
                    {o.moved && !o.cancelled && <div className="small">Moved from {formatDate(o.originalDate)}</div>}
                  </div>
                </li>
              ))}
              {!upcoming.length && <li className="faint small">No upcoming classes.</li>}
            </ul>
          </Card>
          <Card title={`Attendance (${sessionsTaken.length} classes recorded)`}>
            {!sessionsTaken.length ? (
              <p className="faint pad">No attendance recorded yet.</p>
            ) : (
              <ul className="mini-list">
                {sessionsTaken.slice(0, 8).map((d) => {
                  const recs = att.filter((a) => a.date === d);
                  return (
                    <li key={d}>
                      <Link to={`/attendance?class=${c.id}&date=${d}`}>{formatDate(d)}</Link>
                      <span className="small faint">
                        {recs.filter((r) => r.status === 'present' || r.status === 'late').length}/{recs.length} present
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>
        <div className="stack">
          <Card
            title={`Class Roster (${enrolled.length}/${c.maxEnrollment})`}
            actions={
              canEdit && (
                <button className="btn btn-primary btn-sm" onClick={() => (setToAdd(new Set()), setAdding(true))}>
                  <UserPlus size={14} /> Add dancers
                </button>
              )
            }
          >
            {canEdit && (
              <BulkBar count={ids.length} onClear={() => setSelected(new Set())}>
                <SearchSelect ariaLabel="Move to class" value={moveTo} onChange={setMoveTo} placeholder="Move to class…" options={classOptions(db, c.schoolYearId).filter((o) => o.value !== c.id)} />
                <button className="btn btn-ghost btn-sm" disabled={!moveTo} onClick={() => run(() => (moveDancers(c.id, moveTo, ids), true), `Moved ${ids.length} dancer(s).`) && (setSelected(new Set()), setMoveTo(''))}>
                  <ArrowRightLeft size={14} /> Move
                </button>
                <button
                  className="btn btn-ghost btn-sm danger"
                  onClick={async () => {
                    if (await confirm({ title: 'Remove from class?', message: `Remove ${ids.length} dancer(s) from ${c.name}? Their attendance history is kept.`, confirmLabel: 'Remove', danger: true }))
                      if (run(() => (dropDancers(c.id, ids), true), 'Removed from class.')) setSelected(new Set());
                  }}
                >
                  <UserMinus size={14} /> Remove
                </button>
              </BulkBar>
            )}
            {!enrolled.length ? (
              <p className="faint pad">No dancers enrolled yet.</p>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    {canEdit && <th className="col-check" />}
                    <th>Dancer</th>
                    <th>Age</th>
                    <th className="minor">Level</th>
                    <th>Attendance</th>
                  </tr>
                </thead>
                <tbody>
                  {enrolled
                    .sort((a, b) => fullName(a).localeCompare(fullName(b)))
                    .map((d) => {
                      const rate = attendanceRate(att.filter((a) => a.dancerId === d.id));
                      return (
                        <tr key={d.id} className={selected.has(d.id) ? 'selected' : ''}>
                          {canEdit && (
                            <td className="col-check">
                              <input
                                type="checkbox"
                                aria-label={`Select ${fullName(d)}`}
                                checked={selected.has(d.id)}
                                onChange={() => {
                                  const n = new Set(selected);
                                  if (n.has(d.id)) n.delete(d.id);
                                  else n.add(d.id);
                                  setSelected(n);
                                }}
                              />
                            </td>
                          )}
                          <td>
                            <div className="with-avatar">
                              <Avatar ownerType="dancer" ownerId={d.id} size={30} round />
                              <Link to={`/dancers/${d.id}`} className="link-strong">
                                {fullName(d)}
                              </Link>
                            </div>
                          </td>
                          <td>{ageFromBirthday(d.birthday) ?? '—'}</td>
                          <td className="minor">{d.level}</td>
                          <td>{rate === null ? <span className="faint">—</span> : `${rate}%`}</td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            )}
          </Card>
          <Card title={`Waiting List (${waitlist.length})`}>
            {!waitlist.length ? (
              <p className="faint pad small">Nobody is waiting. When the class is full, extra dancers are added here automatically.</p>
            ) : (
              <ul className="mini-list">
                {waitlist.map((d, i) => (
                  <li key={d.id}>
                    <span>
                      {i + 1}. <Link to={`/dancers/${d.id}`}>{fullName(d)}</Link>
                    </span>
                    {canEdit && (
                      <div className="row-actions">
                        <button className="btn btn-ghost btn-sm" disabled={full} title={full ? 'Class is full' : undefined} onClick={() => run(() => promoteFromWaitlist(c.id, d.id), `${d.firstName} enrolled.`)}>
                          Enroll
                        </button>
                        <button className="icon-btn danger" aria-label={`Remove ${d.firstName} from waiting list`} onClick={() => run(() => dropDancers(c.id, [d.id]), 'Removed from waiting list.')}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
      <ClassForm open={editing} id={c.id} onClose={() => setEditing(false)} />
      <Modal
        open={adding}
        onClose={() => setAdding(false)}
        title={`Add Dancers to ${c.name}`}
        subtitle={`${c.maxEnrollment - enrolled.length} open spot(s). Extra dancers go on the waiting list.`}
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setAdding(false)}>
              Cancel
            </button>
            <button
              className="btn btn-primary"
              disabled={!toAdd.size}
              onClick={() => {
                const r = run(() => enrollDancers(c.id, [...toAdd]));
                if (r) {
                  run(() => 0, `${r.enrolled} enrolled${r.waitlisted ? `, ${r.waitlisted} added to the waiting list (class full)` : ''}.`);
                  setAdding(false);
                }
              }}
            >
              Add {toAdd.size || ''} dancer{toAdd.size === 1 ? '' : 's'}
            </button>
          </>
        }
      >
        <CheckList options={candidates} selected={toAdd} onChange={setToAdd} emptyText="Every dancer is already enrolled." />
      </Modal>
    </>
  );
}

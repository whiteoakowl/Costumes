import { useMemo, useState } from 'react';
import { Link, useSearchParams } from '../lib/router';
import { CheckCheck, ClipboardCheck, Download, Lock, Save } from 'lucide-react';
import { useDb } from '../data/store';
import { saveAttendance } from '../data/studioActions';
import { formatDate, formatTime, fullName } from '../data/selectors';
import { addDays, attendanceLabels, attendanceRate, enrolledDancerIds, occurrencesBetween, staffClassIds, staffName } from '../data/studio';
import { Card, EmptyState, PageHeader, SearchSelect, Tabs } from '../components/ui';
import { useRun } from '../components/feedback';
import { Avatar } from '../components/photos';
import { classOptions, currentYear, download, toCsv } from '../components/studioUi';
import { useViewer } from '../lib/session';
import { todayStr } from '../data/ids';
import type { AttendanceStatus, ID } from '../data/types';

const STATUSES: AttendanceStatus[] = ['present', 'absent', 'late', 'excused', 'makeup'];
/** Teachers may change attendance for this many days; office/owner any time. */
export const TEACHER_EDIT_DAYS = 7;

export function AttendancePage() {
  const db = useDb();
  const v = useViewer();
  const [params] = useSearchParams();
  const canAll = v.isStaffAdmin && v.can('attendance.viewAll');
  const [tab, setTab] = useState<'take' | 'records'>(params.get('tab') === 'records' && canAll ? 'records' : 'take');
  return (
    <>
      <PageHeader title="Attendance" subtitle={v.portal === 'teacher' ? 'Take attendance for your classes' : 'Take attendance and review records across the studio'} />
      {canAll && (
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            { value: 'take', label: 'Take attendance' },
            { value: 'records', label: 'Records & reports', count: db.attendance.length },
          ]}
        />
      )}
      {tab === 'take' ? <TakeAttendance /> : <AttendanceRecords />}
    </>
  );
}

function TakeAttendance() {
  const db = useDb();
  const v = useViewer();
  const run = useRun();
  const [params, setParams] = useSearchParams();
  const allowed = v.portal === 'teacher' ? staffClassIds(db, v.staffId) : null;
  const year = currentYear(db);
  const options = classOptions(db, allowed ? undefined : year?.id, allowed ?? undefined);
  const today = todayStr();
  const todays = occurrencesBetween(db, today, today, { classIds: allowed ? new Set(allowed) : undefined });
  const classId = params.get('class') ?? todays[0]?.classId ?? '';
  const sessions = useMemo(() => (classId ? occurrencesBetween(db, addDays(today, -60), addDays(today, 7), { includeCancelled: true, classIds: new Set([classId]) }) : []), [db, classId, today]);
  const fallback = [...sessions].reverse().find((o) => o.date <= today && !o.cancelled)?.originalDate ?? sessions[0]?.originalDate ?? '';
  const date = params.get('date') ?? fallback;
  const occ = sessions.find((o) => o.originalDate === date);
  const cls = db.classes.find((c) => c.id === classId);
  const existing = db.attendance.filter((a) => a.classId === classId && a.date === date);
  const rosterIds = [...new Set([...enrolledDancerIds(db, classId), ...existing.map((a) => a.dancerId)])];
  const roster = rosterIds.map((id) => db.dancers.find((d) => d.id === id)).filter(Boolean).sort((a, b) => fullName(a!).localeCompare(fullName(b!)));
  const [draft, setDraft] = useState<Record<string, { status: AttendanceStatus; note: string }>>({});
  const [draftKey, setDraftKey] = useState('');
  const key = `${classId}:${date}:${existing.length}`;
  if (key !== draftKey) {
    setDraftKey(key);
    const next: Record<string, { status: AttendanceStatus; note: string }> = {};
    for (const d of roster) {
      const rec = existing.find((a) => a.dancerId === d!.id);
      next[d!.id] = { status: rec?.status ?? 'present', note: rec?.note ?? '' };
    }
    setDraft(next);
  }
  const locked = v.portal === 'teacher' && existing.length > 0 && date < addDays(today, -TEACHER_EDIT_DAYS);
  const future = (occ?.date ?? date) > today;
  const setP = (k: string, val: string) => {
    const n = new URLSearchParams(params);
    n.set(k, val);
    if (k === 'class') n.delete('date');
    setParams(n, { replace: true });
  };
  const taken = existing.length > 0;

  return (
    <Card>
      <div className="toolbar">
        <div className="attn-class">
          <SearchSelect ariaLabel="Class" value={classId} onChange={(x) => setP('class', x)} options={options} placeholder="Choose a class…" />
        </div>
        {classId && (
          <select className="input input-auto" value={date} onChange={(e) => setP('date', e.target.value)} aria-label="Class date">
            {[...sessions].reverse().map((o) => (
              <option key={o.key} value={o.originalDate}>
                {formatDate(o.date)}
                {o.date === today ? ' (today)' : ''}
                {o.cancelled ? ' — cancelled' : ''}
                {db.attendance.some((a) => a.classId === classId && a.date === o.originalDate) ? ' ✓' : ''}
              </option>
            ))}
          </select>
        )}
        {todays.length > 0 && (
          <span className="small faint">
            Today:{' '}
            {todays.map((o, i) => (
              <span key={o.key}>
                {i > 0 && ', '}
                <button className="linkish" onClick={() => setParams({ class: o.classId, date: o.originalDate }, { replace: true })}>
                  {o.cls.name}
                </button>
              </span>
            ))}
          </span>
        )}
      </div>
      {!classId ? (
        <EmptyState icon={<ClipboardCheck size={28} />} title="Choose a class" message={options.length ? 'Pick a class and date to take attendance.' : v.portal === 'teacher' ? 'You are not assigned to any classes yet.' : 'Add classes first.'} />
      ) : !cls ? (
        <EmptyState title="Class not found" />
      ) : (
        <>
          <div className="attn-head">
            <div>
              <h3>{cls.name}</h3>
              <div className="small faint">
                {occ ? `${formatDate(occ.date)} · ${formatTime(occ.start)}–${formatTime(occ.end)} · ${staffName(db.staff.find((s) => s.id === occ.teacherId))}` : formatDate(date)}
                {occ?.cancelled && <span className="bad-text"> · Cancelled: {occ.cancelReason}</span>}
              </div>
              {taken && <div className="small">Attendance saved{existing[0]?.takenBy ? ` by ${existing[0].takenBy}` : ''}. You can update it.</div>}
            </div>
            {!locked && roster.length > 0 && (
              <button className="btn btn-ghost btn-sm" onClick={() => setDraft(Object.fromEntries(roster.map((d) => [d!.id, { status: 'present' as AttendanceStatus, note: draft[d!.id]?.note ?? '' }])))}>
                <CheckCheck size={14} /> Mark all present
              </button>
            )}
          </div>
          {locked && (
            <div className="hint-bar">
              <span>
                <Lock size={14} /> Attendance older than {TEACHER_EDIT_DAYS} days can only be changed by the office.
              </span>
            </div>
          )}
          {future && <div className="hint-bar"><span>This class hasn't happened yet — you can still pre-mark known absences.</span></div>}
          {!roster.length ? (
            <EmptyState title="No dancers enrolled" message="Enroll dancers on the class page first." />
          ) : (
            <div className="attn-list">
              {roster.map((d) => {
                const row = draft[d!.id] ?? { status: 'present', note: '' };
                return (
                  <div key={d!.id} className={`attn-row s-${row.status}`}>
                    <div className="with-avatar">
                      <Avatar ownerType="dancer" ownerId={d!.id} size={34} round />
                      <span className="link-strong">{fullName(d!)}</span>
                    </div>
                    <div className="attn-buttons" role="radiogroup" aria-label={`Attendance for ${fullName(d!)}`}>
                      {STATUSES.map((s) => (
                        <button key={s} type="button" role="radio" aria-checked={row.status === s} disabled={locked} className={`attn-btn ${s} ${row.status === s ? 'on' : ''}`} onClick={() => setDraft({ ...draft, [d!.id]: { ...row, status: s } })}>
                          {attendanceLabels[s]}
                        </button>
                      ))}
                    </div>
                    <input className="input input-sm attn-note" placeholder="Note" value={row.note} disabled={locked} aria-label={`Note for ${fullName(d!)}`} onChange={(e) => setDraft({ ...draft, [d!.id]: { ...row, note: e.target.value } })} />
                  </div>
                );
              })}
            </div>
          )}
          {!locked && roster.length > 0 && (
            <div className="attn-save">
              <span className="small faint">
                {STATUSES.map((s) => `${roster.filter((d) => (draft[d!.id]?.status ?? 'present') === s).length} ${attendanceLabels[s].toLowerCase()}`).join(' · ')}
              </span>
              <button
                className="btn btn-primary"
                onClick={() =>
                  run(
                    () => saveAttendance(classId, date, roster.map((d) => ({ dancerId: d!.id, status: draft[d!.id]?.status ?? 'present', note: draft[d!.id]?.note ?? '' }))),
                    taken ? 'Attendance updated.' : 'Attendance saved.',
                  )
                }
              >
                <Save size={16} /> {taken ? 'Update attendance' : 'Save attendance'}
              </button>
            </div>
          )}
        </>
      )}
    </Card>
  );
}

function AttendanceRecords() {
  const db = useDb();
  const year = currentYear(db);
  const [classId, setClassId] = useState('');
  const [dancerId, setDancerId] = useState('');
  const [teacherId, setTeacherId] = useState('');
  const [from, setFrom] = useState(year?.startDate ?? '');
  const [to, setTo] = useState(todayStr());
  const [status, setStatus] = useState('');
  const classes = new Map(db.classes.map((c) => [c.id, c]));
  const dancers = new Map(db.dancers.map((d) => [d.id, d]));
  const records = db.attendance
    .filter((a) => {
      const c = classes.get(a.classId);
      if (classId && a.classId !== classId) return false;
      if (dancerId && a.dancerId !== dancerId) return false;
      if (teacherId && c?.teacherId !== teacherId && c?.assistantId !== teacherId) return false;
      if (from && a.date < from) return false;
      if (to && a.date > to) return false;
      if (status && a.status !== status) return false;
      return true;
    })
    .sort((a, b) => b.date.localeCompare(a.date));
  const byDancer = new Map<ID, typeof records>();
  for (const r of records) byDancer.set(r.dancerId, [...(byDancer.get(r.dancerId) ?? []), r]);
  const summary = [...byDancer.entries()]
    .map(([id, recs]) => ({ id, name: dancers.get(id) ? fullName(dancers.get(id)!) : 'Removed dancer', recs, rate: attendanceRate(recs) }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const exportCsv = () =>
    download(
      `attendance-${todayStr()}.csv`,
      toCsv(
        ['Date', 'Class', 'Teacher', 'Dancer', 'Status', 'Note', 'Recorded by'],
        records.map((r) => {
          const c = classes.get(r.classId);
          return [formatDate(r.date), c?.name ?? 'Deleted class', staffName(db.staff.find((s) => s.id === c?.teacherId)), dancers.get(r.dancerId) ? fullName(dancers.get(r.dancerId)!) : 'Removed dancer', attendanceLabels[r.status], r.note, r.takenBy];
        }),
      ),
      'text/csv;charset=utf-8',
    );
  const monthStart = `${todayStr().slice(0, 8)}01`;
  return (
    <>
      <Card>
        <div className="toolbar">
          <div className="attn-class">
            <SearchSelect ariaLabel="Filter by class" value={classId} onChange={setClassId} options={classOptions(db)} noneLabel="All classes" />
          </div>
          <div className="attn-class">
            <SearchSelect ariaLabel="Filter by dancer" value={dancerId} onChange={setDancerId} options={db.dancers.map((d) => ({ value: d.id, label: fullName(d) }))} noneLabel="All dancers" />
          </div>
          <select className="input input-auto" value={teacherId} onChange={(e) => setTeacherId(e.target.value)} aria-label="Filter by teacher">
            <option value="">All teachers</option>
            {db.staff
              .filter((s) => db.classes.some((c) => c.teacherId === s.id || c.assistantId === s.id))
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {staffName(s)}
                </option>
              ))}
          </select>
          <select className="input input-auto" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status">
            <option value="">Any status</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {attendanceLabels[s]}
              </option>
            ))}
          </select>
          <div className="age-filter">
            <input className="input input-auto" type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From" />
            <span className="faint">–</span>
            <input className="input input-auto" type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To" />
          </div>
          <button className="btn btn-ghost btn-sm" onClick={() => (setFrom(monthStart), setTo(todayStr()))}>
            This month
          </button>
          {year && (
            <button className="btn btn-ghost btn-sm" onClick={() => (setFrom(year.startDate), setTo(year.endDate))}>
              School year
            </button>
          )}
          <button className="btn btn-ghost btn-sm" onClick={exportCsv} disabled={!records.length}>
            <Download size={14} /> Export CSV
          </button>
        </div>
        <div className="stats stats-4">
          {STATUSES.slice(0, 4).map((s) => (
            <div key={s} className="mini-stat">
              <strong>{records.filter((r) => r.status === s).length}</strong>
              <span>{attendanceLabels[s]}</span>
            </div>
          ))}
        </div>
      </Card>
      <Card title={`Attendance by Dancer (${summary.length})`}>
        {!summary.length ? (
          <p className="faint pad">No records for these filters.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Dancer</th>
                  {STATUSES.map((s) => (
                    <th key={s}>{attendanceLabels[s]}</th>
                  ))}
                  <th>Rate</th>
                </tr>
              </thead>
              <tbody>
                {summary.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <Link to={`/dancers/${r.id}`} className="link-strong">
                        {r.name}
                      </Link>
                    </td>
                    {STATUSES.map((s) => (
                      <td key={s}>{r.recs.filter((x) => x.status === s).length || ''}</td>
                    ))}
                    <td className={r.rate !== null && r.rate < 80 ? 'warn-text' : ''}>{r.rate === null ? '—' : `${r.rate}%`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <Card title={`Records (${records.length})`}>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Class</th>
                <th>Dancer</th>
                <th>Status</th>
                <th className="minor">Note</th>
                <th className="minor">Recorded by</th>
              </tr>
            </thead>
            <tbody>
              {records.slice(0, 300).map((r) => (
                <tr key={r.id}>
                  <td className="nowrap">{formatDate(r.date)}</td>
                  <td>
                    <Link to={`/attendance?class=${r.classId}&date=${r.date}`}>{classes.get(r.classId)?.name ?? 'Deleted class'}</Link>
                  </td>
                  <td>{dancers.get(r.dancerId) ? fullName(dancers.get(r.dancerId)!) : 'Removed dancer'}</td>
                  <td>
                    <span className={`attn-pill ${r.status}`}>{attendanceLabels[r.status]}</span>
                  </td>
                  <td className="minor small">{r.note}</td>
                  <td className="minor small faint">{r.takenBy}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {records.length > 300 && <p className="small faint center">Showing the latest 300 — export CSV for everything.</p>}
      </Card>
    </>
  );
}

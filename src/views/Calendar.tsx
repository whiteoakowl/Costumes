import { useMemo, useState, type DragEvent } from 'react';
import { Link } from '../lib/router';
import { AlertTriangle, CalendarPlus, ChevronLeft, ChevronRight, ClipboardCheck, Undo2, XCircle } from 'lucide-react';
import { useDb } from '../data/store';
import { cancelSession, deleteStudioEvent, rescheduleSession, restoreSession, saveStudioEvent, ConflictError, type RescheduleInput, type StudioEventInput } from '../data/studioActions';
import { formatDate, formatTime } from '../data/selectors';
import { WEEKDAY_NAMES, addDays, closureOn, enrolledDancerIds, fromMinutes, minutes, occurrenceConflicts, occurrencesBetween, parseDate, startOfWeek, staffName, toDateStr, type Occurrence } from '../data/studio';
import { Card, Field, PageHeader, SearchSelect, Tabs } from '../components/ui';
import { FormModal } from '../components/forms';
import { Modal } from '../components/Modal';
import { useConfirm, useRun, useToast } from '../components/feedback';
import { useStaffOptions } from '../components/studioUi';
import { useViewer } from '../lib/session';
import { todayStr } from '../data/ids';
import type { CalendarEntryType, ID, StudioEvent } from '../data/types';

export const entryTypeLabels: Record<CalendarEntryType, string> = {
  holiday: 'Holiday',
  closure: 'Studio closure',
  weather: 'Weather closure',
  rehearsal: 'Special rehearsal',
  master_class: 'Master class',
  workshop: 'Workshop',
  guest: 'Guest teacher',
  competition_rehearsal: 'Competition rehearsal',
  important: 'Important date',
  event: 'Event',
};

type View = 'year' | 'month' | 'week' | 'day';
const DAY_START = 8 * 60;
const DAY_END = 21 * 60 + 30;
const PX_PER_MIN = 0.9;

interface Props {
  /** Limit to these classes (teacher / parent views). */
  classIds?: Set<ID>;
  readOnly?: boolean;
  title?: string;
  subtitle?: string;
}

/** Full studio calendar page (management & office). */
export function CalendarPage() {
  const v = useViewer();
  return <StudioCalendar readOnly={!v.can('calendar.edit')} />;
}

export function StudioCalendar({ classIds, readOnly, title = 'Calendar', subtitle = 'Classes, closures, rehearsals and performances for the whole studio' }: Props) {
  const db = useDb();
  const [view, setView] = useState<View>('week');
  const [anchor, setAnchor] = useState(todayStr());
  const [teacher, setTeacher] = useState('');
  const [room, setRoom] = useState('');
  const [showCancelled, setShowCancelled] = useState(true);
  const [openOcc, setOpenOcc] = useState<Occurrence | null>(null);
  const [entry, setEntry] = useState<{ id?: ID; date?: string } | null>(() => (!readOnly && new URLSearchParams(window.location.search).get('new') === '1' ? { date: todayStr() } : null));
  const [pendingMove, setPendingMove] = useState<{ occ: Occurrence; input: RescheduleInput; conflicts: string[] } | null>(null);
  const run = useRun();
  const toast = useToast();

  const range = useMemo(() => {
    if (view === 'day') return { from: anchor, to: anchor };
    if (view === 'week') {
      const s = startOfWeek(anchor);
      return { from: s, to: addDays(s, 6) };
    }
    if (view === 'month') {
      const first = `${anchor.slice(0, 8)}01`;
      const s = startOfWeek(first);
      return { from: s, to: addDays(s, 41) };
    }
    return { from: `${anchor.slice(0, 4)}-01-01`, to: `${anchor.slice(0, 4)}-12-31` };
  }, [view, anchor]);

  const occs = useMemo(
    () =>
      occurrencesBetween(db, range.from, range.to, { includeCancelled: true, classIds }).filter(
        (o) => (showCancelled || !o.cancelled) && (!teacher || o.teacherId === teacher || o.assistantId === teacher || o.regularTeacherId === teacher) && (!room || o.classroomId === room),
      ),
    [db, range, classIds, showCancelled, teacher, room],
  );
  const events = db.studioEvents.filter((e) => e.startDate <= range.to && (e.endDate || e.startDate) >= range.from);
  const perfs = db.performances.filter((p) => p.date && p.date >= range.from && p.date <= range.to);
  const eventsOn = (d: string) => events.filter((e) => e.startDate <= d && d <= (e.endDate || e.startDate));
  const perfsOn = (d: string) => perfs.filter((p) => p.date === d);
  const occsOn = (d: string) => occs.filter((o) => o.date === d);

  const step = (dir: -1 | 1) => {
    if (view === 'day') setAnchor(addDays(anchor, dir));
    else if (view === 'week') setAnchor(addDays(anchor, 7 * dir));
    else if (view === 'month') {
      const d = parseDate(anchor);
      d.setDate(1);
      d.setMonth(d.getMonth() + dir);
      setAnchor(toDateStr(d));
    } else setAnchor(`${Number(anchor.slice(0, 4)) + dir}${anchor.slice(4)}`);
  };
  const heading =
    view === 'day'
      ? `${WEEKDAY_NAMES[parseDate(anchor).getDay()]} ${formatDate(anchor)}`
      : view === 'week'
        ? `${formatDate(range.from)} – ${formatDate(range.to)}`
        : view === 'month'
          ? parseDate(anchor).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
          : anchor.slice(0, 4);

  const tryMove = (occ: Occurrence, date: string, start: string) => {
    const dur = minutes(occ.end) - minutes(occ.start);
    const input: RescheduleInput = { newDate: date, newStartTime: start, newEndTime: fromMinutes(minutes(start) + dur), newClassroomId: occ.classroomId, substituteId: occ.substituted ? occ.teacherId : null, reason: 'Rescheduled on the calendar' };
    try {
      rescheduleSession(occ.classId, occ.originalDate, input);
      toast.success(`${occ.cls.name} moved to ${formatDate(date)} at ${formatTime(start)}. Teachers and families were notified.`);
    } catch (err) {
      if (err instanceof ConflictError) setPendingMove({ occ, input, conflicts: err.conflicts });
      else toast.error(err instanceof Error ? err.message : 'Could not move the class.');
    }
  };

  return (
    <>
      <PageHeader
        title={title}
        subtitle={subtitle}
        actions={
          !readOnly && (
            <button className="btn btn-primary" onClick={() => setEntry({ date: anchor })}>
              <CalendarPlus size={16} /> Add closure / event
            </button>
          )
        }
      />
      <Card>
        <div className="cal-toolbar">
          <div className="cal-nav">
            <button className="icon-btn" aria-label="Previous" onClick={() => step(-1)}>
              <ChevronLeft size={18} />
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setAnchor(todayStr())}>
              Today
            </button>
            <button className="icon-btn" aria-label="Next" onClick={() => step(1)}>
              <ChevronRight size={18} />
            </button>
            <h2 className="cal-heading">{heading}</h2>
          </div>
          <Tabs
            value={view}
            onChange={setView}
            tabs={[
              { value: 'year', label: 'Year' },
              { value: 'month', label: 'Month' },
              { value: 'week', label: 'Week' },
              { value: 'day', label: 'Day' },
            ]}
          />
        </div>
        <div className="toolbar">
          {!classIds && (
            <>
              <select className="input input-auto" value={teacher} onChange={(e) => setTeacher(e.target.value)} aria-label="Filter by teacher">
                <option value="">All teachers</option>
                {db.staff
                  .filter((s) => db.classes.some((c) => c.teacherId === s.id || c.assistantId === s.id) || s.position === 'substitute')
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {staffName(s)}
                    </option>
                  ))}
              </select>
              <select className="input input-auto" value={room} onChange={(e) => setRoom(e.target.value)} aria-label="Filter by classroom">
                <option value="">All rooms</option>
                {db.classrooms.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </>
          )}
          <label className="check-inline">
            <input type="checkbox" checked={showCancelled} onChange={(e) => setShowCancelled(e.target.checked)} /> Show cancelled classes
          </label>
          {!readOnly && view === 'week' && <span className="small faint">Drag a class to another day or time to reschedule that week only.</span>}
        </div>

        {view === 'year' && (
          <div className="cal-year">
            {Array.from({ length: 12 }, (_, m) => {
              const first = `${anchor.slice(0, 4)}-${String(m + 1).padStart(2, '0')}-01`;
              const start = startOfWeek(first);
              return (
                <div key={m} className="cal-mini">
                  <button className="cal-mini-title" onClick={() => (setAnchor(first), setView('month'))}>
                    {parseDate(first).toLocaleDateString(undefined, { month: 'long' })}
                  </button>
                  <div className="cal-mini-grid">
                    {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
                      <span key={i} className="cal-mini-dow">
                        {d}
                      </span>
                    ))}
                    {Array.from({ length: 42 }, (_, i) => {
                      const d = addDays(start, i);
                      const inMonth = d.slice(5, 7) === first.slice(5, 7);
                      const closed = inMonth && !!closureOn(db, d);
                      const busy = inMonth && occsOn(d).some((o) => !o.cancelled);
                      const special = inMonth && (eventsOn(d).some((e) => !e.cancelsClasses) || perfsOn(d).length > 0);
                      return (
                        <button
                          key={d}
                          className={`cal-mini-day ${inMonth ? '' : 'out'} ${closed ? 'closed' : ''} ${busy ? 'busy' : ''} ${special ? 'special' : ''} ${d === todayStr() ? 'today' : ''}`}
                          onClick={() => (setAnchor(d), setView('day'))}
                          aria-label={`${formatDate(d)}${closed ? ', studio closed' : ''}`}
                          disabled={!inMonth}
                        >
                          {Number(d.slice(8))}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            <div className="cal-legend small">
              <span className="dot busy" /> Classes <span className="dot closed" /> Closed <span className="dot special" /> Event / performance
            </div>
          </div>
        )}

        {view === 'month' && (
          <div className="cal-month">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
              <div key={d} className="cal-dow">
                {d}
              </div>
            ))}
            {Array.from({ length: 42 }, (_, i) => {
              const d = addDays(range.from, i);
              const list = occsOn(d);
              const inMonth = d.slice(5, 7) === anchor.slice(5, 7);
              return (
                <div key={d} className={`cal-cell ${inMonth ? '' : 'out'} ${d === todayStr() ? 'today' : ''}`}>
                  <button className="cal-date" onClick={() => (setAnchor(d), setView('day'))}>
                    {Number(d.slice(8))}
                  </button>
                  {eventsOn(d).map((e) => (
                    <button key={e.id} className={`cal-chip ev ${e.cancelsClasses ? 'closure' : ''}`} onClick={() => !readOnly && setEntry({ id: e.id })} title={e.title}>
                      {e.title}
                    </button>
                  ))}
                  {perfsOn(d).map((p) => (
                    <Link key={p.id} to={`/performances/${p.id}`} className="cal-chip perf" title={p.name}>
                      {p.time ? `${formatTime(p.time)} ` : ''}
                      {p.name}
                    </Link>
                  ))}
                  {list.slice(0, 4).map((o) => (
                    <button key={o.key} className={`cal-chip cls ${o.cancelled ? 'cancelled' : ''} ${o.moved || o.substituted ? 'changed' : ''}`} onClick={() => setOpenOcc(o)} title={`${o.cls.name} ${formatTime(o.start)}–${formatTime(o.end)}`}>
                      {formatTime(o.start)} {o.cls.name}
                    </button>
                  ))}
                  {list.length > 4 && (
                    <button className="cal-more" onClick={() => (setAnchor(d), setView('day'))}>
                      +{list.length - 4} more
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {(view === 'week' || view === 'day') && (
          <TimeGrid
            days={view === 'week' ? Array.from({ length: 7 }, (_, i) => addDays(range.from, i)) : [anchor]}
            occsOn={occsOn}
            eventsOn={eventsOn}
            perfsOn={perfsOn}
            onOpen={setOpenOcc}
            onEntry={(id) => !readOnly && setEntry({ id })}
            onDrop={readOnly ? undefined : tryMove}
            isClosed={(d) => !!closureOn(db, d)}
          />
        )}
      </Card>

      <SessionDialog occ={openOcc} readOnly={readOnly} onClose={() => setOpenOcc(null)} />
      <CalendarEntryForm open={!!entry} id={entry?.id} defaults={{ startDate: entry?.date ?? todayStr(), endDate: entry?.date ?? todayStr() }} onClose={() => setEntry(null)} />
      <Modal
        open={!!pendingMove}
        onClose={() => setPendingMove(null)}
        title="Scheduling conflict"
        size="sm"
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setPendingMove(null)}>
              Cancel move
            </button>
            <button
              className="btn btn-danger"
              onClick={() => {
                if (pendingMove && run(() => (rescheduleSession(pendingMove.occ.classId, pendingMove.occ.originalDate, pendingMove.input, { allowConflicts: true }), true), 'Moved anyway — recorded in the activity log.')) setPendingMove(null);
              }}
            >
              Move anyway
            </button>
          </>
        }
      >
        <p>
          Moving <strong>{pendingMove?.occ.cls.name}</strong> to {pendingMove && formatDate(pendingMove.input.newDate)} at {pendingMove && formatTime(pendingMove.input.newStartTime)} causes a conflict:
        </p>
        <ul className="conflict-list">
          {pendingMove?.conflicts.map((c) => (
            <li key={c}>
              <AlertTriangle size={13} /> {c}
            </li>
          ))}
        </ul>
      </Modal>
    </>
  );
}

function TimeGrid({
  days,
  occsOn,
  eventsOn,
  perfsOn,
  onOpen,
  onEntry,
  onDrop,
  isClosed,
}: {
  isClosed: (d: string) => boolean;
  days: string[];
  occsOn: (d: string) => Occurrence[];
  eventsOn: (d: string) => StudioEvent[];
  perfsOn: (d: string) => { id: ID; name: string; time: string }[];
  onOpen: (o: Occurrence) => void;
  onEntry: (id: ID) => void;
  onDrop?: (o: Occurrence, date: string, start: string) => void;
}) {
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const all = days.flatMap(occsOn);
  const height = (DAY_END - DAY_START) * PX_PER_MIN;
  const hours = Array.from({ length: Math.ceil((DAY_END - DAY_START) / 60) }, (_, i) => DAY_START + i * 60);
  const drop = (e: DragEvent<HTMLDivElement>, date: string) => {
    e.preventDefault();
    setOver(null);
    const key = e.dataTransfer.getData('text/plain') || dragKey;
    const occ = all.find((o) => o.key === key);
    if (!occ || !onDrop) return;
    const offset = Number(e.dataTransfer.getData('application/x-offset') || 0);
    const rect = e.currentTarget.getBoundingClientRect();
    const mins = DAY_START + (e.clientY - rect.top - offset) / PX_PER_MIN;
    const snapped = Math.max(DAY_START, Math.min(DAY_END - 15, Math.round(mins / 15) * 15));
    onDrop(occ, date, fromMinutes(snapped));
    setDragKey(null);
  };
  return (
    <div className="tg" style={{ ['--cols' as string]: days.length }}>
      <div className="tg-head">
        <div />
        {days.map((d) => (
          <div key={d} className={`tg-day-head ${d === todayStr() ? 'today' : ''}`}>
            <strong>{WEEKDAY_NAMES[parseDate(d).getDay()].slice(0, 3)}</strong> {Number(d.slice(8))}
            <div className="tg-allday">
              {eventsOn(d).map((e) => (
                <button key={e.id} className={`cal-chip ev ${e.cancelsClasses ? 'closure' : ''}`} onClick={() => onEntry(e.id)} title={e.title}>
                  {!e.allDay && `${formatTime(e.startTime)} `}
                  {e.title}
                </button>
              ))}
              {perfsOn(d).map((p) => (
                <Link key={p.id} to={`/performances/${p.id}`} className="cal-chip perf">
                  {p.time && `${formatTime(p.time)} `}
                  {p.name}
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="tg-body" style={{ height }}>
        <div className="tg-hours">
          {hours.map((m) => (
            <div key={m} style={{ top: (m - DAY_START) * PX_PER_MIN }}>
              {formatTime(fromMinutes(m))}
            </div>
          ))}
        </div>
        {days.map((d) => {
          const list = occsOn(d);
          // simple side-by-side layout for overlapping classes
          const lanes: Occurrence[][] = [];
          for (const o of list) {
            const lane = lanes.find((l) => minutes(l[l.length - 1].end) <= minutes(o.start));
            if (lane) lane.push(o);
            else lanes.push([o]);
          }
          return (
            <div
              key={d}
              className={`tg-col ${over === d ? 'drop' : ''} ${isClosed(d) ? 'closed' : ''}`}
              onDragOver={(e) => {
                if (!onDrop) return;
                e.preventDefault();
                setOver(d);
              }}
              onDragLeave={() => setOver(null)}
              onDrop={(e) => drop(e, d)}
              data-date={d}
            >
              {hours.map((m) => (
                <div key={m} className="tg-line" style={{ top: (m - DAY_START) * PX_PER_MIN }} />
              ))}
              {lanes.flatMap((lane, li) =>
                lane.map((o) => {
                  const top = (Math.max(DAY_START, minutes(o.start)) - DAY_START) * PX_PER_MIN;
                  const h = Math.max(22, (minutes(o.end) - minutes(o.start)) * PX_PER_MIN - 2);
                  return (
                    <button
                      key={o.key}
                      className={`tg-block ${o.cancelled ? 'cancelled' : ''} ${o.moved || o.substituted ? 'changed' : ''}`}
                      style={{ top, height: h, left: `calc(${(li / lanes.length) * 100}% + 2px)`, width: `calc(${100 / lanes.length}% - 4px)` }}
                      draggable={!!onDrop && !o.cancelled}
                      onDragStart={(e) => {
                        setDragKey(o.key);
                        e.dataTransfer.setData('text/plain', o.key);
                        e.dataTransfer.setData('application/x-offset', String(e.clientY - e.currentTarget.getBoundingClientRect().top));
                        e.dataTransfer.effectAllowed = 'move';
                      }}
                      onClick={() => onOpen(o)}
                      aria-label={`${o.cls.name} ${formatDate(o.date)} ${formatTime(o.start)}${o.cancelled ? ' cancelled' : ''}`}
                      data-key={o.key}
                    >
                      <strong>{o.cls.name}</strong>
                      <span>
                        {formatTime(o.start)}–{formatTime(o.end)}
                      </span>
                      {o.cancelled ? <span className="tg-tag">Cancelled</span> : o.substituted ? <span className="tg-tag">Sub</span> : o.moved ? <span className="tg-tag">Moved</span> : null}
                    </button>
                  );
                }),
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SessionDialog({ occ, readOnly, onClose }: { occ: Occurrence | null; readOnly?: boolean; onClose: () => void }) {
  const db = useDb();
  const v = useViewer();
  const run = useRun();
  const confirm = useConfirm();
  const subs = useStaffOptions((s) => s.position !== 'office' && s.position !== 'performance');
  const [mode, setMode] = useState<'view' | 'move' | 'cancel'>('view');
  const [reason, setReason] = useState('');
  const [mv, setMv] = useState<RescheduleInput | null>(null);
  const [override, setOverride] = useState(false);
  const [last, setLast] = useState<string | null>(null);
  if ((occ?.key ?? null) !== last) {
    setLast(occ?.key ?? null);
    setMode('view');
    setReason('');
    setOverride(false);
    if (occ) setMv({ newDate: occ.date, newStartTime: occ.start, newEndTime: occ.end, newClassroomId: occ.classroomId, substituteId: occ.substituted ? occ.teacherId : null, reason: '' });
  }
  if (!occ || !mv) return null;
  const live = db.classes.find((c) => c.id === occ.classId) ?? occ.cls;
  const conflicts = mode === 'move' ? occurrenceConflicts(db, { key: occ.key, date: mv.newDate, start: mv.newStartTime, end: mv.newEndTime, classroomId: mv.newClassroomId, teacherId: mv.substituteId || live.teacherId, assistantId: live.assistantId }) : [];
  const roster = enrolledDancerIds(db, occ.classId).length;
  const hasChange = db.sessionChanges.some((c) => c.classId === occ.classId && c.date === occ.originalDate);
  return (
    <Modal
      open
      onClose={onClose}
      title={live.name}
      subtitle={`${formatDate(occ.date)} · ${formatTime(occ.start)}–${formatTime(occ.end)}`}
      footer={
        mode === 'view' ? (
          <>
            {!readOnly && hasChange && (
              <button className="btn btn-ghost" onClick={() => run(() => (restoreSession(occ.classId, occ.originalDate), true), 'Restored to the regular schedule.') && onClose()}>
                <Undo2 size={15} /> Restore regular schedule
              </button>
            )}
            <span className="spacer" />
            {!readOnly && !occ.cancelled && (
              <>
                <button className="btn btn-ghost danger" onClick={() => setMode('cancel')}>
                  <XCircle size={15} /> Cancel this class
                </button>
                <button className="btn btn-ghost" onClick={() => setMode('move')}>
                  Reschedule / substitute
                </button>
              </>
            )}
            {v.can('attendance.take') && !occ.cancelled && occ.date <= todayStr() && (
              <Link className="btn btn-primary" to={`/attendance?class=${occ.classId}&date=${occ.originalDate}`} onClick={onClose}>
                <ClipboardCheck size={15} /> Attendance
              </Link>
            )}
          </>
        ) : mode === 'cancel' ? (
          <>
            <button className="btn btn-ghost" onClick={() => setMode('view')}>
              Back
            </button>
            <button
              className="btn btn-danger"
              onClick={async () => {
                if (await confirm({ title: 'Cancel this class?', message: `${live.name} on ${formatDate(occ.date)} will be cancelled. The teacher and every enrolled family get a notice in their portal.`, confirmLabel: 'Cancel class', danger: true }))
                  if (run(() => (cancelSession(occ.classId, occ.originalDate, reason), true), 'Class cancelled. Teachers and families notified.')) onClose();
              }}
            >
              Cancel class
            </button>
          </>
        ) : (
          <>
            <button className="btn btn-ghost" onClick={() => setMode('view')}>
              Back
            </button>
            <button
              className="btn btn-primary"
              disabled={conflicts.length > 0 && !override}
              onClick={() => run(() => (rescheduleSession(occ.classId, occ.originalDate, mv, { allowConflicts: override }), true), 'Saved. Teachers and families notified.') && onClose()}
            >
              Save change
            </button>
          </>
        )
      }
    >
      {mode === 'view' && (
        <dl className="dl">
          <dt>Teacher</dt>
          <dd>
            {staffName(db.staff.find((s) => s.id === occ.teacherId)) || 'Not assigned'}
            {occ.substituted && ` (substituting for ${staffName(db.staff.find((s) => s.id === occ.regularTeacherId))})`}
          </dd>
          <dt>Assistant</dt>
          <dd>{staffName(db.staff.find((s) => s.id === occ.assistantId)) || '—'}</dd>
          <dt>Room</dt>
          <dd>{db.classrooms.find((r) => r.id === occ.classroomId)?.name ?? '—'}</dd>
          <dt>Dancers</dt>
          <dd>{roster} enrolled</dd>
          {occ.moved && (
            <>
              <dt>Regularly</dt>
              <dd>
                {formatDate(occ.originalDate)}, {formatTime(live.startTime)}–{formatTime(live.endTime)}
              </dd>
            </>
          )}
          {occ.cancelled && (
            <>
              <dt>Status</dt>
              <dd className="bad-text">Cancelled — {occ.cancelReason}</dd>
            </>
          )}
          <dt>Class page</dt>
          <dd>
            <Link to={v.isStaffAdmin ? `/classes/${occ.classId}` : v.portal === 'teacher' ? '/teacher/classes' : '/family/schedule'} onClick={onClose}>
              Open
            </Link>
          </dd>
        </dl>
      )}
      {mode === 'cancel' && (
        <Field label="Reason (shown to teachers and families)">
          <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Teacher illness" autoFocus />
        </Field>
      )}
      {mode === 'move' && (
        <>
          <div className="grid-2">
            <Field label="Date">
              <input className="input" type="date" value={mv.newDate} onChange={(e) => setMv({ ...mv, newDate: e.target.value })} />
            </Field>
            <Field label="Room">
              <select className="input" value={mv.newClassroomId ?? ''} onChange={(e) => setMv({ ...mv, newClassroomId: e.target.value || null })}>
                <option value="">No room</option>
                {db.classrooms.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Start">
              <input className="input" type="time" value={mv.newStartTime} onChange={(e) => setMv({ ...mv, newStartTime: e.target.value })} />
            </Field>
            <Field label="End">
              <input className="input" type="time" value={mv.newEndTime} onChange={(e) => setMv({ ...mv, newEndTime: e.target.value })} />
            </Field>
            <Field label="Substitute teacher" className="span-2">
              <SearchSelect ariaLabel="Substitute teacher" value={mv.substituteId ?? ''} onChange={(x) => setMv({ ...mv, substituteId: x || null })} options={subs.filter((o) => o.value !== live.teacherId)} noneLabel={`Regular teacher (${staffName(db.staff.find((s) => s.id === live.teacherId)) || 'none'})`} />
            </Field>
            <Field label="Note to families" className="span-2">
              <input className="input" value={mv.reason} onChange={(e) => setMv({ ...mv, reason: e.target.value })} />
            </Field>
          </div>
          {conflicts.length > 0 && (
            <div className="conflict-box" role="alert">
              <strong>
                <AlertTriangle size={15} /> Conflict
              </strong>
              <ul>
                {conflicts.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
              <label className="check-inline small">
                <input type="checkbox" checked={override} onChange={(e) => setOverride(e.target.checked)} /> Save anyway (recorded in the activity log)
              </label>
            </div>
          )}
        </>
      )}
    </Modal>
  );
}

export function CalendarEntryForm({ open, id, defaults, onClose }: { open: boolean; id?: ID; defaults?: Partial<StudioEventInput>; onClose: () => void }) {
  const db = useDb();
  const run = useRun();
  const confirm = useConfirm();
  const empty = (): StudioEventInput => ({ title: '', type: 'closure', startDate: todayStr(), endDate: todayStr(), allDay: true, startTime: '', endTime: '', classroomId: null, location: '', cancelsClasses: true, schoolYearId: db.schoolYears.find((y) => y.status === 'current')?.id ?? null, notes: '', ...defaults });
  const [v, setV] = useState<StudioEventInput>(empty);
  const [last, setLast] = useState<string | null>(null);
  const key = open ? id ?? `new:${defaults?.startDate ?? ''}` : null;
  if (key !== last) {
    setLast(key);
    const e = id ? db.studioEvents.find((x) => x.id === id) : undefined;
    if (open) setV(e ? { ...e } : empty());
  }
  const set = <K extends keyof StudioEventInput>(k: K, val: StudioEventInput[K]) => setV((p) => ({ ...p, [k]: val }));
  const closes = ['holiday', 'closure', 'weather'].includes(v.type);
  const affected = v.cancelsClasses && v.startDate ? occurrencesBetween(db, v.startDate, v.endDate || v.startDate).length : 0;
  return (
    <FormModal
      open={open}
      onClose={onClose}
      title={id ? 'Edit Calendar Entry' : 'Add to Calendar'}
      onSubmit={() => run(() => saveStudioEvent(v, id), v.cancelsClasses && affected ? `Saved. ${affected} class(es) cancelled; teachers and families notified.` : 'Saved.') && onClose()}
    >
      <div className="grid-2">
        <Field label="Title" required className="span-2">
          <input className="input" value={v.title} onChange={(e) => set('title', e.target.value)} autoFocus placeholder="e.g. Snow day, Thanksgiving Break, Master class" />
        </Field>
        <Field label="Type">
          <select
            className="input"
            value={v.type}
            onChange={(e) => {
              const t = e.target.value as CalendarEntryType;
              setV((p) => ({ ...p, type: t, cancelsClasses: ['holiday', 'closure', 'weather'].includes(t) }));
            }}
          >
            {Object.entries(entryTypeLabels).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </Field>
        <Field label="School year">
          <select className="input" value={v.schoolYearId ?? ''} onChange={(e) => set('schoolYearId', e.target.value || null)}>
            <option value="">—</option>
            {db.schoolYears.map((y) => (
              <option key={y.id} value={y.id}>
                {y.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Start date" required>
          <input className="input" type="date" value={v.startDate} onChange={(e) => setV((p) => ({ ...p, startDate: e.target.value, endDate: p.endDate < e.target.value ? e.target.value : p.endDate }))} />
        </Field>
        <Field label="End date">
          <input className="input" type="date" min={v.startDate} value={v.endDate} onChange={(e) => set('endDate', e.target.value)} />
        </Field>
        {!closes && (
          <>
            <label className="check-inline span-2">
              <input type="checkbox" checked={v.allDay} onChange={(e) => set('allDay', e.target.checked)} /> All day
            </label>
            {!v.allDay && (
              <>
                <Field label="From">
                  <input className="input" type="time" value={v.startTime} onChange={(e) => set('startTime', e.target.value)} />
                </Field>
                <Field label="To">
                  <input className="input" type="time" value={v.endTime} onChange={(e) => set('endTime', e.target.value)} />
                </Field>
              </>
            )}
            <Field label="Room">
              <select className="input" value={v.classroomId ?? ''} onChange={(e) => set('classroomId', e.target.value || null)}>
                <option value="">—</option>
                {db.classrooms.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Location (if off-site)">
              <input className="input" value={v.location} onChange={(e) => set('location', e.target.value)} />
            </Field>
          </>
        )}
      </div>
      <label className="check-inline">
        <input type="checkbox" checked={v.cancelsClasses} onChange={(e) => set('cancelsClasses', e.target.checked)} /> No classes on these dates (cancels classes and notifies teachers & families)
      </label>
      {v.cancelsClasses && <p className="small warn-text inline">{affected} scheduled class{affected === 1 ? '' : 'es'} fall on these dates.</p>}
      <Field label="Notes">
        <textarea className="input" rows={2} value={v.notes} onChange={(e) => set('notes', e.target.value)} />
      </Field>
      {id && (
        <button
          type="button"
          className="btn btn-ghost danger btn-sm"
          onClick={async () => {
            if (await confirm({ title: 'Delete this calendar entry?', message: 'Classes it cancelled will be back on the schedule.', confirmLabel: 'Delete', danger: true })) if (run(() => (deleteStudioEvent(id), true), 'Deleted.')) onClose();
          }}
        >
          Delete entry
        </button>
      )}
    </FormModal>
  );
}

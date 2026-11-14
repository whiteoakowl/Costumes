import { Link } from 'react-router-dom';
import { Empty, PrintShell } from './Print';
import { formatDate, formatTime, fullName, volunteerName } from '../data/selectors';
import { daySlots, fittingCostumes, isTaskOverdue, jobShifts, listItems, listProgress, outcomeLabels, priorityLabels, scheduleKindLabels, slotDancerIds, slotLabelText, slotOpenSpots } from '../data/planning';
import { staffName } from '../data/studio';
import type { Database } from '../data/types';

export const planningReports = ['schedule', 'volunteerform', 'tasklist'] as const;
export type PlanningReportKey = (typeof planningReports)[number];

export function PlanningReport({ report, db, p }: { report: PlanningReportKey; db: Database; p: (k: string) => string }) {
  switch (report) {
    case 'schedule':
      return <ScheduleSheet db={db} id={p('id')} />;
    case 'volunteerform':
      return <VolunteerFormSheet db={db} id={p('id')} />;
    case 'tasklist':
      return <TaskListSheet db={db} id={p('id')} />;
  }
}

function Missing({ what }: { what: string }) {
  return (
    <PrintShell title={`${what} not found`}>
      <Empty>
        It may have been deleted. <Link to="/">Go to the dashboard</Link>
      </Empty>
    </PrintShell>
  );
}

/** Fitting / picture-day schedule with a check-off box per dancer. */
function ScheduleSheet({ db, id }: { db: Database; id: string }) {
  const day = db.scheduleDays.find((d) => d.id === id);
  if (!day) return <Missing what="Schedule" />;
  const slots = daySlots(db, day.id);
  const labels = outcomeLabels[day.kind];
  const people = [day.photographer, ...day.staffIds.map((s) => staffName(db.staff.find((x) => x.id === s))), ...day.volunteerIds.map((v) => db.volunteers.find((x) => x.id === v)).map((v) => (v ? volunteerName(v) : ''))].filter(Boolean);
  return (
    <PrintShell title={`${day.name}`} subtitle={`${scheduleKindLabels[day.kind]} · ${formatDate(day.date)} · ${formatTime(day.startTime)}–${formatTime(day.endTime)}${day.location ? ` · ${day.location}` : ''}${people.length ? ` · ${people.join(', ')}` : ''}`}>
      {day.instructions && <p className="p-notes">{day.instructions}</p>}
      {!slots.length ? (
        <Empty>No times scheduled yet.</Empty>
      ) : (
        <table className="p-table">
          <thead>
            <tr>
              <th>Time</th>
              <th>Group</th>
              <th className="p-check">✓</th>
              <th>Dancer</th>
              {day.kind === 'fitting' ? <th>Size · Costumes</th> : <th>Level</th>}
              <th>Result / notes</th>
            </tr>
          </thead>
          <tbody>
            {slots.flatMap((s) => {
              const ids = slotDancerIds(db, s);
              const open = slotOpenSpots(s);
              const rows = ids.length ? ids : [''];
              return rows.map((dId, i) => {
                const d = db.dancers.find((x) => x.id === dId);
                const o = d ? s.outcomes[d.id] : undefined;
                return (
                  <tr key={`${s.id}:${dId || i}`}>
                    <td className="strong nowrap">{i === 0 ? `${formatTime(s.start)}–${formatTime(s.end)}` : ''}</td>
                    <td>
                      {i === 0 && (
                        <>
                          {slotLabelText(db, s)}
                          {s.costumeNote && <div className="p-notes">{s.costumeNote}</div>}
                        </>
                      )}
                    </td>
                    <td className="p-check">{d ? (o && o.status !== 'scheduled' ? '☑' : '☐') : ''}</td>
                    <td className="strong">{d ? fullName(d) : <span className="faint">{open ? `${open} open spot${open === 1 ? '' : 's'}` : '—'}</span>}</td>
                    <td>{d ? (day.kind === 'fitting' ? [d.costumeSize, fittingCostumes(db, d.id, day.recitalId).map((c) => c.name).join(', ')].filter(Boolean).join(' · ') : d.level) : ''}</td>
                    <td>{o && o.status !== 'scheduled' ? `${labels[o.status]}${o.note ? ` — ${o.note}` : ''}` : ''}</td>
                  </tr>
                );
              });
            })}
          </tbody>
        </table>
      )}
    </PrintShell>
  );
}

/** Sign-up sheet: who is signed up per job, plus blank lines for the open spots (to post on the studio wall). */
function VolunteerFormSheet({ db, id }: { db: Database; id: string }) {
  const f = db.volunteerForms.find((x) => x.id === id);
  if (!f) return <Missing what="Sign-up form" />;
  return (
    <PrintShell title={f.title} subtitle={[f.date && formatDate(f.date), f.location, f.deadline && `Sign up by ${formatDate(f.deadline)}`].filter(Boolean).join(' · ')}>
      {f.description && <p className="p-notes">{f.description}</p>}
      {f.jobs.map((j) => {
        const list = jobShifts(db, f.id, j.id);
        const blanks = j.needed ? Math.max(0, j.needed - list.length) : 2;
        return (
          <div key={j.id} className="p-section">
            <h2>
              {j.title}
              <span className="p-notes">
                {' '}
                {[j.date && formatDate(j.date), j.start && `${formatTime(j.start)}${j.end ? `–${formatTime(j.end)}` : ''}`, j.needed ? `${j.needed} needed` : ''].filter(Boolean).join(' · ')}
              </span>
            </h2>
            {j.description && <p className="p-notes">{j.description}</p>}
            <table className="p-table">
              <thead>
                <tr>
                  <th style={{ width: '34%' }}>Name</th>
                  <th style={{ width: '26%' }}>Phone</th>
                  <th>Email</th>
                  <th className="p-check">✓</th>
                </tr>
              </thead>
              <tbody>
                {list.map((s) => {
                  const v = db.volunteers.find((x) => x.id === s.volunteerId);
                  return (
                    <tr key={s.id}>
                      <td className="strong">{v ? volunteerName(v) : ''}</td>
                      <td>{v?.phone}</td>
                      <td>{v?.email}</td>
                      <td className="p-check">{s.status === 'checked_in' ? '☑' : '☐'}</td>
                    </tr>
                  );
                })}
                {Array.from({ length: blanks }, (_, i) => (
                  <tr key={`b${i}`} className="p-blank">
                    <td>&nbsp;</td>
                    <td />
                    <td />
                    <td className="p-check">☐</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </PrintShell>
  );
}

function TaskListSheet({ db, id }: { db: Database; id: string }) {
  const l = db.taskLists.find((x) => x.id === id);
  if (!l) return <Missing what="List" />;
  const items = listItems(db, l.id);
  const p = listProgress(db, l.id);
  const who = (assigneeStaffId: string | null, assigneeVolunteerId: string | null) => {
    if (assigneeStaffId) return staffName(db.staff.find((s) => s.id === assigneeStaffId));
    const v = assigneeVolunteerId ? db.volunteers.find((x) => x.id === assigneeVolunteerId) : undefined;
    return v ? volunteerName(v) : '';
  };
  const todo = l.kind === 'todo';
  return (
    <PrintShell title={l.name} subtitle={`${todo ? 'To-do list' : 'Checklist'} · ${p.done} of ${p.total} done${l.dueDate ? ` · finish by ${formatDate(l.dueDate)}` : ''}`}>
      {l.description && <p className="p-notes">{l.description}</p>}
      {!items.length ? (
        <Empty>No items.</Empty>
      ) : (
        <table className="p-table">
          <thead>
            <tr>
              <th className="p-check">✓</th>
              <th>Item</th>
              {todo && <th>Who</th>}
              {todo && <th>Due</th>}
              {todo && <th>Priority</th>}
            </tr>
          </thead>
          <tbody>
            {items.map((t) => (
              <tr key={t.id}>
                <td className="p-check">{t.done ? '☑' : '☐'}</td>
                <td>
                  <span className="strong">{t.title}</span>
                  {t.notes && <div className="p-notes">{t.notes}</div>}
                </td>
                {todo && <td>{who(t.assigneeStaffId, t.assigneeVolunteerId)}</td>}
                {todo && <td className={isTaskOverdue(t) ? 'p-flag' : ''}>{formatDate(t.dueDate)}</td>}
                {todo && <td>{t.priority !== 'normal' ? priorityLabels[t.priority] : ''}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </PrintShell>
  );
}

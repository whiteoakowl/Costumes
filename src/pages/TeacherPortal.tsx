import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, Check, ClipboardCheck, Clock, HeartPulse, School, Shirt } from 'lucide-react';
import { useDb } from '../data/store';
import { ageFromBirthday, dancerCostumes, formatDate, formatTime, fullName, isUpcomingPerformance } from '../data/selectors';
import { addDays, enrolledDancerIds, occurrencesBetween, payPeriodFor, payrollSummary, staffClassIds, staffName, WEEKDAY_NAMES } from '../data/studio';
import { Card, EmptyState, PageHeader, StatCard, StatusBadge } from '../components/ui';
import { AnnouncementsCard, NoticesCard, announcementsFor } from '../components/notices';
import { Avatar } from '../components/photos';
import { classWhen } from '../components/studioUi';
import { useViewer } from '../lib/session';
import { StudioCalendar } from './Calendar';
import { todayStr } from '../data/ids';
import { todayHeading } from '../data/time';

function useMe() {
  const db = useDb();
  const v = useViewer();
  const me = db.staff.find((s) => s.id === v.staffId);
  const classIds = staffClassIds(db, v.staffId);
  return { db, v, me, classIds };
}

export function TeacherDashboard() {
  const { db, v, me, classIds } = useMe();
  if (!me) return <EmptyState title="No staff profile linked" message="Ask the office to link this login to your staff profile." />;
  const today = todayStr();
  const ids = new Set(classIds);
  const mine = (o: { teacherId: string | null; assistantId: string | null }) => o.teacherId === me.id || o.assistantId === me.id;
  const todays = occurrencesBetween(db, today, today, { includeCancelled: true, classIds: ids }).filter((o) => mine(o) || o.regularTeacherId === me.id);
  const week = occurrencesBetween(db, addDays(today, 1), addDays(today, 7), { includeCancelled: true, classIds: ids }).filter((o) => mine(o) || o.regularTeacherId === me.id);
  const dancers = new Set(db.classes.filter((c) => c.teacherId === me.id || c.assistantId === me.id).flatMap((c) => enrolledDancerIds(db, c.id)));
  const period = payPeriodFor(db.settings.payPeriod, today);
  const hrs = payrollSummary(db, db.timeEntries.filter((e) => e.staffId === me.id && e.date >= period.start && e.date <= period.end))[0];
  const notices = db.notices.filter((n) => n.staffIds.includes(me.id));
  const events = db.studioEvents.filter((e) => e.startDate >= today && e.startDate <= addDays(today, 30)).sort((a, b) => a.startDate.localeCompare(b.startDate));
  const perfs = db.performances.filter((p) => isUpcomingPerformance(p)).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 3);
  return (
    <>
      <PageHeader title={`Hello, ${me.firstName}`} subtitle={todayHeading()} />
      <div className="stats stats-4">
        <StatCard label="Classes today" value={todays.filter((o) => !o.cancelled).length} icon={<CalendarDays size={20} />} tone="rose" to="/teacher/schedule" />
        <StatCard label="My classes" value={db.classes.filter((c) => c.teacherId === me.id || c.assistantId === me.id).length} icon={<School size={20} />} tone="plum" to="/teacher/classes" />
        <StatCard label="My dancers" value={dancers.size} icon={<Check size={20} />} tone="sage" to="/teacher/classes" />
        <StatCard label="Hours this period" value={(hrs?.approvedHours ?? 0) + (hrs?.pendingHours ?? 0)} icon={<Clock size={20} />} tone="amber" hint={`${(hrs?.pendingHours ?? 0).toFixed(1)} h pending approval`} to="/teacher/hours" />
      </div>
      <div className="dash-grid">
        <Card title="Today's Classes" icon={<ClipboardCheck size={18} />} className="span-2">
          {!todays.length ? (
            <p className="faint pad">No classes today.</p>
          ) : (
            <ul className="mini-list">
              {todays.map((o) => {
                const taken = db.attendance.some((a) => a.classId === o.classId && a.date === o.originalDate);
                return (
                  <li key={o.key} className={o.cancelled ? 'muted' : ''}>
                    <div>
                      <strong>{o.cls.name}</strong>{' '}
                      <span className="small faint">
                        {formatTime(o.start)}–{formatTime(o.end)} · {db.classrooms.find((r) => r.id === o.classroomId)?.name ?? ''} · {enrolledDancerIds(db, o.classId).length} dancers
                      </span>
                      {o.cancelled && <div className="small bad-text">Cancelled: {o.cancelReason}</div>}
                      {o.substituted && <div className="small">{o.teacherId === me.id ? `You're substituting for ${staffName(db.staff.find((s) => s.id === o.regularTeacherId))}` : `Substitute: ${staffName(db.staff.find((s) => s.id === o.teacherId))}`}</div>}
                    </div>
                    {!o.cancelled && mine(o) && (
                      <Link className={`btn btn-sm ${taken ? 'btn-ghost' : 'btn-primary'}`} to={`/attendance?class=${o.classId}&date=${o.originalDate}`}>
                        <ClipboardCheck size={14} /> {taken ? 'Attendance taken' : 'Take attendance'}
                      </Link>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
        <NoticesCard notices={notices} />
        <Card title="This Week" icon={<CalendarDays size={18} />} className="span-2" actions={<Link to="/teacher/schedule" className="btn btn-ghost btn-sm">Full schedule</Link>}>
          {!week.length ? (
            <p className="faint pad">Nothing else this week.</p>
          ) : (
            <ul className="mini-list">
              {week.map((o) => (
                <li key={o.key} className={o.cancelled ? 'muted' : ''}>
                  <span>
                    <strong>
                      {WEEKDAY_NAMES[new Date(o.date + 'T12:00').getDay()].slice(0, 3)} {formatDate(o.date)}
                    </strong>{' '}
                    · {o.cls.name} <span className="small faint">{formatTime(o.start)}–{formatTime(o.end)}</span>
                  </span>
                  {o.cancelled ? <span className="badge badge-neutral">Cancelled</span> : o.substituted ? <span className="badge badge-info">Substitute</span> : null}
                </li>
              ))}
            </ul>
          )}
        </Card>
        <AnnouncementsCard items={announcementsFor(db.announcements, 'staff', classIds)} canPost={v.can('announcements.post')} postClassIds={classIds} />
        <Card title="Upcoming Events & Rehearsals" className="span-2">
          <ul className="mini-list">
            {events.map((e) => (
              <li key={e.id}>
                <span>
                  <strong>{e.title}</strong> <span className="small faint">· {formatDate(e.startDate)}{e.endDate !== e.startDate ? ` – ${formatDate(e.endDate)}` : ''}{!e.allDay && e.startTime ? ` · ${formatTime(e.startTime)}` : ''}</span>
                </span>
                {e.cancelsClasses && <span className="badge badge-neutral">No classes</span>}
              </li>
            ))}
            {perfs.map((p) => (
              <li key={p.id}>
                <span>
                  <strong>{p.name}</strong> <span className="small faint">· {formatDate(p.date)}{p.callTime ? ` · call ${formatTime(p.callTime)}` : ''}</span>
                </span>
                {v.can('shows.view') && <Link to={`/performances/${p.id}`} className="btn btn-ghost btn-sm">Details</Link>}
              </li>
            ))}
            {!events.length && !perfs.length && <li className="faint small">Nothing coming up.</li>}
          </ul>
        </Card>
      </div>
    </>
  );
}

export function TeacherSchedulePage() {
  const { db, v } = useMe();
  return <StudioCalendar classIds={new Set(staffClassIds(db, v.staffId))} readOnly title="My Schedule" subtitle="Your classes, substitutions, cancellations and studio closures" />;
}

export function TeacherClassesPage() {
  const { db, v, me, classIds } = useMe();
  const [openId, setOpenId] = useState<string | null>(null);
  if (!me) return <EmptyState title="No staff profile linked" />;
  const classes = db.classes.filter((c) => classIds.includes(c.id)).sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.startTime.localeCompare(b.startTime));
  return (
    <>
      <PageHeader title="My Classes & Rosters" subtitle="Your dancers, their sizes and the costumes they're wearing" />
      {!classes.length && <EmptyState icon={<School size={28} />} title="No classes assigned" message="The office assigns teachers to classes." />}
      {classes.map((c) => {
        const roster = enrolledDancerIds(db, c.id).map((id) => db.dancers.find((d) => d.id === id)!).filter(Boolean).sort((a, b) => fullName(a).localeCompare(fullName(b)));
        const role = c.teacherId === me.id ? 'Teacher' : c.assistantId === me.id ? 'Assistant' : 'Substitute';
        const open = openId === c.id || classes.length === 1;
        return (
          <Card
            key={c.id}
            title={
              <>
                {c.name} <span className="small faint">· {classWhen(c)} · {db.classrooms.find((r) => r.id === c.classroomId)?.name ?? ''} · {role}</span>
              </>
            }
            actions={
              <>
                <Link to={`/attendance?class=${c.id}`} className="btn btn-primary btn-sm">
                  <ClipboardCheck size={14} /> Attendance
                </Link>
                <button className="btn btn-ghost btn-sm" onClick={() => setOpenId(open ? null : c.id)}>
                  {open ? 'Hide roster' : `Roster (${roster.length})`}
                </button>
              </>
            }
          >
            {open &&
              (!roster.length ? (
                <p className="faint pad">No dancers enrolled.</p>
              ) : (
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Dancer</th>
                        <th>Age</th>
                        <th>Costume size</th>
                        <th className="minor">Shoe</th>
                        <th>
                          <Shirt size={13} /> Costumes
                        </th>
                        {v.can('medical.view') && (
                          <th>
                            <HeartPulse size={13} /> Allergies / medical
                          </th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {roster.map((d) => {
                        const items = dancerCostumes(db, d.id).filter((x) => x.costume.kind !== 'prop');
                        return (
                          <tr key={d.id}>
                            <td>
                              <div className="with-avatar">
                                <Avatar ownerType="dancer" ownerId={d.id} size={30} round />
                                <span className="link-strong">{fullName(d)}</span>
                              </div>
                            </td>
                            <td>{ageFromBirthday(d.birthday) ?? '—'}</td>
                            <td>{d.costumeSize || '—'}</td>
                            <td className="minor">{d.shoeSize || '—'}</td>
                            <td className="small">
                              {items.length
                                ? items.map((x, i) => (
                                    <div key={i}>
                                      {x.costume.name} <span className="faint">({x.ownerName})</span> <StatusBadge costume={x.costume} compact />
                                    </div>
                                  ))
                                : <span className="faint">—</span>}
                            </td>
                            {v.can('medical.view') && <td className="small">{[d.allergies, d.medicalNotes].filter(Boolean).join(' · ') || <span className="faint">None</span>}</td>}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ))}
          </Card>
        );
      })}
    </>
  );
}

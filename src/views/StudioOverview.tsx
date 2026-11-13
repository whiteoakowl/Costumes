import { Link } from '../lib/router';
import { Activity, CalendarDays, CalendarPlus, ClipboardCheck, GraduationCap, Plus, School, UserPlus, Users, UsersRound } from 'lucide-react';
import { useDb } from '../data/store';
import { formatDateTime, formatTime } from '../data/selectors';
import { addDays, attendanceRate, enrolledDancerIds, occurrencesBetween, staffName } from '../data/studio';
import { Card, StatCard } from '../components/ui';
import { AnnouncementsCard, announcementsFor } from '../components/notices';
import { useEditors } from '../components/editors';
import { useViewer } from '../lib/session';
import { currentYear } from '../components/studioUi';
import { todayStr } from '../data/ids';

/** Studio-wide section at the top of the owner / office dashboard. */
export function StudioOverview() {
  const db = useDb();
  const v = useViewer();
  const ed = useEditors();
  const today = todayStr();
  const year = currentYear(db);
  const activeClasses = db.classes.filter((c) => c.schoolYearId === year?.id);
  const enrolled = new Set(activeClasses.flatMap((c) => enrolledDancerIds(db, c.id)));
  const todays = occurrencesBetween(db, today, today, { includeCancelled: true });
  const last30 = db.attendance.filter((a) => a.date >= addDays(today, -30) && a.date <= today);
  const rate = attendanceRate(last30);
  const upcomingEvents = db.studioEvents.filter((e) => e.startDate >= today && e.startDate <= addDays(today, 30)).length;
  const pendingHours = db.timeEntries.filter((e) => e.status === 'pending').length;
  const activity = [...db.activity].reverse().slice(0, 10);
  return (
    <>
      <h2 className="section-title">Studio</h2>
      <div className="stats">
        <StatCard label="Enrolled dancers" value={enrolled.size} icon={<Users size={20} />} to="/dancers" tone="rose" hint={year ? year.name : 'No school year'} />
        <StatCard label="Active families" value={db.families.filter((f) => f.status === 'active').length} icon={<UsersRound size={20} />} to="/families" tone="plum" />
        <StatCard label="Teachers" value={db.staff.filter((s) => s.position === 'teacher' && s.status === 'active').length} icon={<GraduationCap size={20} />} to="/staff" tone="sage" />
        <StatCard label="Assistant teachers" value={db.staff.filter((s) => s.position === 'assistant' && s.status === 'active').length} icon={<GraduationCap size={20} />} to="/staff" tone="sand" />
        <StatCard label="Active classes" value={activeClasses.length} icon={<School size={20} />} to="/classes" tone="slate" />
        <StatCard label="Attendance (30 days)" value={rate === null ? '—' : `${rate}%`} icon={<ClipboardCheck size={20} />} to="/attendance?tab=records" tone="sage" hint={`${last30.length} records`} />
        <StatCard label="Upcoming events" value={upcomingEvents} icon={<CalendarDays size={20} />} to="/calendar" tone="amber" hint="Next 30 days" />
        {(v.can('hours.approve') || v.can('payroll.view')) && <StatCard label="Hours to approve" value={pendingHours} icon={<Activity size={20} />} to="/hours" tone="rose" />}
      </div>
      <div className="dash-grid">
        <Card title="Today's Classes" icon={<CalendarDays size={18} />} actions={<Link to="/calendar" className="btn btn-ghost btn-sm">Calendar</Link>}>
          {!todays.length ? (
            <p className="faint pad">No classes today.</p>
          ) : (
            <ul className="mini-list">
              {todays.map((o) => {
                const taken = db.attendance.some((a) => a.classId === o.classId && a.date === o.originalDate);
                return (
                  <li key={o.key} className={o.cancelled ? 'muted' : ''}>
                    <div>
                      <Link to={`/classes/${o.classId}`} className="link-strong">
                        {o.cls.name}
                      </Link>
                      <div className="small faint">
                        {formatTime(o.start)} · {staffName(db.staff.find((s) => s.id === o.teacherId)) || 'No teacher'}
                        {o.cancelled && ` · cancelled (${o.cancelReason})`}
                      </div>
                    </div>
                    {!o.cancelled && <span className={`small ${taken ? 'ok-text' : 'faint'}`}>{taken ? 'Attendance ✓' : 'Attendance pending'}</span>}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
        <Card title="Studio Quick Actions" icon={<Plus size={18} />}>
          <div className="quick">
            <button className="quick-btn" onClick={() => ed.editDancer(undefined, { navigate: true })}>
              <UserPlus size={18} /> Add dancer
            </button>
            <Link className="quick-btn" to="/families?new=1">
              <UsersRound size={18} /> Add family
            </Link>
            <Link className="quick-btn" to="/staff?new=1">
              <GraduationCap size={18} /> Add teacher
            </Link>
            <Link className="quick-btn" to="/classes?new=1">
              <School size={18} /> Add class
            </Link>
            <Link className="quick-btn" to="/school-years?new=1">
              <CalendarDays size={18} /> Create school year
            </Link>
            <Link className="quick-btn" to="/calendar?new=1">
              <CalendarPlus size={18} /> Schedule an event / closure
            </Link>
          </div>
        </Card>
        <AnnouncementsCard items={announcementsFor(db.announcements, 'staff').concat(db.announcements.filter((a) => a.audience === 'families')).sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.createdAt.localeCompare(a.createdAt))} canPost={v.can('announcements.post')} />
        <Card title="Recent Activity" icon={<Activity size={18} />} className="span-3">
          {!activity.length ? (
            <p className="faint pad">Changes, enrollments, attendance and approvals appear here.</p>
          ) : (
            <ul className="activity-feed">
              {activity.map((a) => (
                <li key={a.id}>
                  <span className="act-dot" />
                  <div>
                    <strong>{a.action}</strong> — {a.link ? <Link to={a.link}>{a.detail}</Link> : a.detail}
                    <div className="small faint">
                      {formatDateTime(a.createdAt)} · {a.actor}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      <h2 className="section-title">Costumes & Productions</h2>
    </>
  );
}

import { Link } from 'react-router-dom';
import { CalendarHeart, Shirt, Theater, Wrench } from 'lucide-react';
import { useDb } from '../data/store';
import { buildOverview, formatDate, formatTime, isUpcomingPerformance, isUpcomingShow, itemsOf } from '../data/selectors';
import { addDays } from '../data/studio';
import { isOpenOrder, workTypeLabels } from '../data/workflow';
import { Card, PageHeader, ProgressRing, StatCard } from '../components/ui';
import { AnnouncementsCard, announcementsFor } from '../components/notices';
import { useViewer } from '../lib/session';
import { todayStr } from '../data/ids';

export function PerformanceDashboard() {
  const db = useDb();
  const v = useViewer();
  const perfs = db.performances.filter((p) => isUpcomingPerformance(p)).sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999'));
  const open = db.workOrders.filter(isOpenOrder);
  const rehearsals = db.studioEvents.filter((e) => ['rehearsal', 'competition_rehearsal'].includes(e.type) && e.startDate >= todayStr() && e.startDate <= addDays(todayStr(), 60));
  return (
    <>
      <PageHeader title="Performance Dashboard" subtitle={`Hello, ${v.name.split(' ')[0]} — productions, rehearsals and show readiness`} />
      <div className="stats stats-4">
        <StatCard label="Upcoming performances" value={perfs.length} icon={<CalendarHeart size={20} />} tone="rose" to="/performances" />
        <StatCard label="Active shows" value={db.shows.filter((s) => isUpcomingShow(s)).length} icon={<Theater size={20} />} tone="plum" to="/shows" />
        <StatCard label="Costumes ready" value={`${itemsOf(db, 'costume').filter((c) => c.status === 'ready').length}/${itemsOf(db, 'costume').length}`} icon={<Shirt size={20} />} tone="sage" to="/costumes" />
        <StatCard label="Out for repair / cleaning" value={open.length} icon={<Wrench size={20} />} tone="amber" to="/repairs" />
      </div>
      <div className="dash-grid">
        <Card title="Upcoming Performances" icon={<CalendarHeart size={18} />} className="span-2">
          <ul className="mini-list">
            {perfs.map((p) => {
              const r = buildOverview(db, 'performance', p.id).readiness;
              return (
                <li key={p.id}>
                  <div>
                    <Link to={`/performances/${p.id}`} className="link-strong">
                      {p.name}
                    </Link>
                    <div className="small faint">
                      {formatDate(p.date)}
                      {p.callTime && ` · call ${formatTime(p.callTime)}`}
                      {p.time && ` · curtain ${formatTime(p.time)}`} · {p.venue}
                    </div>
                    {r.missingAssignments > 0 && <div className="small bad-text">{r.missingAssignments} dancer(s) missing a costume</div>}
                  </div>
                  <div className="mini-ring">
                    <ProgressRing percent={r.percent} size={44} />
                  </div>
                </li>
              );
            })}
            {!perfs.length && <li className="faint small">No upcoming performances.</li>}
          </ul>
        </Card>
        <AnnouncementsCard items={announcementsFor(db.announcements, 'staff')} />
        <Card title="Rehearsals" className="span-2">
          <ul className="mini-list">
            {rehearsals.map((e) => (
              <li key={e.id}>
                <span>
                  <strong>{e.title}</strong> <span className="small faint">· {formatDate(e.startDate)}{!e.allDay && e.startTime ? ` · ${formatTime(e.startTime)}–${formatTime(e.endTime)}` : ''}{e.location ? ` · ${e.location}` : ''}</span>
                </span>
              </li>
            ))}
            {!rehearsals.length && <li className="faint small">No rehearsals in the next 60 days.</li>}
          </ul>
        </Card>
        <Card title="Repair & Cleaning" icon={<Wrench size={18} />} actions={<Link to="/repairs" className="btn btn-ghost btn-sm">Open list</Link>}>
          <ul className="mini-list">
            {open.slice(0, 6).map((w) => {
              const item = db.costumes.find((c) => c.id === w.costumeId);
              return (
                <li key={w.id}>
                  <span>
                    {item?.name} <span className="small faint">· {workTypeLabels[w.type]}</span>
                  </span>
                </li>
              );
            })}
            {!open.length && <li className="faint small">Nothing out for repair.</li>}
          </ul>
        </Card>
      </div>
    </>
  );
}

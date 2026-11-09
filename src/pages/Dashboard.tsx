import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { CalendarHeart, CheckCircle2, Clock, Plus, Scissors, Shirt, Sparkles, Theater, Users, Warehouse, Wrench } from 'lucide-react';
import { useDb } from '../data/store';
import { Card, EmptyState, PageHeader, ProgressRing, StatCard, StatusBadge } from '../components/ui';
import { useEditors } from '../components/editors';
import { buildOverview, byId, formatDate, formatDateTime, formatTime, isUpcomingPerformance, isUpcomingShow, ownerCostumeIds, ownerDancerIds } from '../data/selectors';
import type { Costume } from '../data/types';

export function Dashboard() {
  const db = useDb();
  const ed = useEditors();

  const stats = useMemo(() => {
    const ready = db.costumes.filter((c) => c.status === 'ready');
    const inProgress = db.costumes.filter((c) => c.status === 'in_progress');
    const upcomingShows = db.shows.filter((s) => isUpcomingShow(s));
    const upcomingPerfs = db.performances.filter((p) => isUpcomingPerformance(p)).sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999') || a.time.localeCompare(b.time));
    return {
      ready,
      inProgress,
      repairs: inProgress.filter((c) => c.progressReason !== 'alteration'),
      altering: inProgress.filter((c) => c.progressReason === 'alteration'),
      recent: [...db.costumes].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 6),
      upcomingShows,
      upcomingPerfs,
    };
  }, [db]);

  const shows = byId(db.shows);
  const locs = byId(db.storageLocations);
  const today = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <>
      <PageHeader title="Dashboard" subtitle={`Welcome back — here's your costume snapshot for ${today}.`} />

      <div className="stats">
        <StatCard label="Dancers" value={db.dancers.length} icon={<Users size={20} />} to="/dancers" tone="rose" />
        <StatCard label="Costumes" value={db.costumes.length} icon={<Shirt size={20} />} to="/costumes" tone="plum" />
        <StatCard label="Costumes ready" value={stats.ready.length} icon={<CheckCircle2 size={20} />} to="/costumes?status=ready" tone="sage" />
        <StatCard label="In progress / repairs" value={stats.inProgress.length} icon={<Wrench size={20} />} to="/costumes?status=in_progress" tone="amber" />
        <StatCard label="Upcoming shows" value={stats.upcomingShows.length} icon={<Theater size={20} />} to="/shows" tone="sand" />
        <StatCard label="Active performances" value={stats.upcomingPerfs.length} icon={<CalendarHeart size={20} />} to="/performances" tone="slate" hint="Upcoming plans" />
      </div>

      <div className="dash-grid">
        <Card title="Upcoming Performances" icon={<CalendarHeart size={18} />} className="span-2" actions={<Link to="/performances" className="btn btn-ghost btn-sm">View all</Link>}>
          {!stats.upcomingPerfs.length ? (
            <EmptyState
              title="No upcoming performances"
              message="Create a performance plan to start assigning costumes."
              action={
                <button className="btn btn-primary" onClick={() => ed.editPerformance(undefined, { navigate: true })}>
                  <Plus size={16} /> Create performance plan
                </button>
              }
            />
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Performance</th>
                    <th className="minor">Show</th>
                    <th>Date</th>
                    <th>Dancers</th>
                    <th>Costumes</th>
                    <th>Readiness</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.upcomingPerfs.slice(0, 6).map((p) => {
                    const { readiness } = buildOverview(db, 'performance', p.id);
                    return (
                      <tr key={p.id}>
                        <td>
                          <Link to={`/performances/${p.id}`} className="link-strong">
                            {p.name}
                          </Link>
                        </td>
                        <td className="minor">{p.showId ? shows.get(p.showId)?.name : <span className="faint">—</span>}</td>
                        <td>
                          {p.date ? formatDate(p.date) : <span className="faint">No date</span>}
                          {p.time && <div className="small faint">{formatTime(p.time)}</div>}
                        </td>
                        <td>{ownerDancerIds(db, 'performance', p.id).length}</td>
                        <td>{readiness.totalAssignments}</td>
                        <td>
                          <div className="mini-ring">
                            <ProgressRing percent={readiness.percent} size={44} />
                            {readiness.missingAssignments > 0 && <span className="small bad-text">{readiness.missingAssignments} missing</span>}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card title="Quick Actions" icon={<Sparkles size={18} />}>
          <div className="quick">
            <button className="quick-btn" onClick={() => ed.editDancer(undefined, { navigate: true })}>
              <Users size={18} /> Add a dancer
            </button>
            <button className="quick-btn" onClick={() => ed.editCostume(undefined, { navigate: true })}>
              <Shirt size={18} /> Add a costume
            </button>
            <button className="quick-btn" onClick={() => ed.editShow(undefined, { navigate: true })}>
              <Theater size={18} /> Create a show
            </button>
            <button className="quick-btn" onClick={() => ed.editPerformance(undefined, { navigate: true })}>
              <CalendarHeart size={18} /> Create a performance plan
            </button>
            <button className="quick-btn" onClick={() => ed.editLocation(undefined, { navigate: true })}>
              <Warehouse size={18} /> Add a storage location
            </button>
          </div>
        </Card>

        <Card title="Needs Repairs" icon={<Wrench size={18} />}>
          <CostumeMiniList list={stats.repairs} empty="No costumes need repairs." locs={locs} />
        </Card>
        <Card title="Being Altered" icon={<Scissors size={18} />}>
          <CostumeMiniList list={stats.altering} empty="No costumes are being altered." locs={locs} />
        </Card>
        <Card title="Ready" icon={<CheckCircle2 size={18} />} actions={<Link to="/costumes?status=ready" className="btn btn-ghost btn-sm">View all</Link>}>
          <CostumeMiniList list={stats.ready.slice(0, 6)} empty="No costumes are marked ready yet." locs={locs} more={stats.ready.length - 6} />
        </Card>

        <Card title="Recently Updated Costumes" icon={<Clock size={18} />} className="span-2">
          {!stats.recent.length ? (
            <EmptyState
              title="No costumes yet"
              action={
                <button className="btn btn-primary" onClick={() => ed.editCostume(undefined, { navigate: true })}>
                  <Plus size={16} /> Add a costume
                </button>
              }
            />
          ) : (
            <ul className="mini-list">
              {stats.recent.map((c) => (
                <li key={c.id}>
                  <div>
                    <Link to={`/costumes/${c.id}`} className="link-strong">
                      {c.name}
                    </Link>
                    <div className="small faint">
                      {c.inventoryNumber} · updated {formatDateTime(c.updatedAt)}
                    </div>
                  </div>
                  <StatusBadge costume={c} compact />
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Upcoming Shows" icon={<Theater size={18} />}>
          {!stats.upcomingShows.length ? (
            <p className="faint pad">No upcoming shows.</p>
          ) : (
            <ul className="mini-list">
              {stats.upcomingShows.slice(0, 5).map((s) => (
                <li key={s.id}>
                  <div>
                    <Link to={`/shows/${s.id}`} className="link-strong">
                      {s.name}
                    </Link>
                    <div className="small faint">
                      {s.startDate ? formatDate(s.startDate) : 'No date'} · {ownerDancerIds(db, 'show', s.id).length} dancers · {ownerCostumeIds(db, 'show', s.id).length} costumes
                    </div>
                  </div>
                  <span className={`badge badge-${s.status === 'active' ? 'ready' : 'info'}`}>{s.status === 'active' ? 'Active' : 'Planning'}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}

function CostumeMiniList({ list, empty, locs, more = 0 }: { list: Costume[]; empty: string; locs: Map<string, { name: string }>; more?: number }) {
  if (!list.length) return <p className="faint pad">{empty}</p>;
  return (
    <ul className="mini-list">
      {list.map((c) => (
        <li key={c.id}>
          <div>
            <Link to={`/costumes/${c.id}`} className="link-strong">
              {c.name}
            </Link>
            <div className="small faint">
              {c.inventoryNumber} · {c.storageLocationId ? locs.get(c.storageLocationId)?.name : 'Unassigned'}
              {c.status === 'in_progress' && c.repairNotes ? ` · ${c.repairNotes}` : ''}
            </div>
          </div>
        </li>
      ))}
      {more > 0 && <li className="small faint">+ {more} more</li>}
    </ul>
  );
}

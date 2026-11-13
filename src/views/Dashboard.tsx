import { useMemo, useState } from 'react';
import { isOpenOrder, workTypeLabels } from '../data/workflow';
import { WorkOrderDialog, isOverdue } from '../components/work';
import { StudioOverview } from './StudioOverview';
import { todayHeading } from '../data/time';
import { Link } from '../lib/router';
import { CalendarHeart, CheckCircle2, Clock, Plus, Scissors, Shirt, Sparkles, Theater, Users, Warehouse, Wrench , HandHeart, Wand2} from 'lucide-react';
import { useDb } from '../data/store';
import { itemLabels } from '../lib/labels';
import { Card, EmptyState, PageHeader, ProgressRing, StatCard, StatusBadge } from '../components/ui';
import { useEditors } from '../components/editors';
import { volunteerName, itemsOf, kindOf, buildOverview, byId, formatDate, formatDateTime, formatTime, isUpcomingPerformance, isUpcomingShow, ownerCostumeIds, ownerDancerIds } from '../data/selectors';
import type { Costume } from '../data/types';

export function Dashboard() {
  const db = useDb();
  const ed = useEditors();
  const [sending, setSending] = useState(false);
  const openWork = db.workOrders.filter(isOpenOrder).sort((a, b) => Number(isOverdue(b)) - Number(isOverdue(a)) || (a.dueDate || '9999').localeCompare(b.dueDate || '9999'));

  const stats = useMemo(() => {
    const costumes = itemsOf(db, 'costume');
    const props = itemsOf(db, 'prop');
    const ready = costumes.filter((c) => c.status === 'ready');
    const inProgress = costumes.filter((c) => c.status === 'in_progress');
    const propsInProgress = props.filter((c) => c.status === 'in_progress');
    const upcomingShows = db.shows.filter((s) => isUpcomingShow(s));
    const upcomingPerfs = db.performances.filter((p) => isUpcomingPerformance(p)).sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999') || a.time.localeCompare(b.time));
    return {
      ready,
      inProgress,
      costumes,
      props,
      propsInProgress,
      repairs: [...inProgress, ...propsInProgress].filter((c) => c.progressReason !== 'alteration'),
      altering: [...inProgress, ...propsInProgress].filter((c) => c.progressReason === 'alteration'),
      recent: [...db.costumes].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 6),
      upcomingShows,
      upcomingPerfs,
    };
  }, [db]);

  const shows = byId(db.shows);
  const locs = byId(db.storageLocations);
  const today = todayHeading();

  return (
    <>
      <PageHeader title="Dashboard" subtitle={`Welcome back — here's your studio for ${today}.`} />
      <StudioOverview />

      <div className="stats">
        <StatCard label="Dancers" value={db.dancers.length} icon={<Users size={20} />} to="/dancers" tone="rose" />
        <StatCard label="Costumes" value={stats.costumes.length} icon={<Shirt size={20} />} to="/costumes" tone="plum" />
        <StatCard label="Costumes ready" value={stats.ready.length} icon={<CheckCircle2 size={20} />} to="/costumes?status=ready" tone="sage" />
        <StatCard label="In progress / repairs" value={stats.inProgress.length} icon={<Wrench size={20} />} to="/costumes?status=in_progress" tone="amber" />
        <StatCard label="Upcoming shows" value={stats.upcomingShows.length} icon={<Theater size={20} />} to="/shows" tone="sand" />
        <StatCard label="Active performances" value={stats.upcomingPerfs.length} icon={<CalendarHeart size={20} />} to="/performances" tone="slate" hint="Upcoming plans" />
        <StatCard label="Props" value={stats.props.length} icon={<Wand2 size={20} />} to="/props" tone="plum" hint={stats.propsInProgress.length ? `${stats.propsInProgress.length} in progress` : 'All ready'} />
        <StatCard label="Volunteers" value={db.volunteers.length} icon={<HandHeart size={20} />} to="/volunteers" tone="rose" />
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
            <button className="quick-btn" onClick={() => ed.editProp(undefined, { navigate: true })}>
              <Wand2 size={18} /> Add a prop
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
            <button className="quick-btn" onClick={() => ed.editVolunteer(undefined, { navigate: true })}>
              <HandHeart size={18} /> Add a volunteer
            </button>
            <button className="quick-btn" onClick={() => setSending(true)}>
              <Sparkles size={18} /> Send for repair / cleaning
            </button>
          </div>
        </Card>

        <Card title="Repairs & Cleaning" icon={<Wrench size={18} />} actions={<Link to="/repairs" className="btn btn-ghost btn-sm">Open list</Link>}>
          {!openWork.length ? (
            <p className="faint pad">Nothing is out for repair or cleaning.</p>
          ) : (
            <ul className="mini-list">
              {openWork.slice(0, 6).map((w) => {
                const item = db.costumes.find((c) => c.id === w.costumeId);
                if (!item) return null;
                const vol = db.volunteers.find((v) => v.id === w.volunteerId);
                return (
                  <li key={w.id}>
                    <div>
                      <Link to={`${itemLabels[kindOf(item)].base}/${item.id}`} className="link-strong">
                        {item.name}
                      </Link>
                      <div className="small faint">
                        {workTypeLabels[w.type]} · {vol ? volunteerName(vol) : <span className="warn-text inline">not assigned</span>}
                        {w.dueDate && ` · due ${formatDate(w.dueDate)}`}
                      </div>
                    </div>
                    {isOverdue(w) && <span className="badge badge-danger">Overdue</span>}
                  </li>
                );
              })}
              {openWork.length > 6 && <li className="small faint">+ {openWork.length - 6} more</li>}
            </ul>
          )}
        </Card>
        <Card title="Being Altered" icon={<Scissors size={18} />}>
          <CostumeMiniList list={stats.altering} empty="Nothing is being altered." locs={locs} />
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
                    <Link to={`${itemLabels[kindOf(c)].base}/${c.id}`} className="link-strong">
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
      <WorkOrderDialog open={sending} onClose={() => setSending(false)} />
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
            <Link to={`${itemLabels[kindOf(c)].base}/${c.id}`} className="link-strong">
              {c.name}
            </Link>
            {kindOf(c) === 'prop' && <span className="badge badge-rose tiny-badge">Prop</span>}
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

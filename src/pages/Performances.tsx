import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CalendarHeart, Clock, Copy, Download, Import, MapPin, Pencil, Plus, Trash2 , Printer} from 'lucide-react';
import { useDb } from '../data/store';
import { deletePerformance, duplicatePerformance, importShowCasts } from '../data/actions';
import { buildOverview, byId, castsFor, formatDate, formatDateTime, formatTime, isUpcomingPerformance, ownerDancerIds } from '../data/selectors';
import { Card, DataTable, EmptyState, PageHeader, ProgressRing, SampleTag, SearchInput, Tabs, type Column } from '../components/ui';
import { useConfirm, useRun } from '../components/feedback';
import { useEditors } from '../components/editors';
import { AttentionList, CastManager, CostumeListPanel, CostumeOverviewTable, PropOverviewTable, ReadinessSummary } from '../components/casting';
import { AvailableVolunteersCard } from './Volunteers';
import { openPrint } from './Print';
import { exportAllPerformanceAssignments, exportAssignments, exportCastLists, exportPropAssignments } from '../lib/export';
import type { PerformancePlan } from '../data/types';

export function PerformancesPage() {
  const db = useDb();
  const ed = useEditors();
  const run = useRun();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const [tab, setTab] = useState<'upcoming' | 'past' | 'all'>('upcoming');
  const [q, setQ] = useState('');
  const [show, setShow] = useState('');
  const shows = byId(db.shows);

  const readiness = useMemo(() => new Map(db.performances.map((p) => [p.id, buildOverview(db, 'performance', p.id).readiness])), [db]);
  const upcoming = db.performances.filter((p) => isUpcomingPerformance(p));
  const rows = db.performances.filter(
    (p) =>
      (tab === 'all' || (tab === 'upcoming' ? isUpcomingPerformance(p) : !isUpcomingPerformance(p))) &&
      (!show || (show === 'none' ? !p.showId : p.showId === show)) &&
      (!q || `${p.name} ${p.venue}`.toLowerCase().includes(q.toLowerCase())),
  );

  const remove = async (p: PerformancePlan) => {
    if (await confirm({ title: 'Delete performance plan?', message: `Delete “${p.name}” with its cast lists and costume assignments? Dancers, costumes and the show are not deleted.`, confirmLabel: 'Delete', danger: true }))
      run(() => deletePerformance(p.id), 'Performance plan deleted.');
  };

  const columns: Column<PerformancePlan>[] = [
    {
      key: 'name',
      header: 'Performance',
      render: (p) => (
        <>
          <Link to={`/performances/${p.id}`} className="link-strong">
            {p.name}
          </Link>
          <SampleTag show={p.isSample} />
        </>
      ),
      sortValue: (p) => p.name,
    },
    { key: 'show', header: 'Show', render: (p) => (p.showId ? <Link to={`/shows/${p.showId}`}>{shows.get(p.showId)?.name}</Link> : <span className="faint">—</span>), sortValue: (p) => shows.get(p.showId ?? '')?.name ?? '', minor: true },
    {
      key: 'date',
      header: 'Date',
      render: (p) => (
        <>
          {formatDate(p.date) || <span className="faint">No date</span>}
          {p.time && <div className="small faint">{formatTime(p.time)}</div>}
        </>
      ),
      sortValue: (p) => `${p.date || '9999'}${p.time}`,
    },
    { key: 'venue', header: 'Venue', render: (p) => p.venue || <span className="faint">—</span>, sortValue: (p) => p.venue, minor: true },
    { key: 'dancers', header: 'Dancers', render: (p) => readiness.get(p.id)?.totalDancers ?? 0, sortValue: (p) => readiness.get(p.id)?.totalDancers ?? 0 },
    { key: 'costumes', header: 'Assignments', render: (p) => readiness.get(p.id)?.totalAssignments ?? 0, sortValue: (p) => readiness.get(p.id)?.totalAssignments ?? 0, minor: true },
    {
      key: 'ready',
      header: 'Readiness',
      render: (p) => {
        const r = readiness.get(p.id)!;
        return (
          <div className="mini-ring">
            <ProgressRing percent={r.percent} size={44} />
            {r.missingAssignments > 0 && <span className="small bad-text">{r.missingAssignments} missing</span>}
          </div>
        );
      },
      sortValue: (p) => readiness.get(p.id)?.percent ?? -1,
    },
    {
      key: 'act',
      header: '',
      render: (p) => (
        <div className="row-actions">
          <button className="icon-btn" aria-label={`Edit ${p.name}`} title="Edit" onClick={() => ed.editPerformance(p.id)}>
            <Pencil size={16} />
          </button>
          <button
            className="icon-btn"
            aria-label={`Duplicate ${p.name}`}
            title="Duplicate"
            onClick={() => {
              const id = run(() => duplicatePerformance(p.id), `Duplicated “${p.name}”.`);
              if (id) navigate(`/performances/${id}`);
            }}
          >
            <Copy size={16} />
          </button>
          <button className="icon-btn danger" aria-label={`Delete ${p.name}`} title="Delete" onClick={() => remove(p)}>
            <Trash2 size={16} />
          </button>
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Performance Planning"
        subtitle="Cast lists, costume assignments and readiness for every performance"
        actions={
          <>
            <button className="btn btn-ghost" onClick={() => openPrint('performances')} disabled={!db.performances.length}>
              <Printer size={16} /> Print schedule
            </button>
            <button className="btn btn-ghost" onClick={() => exportAllPerformanceAssignments(db)} disabled={!db.performances.length}>
              <Download size={16} /> Export all assignments
            </button>
            <button className="btn btn-primary" onClick={() => ed.editPerformance(undefined, { navigate: true })}>
              <Plus size={16} /> Create performance plan
            </button>
          </>
        }
      />
      <Card>
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            { value: 'upcoming', label: 'Upcoming', count: upcoming.length },
            { value: 'past', label: 'Past', count: db.performances.length - upcoming.length },
            { value: 'all', label: 'All', count: db.performances.length },
          ]}
        />
        <div className="toolbar">
          <SearchInput value={q} onChange={setQ} placeholder="Search performances…" />
          <select className="input input-auto" value={show} onChange={(e) => setShow(e.target.value)} aria-label="Filter by show">
            <option value="">All shows</option>
            {db.shows.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
            <option value="none">No show</option>
          </select>
        </div>
        <DataTable
          rows={rows}
          columns={columns}
          getId={(p) => p.id}
          initialSort={{ key: 'date', dir: tab === 'past' ? 'desc' : 'asc' }}
          empty={
            db.performances.length ? (
              <EmptyState title={`No ${tab === 'all' ? '' : tab} performances${q || show ? ' match' : ''}`} />
            ) : (
              <EmptyState
                icon={<CalendarHeart size={28} />}
                title="No performance plans yet"
                message="Create a plan to set call times, cast lists and costume assignments."
                action={
                  <button className="btn btn-primary" onClick={() => ed.editPerformance(undefined, { navigate: true })}>
                    <Plus size={16} /> Create performance plan
                  </button>
                }
              />
            )
          }
        />
      </Card>
    </>
  );
}

export function PerformanceDetailPage() {
  const { id } = useParams();
  const db = useDb();
  const ed = useEditors();
  const run = useRun();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const p = db.performances.find((x) => x.id === id);
  const overview = useMemo(() => (p ? buildOverview(db, 'performance', p.id) : null), [db, p]);
  if (!p || !overview) {
    return (
      <>
        <PageHeader title="Performance not found" back={{ to: '/performances', label: 'Performance Planning' }} />
        <EmptyState title="This performance plan no longer exists" action={<Link to="/performances" className="btn btn-primary">Back to performances</Link>} />
      </>
    );
  }
  const show = p.showId ? db.shows.find((s) => s.id === p.showId) : null;
  const showCasts = show ? castsFor(db, 'show', show.id) : [];

  const remove = async () => {
    if (await confirm({ title: 'Delete performance plan?', message: `Delete “${p.name}” with its cast lists and costume assignments? Dancers, costumes and the show are not deleted.`, confirmLabel: 'Delete', danger: true }))
      if (run(() => (deletePerformance(p.id), true), 'Performance plan deleted.')) navigate('/performances');
  };
  const importCasts = async () => {
    if (!show) return;
    if (await confirm({ title: 'Copy cast lists from show?', message: `Copy ${showCasts.length} cast list(s) and their costume assignments from “${show.name}” into this performance? Existing cast lists here are kept.`, confirmLabel: 'Copy cast lists' }))
      run(() => importShowCasts(p.id, show.id), 'Cast lists copied from the show.');
  };

  return (
    <>
      <PageHeader
        back={{ to: '/performances', label: 'Performance Planning' }}
        title={
          <>
            {p.name} <SampleTag show={p.isSample} />
          </>
        }
        subtitle={[show?.name, formatDate(p.date), p.time && formatTime(p.time), p.venue].filter(Boolean).join(' · ')}
        actions={
          <>
            <button className="btn btn-ghost danger" onClick={remove}>
              <Trash2 size={16} /> Delete
            </button>
            <button
              className="btn btn-ghost"
              onClick={() => {
                const nid = run(() => duplicatePerformance(p.id), 'Performance plan duplicated.');
                if (nid) navigate(`/performances/${nid}`);
              }}
            >
              <Copy size={16} /> Duplicate
            </button>
            <button className="btn btn-ghost" onClick={() => openPrint('performance', { id: p.id })}>
              <Printer size={16} /> Print call sheet
            </button>
            <button className="btn btn-primary" onClick={() => ed.editPerformance(p.id)}>
              <Pencil size={16} /> Edit details
            </button>
          </>
        }
      />

      <div className="detail-grid">
        <Card title="Performance Details">
          <dl className="dl">
            <dt>Show</dt>
            <dd>{show ? <Link to={`/shows/${show.id}`}>{show.name}</Link> : '—'}</dd>
            <dt>Date</dt>
            <dd>{formatDate(p.date) || '—'}</dd>
            <dt>Time</dt>
            <dd>{formatTime(p.time) || '—'}</dd>
            <dt>
              <Clock size={13} /> Call time
            </dt>
            <dd>{formatTime(p.callTime) || '—'}</dd>
            <dt>Dress rehearsal</dt>
            <dd>{p.dressRehearsal ? formatDateTime(p.dressRehearsal) : '—'}</dd>
            <dt>
              <MapPin size={13} /> Venue
            </dt>
            <dd>
              {p.venue || '—'}
              {p.address && <div className="small faint">{p.address}</div>}
            </dd>
            <dt>Notes</dt>
            <dd className="prewrap">{p.notes || '—'}</dd>
            <dt>Additional details</dt>
            <dd className="prewrap">{p.details || '—'}</dd>
          </dl>
        </Card>
        <Card
          title="Performance Readiness"
          actions={
            <>
              <button className="btn btn-ghost btn-sm" onClick={() => exportCastLists(db, 'performance', p.id, p.name)}>
                <Download size={14} /> Cast lists
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => exportAssignments(db, 'performance', p.id, p.name)}>
                <Download size={14} /> Costumes
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => exportPropAssignments(db, 'performance', p.id, p.name)}>
                <Download size={14} /> Props
              </button>
            </>
          }
        >
          <ReadinessSummary readiness={overview.readiness} />
          <AttentionList readiness={overview.readiness} />
        </Card>
      </div>

      {show && showCasts.length > 0 && (
        <div className="hint-bar">
          <span>
            <strong>{show.name}</strong> has {showCasts.length} cast list{showCasts.length === 1 ? '' : 's'}. You can copy them here with their costume assignments.
          </span>
          <button className="btn btn-ghost btn-sm" onClick={importCasts}>
            <Import size={14} /> Copy cast lists from show
          </button>
        </div>
      )}

      <CastManager ownerType="performance" ownerId={p.id} />
      <CostumeListPanel ownerType="performance" ownerId={p.id} />
      <CostumeOverviewTable ownerType="performance" ownerId={p.id} />
      <CostumeListPanel ownerType="performance" ownerId={p.id} kind="prop" />
      <PropOverviewTable ownerType="performance" ownerId={p.id} />
      <AvailableVolunteersCard date={p.date} time={p.callTime || p.time} dressRehearsal={p.dressRehearsal} />
      <p className="small faint center">
        {ownerDancerIds(db, 'performance', p.id).length} dancers across {castsFor(db, 'performance', p.id).length} cast list(s).
      </p>
    </>
  );
}

import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CalendarHeart, Copy, Download, Pencil, Plus, Theater, Trash2 } from 'lucide-react';
import { useDb } from '../data/store';
import { deleteShow, duplicateShow } from '../data/actions';
import { buildOverview, byId, formatDate, formatTime, ownerCostumeIds, ownerDancerIds, showDateLabel, castsFor } from '../data/selectors';
import { Badge, Card, DataTable, EmptyState, PageHeader, SampleTag, SearchInput, type Column } from '../components/ui';
import { useConfirm, useRun } from '../components/feedback';
import { useEditors } from '../components/editors';
import { AttentionList, CastManager, CostumeListPanel, CostumeOverviewTable, PropOverviewTable, ReadinessSummary } from '../components/casting';
import { exportAssignments, exportCastLists, exportPropAssignments } from '../lib/export';
import type { Show, ShowStatus } from '../data/types';

export const SHOW_STATUS: Record<ShowStatus, { label: string; tone: 'info' | 'ready' | 'neutral' }> = {
  planning: { label: 'Planning', tone: 'info' },
  active: { label: 'Active', tone: 'ready' },
  completed: { label: 'Completed', tone: 'neutral' },
};

export function ShowsPage() {
  const db = useDb();
  const ed = useEditors();
  const run = useRun();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [type, setType] = useState('');
  const cats = byId(db.categories);

  const rows = db.shows.filter((s) => (!q || `${s.name} ${s.venue} ${s.description}`.toLowerCase().includes(q.toLowerCase())) && (!status || s.status === status) && (!type || (type === 'none' ? !s.categoryId : s.categoryId === type)));

  const remove = async (s: Show) => {
    const perfs = db.performances.filter((p) => p.showId === s.id).length;
    if (await confirm({ title: 'Delete show?', message: `Delete “${s.name}” with its cast lists and costume assignments? Dancers and costumes are not deleted.${perfs ? ` ${perfs} performance plan(s) will be kept but unlinked from this show.` : ''}`, confirmLabel: 'Delete show', danger: true }))
      run(() => deleteShow(s.id), 'Show deleted.');
  };

  const columns: Column<Show>[] = [
    {
      key: 'name',
      header: 'Show',
      render: (s) => (
        <>
          <Link to={`/shows/${s.id}`} className="link-strong">
            {s.name}
          </Link>
          <SampleTag show={s.isSample} />
          {s.description && <div className="small faint truncate">{s.description}</div>}
        </>
      ),
      sortValue: (s) => s.name,
    },
    { key: 'type', header: 'Show Type', render: (s) => (s.categoryId ? cats.get(s.categoryId)?.name : <span className="faint">—</span>), sortValue: (s) => cats.get(s.categoryId ?? '')?.name ?? '', minor: true },
    { key: 'date', header: 'Date(s)', render: (s) => showDateLabel(s) || <span className="faint">No date</span>, sortValue: (s) => s.startDate },
    { key: 'venue', header: 'Venue', render: (s) => s.venue || <span className="faint">—</span>, sortValue: (s) => s.venue, minor: true },
    { key: 'casts', header: 'Casts', render: (s) => castsFor(db, 'show', s.id).length, sortValue: (s) => castsFor(db, 'show', s.id).length, minor: true },
    { key: 'dancers', header: 'Dancers', render: (s) => ownerDancerIds(db, 'show', s.id).length, sortValue: (s) => ownerDancerIds(db, 'show', s.id).length },
    { key: 'costumes', header: 'Costumes', render: (s) => ownerCostumeIds(db, 'show', s.id).length, sortValue: (s) => ownerCostumeIds(db, 'show', s.id).length },
    { key: 'props', header: 'Props', render: (s) => ownerCostumeIds(db, 'show', s.id, 'prop').length, sortValue: (s) => ownerCostumeIds(db, 'show', s.id, 'prop').length, minor: true },
    { key: 'status', header: 'Status', render: (s) => <Badge tone={SHOW_STATUS[s.status].tone}>{SHOW_STATUS[s.status].label}</Badge>, sortValue: (s) => ['planning', 'active', 'completed'].indexOf(s.status) },
    {
      key: 'act',
      header: '',
      render: (s) => (
        <div className="row-actions">
          <button className="icon-btn" aria-label={`Edit ${s.name}`} title="Edit" onClick={() => ed.editShow(s.id)}>
            <Pencil size={16} />
          </button>
          <button
            className="icon-btn"
            aria-label={`Duplicate ${s.name}`}
            title="Duplicate with casts and costumes"
            onClick={() => {
              const id = run(() => duplicateShow(s.id), `Duplicated “${s.name}”.`);
              if (id) navigate(`/shows/${id}`);
            }}
          >
            <Copy size={16} />
          </button>
          <button className="icon-btn danger" aria-label={`Delete ${s.name}`} title="Delete" onClick={() => remove(s)}>
            <Trash2 size={16} />
          </button>
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Shows"
        subtitle="Productions, recitals and competitions"
        actions={
          <button className="btn btn-primary" onClick={() => ed.editShow(undefined, { navigate: true })}>
            <Plus size={16} /> Create show
          </button>
        }
      />
      <Card>
        <div className="toolbar">
          <SearchInput value={q} onChange={setQ} placeholder="Search shows…" />
          <select className="input input-auto" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status">
            <option value="">All statuses</option>
            <option value="planning">Planning</option>
            <option value="active">Active</option>
            <option value="completed">Completed</option>
          </select>
          <select className="input input-auto" value={type} onChange={(e) => setType(e.target.value)} aria-label="Filter by show type">
            <option value="">All show types</option>
            {[...db.categories].sort((a, b) => a.sortOrder - b.sortOrder).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
            <option value="none">Not set</option>
          </select>
        </div>
        <DataTable
          rows={rows}
          columns={columns}
          getId={(s) => s.id}
          initialSort={{ key: 'date', dir: 'asc' }}
          empty={
            db.shows.length ? (
              <EmptyState title="No shows match" />
            ) : (
              <EmptyState
                icon={<Theater size={28} />}
                title="No shows yet"
                message="Create a show, then build its cast lists and costume list."
                action={
                  <button className="btn btn-primary" onClick={() => ed.editShow(undefined, { navigate: true })}>
                    <Plus size={16} /> Create show
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

export function ShowDetailPage() {
  const { id } = useParams();
  const db = useDb();
  const ed = useEditors();
  const run = useRun();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const s = db.shows.find((x) => x.id === id);
  const overview = useMemo(() => (s ? buildOverview(db, 'show', s.id) : null), [db, s]);
  if (!s || !overview) {
    return (
      <>
        <PageHeader title="Show not found" back={{ to: '/shows', label: 'Shows' }} />
        <EmptyState title="This show no longer exists" action={<Link to="/shows" className="btn btn-primary">Back to shows</Link>} />
      </>
    );
  }
  const cat = s.categoryId ? db.categories.find((c) => c.id === s.categoryId) : null;
  const perfs = db.performances.filter((p) => p.showId === s.id).sort((a, b) => a.date.localeCompare(b.date));

  const remove = async () => {
    if (await confirm({ title: 'Delete show?', message: `Delete “${s.name}” with its cast lists and costume assignments? Dancers and costumes are not deleted.${perfs.length ? ` ${perfs.length} performance plan(s) will be kept but unlinked.` : ''}`, confirmLabel: 'Delete show', danger: true }))
      if (run(() => (deleteShow(s.id), true), 'Show deleted.')) navigate('/shows');
  };

  return (
    <>
      <PageHeader
        back={{ to: '/shows', label: 'Shows' }}
        title={
          <>
            {s.name} <SampleTag show={s.isSample} />
          </>
        }
        subtitle={[cat?.name, showDateLabel(s), s.venue].filter(Boolean).join(' · ')}
        actions={
          <>
            <button className="btn btn-ghost danger" onClick={remove}>
              <Trash2 size={16} /> Delete
            </button>
            <button
              className="btn btn-ghost"
              onClick={() => {
                const nid = run(() => duplicateShow(s.id), 'Show duplicated.');
                if (nid) navigate(`/shows/${nid}`);
              }}
            >
              <Copy size={16} /> Duplicate
            </button>
            <button className="btn btn-primary" onClick={() => ed.editShow(s.id)}>
              <Pencil size={16} /> Edit show
            </button>
          </>
        }
      />

      <div className="detail-grid">
        <Card title="Show Information">
          <dl className="dl">
            <dt>Status</dt>
            <dd>
              <Badge tone={SHOW_STATUS[s.status].tone}>{SHOW_STATUS[s.status].label}</Badge>
            </dd>
            <dt>Show type</dt>
            <dd>{cat?.name ?? '—'}</dd>
            <dt>Date(s)</dt>
            <dd>{showDateLabel(s) || '—'}</dd>
            <dt>Venue</dt>
            <dd>{s.venue || '—'}</dd>
            <dt>Description</dt>
            <dd className="prewrap">{s.description || '—'}</dd>
            <dt>Notes</dt>
            <dd className="prewrap">{s.notes || '—'}</dd>
          </dl>
        </Card>
        <Card
          title="Costume Readiness"
          actions={
            <>
              <button className="btn btn-ghost btn-sm" onClick={() => exportCastLists(db, 'show', s.id, s.name)}>
                <Download size={14} /> Cast lists
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => exportAssignments(db, 'show', s.id, s.name)}>
                <Download size={14} /> Costumes
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => exportPropAssignments(db, 'show', s.id, s.name)}>
                <Download size={14} /> Props
              </button>
            </>
          }
        >
          <ReadinessSummary readiness={overview.readiness} />
          <AttentionList readiness={overview.readiness} />
        </Card>
      </div>

      <CastManager ownerType="show" ownerId={s.id} />
      <CostumeListPanel ownerType="show" ownerId={s.id} />
      <CostumeOverviewTable ownerType="show" ownerId={s.id} />
      <CostumeListPanel ownerType="show" ownerId={s.id} kind="prop" />
      <PropOverviewTable ownerType="show" ownerId={s.id} />

      <Card
        title="Performance Plans for This Show"
        icon={<CalendarHeart size={18} />}
        actions={
          <button className="btn btn-primary btn-sm" onClick={() => ed.editPerformance(undefined, { showId: s.id, navigate: true })}>
            <Plus size={15} /> New performance plan
          </button>
        }
      >
        {!perfs.length ? (
          <p className="faint pad">No performance plans yet. A new plan can start with this show's cast lists and costume assignments.</p>
        ) : (
          <ul className="mini-list">
            {perfs.map((p) => (
              <li key={p.id}>
                <div>
                  <Link to={`/performances/${p.id}`} className="link-strong">
                    {p.name}
                  </Link>
                  <div className="small faint">
                    {formatDate(p.date) || 'No date'}
                    {p.time && ` · ${formatTime(p.time)}`}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}

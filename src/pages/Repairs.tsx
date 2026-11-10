import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AlertTriangle, CalendarClock, ClipboardList, History, Plus, Printer, Sparkles, Wrench } from 'lucide-react';
import { useDb } from '../data/store';
import { formatDateTime, kindOf, volunteerName } from '../data/selectors';
import { isOpenOrder, noteTypeLabels, workTypeLabels } from '../data/workflow';
import { Card, EmptyState, PageHeader, SearchInput, StatCard, Tabs } from '../components/ui';
import { WorkOrderDialog, WorkOrderTable, isOverdue } from '../components/work';
import { itemLabels } from '../lib/labels';
import { openPrint } from './Print';
import type { NoteType, ProgressReason } from '../data/types';

type Tab = 'open' | 'done' | 'log';

export function RepairsPage() {
  const db = useDb();
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab) || 'open';
  const setTab = (t: Tab) => setParams(t === 'open' ? {} : { tab: t }, { replace: true });
  const [creating, setCreating] = useState(false);
  const [q, setQ] = useState('');
  const [type, setType] = useState('');
  const [vol, setVol] = useState('');
  const [kind, setKind] = useState('');

  const open = db.workOrders.filter(isOpenOrder);
  const closed = db.workOrders.filter((w) => !isOpenOrder(w));
  const items = new Map(db.costumes.map((c) => [c.id, c]));

  const filterOrders = (list: typeof db.workOrders) =>
    list.filter((w) => {
      const item = items.get(w.costumeId);
      if (type && w.type !== type) return false;
      if (vol && (vol === 'none' ? w.volunteerId : w.volunteerId !== vol)) return false;
      if (kind && item && kindOf(item) !== kind) return false;
      if (q && !`${item?.name ?? ''} ${item?.inventoryNumber ?? ''} ${w.description} ${w.completionNote}`.toLowerCase().includes(q.toLowerCase())) return false;
      return true;
    });

  const openSorted = filterOrders(open).sort((a, b) => Number(isOverdue(b)) - Number(isOverdue(a)) || (a.dueDate || '9999').localeCompare(b.dueDate || '9999') || a.createdAt.localeCompare(b.createdAt));
  const closedSorted = filterOrders(closed).sort((a, b) => b.completedAt.localeCompare(a.completedAt));
  const vols = [...db.volunteers].sort((a, b) => volunteerName(a).localeCompare(volunteerName(b)));

  const filters = (
    <div className="toolbar">
      <SearchInput value={q} onChange={setQ} placeholder="Search item or description…" />
      <select className="input input-auto" value={type} onChange={(e) => setType(e.target.value)} aria-label="Filter by work type">
        <option value="">All work types</option>
        {(Object.keys(workTypeLabels) as ProgressReason[]).map((t) => (
          <option key={t} value={t}>
            {workTypeLabels[t]}
          </option>
        ))}
      </select>
      <select className="input input-auto" value={vol} onChange={(e) => setVol(e.target.value)} aria-label="Filter by volunteer">
        <option value="">All volunteers</option>
        <option value="none">Not assigned</option>
        {vols.map((v) => (
          <option key={v.id} value={v.id}>
            {volunteerName(v)}
          </option>
        ))}
      </select>
      <select className="input input-auto" value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Filter by item type">
        <option value="">Costumes & props</option>
        <option value="costume">Costumes</option>
        <option value="prop">Props</option>
      </select>
    </div>
  );

  return (
    <>
      <PageHeader
        title="Repair & Cleaning"
        subtitle="Every repair, alteration and cleaning job, who's doing it, and the full history"
        actions={
          <>
            <button className="btn btn-ghost" onClick={() => openPrint(tab === 'log' ? 'log' : 'repairs', tab === 'done' ? { status: 'done' } : {})}>
              <Printer size={16} /> Print {tab === 'log' ? 'log' : 'list'}
            </button>
            <button className="btn btn-primary" onClick={() => setCreating(true)}>
              <Plus size={16} /> Send for repair / cleaning
            </button>
          </>
        }
      />

      <div className="stats stats-4">
        <StatCard label="Open work orders" value={open.length} icon={<Wrench size={20} />} tone="amber" />
        <StatCard label="Out for cleaning" value={open.filter((w) => w.type === 'cleaning').length} icon={<Sparkles size={20} />} tone="slate" />
        <StatCard label="Not yet assigned" value={open.filter((w) => !w.volunteerId).length} icon={<ClipboardList size={20} />} tone="rose" />
        <StatCard label="Overdue" value={open.filter(isOverdue).length} icon={<AlertTriangle size={20} />} tone={open.some(isOverdue) ? 'rose' : 'sage'} />
      </div>

      <Card>
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            { value: 'open', label: 'Open work', count: open.length },
            { value: 'done', label: 'Completed & cancelled', count: closed.length },
            { value: 'log', label: 'Activity log', count: db.costumeNotes.length },
          ]}
        />
        {tab === 'log' ? (
          <ActivityLog />
        ) : (
          <>
            {filters}
            {tab === 'open' ? (
              !open.length ? (
                <EmptyState
                  icon={<Wrench size={28} />}
                  title="Nothing is out for repair or cleaning"
                  message="Send a costume or prop for cleaning or repair and assign a volunteer. Marking an item IN PROGRESS also opens a work order here."
                  action={
                    <button className="btn btn-primary" onClick={() => setCreating(true)}>
                      <Plus size={16} /> Send for repair / cleaning
                    </button>
                  }
                />
              ) : (
                <WorkOrderTable orders={openSorted} empty="No open work matches these filters." />
              )
            ) : (
              <WorkOrderTable orders={closedSorted} empty="No completed work yet." />
            )}
          </>
        )}
      </Card>
      <WorkOrderDialog open={creating} onClose={() => setCreating(false)} />
    </>
  );
}

const PAGE = 200;

function ActivityLog() {
  const db = useDb();
  const [q, setQ] = useState('');
  const [type, setType] = useState('');
  const [vol, setVol] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const items = useMemo(() => new Map(db.costumes.map((c) => [c.id, c])), [db]);
  const vols = useMemo(() => new Map(db.volunteers.map((v) => [v.id, v])), [db]);

  const rows = useMemo(
    () =>
      [...db.costumeNotes]
        .filter((n) => {
          const item = items.get(n.costumeId);
          const day = toLocalDay(n.createdAt);
          if (type === 'work' ? !n.workOrderId : type && n.type !== type) return false;
          if (vol && n.volunteerId !== vol) return false;
          if (from && day < from) return false;
          if (to && day > to) return false;
          if (q && !`${item?.name ?? ''} ${item?.inventoryNumber ?? ''} ${n.text}`.toLowerCase().includes(q.toLowerCase())) return false;
          return true;
        })
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [db, items, type, vol, from, to, q],
  );

  return (
    <>
      <div className="toolbar">
        <SearchInput value={q} onChange={setQ} placeholder="Search item or log text…" />
        <select className="input input-auto" value={type} onChange={(e) => setType(e.target.value)} aria-label="Filter log by type">
          <option value="">All entries</option>
          <option value="work">Repair & cleaning jobs</option>
          {(Object.keys(noteTypeLabels) as NoteType[])
            .filter((t) => t !== 'work')
            .map((t) => (
              <option key={t} value={t}>
                {noteTypeLabels[t]}
              </option>
            ))}
        </select>
        <select className="input input-auto" value={vol} onChange={(e) => setVol(e.target.value)} aria-label="Filter log by volunteer">
          <option value="">Any volunteer</option>
          {[...vols.values()].map((v) => (
            <option key={v.id} value={v.id}>
              {volunteerName(v)}
            </option>
          ))}
        </select>
        <div className="age-filter">
          <span className="small faint">From</span>
          <input className="input input-auto" type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="Log from date" />
          <span className="small faint">to</span>
          <input className="input input-auto" type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="Log to date" />
        </div>
        <button className="btn btn-ghost btn-sm" onClick={() => openPrint('log', { q, type, vol, from, to })}>
          <Printer size={14} /> Print these entries
        </button>
      </div>
      {!rows.length ? (
        <EmptyState icon={<History size={26} />} title="No log entries" message="Status changes, repairs, cleaning, moves and notes on every costume and prop appear here automatically." />
      ) : (
        <>
          <div className="table-wrap">
            <table className="table log-table">
              <thead>
                <tr>
                  <th>Date & time</th>
                  <th>Item</th>
                  <th>Type</th>
                  <th>Entry</th>
                  <th className="minor">Volunteer</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, limit).map((n) => {
                  const item = items.get(n.costumeId);
                  const L = item ? itemLabels[kindOf(item)] : itemLabels.costume;
                  const v = n.volunteerId ? vols.get(n.volunteerId) : undefined;
                  return (
                    <tr key={n.id}>
                      <td className="nowrap small">
                        <CalendarClock size={12} className="faint" /> {formatDateTime(n.createdAt)}
                      </td>
                      <td>
                        {item ? (
                          <Link to={`${L.base}/${item.id}`} className="link-strong">
                            {item.name}
                          </Link>
                        ) : (
                          <span className="faint">Deleted item</span>
                        )}
                        <div className="small faint">{item?.inventoryNumber}</div>
                      </td>
                      <td>
                        <span className={`log-type t-${n.type}`}>{noteTypeLabels[n.type]}</span>
                      </td>
                      <td className="small">{n.text}</td>
                      <td className="minor small">{v ? <Link to={`/volunteers/${v.id}`}>{volunteerName(v)}</Link> : <span className="faint">—</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="small faint center pad">
            Showing {Math.min(limit, rows.length)} of {rows.length} entries.{' '}
            {rows.length > limit && (
              <button className="btn btn-ghost btn-sm" onClick={() => setLimit(limit + PAGE)}>
                Show more
              </button>
            )}
          </p>
        </>
      )}
    </>
  );
}

/** Local calendar day of an ISO timestamp. */
export function toLocalDay(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

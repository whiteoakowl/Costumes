import { useEffect, useState, type ReactNode } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Image as ImageIcon, Printer } from 'lucide-react';
import { useDb } from '../data/store';
import {
  accessoriesFor,
  ageFromBirthday,
  availableSlots,
  buildOverview,
  buildPropOverview,
  byId,
  castsFor,
  dancerCostumes,
  dancerParticipation,
  formatDate,
  formatDateTime,
  formatTime,
  fullName,
  issueLabels,
  itemsOf,
  kindOf,
  ownerCostumeIds,
  showDateLabel,
  slotLabel,
  sortedCategories,
  sortedDancers,
  sortedLocations,
  sortedSlots,
  volunteerName,
} from '../data/selectors';
import { isOpenOrder, noteTypeLabels, workStatusLabels, workTypeLabels } from '../data/workflow';
import { progressReasonLabels } from '../data/actions';
import { itemLabels } from '../lib/labels';
import { Avatar } from '../components/photos';
import { usePhotoUrl } from '../lib/images';
import { photosFor } from '../components/photos';
import { formatLocal } from '../components/work';
import { toLocalDay } from './Repairs';
import type { Costume, Database, ID, ItemKind, OwnerType } from '../data/types';

/* -------------------------------------------------------------- opening */

export type ReportKey =
  | 'dancers'
  | 'dancer'
  | 'costumes'
  | 'item'
  | 'repairs'
  | 'log'
  | 'shows'
  | 'show'
  | 'casts'
  | 'performances'
  | 'performance'
  | 'volunteers'
  | 'storage';

/** Open a printable report in a new tab (falls back to the same tab if pop-ups are blocked). */
export function openPrint(report: ReportKey, params: Record<string, string | undefined> = {}) {
  const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v) as [string, string][]).toString();
  const url = `${location.pathname}${location.search}#/print/${report}${qs ? `?${qs}` : ''}`;
  const w = window.open(url, '_blank');
  if (!w) location.hash = `#/print/${report}${qs ? `?${qs}` : ''}`;
}

/* ---------------------------------------------------------------- shell */

function PrintShell({ title, subtitle, children, photos, setPhotos }: { title: string; subtitle?: ReactNode; children: ReactNode; photos?: boolean; setPhotos?: (v: boolean) => void }) {
  const db = useDb();
  useEffect(() => {
    document.title = `${title} — ${db.settings.studioName}`;
    return () => {
      document.title = 'Studio Costume Manager';
    };
  }, [title, db.settings.studioName]);
  return (
    <div className="print-root">
      <div className="print-toolbar no-print">
        <button className="btn btn-ghost" onClick={() => (window.opener ? window.close() : history.back())}>
          <ArrowLeft size={16} /> {window.opener ? 'Close' : 'Back'}
        </button>
        <div className="print-toolbar-mid">
          {setPhotos && (
            <label className="check-inline">
              <input type="checkbox" checked={!!photos} onChange={(e) => setPhotos(e.target.checked)} />
              <ImageIcon size={15} /> Include photos
            </label>
          )}
          <span className="small faint">Tip: choose “Save as PDF” as the printer to create a PDF.</span>
        </div>
        <button className="btn btn-primary" onClick={() => window.print()}>
          <Printer size={16} /> Print / Save as PDF
        </button>
      </div>
      <article className="sheet">
        <header className="sheet-header">
          <div>
            <div className="sheet-studio">{db.settings.studioName}</div>
            <h1>{title}</h1>
            {subtitle && <div className="sheet-sub">{subtitle}</div>}
          </div>
          <div className="sheet-date">Printed {formatDateTime(new Date().toISOString())}</div>
        </header>
        {children}
      </article>
    </div>
  );
}

function Thumb({ ownerType, ownerId, show }: { ownerType: 'item' | 'dancer'; ownerId: ID; show?: boolean }) {
  if (!show) return null;
  return (
    <td className="p-thumb">
      <Avatar ownerType={ownerType} ownerId={ownerId} size={44} fallback={<span />} />
    </td>
  );
}

function PhotoStrip({ ownerType, ownerId }: { ownerType: 'item' | 'dancer'; ownerId: ID }) {
  const db = useDb();
  const photos = photosFor(db.photos ?? [], ownerType, ownerId).slice(0, 4);
  if (!photos.length) return null;
  return (
    <div className="p-photos">
      {photos.map((p) => (
        <PrintPhoto key={p.id} id={p.id} caption={p.caption} />
      ))}
    </div>
  );
}

function PrintPhoto({ id, caption }: { id: ID; caption: string }) {
  const url = usePhotoUrl(id, 'full');
  return (
    <figure>
      {url ? <img src={url} alt={caption} /> : <div className="img-loading" />}
      {caption && <figcaption>{caption}</figcaption>}
    </figure>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="p-empty">{children}</p>;
}

const statusText = (c: Pick<Costume, 'status' | 'progressReason'>) => (c.status === 'ready' ? 'READY' : `IN PROGRESS${c.progressReason ? ` (${progressReasonLabels[c.progressReason]})` : ''}`);

/* ---------------------------------------------------------------- router */

export function PrintPage() {
  const { report } = useParams();
  const [params] = useSearchParams();
  const [photos, setPhotos] = useState(params.get('photos') !== '0');
  const db = useDb();
  const p = (k: string) => params.get(k) ?? '';
  const props = { db, p, photos, setPhotos };
  switch (report as ReportKey) {
    case 'dancers':
      return <DancersReport {...props} />;
    case 'dancer':
      return <DancerReport {...props} />;
    case 'costumes':
      return <InventoryReport {...props} />;
    case 'item':
      return <ItemReport {...props} />;
    case 'repairs':
      return <RepairsReport {...props} />;
    case 'log':
      return <LogReport {...props} />;
    case 'shows':
      return <ShowsReport {...props} />;
    case 'show':
      return <OwnerReport {...props} ownerType="show" />;
    case 'performance':
      return <OwnerReport {...props} ownerType="performance" />;
    case 'casts':
      return <CastReport {...props} />;
    case 'performances':
      return <PerformancesReport {...props} />;
    case 'volunteers':
      return <VolunteersReport {...props} />;
    case 'storage':
      return <StorageReport {...props} />;
    default:
      return (
        <PrintShell title="Report not found">
          <Empty>
            This report doesn't exist. <Link to="/reports">See all reports</Link>
          </Empty>
        </PrintShell>
      );
  }
}

interface RP {
  db: Database;
  p: (k: string) => string;
  photos: boolean;
  setPhotos: (v: boolean) => void;
}

/* --------------------------------------------------------------- dancers */

function DancersReport({ db, p, photos, setPhotos }: RP) {
  const level = p('level');
  const list = sortedDancers(db).filter((d) => !level || d.level === level);
  return (
    <PrintShell title="Dancer List" subtitle={`${list.length} dancers${level ? ` · ${level}` : ''}`} photos={photos} setPhotos={setPhotos}>
      {!list.length ? (
        <Empty>No dancers.</Empty>
      ) : (
        <table className="p-table">
          <thead>
            <tr>
              {photos && <th />}
              <th>Name</th>
              <th>Age</th>
              <th>Birthday</th>
              <th>Level</th>
              <th>Pointe</th>
              <th>Clothing</th>
              <th>Costume</th>
              <th>Shoe</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {list.map((d) => (
              <tr key={d.id}>
                <Thumb ownerType="dancer" ownerId={d.id} show={photos} />
                <td className="strong">{fullName(d)}</td>
                <td>{ageFromBirthday(d.birthday) ?? ''}</td>
                <td>{formatDate(d.birthday)}</td>
                <td>{d.level}</td>
                <td>{d.pointe ? 'Pointe' : 'No'}</td>
                <td>{d.clothingSize}</td>
                <td>{d.costumeSize}</td>
                <td>{d.shoeSize}</td>
                <td className="p-notes">{d.notes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </PrintShell>
  );
}

function DancerReport({ db, p, photos, setPhotos }: RP) {
  const d = db.dancers.find((x) => x.id === p('id'));
  if (!d) return <PrintShell title="Dancer not found">{null}</PrintShell>;
  const items = dancerCostumes(db, d.id);
  const parts = dancerParticipation(db, d.id);
  return (
    <PrintShell title={fullName(d)} subtitle={[d.level, ageFromBirthday(d.birthday) !== null ? `Age ${ageFromBirthday(d.birthday)}` : '', d.pointe ? 'Pointe' : ''].filter(Boolean).join(' · ')} photos={photos} setPhotos={setPhotos}>
      {photos && <PhotoStrip ownerType="dancer" ownerId={d.id} />}
      <dl className="p-dl">
        <dt>Birthday</dt>
        <dd>{formatDate(d.birthday) || '—'}</dd>
        <dt>Clothing size</dt>
        <dd>{d.clothingSize || '—'}</dd>
        <dt>Costume size</dt>
        <dd>{d.costumeSize || '—'}</dd>
        <dt>Shoe size</dt>
        <dd>{d.shoeSize || '—'}</dd>
        <dt>Notes</dt>
        <dd>{d.notes || '—'}</dd>
      </dl>
      <h2>Costumes & Props</h2>
      {!items.length ? (
        <Empty>Nothing assigned.</Empty>
      ) : (
        <table className="p-table">
          <thead>
            <tr>
              <th>Item</th>
              <th>Type</th>
              <th>Show / Performance</th>
              <th>Cast</th>
              <th>Size</th>
              <th>Status</th>
              <th className="p-check">✓</th>
            </tr>
          </thead>
          <tbody>
            {items.map((x, i) => (
              <tr key={i}>
                <td className="strong">
                  {x.costume.name} <span className="faint">{x.costume.inventoryNumber}</span>
                </td>
                <td>{itemLabels[kindOf(x.costume)].One}</td>
                <td>{x.ownerName}</td>
                <td>
                  {x.castName}
                  {x.role && ` · ${x.role}`}
                </td>
                <td>{kindOf(x.costume) === 'costume' ? x.costume.size : ''}</td>
                <td>{statusText(x.costume)}</td>
                <td className="p-check">☐</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <h2>Shows & Performances</h2>
      {!parts.length ? (
        <Empty>Not in any cast lists.</Empty>
      ) : (
        <ul className="p-list">
          {parts.map((x) => (
            <li key={x.membership.id}>
              {x.ownerName} — {x.cast.name}
              {x.membership.role && ` (${x.membership.role})`}
            </li>
          ))}
        </ul>
      )}
    </PrintShell>
  );
}

/* ------------------------------------------------------------- inventory */

function InventoryReport({ db, p, photos, setPhotos }: RP) {
  const kind = (p('kind') || 'costume') as ItemKind;
  const L = itemLabels[kind];
  const cats = byId(db.categories);
  const locs = byId(db.storageLocations);
  const status = p('status');
  const list = itemsOf(db, kind)
    .filter((c) => (!p('category') || c.categoryId === p('category')) && (!p('location') || c.storageLocationId === p('location')) && (!status || c.status === status))
    .sort((a, b) => a.inventoryNumber.localeCompare(b.inventoryNumber));
  const groupBy = p('group') || 'category';
  const groups =
    groupBy === 'location'
      ? [...sortedLocations(db).map((l) => ({ key: l.id, label: l.name })), { key: '', label: 'Unassigned' }].map((g) => ({ ...g, rows: list.filter((c) => (c.storageLocationId ?? '') === g.key) }))
      : [...sortedCategories(db).map((c) => ({ key: c.id, label: c.name })), { key: '', label: 'Uncategorized' }].map((g) => ({ ...g, rows: list.filter((c) => (c.categoryId ?? '') === g.key) }));
  const filters = [p('category') && cats.get(p('category'))?.name, p('location') && locs.get(p('location'))?.name, status && (status === 'ready' ? 'Ready only' : 'In progress only')].filter(Boolean).join(' · ');
  return (
    <PrintShell title={`${L.One} List`} subtitle={`${list.length} ${L.many}${filters ? ` · ${filters}` : ''} · grouped by ${groupBy === 'location' ? 'storage location' : 'show type'}`} photos={photos} setPhotos={setPhotos}>
      {!list.length && <Empty>No {L.many} match.</Empty>}
      {groups
        .filter((g) => g.rows.length)
        .map((g) => (
          <section key={g.key || 'none'} className="p-section">
            <h2>
              {g.label} <span className="faint">({g.rows.length})</span>
            </h2>
            <table className="p-table">
              <thead>
                <tr>
                  {photos && <th />}
                  <th>ID</th>
                  <th>{L.One}</th>
                  {kind === 'costume' && <th>Size</th>}
                  <th>Qty</th>
                  <th>{L.parts}</th>
                  <th>{groupBy === 'location' ? 'Show type' : 'Location'}</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {g.rows.map((c) => (
                  <tr key={c.id}>
                    <Thumb ownerType="item" ownerId={c.id} show={photos} />
                    <td className="nowrap">{c.inventoryNumber}</td>
                    <td>
                      <span className="strong">{c.name}</span>
                      {c.description && <div className="p-notes">{c.description}</div>}
                    </td>
                    {kind === 'costume' && <td>{c.size}</td>}
                    <td>{c.quantity}</td>
                    <td className="p-notes">
                      {accessoriesFor(db, c.id)
                        .map((a) => `${a.name} ×${a.quantity}${a.quantity <= 0 ? ' (missing)' : ''}`)
                        .join(', ')}
                    </td>
                    <td>{groupBy === 'location' ? cats.get(c.categoryId ?? '')?.name ?? '' : locs.get(c.storageLocationId ?? '')?.name ?? 'Unassigned'}</td>
                    <td>
                      {statusText(c)}
                      {c.status === 'in_progress' && c.repairNotes && <div className="p-notes">{c.repairNotes}</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ))}
    </PrintShell>
  );
}

function ItemReport({ db, p, photos, setPhotos }: RP) {
  const c = db.costumes.find((x) => x.id === p('id'));
  if (!c) return <PrintShell title="Item not found">{null}</PrintShell>;
  const L = itemLabels[kindOf(c)];
  const cat = db.categories.find((x) => x.id === c.categoryId);
  const loc = db.storageLocations.find((x) => x.id === c.storageLocationId);
  const notes = db.costumeNotes.filter((n) => n.costumeId === c.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const work = db.workOrders.filter((w) => w.costumeId === c.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return (
    <PrintShell title={c.name} subtitle={`${L.One} ${c.inventoryNumber} · ${statusText(c)}`} photos={photos} setPhotos={setPhotos}>
      {photos && <PhotoStrip ownerType="item" ownerId={c.id} />}
      <dl className="p-dl">
        <dt>Show type</dt>
        <dd>{cat?.name ?? 'Uncategorized'}</dd>
        {kindOf(c) === 'costume' && (
          <>
            <dt>Size</dt>
            <dd>{c.size || '—'}</dd>
          </>
        )}
        <dt>Quantity</dt>
        <dd>{c.quantity}</dd>
        <dt>Storage</dt>
        <dd>{loc?.name ?? 'Unassigned'}</dd>
        <dt>Date added</dt>
        <dd>{formatDate(c.dateAdded)}</dd>
        <dt>{L.parts}</dt>
        <dd>{accessoriesFor(db, c.id).map((a) => `${a.name} ×${a.quantity}`).join(', ') || '—'}</dd>
        <dt>Description</dt>
        <dd>{c.description || '—'}</dd>
        <dt>Repair notes</dt>
        <dd>{c.repairNotes || '—'}</dd>
        <dt>Notes</dt>
        <dd>{c.notes || '—'}</dd>
      </dl>
      <h2>Repair & Cleaning History</h2>
      {!work.length ? <Empty>No work orders.</Empty> : <WorkTable db={db} orders={work} showItem={false} />}
      <h2>Notes & History Log</h2>
      <LogTable db={db} notes={notes} showItem={false} />
    </PrintShell>
  );
}

/* ---------------------------------------------------- repairs & the log */

function WorkTable({ db, orders, showItem = true }: { db: Database; orders: Database['workOrders']; showItem?: boolean }) {
  const items = byId(db.costumes);
  const vols = byId(db.volunteers);
  return (
    <table className="p-table">
      <thead>
        <tr>
          {showItem && <th>Item</th>}
          <th>Work</th>
          <th>Volunteer</th>
          <th>Logged</th>
          <th>Scheduled</th>
          <th>Due</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        {orders.map((w) => {
          const item = items.get(w.costumeId);
          const v = w.volunteerId ? vols.get(w.volunteerId) : undefined;
          return (
            <tr key={w.id}>
              {showItem && (
                <td>
                  <span className="strong">{item?.name}</span>
                  <div className="p-notes">
                    {item?.inventoryNumber}
                    {w.pieces > 1 && ` · ${w.pieces} pcs`}
                    {item && ` · ${db.storageLocations.find((l) => l.id === item.storageLocationId)?.name ?? 'No location'}`}
                  </div>
                </td>
              )}
              <td>
                <strong>{workTypeLabels[w.type]}</strong>
                {w.description && <div className="p-notes">{w.description}</div>}
                {w.completionNote && <div className="p-notes">Done: {w.completionNote}</div>}
              </td>
              <td>
                {v ? volunteerName(v) : '—'}
                {v?.phone && <div className="p-notes">{v.phone}</div>}
              </td>
              <td className="nowrap">{formatDate(w.createdAt)}</td>
              <td>{formatLocal(w.scheduledAt)}</td>
              <td>{formatDate(w.dueDate)}</td>
              <td>
                {workStatusLabels[w.status]}
                {w.completedAt && !isOpenOrder(w) && <div className="p-notes">{formatLocal(w.completedAt)}</div>}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function RepairsReport({ db, p }: RP) {
  const done = p('status') === 'done';
  const list = db.workOrders
    .filter((w) => (done ? !isOpenOrder(w) : isOpenOrder(w)))
    .sort((a, b) => (done ? b.completedAt.localeCompare(a.completedAt) : (a.dueDate || '9999').localeCompare(b.dueDate || '9999')));
  const types = [...new Set(list.map((w) => w.type))];
  return (
    <PrintShell title={done ? 'Completed Repairs & Cleaning' : 'Repair & Cleaning List'} subtitle={`${list.length} work order${list.length === 1 ? '' : 's'}`}>
      {!list.length && <Empty>Nothing to show.</Empty>}
      {types.map((t) => (
        <section key={t} className="p-section">
          <h2>{workTypeLabels[t]}</h2>
          <WorkTable db={db} orders={list.filter((w) => w.type === t)} />
        </section>
      ))}
    </PrintShell>
  );
}

function LogTable({ db, notes, showItem = true }: { db: Database; notes: Database['costumeNotes']; showItem?: boolean }) {
  const items = byId(db.costumes);
  const vols = byId(db.volunteers);
  if (!notes.length) return <Empty>No entries.</Empty>;
  return (
    <table className="p-table">
      <thead>
        <tr>
          <th>Date & time</th>
          {showItem && <th>Item</th>}
          <th>Type</th>
          <th>Entry</th>
          <th>Volunteer</th>
        </tr>
      </thead>
      <tbody>
        {notes.map((n) => (
          <tr key={n.id}>
            <td className="nowrap">{formatDateTime(n.createdAt)}</td>
            {showItem && (
              <td>
                {items.get(n.costumeId)?.name ?? 'Deleted item'} <span className="faint">{items.get(n.costumeId)?.inventoryNumber}</span>
              </td>
            )}
            <td>{noteTypeLabels[n.type]}</td>
            <td>{n.text}</td>
            <td>{n.volunteerId ? volunteerName(vols.get(n.volunteerId) ?? { firstName: '', lastName: '' }) : ''}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function LogReport({ db, p }: RP) {
  const items = byId(db.costumes);
  const [q, type, vol, from, to] = ['q', 'type', 'vol', 'from', 'to'].map(p);
  const notes = db.costumeNotes
    .filter((n) => {
      const day = toLocalDay(n.createdAt);
      if (type === 'work' ? !n.workOrderId : type && n.type !== type) return false;
      if (vol && n.volunteerId !== vol) return false;
      if (from && day < from) return false;
      if (to && day > to) return false;
      if (q && !`${items.get(n.costumeId)?.name ?? ''} ${n.text}`.toLowerCase().includes(q.toLowerCase())) return false;
      return true;
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const range = from || to ? `${from ? formatDate(from) : 'start'} – ${to ? formatDate(to) : 'today'}` : 'All dates';
  return (
    <PrintShell title="Activity Log" subtitle={`${notes.length} entries · ${range}${type ? ` · ${type === 'work' ? 'Repair & cleaning jobs' : noteTypeLabels[type as keyof typeof noteTypeLabels]}` : ''}`}>
      <LogTable db={db} notes={notes} />
    </PrintShell>
  );
}

/* ---------------------------------------------------------- shows & perfs */

function ShowsReport({ db }: RP) {
  const cats = byId(db.categories);
  const list = [...db.shows].sort((a, b) => (a.startDate || '9999').localeCompare(b.startDate || '9999'));
  return (
    <PrintShell title="Show List" subtitle={`${list.length} shows`}>
      <table className="p-table">
        <thead>
          <tr>
            <th>Show</th>
            <th>Type</th>
            <th>Date(s)</th>
            <th>Venue</th>
            <th>Status</th>
            <th>Casts</th>
            <th>Dancers</th>
            <th>Costumes</th>
            <th>Props</th>
          </tr>
        </thead>
        <tbody>
          {list.map((s) => {
            const casts = castsFor(db, 'show', s.id);
            const dancers = new Set(db.castMembers.filter((m) => casts.some((c) => c.id === m.castId)).map((m) => m.dancerId)).size;
            return (
              <tr key={s.id}>
                <td>
                  <span className="strong">{s.name}</span>
                  {s.description && <div className="p-notes">{s.description}</div>}
                </td>
                <td>{cats.get(s.categoryId ?? '')?.name}</td>
                <td>{showDateLabel(s)}</td>
                <td>{s.venue}</td>
                <td>{s.status[0].toUpperCase() + s.status.slice(1)}</td>
                <td>{casts.length}</td>
                <td>{dancers}</td>
                <td>{ownerCostumeIds(db, 'show', s.id).length}</td>
                <td>{ownerCostumeIds(db, 'show', s.id, 'prop').length}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </PrintShell>
  );
}

function PerformancesReport({ db }: RP) {
  const shows = byId(db.shows);
  const list = [...db.performances].sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999'));
  return (
    <PrintShell title="Performance Schedule" subtitle={`${list.length} performance plans`}>
      <table className="p-table">
        <thead>
          <tr>
            <th>Performance</th>
            <th>Show</th>
            <th>Date</th>
            <th>Call</th>
            <th>Curtain</th>
            <th>Dress rehearsal</th>
            <th>Venue</th>
            <th>Ready</th>
          </tr>
        </thead>
        <tbody>
          {list.map((x) => {
            const r = buildOverview(db, 'performance', x.id).readiness;
            return (
              <tr key={x.id}>
                <td className="strong">{x.name}</td>
                <td>{shows.get(x.showId ?? '')?.name}</td>
                <td className="nowrap">{formatDate(x.date)}</td>
                <td>{formatTime(x.callTime)}</td>
                <td>{formatTime(x.time)}</td>
                <td>{x.dressRehearsal ? formatDateTime(x.dressRehearsal) : ''}</td>
                <td>
                  {x.venue}
                  {x.address && <div className="p-notes">{x.address}</div>}
                </td>
                <td>{r.percent === null ? '—' : `${r.percent}%`}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </PrintShell>
  );
}

/** Costume & prop lines for every member of a cast. */
function castLines(db: Database, ownerType: OwnerType, ownerId: ID) {
  const { rows } = buildOverview(db, ownerType, ownerId);
  const propRows = buildPropOverview(db, ownerType, ownerId).rows;
  return (castId: ID, dancerId: ID) => ({
    costumes: rows.filter((r) => r.castId === castId && r.dancerId === dancerId && r.costume),
    props: propRows.filter((r) => r.castId === castId && (r.dancerId === dancerId || r.target === 'cast')),
    issues: [...new Set(rows.filter((r) => r.castId === castId && r.dancerId === dancerId).flatMap((r) => r.issues.map((i) => issueLabels[i])))],
  });
}

function CastTables({ db, ownerType, ownerId, onlyCast, photos }: { db: Database; ownerType: OwnerType; ownerId: ID; onlyCast?: string; photos: boolean }) {
  const casts = castsFor(db, ownerType, ownerId).filter((c) => !onlyCast || c.id === onlyCast);
  const dancers = byId(db.dancers);
  const lines = castLines(db, ownerType, ownerId);
  if (!casts.length) return <Empty>No cast lists yet.</Empty>;
  return (
    <>
      {casts.map((cast) => {
        const members = db.castMembers
          .filter((m) => m.castId === cast.id && dancers.has(m.dancerId))
          .sort((a, b) => fullName(dancers.get(a.dancerId)!).localeCompare(fullName(dancers.get(b.dancerId)!)));
        return (
          <section key={cast.id} className="p-section p-cast">
            <h2>
              {cast.name} <span className="faint">({members.length} dancers)</span>
            </h2>
            {!members.length ? (
              <Empty>No dancers.</Empty>
            ) : (
              <table className="p-table">
                <thead>
                  <tr>
                    {photos && <th />}
                    <th>Dancer</th>
                    <th>Role</th>
                    <th>Size</th>
                    <th>Costumes</th>
                    <th>Props</th>
                    <th className="p-check">✓</th>
                  </tr>
                </thead>
                <tbody>
                  {members.map((m) => {
                    const d = dancers.get(m.dancerId)!;
                    const l = lines(cast.id, d.id);
                    return (
                      <tr key={m.id}>
                        <Thumb ownerType="dancer" ownerId={d.id} show={photos} />
                        <td>
                          <span className="strong">{fullName(d)}</span>
                          <div className="p-notes">{d.level}</div>
                        </td>
                        <td>{m.role}</td>
                        <td className="nowrap">{d.costumeSize}</td>
                        <td>
                          {l.costumes.length
                            ? l.costumes.map((r) => (
                                <div key={r.key}>
                                  {r.costume!.name} <span className="faint">{r.costume!.inventoryNumber}</span>
                                  {r.costume!.status !== 'ready' && <span className="p-flag"> · in progress</span>}
                                </div>
                              ))
                            : <span className="p-flag">No costume</span>}
                          {l.issues.filter((i) => i !== issueLabels.no_costume && i !== issueLabels.not_ready).length > 0 && (
                            <div className="p-notes">⚠ {l.issues.filter((i) => i !== issueLabels.no_costume && i !== issueLabels.not_ready).join(', ')}</div>
                          )}
                        </td>
                        <td>
                          {l.props.map((r) => (
                            <div key={r.key}>
                              {r.prop.name}
                              {r.target === 'cast' && <span className="faint"> (cast)</span>}
                            </div>
                          ))}
                        </td>
                        <td className="p-check">☐</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </section>
        );
      })}
    </>
  );
}

function CastReport({ db, p, photos, setPhotos }: RP) {
  const ownerType = (p('owner') || 'show') as OwnerType;
  const ownerId = p('id');
  const owner = ownerType === 'show' ? db.shows.find((s) => s.id === ownerId) : db.performances.find((x) => x.id === ownerId);
  if (!owner) return <PrintShell title="Not found">{null}</PrintShell>;
  const cast = p('cast') ? db.casts.find((c) => c.id === p('cast')) : undefined;
  return (
    <PrintShell title={cast ? `${cast.name} — Cast List` : 'Cast Lists'} subtitle={owner.name} photos={photos} setPhotos={setPhotos}>
      <CastTables db={db} ownerType={ownerType} ownerId={ownerId} onlyCast={p('cast') || undefined} photos={photos} />
    </PrintShell>
  );
}

function OwnerReport({ db, p, photos, setPhotos, ownerType }: RP & { ownerType: OwnerType }) {
  const id = p('id');
  const show = ownerType === 'show' ? db.shows.find((s) => s.id === id) : undefined;
  const perf = ownerType === 'performance' ? db.performances.find((x) => x.id === id) : undefined;
  const owner = show ?? perf;
  if (!owner) return <PrintShell title="Not found">{null}</PrintShell>;
  const { readiness } = buildOverview(db, ownerType, id);
  const costumeIds = ownerCostumeIds(db, ownerType, id);
  const propOverview = buildPropOverview(db, ownerType, id);
  const locs = byId(db.storageLocations);
  const parentShow = perf?.showId ? db.shows.find((s) => s.id === perf.showId) : undefined;
  const subtitle = show
    ? [db.categories.find((c) => c.id === show.categoryId)?.name, showDateLabel(show), show.venue].filter(Boolean).join(' · ')
    : [parentShow?.name, formatDate(perf!.date), perf!.time && formatTime(perf!.time), perf!.venue].filter(Boolean).join(' · ');
  const volunteers = perf?.date ? db.volunteers.filter((v) => availableSlots(v, perf.date, perf.callTime || perf.time || undefined).length) : [];
  return (
    <PrintShell title={owner.name} subtitle={subtitle} photos={photos} setPhotos={setPhotos}>
      <div className="p-summary">
        {perf && (
          <dl className="p-dl">
            <dt>Call time</dt>
            <dd>{formatTime(perf.callTime) || '—'}</dd>
            <dt>Curtain</dt>
            <dd>{formatTime(perf.time) || '—'}</dd>
            <dt>Dress rehearsal</dt>
            <dd>{perf.dressRehearsal ? formatDateTime(perf.dressRehearsal) : '—'}</dd>
            <dt>Venue</dt>
            <dd>
              {perf.venue}
              {perf.address && `, ${perf.address}`}
            </dd>
            <dt>Notes</dt>
            <dd>{perf.notes || '—'}</dd>
            <dt>Details</dt>
            <dd>{perf.details || '—'}</dd>
          </dl>
        )}
        {show && (
          <dl className="p-dl">
            <dt>Status</dt>
            <dd>{show.status}</dd>
            <dt>Description</dt>
            <dd>{show.description || '—'}</dd>
            <dt>Notes</dt>
            <dd>{show.notes || '—'}</dd>
          </dl>
        )}
        <div className="p-ready">
          <strong>{readiness.percent === null ? '—' : `${readiness.percent}%`}</strong> costumes ready
          <div>
            {readiness.totalDancers} dancers · {readiness.totalAssignments} costume assignments · {readiness.needsWork} need repairs · {readiness.missingAssignments} missing
          </div>
          <div>
            {propOverview.readiness.total} props · {propOverview.readiness.needsWork} in progress
          </div>
        </div>
      </div>
      <h2>Cast Lists</h2>
      <CastTables db={db} ownerType={ownerType} ownerId={id} photos={photos} />
      <section className="p-section p-break">
        <h2>Costume List</h2>
        {!costumeIds.length ? (
          <Empty>No costumes.</Empty>
        ) : (
          <table className="p-table">
            <thead>
              <tr>
                {photos && <th />}
                <th>ID</th>
                <th>Costume</th>
                <th>Size</th>
                <th>Qty</th>
                <th>Accessories</th>
                <th>Location</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {db.costumes
                .filter((c) => costumeIds.includes(c.id))
                .map((c) => (
                  <tr key={c.id}>
                    <Thumb ownerType="item" ownerId={c.id} show={photos} />
                    <td>{c.inventoryNumber}</td>
                    <td className="strong">{c.name}</td>
                    <td>{c.size}</td>
                    <td>{c.quantity}</td>
                    <td className="p-notes">{accessoriesFor(db, c.id).map((a) => `${a.name} ×${a.quantity}`).join(', ')}</td>
                    <td>{locs.get(c.storageLocationId ?? '')?.name ?? ''}</td>
                    <td>{statusText(c)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        )}
      </section>
      <section className="p-section">
        <h2>Props</h2>
        {!propOverview.rows.length ? (
          <Empty>No props.</Empty>
        ) : (
          <table className="p-table">
            <thead>
              <tr>
                <th>Prop</th>
                <th>Assigned to</th>
                <th>Cast</th>
                <th>Location</th>
                <th>Status</th>
                <th className="p-check">✓</th>
              </tr>
            </thead>
            <tbody>
              {propOverview.rows.map((r) => (
                <tr key={r.key}>
                  <td>
                    <span className="strong">{r.prop.name}</span> <span className="faint">{r.prop.inventoryNumber}</span>
                  </td>
                  <td>{r.target === 'dancer' ? r.dancerName : r.target === 'cast' ? 'Whole cast' : 'Stage / set'}</td>
                  <td>{r.castName}</td>
                  <td>{locs.get(r.prop.storageLocationId ?? '')?.name ?? ''}</td>
                  <td>{statusText(r.prop)}</td>
                  <td className="p-check">☐</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      {perf && (
        <section className="p-section">
          <h2>Volunteers Available</h2>
          {!volunteers.length ? (
            <Empty>No volunteers have marked themselves available.</Empty>
          ) : (
            <table className="p-table">
              <thead>
                <tr>
                  <th>Volunteer</th>
                  <th>Phone</th>
                  <th>Email</th>
                  <th>Skills</th>
                  <th>Available</th>
                </tr>
              </thead>
              <tbody>
                {volunteers.map((v) => (
                  <tr key={v.id}>
                    <td className="strong">{volunteerName(v)}</td>
                    <td className="nowrap">{v.phone}</td>
                    <td>{v.email}</td>
                    <td>{v.skills.join(', ')}</td>
                    <td>{availableSlots(v, perf.date, perf.callTime || perf.time || undefined).map(slotLabel).join('; ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}
    </PrintShell>
  );
}

/* ------------------------------------------------ volunteers & storage */

function VolunteersReport({ db }: RP) {
  const list = [...db.volunteers].sort((a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName));
  const open = db.workOrders.filter(isOpenOrder);
  return (
    <PrintShell title="Volunteer Contact List" subtitle={`${list.length} volunteers`}>
      <table className="p-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Phone</th>
            <th>Email</th>
            <th>Prefers</th>
            <th>Skills</th>
            <th>Availability</th>
            <th>Open jobs</th>
          </tr>
        </thead>
        <tbody>
          {list.map((v) => (
            <tr key={v.id}>
              <td className="strong">{volunteerName(v)}</td>
              <td className="nowrap">{v.phone}</td>
              <td>{v.email}</td>
              <td>{v.preferredContact}</td>
              <td>{v.skills.join(', ')}</td>
              <td className="p-notes">
                {sortedSlots(v).map((s) => (
                  <div key={s.id}>
                    {slotLabel(s)}
                    {s.note && ` (${s.note})`}
                  </div>
                ))}
              </td>
              <td>{open.filter((w) => w.volunteerId === v.id).length || ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </PrintShell>
  );
}

function StorageReport({ db, p, photos, setPhotos }: RP) {
  const locs = sortedLocations(db).filter((l) => !p('id') || l.id === p('id'));
  const unassigned = p('id') ? [] : db.costumes.filter((c) => !c.storageLocationId);
  const groups = [...locs.map((l) => ({ key: l.id, title: l.name, sub: [l.unitNumber, l.description].filter(Boolean).join(' · '), rows: db.costumes.filter((c) => c.storageLocationId === l.id) })), ...(unassigned.length ? [{ key: 'none', title: 'Unassigned', sub: '', rows: unassigned }] : [])];
  return (
    <PrintShell title={locs.length === 1 && p('id') ? `${locs[0].name} — Inventory` : 'Storage Inventory'} subtitle="Costumes and props by storage location" photos={photos} setPhotos={setPhotos}>
      {groups.map((g) => (
        <section key={g.key} className="p-section">
          <h2>
            {g.title} <span className="faint">({g.rows.length})</span>
          </h2>
          {g.sub && <div className="p-notes">{g.sub}</div>}
          {!g.rows.length ? (
            <Empty>Empty.</Empty>
          ) : (
            <table className="p-table">
              <thead>
                <tr>
                  {photos && <th />}
                  <th>ID</th>
                  <th>Item</th>
                  <th>Type</th>
                  <th>Size</th>
                  <th>Qty</th>
                  <th>Status</th>
                  <th className="p-check">✓</th>
                </tr>
              </thead>
              <tbody>
                {[...g.rows]
                  .sort((a, b) => a.inventoryNumber.localeCompare(b.inventoryNumber))
                  .map((c) => (
                    <tr key={c.id}>
                      <Thumb ownerType="item" ownerId={c.id} show={photos} />
                      <td className="nowrap">{c.inventoryNumber}</td>
                      <td className="strong">{c.name}</td>
                      <td>{itemLabels[kindOf(c)].One}</td>
                      <td>{kindOf(c) === 'costume' ? c.size : ''}</td>
                      <td>{c.quantity}</td>
                      <td>{statusText(c)}</td>
                      <td className="p-check">☐</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          )}
        </section>
      ))}
    </PrintShell>
  );
}

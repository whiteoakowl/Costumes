import { useState, type DragEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from '../lib/router';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CalendarHeart,
  CheckCircle2,
  ClipboardList,
  Clock,
  Coffee,
  GripVertical,
  ListOrdered,
  LogIn,
  LogOut,
  Music,
  PackageCheck,
  PackageOpen,
  Pencil,
  Plus,
  Printer,
  Repeat,
  ShieldCheck,
  Shirt,
  Sparkles,
  Theater,
  Trash2,
  Undo2,
  Users,
} from 'lucide-react';
import { useDb } from '../data/store';
import {
  addAllClassesToRecital,
  cancelCheckout,
  checkInLabels,
  checkOutReserved,
  clearCheckout,
  createCheckout,
  deleteBackstageRole,
  deleteLineupItem,
  deleteRecital,
  deleteRecitalNumber,
  lineupFromRecital,
  overrideConflict,
  removeOverride,
  reorderLineup,
  reorderNumbers,
  reserveForPerformance,
  returnCheckout,
  saveBackstageRole,
  saveLineupItem,
  savePerformanceExtras,
  saveQuickChange,
  saveRecital,
  saveRecitalNumber,
  setCheckIn,
  type CheckoutInput,
  type LineupInput,
  type NumberInput,
  type RecitalInput,
} from '../data/productionActions';
import { ACTIVE_CHECKOUT, availability, availabilityLabels, availableQty, classDancers, costumeConflicts, isCheckoutOverdue, quickChanges, showLength, timedLineup, type Availability } from '../data/platform';
import { formatDate, formatDateTime, formatTime, fullName } from '../data/selectors';
import { staffName } from '../data/studio';
import { todayStr } from '../data/ids';
import { Badge, Card, CheckList, DataTable, EmptyState, Field, PageHeader, SampleTag, SearchInput, SearchSelect, StatCard, Tabs, type Option } from '../components/ui';
import { FormModal } from '../components/forms';
import { useConfirm, useRun, useToast } from '../components/feedback';
import { classOptions, currentYear, useStaffOptions } from '../components/studioUi';
import { openPrint } from './Print';
import { clockAt } from './PrintPlatform';
import { useViewer } from '../lib/session';
import type { CheckInStatus, CostumeCheckout, Database, ID, LineupItem, Recital, RecitalNumber } from '../data/types';

const costumeOptions = (db: Database): Option[] =>
  db.costumes
    .filter((c) => c.kind !== 'prop')
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((c) => ({ value: c.id, label: c.name, hint: `${c.inventoryNumber} · ${availabilityLabels[availability(db, c.id)]} · ${availableQty(db, c.id)}/${c.quantity}` }));
const dancerOptions = (db: Database): Option[] => [...db.dancers].sort((a, b) => a.lastName.localeCompare(b.lastName)).map((d) => ({ value: d.id, label: fullName(d), hint: d.level }));
const recitalStatus: Record<Recital['status'], string> = { planning: 'Planning', active: 'In rehearsal', completed: 'Completed' };

/** Drag-and-drop reordering with keyboard-friendly up/down buttons as a fallback. */
function useReorder(ids: ID[], save: (ids: ID[]) => void) {
  const [drag, setDrag] = useState<ID | null>(null);
  const [over, setOver] = useState<ID | null>(null);
  const move = (id: ID, to: number) => {
    const next = ids.filter((x) => x !== id);
    next.splice(Math.max(0, Math.min(to, next.length)), 0, id);
    save(next);
  };
  const rowProps = (id: ID) => ({
    draggable: true,
    onDragStart: (e: DragEvent) => {
      setDrag(id);
      e.dataTransfer.effectAllowed = 'move';
    },
    onDragOver: (e: DragEvent) => {
      e.preventDefault();
      setOver(id);
    },
    onDragEnd: () => {
      setDrag(null);
      setOver(null);
    },
    onDrop: (e: DragEvent) => {
      e.preventDefault();
      if (drag && drag !== id) move(drag, ids.indexOf(id));
      setDrag(null);
      setOver(null);
    },
    className: `${drag === id ? 'dragging' : ''} ${over === id && drag !== id ? 'drop-target' : ''}`,
  });
  const up = (id: ID) => move(id, ids.indexOf(id) - 1);
  const down = (id: ID) => move(id, ids.indexOf(id) + 1);
  return { rowProps, up, down };
}

function MoveButtons({ id, ids, up, down }: { id: ID; ids: ID[]; up: (id: ID) => void; down: (id: ID) => void }) {
  return (
    <span className="move-btns">
      <GripVertical size={15} className="grip" aria-hidden />
      <button type="button" className="icon-btn" aria-label="Move up" disabled={ids[0] === id} onClick={() => up(id)}>
        <ArrowUp size={14} />
      </button>
      <button type="button" className="icon-btn" aria-label="Move down" disabled={ids[ids.length - 1] === id} onClick={() => down(id)}>
        <ArrowDown size={14} />
      </button>
    </span>
  );
}

/* =============================================================== recitals */

export function RecitalsPage() {
  const db = useDb();
  const v = useViewer();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const edit = v.can('productions.manage');
  const list = [...db.recitals].sort((a, b) => b.startDate.localeCompare(a.startDate));
  return (
    <>
      <PageHeader
        title="Recitals"
        subtitle="Recital themes, numbers, music, costumes and running orders"
        actions={
          edit && (
            <button className="btn btn-primary" onClick={() => setCreating(true)}>
              <Plus size={16} /> New recital
            </button>
          )
        }
      />
      {!list.length ? (
        <EmptyState icon={<Theater size={28} />} title="No recitals yet" message="Create a recital, add a number for each class, then build the running order for each performance." />
      ) : (
        <div className="card-grid">
          {list.map((r) => {
            const nums = db.recitalNumbers.filter((n) => n.recitalId === r.id);
            const perfs = r.showId ? db.performances.filter((p) => p.showId === r.showId) : [];
            return (
              <Link key={r.id} to={`/recitals/${r.id}`} className="card tile-link">
                <div className="tile-head">
                  <h3>{r.name}</h3>
                  <Badge tone={r.status === 'completed' ? 'neutral' : r.status === 'active' ? 'ready' : 'info'}>{recitalStatus[r.status]}</Badge>
                </div>
                {r.theme && <p className="small faint">Theme: {r.theme}</p>}
                <p className="small">
                  {formatDate(r.startDate)}
                  {r.endDate && r.endDate !== r.startDate ? ` – ${formatDate(r.endDate)}` : ''} · {r.venue || 'Venue TBA'}
                </p>
                <div className="tile-stats">
                  <span>
                    <strong>{nums.length}</strong> numbers
                  </span>
                  <span>
                    <strong>{perfs.length}</strong> performances
                  </span>
                  <span>
                    <strong>{nums.reduce((s, n) => s + n.durationMin, 0)}</strong> min
                  </span>
                </div>
                <SampleTag show={r.isSample} />
              </Link>
            );
          })}
        </div>
      )}
      <RecitalForm open={creating} onClose={() => setCreating(false)} onSaved={(id) => navigate(`/recitals/${id}`)} />
    </>
  );
}

function RecitalForm({ open, onClose, id, onSaved }: { open: boolean; onClose: () => void; id?: ID; onSaved?: (id: ID) => void }) {
  const db = useDb();
  const run = useRun();
  const blank = (): RecitalInput => ({ name: '', theme: '', schoolYearId: currentYear(db)?.id ?? null, showId: null, startDate: '', endDate: '', venue: '', address: '', performanceTimes: '', rehearsalSchedule: '', pictureDay: '', ticketInfo: '', notes: '', status: 'planning' });
  const [f, setF] = useState<RecitalInput>(blank);
  const [last, setLast] = useState<string | null>(null);
  const key = open ? id ?? 'new' : null;
  if (key !== last) {
    setLast(key);
    if (open) {
      const r = id ? db.recitals.find((x) => x.id === id) : undefined;
      setF(r ? { ...blank(), ...r } : blank());
    }
  }
  const set = (patch: Partial<RecitalInput>) => setF({ ...f, ...patch });
  return (
    <FormModal
      open={open}
      onClose={onClose}
      title={id ? 'Edit Recital' : 'New Recital'}
      size="lg"
      onSubmit={() => {
        const saved = run(() => saveRecital(f, id), id ? 'Recital saved.' : 'Recital created.');
        if (saved) {
          onClose();
          onSaved?.(saved);
        }
      }}
    >
      <div className="grid-2">
        <Field label="Recital name" required>
          <input className="input" value={f.name} onChange={(e) => set({ name: e.target.value })} autoFocus />
        </Field>
        <Field label="Theme">
          <input className="input" value={f.theme} onChange={(e) => set({ theme: e.target.value })} />
        </Field>
        <Field label="School year">
          <select className="input" value={f.schoolYearId ?? ''} onChange={(e) => set({ schoolYearId: e.target.value || null })}>
            <option value="">—</option>
            {db.schoolYears.map((y) => (
              <option key={y.id} value={y.id}>
                {y.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Linked show" hint="Its performances, casts and costume lists are used for running orders and conflicts.">
          <select className="input" value={f.showId ?? ''} onChange={(e) => set({ showId: e.target.value || null })}>
            <option value="">—</option>
            {db.shows.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Start date">
          <input className="input" type="date" value={f.startDate} onChange={(e) => set({ startDate: e.target.value })} />
        </Field>
        <Field label="End date">
          <input className="input" type="date" value={f.endDate} onChange={(e) => set({ endDate: e.target.value })} />
        </Field>
        <Field label="Venue">
          <input className="input" value={f.venue} onChange={(e) => set({ venue: e.target.value })} />
        </Field>
        <Field label="Address">
          <input className="input" value={f.address} onChange={(e) => set({ address: e.target.value })} />
        </Field>
        <Field label="Picture day">
          <input className="input" type="date" value={f.pictureDay} onChange={(e) => set({ pictureDay: e.target.value })} />
        </Field>
        <Field label="Status">
          <select className="input" value={f.status} onChange={(e) => set({ status: e.target.value as Recital['status'] })}>
            {Object.entries(recitalStatus).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Performance times">
        <textarea className="input" rows={2} value={f.performanceTimes} onChange={(e) => set({ performanceTimes: e.target.value })} />
      </Field>
      <Field label="Rehearsal schedule">
        <textarea className="input" rows={2} value={f.rehearsalSchedule} onChange={(e) => set({ rehearsalSchedule: e.target.value })} />
      </Field>
      <Field label="Ticket information">
        <textarea className="input" rows={2} value={f.ticketInfo} onChange={(e) => set({ ticketInfo: e.target.value })} />
      </Field>
      <Field label="Notes">
        <textarea className="input" rows={2} value={f.notes} onChange={(e) => set({ notes: e.target.value })} />
      </Field>
    </FormModal>
  );
}

export function RecitalDetailPage() {
  const { id } = useParams();
  const db = useDb();
  const v = useViewer();
  const run = useRun();
  const toast = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [num, setNum] = useState<ID | 'new' | null>(null);
  const [building, setBuilding] = useState(false);
  const r = db.recitals.find((x) => x.id === id);
  const nums = db.recitalNumbers.filter((n) => n.recitalId === id).sort((a, b) => a.order - b.order);
  const ids = nums.map((n) => n.id);
  const { rowProps, up, down } = useReorder(ids, (next) => run(() => reorderNumbers(next)));
  if (!r) return <EmptyState title="Recital not found" action={<Link to="/recitals" className="btn btn-primary">All recitals</Link>} />;
  const edit = v.can('productions.manage');
  const perfs = r.showId ? db.performances.filter((p) => p.showId === r.showId).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)) : [];
  const total = nums.reduce((s, n) => s + n.durationMin, 0);
  return (
    <>
      <PageHeader
        back={{ to: '/recitals', label: 'Recitals' }}
        title={
          <>
            {r.name} <SampleTag show={r.isSample} />
          </>
        }
        subtitle={[r.theme && `Theme: ${r.theme}`, formatDate(r.startDate), r.venue].filter(Boolean).join(' · ')}
        actions={
          edit && (
            <>
              <button className="btn btn-ghost danger" onClick={async () => { if (await confirm({ title: 'Delete recital?', message: 'Its numbers are deleted too. Costumes, classes and performances are not affected.', confirmLabel: 'Delete', danger: true })) if (run(() => (deleteRecital(r.id), true), 'Recital deleted.')) navigate('/recitals'); }}>
                <Trash2 size={16} /> Delete
              </button>
              <button className="btn btn-ghost" onClick={() => setEditing(true)}>
                <Pencil size={16} /> Edit
              </button>
              <button className="btn btn-primary" onClick={() => setBuilding(true)} disabled={!nums.length}>
                <ListOrdered size={16} /> Build running order
              </button>
            </>
          )
        }
      />
      <div className="stats stats-4">
        <StatCard label="Numbers" value={nums.length} icon={<Music size={20} />} tone="plum" />
        <StatCard label="Total dance time" value={`${total} min`} icon={<Clock size={20} />} tone="sage" />
        <StatCard label="Dancers" value={new Set(nums.flatMap((n) => (n.classId ? classDancers(db, n.classId) : n.teamId ? db.teams.find((t) => t.id === n.teamId)?.dancerIds ?? [] : []))).size} icon={<Users size={20} />} tone="amber" />
        <StatCard label="Costumes chosen" value={`${nums.filter((n) => n.costumeId).length}/${nums.length}`} icon={<Shirt size={20} />} tone="rose" />
      </div>
      <div className="detail-grid wide-right">
        <div className="stack">
          <Card title="Recital information">
            <dl className="dl">
              <dt>Status</dt>
              <dd>{recitalStatus[r.status]}</dd>
              <dt>Dates</dt>
              <dd>
                {formatDate(r.startDate) || '—'}
                {r.endDate && r.endDate !== r.startDate && ` – ${formatDate(r.endDate)}`}
              </dd>
              <dt>Venue</dt>
              <dd>
                {r.venue || '—'}
                {r.address && <div className="small faint">{r.address}</div>}
              </dd>
              {r.pictureDay && (
                <>
                  <dt>Picture day</dt>
                  <dd>{formatDate(r.pictureDay)}</dd>
                </>
              )}
              <dt>School year</dt>
              <dd>{db.schoolYears.find((y) => y.id === r.schoolYearId)?.name ?? '—'}</dd>
              <dt>Show</dt>
              <dd>{r.showId ? <Link to={`/shows/${r.showId}`}>{db.shows.find((s) => s.id === r.showId)?.name}</Link> : '—'}</dd>
            </dl>
            {r.performanceTimes && <p className="small prewrap"><strong>Performances:</strong> {r.performanceTimes}</p>}
            {r.rehearsalSchedule && <p className="small prewrap"><strong>Rehearsals:</strong> {r.rehearsalSchedule}</p>}
            {r.ticketInfo && <p className="small prewrap"><strong>Tickets:</strong> {r.ticketInfo}</p>}
            {r.notes && <p className="small prewrap">{r.notes}</p>}
          </Card>
          <Card title="Performances" icon={<CalendarHeart size={18} />}>
            {!perfs.length ? (
              <p className="faint pad small">Link this recital to a show with performances (Edit → Linked show) to build running orders.</p>
            ) : (
              <ul className="mini-list">
                {perfs.map((p) => (
                  <li key={p.id}>
                    <div>
                      <Link to={`/show-day/${p.id}`} className="link-strong">
                        {p.name}
                      </Link>
                      <div className="small faint">
                        {formatDate(p.date)} {formatTime(p.time)} · {db.lineup.filter((l) => l.performanceId === p.id).length} items in running order
                      </div>
                    </div>
                    <button className="btn btn-ghost btn-sm" onClick={() => openPrint('program', { id: p.id })}>
                      <Printer size={13} /> Program
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
        <Card
          title={`Numbers (${nums.length})`}
          icon={<Music size={18} />}
          actions={
            edit && (
              <>
                <button className="btn btn-ghost btn-sm" onClick={() => { const n = run(() => addAllClassesToRecital(r.id)); if (n !== undefined) toast.success(n ? `${n} class number(s) added.` : 'Every class in the school year already has a number.'); }}>
                  <Sparkles size={14} /> Add a number for every class
                </button>
                <button className="btn btn-primary btn-sm" onClick={() => setNum('new')}>
                  <Plus size={14} /> Add number
                </button>
              </>
            )
          }
        >
          {!nums.length ? (
            <p className="faint pad">No numbers yet.</p>
          ) : (
            <div className="table-wrap">
              <table className="table reorder-table">
                <thead>
                  <tr>
                    {edit && <th className="w-move" />}
                    <th>#</th>
                    <th>Number</th>
                    <th>Class / team</th>
                    <th>Music</th>
                    <th>Costume</th>
                    <th className="num">Min</th>
                    {edit && <th />}
                  </tr>
                </thead>
                <tbody>
                  {nums.map((n, i) => {
                    const cos = db.costumes.find((c) => c.id === n.costumeId);
                    return (
                      <tr key={n.id} {...(edit ? rowProps(n.id) : {})}>
                        {edit && (
                          <td>
                            <MoveButtons id={n.id} ids={ids} up={up} down={down} />
                          </td>
                        )}
                        <td>{i + 1}</td>
                        <td>
                          <strong>{n.title}</strong>
                          <div className="small faint">
                            {[n.style, n.teacherId && staffName(db.staff.find((s) => s.id === n.teacherId))].filter(Boolean).join(' · ')}
                          </div>
                        </td>
                        <td>{n.classId ? <Link to={`/classes/${n.classId}`}>{db.classes.find((c) => c.id === n.classId)?.name}</Link> : n.teamId ? <Link to={`/teams/${n.teamId}`}>{db.teams.find((t) => t.id === n.teamId)?.name}</Link> : '—'}</td>
                        <td className="small">
                          {n.song ? `“${n.song}”` : '—'}
                          {n.artist && <div className="faint">{n.artist}</div>}
                        </td>
                        <td>
                          {cos ? (
                            <Link to={`/costumes/${cos.id}`}>{cos.name}</Link>
                          ) : (
                            <span className="faint">Not chosen</span>
                          )}
                          {n.accessoryNotes && <div className="small faint">{n.accessoryNotes}</div>}
                        </td>
                        <td className="num">{n.durationMin}</td>
                        {edit && (
                          <td className="row-actions">
                            <button className="icon-btn" aria-label={`Edit ${n.title}`} onClick={() => setNum(n.id)}>
                              <Pencil size={14} />
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
      <RecitalForm open={editing} id={r.id} onClose={() => setEditing(false)} />
      <NumberForm recitalId={r.id} id={num} onClose={() => setNum(null)} />
      <BuildLineupDialog open={building} recital={r} onClose={() => setBuilding(false)} />
    </>
  );
}

function NumberForm({ recitalId, id, onClose }: { recitalId: ID; id: ID | 'new' | null; onClose: () => void }) {
  const db = useDb();
  const run = useRun();
  const confirm = useConfirm();
  const staff = useStaffOptions();
  const blank: NumberInput = { title: '', classId: null, teamId: null, teacherId: null, style: '', song: '', artist: '', songFileId: null, choreographyNotes: '', costumeId: null, accessoryNotes: '', shoesTights: '', hairMakeup: '', entranceExit: '', durationMin: 3 };
  const [f, setF] = useState<NumberInput>(blank);
  const [last, setLast] = useState<string | null>(null);
  if (id !== last) {
    setLast(id);
    const n = id && id !== 'new' ? db.recitalNumbers.find((x) => x.id === id) : undefined;
    setF(n ? { ...blank, ...n } : blank);
  }
  if (!id) return null;
  const set = (patch: Partial<NumberInput>) => setF({ ...f, ...patch });
  const pickClass = (cid: string) => {
    const c = db.classes.find((x) => x.id === cid);
    set({ classId: cid || null, teamId: cid ? null : f.teamId, title: f.title || c?.name || '', style: f.style || c?.style || '', teacherId: f.teacherId ?? c?.teacherId ?? null });
  };
  const music = db.media.filter((m) => m.category === 'recital_music' || m.mime.startsWith('audio/'));
  return (
    <FormModal
      open
      onClose={onClose}
      title={id === 'new' ? 'Add Number' : 'Edit Number'}
      size="lg"
      onSubmit={() => run(() => saveRecitalNumber(recitalId, f, id === 'new' ? undefined : id), 'Number saved.') && onClose()}
    >
      <div className="grid-2">
        <Field label="Class">
          <SearchSelect ariaLabel="Class" value={f.classId ?? ''} onChange={pickClass} options={classOptions(db, db.recitals.find((r) => r.id === recitalId)?.schoolYearId)} noneLabel="No class" />
        </Field>
        <Field label="…or competition team">
          <select className="input" value={f.teamId ?? ''} onChange={(e) => set({ teamId: e.target.value || null, classId: e.target.value ? null : f.classId })}>
            <option value="">—</option>
            {db.teams.filter((t) => !t.archived).map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Number title" required>
          <input className="input" value={f.title} onChange={(e) => set({ title: e.target.value })} />
        </Field>
        <Field label="Teacher / choreographer">
          <SearchSelect ariaLabel="Teacher" value={f.teacherId ?? ''} onChange={(v) => set({ teacherId: v || null })} options={staff} noneLabel="—" />
        </Field>
        <Field label="Dance style">
          <input className="input" list="dance-styles" value={f.style} onChange={(e) => set({ style: e.target.value })} />
          <datalist id="dance-styles">
            {db.settings.danceStyles.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </Field>
        <Field label="Duration (minutes)">
          <input className="input" type="number" min={0} step={0.5} value={f.durationMin} onChange={(e) => set({ durationMin: Number(e.target.value) })} />
        </Field>
        <Field label="Song">
          <input className="input" value={f.song} onChange={(e) => set({ song: e.target.value })} />
        </Field>
        <Field label="Artist">
          <input className="input" value={f.artist} onChange={(e) => set({ artist: e.target.value })} />
        </Field>
        <Field label="Music file" hint="Upload music in the Media Library, then choose it here.">
          <select className="input" value={f.songFileId ?? ''} onChange={(e) => set({ songFileId: e.target.value || null })}>
            <option value="">—</option>
            {music.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Costume (from inventory)">
          <SearchSelect ariaLabel="Costume" value={f.costumeId ?? ''} onChange={(v) => set({ costumeId: v || null })} options={costumeOptions(db)} noneLabel="Not chosen yet" />
        </Field>
        <Field label="Accessories">
          <input className="input" value={f.accessoryNotes} onChange={(e) => set({ accessoryNotes: e.target.value })} />
        </Field>
        <Field label="Shoes & tights">
          <input className="input" value={f.shoesTights} onChange={(e) => set({ shoesTights: e.target.value })} />
        </Field>
        <Field label="Hair & makeup">
          <input className="input" value={f.hairMakeup} onChange={(e) => set({ hairMakeup: e.target.value })} />
        </Field>
        <Field label="Entrance / exit">
          <input className="input" value={f.entranceExit} onChange={(e) => set({ entranceExit: e.target.value })} placeholder="e.g. Enter SL, exit SR" />
        </Field>
      </div>
      <Field label="Choreography notes">
        <textarea className="input" rows={3} value={f.choreographyNotes} onChange={(e) => set({ choreographyNotes: e.target.value })} />
      </Field>
      {id !== 'new' && (
        <button type="button" className="btn btn-ghost danger btn-sm" onClick={async () => { if (await confirm({ title: 'Remove number?', message: 'Running orders keep their own copy of this number.', confirmLabel: 'Remove', danger: true })) if (run(() => (deleteRecitalNumber(id), true), 'Number removed.')) onClose(); }}>
          <Trash2 size={14} /> Remove number
        </button>
      )}
    </FormModal>
  );
}

function BuildLineupDialog({ open, recital, onClose }: { open: boolean; recital: Recital; onClose: () => void }) {
  const db = useDb();
  const run = useRun();
  const navigate = useNavigate();
  const perfs = db.performances.filter((p) => !recital.showId || p.showId === recital.showId);
  const [perf, setPerf] = useState('');
  const [replace, setReplace] = useState(true);
  const [after, setAfter] = useState(0);
  return (
    <FormModal
      open={open}
      onClose={onClose}
      title="Build Running Order"
      subtitle={`Copy ${recital.name}'s numbers (with their dancers & costumes) into a performance's running order`}
      size="sm"
      saveLabel="Build"
      onSubmit={() => {
        if (run(() => (lineupFromRecital(perf, recital.id, { replace, intermissionAfter: after || undefined }), true), 'Running order built.')) {
          onClose();
          navigate(`/show-day/${perf}`);
        }
      }}
    >
      <Field label="Performance" required>
        <select className="input" value={perf} onChange={(e) => setPerf(e.target.value)}>
          <option value="">Choose…</option>
          {perfs.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} · {formatDate(p.date)}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Intermission after number" hint="0 = no intermission">
        <input className="input" type="number" min={0} value={after} onChange={(e) => setAfter(Number(e.target.value))} />
      </Field>
      <label className="check-inline">
        <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} /> Replace the existing running order (otherwise numbers are added at the end)
      </label>
    </FormModal>
  );
}

/* =============================================================== show day */

export function ShowDayIndexPage() {
  const db = useDb();
  const today = todayStr();
  const perfs = [...db.performances].sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  const upcomingPerfs = perfs.filter((p) => !p.date || p.date >= today);
  const past = perfs.filter((p) => p.date && p.date < today).reverse();
  const row = (p: (typeof perfs)[number]) => {
    const items = db.lineup.filter((l) => l.performanceId === p.id);
    const qc = quickChanges(db, p.id).filter((q) => q.tight).length;
    const conflicts = costumeConflicts(db, { from: '0000', performanceId: p.id }).filter((c) => !c.overridden).length;
    return (
      <li key={p.id}>
        <div>
          <Link to={`/show-day/${p.id}`} className="link-strong">
            {p.name}
          </Link>
          <div className="small faint">
            {formatDate(p.date) || 'Date TBA'} {formatTime(p.time)} · {p.venue || 'Venue TBA'} · {items.filter((i) => i.kind === 'number').length} numbers · {showLength(db, p.id)} min
          </div>
        </div>
        <span className="row-actions">
          {qc > 0 && <Badge tone="warn">{qc} tight quick change{qc === 1 ? '' : 's'}</Badge>}
          {conflicts > 0 && <Badge tone="danger">{conflicts} costume warning{conflicts === 1 ? '' : 's'}</Badge>}
        </span>
      </li>
    );
  };
  return (
    <>
      <PageHeader title="Show Day & Backstage" subtitle="Running orders, quick changes, dancer check-in and backstage crew for each performance" />
      <Card title="Upcoming performances" icon={<CalendarHeart size={18} />}>
        {upcomingPerfs.length ? <ul className="mini-list">{upcomingPerfs.map(row)}</ul> : <p className="faint pad">No upcoming performances. Add them under Performance Planning.</p>}
      </Card>
      {past.length > 0 && (
        <Card title="Past performances">
          <ul className="mini-list">{past.map(row)}</ul>
        </Card>
      )}
    </>
  );
}

type ShowTab = 'order' | 'quick' | 'checkin' | 'crew' | 'costumes';

export function ShowDayPage() {
  const { id } = useParams();
  const db = useDb();
  const v = useViewer();
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as ShowTab) || 'order';
  const perf = db.performances.find((p) => p.id === id);
  if (!perf) return <EmptyState title="Performance not found" action={<Link to="/show-day" className="btn btn-primary">All performances</Link>} />;
  const edit = v.can('productions.manage') || v.can('shows.edit');
  const items = timedLineup(db, perf.id);
  const qc = quickChanges(db, perf.id);
  const conflicts = costumeConflicts(db, { from: '0000', performanceId: perf.id });
  const ex = db.performanceExtras.find((e) => e.performanceId === perf.id);
  const dancers = [...new Set(items.flatMap((i) => i.dancerIds))];
  const checked = db.checkIns.filter((c) => c.performanceId === perf.id && c.status !== 'not_arrived' && dancers.includes(c.dancerId)).length;
  return (
    <>
      <PageHeader
        back={{ to: '/show-day', label: 'Show Day' }}
        title={perf.name}
        subtitle={[formatDate(perf.date), formatTime(perf.time), perf.venue, ex?.warmUpTime && `Warm-up ${formatTime(ex.warmUpTime)}`].filter(Boolean).join(' · ')}
        actions={
          <>
            <button className="btn btn-ghost" onClick={() => openPrint('runningorder', { id: perf.id })}>
              <Printer size={16} /> Running order
            </button>
            <button className="btn btn-ghost" onClick={() => openPrint('quickchanges', { id: perf.id })}>
              <Printer size={16} /> Quick changes
            </button>
            <button className="btn btn-ghost" onClick={() => openPrint('backstage', { id: perf.id })}>
              <Printer size={16} /> Check-in sheet
            </button>
            <button className="btn btn-ghost" onClick={() => openPrint('program', { id: perf.id })}>
              <Printer size={16} /> Program
            </button>
          </>
        }
      />
      <div className="stats stats-4">
        <StatCard label="Numbers" value={items.filter((i) => i.kind === 'number').length} icon={<ListOrdered size={20} />} tone="plum" hint={`About ${showLength(db, perf.id)} min`} />
        <StatCard label="Dancers checked in" value={`${checked}/${dancers.length}`} icon={<LogIn size={20} />} tone="sage" />
        <StatCard label="Tight quick changes" value={qc.filter((q) => q.tight).length} icon={<Repeat size={20} />} tone="amber" hint={`Under ${db.settings.quickChangeMinutes} min`} />
        <StatCard label="Costume warnings" value={conflicts.filter((c) => !c.overridden).length} icon={<AlertTriangle size={20} />} tone="rose" />
      </div>
      <Tabs
        value={tab}
        onChange={(t) => setParams(t === 'order' ? {} : { tab: t }, { replace: true })}
        tabs={[
          { value: 'order', label: 'Running order', count: items.length },
          { value: 'quick', label: 'Quick changes', count: qc.length },
          { value: 'checkin', label: 'Dancer check-in', count: dancers.length },
          { value: 'crew', label: 'Crew & instructions' },
          { value: 'costumes', label: 'Costume warnings', count: conflicts.length },
        ]}
      />
      {tab === 'order' && <RunningOrderEditor perfId={perf.id} perfTime={perf.time} edit={edit} />}
      {tab === 'quick' && <QuickChangesTab perfId={perf.id} edit={edit} />}
      {tab === 'checkin' && <CheckInTab perfId={perf.id} />}
      {tab === 'crew' && <CrewTab perfId={perf.id} edit={edit} />}
      {tab === 'costumes' && <ConflictList perfId={perf.id} edit={edit} />}
    </>
  );
}

function RunningOrderEditor({ perfId, perfTime, edit }: { perfId: ID; perfTime: string; edit: boolean }) {
  const db = useDb();
  const run = useRun();
  const confirm = useConfirm();
  const [item, setItem] = useState<ID | 'number' | 'intermission' | null>(null);
  const items = timedLineup(db, perfId);
  const ids = items.map((i) => i.id);
  const { rowProps, up, down } = useReorder(ids, (next) => run(() => reorderLineup(next)));
  const qc = quickChanges(db, perfId);
  return (
    <Card
      title="Running order"
      actions={
        edit && (
          <>
            <button className="btn btn-ghost btn-sm" onClick={() => setItem('intermission')}>
              <Coffee size={14} /> Add intermission / break
            </button>
            <button className="btn btn-primary btn-sm" onClick={() => setItem('number')}>
              <Plus size={14} /> Add number
            </button>
          </>
        )
      }
    >
      {!items.length ? (
        <EmptyState icon={<ListOrdered size={28} />} title="No running order yet" message={<>Open a recital and use <strong>Build running order</strong>, or add numbers here one at a time.</>} />
      ) : (
        <div className="table-wrap">
          <table className="table reorder-table">
            <thead>
              <tr>
                {edit && <th className="w-move" />}
                <th>#</th>
                <th>Time</th>
                <th>Number</th>
                <th>Costume</th>
                <th>Dancers</th>
                <th>Backstage</th>
                {edit && <th />}
              </tr>
            </thead>
            <tbody>
              {items.map((i) => {
                const tight = qc.filter((q) => q.toItem.id === i.id && q.tight);
                return (
                  <tr key={i.id} {...(edit ? rowProps(i.id) : {})} className={`${edit ? rowProps(i.id).className : ''} ${i.kind !== 'number' ? 'row-break' : ''}`}>
                    {edit && (
                      <td>
                        <MoveButtons id={i.id} ids={ids} up={up} down={down} />
                      </td>
                    )}
                    <td>{i.number || ''}</td>
                    <td className="nowrap small">
                      {clockAt(perfTime, i.startMin)}
                      <div className="faint">{i.durationMin} min</div>
                    </td>
                    <td>
                      <strong>{i.title}</strong>
                      {i.song && <div className="small faint">“{i.song}”{i.artist && ` · ${i.artist}`}</div>}
                      {i.teacherId && <div className="small faint">{staffName(db.staff.find((s) => s.id === i.teacherId))}</div>}
                    </td>
                    <td className="small">{db.costumes.find((c) => c.id === i.costumeId)?.name ?? (i.kind === 'number' ? <span className="faint">—</span> : '')}</td>
                    <td className="small">
                      {i.kind === 'number' && `${i.dancerIds.length} dancer${i.dancerIds.length === 1 ? '' : 's'}`}
                      {tight.length > 0 && (
                        <div className="warn-text inline">
                          <AlertTriangle size={12} /> Quick change: {tight.map((q) => `${q.dancerName.split(' ')[0]} (${q.minutes} min)`).join(', ')}
                        </div>
                      )}
                    </td>
                    <td className="small">
                      {i.entranceExit}
                      {i.backstageNotes && <div className="faint">{i.backstageNotes}</div>}
                    </td>
                    {edit && (
                      <td className="row-actions">
                        <button className="icon-btn" aria-label={`Edit ${i.title}`} onClick={() => setItem(i.id)}>
                          <Pencil size={14} />
                        </button>
                        <button className="icon-btn" aria-label={`Remove ${i.title}`} onClick={async () => { if (await confirm({ title: `Remove “${i.title}”?`, message: 'It is removed from this running order only.', confirmLabel: 'Remove', danger: true })) run(() => deleteLineupItem(i.id)); }}>
                          <Trash2 size={14} />
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="small faint">Drag rows (or use the arrows) to change the order. Times are calculated from the curtain time and each item's length.</p>
      <LineupItemForm perfId={perfId} id={item} onClose={() => setItem(null)} />
    </Card>
  );
}

function LineupItemForm({ perfId, id, onClose }: { perfId: ID; id: ID | 'number' | 'intermission' | null; onClose: () => void }) {
  const db = useDb();
  const run = useRun();
  const staff = useStaffOptions();
  const blank = (kind: LineupItem['kind']): LineupInput => ({ kind, numberId: null, title: kind === 'number' ? '' : 'Intermission', classId: null, teacherId: null, dancerIds: [], song: '', artist: '', costumeId: null, durationMin: kind === 'number' ? 3 : 15, entranceExit: '', backstageNotes: '' });
  const [f, setF] = useState<LineupInput>(blank('number'));
  const [last, setLast] = useState<string | null>(null);
  if (id !== last) {
    setLast(id);
    if (id) {
      const l = db.lineup.find((x) => x.id === id);
      setF(l ? { ...l } : blank(id === 'intermission' ? 'intermission' : 'number'));
    }
  }
  if (!id) return null;
  const set = (patch: Partial<LineupInput>) => setF({ ...f, ...patch });
  const isNew = id === 'number' || id === 'intermission';
  return (
    <FormModal open onClose={onClose} title={isNew ? (f.kind === 'number' ? 'Add Number' : 'Add Intermission / Break') : 'Edit Running Order Item'} size={f.kind === 'number' ? 'lg' : 'sm'} onSubmit={() => run(() => saveLineupItem(perfId, f, isNew ? undefined : id), 'Saved.') && onClose()}>
      {f.kind !== 'number' ? (
        <>
          <Field label="Type">
            <select className="input" value={f.kind} onChange={(e) => set({ kind: e.target.value as LineupItem['kind'] })}>
              <option value="intermission">Intermission</option>
              <option value="break">Break / announcement</option>
            </select>
          </Field>
          <Field label="Title" required>
            <input className="input" value={f.title} onChange={(e) => set({ title: e.target.value })} />
          </Field>
          <Field label="Length (minutes)">
            <input className="input" type="number" min={0} value={f.durationMin} onChange={(e) => set({ durationMin: Number(e.target.value) })} />
          </Field>
          <Field label="Notes">
            <input className="input" value={f.backstageNotes} onChange={(e) => set({ backstageNotes: e.target.value })} />
          </Field>
        </>
      ) : (
        <>
          <div className="grid-2">
            <Field label="Class" hint="Choosing a class fills in its enrolled dancers.">
              <SearchSelect
                ariaLabel="Class"
                value={f.classId ?? ''}
                onChange={(cid) => {
                  const c = db.classes.find((x) => x.id === cid);
                  set({ classId: cid || null, dancerIds: cid ? classDancers(db, cid) : f.dancerIds, title: f.title || c?.name || '', teacherId: f.teacherId ?? c?.teacherId ?? null });
                }}
                options={classOptions(db)}
                noneLabel="No class"
              />
            </Field>
            <Field label="Title" required>
              <input className="input" value={f.title} onChange={(e) => set({ title: e.target.value })} />
            </Field>
            <Field label="Teacher">
              <SearchSelect ariaLabel="Teacher" value={f.teacherId ?? ''} onChange={(v) => set({ teacherId: v || null })} options={staff} noneLabel="—" />
            </Field>
            <Field label="Length (minutes)">
              <input className="input" type="number" min={0} step={0.5} value={f.durationMin} onChange={(e) => set({ durationMin: Number(e.target.value) })} />
            </Field>
            <Field label="Song">
              <input className="input" value={f.song} onChange={(e) => set({ song: e.target.value })} />
            </Field>
            <Field label="Artist">
              <input className="input" value={f.artist} onChange={(e) => set({ artist: e.target.value })} />
            </Field>
            <Field label="Costume">
              <SearchSelect ariaLabel="Costume" value={f.costumeId ?? ''} onChange={(v) => set({ costumeId: v || null })} options={costumeOptions(db)} noneLabel="—" />
            </Field>
            <Field label="Entrance / exit">
              <input className="input" value={f.entranceExit} onChange={(e) => set({ entranceExit: e.target.value })} />
            </Field>
          </div>
          <Field label="Backstage notes">
            <textarea className="input" rows={2} value={f.backstageNotes} onChange={(e) => set({ backstageNotes: e.target.value })} />
          </Field>
          <div className="field">
            <span className="field-label">Dancers ({f.dancerIds.length})</span>
            <CheckList options={dancerOptions(db)} selected={new Set(f.dancerIds)} onChange={(s) => set({ dancerIds: [...s] })} height={200} />
          </div>
        </>
      )}
    </FormModal>
  );
}

function QuickChangesTab({ perfId, edit }: { perfId: ID; edit: boolean }) {
  const db = useDb();
  const run = useRun();
  const qc = quickChanges(db, perfId);
  const [editing, setEditing] = useState<{ dancerId: ID; toItemId: ID } | null>(null);
  const [form, setForm] = useState({ helper: '', location: '', notes: '' });
  const open = (dancerId: ID, toItemId: ID) => {
    const a = db.quickChanges.find((x) => x.performanceId === perfId && x.dancerId === dancerId && x.toItemId === toItemId);
    setForm({ helper: a?.helper ?? '', location: a?.location ?? '', notes: a?.notes ?? '' });
    setEditing({ dancerId, toItemId });
  };
  return (
    <Card title="Quick changes" icon={<Repeat size={18} />}>
      <p className="small faint">Every dancer who changes costume between two of their numbers, with the time they have. Under {db.settings.quickChangeMinutes} minutes is flagged (change the threshold in Settings).</p>
      {!qc.length ? (
        <p className="faint pad">No costume changes between numbers.</p>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Dancer</th>
                <th>From</th>
                <th>To</th>
                <th>Time to change</th>
                <th>Helper & location</th>
                {edit && <th />}
              </tr>
            </thead>
            <tbody>
              {qc.map((q) => {
                const a = db.quickChanges.find((x) => x.performanceId === perfId && x.dancerId === q.dancerId && x.toItemId === q.toItem.id);
                return (
                  <tr key={`${q.dancerId}:${q.toItem.id}`} className={q.tight ? 'row-warn' : ''}>
                    <td>
                      <Link to={`/dancers/${q.dancerId}`} className="link-strong">
                        {q.dancerName}
                      </Link>
                    </td>
                    <td className="small">
                      #{q.fromItem.number} {q.fromItem.title}
                      <div className="faint">{db.costumes.find((c) => c.id === q.fromCostumeId)?.name ?? '—'}</div>
                    </td>
                    <td className="small">
                      #{q.toItem.number} {q.toItem.title}
                      <div className="faint">{db.costumes.find((c) => c.id === q.toCostumeId)?.name ?? '—'}</div>
                    </td>
                    <td>{q.tight ? <Badge tone="danger">{q.minutes} min — tight</Badge> : <Badge tone="ready">{q.minutes} min</Badge>}</td>
                    <td className="small">
                      {a ? (
                        <>
                          {a.helper || <span className="faint">No helper</span>}
                          {a.location && <div className="faint">{a.location}</div>}
                          {a.notes && <div className="faint">{a.notes}</div>}
                        </>
                      ) : (
                        <span className="faint">Not assigned</span>
                      )}
                    </td>
                    {edit && (
                      <td>
                        <button className="btn btn-ghost btn-sm" onClick={() => open(q.dancerId, q.toItem.id)}>
                          <Pencil size={13} /> Assign
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <FormModal open={!!editing} onClose={() => setEditing(null)} title="Quick Change Plan" size="sm" onSubmit={() => editing && run(() => saveQuickChange({ performanceId: perfId, ...editing, ...form }), 'Quick change saved.') && setEditing(null)}>
        <Field label="Helper / dresser">
          <input className="input" list="qc-helpers" value={form.helper} onChange={(e) => setForm({ ...form, helper: e.target.value })} autoFocus />
          <datalist id="qc-helpers">
            {db.volunteers.map((x) => (
              <option key={x.id} value={`${x.firstName} ${x.lastName}`} />
            ))}
          </datalist>
        </Field>
        <Field label="Location">
          <input className="input" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="e.g. Stage left wing" />
        </Field>
        <Field label="Notes">
          <textarea className="input" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </Field>
      </FormModal>
    </Card>
  );
}

const checkTone: Record<CheckInStatus, 'neutral' | 'info' | 'ready' | 'progress' | 'rose'> = { not_arrived: 'neutral', checked_in: 'info', backstage: 'info', ready: 'ready', on_stage: 'rose', finished: 'progress', checked_out: 'neutral' };

function CheckInTab({ perfId }: { perfId: ID }) {
  const db = useDb();
  const run = useRun();
  const [q, setQ] = useState('');
  const [numberId, setNumberId] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sel, setSel] = useState<Set<ID>>(new Set());
  const [room, setRoom] = useState<{ ids: ID[]; value: string } | null>(null);
  const items = timedLineup(db, perfId).filter((i) => i.kind === 'number');
  const all = [...new Set(items.flatMap((i) => i.dancerIds))];
  const ids = (numberId ? items.find((i) => i.id === numberId)?.dancerIds ?? [] : all).filter((d) => {
    const dancer = db.dancers.find((x) => x.id === d);
    const st = db.checkIns.find((c) => c.performanceId === perfId && c.dancerId === d)?.status ?? 'not_arrived';
    return dancer && (!q || fullName(dancer).toLowerCase().includes(q.toLowerCase())) && (!statusFilter || st === statusFilter);
  });
  const sorted = ids.map((d) => db.dancers.find((x) => x.id === d)!).sort((a, b) => a.lastName.localeCompare(b.lastName));
  const set = (dancerIds: ID[], status: CheckInStatus) => run(() => setCheckIn(perfId, dancerIds, status));
  const counts = Object.keys(checkInLabels).map((k) => ({ k: k as CheckInStatus, n: all.filter((d) => (db.checkIns.find((c) => c.performanceId === perfId && c.dancerId === d)?.status ?? 'not_arrived') === k).length }));
  return (
    <Card title="Dancer check-in" icon={<ClipboardList size={18} />}>
      <div className="chip-row">
        {counts.map(({ k, n }) => (
          <button key={k} className={`chip ${statusFilter === k ? 'active' : ''}`} onClick={() => setStatusFilter(statusFilter === k ? '' : k)}>
            {checkInLabels[k]} <strong>{n}</strong>
          </button>
        ))}
      </div>
      <div className="toolbar">
        <SearchInput value={q} onChange={setQ} placeholder="Find a dancer…" />
        <select className="input input-auto" value={numberId} onChange={(e) => setNumberId(e.target.value)} aria-label="Filter by number">
          <option value="">All numbers</option>
          {items.map((i) => (
            <option key={i.id} value={i.id}>
              #{i.number} {i.title}
            </option>
          ))}
        </select>
      </div>
      {sel.size > 0 && (
        <div className="bulk-bar">
          <span>{sel.size} selected</span>
          {(['checked_in', 'backstage', 'ready', 'on_stage', 'finished', 'checked_out'] as CheckInStatus[]).map((s) => (
            <button key={s} className="btn btn-ghost btn-sm" onClick={() => (set([...sel], s), setSel(new Set()))}>
              {checkInLabels[s]}
            </button>
          ))}
          <button className="btn btn-ghost btn-sm" onClick={() => setRoom({ ids: [...sel], value: '' })}>
            Dressing room…
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => setSel(new Set())}>
            Clear
          </button>
        </div>
      )}
      {!sorted.length ? (
        <p className="faint pad">No dancers {all.length ? 'match' : 'in the running order yet'}.</p>
      ) : (
        <ul className="checkin-list">
          {sorted.map((d) => {
            const ci = db.checkIns.find((c) => c.performanceId === perfId && c.dancerId === d.id);
            const st = ci?.status ?? 'not_arrived';
            const nums = items.filter((i) => i.dancerIds.includes(d.id));
            const next = nums[0];
            return (
              <li key={d.id} className={`checkin-row st-${st}`}>
                <input type="checkbox" aria-label={`Select ${fullName(d)}`} checked={sel.has(d.id)} onChange={(e) => { const n = new Set(sel); if (e.target.checked) n.add(d.id); else n.delete(d.id); setSel(n); }} />
                <div className="checkin-name">
                  <strong>{fullName(d)}</strong>
                  <div className="small faint">
                    {nums.map((n) => `#${n.number}`).join(', ')}
                    {ci?.dressingRoom && ` · Room: ${ci.dressingRoom}`}
                    {next && ` · first up: ${next.title}`}
                  </div>
                </div>
                <Badge tone={checkTone[st]}>{checkInLabels[st]}</Badge>
                <div className="checkin-actions">
                  {st === 'not_arrived' && (
                    <button className="btn btn-primary btn-sm" onClick={() => set([d.id], 'checked_in')}>
                      <LogIn size={13} /> Check in
                    </button>
                  )}
                  {st !== 'not_arrived' && st !== 'checked_out' && (
                    <select className="input input-auto input-sm" value={st} onChange={(e) => set([d.id], e.target.value as CheckInStatus)} aria-label={`Status for ${fullName(d)}`}>
                      {Object.entries(checkInLabels).map(([k, l]) => (
                        <option key={k} value={k}>
                          {l}
                        </option>
                      ))}
                    </select>
                  )}
                  {st !== 'not_arrived' && st !== 'checked_out' && (
                    <button className="btn btn-ghost btn-sm" onClick={() => set([d.id], 'checked_out')}>
                      <LogOut size={13} /> Release
                    </button>
                  )}
                  {st === 'checked_out' && (
                    <button className="btn btn-ghost btn-sm" onClick={() => set([d.id], 'checked_in')}>
                      <Undo2 size={13} /> Undo
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <FormModal open={!!room} onClose={() => setRoom(null)} title="Dressing Room" size="sm" onSubmit={() => room && run(() => { const st = (d: ID) => db.checkIns.find((c) => c.performanceId === perfId && c.dancerId === d)?.status ?? 'checked_in'; room.ids.forEach((d) => setCheckIn(perfId, [d], st(d) === 'not_arrived' ? 'checked_in' : st(d), { dressingRoom: room.value })); return true; }, 'Dressing room saved.') && (setRoom(null), setSel(new Set()))}>
        <Field label="Dressing room">
          <input className="input" value={room?.value ?? ''} onChange={(e) => room && setRoom({ ...room, value: e.target.value })} autoFocus placeholder="e.g. Room B" />
        </Field>
      </FormModal>
    </Card>
  );
}

function CrewTab({ perfId, edit }: { perfId: ID; edit: boolean }) {
  const db = useDb();
  const run = useRun();
  const confirm = useConfirm();
  const staff = useStaffOptions();
  const ex = db.performanceExtras.find((e) => e.performanceId === perfId);
  const [info, setInfo] = useState<{ warmUpTime: string; stageRehearsal: string; stageManagerId: ID | null; specialInstructions: string; teacherIds: ID[] } | null>(null);
  const [role, setRole] = useState<ID | 'new' | null>(null);
  const blankRole = { performanceId: perfId, role: '', person: '', volunteerId: null as ID | null, staffId: null as ID | null, area: '', notes: '' };
  const [rf, setRf] = useState(blankRole);
  const roles = db.backstageRoles.filter((r) => r.performanceId === perfId);
  const openRole = (id: ID | 'new') => {
    const r = id === 'new' ? undefined : roles.find((x) => x.id === id);
    setRf(r ? { ...blankRole, ...r } : blankRole);
    setRole(id);
  };
  return (
    <div className="detail-grid">
      <Card
        title="Show information"
        icon={<Theater size={18} />}
        actions={
          edit && (
            <button className="btn btn-ghost btn-sm" onClick={() => setInfo({ warmUpTime: ex?.warmUpTime ?? '', stageRehearsal: ex?.stageRehearsal ?? '', stageManagerId: ex?.stageManagerId ?? null, specialInstructions: ex?.specialInstructions ?? '', teacherIds: ex?.teacherIds ?? [] })}>
              <Pencil size={14} /> Edit
            </button>
          )
        }
      >
        <dl className="dl">
          <dt>Warm-up</dt>
          <dd>{ex?.warmUpTime ? formatTime(ex.warmUpTime) : '—'}</dd>
          <dt>Stage rehearsal</dt>
          <dd>{ex?.stageRehearsal ? formatDateTime(ex.stageRehearsal) : '—'}</dd>
          <dt>Stage manager</dt>
          <dd>{ex?.stageManagerId ? staffName(db.staff.find((s) => s.id === ex.stageManagerId)) : '—'}</dd>
          <dt>Teachers</dt>
          <dd>{ex?.teacherIds.length ? ex.teacherIds.map((t) => staffName(db.staff.find((s) => s.id === t))).join(', ') : '—'}</dd>
        </dl>
        {ex?.specialInstructions && <p className="prewrap small">{ex.specialInstructions}</p>}
      </Card>
      <Card
        title="Backstage crew"
        icon={<ShieldCheck size={18} />}
        actions={
          edit && (
            <button className="btn btn-primary btn-sm" onClick={() => openRole('new')}>
              <Plus size={14} /> Add role
            </button>
          )
        }
      >
        {!roles.length ? (
          <p className="faint pad small">No crew assigned yet — add dressers, rack monitors, door monitors, quick-change helpers…</p>
        ) : (
          <ul className="mini-list">
            {roles.map((r) => (
              <li key={r.id}>
                <div>
                  <strong>{r.role}</strong> <span className="small faint">· {r.area}</span>
                  <div className="small">{r.person || <span className="faint">Unassigned</span>}</div>
                  {r.notes && <div className="small faint">{r.notes}</div>}
                </div>
                {edit && (
                  <span className="row-actions">
                    <button className="icon-btn" aria-label={`Edit ${r.role}`} onClick={() => openRole(r.id)}>
                      <Pencil size={14} />
                    </button>
                    <button className="icon-btn" aria-label={`Remove ${r.role}`} onClick={async () => { if (await confirm({ title: 'Remove role?', message: r.role, confirmLabel: 'Remove', danger: true })) run(() => deleteBackstageRole(r.id)); }}>
                      <Trash2 size={14} />
                    </button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
      {info && (
        <FormModal open onClose={() => setInfo(null)} title="Show Information" onSubmit={() => run(() => (savePerformanceExtras(perfId, info), true), 'Saved.') && setInfo(null)}>
          <div className="grid-2">
            <Field label="Warm-up time">
              <input className="input" type="time" value={info.warmUpTime} onChange={(e) => setInfo({ ...info, warmUpTime: e.target.value })} />
            </Field>
            <Field label="Stage rehearsal">
              <input className="input" type="datetime-local" value={info.stageRehearsal} onChange={(e) => setInfo({ ...info, stageRehearsal: e.target.value })} />
            </Field>
            <Field label="Stage manager">
              <SearchSelect ariaLabel="Stage manager" value={info.stageManagerId ?? ''} onChange={(v) => setInfo({ ...info, stageManagerId: v || null })} options={staff} noneLabel="—" />
            </Field>
          </div>
          <div className="field">
            <span className="field-label">Teachers involved</span>
            <CheckList options={staff} selected={new Set(info.teacherIds)} onChange={(s) => setInfo({ ...info, teacherIds: [...s] })} height={150} />
          </div>
          <Field label="Special instructions">
            <textarea className="input" rows={4} value={info.specialInstructions} onChange={(e) => setInfo({ ...info, specialInstructions: e.target.value })} />
          </Field>
        </FormModal>
      )}
      {role && (
        <FormModal open onClose={() => setRole(null)} title={role === 'new' ? 'Add Backstage Role' : 'Edit Backstage Role'} size="sm" onSubmit={() => run(() => saveBackstageRole(rf, role === 'new' ? undefined : role), 'Saved.') && setRole(null)}>
          <Field label="Role" required>
            <input className="input" list="crew-roles" value={rf.role} onChange={(e) => setRf({ ...rf, role: e.target.value })} autoFocus />
            <datalist id="crew-roles">
              {['Stage manager', 'Stage left dresser', 'Stage right dresser', 'Quick-change helper', 'Rack monitor', 'Dressing room parent', 'Door monitor', 'Check-in desk', 'Prop master'].map((r) => (
                <option key={r} value={r} />
              ))}
            </datalist>
          </Field>
          <Field label="Volunteer">
            <select className="input" value={rf.volunteerId ?? ''} onChange={(e) => { const vol = db.volunteers.find((x) => x.id === e.target.value); setRf({ ...rf, volunteerId: vol?.id ?? null, staffId: vol ? null : rf.staffId, person: vol ? `${vol.firstName} ${vol.lastName}` : rf.person }); }}>
              <option value="">—</option>
              {db.volunteers.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.firstName} {x.lastName}
                </option>
              ))}
            </select>
          </Field>
          <Field label="…or staff member">
            <SearchSelect ariaLabel="Staff member" value={rf.staffId ?? ''} onChange={(sid) => { const s = db.staff.find((x) => x.id === sid); setRf({ ...rf, staffId: sid || null, volunteerId: sid ? null : rf.volunteerId, person: s ? staffName(s) : rf.person }); }} options={staff} noneLabel="—" />
          </Field>
          <Field label="Name shown">
            <input className="input" value={rf.person} onChange={(e) => setRf({ ...rf, person: e.target.value })} />
          </Field>
          <Field label="Area">
            <input className="input" value={rf.area} onChange={(e) => setRf({ ...rf, area: e.target.value })} placeholder="e.g. Stage left" />
          </Field>
          <Field label="Notes">
            <input className="input" value={rf.notes} onChange={(e) => setRf({ ...rf, notes: e.target.value })} />
          </Field>
        </FormModal>
      )}
    </div>
  );
}

function ConflictList({ perfId, edit }: { perfId?: ID; edit: boolean }) {
  const db = useDb();
  const run = useRun();
  const [over, setOver] = useState<{ key: string; reason: string } | null>(null);
  const list = costumeConflicts(db, perfId ? { from: '0000', performanceId: perfId } : {}).sort((a, b) => a.date.localeCompare(b.date));
  const kind = { double_booked: 'Double-booked', quantity: 'Not enough pieces', checked_out: 'Checked out elsewhere', in_progress: 'In repair / cleaning', accessories: 'Accessories short' };
  return (
    <Card title="Costume warnings" icon={<AlertTriangle size={18} />}>
      <p className="small faint">Checked against costume quantities, repair/cleaning status, checkouts and accessories for every upcoming performance{perfId ? '' : ''}. Overriding needs an explanation and is recorded.</p>
      {!list.length ? (
        <p className="pad ok-text inline">
          <CheckCircle2 size={16} /> No costume conflicts.
        </p>
      ) : (
        <ul className="conflict-list">
          {list.map((c) => (
            <li key={c.key} className={c.overridden ? 'overridden' : ''}>
              <AlertTriangle size={16} />
              <div>
                <div>
                  <Badge tone={c.overridden ? 'neutral' : 'danger'}>{kind[c.kind]}</Badge> <span className="small faint">{formatDate(c.date)} · {c.performanceIds.map((p) => db.performances.find((x) => x.id === p)?.name).join(', ')}</span>
                </div>
                <div>
                  <Link to={`/costumes/${c.costumeId}`}>{c.message}</Link>
                </div>
                {c.overridden && <div className="small faint">Overridden: {c.overrideReason}</div>}
              </div>
              {edit &&
                (c.overridden ? (
                  <button className="btn btn-ghost btn-sm" onClick={() => run(() => removeOverride(c.key), 'Warning restored.')}>
                    Restore
                  </button>
                ) : (
                  <button className="btn btn-ghost btn-sm" onClick={() => setOver({ key: c.key, reason: '' })}>
                    Override…
                  </button>
                ))}
            </li>
          ))}
        </ul>
      )}
      <FormModal open={!!over} onClose={() => setOver(null)} title="Override Costume Warning" size="sm" saveLabel="Override" onSubmit={() => over && run(() => (overrideConflict(over.key, over.reason), true), 'Override recorded.') && setOver(null)}>
        <Field label="Why is this OK?" required>
          <textarea className="input" rows={3} value={over?.reason ?? ''} onChange={(e) => over && setOver({ ...over, reason: e.target.value })} autoFocus />
        </Field>
      </FormModal>
    </Card>
  );
}

/* ============================================================= checkout */

const checkoutStatus: Record<CostumeCheckout['status'], string> = { reserved: 'Reserved', checked_out: 'Checked out', returned: 'Returned', needs_inspection: 'Needs inspection', needs_repair: 'Needs repair' };
const checkoutTone: Record<CostumeCheckout['status'], 'info' | 'progress' | 'ready' | 'warn' | 'danger'> = { reserved: 'info', checked_out: 'progress', returned: 'ready', needs_inspection: 'warn', needs_repair: 'danger' };
const availTone: Record<Availability, 'ready' | 'info' | 'progress' | 'warn' | 'danger' | 'neutral'> = { available: 'ready', partly_available: 'info', reserved: 'progress', checked_out: 'warn', in_repair: 'danger', unavailable: 'neutral' };

export function CheckoutPage() {
  const db = useDb();
  const v = useViewer();
  const run = useRun();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as 'active' | 'overdue' | 'availability' | 'conflicts' | 'history') || 'active';
  const [creating, setCreating] = useState(false);
  const [reserving, setReserving] = useState(false);
  const edit = v.can('productions.manage') || v.can('costumes.edit');
  const active = db.checkouts.filter((c) => ACTIVE_CHECKOUT.includes(c.status));
  const overdue = active.filter((c) => isCheckoutOverdue(c));
  const conflicts = costumeConflicts(db).filter((c) => !c.overridden);
  return (
    <>
      <PageHeader
        title="Costume Checkout"
        subtitle="Reserve, check out and return costumes — with availability and conflict warnings"
        actions={
          <>
            <button className="btn btn-ghost" onClick={() => openPrint('checkouts')}>
              <Printer size={16} /> Print list
            </button>
            {edit && (
              <>
                <button className="btn btn-ghost" onClick={() => setReserving(true)}>
                  <PackageCheck size={16} /> Reserve for a performance
                </button>
                <button className="btn btn-primary" onClick={() => setCreating(true)}>
                  <PackageOpen size={16} /> Check out / reserve
                </button>
              </>
            )}
          </>
        }
      />
      <div className="stats stats-4">
        <StatCard label="Checked out" value={active.filter((c) => c.status === 'checked_out').reduce((s, c) => s + c.quantity, 0)} icon={<PackageOpen size={20} />} tone="amber" />
        <StatCard label="Reserved" value={active.filter((c) => c.status === 'reserved').reduce((s, c) => s + c.quantity, 0)} icon={<PackageCheck size={20} />} tone="plum" />
        <StatCard label="Overdue" value={overdue.length} icon={<Clock size={20} />} tone="rose" />
        <StatCard label="Costume warnings" value={conflicts.length} icon={<AlertTriangle size={20} />} tone="slate" />
      </div>
      <Tabs
        value={tab}
        onChange={(t) => setParams(t === 'active' ? {} : { tab: t }, { replace: true })}
        tabs={[
          { value: 'active', label: 'Out & reserved', count: active.length },
          { value: 'overdue', label: 'Overdue', count: overdue.length },
          { value: 'availability', label: 'Availability' },
          { value: 'conflicts', label: 'Conflicts', count: conflicts.length },
          { value: 'history', label: 'Returned' },
        ]}
      />
      {(tab === 'active' || tab === 'overdue' || tab === 'history') && <CheckoutTable rows={tab === 'active' ? active : tab === 'overdue' ? overdue : db.checkouts.filter((c) => c.status === 'returned')} edit={edit} />}
      {tab === 'availability' && <AvailabilityTable />}
      {tab === 'conflicts' && <ConflictList edit={edit} />}
      <CheckoutDialog open={creating} onClose={() => setCreating(false)} />
      <FormModal
        open={reserving}
        onClose={() => setReserving(false)}
        title="Reserve for a Performance"
        subtitle="Reserves each costume assigned to dancers in the performance (casts & assignments)"
        size="sm"
        saveLabel="Reserve"
        onSubmit={() => {
          const sel = (document.getElementById('reserve-perf') as HTMLSelectElement | null)?.value ?? '';
          const r = run(() => reserveForPerformance(sel));
          if (r) {
            toast.success(`${r.reserved} costume reservation(s) made.${r.short.length ? ` Not enough available: ${r.short.join(', ')}.` : ''}`);
            setReserving(false);
          }
        }}
      >
        <Field label="Performance">
          <select id="reserve-perf" className="input" defaultValue="">
            <option value="">Choose…</option>
            {db.performances
              .filter((p) => !p.date || p.date >= todayStr())
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} · {formatDate(p.date)}
                </option>
              ))}
          </select>
        </Field>
      </FormModal>
    </>
  );
}

function CheckoutTable({ rows, edit }: { rows: CostumeCheckout[]; edit: boolean }) {
  const db = useDb();
  const run = useRun();
  const confirm = useConfirm();
  const [returning, setReturning] = useState<CostumeCheckout | null>(null);
  const [q, setQ] = useState('');
  const filtered = rows.filter((c) => {
    const cos = db.costumes.find((x) => x.id === c.costumeId);
    const d = db.dancers.find((x) => x.id === c.dancerId);
    return !q || `${cos?.name} ${cos?.inventoryNumber} ${d ? fullName(d) : ''}`.toLowerCase().includes(q.toLowerCase());
  });
  return (
    <Card>
      <div className="toolbar">
        <SearchInput value={q} onChange={setQ} placeholder="Search costume or dancer…" />
      </div>
      <DataTable
        rows={filtered}
        getId={(c) => c.id}
        initialSort={{ key: 'due', dir: 'asc' }}
        empty={<EmptyState icon={<Shirt size={28} />} title="Nothing here" />}
        rowClassName={(c) => (isCheckoutOverdue(c) ? 'row-warn' : '')}
        columns={[
          {
            key: 'cos',
            header: 'Costume',
            render: (c) => {
              const cos = db.costumes.find((x) => x.id === c.costumeId);
              return (
                <>
                  <Link to={`/costumes/${c.costumeId}`} className="link-strong">
                    {cos?.name ?? 'Removed costume'}
                  </Link>
                  <div className="small faint">
                    {cos?.inventoryNumber} · ×{c.quantity}
                  </div>
                </>
              );
            },
            sortValue: (c) => db.costumes.find((x) => x.id === c.costumeId)?.name ?? '',
          },
          {
            key: 'who',
            header: 'Dancer / use',
            render: (c) => {
              const d = db.dancers.find((x) => x.id === c.dancerId);
              const perf = c.ownerType === 'performance' ? db.performances.find((p) => p.id === c.ownerId) : undefined;
              return (
                <>
                  {d ? <Link to={`/dancers/${d.id}`}>{fullName(d)}</Link> : 'Studio use'}
                  {perf && <div className="small faint">{perf.name}</div>}
                </>
              );
            },
          },
          { key: 'st', header: 'Status', render: (c) => <>{<Badge tone={checkoutTone[c.status]}>{checkoutStatus[c.status]}</Badge>} {isCheckoutOverdue(c) && <Badge tone="danger">Overdue</Badge>}</>, sortValue: (c) => c.status },
          { key: 'out', header: 'Out', render: (c) => (c.checkedOutAt ? formatDateTime(c.checkedOutAt) : '—'), sortValue: (c) => c.checkedOutAt, minor: true },
          { key: 'due', header: 'Due back', render: (c) => (c.status === 'returned' ? `Returned ${formatDateTime(c.returnedAt)}` : formatDate(c.expectedReturn) || '—'), sortValue: (c) => c.expectedReturn },
          { key: 'acc', header: 'Accessories', render: (c) => <span className="small">{c.accessoriesIssued.join(', ') || '—'}{c.missingItems && <div className="bad-text">Missing: {c.missingItems}</div>}</span>, minor: true },
          {
            key: 'act',
            header: '',
            render: (c) =>
              edit && (
                <span className="row-actions">
                  {c.status === 'reserved' && (
                    <>
                      <button className="btn btn-primary btn-sm" onClick={() => run(() => checkOutReserved(c.id, ''), 'Checked out.')}>
                        <PackageOpen size={13} /> Check out
                      </button>
                      <button className="btn btn-ghost btn-sm" onClick={async () => { if (await confirm({ title: 'Cancel reservation?', message: 'The costume becomes available again.', confirmLabel: 'Cancel reservation' })) run(() => cancelCheckout(c.id), 'Reservation cancelled.'); }}>
                        Cancel
                      </button>
                    </>
                  )}
                  {c.status === 'checked_out' && (
                    <button className="btn btn-primary btn-sm" onClick={() => setReturning(c)}>
                      <Undo2 size={13} /> Return
                    </button>
                  )}
                  {(c.status === 'needs_inspection' || c.status === 'needs_repair') && (
                    <button className="btn btn-ghost btn-sm" onClick={() => run(() => clearCheckout(c.id, 'Inspected and put away'), 'Marked as returned.')}>
                      <CheckCircle2 size={13} /> Inspected — put away
                    </button>
                  )}
                </span>
              ),
          },
        ]}
      />
      <ReturnDialog checkout={returning} onClose={() => setReturning(null)} />
    </Card>
  );
}

function ReturnDialog({ checkout, onClose }: { checkout: CostumeCheckout | null; onClose: () => void }) {
  const db = useDb();
  const run = useRun();
  const [cond, setCond] = useState('');
  const [acc, setAcc] = useState<Set<string>>(new Set());
  const [missing, setMissing] = useState('');
  const [outcome, setOutcome] = useState<'returned' | 'needs_inspection' | 'needs_repair'>('returned');
  const [last, setLast] = useState<string | null>(null);
  if ((checkout?.id ?? null) !== last) {
    setLast(checkout?.id ?? null);
    setCond('');
    setAcc(new Set(checkout?.accessoriesIssued ?? []));
    setMissing('');
    setOutcome('returned');
  }
  if (!checkout) return null;
  const cos = db.costumes.find((c) => c.id === checkout.costumeId);
  const notBack = checkout.accessoriesIssued.filter((a) => !acc.has(a));
  return (
    <FormModal
      open
      onClose={onClose}
      title="Return Costume"
      subtitle={`${cos?.name ?? ''} ×${checkout.quantity}`}
      size="sm"
      saveLabel="Record return"
      onSubmit={() => run(() => (returnCheckout(checkout.id, { conditionIn: cond, accessoriesReturned: [...acc], missingItems: [missing, notBack.length ? `Not returned: ${notBack.join(', ')}` : ''].filter(Boolean).join('; '), outcome }), true), outcome === 'needs_repair' ? 'Returned — a repair job was opened.' : 'Return recorded.') && onClose()}
    >
      {checkout.accessoriesIssued.length > 0 && (
        <div className="field">
          <span className="field-label">Accessories returned</span>
          {checkout.accessoriesIssued.map((a) => (
            <label key={a} className="check-inline">
              <input type="checkbox" checked={acc.has(a)} onChange={(e) => { const n = new Set(acc); if (e.target.checked) n.add(a); else n.delete(a); setAcc(n); }} /> {a}
            </label>
          ))}
        </div>
      )}
      <Field label="Condition on return">
        <input className="input" value={cond} onChange={(e) => setCond(e.target.value)} placeholder="e.g. Good, small stain on skirt" />
      </Field>
      <Field label="Missing or damaged items">
        <input className="input" value={missing} onChange={(e) => setMissing(e.target.value)} />
      </Field>
      <Field label="Next step">
        <select className="input" value={outcome} onChange={(e) => setOutcome(e.target.value as typeof outcome)}>
          <option value="returned">Back on the shelf</option>
          <option value="needs_inspection">Needs inspection</option>
          <option value="needs_repair">Needs repair (opens a repair job)</option>
        </select>
      </Field>
    </FormModal>
  );
}

export function CheckoutDialog({ open, onClose, costumeId }: { open: boolean; onClose: () => void; costumeId?: ID }) {
  const db = useDb();
  const run = useRun();
  const blank = (): CheckoutInput => ({ costumeId: costumeId ?? '', dancerId: null, ownerType: null, ownerId: null, quantity: 1, status: 'checked_out', expectedReturn: '', conditionOut: '', accessoriesIssued: [], notes: '' });
  const [f, setF] = useState<CheckoutInput>(blank);
  const [override, setOverride] = useState('');
  const [last, setLast] = useState(false);
  if (open !== last) {
    setLast(open);
    if (open) {
      const b = blank();
      setF({ ...b, accessoriesIssued: db.accessories.filter((a) => a.costumeId === b.costumeId).map((a) => a.name) });
      setOverride('');
    }
  }
  const set = (patch: Partial<CheckoutInput>) => setF({ ...f, ...patch });
  const cos = db.costumes.find((c) => c.id === f.costumeId);
  const avail = cos ? availableQty(db, cos.id) : 0;
  const needsOverride = !!cos && (cos.status === 'in_progress' || f.quantity > avail);
  const accs = db.accessories.filter((a) => a.costumeId === f.costumeId);
  return (
    <FormModal open={open} onClose={onClose} title="Check Out / Reserve Costume" onSubmit={() => run(() => createCheckout(f, { override }), f.status === 'reserved' ? 'Costume reserved.' : 'Costume checked out.') && onClose()}>
      <Field label="Costume" required>
        <SearchSelect ariaLabel="Costume" value={f.costumeId} onChange={(v) => set({ costumeId: v, accessoriesIssued: db.accessories.filter((a) => a.costumeId === v).map((a) => a.name) })} options={costumeOptions(db)} />
      </Field>
      {cos && (
        <p className="small">
          <Badge tone={availTone[availability(db, cos.id)]}>{availabilityLabels[availability(db, cos.id)]}</Badge> {avail} of {cos.quantity} available
          {cos.status === 'in_progress' && <span className="bad-text"> · IN PROGRESS (repair / cleaning)</span>}
        </p>
      )}
      <div className="grid-2">
        <Field label="Dancer">
          <SearchSelect ariaLabel="Dancer" value={f.dancerId ?? ''} onChange={(v) => set({ dancerId: v || null })} options={dancerOptions(db)} noneLabel="Studio use" />
        </Field>
        <Field label="For performance">
          <select className="input" value={f.ownerId ?? ''} onChange={(e) => set({ ownerId: e.target.value || null, ownerType: e.target.value ? 'performance' : null, expectedReturn: f.expectedReturn || db.performances.find((p) => p.id === e.target.value)?.date || '' })}>
            <option value="">—</option>
            {db.performances.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · {formatDate(p.date)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Action">
          <select className="input" value={f.status} onChange={(e) => set({ status: e.target.value as CheckoutInput['status'] })}>
            <option value="checked_out">Check out now</option>
            <option value="reserved">Reserve (check out later)</option>
          </select>
        </Field>
        <Field label="Quantity">
          <input className="input" type="number" min={1} value={f.quantity} onChange={(e) => set({ quantity: Number(e.target.value) })} />
        </Field>
        <Field label="Expected return">
          <input className="input" type="date" value={f.expectedReturn} onChange={(e) => set({ expectedReturn: e.target.value })} />
        </Field>
        <Field label="Condition going out">
          <input className="input" value={f.conditionOut} onChange={(e) => set({ conditionOut: e.target.value })} />
        </Field>
      </div>
      {accs.length > 0 && (
        <div className="field">
          <span className="field-label">Accessories issued</span>
          {accs.map((a) => (
            <label key={a.id} className="check-inline">
              <input type="checkbox" checked={f.accessoriesIssued.includes(a.name)} onChange={(e) => set({ accessoriesIssued: e.target.checked ? [...f.accessoriesIssued, a.name] : f.accessoriesIssued.filter((x) => x !== a.name) })} /> {a.name} <span className="faint small">({a.quantity} owned)</span>
            </label>
          ))}
        </div>
      )}
      <Field label="Notes">
        <input className="input" value={f.notes} onChange={(e) => set({ notes: e.target.value })} />
      </Field>
      {needsOverride && (
        <Field label="Override reason (required)" hint="This costume isn't fully available. Explain why it's OK — the reason is saved in the costume's log.">
          <input className="input" value={override} onChange={(e) => setOverride(e.target.value)} />
        </Field>
      )}
    </FormModal>
  );
}

function AvailabilityTable() {
  const db = useDb();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('');
  const rows = db.costumes.filter((c) => c.kind !== 'prop' && (!q || `${c.name} ${c.inventoryNumber}`.toLowerCase().includes(q.toLowerCase())) && (!filter || availability(db, c.id) === filter));
  return (
    <Card>
      <div className="toolbar">
        <SearchInput value={q} onChange={setQ} placeholder="Search costumes…" />
        <select className="input input-auto" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter availability">
          <option value="">All</option>
          {Object.entries(availabilityLabels).map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </select>
      </div>
      <DataTable
        rows={rows}
        getId={(c) => c.id}
        columns={[
          { key: 'n', header: 'Costume', render: (c) => <><Link to={`/costumes/${c.id}`} className="link-strong">{c.name}</Link><div className="small faint">{c.inventoryNumber} · {c.size}</div></>, sortValue: (c) => c.name },
          { key: 'a', header: 'Availability', render: (c) => <Badge tone={availTone[availability(db, c.id)]}>{availabilityLabels[availability(db, c.id)]}</Badge>, sortValue: (c) => availability(db, c.id) },
          { key: 'q', header: 'Available', render: (c) => `${availableQty(db, c.id)} of ${c.quantity}`, sortValue: (c) => availableQty(db, c.id) },
          { key: 'o', header: 'Out / reserved', render: (c) => db.checkouts.filter((x) => x.costumeId === c.id && ACTIVE_CHECKOUT.includes(x.status)).map((x) => `${db.dancers.find((d) => d.id === x.dancerId)?.firstName ?? 'Studio'} (${checkoutStatus[x.status].toLowerCase()})`).join(', ') || '—', minor: true },
        ]}
      />
    </Card>
  );
}

/* ====================================================== family view */

/** Recital numbers, show details and costume checkouts for a family's dancers. */
export function FamilyRecitalCard({ dancerIds }: { dancerIds: ID[] }) {
  const db = useDb();
  const nums = db.recitalNumbers.filter((n) => {
    const ids = n.classId ? classDancers(db, n.classId) : n.teamId ? db.teams.find((t) => t.id === n.teamId)?.dancerIds ?? [] : [];
    return ids.some((d) => dancerIds.includes(d));
  });
  const recitals = db.recitals.filter((r) => r.status !== 'completed' && nums.some((n) => n.recitalId === r.id));
  const outs = db.checkouts.filter((c) => c.dancerId && dancerIds.includes(c.dancerId) && ACTIVE_CHECKOUT.includes(c.status));
  if (!recitals.length && !outs.length) return null;
  return (
    <>
      {recitals.map((r) => (
        <Card key={r.id} title={r.name} icon={<Theater size={18} />}>
          <p className="small">
            {formatDate(r.startDate)} · {r.venue}
            {r.address && ` · ${r.address}`}
          </p>
          {r.performanceTimes && <p className="small prewrap"><strong>Performances:</strong> {r.performanceTimes}</p>}
          {r.rehearsalSchedule && <p className="small prewrap"><strong>Rehearsals:</strong> {r.rehearsalSchedule}</p>}
          {r.pictureDay && <p className="small"><strong>Picture day:</strong> {formatDate(r.pictureDay)}</p>}
          <table className="table">
            <thead>
              <tr>
                <th>Number</th>
                <th>Dancer</th>
                <th>Costume & accessories</th>
                <th>Hair, shoes & tights</th>
              </tr>
            </thead>
            <tbody>
              {nums
                .filter((n) => n.recitalId === r.id)
                .sort((a, b) => a.order - b.order)
                .map((n) => {
                  const ids = (n.classId ? classDancers(db, n.classId) : db.teams.find((t) => t.id === n.teamId)?.dancerIds ?? []).filter((d) => dancerIds.includes(d));
                  return (
                    <tr key={n.id}>
                      <td>
                        <strong>{n.title}</strong>
                        {n.song && <div className="small faint">“{n.song}”</div>}
                      </td>
                      <td>{ids.map((d) => db.dancers.find((x) => x.id === d)?.firstName).join(', ')}</td>
                      <td className="small">
                        {db.costumes.find((c) => c.id === n.costumeId)?.name ?? 'To be announced'}
                        {n.accessoryNotes && <div className="faint">{n.accessoryNotes}</div>}
                      </td>
                      <td className="small">{[n.hairMakeup, n.shoesTights].filter(Boolean).join(' · ') || '—'}</td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </Card>
      ))}
      {outs.length > 0 && (
        <Card title="Costumes checked out to your family" icon={<Shirt size={18} />}>
          <ul className="mini-list">
            {outs.map((c) => (
              <li key={c.id}>
                <span>
                  <strong>{db.costumes.find((x) => x.id === c.costumeId)?.name}</strong> <span className="small faint">· {db.dancers.find((d) => d.id === c.dancerId)?.firstName}</span>
                  {c.accessoriesIssued.length > 0 && <div className="small faint">With: {c.accessoriesIssued.join(', ')}</div>}
                </span>
                <span className="small">
                  <Badge tone={isCheckoutOverdue(c) ? 'danger' : checkoutTone[c.status]}>{isCheckoutOverdue(c) ? 'Overdue' : checkoutStatus[c.status]}</Badge> {c.expectedReturn && `Return by ${formatDate(c.expectedReturn)}`}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}

export type { RecitalNumber };

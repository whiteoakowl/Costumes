import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowRightLeft, CheckCircle2, Copy, Pencil, Plus, Shirt, Trash2, UserMinus, UserPlus, Users, X } from 'lucide-react';
import { Modal } from './Modal';
import { Badge, Card, CheckList, EmptyState, Field, ProgressRing, SearchInput, SearchSelect, StatusBadge, type Option } from './ui';
import { useConfirm, useRun } from './feedback';
import { useEditors } from './editors';
import { useDb } from '../data/store';
import {
  addCostumesToOwner,
  addDancersToCast,
  assignCostumes,
  changeAssignmentCostume,
  createCast,
  deleteCast,
  duplicateCast,
  moveCastMembers,
  removeAssignments,
  removeCastMembers,
  removeCostumeFromOwner,
  renameCast,
  setMemberRole,
} from '../data/actions';
import { accessoriesFor, buildOverview, byId, castsFor, fullName, issueLabels, ownerCostumeIds, sortedCategories, sortedDancers, type OverviewRow, type Readiness } from '../data/selectors';
import type { CastList, Database, ID, OwnerType } from '../data/types';

const CAST_SUGGESTIONS: Record<OwnerType, string[]> = {
  show: ['Cast A', 'Cast B', 'Saturday Cast', 'Sunday Cast', 'Understudy Cast', 'Alternate Cast'],
  performance: ['Cast A', 'Cast B', 'Saturday Performance', 'Sunday Performance', 'Matinee', 'Evening Performance'],
};

function costumeOptions(db: Database, onlyIds?: ID[]): Option[] {
  const cats = byId(db.categories);
  const order = new Map(sortedCategories(db).map((c, i) => [c.id, i]));
  const list = onlyIds ? db.costumes.filter((c) => onlyIds.includes(c.id)) : db.costumes;
  return [...list]
    .sort((a, b) => (order.get(a.categoryId ?? '') ?? 999) - (order.get(b.categoryId ?? '') ?? 999) || a.name.localeCompare(b.name))
    .map((c) => ({
      value: c.id,
      label: c.name,
      hint: `${c.inventoryNumber} · ${c.size || 'no size'} · qty ${c.quantity}${c.status === 'in_progress' ? ' · IN PROGRESS' : ''}`,
      group: c.categoryId ? cats.get(c.categoryId)?.name ?? 'Uncategorized' : 'Uncategorized',
    }));
}

/* ================================================================ casts */

export function CastManager({ ownerType, ownerId }: { ownerType: OwnerType; ownerId: ID }) {
  const db = useDb();
  const run = useRun();
  const confirm = useConfirm();
  const casts = castsFor(db, ownerType, ownerId);
  const [newOpen, setNewOpen] = useState(false);
  const [rename, setRename] = useState<CastList | null>(null);
  const [addTo, setAddTo] = useState<CastList | null>(null);

  const { rows } = useMemo(() => buildOverview(db, ownerType, ownerId), [db, ownerType, ownerId]);

  return (
    <Card
      title="Cast Lists"
      icon={<Users size={18} />}
      actions={
        <button className="btn btn-primary btn-sm" onClick={() => setNewOpen(true)}>
          <Plus size={15} /> New cast list
        </button>
      }
    >
      {!casts.length ? (
        <EmptyState
          icon={<Users size={26} />}
          title="No cast lists yet"
          message="Create a cast list (e.g. Cast A, Saturday Cast), then add dancers to it."
          action={
            <button className="btn btn-primary" onClick={() => setNewOpen(true)}>
              <Plus size={16} /> New cast list
            </button>
          }
        />
      ) : (
        <div className="cast-grid">
          {casts.map((cast) => (
            <CastCard
              key={cast.id}
              cast={cast}
              casts={casts}
              rows={rows.filter((r) => r.castId === cast.id)}
              onRename={() => setRename(cast)}
              onAdd={() => setAddTo(cast)}
              onDuplicate={() => run(() => duplicateCast(cast.id), `“${cast.name}” duplicated with its dancers and costumes.`)}
              onDelete={async () => {
                const n = db.castMembers.filter((m) => m.castId === cast.id).length;
                if (await confirm({ title: 'Delete cast list?', message: <>Delete “{cast.name}”? {n ? `${n} dancer${n === 1 ? '' : 's'} will be removed from this cast and their costume assignments in it will be cleared.` : ''} Dancers themselves are not deleted.</>, confirmLabel: 'Delete cast list', danger: true }))
                  run(() => deleteCast(cast.id), 'Cast list deleted.');
              }}
            />
          ))}
        </div>
      )}
      <CastNameDialog
        open={newOpen}
        title="New Cast List"
        suggestions={CAST_SUGGESTIONS[ownerType].filter((s) => !casts.some((c) => c.name.toLowerCase() === s.toLowerCase()))}
        onClose={() => setNewOpen(false)}
        onSave={(name) => !!run(() => createCast(ownerType, ownerId, name), `“${name}” created.`)}
      />
      <CastNameDialog open={!!rename} title="Rename Cast List" initial={rename?.name} onClose={() => setRename(null)} onSave={(name) => !!run(() => (renameCast(rename!.id, name), true), 'Cast list renamed.')} />
      <AddDancersDialog cast={addTo} onClose={() => setAddTo(null)} />
    </Card>
  );
}

function CastCard({ cast, casts, rows, onRename, onAdd, onDuplicate, onDelete }: { cast: CastList; casts: CastList[]; rows: OverviewRow[]; onRename: () => void; onAdd: () => void; onDuplicate: () => void; onDelete: () => void }) {
  const db = useDb();
  const run = useRun();
  const [selected, setSelected] = useState<Set<ID>>(new Set());
  const [moveTarget, setMoveTarget] = useState('');
  const dancers = byId(db.dancers);
  const members = db.castMembers
    .filter((m) => m.castId === cast.id && dancers.has(m.dancerId))
    .sort((a, b) => fullName(dancers.get(a.dancerId)!).localeCompare(fullName(dancers.get(b.dancerId)!)));
  const others = casts.filter((c) => c.id !== cast.id);
  const toggle = (id: ID) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };
  const ids = [...selected].filter((id) => members.some((m) => m.id === id));

  return (
    <div className="cast-card">
      <div className="cast-head">
        <div>
          <h3>{cast.name}</h3>
          <span className="small faint">
            {members.length} dancer{members.length === 1 ? '' : 's'}
          </span>
        </div>
        <div className="row-actions">
          <button className="icon-btn" title="Add dancers" aria-label={`Add dancers to ${cast.name}`} onClick={onAdd}>
            <UserPlus size={16} />
          </button>
          <button className="icon-btn" title="Rename" aria-label={`Rename ${cast.name}`} onClick={onRename}>
            <Pencil size={16} />
          </button>
          <button className="icon-btn" title="Duplicate" aria-label={`Duplicate ${cast.name}`} onClick={onDuplicate}>
            <Copy size={16} />
          </button>
          <button className="icon-btn danger" title="Delete" aria-label={`Delete ${cast.name}`} onClick={onDelete}>
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      {!members.length ? (
        <div className="cast-empty">
          <p className="faint small">No dancers in this cast yet.</p>
          <button className="btn btn-ghost btn-sm" onClick={onAdd}>
            <UserPlus size={15} /> Add dancers
          </button>
        </div>
      ) : (
        <ul className="member-list">
          {members.map((m) => {
            const d = dancers.get(m.dancerId)!;
            const mine = rows.filter((r) => r.dancerId === d.id);
            const costumeCount = mine.filter((r) => r.costume).length;
            const issues = mine.some((r) => r.issues.length);
            return (
              <li key={m.id} className={selected.has(m.id) ? 'on' : ''}>
                <input type="checkbox" checked={selected.has(m.id)} onChange={() => toggle(m.id)} aria-label={`Select ${fullName(d)}`} />
                <div className="member-main">
                  <Link to={`/dancers/${d.id}`} className="link-strong">
                    {fullName(d)}
                  </Link>
                  <input
                    className="role-input"
                    defaultValue={m.role}
                    placeholder="Role…"
                    aria-label={`Role for ${fullName(d)}`}
                    onBlur={(e) => e.target.value.trim() !== m.role && run(() => setMemberRole(m.id, e.target.value))}
                    onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                  />
                </div>
                <span className={`chip ${costumeCount ? (issues ? 'chip-warn' : 'chip-ok') : 'chip-bad'}`} title={costumeCount ? `${costumeCount} costume(s)` : 'No costume assigned'}>
                  <Shirt size={12} /> {costumeCount}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {ids.length > 0 && (
        <div className="cast-bulk">
          <span className="small">
            <strong>{ids.length}</strong> selected
          </span>
          {others.length > 0 && (
            <>
              <select className="input input-sm" value={moveTarget} onChange={(e) => setMoveTarget(e.target.value)} aria-label="Move to cast">
                <option value="">Move to…</option>
                {others.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <button
                className="btn btn-ghost btn-sm"
                disabled={!moveTarget}
                onClick={() => {
                  const target = others.find((c) => c.id === moveTarget);
                  if (run(() => (moveCastMembers(ids, moveTarget), true), `Moved ${ids.length} dancer${ids.length === 1 ? '' : 's'} to ${target?.name}.`)) {
                    setSelected(new Set());
                    setMoveTarget('');
                  }
                }}
              >
                <ArrowRightLeft size={14} /> Move
              </button>
            </>
          )}
          <button
            className="btn btn-ghost btn-sm danger"
            onClick={() => {
              if (run(() => (removeCastMembers(ids), true), `Removed ${ids.length} dancer${ids.length === 1 ? '' : 's'} from ${cast.name}.`)) setSelected(new Set());
            }}
          >
            <UserMinus size={14} /> Remove
          </button>
        </div>
      )}
    </div>
  );
}

function CastNameDialog({ open, title, initial = '', suggestions = [], onClose, onSave }: { open: boolean; title: string; initial?: string; suggestions?: string[]; onClose: () => void; onSave: (name: string) => boolean }) {
  const [name, setName] = useState(initial);
  const [lastOpen, setLastOpen] = useState(false);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) setName(initial);
  }
  const save = () => {
    if (onSave(name)) onClose();
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={save}>
            Save
          </button>
        </>
      }
    >
      <Field label="Cast list name" required>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()} autoFocus />
      </Field>
      {suggestions.length > 0 && (
        <div className="chips">
          {suggestions.map((s) => (
            <button key={s} type="button" className="chip chip-btn" onClick={() => setName(s)}>
              {s}
            </button>
          ))}
        </div>
      )}
    </Modal>
  );
}

function AddDancersDialog({ cast, onClose }: { cast: CastList | null; onClose: () => void }) {
  const db = useDb();
  const run = useRun();
  const { editDancer } = useEditors();
  const [selected, setSelected] = useState<Set<ID>>(new Set());
  const [lastCast, setLastCast] = useState<ID | null>(null);
  if ((cast?.id ?? null) !== lastCast) {
    setLastCast(cast?.id ?? null);
    setSelected(new Set());
  }
  const already = new Set(cast ? db.castMembers.filter((m) => m.castId === cast.id).map((m) => m.dancerId) : []);
  const options = sortedDancers(db)
    .filter((d) => !already.has(d.id))
    .map((d) => ({ value: d.id, label: fullName(d), hint: [d.level, d.costumeSize].filter(Boolean).join(' · '), group: d.level || 'No level' }))
    .sort((a, b) => a.group.localeCompare(b.group) || a.label.localeCompare(b.label));
  const save = () => {
    if (!cast) return;
    if (run(() => (addDancersToCast(cast.id, [...selected]), true), `Added ${selected.size} dancer${selected.size === 1 ? '' : 's'} to ${cast.name}.`)) onClose();
  };
  return (
    <Modal
      open={!!cast}
      onClose={onClose}
      title={`Add Dancers to ${cast?.name ?? ''}`}
      footer={
        <>
          <button className="btn btn-ghost" onClick={() => editDancer()}>
            <Plus size={15} /> New dancer
          </button>
          <span className="spacer" />
          <button className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={save} disabled={!selected.size}>
            Add {selected.size || ''} dancer{selected.size === 1 ? '' : 's'}
          </button>
        </>
      }
    >
      <CheckList options={options} selected={selected} onChange={setSelected} emptyText={db.dancers.length ? 'Every dancer is already in this cast.' : 'No dancers yet — add one first.'} />
    </Modal>
  );
}

/* ========================================================== assignments */

export function CostumeListPanel({ ownerType, ownerId }: { ownerType: OwnerType; ownerId: ID }) {
  const db = useDb();
  const run = useRun();
  const confirm = useConfirm();
  const [adding, setAdding] = useState(false);
  const [assignFor, setAssignFor] = useState<ID[] | null>(null);
  const ids = ownerCostumeIds(db, ownerType, ownerId);
  const { rows } = useMemo(() => buildOverview(db, ownerType, ownerId), [db, ownerType, ownerId]);
  const costumes = db.costumes.filter((c) => ids.includes(c.id)).sort((a, b) => a.name.localeCompare(b.name));
  const cats = byId(db.categories);
  const locs = byId(db.storageLocations);

  return (
    <Card
      title="Costume List"
      icon={<Shirt size={18} />}
      actions={
        <>
          <button className="btn btn-ghost btn-sm" onClick={() => setAdding(true)}>
            <Plus size={15} /> Add costumes
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => setAssignFor([])} disabled={!castsFor(db, ownerType, ownerId).length}>
            <UserPlus size={15} /> Assign costumes
          </button>
        </>
      }
    >
      {!costumes.length ? (
        <EmptyState
          icon={<Shirt size={26} />}
          title="No costumes on this list yet"
          message="Add costumes from your inventory, then assign them to dancers or whole casts."
          action={
            <button className="btn btn-primary" onClick={() => setAdding(true)}>
              <Plus size={16} /> Add costumes
            </button>
          }
        />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Costume</th>
                <th className="minor">Category</th>
                <th>Size</th>
                <th className="minor">Qty</th>
                <th className="minor">Location</th>
                <th>Status</th>
                <th>Wearing</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {costumes.map((c) => {
                const wearing = rows.filter((r) => r.costume?.id === c.id).length;
                return (
                  <tr key={c.id}>
                    <td>
                      <Link to={`/costumes/${c.id}`} className="link-strong">
                        {c.name}
                      </Link>
                      <div className="small faint">{c.inventoryNumber}</div>
                    </td>
                    <td className="minor">{c.categoryId ? cats.get(c.categoryId)?.name : <span className="faint">Uncategorized</span>}</td>
                    <td>{c.size || <span className="faint">—</span>}</td>
                    <td className="minor">{c.quantity}</td>
                    <td className="minor">{c.storageLocationId ? locs.get(c.storageLocationId)?.name : <span className="faint">Unassigned</span>}</td>
                    <td>
                      <StatusBadge costume={c} compact />
                    </td>
                    <td>{wearing ? `${wearing} dancer${wearing === 1 ? '' : 's'}` : <span className="faint">Not assigned</span>}</td>
                    <td className="row-actions">
                      <button className="btn btn-ghost btn-sm" onClick={() => setAssignFor([c.id])} disabled={!castsFor(db, ownerType, ownerId).length}>
                        Assign
                      </button>
                      <button
                        className="icon-btn danger"
                        aria-label={`Remove ${c.name} from list`}
                        title="Remove from this list"
                        onClick={async () => {
                          if (
                            await confirm({
                              title: 'Remove costume from list?',
                              message: wearing ? `“${c.name}” is assigned to ${wearing} dancer(s) here. Those assignments will be removed too. The costume stays in your inventory.` : `Remove “${c.name}” from this list? The costume stays in your inventory.`,
                              confirmLabel: 'Remove',
                              danger: true,
                            })
                          )
                            run(() => removeCostumeFromOwner(ownerType, ownerId, c.id), 'Costume removed from list.');
                        }}
                      >
                        <X size={16} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <AddCostumesDialog open={adding} onClose={() => setAdding(false)} ownerType={ownerType} ownerId={ownerId} />
      <AssignDialog open={!!assignFor} onClose={() => setAssignFor(null)} ownerType={ownerType} ownerId={ownerId} initialCostumes={assignFor ?? []} />
    </Card>
  );
}

function AddCostumesDialog({ open, onClose, ownerType, ownerId }: { open: boolean; onClose: () => void; ownerType: OwnerType; ownerId: ID }) {
  const db = useDb();
  const run = useRun();
  const { editCostume } = useEditors();
  const [source, setSource] = useState('all'); // 'all' | 'cat:<id>' | 'show:<id>'
  const [selected, setSelected] = useState<Set<ID>>(new Set());
  const [lastOpen, setLastOpen] = useState(false);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) {
      setSelected(new Set());
      // Default to this show's category so the right costumes appear first.
      const showId = ownerType === 'show' ? ownerId : db.performances.find((p) => p.id === ownerId)?.showId;
      if (ownerType === 'performance' && showId && ownerCostumeIds(db, 'show', showId).length) setSource(`show:${showId}`);
      else {
        const catId = showId ? db.shows.find((s) => s.id === showId)?.categoryId : null;
        setSource(catId ? `cat:${catId}` : 'all');
      }
    }
  }
  const existing = new Set(ownerCostumeIds(db, ownerType, ownerId));
  let pool = db.costumes.map((c) => c.id);
  if (source.startsWith('cat:')) pool = db.costumes.filter((c) => c.categoryId === source.slice(4)).map((c) => c.id);
  if (source === 'cat:none') pool = db.costumes.filter((c) => !c.categoryId).map((c) => c.id);
  if (source.startsWith('show:')) pool = ownerCostumeIds(db, 'show', source.slice(5));
  const options = costumeOptions(db, pool.filter((id) => !existing.has(id)));
  const sources: Option[] = [
    { value: 'all', label: 'All costumes' },
    ...sortedCategories(db).map((c) => ({ value: `cat:${c.id}`, label: `Category: ${c.name}` })),
    { value: 'cat:none', label: 'Category: Uncategorized' },
    ...db.shows.filter((s) => !(ownerType === 'show' && s.id === ownerId)).map((s) => ({ value: `show:${s.id}`, label: `Show costume list: ${s.name}` })),
  ];
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add Costumes"
      subtitle="Step 1: choose a show or category · Step 2: tick the costumes to add"
      footer={
        <>
          <button className="btn btn-ghost" onClick={() => editCostume()}>
            <Plus size={15} /> New costume
          </button>
          <span className="spacer" />
          <button className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={!selected.size} onClick={() => run(() => (addCostumesToOwner(ownerType, ownerId, [...selected]), true), `Added ${selected.size} costume${selected.size === 1 ? '' : 's'}.`) && onClose()}>
            Add {selected.size || ''} costume{selected.size === 1 ? '' : 's'}
          </button>
        </>
      }
    >
      <Field label="Show or costume category">
        <SearchSelect ariaLabel="Show or costume category" value={source} onChange={(v) => setSource(v || 'all')} options={sources} />
      </Field>
      <CheckList options={options} selected={selected} onChange={setSelected} emptyText="No more costumes to add from this list." />
    </Modal>
  );
}

function AssignDialog({ open, onClose, ownerType, ownerId, initialCostumes }: { open: boolean; onClose: () => void; ownerType: OwnerType; ownerId: ID; initialCostumes: ID[] }) {
  const db = useDb();
  const run = useRun();
  const casts = castsFor(db, ownerType, ownerId);
  const [castId, setCastId] = useState('');
  const [mode, setMode] = useState<'dancers' | 'cast'>('dancers');
  const [costumes, setCostumes] = useState<Set<ID>>(new Set());
  const [dancers, setDancers] = useState<Set<ID>>(new Set());
  const [showAll, setShowAll] = useState(false);
  const [lastOpen, setLastOpen] = useState(false);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) {
      setCastId(casts[0]?.id ?? '');
      setMode('dancers');
      setCostumes(new Set(initialCostumes));
      setDancers(new Set());
      setShowAll(!ownerCostumeIds(db, ownerType, ownerId).length);
    }
  }
  const dancerMap = byId(db.dancers);
  const members = db.castMembers.filter((m) => m.castId === castId && dancerMap.has(m.dancerId));
  const listIds = ownerCostumeIds(db, ownerType, ownerId);
  const costumeOpts = costumeOptions(db, showAll ? undefined : [...new Set([...listIds, ...initialCostumes])]);
  const dancerOpts = members
    .map((m) => {
      const d = dancerMap.get(m.dancerId)!;
      return { value: d.id, label: fullName(d), hint: [m.role, d.costumeSize && `size ${d.costumeSize}`].filter(Boolean).join(' · ') };
    })
    .sort((a, b) => a.label.localeCompare(b.label));
  const save = () => {
    const castName = casts.find((c) => c.id === castId)?.name;
    const ok = run(
      () => (assignCostumes({ ownerType, ownerId, costumeIds: [...costumes], castId: castId || null, dancerIds: mode === 'cast' ? [] : [...dancers] }), true),
      mode === 'cast' ? `Assigned to everyone in ${castName}.` : `Assigned to ${dancers.size} dancer${dancers.size === 1 ? '' : 's'}.`,
    );
    if (ok) onClose();
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Assign Costumes"
      size="lg"
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={save} disabled={!costumes.size || !castId || (mode === 'dancers' && !dancers.size)}>
            Assign
          </button>
        </>
      }
    >
      <div className="grid-2 assign-grid">
        <div>
          <h4 className="mini-title">1. Costumes</h4>
          <label className="check-inline small">
            <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} /> Show all costumes in inventory
          </label>
          <CheckList options={costumeOpts} selected={costumes} onChange={setCostumes} height={300} emptyText="Add costumes to this list first, or tick “Show all costumes”." />
        </div>
        <div>
          <h4 className="mini-title">2. Who wears them?</h4>
          <Field label="Cast list">
            <select className="input" value={castId} onChange={(e) => (setCastId(e.target.value), setDancers(new Set()))}>
              {casts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <div className="segmented full">
            <button type="button" className={mode === 'dancers' ? 'on' : ''} onClick={() => setMode('dancers')}>
              Specific dancers
            </button>
            <button type="button" className={mode === 'cast' ? 'on' : ''} onClick={() => setMode('cast')}>
              Entire cast
            </button>
          </div>
          {mode === 'dancers' ? (
            <CheckList options={dancerOpts} selected={dancers} onChange={setDancers} height={220} emptyText="This cast has no dancers yet." />
          ) : (
            <p className="small faint pad">Everyone in this cast ({members.length} dancers) — including dancers added later — will wear the selected costume(s).</p>
          )}
        </div>
      </div>
    </Modal>
  );
}

/* ============================================================ overview */

export function ReadinessSummary({ readiness, compact }: { readiness: Readiness; compact?: boolean }) {
  const r = readiness;
  return (
    <div className={`readiness ${compact ? 'compact' : ''}`}>
      <ProgressRing percent={r.percent} size={compact ? 76 : 104} />
      <div className="readiness-stats">
        <div>
          <strong>{r.totalDancers}</strong>
          <span>Dancers</span>
        </div>
        <div>
          <strong>{r.totalAssignments}</strong>
          <span>Assignments</span>
        </div>
        <div className="ok">
          <strong>{r.ready}</strong>
          <span>Costumes ready</span>
        </div>
        <div className={r.needsWork ? 'warn' : ''}>
          <strong>{r.needsWork}</strong>
          <span>Need repairs</span>
        </div>
        <div className={r.missingAssignments ? 'bad' : ''}>
          <strong>{r.missingAssignments}</strong>
          <span>Missing assignments</span>
        </div>
        {!compact && (
          <div className={r.missingAccessoryCount ? 'warn' : ''}>
            <strong>{r.missingAccessoryCount}</strong>
            <span>Accessory warnings</span>
          </div>
        )}
      </div>
    </div>
  );
}

export function AttentionList({ readiness }: { readiness: Readiness }) {
  const { unassignedDancers, incompleteDancers } = readiness;
  if (!unassignedDancers.length && !incompleteDancers.length) {
    return (
      <div className="all-good">
        <CheckCircle2 size={18} /> Everything looks ready — no warnings.
      </div>
    );
  }
  return (
    <div className="attention">
      {unassignedDancers.length > 0 && (
        <div>
          <h4 className="mini-title bad">
            <AlertTriangle size={15} /> Unassigned dancers ({unassignedDancers.length})
          </h4>
          <ul>
            {unassignedDancers.map((u) => (
              <li key={`${u.castName}:${u.dancerId}`}>
                <Link to={`/dancers/${u.dancerId}`}>{u.dancerName}</Link> <span className="faint">· {u.castName}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {incompleteDancers.length > 0 && (
        <div>
          <h4 className="mini-title warn">
            <AlertTriangle size={15} /> Needs attention ({incompleteDancers.length})
          </h4>
          <ul>
            {incompleteDancers.map((u) => (
              <li key={`${u.castName}:${u.dancerId}`}>
                <Link to={`/dancers/${u.dancerId}`}>{u.dancerName}</Link> <span className="faint">· {u.castName}</span>
                <div className="small faint">{u.issues.join(' · ')}</div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function CostumeOverviewTable({ ownerType, ownerId }: { ownerType: OwnerType; ownerId: ID }) {
  const db = useDb();
  const run = useRun();
  const confirm = useConfirm();
  const { rows } = useMemo(() => buildOverview(db, ownerType, ownerId), [db, ownerType, ownerId]);
  const casts = castsFor(db, ownerType, ownerId);
  const [castFilter, setCastFilter] = useState('');
  const [onlyIssues, setOnlyIssues] = useState(false);
  const [q, setQ] = useState('');
  const [changing, setChanging] = useState<OverviewRow | null>(null);

  const shown = rows.filter(
    (r) =>
      (!castFilter || r.castId === castFilter) &&
      (!onlyIssues || r.issues.length) &&
      (!q || `${r.dancerName} ${r.costume?.name ?? ''} ${r.role}`.toLowerCase().includes(q.toLowerCase())),
  );

  return (
    <Card title="Costume Overview" icon={<Shirt size={18} />}>
      {!rows.length ? (
        <EmptyState icon={<Users size={26} />} title="Nothing to show yet" message="Create a cast list and add dancers — each dancer appears here with the costumes they'll wear." />
      ) : (
        <>
          <div className="toolbar">
            <SearchInput value={q} onChange={setQ} placeholder="Search dancer or costume…" />
            <select className="input input-auto" value={castFilter} onChange={(e) => setCastFilter(e.target.value)} aria-label="Filter by cast">
              <option value="">All casts</option>
              {casts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <label className="check-inline">
              <input type="checkbox" checked={onlyIssues} onChange={(e) => setOnlyIssues(e.target.checked)} /> Only show warnings
            </label>
          </div>
          <div className="table-wrap">
            <table className="table overview">
              <thead>
                <tr>
                  <th>Dancer</th>
                  <th>Cast</th>
                  <th>Costume</th>
                  <th>Size</th>
                  <th className="minor">Accessories</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.key} className={r.issues.includes('no_costume') ? 'row-bad' : r.issues.length ? 'row-warn' : ''}>
                    <td>
                      <Link to={`/dancers/${r.dancerId}`} className="link-strong">
                        {r.dancerName}
                      </Link>
                      {r.role && <div className="small faint">{r.role}</div>}
                    </td>
                    <td>{r.castName}</td>
                    <td>
                      {r.costume ? (
                        <>
                          <Link to={`/costumes/${r.costume.id}`}>{r.costume.name}</Link>
                          <div className="small faint">
                            {r.costume.inventoryNumber}
                            {r.viaCast && ' · whole cast'}
                          </div>
                        </>
                      ) : (
                        <Badge tone="danger">
                          <AlertTriangle size={12} /> Missing costume
                        </Badge>
                      )}
                    </td>
                    <td>
                      {r.costume?.size || <span className="faint">—</span>}
                      {r.issues.includes('size_mismatch') && <div className="small warn-text">Dancer: {r.dancerSize}</div>}
                    </td>
                    <td className="minor">
                      {r.accessories.length ? (
                        r.accessories.map((a) => (
                          <span key={a.id} className={`acc-pill ${a.quantity <= 0 ? 'missing' : ''}`}>
                            {a.name}
                            {a.quantity <= 0 ? ' — missing' : ` ×${a.quantity}`}
                          </span>
                        ))
                      ) : r.costume ? (
                        <span className="faint">None</span>
                      ) : null}
                    </td>
                    <td>
                      {r.costume && <StatusBadge costume={r.costume} compact />}
                      {r.issues
                        .filter((i) => i !== 'no_costume' && i !== 'not_ready')
                        .map((i) => (
                          <div key={i} className="small warn-text" title={r.issueDetails.join('\n')}>
                            <AlertTriangle size={11} /> {issueLabels[i]}
                          </div>
                        ))}
                    </td>
                    <td className="row-actions">
                      {r.assignment && (
                        <>
                          <button className="btn btn-ghost btn-sm" onClick={() => setChanging(r)}>
                            Change
                          </button>
                          <button
                            className="icon-btn danger"
                            aria-label="Remove assignment"
                            title="Remove assignment"
                            onClick={async () => {
                              const msg = r.viaCast
                                ? `“${r.costume!.name}” is assigned to the whole cast “${r.castName}”. Removing it removes it for every dancer in that cast.`
                                : `Remove “${r.costume!.name}” from ${r.dancerName}?`;
                              if (await confirm({ title: 'Remove assignment?', message: msg, confirmLabel: 'Remove', danger: true }))
                                run(() => removeAssignments([r.assignment!.id]), 'Assignment removed.');
                            }}
                          >
                            <X size={16} />
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
                {!shown.length && (
                  <tr>
                    <td colSpan={7} className="faint center pad">
                      No rows match these filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
      <ChangeCostumeDialog row={changing} onClose={() => setChanging(null)} />
    </Card>
  );
}

function ChangeCostumeDialog({ row, onClose }: { row: OverviewRow | null; onClose: () => void }) {
  const db = useDb();
  const run = useRun();
  const [value, setValue] = useState('');
  const [last, setLast] = useState<string | null>(null);
  if ((row?.key ?? null) !== last) {
    setLast(row?.key ?? null);
    setValue(row?.costume?.id ?? '');
  }
  const acc = value ? accessoriesFor(db, value) : [];
  return (
    <Modal
      open={!!row}
      onClose={onClose}
      title="Change Costume"
      subtitle={row ? (row.viaCast ? `Whole cast: ${row.castName}` : `${row.dancerName} · ${row.castName}`) : ''}
      size="sm"
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={!value} onClick={() => run(() => (changeAssignmentCostume(row!.assignment!.id, value), true), 'Costume assignment updated.') && onClose()}>
            Save
          </button>
        </>
      }
    >
      <Field label="Costume">
        <SearchSelect ariaLabel="Costume" value={value} onChange={setValue} options={costumeOptions(db)} />
      </Field>
      {acc.length > 0 && <p className="small faint">Includes: {acc.map((a) => `${a.name} ×${a.quantity}`).join(', ')}</p>}
    </Modal>
  );
}

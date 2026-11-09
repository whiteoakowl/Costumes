import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowDown, ArrowUp, CheckCircle2, Copy, Download, FolderInput, History, MapPin, Pencil, Plus, Tags, Trash2, Wrench } from 'lucide-react';
import { useDb } from '../data/store';
import { addCostumeNote, deleteCategory, deleteCostumes, duplicateCostume, moveCategory, moveCostumes, saveCategory } from '../data/actions';
import { accessoriesFor, byId, costumeUsage, formatDate, formatDateTime, itemsOf, kindOf, sortedCategories } from '../data/selectors';
import { Badge, BulkBar, Card, DataTable, EmptyState, Field, PageHeader, SampleTag, SearchInput, SearchSelect, StatusBadge, Tabs, type Column } from '../components/ui';
import { useConfirm, useRun } from '../components/feedback';
import { useEditors } from '../components/editors';
import { MoveCostumesDialog, ReassignDeleteDialog, SetCategoryDialog } from '../components/dialogs';
import { useCategoryOptions, useLocationOptions } from '../components/forms';
import { Modal } from '../components/Modal';
import { exportCostumeInventory } from '../lib/export';
import type { Costume, CostumeCategory, ID, ItemKind, NoteType } from '../data/types';
import { itemLabels } from '../lib/labels';

type View = 'all' | 'category' | 'size' | 'location' | 'ready' | 'in_progress';

export function CostumesPage() {
  return <InventoryPage kind="costume" />;
}

export function PropsPage() {
  return <InventoryPage kind="prop" />;
}

function InventoryPage({ kind }: { kind: ItemKind }) {
  const L = itemLabels[kind];
  const db = useDb();
  const items = itemsOf(db, kind);
  const ed = useEditors();
  const run = useRun();
  const confirm = useConfirm();
  const [params, setParams] = useSearchParams();
  const view = (params.get('view') as View) || (params.get('status') as View) || 'all';
  const categoryFilter = params.get('category') ?? '';
  const locationFilter = params.get('location') ?? '';
  const [q, setQ] = useState('');
  const [size, setSize] = useState('');
  const [selected, setSelected] = useState<Set<ID>>(new Set());
  const [moving, setMoving] = useState(false);
  const [recat, setRecat] = useState(false);
  const [catsOpen, setCatsOpen] = useState(false);

  const setParam = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    if (k === 'view') next.delete('status');
    setParams(next, { replace: true });
  };

  const cats = byId(db.categories);
  const locs = byId(db.storageLocations);
  const categories = sortedCategories(db);
  const sizes = useMemo(() => [...new Set(items.map((c) => c.size).filter(Boolean))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })), [db]);

  const rows = items.filter((c) => {
    if (view === 'ready' && c.status !== 'ready') return false;
    if (view === 'in_progress' && c.status !== 'in_progress') return false;
    if (categoryFilter === 'none' ? c.categoryId : categoryFilter && c.categoryId !== categoryFilter) return false;
    if (locationFilter === 'none' ? c.storageLocationId : locationFilter && c.storageLocationId !== locationFilter) return false;
    if (size && c.size !== size) return false;
    if (q) {
      const hay = `${c.name} ${c.inventoryNumber} ${c.description} ${c.notes} ${accessoriesFor(db, c.id).map((a) => a.name).join(' ')}`.toLowerCase();
      if (!hay.includes(q.toLowerCase().trim())) return false;
    }
    return true;
  });

  const columns: Column<Costume>[] = [
    { key: 'id', header: 'ID', render: (c) => <span className="mono small">{c.inventoryNumber}</span>, sortValue: (c) => c.inventoryNumber },
    {
      key: 'name',
      header: L.One,
      render: (c) => (
        <>
          <Link to={`${L.base}/${c.id}`} className="link-strong">
            {c.name}
          </Link>
          <SampleTag show={c.isSample} />
          {c.description && <div className="small faint truncate">{c.description}</div>}
        </>
      ),
      sortValue: (c) => c.name,
    },
    { key: 'cat', header: 'Category', render: (c) => (c.categoryId ? cats.get(c.categoryId)?.name : <span className="faint">Uncategorized</span>), sortValue: (c) => (c.categoryId ? cats.get(c.categoryId)?.name ?? '' : ''), minor: true },
    ...(kind === 'costume' ? [{ key: 'size', header: 'Size', render: (c: Costume) => c.size || <span className="faint">—</span>, sortValue: (c: Costume) => c.size }] : []),
    { key: 'qty', header: 'Qty', render: (c) => c.quantity, sortValue: (c) => c.quantity },
    {
      key: 'acc',
      header: L.parts,
      render: (c) => {
        const acc = accessoriesFor(db, c.id);
        if (!acc.length) return <span className="faint">—</span>;
        const missing = acc.filter((a) => a.quantity <= 0).length;
        return (
          <span className="small" title={acc.map((a) => `${a.name} ×${a.quantity}`).join('\n')}>
            {acc.length} item{acc.length === 1 ? '' : 's'}
            {missing > 0 && <span className="warn-text"> · {missing} missing</span>}
          </span>
        );
      },
      minor: true,
    },
    { key: 'loc', header: 'Storage', render: (c) => (c.storageLocationId ? locs.get(c.storageLocationId)?.name : <span className="faint">Unassigned</span>), sortValue: (c) => (c.storageLocationId ? locs.get(c.storageLocationId)?.name ?? '' : ''), minor: true },
    {
      key: 'status',
      header: 'Status',
      render: (c) => (
        <div className="status-cell">
          <div className="status-buttons small-buttons">
            <button className={`status-btn ready ${c.status === 'ready' ? 'on' : ''}`} onClick={() => c.status !== 'ready' && ed.changeStatus([c.id], 'ready')} aria-pressed={c.status === 'ready'}>
              READY
            </button>
            <button className={`status-btn progress ${c.status === 'in_progress' ? 'on' : ''}`} onClick={() => ed.changeStatus([c.id], 'in_progress')} aria-pressed={c.status === 'in_progress'}>
              IN PROGRESS
            </button>
          </div>
          <div className="small faint">Updated {formatDate(c.statusUpdatedAt)}</div>
        </div>
      ),
      sortValue: (c) => c.status,
    },
    {
      key: 'act',
      header: '',
      render: (c) => (
        <div className="row-actions">
          <button className="icon-btn" aria-label={`Edit ${c.name}`} title="Edit" onClick={() => ed.editCostume(c.id)}>
            <Pencil size={16} />
          </button>
          <button className="icon-btn" aria-label={`Duplicate ${c.name}`} title="Duplicate" onClick={() => run(() => duplicateCostume(c.id), `Duplicated “${c.name}”.`)}>
            <Copy size={16} />
          </button>
        </div>
      ),
    },
  ];

  type Group = { key: string; label: string; rows: Costume[]; to?: string };
  const groups: Group[] | null = useMemo(() => {
    if (view === 'category') {
      const g: Group[] = categories.map((c) => ({ key: c.id, label: c.name, rows: rows.filter((r) => r.categoryId === c.id) }));
      g.push({ key: 'none', label: 'Uncategorized', rows: rows.filter((r) => !r.categoryId || !cats.has(r.categoryId)) });
      return g.filter((x) => x.rows.length);
    }
    if (view === 'location') {
      const g: Group[] = [...db.storageLocations].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })).map((l) => ({ key: l.id, label: l.name, rows: rows.filter((r) => r.storageLocationId === l.id), to: `/storage/${l.id}` }));
      g.push({ key: 'none', label: 'Unassigned', rows: rows.filter((r) => !r.storageLocationId || !locs.has(r.storageLocationId)) });
      return g.filter((x) => x.rows.length);
    }
    if (view === 'size') {
      const keys = [...new Set(rows.map((r) => r.size || ''))].sort((a, b) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b, undefined, { numeric: true })));
      return keys.map((k) => ({ key: k || 'none', label: k || 'No size', rows: rows.filter((r) => (r.size || '') === k) }));
    }
    return null;
  }, [view, rows, categories, db.storageLocations, cats, locs]);

  const ids = [...selected].filter((id) => items.some((c) => c.id === id));
  const removeSelected = async () => {
    const usage = db.assignments.filter((a) => ids.includes(a.costumeId)).length;
    if (
      await confirm({
        title: `Delete ${ids.length} ${ids.length === 1 ? L.one : L.many}?`,
        message: `This permanently deletes the ${L.one} record${ids.length === 1 ? '' : 's'}, ${L.parts.toLowerCase()} and notes history.${usage ? ` ${usage} show/performance assignment(s) will also be removed.` : ''}`,
        confirmLabel: 'Delete',
        danger: true,
      })
    ) {
      if (run(() => (deleteCostumes(ids), true), `${ids.length} ${ids.length === 1 ? L.one : L.many} deleted.`)) setSelected(new Set());
    }
  };

  const emptyState = items.length ? (
    <EmptyState title={`No ${L.many} match`} message="Try a different view or clear the filters." />
  ) : (
    <EmptyState
      icon={<L.Icon size={28} />}
      title={`No ${L.many} yet`}
      message={`Add your first ${L.one} to start your inventory.`}
      action={
        <button className="btn btn-primary" onClick={() => ed.editCostume(undefined, { defaults: { kind } })}>
          <Plus size={16} /> Add {L.one}
        </button>
      }
    />
  );

  const table = (list: Costume[]) => <DataTable rows={list} columns={columns} getId={(c) => c.id} selected={selected} onSelectedChange={setSelected} initialSort={{ key: 'id', dir: 'asc' }} empty={emptyState} />;

  return (
    <>
      <PageHeader
        title={L.Many}
        subtitle={`${items.length} ${items.length === 1 ? L.one : L.many} · ${items.filter((c) => c.status === 'ready').length} ready · ${items.filter((c) => c.status === 'in_progress').length} in progress`}
        actions={
          <>
            <button className="btn btn-ghost" onClick={() => setCatsOpen(true)}>
              <Tags size={16} /> Categories
            </button>
            <button className="btn btn-ghost" onClick={() => exportCostumeInventory(db, undefined, kind)} disabled={!items.length}>
              <Download size={16} /> Export CSV
            </button>
            <button className="btn btn-primary" onClick={() => ed.editCostume(undefined, { defaults: { kind, categoryId: categoryFilter && categoryFilter !== 'none' ? categoryFilter : null, storageLocationId: locationFilter && locationFilter !== 'none' ? locationFilter : null } })}>
              <Plus size={16} /> Add {L.one}
            </button>
          </>
        }
      />

      <div className="chips cat-chips">
        <button className={`chip chip-btn ${!categoryFilter ? 'on' : ''}`} onClick={() => setParam('category', '')}>
          All show types
        </button>
        {categories.map((c) => (
          <button key={c.id} className={`chip chip-btn ${categoryFilter === c.id ? 'on' : ''}`} onClick={() => setParam('category', categoryFilter === c.id ? '' : c.id)}>
            {c.name} <span className="faint">{items.filter((x) => x.categoryId === c.id).length}</span>
          </button>
        ))}
      </div>

      <Card>
        <Tabs
          value={view}
          onChange={(v) => setParam('view', v === 'all' ? '' : v)}
          tabs={[
            { value: 'all', label: `All ${L.many}`, count: items.length },
            { value: 'category', label: 'By show type' },
            ...(kind === 'costume' ? [{ value: 'size' as View, label: 'By size' }] : []),
            { value: 'location', label: 'By storage' },
            { value: 'ready', label: 'Ready', count: items.filter((c) => c.status === 'ready').length },
            { value: 'in_progress', label: 'In progress', count: items.filter((c) => c.status === 'in_progress').length },
          ]}
        />
        <div className="toolbar">
          <SearchInput value={q} onChange={setQ} placeholder="Search name, ID, accessory…" />
          <select className="input input-auto" value={categoryFilter} onChange={(e) => setParam('category', e.target.value)} aria-label="Filter by category">
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
            <option value="none">Uncategorized</option>
          </select>
          <select className="input input-auto" value={locationFilter} onChange={(e) => setParam('location', e.target.value)} aria-label="Filter by storage location">
            <option value="">All locations</option>
            {[...db.storageLocations].sort((a, b) => a.name.localeCompare(b.name)).map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
            <option value="none">Unassigned</option>
          </select>
          {kind === 'costume' && (
          <select className="input input-auto" value={size} onChange={(e) => setSize(e.target.value)} aria-label="Filter by size">
            <option value="">All sizes</option>
            {sizes.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          )}
        </div>

        <BulkBar count={ids.length} onClear={() => setSelected(new Set())}>
          <button className="btn btn-ghost btn-sm" onClick={() => ed.changeStatus(ids, 'ready')}>
            <CheckCircle2 size={14} /> Mark READY
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => ed.changeStatus(ids, 'in_progress')}>
            <Wrench size={14} /> Mark IN PROGRESS
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => setMoving(true)}>
            <MapPin size={14} /> Move location
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => setRecat(true)}>
            <FolderInput size={14} /> Change category
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => exportCostumeInventory(db, ids, kind)}>
            <Download size={14} /> Export
          </button>
          <button className="btn btn-ghost btn-sm danger" onClick={removeSelected}>
            <Trash2 size={14} /> Delete
          </button>
        </BulkBar>

        {groups ? (
          groups.length ? (
            groups.map((g) => (
              <div key={g.key} className="group">
                <h3 className="group-title">
                  {g.to ? <Link to={g.to}>{g.label}</Link> : g.label} <span className="faint">({g.rows.length})</span>
                </h3>
                {table(g.rows)}
              </div>
            ))
          ) : (
            emptyState
          )
        ) : (
          table(rows)
        )}
      </Card>

      <MoveCostumesDialog open={moving} onClose={() => setMoving(false)} costumeIds={ids} onDone={() => setSelected(new Set())} />
      <SetCategoryDialog open={recat} onClose={() => setRecat(false)} costumeIds={ids} onDone={() => setSelected(new Set())} />
      <CategoryManager open={catsOpen} onClose={() => setCatsOpen(false)} />
    </>
  );
}

/* ---------------------------------------------------------- categories */

export function CategoryManager({ open, onClose }: { open: boolean; onClose: () => void }) {
  const db = useDb();
  const run = useRun();
  const options = useCategoryOptions();
  const [name, setName] = useState('');
  const [editing, setEditing] = useState<{ id: ID; name: string } | null>(null);
  const [deleting, setDeleting] = useState<CostumeCategory | null>(null);
  const categories = sortedCategories(db);
  const add = () => {
    if (run(() => saveCategory(name), `Category “${name.trim()}” added.`)) setName('');
  };
  return (
    <Modal open={open} onClose={onClose} title="Costume Categories" subtitle="Show types used to organize costumes, props and shows" size="md">
      <div className="inline-form">
        <input className="input" placeholder="New category, e.g. Contemporary" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} aria-label="New category name" />
        <button className="btn btn-primary" onClick={add}>
          <Plus size={16} /> Add
        </button>
      </div>
      {!categories.length ? (
        <p className="faint pad">No categories yet. Suggestions: Nutcracker, Spring Recital, Winter Recital, Competition, Ballet, Jazz, Tap, Contemporary, Hip Hop, Special Productions, Other.</p>
      ) : (
        <ul className="cat-list">
          {categories.map((c, i) => {
            const count = db.costumes.filter((x) => x.categoryId === c.id).length;
            const propCount = db.costumes.filter((x) => x.categoryId === c.id && x.kind === 'prop').length;
            return (
              <li key={c.id}>
                {editing?.id === c.id ? (
                  <input
                    className="input"
                    autoFocus
                    value={editing.name}
                    onChange={(e) => setEditing({ id: c.id, name: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && run(() => saveCategory(editing.name, c.id), 'Category renamed.')) setEditing(null);
                      if (e.key === 'Escape') {
                        e.stopPropagation();
                        setEditing(null);
                      }
                    }}
                    onBlur={() => {
                      if (editing.name.trim() !== c.name) run(() => saveCategory(editing.name, c.id), 'Category renamed.');
                      setEditing(null);
                    }}
                    aria-label="Category name"
                  />
                ) : (
                  <span className="cat-name">
                    {c.name} <SampleTag show={c.isSample} />
                  </span>
                )}
                <span className="small faint">
                  {count - propCount} costume{count - propCount === 1 ? '' : 's'}
                  {propCount > 0 && ` · ${propCount} prop${propCount === 1 ? '' : 's'}`}
                </span>
                <div className="row-actions">
                  <button className="icon-btn" aria-label="Move up" disabled={i === 0} onClick={() => run(() => moveCategory(c.id, -1))}>
                    <ArrowUp size={15} />
                  </button>
                  <button className="icon-btn" aria-label="Move down" disabled={i === categories.length - 1} onClick={() => run(() => moveCategory(c.id, 1))}>
                    <ArrowDown size={15} />
                  </button>
                  <button className="icon-btn" aria-label={`Rename ${c.name}`} onClick={() => setEditing({ id: c.id, name: c.name })}>
                    <Pencil size={15} />
                  </button>
                  <button className="icon-btn danger" aria-label={`Delete ${c.name}`} onClick={() => setDeleting(c)}>
                    <Trash2 size={15} />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <ReassignDeleteDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title="Delete Category"
        itemName={deleting?.name ?? ''}
        count={deleting ? db.costumes.filter((c) => c.categoryId === deleting.id).length : 0}
        noun="category"
        itemNoun="item"
        options={options.filter((o) => o.value !== deleting?.id)}
        noneLabel="Leave uncategorized"
        onConfirm={(target) => !!run(() => (deleteCategory(deleting!.id, target), true), `Category “${deleting!.name}” deleted.`)}
      />
    </Modal>
  );
}

/* --------------------------------------------------------------- detail */

const NOTE_TYPES: { value: NoteType; label: string }[] = [
  { value: 'general', label: 'General note' },
  { value: 'change', label: 'Costume change' },
  { value: 'repair', label: 'Repair' },
  { value: 'alteration', label: 'Alteration' },
  { value: 'accessory', label: 'Accessory change' },
  { value: 'sizing', label: 'Sizing update' },
  { value: 'other', label: 'Other' },
];
const NOTE_LABEL: Record<NoteType, string> = { general: 'Note', change: 'Change', repair: 'Repair', alteration: 'Alteration', accessory: 'Accessory', sizing: 'Sizing', status: 'Status', location: 'Location', other: 'Other' };

export function CostumeDetailPage() {
  const { id } = useParams();
  const db = useDb();
  const ed = useEditors();
  const run = useRun();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const locations = useLocationOptions();
  const [noteType, setNoteType] = useState<NoteType>('general');
  const [noteText, setNoteText] = useState('');
  const c = db.costumes.find((x) => x.id === id);
  const L = itemLabels[c ? kindOf(c) : 'costume'];

  if (!c) {
    return (
      <>
        <PageHeader title="Item not found" back={{ to: L.base, label: L.Many }} />
        <EmptyState title="This item no longer exists" message="It may have been deleted." action={<Link to={L.base} className="btn btn-primary">Back to {L.many}</Link>} />
      </>
    );
  }
  const acc = accessoriesFor(db, c.id);
  const notes = db.costumeNotes.filter((n) => n.costumeId === c.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const usage = costumeUsage(db, c.id);
  const cat = c.categoryId ? db.categories.find((x) => x.id === c.categoryId) : null;

  const addNote = () => {
    if (run(() => (addCostumeNote(c.id, noteType, noteText), true), 'Note added.')) setNoteText('');
  };
  const del = async () => {
    const n = db.assignments.filter((a) => a.costumeId === c.id).length;
    if (await confirm({ title: `Delete ${L.one}?`, message: `Permanently delete “${c.name}” (${c.inventoryNumber}) with its ${L.parts.toLowerCase()} and notes history?${n ? ` It will also be removed from ${n} show/performance assignment(s).` : ''}`, confirmLabel: `Delete ${L.one}`, danger: true })) {
      if (run(() => (deleteCostumes([c.id]), true), `${L.One} deleted.`)) navigate(L.base);
    }
  };

  return (
    <>
      <PageHeader
        back={{ to: L.base, label: L.Many }}
        title={
          <>
            {c.name} <SampleTag show={c.isSample} />
          </>
        }
        subtitle={`${c.inventoryNumber} · ${cat?.name ?? 'Uncategorized'}`}
        actions={
          <>
            <button className="btn btn-ghost danger" onClick={del}>
              <Trash2 size={16} /> Delete
            </button>
            <button
              className="btn btn-ghost"
              onClick={() => {
                const newId = run(() => duplicateCostume(c.id), `${L.One} duplicated.`);
                if (newId) navigate(`${L.base}/${newId}`);
              }}
            >
              <Copy size={16} /> Duplicate
            </button>
            <button className="btn btn-primary" onClick={() => ed.editCostume(c.id)}>
              <Pencil size={16} /> Edit {L.one}
            </button>
          </>
        }
      />

      <div className="detail-grid">
        <div className="stack">
          <Card title="Status">
            <div className="status-hero">
              <div className="status-buttons big">
                <button className={`status-btn ready ${c.status === 'ready' ? 'on' : ''}`} onClick={() => ed.changeStatus([c.id], 'ready')} aria-pressed={c.status === 'ready'}>
                  <CheckCircle2 size={18} /> READY
                </button>
                <button className={`status-btn progress ${c.status === 'in_progress' ? 'on' : ''}`} onClick={() => ed.changeStatus([c.id], 'in_progress')} aria-pressed={c.status === 'in_progress'}>
                  <Wrench size={18} /> IN PROGRESS
                </button>
              </div>
              <div>
                <StatusBadge costume={c} />
                <div className="small faint">Last status update: {formatDateTime(c.statusUpdatedAt)}</div>
                {c.repairNotes && (
                  <div className="repair-note">
                    <strong>Repair notes:</strong> {c.repairNotes}
                  </div>
                )}
              </div>
            </div>
          </Card>

          <Card title={`${L.One} Details`}>
            <dl className="dl">
              <dt>{L.One} ID</dt>
              <dd className="mono">{c.inventoryNumber}</dd>
              <dt>Show type</dt>
              <dd>{cat ? <Link to={`${L.base}?category=${cat.id}`}>{cat.name}</Link> : 'Uncategorized'}</dd>
              {kindOf(c) === 'costume' && (
                <>
                  <dt>Size</dt>
                  <dd>{c.size || '—'}</dd>
                </>
              )}
              <dt>Available quantity</dt>
              <dd>{c.quantity}</dd>
              <dt>Date added</dt>
              <dd>{formatDate(c.dateAdded) || '—'}</dd>
              <dt>Description</dt>
              <dd className="prewrap">{c.description || '—'}</dd>
              <dt>General notes</dt>
              <dd className="prewrap">{c.notes || '—'}</dd>
            </dl>
          </Card>

          <Card title="Storage Location" icon={<MapPin size={18} />}>
            <Field label="Stored in" hint={`Changing this moves the ${L.one} and logs it in the notes history`}>
              <SearchSelect ariaLabel="Storage location" value={c.storageLocationId ?? ''} onChange={(v) => run(() => moveCostumes([c.id], v || null), `Moved to ${locations.find((l) => l.value === v)?.label ?? 'Unassigned'}.`)} options={locations} noneLabel="Unassigned" />
            </Field>
            {c.storageLocationId && (
              <Link to={`/storage/${c.storageLocationId}`} className="small">
                View everything in this location →
              </Link>
            )}
          </Card>

          <Card title={`${L.parts} (${acc.length})`} actions={<button className="btn btn-ghost btn-sm" onClick={() => ed.editCostume(c.id)}>Edit</button>}>
            {!acc.length ? (
              <p className="faint pad">No {L.parts.toLowerCase()} recorded.</p>
            ) : (
              <ul className="mini-list">
                {acc.map((a) => (
                  <li key={a.id}>
                    <span>{a.name}</span>
                    {a.quantity > 0 ? <Badge>×{a.quantity}</Badge> : <Badge tone="danger">Missing</Badge>}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Used In">
            {!usage.length ? (
              <p className="faint pad">Not assigned to any show or performance yet.</p>
            ) : (
              <ul className="mini-list">
                {usage.map((u) => (
                  <li key={`${u.ownerType}:${u.ownerId}`}>
                    <div>
                      <Link to={`/${u.ownerType === 'show' ? 'shows' : 'performances'}/${u.ownerId}`} className="link-strong">
                        {u.name}
                      </Link>
                      <div className="small faint">{u.ownerType === 'show' ? 'Show' : 'Performance'}</div>
                    </div>
                    <span className="small">{u.dancers ? `${u.dancers} assignment${u.dancers === 1 ? '' : 's'}` : `on ${L.one} list`}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <Card title="Notes & History Log" icon={<History size={18} />}>
          <div className="note-form">
            <select className="input input-auto" value={noteType} onChange={(e) => setNoteType(e.target.value as NoteType)} aria-label="Note type">
              {NOTE_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
            <textarea className="input" rows={3} placeholder="Add a note — e.g. Replaced elastic on headpiece" value={noteText} onChange={(e) => setNoteText(e.target.value)} aria-label="Note text" />
            <button className="btn btn-primary" onClick={addNote} disabled={!noteText.trim()}>
              <Plus size={16} /> Add note
            </button>
            <p className="small faint">Notes are dated automatically and are never overwritten.</p>
          </div>
          {!notes.length ? (
            <p className="faint pad">No notes yet.</p>
          ) : (
            <ul className="log">
              {notes.map((n) => (
                <li key={n.id} className={`log-${n.type}`}>
                  <div className="log-meta">
                    <span className={`log-type t-${n.type}`}>{NOTE_LABEL[n.type]}</span>
                    {formatDateTime(n.createdAt)}
                  </div>
                  <div className="prewrap">{n.text}</div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}

import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { MapPin, Pencil, Plus, Shirt, Trash2, Warehouse } from 'lucide-react';
import { useDb } from '../data/store';
import { deleteLocation } from '../data/actions';
import { accessoriesFor, byId, sortedLocations } from '../data/selectors';
import { BulkBar, Card, DataTable, EmptyState, PageHeader, SampleTag, SearchInput, StatusBadge, type Column } from '../components/ui';
import { useRun } from '../components/feedback';
import { useEditors } from '../components/editors';
import { MoveCostumesDialog, ReassignDeleteDialog } from '../components/dialogs';
import { useLocationOptions } from '../components/forms';
import type { Costume, ID, StorageLocation } from '../data/types';

function useDeleteLocation() {
  const db = useDb();
  const run = useRun();
  const options = useLocationOptions();
  const [target, setTarget] = useState<StorageLocation | null>(null);
  const [onDone, setOnDone] = useState<(() => void) | null>(null);
  const dialog = (
    <ReassignDeleteDialog
      open={!!target}
      onClose={() => setTarget(null)}
      title="Delete Storage Location"
      itemName={target?.name ?? ''}
      count={target ? db.costumes.filter((c) => c.storageLocationId === target.id).length : 0}
      noun="location"
      options={options.filter((o) => o.value !== target?.id)}
      noneLabel="Leave unassigned"
      onConfirm={(to) => {
        const ok = !!run(() => (deleteLocation(target!.id, to), true), `“${target!.name}” deleted.`);
        if (ok) onDone?.();
        return ok;
      }}
    />
  );
  return {
    ask: (loc: StorageLocation, done?: () => void) => {
      setTarget(loc);
      setOnDone(() => done ?? null);
    },
    dialog,
  };
}

export function StoragePage() {
  const db = useDb();
  const ed = useEditors();
  const [q, setQ] = useState('');
  const del = useDeleteLocation();
  const counts = new Map<ID, number>();
  for (const c of db.costumes) if (c.storageLocationId) counts.set(c.storageLocationId, (counts.get(c.storageLocationId) ?? 0) + 1);
  const unassigned = db.costumes.filter((c) => !c.storageLocationId).length;
  const rows = sortedLocations(db).filter((l) => !q || `${l.name} ${l.description} ${l.unitNumber} ${l.notes}`.toLowerCase().includes(q.toLowerCase()));

  const columns: Column<StorageLocation>[] = [
    {
      key: 'name',
      header: 'Location',
      render: (l) => (
        <>
          <Link to={`/storage/${l.id}`} className="link-strong">
            {l.name}
          </Link>
          <SampleTag show={l.isSample} />
        </>
      ),
      sortValue: (l) => l.name,
    },
    { key: 'unit', header: 'Room / Rack / Bin', render: (l) => l.unitNumber || <span className="faint">—</span>, sortValue: (l) => l.unitNumber },
    { key: 'desc', header: 'Description', render: (l) => <span className="small">{l.description}</span>, minor: true },
    { key: 'notes', header: 'Notes', render: (l) => <span className="small faint">{l.notes}</span>, minor: true },
    { key: 'count', header: 'Costumes', render: (l) => <Link to={`/storage/${l.id}`}>{counts.get(l.id) ?? 0}</Link>, sortValue: (l) => counts.get(l.id) ?? 0 },
    {
      key: 'act',
      header: '',
      render: (l) => (
        <div className="row-actions">
          <button className="icon-btn" aria-label={`Edit ${l.name}`} onClick={() => ed.editLocation(l.id)}>
            <Pencil size={16} />
          </button>
          <button className="icon-btn danger" aria-label={`Delete ${l.name}`} onClick={() => del.ask(l)}>
            <Trash2 size={16} />
          </button>
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Storage Locations"
        subtitle="Where every costume physically lives"
        actions={
          <button className="btn btn-primary" onClick={() => ed.editLocation()}>
            <Plus size={16} /> Add location
          </button>
        }
      />
      <div className="loc-cards">
        {sortedLocations(db).map((l) => (
          <Link key={l.id} to={`/storage/${l.id}`} className="loc-card">
            <Warehouse size={20} />
            <div>
              <strong>{l.name}</strong>
              <span className="small faint">{l.unitNumber || l.description}</span>
            </div>
            <span className="loc-count">{counts.get(l.id) ?? 0}</span>
          </Link>
        ))}
        {unassigned > 0 && (
          <Link to="/costumes?location=none" className="loc-card warn">
            <MapPin size={20} />
            <div>
              <strong>Unassigned</strong>
              <span className="small faint">Costumes without a location</span>
            </div>
            <span className="loc-count">{unassigned}</span>
          </Link>
        )}
      </div>
      <Card>
        <div className="toolbar">
          <SearchInput value={q} onChange={setQ} placeholder="Search locations…" />
        </div>
        <DataTable
          rows={rows}
          columns={columns}
          getId={(l) => l.id}
          initialSort={{ key: 'name', dir: 'asc' }}
          empty={
            db.storageLocations.length ? (
              <EmptyState title="No locations match" />
            ) : (
              <EmptyState
                icon={<Warehouse size={28} />}
                title="No storage locations yet"
                message="Add closets, racks and bins so every costume has a home."
                action={
                  <button className="btn btn-primary" onClick={() => ed.editLocation()}>
                    <Plus size={16} /> Add location
                  </button>
                }
              />
            )
          }
        />
      </Card>
      {del.dialog}
    </>
  );
}

export function StorageDetailPage() {
  const { id } = useParams();
  const db = useDb();
  const ed = useEditors();
  const navigate = useNavigate();
  const del = useDeleteLocation();
  const [selected, setSelected] = useState<Set<ID>>(new Set());
  const [moving, setMoving] = useState(false);
  const [q, setQ] = useState('');
  const l = db.storageLocations.find((x) => x.id === id);
  if (!l) {
    return (
      <>
        <PageHeader title="Location not found" back={{ to: '/storage', label: 'Storage Locations' }} />
        <EmptyState title="This location no longer exists" action={<Link to="/storage" className="btn btn-primary">Back to storage</Link>} />
      </>
    );
  }
  const cats = byId(db.categories);
  const costumes = db.costumes.filter((c) => c.storageLocationId === l.id && (!q || `${c.name} ${c.inventoryNumber}`.toLowerCase().includes(q.toLowerCase())));
  const ids = [...selected].filter((x) => costumes.some((c) => c.id === x));
  const columns: Column<Costume>[] = [
    { key: 'id', header: 'ID', render: (c) => <span className="mono small">{c.inventoryNumber}</span>, sortValue: (c) => c.inventoryNumber },
    {
      key: 'name',
      header: 'Costume',
      render: (c) => (
        <Link to={`/costumes/${c.id}`} className="link-strong">
          {c.name}
        </Link>
      ),
      sortValue: (c) => c.name,
    },
    { key: 'cat', header: 'Category', render: (c) => (c.categoryId ? cats.get(c.categoryId)?.name : <span className="faint">—</span>), sortValue: (c) => cats.get(c.categoryId ?? '')?.name ?? '', minor: true },
    { key: 'size', header: 'Size', render: (c) => c.size || '—', sortValue: (c) => c.size },
    { key: 'qty', header: 'Qty', render: (c) => c.quantity, sortValue: (c) => c.quantity },
    { key: 'acc', header: 'Accessories', render: (c) => <span className="small">{accessoriesFor(db, c.id).map((a) => a.name).join(', ') || '—'}</span>, minor: true },
    { key: 'status', header: 'Status', render: (c) => <StatusBadge costume={c} compact />, sortValue: (c) => c.status },
  ];

  return (
    <>
      <PageHeader
        back={{ to: '/storage', label: 'Storage Locations' }}
        title={
          <>
            {l.name} <SampleTag show={l.isSample} />
          </>
        }
        subtitle={[l.unitNumber, `${db.costumes.filter((c) => c.storageLocationId === l.id).length} costumes stored here`].filter(Boolean).join(' · ')}
        actions={
          <>
            <button className="btn btn-ghost danger" onClick={() => del.ask(l, () => navigate('/storage'))}>
              <Trash2 size={16} /> Delete
            </button>
            <button className="btn btn-ghost" onClick={() => ed.editLocation(l.id)}>
              <Pencil size={16} /> Edit
            </button>
            <button className="btn btn-primary" onClick={() => ed.editCostume(undefined, { defaults: { storageLocationId: l.id } })}>
              <Plus size={16} /> Add costume here
            </button>
          </>
        }
      />
      <div className="detail-grid">
        <Card title="Location Details">
          <dl className="dl">
            <dt>Name</dt>
            <dd>{l.name}</dd>
            <dt>Room / rack / bin</dt>
            <dd>{l.unitNumber || '—'}</dd>
            <dt>Description</dt>
            <dd className="prewrap">{l.description || '—'}</dd>
            <dt>Notes</dt>
            <dd className="prewrap">{l.notes || '—'}</dd>
          </dl>
        </Card>
        <Card title="Costumes in This Location" icon={<Shirt size={18} />}>
          <div className="toolbar">
            <SearchInput value={q} onChange={setQ} placeholder="Search costumes here…" />
          </div>
          <BulkBar count={ids.length} onClear={() => setSelected(new Set())}>
            <button className="btn btn-ghost btn-sm" onClick={() => setMoving(true)}>
              <MapPin size={14} /> Move to another location
            </button>
          </BulkBar>
          <DataTable
            rows={costumes}
            columns={columns}
            getId={(c) => c.id}
            selected={selected}
            onSelectedChange={setSelected}
            initialSort={{ key: 'name', dir: 'asc' }}
            empty={<EmptyState icon={<Shirt size={26} />} title="Nothing stored here yet" message="Assign costumes to this location from the Costumes page or a costume's detail page." />}
          />
        </Card>
      </div>
      <MoveCostumesDialog open={moving} onClose={() => setMoving(false)} costumeIds={ids} onDone={() => setSelected(new Set())} />
      {del.dialog}
    </>
  );
}

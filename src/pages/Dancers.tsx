import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Download, Pencil, Plus, Shirt, Theater, Trash2, Users , Wand2, Printer} from 'lucide-react';
import { useDb } from '../data/store';
import { bulkUpdateDancers, deleteDancers } from '../data/actions';
import { kindOf, ageFromBirthday, dancerCostumes, dancerParticipation, formatDate, fullName, sortedDancers } from '../data/selectors';
import { Badge, BulkBar, Card, DataTable, EmptyState, PageHeader, SampleTag, SearchInput, StatusBadge, type Column } from '../components/ui';
import { useConfirm, useRun } from '../components/feedback';
import { useEditors } from '../components/editors';
import { exportDancers } from '../lib/export';
import { Avatar, PhotoGallery } from '../components/photos';
import { openPrint } from './Print';
import type { Dancer, ID } from '../data/types';

export function DancersPage() {
  const db = useDb();
  const ed = useEditors();
  const run = useRun();
  const confirm = useConfirm();
  const [q, setQ] = useState('');
  const [level, setLevel] = useState('');
  const [size, setSize] = useState('');
  const [pointe, setPointe] = useState('');
  const [minAge, setMinAge] = useState('');
  const [maxAge, setMaxAge] = useState('');
  const [selected, setSelected] = useState<Set<ID>>(new Set());
  const [bulkLevel, setBulkLevel] = useState('');

  const levels = useMemo(() => [...new Set([...db.settings.levels, ...db.dancers.map((d) => d.level).filter(Boolean)])], [db]);
  const sizes = useMemo(() => [...new Set(db.dancers.flatMap((d) => [d.costumeSize, d.clothingSize]).filter(Boolean))].sort(), [db]);

  const rows = sortedDancers(db).filter((d) => {
    const age = ageFromBirthday(d.birthday);
    if (q && !`${d.firstName} ${d.lastName}`.toLowerCase().includes(q.toLowerCase().trim())) return false;
    if (level && d.level !== level) return false;
    if (size && d.costumeSize !== size && d.clothingSize !== size) return false;
    if (pointe && String(d.pointe) !== pointe) return false;
    if (minAge && (age === null || age < Number(minAge))) return false;
    if (maxAge && (age === null || age > Number(maxAge))) return false;
    return true;
  });
  const filtersOn = !!(q || level || size || pointe || minAge || maxAge);

  const columns: Column<Dancer>[] = [
    { key: 'first', header: 'First Name', render: (d) => d.firstName, sortValue: (d) => d.firstName, minor: true },
    { key: 'last', header: 'Last Name', render: (d) => d.lastName, sortValue: (d) => d.lastName, minor: true },
    {
      key: 'full',
      header: 'Full Name',
      render: (d) => (
        <div className="with-avatar">
          <Avatar ownerType="dancer" ownerId={d.id} size={34} round />
          <div>
            <Link to={`/dancers/${d.id}`} className="link-strong">
              {fullName(d)}
            </Link>
            <SampleTag show={d.isSample} />
          </div>
        </div>
      ),
      sortValue: (d) => fullName(d),
    },
    { key: 'age', header: 'Age', render: (d) => ageFromBirthday(d.birthday) ?? <span className="faint">—</span>, sortValue: (d) => ageFromBirthday(d.birthday) },
    { key: 'bday', header: 'Birthday', render: (d) => formatDate(d.birthday) || <span className="faint">—</span>, sortValue: (d) => d.birthday, minor: true },
    { key: 'cloth', header: 'Clothing', render: (d) => d.clothingSize || <span className="faint">—</span>, sortValue: (d) => d.clothingSize, minor: true },
    { key: 'costume', header: 'Costume Size', render: (d) => d.costumeSize || <span className="faint">—</span>, sortValue: (d) => d.costumeSize },
    { key: 'shoe', header: 'Shoe', render: (d) => d.shoeSize || <span className="faint">—</span>, sortValue: (d) => parseFloat(d.shoeSize) || null, minor: true },
    { key: 'level', header: 'Level', render: (d) => d.level || <span className="faint">—</span>, sortValue: (d) => levels.indexOf(d.level) },
    { key: 'pointe', header: 'Pointe', render: (d) => (d.pointe ? <Badge tone="rose">Pointe</Badge> : <span className="faint small">No Pointe</span>), sortValue: (d) => (d.pointe ? 0 : 1) },
    { key: 'notes', header: 'Notes', render: (d) => <span className="truncate small">{d.notes}</span>, minor: true },
    {
      key: 'act',
      header: '',
      render: (d) => (
        <div className="row-actions">
          <button className="icon-btn" aria-label={`Edit ${fullName(d)}`} onClick={() => ed.editDancer(d.id)}>
            <Pencil size={16} />
          </button>
        </div>
      ),
    },
  ];

  const removeSelected = async () => {
    const ids = [...selected];
    if (await confirm({ title: `Delete ${ids.length} dancer${ids.length === 1 ? '' : 's'}?`, message: 'They will also be removed from all cast lists and costume assignments. This cannot be undone.', confirmLabel: 'Delete', danger: true })) {
      if (run(() => (deleteDancers(ids), true), `${ids.length} dancer${ids.length === 1 ? '' : 's'} deleted.`)) setSelected(new Set());
    }
  };

  return (
    <>
      <PageHeader
        title="Dancers"
        subtitle={`${db.dancers.length} dancer${db.dancers.length === 1 ? '' : 's'} in your studio`}
        actions={
          <>
            <button className="btn btn-ghost" onClick={() => openPrint('dancers', { level })} disabled={!db.dancers.length}>
              <Printer size={16} /> Print list
            </button>
            <button className="btn btn-ghost" onClick={() => exportDancers(db)} disabled={!db.dancers.length}>
              <Download size={16} /> Export CSV
            </button>
            <button className="btn btn-primary" onClick={() => ed.editDancer()}>
              <Plus size={16} /> Add dancer
            </button>
          </>
        }
      />
      <Card>
        <div className="toolbar">
          <SearchInput value={q} onChange={setQ} placeholder="Search first or last name…" />
          <select className="input input-auto" value={level} onChange={(e) => setLevel(e.target.value)} aria-label="Filter by level">
            <option value="">All levels</option>
            {levels.map((l) => (
              <option key={l}>{l}</option>
            ))}
          </select>
          <select className="input input-auto" value={size} onChange={(e) => setSize(e.target.value)} aria-label="Filter by size">
            <option value="">All sizes</option>
            {sizes.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <select className="input input-auto" value={pointe} onChange={(e) => setPointe(e.target.value)} aria-label="Filter by pointe">
            <option value="">Pointe & No Pointe</option>
            <option value="true">Pointe</option>
            <option value="false">No Pointe</option>
          </select>
          <div className="age-filter">
            <span className="small faint">Age</span>
            <input className="input input-xs" type="number" min={0} placeholder="min" value={minAge} onChange={(e) => setMinAge(e.target.value)} aria-label="Minimum age" />
            <span className="faint">–</span>
            <input className="input input-xs" type="number" min={0} placeholder="max" value={maxAge} onChange={(e) => setMaxAge(e.target.value)} aria-label="Maximum age" />
          </div>
          {filtersOn && (
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setQ('');
                setLevel('');
                setSize('');
                setPointe('');
                setMinAge('');
                setMaxAge('');
              }}
            >
              Clear filters
            </button>
          )}
        </div>
        <BulkBar count={selected.size} onClear={() => setSelected(new Set())}>
          <select className="input input-sm input-auto" value={bulkLevel} onChange={(e) => setBulkLevel(e.target.value)} aria-label="Set level for selected">
            <option value="">Set level…</option>
            {levels.map((l) => (
              <option key={l}>{l}</option>
            ))}
          </select>
          <button className="btn btn-ghost btn-sm" disabled={!bulkLevel} onClick={() => run(() => (bulkUpdateDancers([...selected], { level: bulkLevel }), true), `Level updated for ${selected.size} dancers.`) && setBulkLevel('')}>
            Apply
          </button>
          <button className="btn btn-ghost btn-sm danger" onClick={removeSelected}>
            <Trash2 size={14} /> Delete
          </button>
        </BulkBar>
        <DataTable
          rows={rows}
          columns={columns}
          getId={(d) => d.id}
          selected={selected}
          onSelectedChange={setSelected}
          initialSort={{ key: 'last', dir: 'asc' }}
          empty={
            db.dancers.length ? (
              <EmptyState title="No dancers match" message="Try clearing a filter." />
            ) : (
              <EmptyState
                icon={<Users size={28} />}
                title="No dancers yet"
                message="Add your first dancer to start building cast lists."
                action={
                  <button className="btn btn-primary" onClick={() => ed.editDancer()}>
                    <Plus size={16} /> Add dancer
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

export function DancerProfilePage() {
  const { id } = useParams();
  const db = useDb();
  const ed = useEditors();
  const run = useRun();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const d = db.dancers.find((x) => x.id === id);

  if (!d) {
    return (
      <>
        <PageHeader title="Dancer not found" back={{ to: '/dancers', label: 'Dancers' }} />
        <EmptyState title="This dancer no longer exists" message="They may have been deleted." action={<Link to="/dancers" className="btn btn-primary">Back to dancers</Link>} />
      </>
    );
  }
  const allItems = dancerCostumes(db, d.id);
  const costumes = allItems.filter((c) => kindOf(c.costume) === 'costume');
  const props = allItems.filter((c) => kindOf(c.costume) === 'prop');
  const parts = dancerParticipation(db, d.id);
  const age = ageFromBirthday(d.birthday);
  const uniqueCostumes = [...new Map(allItems.map((c) => [c.costume.id, c.costume])).values()];
  const costumeNotes = db.costumeNotes
    .filter((n) => uniqueCostumes.some((c) => c.id === n.costumeId) && n.type !== 'general')
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 8);

  const del = async () => {
    if (await confirm({ title: 'Delete dancer?', message: `Delete ${fullName(d)}? They will be removed from ${parts.length} cast list(s) and all costume assignments.`, confirmLabel: 'Delete dancer', danger: true })) {
      if (run(() => (deleteDancers([d.id]), true), `${fullName(d)} deleted.`)) navigate('/dancers');
    }
  };

  return (
    <>
      <PageHeader
        back={{ to: '/dancers', label: 'Dancers' }}
        title={
          <>
            {fullName(d)} <SampleTag show={d.isSample} />
          </>
        }
        subtitle={[d.level, age !== null ? `${age} years old` : null, d.pointe ? 'Pointe' : 'No Pointe'].filter(Boolean).join(' · ')}
        actions={
          <>
            <button className="btn btn-ghost danger" onClick={del}>
              <Trash2 size={16} /> Delete
            </button>
            <button className="btn btn-ghost" onClick={() => openPrint('dancer', { id: d.id })}>
              <Printer size={16} /> Print sheet
            </button>
            <button className="btn btn-primary" onClick={() => ed.editDancer(d.id)}>
              <Pencil size={16} /> Edit dancer
            </button>
          </>
        }
      />
      <div className="detail-grid">
        <div className="stack">
        <Card title="Dancer Information">
          <dl className="dl">
            <dt>First name</dt>
            <dd>{d.firstName}</dd>
            <dt>Last name</dt>
            <dd>{d.lastName}</dd>
            <dt>Birthday</dt>
            <dd>{formatDate(d.birthday) || '—'}</dd>
            <dt>Age</dt>
            <dd>{age ?? '—'}</dd>
            <dt>Clothing size</dt>
            <dd>{d.clothingSize || '—'}</dd>
            <dt>Costume size</dt>
            <dd>{d.costumeSize || '—'}</dd>
            <dt>Shoe size</dt>
            <dd>{d.shoeSize || '—'}</dd>
            <dt>Level</dt>
            <dd>{d.level || '—'}</dd>
            <dt>Pointe</dt>
            <dd>{d.pointe ? 'Pointe' : 'No Pointe'}</dd>
          </dl>
          <h4 className="mini-title">Notes</h4>
          <p className="prewrap">{d.notes || <span className="faint">No notes.</span>}</p>
        </Card>
        <PhotoGallery ownerType="dancer" ownerId={d.id} name={fullName(d)} />
        </div>

        <div className="stack">
          <Card title={`Assigned Costumes (${new Set(costumes.map((c) => c.costume.id)).size})`} icon={<Shirt size={18} />}>
            {!costumes.length ? (
              <p className="faint pad">No costumes assigned yet. Assign costumes from a show or performance plan.</p>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Costume</th>
                      <th>Show / Performance</th>
                      <th>Cast</th>
                      <th>Size</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {costumes.map((c, i) => (
                      <tr key={i}>
                        <td>
                          <Link to={`/costumes/${c.costume.id}`} className="link-strong">
                            {c.costume.name}
                          </Link>
                          <div className="small faint">
                            {c.costume.inventoryNumber}
                            {c.viaCast && ' · whole cast'}
                          </div>
                        </td>
                        <td>
                          <Link to={`/${c.ownerType === 'show' ? 'shows' : 'performances'}/${c.ownerId}`}>{c.ownerName}</Link>
                          <div className="small faint">{c.ownerType === 'show' ? 'Show' : 'Performance'}</div>
                        </td>
                        <td>
                          {c.castName}
                          {c.role && <div className="small faint">{c.role}</div>}
                        </td>
                        <td>
                          {c.costume.size || '—'}
                          {d.costumeSize && c.costume.size && d.costumeSize.toLowerCase() !== c.costume.size.toLowerCase() && <div className="small warn-text">Size check</div>}
                        </td>
                        <td>
                          <StatusBadge costume={c.costume} compact />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card title={`Assigned Props (${new Set(props.map((p) => p.costume.id)).size})`} icon={<Wand2 size={18} />}>
            {!props.length ? (
              <p className="faint pad">No props assigned. Assign props from a show or performance plan.</p>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Prop</th>
                      <th>Show / Performance</th>
                      <th>Cast</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {props.map((c, i) => (
                      <tr key={i}>
                        <td>
                          <Link to={`/props/${c.costume.id}`} className="link-strong">
                            {c.costume.name}
                          </Link>
                          <div className="small faint">
                            {c.costume.inventoryNumber}
                            {c.viaCast && ' · whole cast'}
                          </div>
                        </td>
                        <td>
                          <Link to={`/${c.ownerType === 'show' ? 'shows' : 'performances'}/${c.ownerId}`}>{c.ownerName}</Link>
                        </td>
                        <td>{c.castName}</td>
                        <td>
                          <StatusBadge costume={c.costume} compact />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card title="Shows & Performances" icon={<Theater size={18} />}>
            {!parts.length ? (
              <p className="faint pad">Not in any cast lists yet.</p>
            ) : (
              <ul className="mini-list">
                {parts.map(({ membership, cast, ownerName }) => (
                  <li key={membership.id}>
                    <div>
                      <Link to={`/${cast.ownerType === 'show' ? 'shows' : 'performances'}/${cast.ownerId}`} className="link-strong">
                        {ownerName}
                      </Link>
                      <div className="small faint">
                        {cast.ownerType === 'show' ? 'Show' : 'Performance'} · {cast.name}
                        {membership.role && ` · ${membership.role}`}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Notes on This Dancer's Costumes & Props">
            {!costumeNotes.length ? (
              <p className="faint pad">No repair, sizing or accessory notes on their costumes.</p>
            ) : (
              <ul className="log compact">
                {costumeNotes.map((n) => (
                  <li key={n.id}>
                    <div className="log-meta">
                      <Link to={`${db.costumes.find((c) => c.id === n.costumeId)?.kind === 'prop' ? '/props' : '/costumes'}/${n.costumeId}`}>{db.costumes.find((c) => c.id === n.costumeId)?.name}</Link> · {formatDate(n.createdAt)}
                    </div>
                    <div>{n.text}</div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}

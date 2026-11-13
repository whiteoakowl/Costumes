import { FamilyBillingCard } from './Finance';
import { useState } from 'react';
import { Link, useNavigate, useParams } from '../lib/router';
import { HeartPulse, Link2, Mail, Pencil, Phone, Plus, ShieldAlert, Star, Trash2, UserPlus, Users, UsersRound } from 'lucide-react';
import { useDb } from '../data/store';
import {
  deleteEmergencyContact,
  deleteFamily,
  deleteGuardian,
  saveEmergencyContact,
  saveFamily,
  saveGuardian,
  setDancersFamily,
  type EmergencyInput,
  type FamilyInput,
  type GuardianInput,
} from '../data/studioActions';
import { ageFromBirthday, fullName } from '../data/selectors';
import { dancerClassIds, roleLabels } from '../data/studio';
import { Badge, Card, DataTable, EmptyState, Field, PageHeader, SampleTag, SearchInput, SearchSelect, type Column } from '../components/ui';
import { FormModal } from '../components/forms';
import { useConfirm, useRun } from '../components/feedback';
import { useEditors } from '../components/editors';
import { Avatar } from '../components/photos';
import { classWhen } from '../components/studioUi';
import { useViewer } from '../lib/session';
import type { Family, ID } from '../data/types';

export function FamiliesPage() {
  const db = useDb();
  const v = useViewer();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('active');
  const [adding, setAdding] = useState(() => new URLSearchParams(window.location.search).get('new') === '1');
  const rows = db.families.filter((f) => {
    if (status !== 'all' && f.status !== status) return false;
    if (!q) return true;
    const hay = [f.name, f.city, ...db.guardians.filter((g) => g.familyId === f.id).flatMap((g) => [g.firstName, g.lastName, g.email, g.phone]), ...db.dancers.filter((d) => d.familyId === f.id).map(fullName)].join(' ');
    return hay.toLowerCase().includes(q.toLowerCase());
  });
  const unlinked = db.dancers.filter((d) => !d.familyId).length;
  const columns: Column<Family>[] = [
    {
      key: 'name',
      header: 'Family',
      render: (f) => (
        <>
          <Link to={`/families/${f.id}`} className="link-strong">
            {f.name}
          </Link>
          <SampleTag show={f.isSample} />
          {f.city && <div className="small faint">{f.city}</div>}
        </>
      ),
      sortValue: (f) => f.name,
    },
    {
      key: 'parents',
      header: 'Parents / Guardians',
      render: (f) => (
        <div className="small">
          {db.guardians
            .filter((g) => g.familyId === f.id)
            .map((g) => (
              <div key={g.id}>
                {g.firstName} {g.lastName}
                {g.isPrimary && <Star size={11} className="primary-star" aria-label="primary contact" />}
                <span className="faint"> · {g.phone || g.email}</span>
              </div>
            ))}
        </div>
      ),
    },
    {
      key: 'dancers',
      header: 'Dancers',
      render: (f) => (
        <div className="small">
          {db.dancers
            .filter((d) => d.familyId === f.id)
            .map((d) => (
              <div key={d.id}>
                <Link to={`/dancers/${d.id}`}>{fullName(d)}</Link>
              </div>
            ))}
        </div>
      ),
      sortValue: (f) => db.dancers.filter((d) => d.familyId === f.id).length,
    },
    { key: 'emerg', header: 'Emergency contacts', render: (f) => db.emergencyContacts.filter((c) => c.familyId === f.id).length, minor: true },
    { key: 'status', header: 'Status', render: (f) => <Badge tone={f.status === 'active' ? 'ready' : 'neutral'}>{f.status === 'active' ? 'Active' : 'Inactive'}</Badge>, sortValue: (f) => f.status },
  ];
  return (
    <>
      <PageHeader
        title="Families"
        subtitle={`${db.families.filter((f) => f.status === 'active').length} active families`}
        actions={
          v.can('families.edit') && (
            <button className="btn btn-primary" onClick={() => setAdding(true)}>
              <Plus size={16} /> Add family
            </button>
          )
        }
      />
      {unlinked > 0 && (
        <div className="hint-bar">
          <span>
            <Link2 size={14} /> {unlinked} dancer{unlinked === 1 ? ' is' : 's are'} not linked to a family yet. Open a family and use “Add existing dancer”.
          </span>
        </div>
      )}
      <Card>
        <div className="toolbar">
          <SearchInput value={q} onChange={setQ} placeholder="Search family, parent, phone, dancer…" />
          <select className="input input-auto" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status">
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="all">All</option>
          </select>
        </div>
        <DataTable
          rows={rows}
          columns={columns}
          getId={(f) => f.id}
          initialSort={{ key: 'name', dir: 'asc' }}
          empty={
            db.families.length ? (
              <EmptyState title="No families match" />
            ) : (
              <EmptyState icon={<UsersRound size={28} />} title="No families yet" message="Add a family, then its parents, emergency contacts and dancers." action={<button className="btn btn-primary" onClick={() => setAdding(true)}><Plus size={16} /> Add family</button>} />
            )
          }
        />
      </Card>
      <FamilyForm open={adding} onClose={() => setAdding(false)} onSaved={(id) => navigate(`/families/${id}`)} />
    </>
  );
}

export function FamilyForm({ open, onClose, id, onSaved }: { open: boolean; onClose: () => void; id?: ID; onSaved?: (id: ID) => void }) {
  const db = useDb();
  const run = useRun();
  const empty: FamilyInput = { name: '', address: '', city: '', state: '', zip: '', status: 'active', notes: '' };
  const [v, setV] = useState<FamilyInput>(empty);
  const [last, setLast] = useState<string | null>(null);
  const key = open ? id ?? 'new' : null;
  if (key !== last) {
    setLast(key);
    const f = id ? db.families.find((x) => x.id === id) : undefined;
    if (open) setV(f ? { name: f.name, address: f.address, city: f.city, state: f.state, zip: f.zip, status: f.status, notes: f.notes } : empty);
  }
  const set = <K extends keyof FamilyInput>(k: K, val: FamilyInput[K]) => setV((p) => ({ ...p, [k]: val }));
  return (
    <FormModal
      open={open}
      onClose={onClose}
      title={id ? 'Edit Family' : 'Add Family'}
      onSubmit={() => {
        const saved = run(() => saveFamily(v, id), id ? 'Family updated.' : `${v.name.trim()} added.`);
        if (saved) {
          onClose();
          onSaved?.(saved);
        }
      }}
    >
      <Field label="Family name" required>
        <input className="input" value={v.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Chen Family" autoFocus />
      </Field>
      <Field label="Mailing address">
        <input className="input" value={v.address} onChange={(e) => set('address', e.target.value)} />
      </Field>
      <div className="grid-3">
        <Field label="City">
          <input className="input" value={v.city} onChange={(e) => set('city', e.target.value)} />
        </Field>
        <Field label="State">
          <input className="input" value={v.state} onChange={(e) => set('state', e.target.value)} />
        </Field>
        <Field label="ZIP">
          <input className="input" value={v.zip} onChange={(e) => set('zip', e.target.value)} />
        </Field>
      </div>
      <Field label="Status">
        <select className="input" value={v.status} onChange={(e) => set('status', e.target.value as Family['status'])}>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </Field>
      <Field label="Notes">
        <textarea className="input" rows={2} value={v.notes} onChange={(e) => set('notes', e.target.value)} />
      </Field>
    </FormModal>
  );
}

function GuardianForm({ familyId, id, open, onClose }: { familyId: ID; id?: ID; open: boolean; onClose: () => void }) {
  const db = useDb();
  const run = useRun();
  const empty: GuardianInput = { familyId, firstName: '', lastName: '', relationship: '', email: '', phone: '', isPrimary: false, emailConsent: true, smsConsent: false };
  const [v, setV] = useState<GuardianInput>(empty);
  const [last, setLast] = useState<string | null>(null);
  const key = open ? id ?? 'new' : null;
  if (key !== last) {
    setLast(key);
    const g = id ? db.guardians.find((x) => x.id === id) : undefined;
    if (open) setV(g ? { familyId, firstName: g.firstName, lastName: g.lastName, relationship: g.relationship, email: g.email, phone: g.phone, isPrimary: g.isPrimary, emailConsent: g.emailConsent, smsConsent: g.smsConsent } : { ...empty, lastName: db.families.find((f) => f.id === familyId)?.name.replace(/ Family$/, '') ?? '' });
  }
  const set = <K extends keyof GuardianInput>(k: K, val: GuardianInput[K]) => setV((p) => ({ ...p, [k]: val }));
  return (
    <FormModal open={open} onClose={onClose} title={id ? 'Edit Parent / Guardian' : 'Add Parent / Guardian'} onSubmit={() => run(() => saveGuardian(v, id), 'Saved.') && onClose()}>
      <div className="grid-2">
        <Field label="First name" required>
          <input className="input" value={v.firstName} onChange={(e) => set('firstName', e.target.value)} autoFocus />
        </Field>
        <Field label="Last name">
          <input className="input" value={v.lastName} onChange={(e) => set('lastName', e.target.value)} />
        </Field>
        <Field label="Relationship">
          <input className="input" list="relationships" value={v.relationship} onChange={(e) => set('relationship', e.target.value)} placeholder="Mother, Father, Guardian…" />
          <datalist id="relationships">
            {['Mother', 'Father', 'Stepmother', 'Stepfather', 'Grandmother', 'Grandfather', 'Guardian'].map((r) => (
              <option key={r} value={r} />
            ))}
          </datalist>
        </Field>
        <Field label="Phone">
          <input className="input" type="tel" value={v.phone} onChange={(e) => set('phone', e.target.value)} />
        </Field>
        <Field label="Email" className="span-2">
          <input className="input" type="email" value={v.email} onChange={(e) => set('email', e.target.value)} />
        </Field>
      </div>
      <label className="check-inline">
        <input type="checkbox" checked={v.isPrimary} onChange={(e) => set('isPrimary', e.target.checked)} /> Primary contact for this family
      </label>
      <label className="check-inline">
        <input type="checkbox" checked={v.emailConsent} onChange={(e) => set('emailConsent', e.target.checked)} /> OK to email
      </label>
      <label className="check-inline">
        <input type="checkbox" checked={v.smsConsent} onChange={(e) => set('smsConsent', e.target.checked)} /> Consents to text messages (required before any SMS is sent)
      </label>
    </FormModal>
  );
}

function EmergencyForm({ familyId, id, open, onClose }: { familyId: ID; id?: ID; open: boolean; onClose: () => void }) {
  const db = useDb();
  const run = useRun();
  const empty: EmergencyInput = { familyId, name: '', relationship: '', phone: '', notes: '' };
  const [v, setV] = useState<EmergencyInput>(empty);
  const [last, setLast] = useState<string | null>(null);
  const key = open ? id ?? 'new' : null;
  if (key !== last) {
    setLast(key);
    const c = id ? db.emergencyContacts.find((x) => x.id === id) : undefined;
    if (open) setV(c ? { familyId, name: c.name, relationship: c.relationship, phone: c.phone, notes: c.notes } : empty);
  }
  const set = <K extends keyof EmergencyInput>(k: K, val: EmergencyInput[K]) => setV((p) => ({ ...p, [k]: val }));
  return (
    <FormModal open={open} onClose={onClose} title={id ? 'Edit Emergency Contact' : 'Add Emergency Contact'} size="sm" onSubmit={() => run(() => saveEmergencyContact(v, id), 'Saved.') && onClose()}>
      <Field label="Name" required>
        <input className="input" value={v.name} onChange={(e) => set('name', e.target.value)} autoFocus />
      </Field>
      <Field label="Relationship">
        <input className="input" value={v.relationship} onChange={(e) => set('relationship', e.target.value)} />
      </Field>
      <Field label="Phone" required>
        <input className="input" type="tel" value={v.phone} onChange={(e) => set('phone', e.target.value)} />
      </Field>
      <Field label="Notes">
        <input className="input" value={v.notes} onChange={(e) => set('notes', e.target.value)} />
      </Field>
    </FormModal>
  );
}

export function FamilyDetailPage() {
  const { id } = useParams();
  const db = useDb();
  const v = useViewer();
  const run = useRun();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const ed = useEditors();
  const [editing, setEditing] = useState(false);
  const [guardian, setGuardian] = useState<ID | 'new' | null>(null);
  const [contact, setContact] = useState<ID | 'new' | null>(null);
  const [linkDancer, setLinkDancer] = useState('');
  const f = db.families.find((x) => x.id === id);
  if (!f) return <EmptyState title="Family not found" action={<Link to="/families" className="btn btn-primary">Back to families</Link>} />;
  const guardians = db.guardians.filter((g) => g.familyId === f.id).sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary));
  const contacts = db.emergencyContacts.filter((c) => c.familyId === f.id);
  const dancers = db.dancers.filter((d) => d.familyId === f.id);
  const accounts = db.accounts.filter((a) => a.guardianId && guardians.some((g) => g.id === a.guardianId));
  const canEdit = v.can('families.edit');

  return (
    <>
      <PageHeader
        back={{ to: '/families', label: 'Families' }}
        title={
          <>
            {f.name} <SampleTag show={f.isSample} />
          </>
        }
        subtitle={[f.address, f.city, f.state, f.zip].filter(Boolean).join(', ') || 'No address yet'}
        actions={
          canEdit && (
            <>
              <button
                className="btn btn-ghost danger"
                onClick={async () => {
                  if (await confirm({ title: 'Delete family?', message: `Delete ${f.name}, its parents and emergency contacts? The dancers are kept (unlinked) and parent logins are deactivated.`, confirmLabel: 'Delete family', danger: true }))
                    if (run(() => (deleteFamily(f.id), true), 'Family deleted.')) navigate('/families');
                }}
              >
                <Trash2 size={16} /> Delete
              </button>
              <button className="btn btn-primary" onClick={() => setEditing(true)}>
                <Pencil size={16} /> Edit family
              </button>
            </>
          )
        }
      />
      <div className="detail-grid">
        <div className="stack">
          <Card title="Parents & Guardians" icon={<Users size={18} />} actions={canEdit && <button className="btn btn-ghost btn-sm" onClick={() => setGuardian('new')}><Plus size={14} /> Add</button>}>
            {!guardians.length ? (
              <p className="faint pad">No parents or guardians yet.</p>
            ) : (
              <ul className="mini-list">
                {guardians.map((g) => (
                  <li key={g.id}>
                    <div>
                      <strong>
                        {g.firstName} {g.lastName}
                      </strong>
                      {g.isPrimary && <Badge tone="rose">Primary</Badge>}
                      <div className="small faint">{g.relationship}</div>
                      <div className="small contact-links">
                        {g.phone && (
                          <a href={`tel:${g.phone.replace(/[^\d+]/g, '')}`}>
                            <Phone size={12} /> {g.phone}
                          </a>
                        )}
                        {g.email && (
                          <a href={`mailto:${g.email}`}>
                            <Mail size={12} /> {g.email}
                          </a>
                        )}
                      </div>
                      <div className="small faint">
                        {g.emailConsent ? 'Email OK' : 'No email'} · {g.smsConsent ? 'Text OK' : 'No texts'}
                      </div>
                    </div>
                    {canEdit && (
                      <div className="row-actions">
                        <button className="icon-btn" aria-label={`Edit ${g.firstName}`} onClick={() => setGuardian(g.id)}>
                          <Pencil size={15} />
                        </button>
                        <button
                          className="icon-btn danger"
                          aria-label={`Remove ${g.firstName}`}
                          onClick={async () => {
                            if (await confirm({ title: 'Remove parent/guardian?', message: `Remove ${g.firstName} ${g.lastName} from ${f.name}? Any login linked to them is deactivated.`, confirmLabel: 'Remove', danger: true }))
                              run(() => deleteGuardian(g.id), 'Removed.');
                          }}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title="Emergency Contacts" icon={<ShieldAlert size={18} />} actions={canEdit && <button className="btn btn-ghost btn-sm" onClick={() => setContact('new')}><Plus size={14} /> Add</button>}>
            {!contacts.length ? (
              <p className="faint pad">No emergency contacts yet.</p>
            ) : (
              <ul className="mini-list">
                {contacts.map((c) => (
                  <li key={c.id}>
                    <div>
                      <strong>{c.name}</strong> <span className="faint small">· {c.relationship}</span>
                      <div className="small">{c.phone}</div>
                      {c.notes && <div className="small faint">{c.notes}</div>}
                    </div>
                    {canEdit && (
                      <div className="row-actions">
                        <button className="icon-btn" aria-label={`Edit ${c.name}`} onClick={() => setContact(c.id)}>
                          <Pencil size={15} />
                        </button>
                        <button className="icon-btn danger" aria-label={`Remove ${c.name}`} onClick={() => run(() => deleteEmergencyContact(c.id), 'Removed.')}>
                          <Trash2 size={15} />
                        </button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
          {v.can('billing.view') && <FamilyBillingCard familyId={f.id} />}
          <Card title="Logins">
            {!accounts.length ? (
              <p className="faint pad small">No parent logins yet.{v.can('accounts.manage') && <> Create one under <Link to="/accounts">Accounts & Access</Link>.</>}</p>
            ) : (
              <ul className="mini-list">
                {accounts.map((a) => (
                  <li key={a.id}>
                    <span>{a.displayName}</span>
                    <span className="small faint">
                      {roleLabels[a.role]} · {a.active ? 'active' : 'deactivated'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          {f.notes && (
            <Card title="Notes">
              <p className="prewrap">{f.notes}</p>
            </Card>
          )}
        </div>
        <div className="stack">
          <Card
            title={`Dancers (${dancers.length})`}
            icon={<UserPlus size={18} />}
            actions={
              canEdit && (
                <button className="btn btn-primary btn-sm" onClick={() => ed.editDancer(undefined, { defaults: { familyId: f.id, lastName: f.name.replace(/ Family$/, '').split('-')[0] } })}>
                  <Plus size={14} /> New dancer
                </button>
              )
            }
          >
            {!dancers.length && <p className="faint pad">No dancers in this family yet.</p>}
            {dancers.map((d) => {
              const classes = dancerClassIds(db, d.id).map((cid) => db.classes.find((c) => c.id === cid)).filter(Boolean);
              const waitlist = dancerClassIds(db, d.id, 'waitlist').map((cid) => db.classes.find((c) => c.id === cid)).filter(Boolean);
              return (
                <div key={d.id} className="family-dancer">
                  <div className="with-avatar">
                    <Avatar ownerType="dancer" ownerId={d.id} size={44} round />
                    <div>
                      <Link to={`/dancers/${d.id}`} className="link-strong">
                        {fullName(d)}
                      </Link>
                      <div className="small faint">
                        {[ageFromBirthday(d.birthday) !== null && `Age ${ageFromBirthday(d.birthday)}`, d.level, d.enrollmentStatus && d.enrollmentStatus[0].toUpperCase() + d.enrollmentStatus.slice(1)].filter(Boolean).join(' · ')}
                      </div>
                    </div>
                  </div>
                  <div className="small">
                    {classes.length ? (
                      classes.map((c) => (
                        <div key={c!.id}>
                          <Link to={`/classes/${c!.id}`}>{c!.name}</Link> <span className="faint">· {classWhen(c!)}</span>
                        </div>
                      ))
                    ) : (
                      <span className="faint">Not enrolled in classes</span>
                    )}
                    {waitlist.map((c) => (
                      <div key={c!.id} className="faint">
                        Waiting list: {c!.name}
                      </div>
                    ))}
                  </div>
                  <div className="medical">
                    <HeartPulse size={14} />
                    {v.can('medical.view') ? (
                      <span className="small">
                        <strong>Allergies:</strong> {d.allergies || 'None recorded'} · <strong>Medical:</strong> {d.medicalNotes || 'None recorded'}
                      </span>
                    ) : (
                      <span className="small faint">Medical & allergy info is restricted.</span>
                    )}
                  </div>
                </div>
              );
            })}
            {canEdit && (
              <div className="inline-form link-dancer">
                <SearchSelect
                  ariaLabel="Add existing dancer"
                  value={linkDancer}
                  onChange={setLinkDancer}
                  placeholder="Add existing dancer…"
                  options={db.dancers.filter((d) => d.familyId !== f.id).map((d) => ({ value: d.id, label: fullName(d), hint: d.familyId ? `in ${db.families.find((x) => x.id === d.familyId)?.name}` : 'no family' }))}
                />
                <button className="btn btn-ghost" disabled={!linkDancer} onClick={() => run(() => (setDancersFamily([linkDancer], f.id), true), 'Dancer added to family.') && setLinkDancer('')}>
                  <Link2 size={15} /> Link
                </button>
              </div>
            )}
          </Card>
        </div>
      </div>
      <FamilyForm open={editing} id={f.id} onClose={() => setEditing(false)} />
      <GuardianForm familyId={f.id} open={!!guardian} id={guardian === 'new' ? undefined : guardian ?? undefined} onClose={() => setGuardian(null)} />
      <EmergencyForm familyId={f.id} open={!!contact} id={contact === 'new' ? undefined : contact ?? undefined} onClose={() => setContact(null)} />
    </>
  );
}

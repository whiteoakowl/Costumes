import { useState } from 'react';
import { useNavigate } from '../lib/router';
import { Eye, KeyRound, Mail, Pencil, Plus, Power, Trash2 } from 'lucide-react';
import { useDb } from '../data/store';
import { deleteAccount, saveAccount, setAccountActive, touchAccount, type AccountInput } from '../data/studioActions';
import { PERMISSIONS, ROLE_DEFAULTS, permissionsOf, portalLabels, portalOf, roleLabels, staffName, type Permission } from '../data/studio';
import { formatDateTime, fullName } from '../data/selectors';
import { Badge, Card, DataTable, EmptyState, Field, PageHeader, SampleTag, SearchInput, SearchSelect, type Column } from '../components/ui';
import { FormModal } from '../components/forms';
import { useConfirm, useRun, useToast } from '../components/feedback';
import { setViewer } from '../lib/session';
import { portalHome } from '../lib/nav';
import type { ID, Role, UserAccount } from '../data/types';

const ROLES = Object.keys(roleLabels) as Role[];
const needsStaff = (r: Role) => ['office_admin', 'office_assistant', 'teacher', 'assistant_teacher', 'performance_staff'].includes(r);

export function AccountsPage() {
  const db = useDb();
  const run = useRun();
  const toast = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [role, setRole] = useState('');
  const [status, setStatus] = useState('active');
  const [editing, setEditing] = useState<ID | 'new' | null>(null);

  const linked = (a: UserAccount) => {
    if (a.staffId) return staffName(db.staff.find((s) => s.id === a.staffId)) || 'Removed staff';
    if (a.guardianId) {
      const g = db.guardians.find((x) => x.id === a.guardianId);
      const f = g && db.families.find((x) => x.id === g.familyId);
      return g ? `${g.firstName} ${g.lastName} · ${f?.name ?? ''}` : 'Removed parent';
    }
    if (a.dancerId) {
      const d = db.dancers.find((x) => x.id === a.dancerId);
      return d ? fullName(d) : 'Removed dancer';
    }
    return '—';
  };
  const rows = db.accounts.filter(
    (a) => (!role || a.role === role) && (status === 'all' || (status === 'active' ? a.active : !a.active)) && (!q || `${a.displayName} ${a.email} ${linked(a)}`.toLowerCase().includes(q.toLowerCase())),
  );

  const notAvailable = () => toast.info('Email invitations and password resets need online accounts, which are not set up yet (this app is browser-only for now).');

  const columns: Column<UserAccount>[] = [
    {
      key: 'name',
      header: 'Name',
      render: (a) => (
        <>
          <span className="link-strong">{a.displayName}</span>
          <SampleTag show={a.isSample} />
          {a.email && <div className="small faint">{a.email}</div>}
        </>
      ),
      sortValue: (a) => a.displayName,
    },
    { key: 'role', header: 'Role', render: (a) => <Badge tone={a.role === 'owner' ? 'rose' : 'neutral'}>{roleLabels[a.role]}</Badge>, sortValue: (a) => ROLES.indexOf(a.role) },
    { key: 'portal', header: 'Portal', render: (a) => portalLabels[portalOf[a.role]], minor: true },
    { key: 'linked', header: 'Linked to', render: (a) => <span className="small">{linked(a)}</span>, minor: true },
    { key: 'perms', header: 'Permissions', render: (a) => <span className="small">{a.role === 'owner' ? 'Full access' : a.permissions ? `Custom (${a.permissions.length})` : 'Role defaults'}</span>, minor: true },
    { key: 'last', header: 'Last active', render: (a) => <span className="small">{a.lastActiveAt ? formatDateTime(a.lastActiveAt) : '—'}</span>, sortValue: (a) => a.lastActiveAt, minor: true },
    { key: 'status', header: 'Status', render: (a) => (a.active ? <Badge tone="ready">Active</Badge> : <Badge>Deactivated</Badge>), sortValue: (a) => (a.active ? 0 : 1) },
    {
      key: 'act',
      header: '',
      render: (a) => (
        <div className="row-actions">
          {a.active && (
            <button
              className="btn btn-ghost btn-sm"
              title="Preview this person's portal"
              onClick={() => {
                setViewer(a.id);
                touchAccount(a.id);
                navigate(portalHome[portalOf[a.role]]);
              }}
            >
              <Eye size={13} /> View as
            </button>
          )}
          <button className="icon-btn" aria-label={`Edit ${a.displayName}`} onClick={() => setEditing(a.id)}>
            <Pencil size={15} />
          </button>
          <button className="icon-btn" aria-label={`${a.active ? 'Deactivate' : 'Reactivate'} ${a.displayName}`} title={a.active ? 'Deactivate' : 'Reactivate'} onClick={() => run(() => setAccountActive(a.id, !a.active), a.active ? 'Account deactivated.' : 'Account reactivated.')}>
            <Power size={15} />
          </button>
          <button
            className="icon-btn danger"
            aria-label={`Delete ${a.displayName}`}
            onClick={async () => {
              if (await confirm({ title: 'Delete account?', message: `Delete the login for ${a.displayName}? Their records (staff profile, family, dancer) are not deleted. Deactivating keeps the account for later.`, confirmLabel: 'Delete account', danger: true }))
                run(() => deleteAccount(a.id), 'Account deleted.');
            }}
          >
            <Trash2 size={15} />
          </button>
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Accounts & Access"
        subtitle="Logins for staff, parents and dancers, their roles and what each can see"
        actions={
          <>
            <button className="btn btn-ghost" onClick={notAvailable}>
              <Mail size={16} /> Send invitation
            </button>
            <button className="btn btn-primary" onClick={() => setEditing('new')}>
              <Plus size={16} /> Add account
            </button>
          </>
        }
      />
      <div className="hint-bar">
        <span>
          <KeyRound size={14} /> <strong>Browser-only mode:</strong> accounts let you preview each portal with “View as”. Real sign-in, invitations and password resets need online accounts, which aren't set up yet.
        </span>
      </div>
      <Card>
        <div className="toolbar">
          <SearchInput value={q} onChange={setQ} placeholder="Search name, email, linked person…" />
          <select className="input input-auto" value={role} onChange={(e) => setRole(e.target.value)} aria-label="Filter by role">
            <option value="">All roles</option>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {roleLabels[r]}
              </option>
            ))}
          </select>
          <select className="input input-auto" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status">
            <option value="active">Active</option>
            <option value="inactive">Deactivated</option>
            <option value="all">All</option>
          </select>
        </div>
        <DataTable rows={rows} columns={columns} getId={(a) => a.id} initialSort={{ key: 'role', dir: 'asc' }} empty={<EmptyState title="No accounts match" />} />
      </Card>
      <Card title="Recent account activity">
        <ul className="mini-list">
          {[...db.activity]
            .filter((x) => x.action.startsWith('Account'))
            .reverse()
            .slice(0, 8)
            .map((x) => (
              <li key={x.id}>
                <div>
                  <strong>{x.action}</strong> <span className="faint">· {x.detail}</span>
                  <div className="small faint">
                    {formatDateTime(x.createdAt)} by {x.actor}
                  </div>
                </div>
              </li>
            ))}
          {!db.activity.some((x) => x.action.startsWith('Account')) && <li className="faint small">No account changes yet.</li>}
        </ul>
      </Card>
      <AccountForm id={editing === 'new' ? undefined : editing ?? undefined} open={!!editing} onClose={() => setEditing(null)} />
    </>
  );
}

function AccountForm({ open, onClose, id }: { open: boolean; onClose: () => void; id?: ID }) {
  const db = useDb();
  const run = useRun();
  const [v, setV] = useState<AccountInput>({ displayName: '', email: '', role: 'teacher', staffId: null, guardianId: null, dancerId: null, permissions: null, notes: '' });
  const [last, setLast] = useState<string | null>(null);
  const key = open ? id ?? 'new' : null;
  if (key !== last) {
    setLast(key);
    if (open) {
      const a = id ? db.accounts.find((x) => x.id === id) : undefined;
      setV(a ? { displayName: a.displayName, email: a.email, role: a.role, staffId: a.staffId, guardianId: a.guardianId, dancerId: a.dancerId, permissions: a.permissions ? [...a.permissions] : null, notes: a.notes } : { displayName: '', email: '', role: 'teacher', staffId: null, guardianId: null, dancerId: null, permissions: null, notes: '' });
    }
  }
  const set = <K extends keyof AccountInput>(k: K, val: AccountInput[K]) => setV((p) => ({ ...p, [k]: val }));
  const staffOpts = db.staff.map((s) => ({ value: s.id, label: staffName(s), hint: s.title || s.position }));
  const guardianOpts = db.guardians.map((g) => ({ value: g.id, label: `${g.firstName} ${g.lastName}`, hint: db.families.find((f) => f.id === g.familyId)?.name, group: db.families.find((f) => f.id === g.familyId)?.name }));
  const dancerOpts = db.dancers.map((d) => ({ value: d.id, label: fullName(d) }));
  const effective = permissionsOf({ role: v.role, permissions: v.permissions });
  const togglePerm = (p: Permission) => {
    const cur = new Set(v.permissions ?? ROLE_DEFAULTS[v.role]);
    if (cur.has(p)) cur.delete(p);
    else cur.add(p);
    set('permissions', [...cur]);
  };
  const autoName = (name: string) => setV((p) => ({ ...p, displayName: p.displayName || name }));
  return (
    <FormModal open={open} onClose={onClose} title={id ? 'Edit Account' : 'Add Account'} onSubmit={() => run(() => saveAccount(v, id), id ? 'Account updated.' : 'Account created.') && onClose()} size="lg">
      <div className="grid-2">
        <Field label="Role" required>
          <select className="input" value={v.role} onChange={(e) => setV((p) => ({ ...p, role: e.target.value as Role, permissions: null }))}>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {roleLabels[r]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Portal">
          <input className="input" value={portalLabels[portalOf[v.role]]} readOnly />
        </Field>
        {needsStaff(v.role) && (
          <Field label="Staff member" required={['teacher', 'assistant_teacher'].includes(v.role)} hint="Add staff on the Teachers & Staff page">
            <SearchSelect
              ariaLabel="Staff member"
              value={v.staffId ?? ''}
              onChange={(x) => {
                set('staffId', x || null);
                const s = db.staff.find((y) => y.id === x);
                if (s) {
                  autoName(staffName(s));
                  setV((p) => ({ ...p, email: p.email || s.email }));
                }
              }}
              options={staffOpts}
              noneLabel="Not linked"
            />
          </Field>
        )}
        {v.role === 'parent' && (
          <Field label="Parent / guardian" required hint="Parents only ever see their own family">
            <SearchSelect
              ariaLabel="Parent / guardian"
              value={v.guardianId ?? ''}
              onChange={(x) => {
                set('guardianId', x || null);
                const g = db.guardians.find((y) => y.id === x);
                if (g) {
                  autoName(`${g.firstName} ${g.lastName}`);
                  setV((p) => ({ ...p, email: p.email || g.email }));
                }
              }}
              options={guardianOpts}
              noneLabel="Choose…"
            />
          </Field>
        )}
        {v.role === 'dancer' && (
          <Field label="Dancer" required>
            <SearchSelect
              ariaLabel="Dancer"
              value={v.dancerId ?? ''}
              onChange={(x) => {
                set('dancerId', x || null);
                const d = db.dancers.find((y) => y.id === x);
                if (d) autoName(fullName(d));
              }}
              options={dancerOpts}
              noneLabel="Choose…"
            />
          </Field>
        )}
        <Field label="Name" required>
          <input className="input" value={v.displayName} onChange={(e) => set('displayName', e.target.value)} />
        </Field>
        <Field label="Email (login)">
          <input className="input" type="email" value={v.email} onChange={(e) => set('email', e.target.value)} />
        </Field>
      </div>
      {v.role !== 'owner' && v.role !== 'parent' && v.role !== 'dancer' && (
        <div className="field">
          <span className="field-label">Permissions</span>
          <label className="check-inline">
            <input type="checkbox" checked={v.permissions === null} onChange={(e) => set('permissions', e.target.checked ? null : [...ROLE_DEFAULTS[v.role]])} /> Use the standard permissions for {roleLabels[v.role]}
          </label>
          <div className="perm-grid">
            {(Object.keys(PERMISSIONS) as Permission[]).map((p) => (
              <label key={p} className={`check-inline small ${v.permissions === null ? 'faint' : ''}`}>
                <input type="checkbox" checked={effective.has(p)} disabled={v.permissions === null} onChange={() => togglePerm(p)} />
                {PERMISSIONS[p]}
              </label>
            ))}
          </div>
        </div>
      )}
      {(v.role === 'parent' || v.role === 'dancer') && <p className="small faint">Parent and dancer accounts only ever see their own family's dancers, classes, attendance and costumes.</p>}
      <Field label="Notes">
        <textarea className="input" rows={2} value={v.notes} onChange={(e) => set('notes', e.target.value)} />
      </Field>
    </FormModal>
  );
}

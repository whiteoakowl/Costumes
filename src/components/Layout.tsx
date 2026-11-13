import { useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeftRight, Eye, Lock, Menu, Settings, Sparkles, X } from 'lucide-react';
import { useDb } from '../data/store';
import { countSampleRecords } from '../data/actions';
import { touchAccount } from '../data/studioActions';
import { portalLabels, portalOf, roleLabels } from '../data/studio';
import { setViewer, useViewer } from '../lib/session';
import { inboxFor, notificationsFor } from '../data/commsActions';
import { NAV_ITEMS, canVisit, portalHome } from '../lib/nav';
import { EmptyState } from './ui';
import { AppStatusBanners, InstallAppButton } from './InstallApp';
import type { Role } from '../data/types';

const ROLE_ORDER: Role[] = ['owner', 'office_admin', 'office_assistant', 'teacher', 'assistant_teacher', 'performance_staff', 'parent', 'dancer'];

/** Account switcher: preview any portal by "viewing as" one of the studio's accounts. */
export function ViewAsSelect({ compact }: { compact?: boolean }) {
  const db = useDb();
  const v = useViewer();
  const navigate = useNavigate();
  const accounts = (db.accounts ?? []).filter((a) => a.active);
  return (
    <label className={`viewas ${compact ? 'compact' : ''}`}>
      <span className="viewas-label">
        <Eye size={13} /> Viewing as
      </span>
      <select
        className="input input-sm"
        value={v.account?.id ?? ''}
        aria-label="Viewing as"
        onChange={(e) => {
          const next = accounts.find((a) => a.id === e.target.value);
          if (!next) return;
          setViewer(next.id);
          touchAccount(next.id);
          navigate(portalHome[portalOf[next.role]]);
        }}
      >
        {ROLE_ORDER.map((role) => {
          const list = accounts.filter((a) => a.role === role);
          if (!list.length) return null;
          return (
            <optgroup key={role} label={roleLabels[role]}>
              {list.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.displayName}
                </option>
              ))}
            </optgroup>
          );
        })}
      </select>
    </label>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const db = useDb();
  const v = useViewer();
  const [open, setOpen] = useState(false);
  const location = useLocation();
  useEffect(() => {
    setOpen(false);
    window.scrollTo(0, 0);
  }, [location.pathname]);
  const samples = countSampleRecords(db);
  const items = NAV_ITEMS.filter((i) => i.show(v));
  const seen = new Set<string>();
  let lastSection: string | undefined;
  const allowed = canVisit(v, location.pathname);
  const isOwner = v.account?.role === 'owner';
  const who = { familyId: v.familyId, staffId: v.staffId, admin: v.isStaffAdmin };
  const me = v.account?.id ?? 'anon';
  const unread = inboxFor(db, who).filter((m) => !m.readBy.includes(me)).length + notificationsFor(db, who).filter((n) => !n.readBy.includes(me)).length;

  return (
    <div className={`app portal-${v.portal} ${open ? 'nav-open' : ''}`}>
      <aside className="sidebar" aria-label="Main navigation">
        <div className="brand">
          <div className="brand-mark" aria-hidden>
            <Sparkles size={18} />
          </div>
          <div>
            <div className="brand-name">{db.settings.studioName === 'Your Dance Studio' ? 'Studio Manager' : db.settings.studioName}</div>
            <div className="brand-sub">{portalLabels[v.portal]}</div>
          </div>
          <button className="icon-btn nav-close" onClick={() => setOpen(false)} aria-label="Close menu">
            <X size={18} />
          </button>
        </div>
        <NavLink to="/portals" className={({ isActive }) => `portal-switch ${isActive ? 'active' : ''}`}>
          <ArrowLeftRight size={15} />
          <span>
            {portalLabels[v.portal]} <span className="faint">· switch portal</span>
          </span>
        </NavLink>
        <nav className="nav">
          {items.map(({ to, label, icon: Icon, end, section }) => {
            if (seen.has(to + label)) return null;
            seen.add(to + label);
            const header = section && section !== lastSection ? section : null;
            lastSection = section;
            return (
              <div key={to + label}>
                {header && <div className="nav-section">{header}</div>}
                <NavLink to={to} end={end} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                  <Icon size={18} />
                  <span>{label}</span>
                  {to === '/inbox' && unread > 0 && <span className="nav-count" aria-label={`${unread} unread`}>{unread}</span>}
                </NavLink>
              </div>
            );
          })}
        </nav>
        <div className="nav-bottom">
          {samples > 0 && v.isStaffAdmin && (
            <NavLink to="/settings" className="sample-note">
              <Sparkles size={14} /> Sample data is loaded. Remove it in Settings when you're ready.
            </NavLink>
          )}
          <InstallAppButton />
          <ViewAsSelect />
          {v.can('settings.edit') && (
            <NavLink to="/settings" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              <Settings size={18} />
              <span>Settings</span>
            </NavLink>
          )}
        </div>
      </aside>
      <div className="scrim" onClick={() => setOpen(false)} />
      <div className="main">
        <header className="topbar">
          <button className="icon-btn" onClick={() => setOpen(true)} aria-label="Open menu">
            <Menu size={20} />
          </button>
          <span className="topbar-title">{portalLabels[v.portal]}</span>
          <InstallAppButton compact />
        </header>
        <AppStatusBanners />
        {!isOwner && v.account && (
          <div className="preview-banner">
            <Eye size={15} />
            <span>
              Previewing the <strong>{portalLabels[v.portal]}</strong> as <strong>{v.account.displayName}</strong> ({roleLabels[v.account.role]}). Browser-only preview — not a secure login.
            </span>
            <Link to="/portals" className="btn btn-ghost btn-sm">
              Switch portal
            </Link>
          </div>
        )}
        <main className="content">
          {allowed ? (
            children
          ) : (
            <EmptyState
              icon={<Lock size={28} />}
              title="Not available in this portal"
              message={`${v.account ? roleLabels[v.account.role] : 'This'} accounts don't have access to this page.`}
              action={
                <Link className="btn btn-primary" to={portalHome[v.portal]}>
                  Go to my dashboard
                </Link>
              }
            />
          )}
        </main>
      </div>
    </div>
  );
}

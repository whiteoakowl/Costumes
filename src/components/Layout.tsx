import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { CalendarHeart, LayoutDashboard, Menu, Settings, Shirt, Sparkles, Theater, Users, Warehouse, X } from 'lucide-react';
import { useDb } from '../data/store';
import { countSampleRecords } from '../data/actions';

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/dancers', label: 'Dancers', icon: Users },
  { to: '/costumes', label: 'Costumes', icon: Shirt },
  { to: '/shows', label: 'Shows', icon: Theater },
  { to: '/performances', label: 'Performance Planning', icon: CalendarHeart },
  { to: '/storage', label: 'Storage Locations', icon: Warehouse },
];

export function Layout({ children }: { children: ReactNode }) {
  const db = useDb();
  const [open, setOpen] = useState(false);
  const location = useLocation();
  useEffect(() => {
    setOpen(false);
    window.scrollTo(0, 0);
  }, [location.pathname]);
  const samples = countSampleRecords(db);

  return (
    <div className={`app ${open ? 'nav-open' : ''}`}>
      <aside className="sidebar" aria-label="Main navigation">
        <div className="brand">
          <div className="brand-mark" aria-hidden>
            <Sparkles size={18} />
          </div>
          <div>
            <div className="brand-name">Studio Costume Manager</div>
            {db.settings.studioName !== 'Studio Costume Manager' && <div className="brand-sub">{db.settings.studioName}</div>}
          </div>
          <button className="icon-btn nav-close" onClick={() => setOpen(false)} aria-label="Close menu">
            <X size={18} />
          </button>
        </div>
        <nav className="nav">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              <Icon size={18} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="nav-bottom">
          {samples > 0 && (
            <NavLink to="/settings" className="sample-note">
              <Sparkles size={14} /> Sample data is loaded. Remove it in Settings when you're ready.
            </NavLink>
          )}
          <NavLink to="/settings" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            <Settings size={18} />
            <span>Settings</span>
          </NavLink>
        </div>
      </aside>
      <div className="scrim" onClick={() => setOpen(false)} />
      <div className="main">
        <header className="topbar">
          <button className="icon-btn" onClick={() => setOpen(true)} aria-label="Open menu">
            <Menu size={20} />
          </button>
          <span className="topbar-title">Studio Costume Manager</span>
        </header>
        <main className="content">{children}</main>
      </div>
    </div>
  );
}

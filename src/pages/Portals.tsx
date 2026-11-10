import { useNavigate } from 'react-router-dom';
import { Briefcase, Crown, GraduationCap, Home, LogIn, Theater } from 'lucide-react';
import { useDb } from '../data/store';
import { touchAccount } from '../data/studioActions';
import { portalLabels, portalOf, roleLabels, type Portal } from '../data/studio';
import { Card, PageHeader } from '../components/ui';
import { setViewer, useViewer } from '../lib/session';
import { portalHome } from '../lib/nav';

const PORTALS: { portal: Portal; icon: typeof Crown; description: string }[] = [
  { portal: 'management', icon: Crown, description: 'Full control of the studio: people, classes, calendar, payroll, costumes, productions, accounts and settings.' },
  { portal: 'office', icon: Briefcase, description: 'Day-to-day administration: dancers, families, classes, attendance, calendar and costumes.' },
  { portal: 'teacher', icon: GraduationCap, description: "Today's classes, my schedule, class rosters, attendance, my hours and announcements." },
  { portal: 'parent', icon: Home, description: "A family's dancers, class schedule, attendance, recital costumes, notices and contact details." },
  { portal: 'performance', icon: Theater, description: 'Shows, performance planning, costumes, props, repairs, storage and volunteers.' },
];

/** Pick a portal and the account to open it as. */
export function PortalsPage() {
  const db = useDb();
  const v = useViewer();
  const navigate = useNavigate();
  const enter = (id: string) => {
    const a = db.accounts.find((x) => x.id === id);
    if (!a) return;
    setViewer(a.id);
    touchAccount(a.id);
    navigate(portalHome[portalOf[a.role]]);
  };
  return (
    <>
      <PageHeader title="Switch Portal" subtitle="Open any portal as one of the studio's accounts. Browser-only preview — not a secure login yet." />
      <div className="portal-grid">
        {PORTALS.map(({ portal, icon: Icon, description }) => {
          const accounts = db.accounts.filter((a) => a.active && portalOf[a.role] === portal);
          return (
            <Card key={portal} className={`portal-card portal-${portal} ${v.portal === portal ? 'current' : ''}`}>
              <div className="portal-head">
                <div className="portal-icon">
                  <Icon size={22} />
                </div>
                <div>
                  <h3>{portalLabels[portal]}</h3>
                  {v.portal === portal && <span className="badge badge-rose">You are here</span>}
                </div>
              </div>
              <p className="small">{description}</p>
              {!accounts.length ? (
                <p className="small faint">
                  No {portal === 'teacher' ? 'teacher' : portal === 'parent' ? 'parent' : portal === 'office' ? 'office' : portal === 'performance' ? 'performance staff' : 'owner'} accounts yet.
                  {v.can('accounts.manage') && ' Add one under Accounts & Access.'}
                </p>
              ) : (
                <div className="portal-accounts">
                  {accounts.map((a) => (
                    <button key={a.id} className={`btn btn-sm ${v.account?.id === a.id ? 'btn-primary' : 'btn-ghost'}`} onClick={() => enter(a.id)} title={roleLabels[a.role]}>
                      <LogIn size={13} /> {a.displayName}
                    </button>
                  ))}
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </>
  );
}

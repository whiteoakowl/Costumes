import { Navigate } from '../lib/router';
import { useViewer } from '../lib/session';
import { portalHome } from '../lib/nav';
import { Dashboard } from './Dashboard';

/** "/" is the owner/office dashboard; other portals go to their own home. */
export function Home() {
  const v = useViewer();
  return v.isStaffAdmin ? <Dashboard /> : <Navigate to={portalHome[v.portal]} replace />;
}

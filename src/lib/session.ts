import { useSyncExternalStore } from 'react';
import { getDb, useDb } from '../data/store';
import { accountFamilyId, permissionsOf, portalOf, type Permission, type Portal } from '../data/studio';
import type { Database, ID, UserAccount } from '../data/types';

/**
 * "Viewing as" — which account's portal is shown. In browser-only mode this
 * is a preview switch, not a login: anyone at this computer can change it.
 */

const KEY = 'studio-costume-manager/viewer';
let viewerId: string | null = typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null;
const listeners = new Set<() => void>();

export function setViewer(id: ID) {
  viewerId = id;
  try {
    localStorage.setItem(KEY, id);
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function resolveViewer(db: Database, id: string | null = viewerId): UserAccount | undefined {
  const accounts = db.accounts ?? [];
  const chosen = id ? accounts.find((a) => a.id === id && a.active) : undefined;
  return chosen ?? accounts.find((a) => a.role === 'owner' && a.active) ?? accounts[0];
}

export interface Viewer {
  account: UserAccount | undefined;
  portal: Portal;
  can: (p: Permission) => boolean;
  /** Owner / office roles see the whole studio. */
  isStaffAdmin: boolean;
  familyId: ID | null;
  staffId: ID | null;
  name: string;
}

export function buildViewer(db: Database, account: UserAccount | undefined): Viewer {
  const perms = account ? permissionsOf(account) : new Set<Permission>();
  const portal = account ? portalOf[account.role] : 'management';
  return {
    account,
    portal,
    can: (p) => perms.has(p),
    isStaffAdmin: portal === 'management' || portal === 'office',
    familyId: accountFamilyId(db, account),
    staffId: account?.staffId ?? null,
    name: account?.displayName ?? 'Studio Owner',
  };
}

export function useViewer(): Viewer {
  const db = useDb();
  const id = useSyncExternalStore(subscribe, () => viewerId, () => viewerId);
  return buildViewer(db, resolveViewer(db, id));
}

/** Name recorded in logs and audit trails for the current viewer. */
export function actorName() {
  const db = getDb();
  const a = resolveViewer(db);
  return a ? `${a.displayName}` : 'Studio';
}

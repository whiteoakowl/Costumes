import type { Accessory, CastList, Costume, CostumeAssignment, Database, Dancer, ID, OwnerType, PerformancePlan, Show } from './types';
import { todayStr } from './ids';

/* Derived data. Everything is computed from the normalized tables, so any
   change anywhere is reflected everywhere automatically. */

export function fullName(d: Pick<Dancer, 'firstName' | 'lastName'>) {
  return `${d.firstName} ${d.lastName}`.trim();
}

export function ageFromBirthday(birthday: string, on = new Date()): number | null {
  if (!birthday) return null;
  const [y, m, d] = birthday.split('-').map(Number);
  if (!y || !m || !d) return null;
  let age = on.getFullYear() - y;
  if (on.getMonth() + 1 < m || (on.getMonth() + 1 === m && on.getDate() < d)) age -= 1;
  return age >= 0 ? age : null;
}

export function byId<T extends { id: ID }>(list: T[]): Map<ID, T> {
  return new Map(list.map((r) => [r.id, r]));
}

export function sortedCategories(db: Database) {
  return [...db.categories].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
}

export function sortedLocations(db: Database) {
  return [...db.storageLocations].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
}

export function sortedDancers(db: Database) {
  return [...db.dancers].sort((a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName));
}

export function accessoriesFor(db: Database, costumeId: ID): Accessory[] {
  return db.accessories.filter((a) => a.costumeId === costumeId);
}

export function castsFor(db: Database, ownerType: OwnerType, ownerId: ID): CastList[] {
  return db.casts.filter((c) => c.ownerType === ownerType && c.ownerId === ownerId).sort((a, b) => a.sortOrder - b.sortOrder);
}

export function ownerName(db: Database, ownerType: OwnerType, ownerId: ID) {
  return ownerType === 'show' ? db.shows.find((s) => s.id === ownerId)?.name ?? 'Deleted show' : db.performances.find((p) => p.id === ownerId)?.name ?? 'Deleted performance';
}

/* ------------------------------------------------------ costume overview */

export type IssueKind = 'no_costume' | 'not_ready' | 'missing_accessory' | 'size_mismatch' | 'quantity_short';

export const issueLabels: Record<IssueKind, string> = {
  no_costume: 'No costume assigned',
  not_ready: 'Costume in progress',
  missing_accessory: 'Missing accessory',
  size_mismatch: 'Size check',
  quantity_short: 'Not enough on hand',
};

export interface OverviewRow {
  key: string;
  castId: ID;
  castName: string;
  membershipId: ID;
  dancerId: ID;
  dancerName: string;
  role: string;
  dancerSize: string;
  costume: Costume | null;
  assignment: CostumeAssignment | null; // the dancer-specific or cast-wide assignment
  viaCast: boolean;
  accessories: Accessory[];
  issues: IssueKind[];
  issueDetails: string[];
}

export interface Readiness {
  totalDancers: number;
  totalAssignments: number;
  ready: number;
  needsWork: number;
  missingAssignments: number;
  unassignedDancers: { dancerId: ID; dancerName: string; castName: string }[];
  incompleteDancers: { dancerId: ID; dancerName: string; castName: string; issues: string[] }[];
  missingAccessoryCount: number;
  percent: number | null; // null when there is nothing to measure yet
}

function norm(s: string) {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * One row per (cast member × costume they wear), plus one "no costume" row for
 * any cast member with nothing assigned. Rows carry the warnings shown on the
 * Performance Costume Overview.
 */
export function buildOverview(db: Database, ownerType: OwnerType, ownerId: ID): { rows: OverviewRow[]; readiness: Readiness } {
  const dancers = byId(db.dancers);
  const costumes = byId(db.costumes);
  const casts = castsFor(db, ownerType, ownerId);
  const assignments = db.assignments.filter((a) => a.ownerType === ownerType && a.ownerId === ownerId && costumes.has(a.costumeId));
  const rows: OverviewRow[] = [];

  for (const cast of casts) {
    const members = db.castMembers
      .filter((m) => m.castId === cast.id && dancers.has(m.dancerId))
      .sort((a, b) => fullName(dancers.get(a.dancerId)!).localeCompare(fullName(dancers.get(b.dancerId)!)));
    const castWide = assignments.filter((a) => a.castId === cast.id && !a.dancerId);

    // How many dancers in this cast wear each costume (to compare with quantity on hand).
    const wearers = new Map<ID, Set<ID>>();
    const castRows: OverviewRow[] = [];

    for (const m of members) {
      const dancer = dancers.get(m.dancerId)!;
      const own = assignments.filter((a) => a.dancerId === m.dancerId && (a.castId === cast.id || a.castId === null));
      const list: { a: CostumeAssignment; viaCast: boolean }[] = [
        ...own.map((a) => ({ a, viaCast: false })),
        ...castWide.filter((cw) => !own.some((o) => o.costumeId === cw.costumeId)).map((a) => ({ a, viaCast: true })),
      ];
      const base = {
        castId: cast.id,
        castName: cast.name,
        membershipId: m.id,
        dancerId: dancer.id,
        dancerName: fullName(dancer),
        role: m.role,
        dancerSize: dancer.costumeSize,
      };
      if (!list.length) {
        castRows.push({ ...base, key: `${m.id}:none`, costume: null, assignment: null, viaCast: false, accessories: [], issues: ['no_costume'], issueDetails: ['No costume assigned'] });
        continue;
      }
      for (const { a, viaCast } of list) {
        const costume = costumes.get(a.costumeId)!;
        if (!wearers.has(costume.id)) wearers.set(costume.id, new Set());
        wearers.get(costume.id)!.add(dancer.id);
        castRows.push({ ...base, key: `${m.id}:${a.id}`, costume, assignment: a, viaCast, accessories: accessoriesFor(db, costume.id), issues: [], issueDetails: [] });
      }
    }

    for (const row of castRows) {
      const c = row.costume;
      if (!c) continue;
      if (c.status !== 'ready') {
        row.issues.push('not_ready');
        row.issueDetails.push(`Costume in progress${c.repairNotes ? `: ${c.repairNotes}` : ''}`);
      }
      const missing = row.accessories.filter((a) => a.quantity <= 0);
      const wearing = wearers.get(c.id)?.size ?? 0;
      const short = row.accessories.filter((a) => a.quantity > 0 && a.quantity < wearing);
      if (missing.length || short.length) {
        row.issues.push('missing_accessory');
        row.issueDetails.push(
          [...missing.map((a) => `${a.name} missing`), ...short.map((a) => `${a.name}: ${a.quantity} on hand for ${wearing} dancers`)].join('; '),
        );
      }
      if (row.dancerSize && c.size && norm(row.dancerSize) !== norm(c.size)) {
        row.issues.push('size_mismatch');
        row.issueDetails.push(`Dancer wears ${row.dancerSize}; costume is ${c.size}`);
      }
      if (wearing > c.quantity) {
        row.issues.push('quantity_short');
        row.issueDetails.push(`${wearing} dancers in ${row.castName} but only ${c.quantity} available`);
      }
    }
    rows.push(...castRows);
  }

  const costumeRows = rows.filter((r) => r.costume);
  const missingRows = rows.filter((r) => !r.costume);
  const ready = costumeRows.filter((r) => r.costume!.status === 'ready').length;
  const denominator = costumeRows.length + missingRows.length;
  const incomplete = new Map<string, Readiness['incompleteDancers'][number]>();
  for (const r of costumeRows) {
    if (!r.issues.length) continue;
    const k = `${r.castId}:${r.dancerId}`;
    const entry = incomplete.get(k) ?? { dancerId: r.dancerId, dancerName: r.dancerName, castName: r.castName, issues: [] };
    for (const d of r.issueDetails) if (!entry.issues.includes(d)) entry.issues.push(d);
    incomplete.set(k, entry);
  }

  return {
    rows,
    readiness: {
      totalDancers: new Set(rows.map((r) => r.dancerId)).size,
      totalAssignments: costumeRows.length,
      ready,
      needsWork: costumeRows.length - ready,
      missingAssignments: missingRows.length,
      unassignedDancers: missingRows.map((r) => ({ dancerId: r.dancerId, dancerName: r.dancerName, castName: r.castName })),
      incompleteDancers: [...incomplete.values()],
      missingAccessoryCount: costumeRows.filter((r) => r.issues.includes('missing_accessory')).length,
      percent: denominator ? Math.round((ready / denominator) * 100) : null,
    },
  };
}

/** Costumes in a show/performance's costume list (any assignment row counts). */
export function ownerCostumeIds(db: Database, ownerType: OwnerType, ownerId: ID): ID[] {
  const ids = new Set(db.assignments.filter((a) => a.ownerType === ownerType && a.ownerId === ownerId).map((a) => a.costumeId));
  return db.costumes.filter((c) => ids.has(c.id)).map((c) => c.id);
}

export function ownerDancerIds(db: Database, ownerType: OwnerType, ownerId: ID): ID[] {
  const castIds = new Set(castsFor(db, ownerType, ownerId).map((c) => c.id));
  return [...new Set(db.castMembers.filter((m) => castIds.has(m.castId)).map((m) => m.dancerId))];
}

/* ------------------------------------------------------- dancer profile */

export interface DancerCostumeEntry {
  ownerType: OwnerType;
  ownerId: ID;
  ownerName: string;
  castName: string;
  role: string;
  costume: Costume;
  viaCast: boolean;
}

export function dancerCostumes(db: Database, dancerId: ID): DancerCostumeEntry[] {
  const costumes = byId(db.costumes);
  const casts = byId(db.casts);
  const out: DancerCostumeEntry[] = [];
  const memberships = db.castMembers.filter((m) => m.dancerId === dancerId);
  for (const m of memberships) {
    const cast = casts.get(m.castId);
    if (!cast) continue;
    const seen = new Set<ID>();
    for (const a of db.assignments) {
      if (a.ownerType !== cast.ownerType || a.ownerId !== cast.ownerId) continue;
      const mine = a.dancerId === dancerId && (a.castId === cast.id || a.castId === null);
      const wholeCast = !a.dancerId && a.castId === cast.id;
      if (!mine && !wholeCast) continue;
      const costume = costumes.get(a.costumeId);
      if (!costume || seen.has(costume.id)) continue;
      seen.add(costume.id);
      out.push({ ownerType: cast.ownerType, ownerId: cast.ownerId, ownerName: ownerName(db, cast.ownerType, cast.ownerId), castName: cast.name, role: m.role, costume, viaCast: wholeCast && !mine });
    }
  }
  return out;
}

export function dancerParticipation(db: Database, dancerId: ID) {
  const casts = byId(db.casts);
  return db.castMembers
    .filter((m) => m.dancerId === dancerId)
    .map((m) => ({ membership: m, cast: casts.get(m.castId)! }))
    .filter((x) => x.cast)
    .map((x) => ({ ...x, ownerName: ownerName(db, x.cast.ownerType, x.cast.ownerId) }));
}

/* ------------------------------------------------------------ dashboard */

export function showDateLabel(s: Pick<Show, 'startDate' | 'endDate'>) {
  if (!s.startDate) return '';
  if (s.endDate && s.endDate !== s.startDate) return `${formatDate(s.startDate)} – ${formatDate(s.endDate)}`;
  return formatDate(s.startDate);
}

export function isUpcomingShow(s: Show, today = todayStr()) {
  if (s.status === 'completed') return false;
  const last = s.endDate || s.startDate;
  return !last || last >= today;
}

export function isUpcomingPerformance(p: PerformancePlan, today = todayStr()) {
  return !p.date || p.date >= today;
}

export function costumeUsage(db: Database, costumeId: ID) {
  const seen = new Map<string, { ownerType: OwnerType; ownerId: ID; name: string; dancers: number }>();
  for (const a of db.assignments) {
    if (a.costumeId !== costumeId) continue;
    const k = `${a.ownerType}:${a.ownerId}`;
    if (!seen.has(k)) seen.set(k, { ownerType: a.ownerType, ownerId: a.ownerId, name: ownerName(db, a.ownerType, a.ownerId), dancers: 0 });
  }
  for (const entry of seen.values()) {
    entry.dancers = buildOverview(db, entry.ownerType, entry.ownerId).rows.filter((r) => r.costume?.id === costumeId).length;
  }
  return [...seen.values()];
}

/* ---------------------------------------------------------- formatting */

export function formatDate(value: string) {
  if (!value) return '';
  if (value.length > 10) {
    // Full timestamp: show the local calendar date.
    const dt = new Date(value);
    if (!Number.isNaN(dt.getTime())) return dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }
  const [y, m, d] = value.slice(0, 10).split('-').map(Number);
  if (!y) return value;
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatDateTime(iso: string) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function formatTime(hhmm: string) {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date();
  d.setHours(h, m || 0, 0, 0);
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

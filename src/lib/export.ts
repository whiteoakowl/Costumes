import type { Database, ID, ItemKind, OwnerType } from '../data/types';
import { formatDate, accessoriesFor, ageFromBirthday, buildOverview, buildPropOverview, byId, castsFor, formatDateTime, fullName, issueLabels, itemsOf, slotLabel, sortedSlots, volunteerName } from '../data/selectors';
import { progressReasonLabels } from '../data/actions';
import { todayStr } from '../data/ids';
import { exportImages } from './images';
import { exportFiles } from './files';

type Cell = string | number | boolean | null | undefined;

export function toCsv(header: string[], rows: Cell[][]): string {
  const esc = (v: Cell) => {
    const s = v === null || v === undefined ? '' : String(v);
    // Guard against spreadsheet formula injection.
    const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
    return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  return [header, ...rows].map((r) => r.map(esc).join(',')).join('\r\n');
}

export function download(filename: string, content: string, mime: string) {
  // The BOM makes Excel open CSV files with the correct (UTF-8) characters.
  const body = mime.startsWith('text/csv') ? '﻿' + content : content;
  const blob = new Blob([body], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'export';
}

export function costumeInventoryCsv(db: Database, costumeIds?: ID[], kind: ItemKind = 'costume') {
  const cats = byId(db.categories);
  const locs = byId(db.storageLocations);
  const all = itemsOf(db, kind);
  const list = costumeIds ? all.filter((c) => costumeIds.includes(c.id)) : all;
  const rows = [...list]
    .sort((a, b) => a.inventoryNumber.localeCompare(b.inventoryNumber))
    .map((c) => [
      c.inventoryNumber,
      c.name,
      c.categoryId ? cats.get(c.categoryId)?.name : 'Uncategorized',
      c.description,
      c.size,
      c.quantity,
      accessoriesFor(db, c.id).map((a) => `${a.name} x${a.quantity}`).join('; '),
      formatDate(c.dateAdded),
      c.storageLocationId ? locs.get(c.storageLocationId)?.name : 'Unassigned',
      c.status === 'ready' ? 'READY' : `IN PROGRESS (${progressReasonLabels[c.progressReason ?? 'repair']})`,
      formatDateTime(c.statusUpdatedAt),
      c.repairNotes,
      c.notes,
      c.isSample ? 'yes' : '',
    ]);
  return toCsv(
    kind === 'prop'
      ? ['Prop ID', 'Prop Name', 'Category', 'Description', 'Size', 'Available Quantity', 'Parts', 'Date Added', 'Storage Location', 'Status', 'Status Updated', 'Repair Notes', 'General Notes', 'Sample Data']
      : ['Costume ID', 'Costume Name', 'Category', 'Description', 'Size', 'Available Quantity', 'Accessories', 'Date Added', 'Storage Location', 'Status', 'Status Updated', 'Repair Notes', 'General Notes', 'Sample Data'],
    rows,
  );
}

export function exportCostumeInventory(db: Database, costumeIds?: ID[], kind: ItemKind = 'costume') {
  download(`${kind}-inventory-${todayStr()}.csv`, costumeInventoryCsv(db, costumeIds, kind), 'text/csv;charset=utf-8');
}

export function propAssignmentsCsv(db: Database, owners: { ownerType: OwnerType; ownerId: ID; name: string }[]) {
  const rows: Cell[][] = [];
  for (const o of owners) {
    for (const r of buildPropOverview(db, o.ownerType, o.ownerId).rows) {
      rows.push([
        o.name,
        r.prop.inventoryNumber,
        r.prop.name,
        r.target === 'dancer' ? r.dancerName : r.target === 'cast' ? `Whole cast` : 'Show / stage',
        r.castName,
        r.role,
        r.parts.map((a) => `${a.name} x${a.quantity}`).join('; '),
        r.prop.status === 'ready' ? 'READY' : 'IN PROGRESS',
        r.issueDetails.join('; '),
      ]);
    }
  }
  return toCsv(['Show / Performance', 'Prop ID', 'Prop', 'Assigned To', 'Cast', 'Role', 'Parts', 'Status', 'Warnings'], rows);
}

export function exportPropAssignments(db: Database, ownerType: OwnerType, ownerId: ID, name: string) {
  download(`${slug(name)}-prop-assignments-${todayStr()}.csv`, propAssignmentsCsv(db, [{ ownerType, ownerId, name }]), 'text/csv;charset=utf-8');
}

export function exportVolunteers(db: Database, ids?: ID[]) {
  const list = ids ? db.volunteers.filter((v) => ids.includes(v.id)) : db.volunteers;
  const rows = [...list]
    .sort((a, b) => a.lastName.localeCompare(b.lastName))
    .map((v) => [v.firstName, v.lastName, volunteerName(v), v.email, v.phone, v.preferredContact, v.skills.join('; '), sortedSlots(v).map((s) => slotLabel(s) + (s.note ? ` (${s.note})` : '')).join('; '), v.notes]);
  download(
    `volunteers-${todayStr()}.csv`,
    toCsv(['First Name', 'Last Name', 'Full Name', 'Email', 'Phone', 'Preferred Contact', 'Skills', 'Availability', 'Notes'], rows),
    'text/csv;charset=utf-8',
  );
}

export function assignmentsCsv(db: Database, owners: { ownerType: OwnerType; ownerId: ID; name: string }[]) {
  const rows: Cell[][] = [];
  for (const o of owners) {
    const { rows: overview } = buildOverview(db, o.ownerType, o.ownerId);
    for (const r of overview) {
      rows.push([
        o.name,
        r.castName,
        r.dancerName,
        r.role,
        r.costume?.inventoryNumber ?? '',
        r.costume?.name ?? '',
        r.costume?.size ?? '',
        r.dancerSize,
        r.accessories.map((a) => `${a.name} x${a.quantity}`).join('; '),
        r.costume ? (r.costume.status === 'ready' ? 'READY' : 'IN PROGRESS') : '',
        r.viaCast ? 'Whole cast' : r.costume ? 'Dancer' : '',
        r.issues.map((i) => issueLabels[i]).join('; '),
      ]);
    }
    if (!overview.length) rows.push([o.name, '', '', '', '', '', '', '', '', '', '', 'No cast lists yet']);
  }
  return toCsv(['Show / Performance', 'Cast', 'Dancer', 'Role', 'Costume ID', 'Costume', 'Costume Size', 'Dancer Costume Size', 'Accessories', 'Status', 'Assigned To', 'Warnings'], rows);
}

export function exportAssignments(db: Database, ownerType: OwnerType, ownerId: ID, name: string) {
  download(`${slug(name)}-costume-assignments-${todayStr()}.csv`, assignmentsCsv(db, [{ ownerType, ownerId, name }]), 'text/csv;charset=utf-8');
}

export function exportAllPerformanceAssignments(db: Database) {
  const owners = [...db.performances].sort((a, b) => a.date.localeCompare(b.date)).map((p) => ({ ownerType: 'performance' as const, ownerId: p.id, name: p.name }));
  download(`performance-assignments-${todayStr()}.csv`, assignmentsCsv(db, owners), 'text/csv;charset=utf-8');
}

export function exportDancers(db: Database) {
  const rows = db.dancers.map((d) => [
    d.firstName,
    d.lastName,
    fullName(d),
    ageFromBirthday(d.birthday) ?? '',
    formatDate(d.birthday),
    d.clothingSize,
    d.costumeSize,
    d.shoeSize,
    d.level,
    d.pointe ? 'Pointe' : 'No Pointe',
    d.notes,
  ]);
  download(
    `dancers-${todayStr()}.csv`,
    toCsv(['First Name', 'Last Name', 'Full Name', 'Age', 'Birthday', 'Clothing Size', 'Costume Size', 'Shoe Size', 'Level', 'Pointe', 'Notes'], rows),
    'text/csv;charset=utf-8',
  );
}

export function exportCastLists(db: Database, ownerType: OwnerType, ownerId: ID, name: string) {
  const dancers = byId(db.dancers);
  const rows: Cell[][] = [];
  for (const c of castsFor(db, ownerType, ownerId)) {
    for (const m of db.castMembers.filter((x) => x.castId === c.id)) {
      const d = dancers.get(m.dancerId);
      if (d) rows.push([c.name, fullName(d), m.role, d.level, d.costumeSize]);
    }
  }
  download(`${slug(name)}-cast-lists-${todayStr()}.csv`, toCsv(['Cast', 'Dancer', 'Role', 'Level', 'Costume Size'], rows), 'text/csv;charset=utf-8');
}

/** Full backup: every table plus all photos (as embedded images). */
export async function exportBackup(db: Database) {
  const images = await exportImages((db.photos ?? []).map((p) => p.id)).catch(() => ({}));
  const { files } = await exportFiles((db.media ?? []).map((m) => m.id)).catch(() => ({ files: {} }));
  const payload = { app: 'Studio Costume Manager', exportedAt: new Date().toISOString(), ...db, images, files };
  download(`studio-costume-backup-${todayStr()}.json`, JSON.stringify(payload), 'application/json');
  return Object.keys(images).length;
}

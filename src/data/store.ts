import { useSyncExternalStore } from 'react';
import type { Database } from './types';
import { buildSampleData, addSamplePropsAndVolunteers, addSampleWorkOrders } from './sample';
import { addSampleStudio } from './sampleStudio';
import { ensureOwnerAccount } from './studio';
import { addSamplePlatform } from './samplePlatform';
import { ensureWebsite } from './website';
import { ensureWorkOrders } from './workflow';
export { newId, nowIso, todayStr } from './ids';

/**
 * Persistent store.
 *
 * The database is saved to the browser's localStorage after every change, so
 * data survives refreshes and closing the browser. Changes made in one tab are
 * picked up by other open tabs automatically.
 *
 * All writes go through `commit()`, which works on a copy and only saves when
 * the mutation succeeds — a failed validation never leaves half-written data.
 */

export const STORAGE_KEY = 'studio-costume-manager/v1';
export const SCHEMA_VERSION = 5;

export class ValidationError extends Error {}

export function emptyDatabase(): Database {
  return {
    meta: { schemaVersion: SCHEMA_VERSION, nextCostumeNumber: 1, nextPropNumber: 1, sampleLoaded: false },
    settings: {
      studioName: 'Your Dance Studio',
      levels: ['Pre-Ballet', 'Level 1', 'Level 2', 'Level 3', 'Level 4', 'Level 5', 'Pre-Professional', 'Adult'],
      sizes: ['Child XS', 'Child S', 'Child M', 'Child L', 'Child XL', 'Adult XS', 'Adult S', 'Adult M', 'Adult L', 'Adult XL'],
      costumeIdPrefix: 'COS',
      propIdPrefix: 'PROP',
      danceStyles: ['Ballet', 'Pointe', 'Jazz', 'Tap', 'Contemporary', 'Lyrical', 'Hip Hop', 'Acro', 'Musical Theatre', 'Creative Movement'],
      studioPhone: '',
      studioEmail: '',
      studioAddress: '',
      payPeriod: 'biweekly',
      studioWebsite: '',
      socialLinks: '',
      businessHours: 'Mon–Thu 3:30–9:00 PM · Sat 9:00 AM–2:00 PM',
      logoFileId: null,
      ageGroups: ['Tiny (3–5)', 'Junior (6–9)', 'Intermediate (10–12)', 'Teen (13–18)', 'Adult'],
      invoiceCategories: ['Tuition', 'Registration', 'Costume', 'Recital', 'Competition', 'Company', 'Event', 'Fundraiser', 'Private lesson', 'Merchandise', 'Other'],
      paymentMethods: ['card', 'cash', 'check', 'ach', 'other'],
      defaultTaxRate: 0,
      tuitionDueDay: 1,
      lateFee: 15,
      lateFeeGraceDays: 10,
      siblingDiscountPercent: 10,
      refundPolicy: 'Tuition and costume fees are non-refundable once costumes are ordered. Contact the office with questions.',
      allowPartialPayments: true,
      registrationFee: 35,
      quickChangeMinutes: 6,
      accessoryCategories: ['Headpiece', 'Tights', 'Gloves', 'Shoes', 'Hair accessories', 'Jewelry', 'Skirt', 'Props'],
      reminders: [
        { kind: 'tuition_due', enabled: true, daysBefore: 3, channels: ['email', 'inapp'] },
        { kind: 'invoice_overdue', enabled: true, daysBefore: 0, channels: ['email', 'inapp'] },
        { kind: 'policy_missing', enabled: true, daysBefore: 7, channels: ['email', 'inapp'] },
        { kind: 'event_upcoming', enabled: true, daysBefore: 3, channels: ['email', 'inapp'] },
        { kind: 'registration_deadline', enabled: true, daysBefore: 5, channels: ['email', 'inapp'] },
        { kind: 'recital_reminder', enabled: true, daysBefore: 7, channels: ['email', 'sms', 'inapp'] },
        { kind: 'checkout_due', enabled: true, daysBefore: 2, channels: ['inapp'] },
        { kind: 'return_overdue', enabled: true, daysBefore: 0, channels: ['email', 'inapp'] },
        { kind: 'call_time', enabled: true, daysBefore: 1, channels: ['sms', 'inapp'] },
        { kind: 'rehearsal', enabled: true, daysBefore: 2, channels: ['email', 'inapp'] },
        { kind: 'missing_costume', enabled: true, daysBefore: 14, channels: ['inapp'] },
        { kind: 'repair_needed', enabled: true, daysBefore: 0, channels: ['inapp'] },
      ],
      site: { font: 'Cormorant Garamond', primary: '#a8676d', accent: '#c98f8f', background: '#fbf6f1', text: '#2f2a2c', tagline: 'Where every dancer shines' },
      nextInvoiceNumber: 1,
      skills: ['Sewing', 'Alterations', 'Hair & makeup', 'Backstage / stage crew', 'Quick changes / dressing', 'Set building', 'Ushering', 'Ticketing', 'Photography', 'Chaperone'],
    },
    dancers: [],
    categories: [],
    costumes: [],
    accessories: [],
    costumeNotes: [],
    storageLocations: [],
    shows: [],
    performances: [],
    casts: [],
    castMembers: [],
    assignments: [],
    volunteers: [],
    workOrders: [],
    photos: [],
    accounts: [],
    families: [],
    guardians: [],
    emergencyContacts: [],
    staff: [],
    schoolYears: [],
    classrooms: [],
    classes: [],
    enrollments: [],
    studioEvents: [],
    sessionChanges: [],
    attendance: [],
    timeEntries: [],
    notices: [],
    announcements: [],
    activity: [],
    invoices: [],
    payments: [],
    refunds: [],
    credits: [],
    recitals: [],
    recitalNumbers: [],
    lineup: [],
    performanceExtras: [],
    checkIns: [],
    quickChanges: [],
    backstageRoles: [],
    checkouts: [],
    conflictOverrides: [],
    teams: [],
    signupEvents: [],
    eventRegistrations: [],
    registrations: [],
    policies: [],
    policySignatures: [],
    fundraisers: [],
    fundraiserTransactions: [],
    ticketEvents: [],
    ticketOrders: [],
    messages: [],
    messageTemplates: [],
    notifications: [],
    media: [],
    classVideos: [],
    classNotes: [],
    scheduleRequests: [],
    sitePages: [],
  };
}

/** Fill in any tables/settings missing from older or hand-edited backups. */
export function normalizeDatabase(raw: unknown): Database {
  if (!raw || typeof raw !== 'object') throw new ValidationError('This file is not a Studio Costume Manager backup.');
  const input = raw as Partial<Database>;
  const base = emptyDatabase();
  const tables = Object.keys(base).filter((k) => k !== 'meta' && k !== 'settings') as (keyof Database)[];
  const hasAnyTable = tables.some((t) => Array.isArray((input as Record<string, unknown>)[t]));
  if (!hasAnyTable) throw new ValidationError('This file is not a Studio Costume Manager backup.');
  const db: Database = {
    ...base,
    meta: { ...base.meta, ...(input.meta ?? {}) },
    settings: { ...base.settings, ...(input.settings ?? {}) },
  };
  for (const t of tables) {
    const value = (input as Record<string, unknown>)[t];
    (db as unknown as Record<string, unknown>)[t] = Array.isArray(value) ? value : [];
  }
  // Keep inventory numbers unique even if the counters in the file are stale.
  const maxNumber = (kind: 'costume' | 'prop') =>
    db.costumes.reduce((max, c) => {
      if ((c.kind ?? 'costume') !== kind) return max;
      const m = /(\d+)\s*$/.exec(c.inventoryNumber ?? '');
      return m ? Math.max(max, Number(m[1])) : max;
    }, 0);
  db.meta.nextCostumeNumber = Math.max(db.meta.nextCostumeNumber || 1, maxNumber('costume') + 1);
  db.meta.nextPropNumber = Math.max(db.meta.nextPropNumber || 1, maxNumber('prop') + 1);
  // Version 1 → 2 added props and volunteers: show their samples next to the existing samples.
  const fromVersion = (input.meta?.schemaVersion as number | undefined) ?? 1;
  if (fromVersion < 2 && db.dancers.some((d) => d.isSample) && !db.volunteers.length && !db.costumes.some((c) => c.kind === 'prop')) {
    addSamplePropsAndVolunteers(db);
  }
  // Version 3 added repair / cleaning work orders: every IN PROGRESS item gets one.
  ensureWorkOrders(db);
  if (fromVersion < 3 && db.dancers.some((d) => d.isSample) && !db.workOrders.some((w) => w.status === 'done')) addSampleWorkOrders(db);
  // Version 4 added studio management. Existing studios get an owner account;
  // studios with sample data also get sample families, staff and classes.
  if (fromVersion < 4) {
    if (db.dancers.some((d) => d.isSample) && !db.classes.length) addSampleStudio(db);
    ensureOwnerAccount(db);
  }
  // Version 5 added the platform modules (finance, recitals, teams, events…).
  if (fromVersion < 5) {
    // Settings added in v5 that are lists of objects need their defaults if missing.
    if (!Array.isArray(db.settings.reminders) || !db.settings.reminders.length) db.settings.reminders = base.settings.reminders;
    db.settings.site = { ...base.settings.site, ...(db.settings.site ?? {}) };
    if (db.dancers.some((d) => d.isSample) && !db.invoices.length && !db.recitals.length) addSamplePlatform(db);
    ensureWebsite(db);
  }
  db.meta.schemaVersion = SCHEMA_VERSION;
  return db;
}

function load(): Database {
  try {
    const text = localStorage.getItem(STORAGE_KEY);
    if (text) return normalizeDatabase(JSON.parse(text));
  } catch (err) {
    console.error('Could not read saved data; starting fresh.', err);
  }
  // First run: start with the clearly-labelled sample data.
  const db = buildSampleData(emptyDatabase());
  persist(db);
  return db;
}

let saveError: string | null = null;

function persist(db: Database) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
    saveError = null;
  } catch (err) {
    saveError = 'Your changes could not be saved in this browser (storage may be full or disabled).';
    console.error(err);
    throw new ValidationError(saveError);
  }
}

let state: Database = typeof localStorage !== 'undefined' ? load() : emptyDatabase();
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

export function getDb(): Database {
  return state;
}

export function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Apply a change. The mutator receives a deep copy of the database which it
 * may modify freely; it may return a value (e.g. a new record id).
 */
export function commit<T>(mutator: (db: Database) => T): T {
  const draft = structuredClone(state);
  const result = mutator(draft);
  persist(draft);
  state = draft;
  emit();
  return result;
}

/** Replace the entire database (used by restore/reset). */
export function replaceDb(next: Database) {
  persist(next);
  state = next;
  emit();
}

export function getSaveError() {
  return saveError;
}

// Keep multiple open tabs in sync.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key !== STORAGE_KEY || !e.newValue) return;
    try {
      state = normalizeDatabase(JSON.parse(e.newValue));
      emit();
    } catch {
      /* ignore malformed updates */
    }
  });
}

/** React hook: re-renders whenever the database changes. */
export function useDb(): Database {
  return useSyncExternalStore(subscribe, getDb, getDb);
}

/** For tests only. */
export function __setDbForTests(db: Database) {
  state = db;
}

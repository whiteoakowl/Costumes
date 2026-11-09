/**
 * Studio Costume Manager — relational data model.
 *
 * Every record has a unique `id`; records reference each other only by id,
 * never by name. The whole database is a set of normalized tables
 * (see `Database`) persisted by `store.ts`.
 *
 * Relationships
 *   CostumeCategory 1─* Costume            (costume.categoryId, nullable)
 *   StorageLocation 1─* Costume            (costume.storageLocationId, nullable)
 *   Costume         1─* Accessory          (accessory.costumeId)
 *   Costume         1─* CostumeNote        (note.costumeId)  — append-only log
 *   CostumeCategory 1─* Show               (show.categoryId = show type, nullable)
 *   Show            1─* PerformancePlan    (performance.showId, nullable)
 *   Show / PerformancePlan 1─* CastList    (cast.ownerType + cast.ownerId)
 *   CastList        1─* CastMembership *─1 Dancer
 *   Show / PerformancePlan 1─* CostumeAssignment *─1 Costume
 *       assignment.castId   → whole cast wears it (when dancerId is null)
 *       assignment.dancerId → a specific dancer wears it
 *       neither             → costume is in the show/performance "costume list"
 *
 * Props share the inventory table with costumes (`costume.kind = 'prop'`), so
 * they get the same IDs, status tracking, notes log, storage locations and
 * show / cast / dancer assignments. Costume-only views filter on kind.
 *
 *   Volunteer       1─* AvailabilitySlot   (embedded list on the volunteer)
 */

export type ID = string;

/** Marks records created by the built-in sample data so they can be removed in one click. */
interface Base {
  id: ID;
  createdAt: string; // ISO timestamp
  updatedAt: string; // ISO timestamp
  isSample?: boolean;
}

export interface Dancer extends Base {
  firstName: string;
  lastName: string;
  birthday: string; // YYYY-MM-DD or ''
  clothingSize: string;
  costumeSize: string;
  shoeSize: string;
  level: string;
  pointe: boolean;
  notes: string;
}

export interface CostumeCategory extends Base {
  name: string;
  sortOrder: number;
}

export type CostumeStatus = 'ready' | 'in_progress';

/** Why a costume is IN PROGRESS. */
export type ProgressReason = 'repair' | 'alteration' | 'cleaning' | 'replacement' | 'other';

/** Inventory item type. Records without `kind` are costumes. */
export type ItemKind = 'costume' | 'prop';

export interface Costume extends Base {
  kind?: ItemKind;
  inventoryNumber: string; // auto-generated, e.g. COS-0001
  name: string;
  categoryId: ID | null;
  description: string;
  size: string;
  quantity: number;
  dateAdded: string; // YYYY-MM-DD
  storageLocationId: ID | null;
  status: CostumeStatus;
  progressReason: ProgressReason | null; // set while status is in_progress
  statusUpdatedAt: string; // ISO
  repairNotes: string;
  notes: string;
}

export interface Accessory extends Base {
  costumeId: ID;
  name: string;
  quantity: number;
}

export type NoteType =
  | 'general'
  | 'change'
  | 'repair'
  | 'alteration'
  | 'accessory'
  | 'sizing'
  | 'status'
  | 'location'
  | 'other';

export interface CostumeNote extends Base {
  costumeId: ID;
  type: NoteType;
  text: string;
}

export interface StorageLocation extends Base {
  name: string;
  description: string;
  unitNumber: string; // optional room / rack / bin number
  notes: string;
}

export type ShowStatus = 'planning' | 'active' | 'completed';

export interface Show extends Base {
  name: string;
  categoryId: ID | null; // show type
  description: string;
  startDate: string; // YYYY-MM-DD or ''
  endDate: string; // YYYY-MM-DD or ''
  venue: string;
  notes: string;
  status: ShowStatus;
}

export interface PerformancePlan extends Base {
  name: string;
  showId: ID | null;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  venue: string;
  address: string;
  callTime: string; // HH:MM
  dressRehearsal: string; // YYYY-MM-DDTHH:MM or ''
  notes: string;
  details: string;
}

export type OwnerType = 'show' | 'performance';

export interface CastList extends Base {
  ownerType: OwnerType;
  ownerId: ID;
  name: string;
  sortOrder: number;
}

export interface CastMembership extends Base {
  castId: ID;
  dancerId: ID;
  role: string;
}

export interface CostumeAssignment extends Base {
  ownerType: OwnerType;
  ownerId: ID;
  costumeId: ID;
  castId: ID | null;
  dancerId: ID | null;
  notes: string;
}

export interface AvailabilitySlot {
  id: ID;
  /** 'date' = a specific day; 'weekly' = every week on `weekday`. */
  type: 'date' | 'weekly';
  date: string; // YYYY-MM-DD when type = 'date'
  weekday: number; // 0 = Sunday … 6 = Saturday when type = 'weekly'
  start: string; // HH:MM or '' for all day
  end: string; // HH:MM or ''
  note: string;
}

export interface Volunteer extends Base {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  preferredContact: 'email' | 'phone' | 'text' | '';
  skills: string[];
  availability: AvailabilitySlot[];
  notes: string;
}

export interface Settings {
  studioName: string;
  levels: string[];
  sizes: string[];
  costumeIdPrefix: string;
  propIdPrefix: string;
  skills: string[];
}

export interface Meta {
  schemaVersion: number;
  nextCostumeNumber: number;
  nextPropNumber: number;
  sampleLoaded: boolean;
}

export interface Database {
  meta: Meta;
  settings: Settings;
  dancers: Dancer[];
  categories: CostumeCategory[];
  costumes: Costume[];
  accessories: Accessory[];
  costumeNotes: CostumeNote[];
  storageLocations: StorageLocation[];
  shows: Show[];
  performances: PerformancePlan[];
  casts: CastList[];
  castMembers: CastMembership[];
  assignments: CostumeAssignment[];
  volunteers: Volunteer[];
}

export type TableName = Exclude<keyof Database, 'meta' | 'settings'>;

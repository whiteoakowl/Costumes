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
 *   Costume/prop    1─* WorkOrder *─1 Volunteer (repairs & cleaning)
 *   Costume/prop/Dancer 1─* Photo           (photo.ownerType + ownerId; bytes in IndexedDB)
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
  /* Studio-management fields (added in schema v4; optional on older records). */
  familyId?: ID | null;
  enrollmentStatus?: EnrollmentStatus;
  enrollmentDate?: string; // YYYY-MM-DD
  /** Restricted: only roles with the "medical.view" permission can see these. */
  medicalNotes?: string;
  allergies?: string;
}

export type EnrollmentStatus = 'active' | 'prospective' | 'inactive' | 'withdrawn';

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
  | 'cleaning'
  | 'work'
  | 'other';

export interface CostumeNote extends Base {
  costumeId: ID;
  type: NoteType;
  text: string;
  /** Set when the entry belongs to a repair / cleaning work order. */
  workOrderId?: ID | null;
  /** Volunteer involved in this entry, if any. */
  volunteerId?: ID | null;
}

/**
 * A repair / cleaning / alteration job for one costume or prop.
 * While any work order on an item is open, the item is IN PROGRESS;
 * completing the last one can mark it READY. Every change is written to the
 * item's notes log (CostumeNote.workOrderId) so the history is never lost.
 */
export type WorkStatus = 'open' | 'in_progress' | 'done' | 'cancelled';

export interface WorkOrder extends Base {
  costumeId: ID;
  type: ProgressReason;
  status: WorkStatus;
  description: string;
  pieces: number; // how many of the item's quantity are involved
  volunteerId: ID | null;
  scheduledAt: string; // planned date/time 'YYYY-MM-DDTHH:MM' or ''
  dueDate: string; // needed back by 'YYYY-MM-DD' or ''
  startedAt: string; // 'YYYY-MM-DDTHH:MM' or ''
  completedAt: string; // 'YYYY-MM-DDTHH:MM' or ''
  completionNote: string;
}

/** Photo metadata. The image bytes live in the browser's IndexedDB (see lib/images.ts), keyed by photo id. */
export interface Photo extends Base {
  ownerType: 'item' | 'dancer';
  ownerId: ID;
  caption: string;
  isPrimary: boolean;
  width: number;
  height: number;
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
  danceStyles: string[];
  studioPhone: string;
  studioEmail: string;
  studioAddress: string;
  /** Payroll period length used for summaries. */
  payPeriod: 'weekly' | 'biweekly' | 'semimonthly' | 'monthly';
}

export interface Meta {
  schemaVersion: number;
  nextCostumeNumber: number;
  nextPropNumber: number;
  sampleLoaded: boolean;
}

/* =================================================== studio management (v4) */

/** Account roles. Each role opens one portal; permissions can be customised per account. */
export type Role = 'owner' | 'office_admin' | 'office_assistant' | 'teacher' | 'assistant_teacher' | 'parent' | 'dancer' | 'performance_staff';

/**
 * A person's login to the platform. In browser-only mode this is used to
 * preview each portal ("viewing as"); it is not a security boundary.
 */
export interface UserAccount extends Base {
  displayName: string;
  email: string;
  role: Role;
  active: boolean;
  staffId: ID | null; // teachers, assistants, office & performance staff
  guardianId: ID | null; // parents
  dancerId: ID | null; // dancer logins
  /** Custom permission list; null means "use the role's defaults". */
  permissions: string[] | null;
  lastActiveAt: string;
  notes: string;
}

export interface Family extends Base {
  name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  status: 'active' | 'inactive';
  notes: string;
}

export interface Guardian extends Base {
  familyId: ID;
  firstName: string;
  lastName: string;
  relationship: string; // Mother, Father, Guardian…
  email: string;
  phone: string;
  isPrimary: boolean;
  emailConsent: boolean;
  smsConsent: boolean;
}

export interface EmergencyContact extends Base {
  familyId: ID;
  name: string;
  relationship: string;
  phone: string;
  notes: string;
}

export type StaffPosition = 'teacher' | 'assistant' | 'substitute' | 'office' | 'performance' | 'other';

export interface StaffMember extends Base {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address: string;
  emergencyContact: string;
  hireDate: string;
  position: StaffPosition;
  title: string;
  styles: string[];
  qualifications: string;
  payType: 'hourly' | 'salary';
  payRate: number; // per hour, or per year for salary
  status: 'active' | 'inactive';
  notes: string;
}

export interface SchoolYear extends Base {
  name: string; // 2026–2027
  startDate: string;
  endDate: string;
  registrationStart: string;
  registrationEnd: string;
  status: 'planning' | 'current' | 'archived';
  tuitionNotes: string;
  recitalInfo: string;
  notes: string;
}

export interface Classroom extends Base {
  name: string;
  capacity: number;
  notes: string;
}

export interface DanceClass extends Base {
  schoolYearId: ID;
  name: string;
  style: string;
  level: string;
  ageMin: number | null;
  ageMax: number | null;
  dayOfWeek: number; // 0 = Sunday … 6 = Saturday
  startTime: string; // HH:MM
  endTime: string; // HH:MM
  classroomId: ID | null;
  teacherId: ID | null; // StaffMember
  assistantId: ID | null; // StaffMember
  maxEnrollment: number;
  description: string;
  notes: string;
  tuition: number; // per month
  /** Optional sub-range of the school year; blank = whole year. */
  startDate: string;
  endDate: string;
}

export interface Enrollment extends Base {
  classId: ID;
  dancerId: ID;
  status: 'enrolled' | 'waitlist' | 'dropped';
  enrolledOn: string;
  droppedOn: string;
}

export type CalendarEntryType = 'holiday' | 'closure' | 'weather' | 'rehearsal' | 'master_class' | 'workshop' | 'guest' | 'competition_rehearsal' | 'important' | 'event';

/** Non-class calendar entries: closures (which cancel classes), rehearsals, workshops, important dates… */
export interface StudioEvent extends Base {
  title: string;
  type: CalendarEntryType;
  startDate: string;
  endDate: string; // inclusive; = startDate for one day
  allDay: boolean;
  startTime: string;
  endTime: string;
  classroomId: ID | null;
  location: string;
  cancelsClasses: boolean;
  schoolYearId: ID | null;
  notes: string;
}

/** A change to one occurrence of a weekly class: cancelled, or moved / substituted. */
export interface SessionChange extends Base {
  classId: ID;
  date: string; // the regularly scheduled date being changed
  cancelled: boolean;
  newDate: string; // '' = same date
  newStartTime: string;
  newEndTime: string;
  newClassroomId: ID | null;
  substituteId: ID | null;
  reason: string;
}

export type AttendanceStatus = 'present' | 'absent' | 'late' | 'excused' | 'makeup';

export interface AttendanceRecord extends Base {
  classId: ID;
  date: string; // the class's scheduled date
  dancerId: ID;
  status: AttendanceStatus;
  note: string;
  takenBy: string; // display name
}

export type HoursKind = 'class' | 'additional' | 'substitute' | 'rehearsal' | 'private' | 'other';

export interface TimeEntry extends Base {
  staffId: ID;
  date: string;
  kind: HoursKind;
  classId: ID | null;
  scheduledHours: number;
  hours: number;
  rate: number; // hourly rate at the time
  description: string;
  status: 'pending' | 'approved' | 'rejected';
  submittedBy: string;
  reviewedBy: string;
  reviewedAt: string;
  reviewNote: string;
  /** Every change after submission, never overwritten. */
  history: { at: string; by: string; change: string }[];
}

/** In-app notices for teachers and families (schedule changes, cancellations…). */
export interface Notice extends Base {
  title: string;
  body: string;
  kind: 'schedule' | 'cancellation' | 'announcement' | 'reminder';
  staffIds: ID[];
  familyIds: ID[];
  classId: ID | null;
  author: string;
  readBy: ID[]; // account ids
}

/** Announcements written by staff, shown in portals. */
export interface Announcement extends Base {
  title: string;
  body: string;
  audience: 'everyone' | 'staff' | 'families' | 'class';
  classId: ID | null;
  author: string;
  pinned: boolean;
}

/** Studio-wide activity feed / audit trail. */
export interface ActivityEntry extends Base {
  actor: string;
  action: string;
  detail: string;
  link: string;
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
  workOrders: WorkOrder[];
  photos: Photo[];
  accounts: UserAccount[];
  families: Family[];
  guardians: Guardian[];
  emergencyContacts: EmergencyContact[];
  staff: StaffMember[];
  schoolYears: SchoolYear[];
  classrooms: Classroom[];
  classes: DanceClass[];
  enrollments: Enrollment[];
  studioEvents: StudioEvent[];
  sessionChanges: SessionChange[];
  attendance: AttendanceRecord[];
  timeEntries: TimeEntry[];
  notices: Notice[];
  announcements: Announcement[];
  activity: ActivityEntry[];
}

export type TableName = Exclude<keyof Database, 'meta' | 'settings'>;

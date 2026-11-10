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
  /* v5 */
  studioWebsite: string;
  socialLinks: string;
  businessHours: string;
  logoFileId: string | null;
  ageGroups: string[];
  invoiceCategories: string[];
  paymentMethods: PaymentMethod[];
  defaultTaxRate: number;
  tuitionDueDay: number;
  lateFee: number;
  lateFeeGraceDays: number;
  siblingDiscountPercent: number;
  refundPolicy: string;
  allowPartialPayments: boolean;
  registrationFee: number;
  quickChangeMinutes: number;
  accessoryCategories: string[];
  reminders: ReminderRule[];
  site: { font: string; primary: string; accent: string; background: string; text: string; tagline: string };
  nextInvoiceNumber: number;
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
  /** Notification channels this person wants (v5). */
  notifyEmail?: boolean;
  notifySms?: boolean;
  notifyInApp?: boolean;
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
  invoices: Invoice[];
  payments: Payment[];
  refunds: Refund[];
  credits: CreditEntry[];
  recitals: Recital[];
  recitalNumbers: RecitalNumber[];
  lineup: LineupItem[];
  performanceExtras: PerformanceExtras[];
  checkIns: CheckIn[];
  quickChanges: QuickChangeAssignment[];
  backstageRoles: BackstageRole[];
  checkouts: CostumeCheckout[];
  conflictOverrides: ConflictOverride[];
  teams: Team[];
  signupEvents: SignupEvent[];
  eventRegistrations: EventRegistration[];
  registrations: RegistrationRequest[];
  policies: Policy[];
  policySignatures: PolicySignature[];
  fundraisers: Fundraiser[];
  fundraiserTransactions: FundraiserTransaction[];
  ticketEvents: TicketedEvent[];
  ticketOrders: TicketOrder[];
  messages: Message[];
  messageTemplates: MessageTemplate[];
  notifications: AppNotification[];
  media: MediaFile[];
  classVideos: ClassVideo[];
  classNotes: ClassNote[];
  scheduleRequests: ScheduleRequest[];
  sitePages: SitePage[];
}

export type TableName = Exclude<keyof Database, 'meta' | 'settings'>;

/* ============================================ platform modules (schema v5) */

export interface AuditEntry {
  at: string;
  by: string;
  change: string;
}

/* ---- finance ---- */

export interface InvoiceLine {
  id: ID;
  description: string;
  category: string; // settings.invoiceCategories
  quantity: number;
  unitPrice: number;
  dancerId: ID | null;
}

export type InvoiceSource = 'tuition' | 'registration' | 'costume' | 'recital' | 'competition' | 'company' | 'event' | 'fundraiser' | 'private' | 'ticket' | 'custom';

export interface Invoice extends Base {
  number: string; // INV-0001
  familyId: ID;
  title: string;
  lines: InvoiceLine[];
  discount: number; // amount off the subtotal
  taxRate: number; // percent
  issueDate: string;
  dueDate: string;
  /** draft = not visible to the family; sent = visible & payable; void = cancelled. Paid / overdue are calculated. */
  state: 'draft' | 'sent' | 'void';
  notes: string;
  source: InvoiceSource;
  sourceId: ID | null; // recital, event, fundraiser, team…
  schoolYearId: ID | null;
  remindersSent: number;
  history: AuditEntry[];
}

export type PaymentMethod = 'card' | 'cash' | 'check' | 'ach' | 'other';

export interface Payment extends Base {
  familyId: ID;
  invoiceId: ID | null; // null = general payment (e.g. tickets)
  amount: number;
  method: PaymentMethod;
  /** test = simulated online payment (no card is charged); offline = recorded by staff. */
  processor: 'test' | 'offline';
  reference: string; // check number, transaction id…
  date: string;
  recordedBy: string;
  note: string;
}

export interface Refund extends Base {
  paymentId: ID;
  familyId: ID;
  amount: number;
  date: string;
  /** processor = refunded through the (test) payment processor; offline = staff recorded an authorized offline refund. */
  method: 'processor' | 'offline';
  status: 'pending' | 'completed';
  reason: string;
  recordedBy: string;
}

export interface CreditEntry extends Base {
  familyId: ID;
  /** issued (+) adds to the family's credit; applied/removed (−) use it; unapplied (+) takes it back off an invoice. */
  kind: 'issued' | 'applied' | 'unapplied' | 'removed';
  amount: number; // always positive
  invoiceId: ID | null;
  reason: string;
  recordedBy: string;
}

/* ---- recitals & performances ---- */

export interface Recital extends Base {
  name: string;
  theme: string;
  schoolYearId: ID | null;
  showId: ID | null; // linked Show (casts & costume lists)
  startDate: string;
  endDate: string;
  venue: string;
  address: string;
  performanceTimes: string;
  rehearsalSchedule: string;
  pictureDay: string;
  ticketInfo: string;
  notes: string;
  status: 'planning' | 'active' | 'completed';
}

export interface RecitalNumber extends Base {
  recitalId: ID;
  order: number;
  title: string;
  classId: ID | null;
  teamId: ID | null;
  teacherId: ID | null;
  style: string;
  song: string;
  artist: string;
  songFileId: ID | null; // media library
  choreographyNotes: string;
  costumeId: ID | null; // existing inventory — never duplicated
  accessoryNotes: string;
  shoesTights: string;
  hairMakeup: string;
  entranceExit: string;
  durationMin: number;
}

export interface LineupItem extends Base {
  performanceId: ID;
  order: number;
  kind: 'number' | 'intermission' | 'break';
  numberId: ID | null; // RecitalNumber it came from
  title: string;
  classId: ID | null;
  teacherId: ID | null;
  dancerIds: ID[];
  song: string;
  artist: string;
  costumeId: ID | null;
  durationMin: number;
  entranceExit: string;
  backstageNotes: string;
}

export interface PerformanceExtras extends Base {
  performanceId: ID;
  warmUpTime: string;
  stageRehearsal: string; // YYYY-MM-DDTHH:MM
  stageManagerId: ID | null;
  specialInstructions: string;
  teacherIds: ID[];
}

export type CheckInStatus = 'not_arrived' | 'checked_in' | 'backstage' | 'ready' | 'on_stage' | 'finished' | 'checked_out';

export interface CheckIn extends Base {
  performanceId: ID;
  dancerId: ID;
  status: CheckInStatus;
  dressingRoom: string;
  notes: string;
  history: AuditEntry[];
}

export interface QuickChangeAssignment extends Base {
  performanceId: ID;
  dancerId: ID;
  toItemId: ID; // the number they are changing into
  helper: string;
  location: string;
  notes: string;
}

export interface BackstageRole extends Base {
  performanceId: ID;
  role: string; // e.g. Stage left dresser, Rack monitor
  person: string;
  volunteerId: ID | null;
  staffId: ID | null;
  area: string;
  notes: string;
}

export type CheckoutStatus = 'reserved' | 'checked_out' | 'returned' | 'needs_inspection' | 'needs_repair';

export interface CostumeCheckout extends Base {
  costumeId: ID;
  dancerId: ID | null;
  familyId: ID | null;
  ownerType: OwnerType | null;
  ownerId: ID | null;
  quantity: number;
  status: CheckoutStatus;
  checkedOutAt: string;
  expectedReturn: string;
  returnedAt: string;
  conditionOut: string;
  conditionIn: string;
  accessoriesIssued: string[];
  accessoriesReturned: string[];
  missingItems: string;
  notes: string;
  history: AuditEntry[];
}

export interface ConflictOverride extends Base {
  key: string;
  reason: string;
  by: string;
}

/* ---- teams, events, registration, policies, fundraisers, tickets ---- */

export interface Team extends Base {
  name: string;
  description: string;
  schoolYearId: ID | null;
  dancerIds: ID[];
  teacherIds: ID[];
  classIds: ID[];
  requirements: string;
  rehearsalSchedule: string;
  competitionSchedule: string;
  fee: number;
  feeNotes: string;
  notes: string;
  archived: boolean;
}

export interface EventQuestion {
  id: ID;
  label: string;
  type: 'text' | 'yesno' | 'choice';
  options: string[];
  required: boolean;
}

export type SignupEventType = 'recital' | 'competition' | 'convention' | 'workshop' | 'master_class' | 'fundraiser' | 'party' | 'picture_day' | 'rehearsal' | 'audition' | 'camp' | 'community' | 'other';

export interface SignupEvent extends Base {
  name: string;
  type: SignupEventType;
  description: string;
  date: string;
  endDate: string;
  startTime: string;
  endTime: string;
  location: string;
  address: string;
  registrationDeadline: string;
  eligibility: 'all' | 'classes' | 'teams' | 'dancers';
  classIds: ID[];
  teamIds: ID[];
  dancerIds: ID[];
  cost: number;
  capacity: number; // 0 = unlimited
  signupsOpen: boolean;
  questions: EventQuestion[];
  notes: string;
}

export interface EventRegistration extends Base {
  eventId: ID;
  dancerId: ID;
  familyId: ID | null;
  status: 'registered' | 'waitlist' | 'declined' | 'cancelled';
  answers: Record<string, string>;
  invoiceId: ID | null;
  by: string;
}

export interface RegistrationRequest extends Base {
  schoolYearId: ID | null;
  status: 'pending' | 'approved' | 'denied';
  kind: 'new' | 'change';
  familyId: ID | null;
  parent: { firstName: string; lastName: string; email: string; phone: string; relationship: string };
  address: string;
  dancer: { firstName: string; lastName: string; birthday: string; clothingSize: string; shoeSize: string; level: string; allergies: string; medicalNotes: string };
  existingDancerId: ID | null;
  classIds: ID[];
  dropClassIds: ID[];
  emergency: { name: string; relationship: string; phone: string };
  agreedPolicyIds: ID[];
  fee: number;
  invoiceId: ID | null;
  notes: string;
  reviewNote: string;
  reviewedBy: string;
  reviewedAt: string;
  submittedBy: string;
  result: string;
}

export interface PolicyVersion {
  version: number;
  body: string;
  fileId: ID | null;
  createdAt: string;
  createdBy: string;
}

export interface Policy extends Base {
  title: string;
  category: string;
  versions: PolicyVersion[];
  audience: 'all' | 'classes' | 'teams' | 'families';
  classIds: ID[];
  teamIds: ID[];
  familyIds: ID[];
  requiresSignature: boolean;
  deadline: string;
  annualRenewal: boolean;
  active: boolean;
}

export interface PolicySignature extends Base {
  policyId: ID;
  version: number;
  familyId: ID;
  guardianId: ID | null;
  signerName: string;
  signedAt: string;
  method: 'typed' | 'acknowledged';
  schoolYearId: ID | null;
  ip: string; // not collected in browser-only mode
}

export interface FundraiserItem {
  id: ID;
  name: string;
  price: number;
}

export interface Fundraiser extends Base {
  name: string;
  description: string;
  type: 'donation' | 'product_sale' | 'event' | 'other';
  purpose: string;
  startDate: string;
  endDate: string;
  goal: number;
  teamId: ID | null;
  dancerIds: ID[];
  requirements: string;
  paymentOptions: string;
  items: FundraiserItem[];
  notes: string;
  status: 'open' | 'closed';
}

export interface FundraiserTransaction extends Base {
  fundraiserId: ID;
  familyId: ID | null;
  dancerId: ID | null;
  donorName: string;
  kind: 'donation' | 'order';
  items: { itemId: ID; qty: number }[];
  amount: number;
  invoiceId: ID | null;
  notes: string;
  fulfilled: boolean;
}

export interface TicketType {
  id: ID;
  name: string;
  category: 'general' | 'reserved' | 'vip' | 'student' | 'comp' | 'staff';
  price: number;
  quantity: number;
}

export interface TicketedEvent extends Base {
  name: string;
  performanceId: ID | null;
  recitalId: ID | null;
  date: string;
  time: string;
  venue: string;
  salesOpen: string;
  salesClose: string;
  types: TicketType[];
  seatingRows: number; // 0 = no seating chart
  seatsPerRow: number;
  notes: string;
  status: 'draft' | 'on_sale' | 'closed';
}

export interface TicketOrder extends Base {
  ticketEventId: ID;
  familyId: ID | null;
  buyerName: string;
  buyerEmail: string;
  lines: { typeId: ID; qty: number; unitPrice: number }[];
  seats: string[];
  total: number;
  status: 'paid' | 'refunded' | 'cancelled';
  paymentId: ID | null;
  source: 'parent' | 'box_office';
}

/* ---- communications & notifications ---- */

export type Channel = 'email' | 'sms' | 'newsletter';

export interface RecipientSpec {
  kind: 'all_families' | 'families' | 'guardians' | 'dancers' | 'classes' | 'teams' | 'teachers' | 'all_staff' | 'event' | 'recital' | 'performance';
  ids: ID[];
}

export interface NewsletterBlock {
  id: ID;
  type: 'heading' | 'text' | 'image' | 'button' | 'announcement' | 'events' | 'dates' | 'divider';
  text: string;
  url: string;
  fileId: ID | null;
}

export interface Delivery {
  name: string;
  contact: string;
  familyId: ID | null;
  staffId: ID | null;
  /** in_app = delivered to the person's portal inbox; skipped = no consent / no contact; external delivery needs a provider. */
  status: 'in_app' | 'skipped_no_consent' | 'skipped_no_contact';
  external: 'not_connected';
}

export interface Message extends Base {
  channel: Channel;
  subject: string;
  body: string;
  blocks: NewsletterBlock[];
  recipients: RecipientSpec[];
  deliveries: Delivery[];
  attachmentIds: ID[];
  status: 'draft' | 'scheduled' | 'sent';
  scheduledFor: string; // YYYY-MM-DDTHH:MM (Eastern)
  sentAt: string;
  sender: string;
  related: { type: string; id: ID } | null;
  readBy: ID[]; // account ids (in-app)
}

export interface MessageTemplate extends Base {
  name: string;
  channel: Channel;
  subject: string;
  body: string;
  blocks: NewsletterBlock[];
}

export type ReminderKind =
  | 'tuition_due'
  | 'invoice_overdue'
  | 'policy_missing'
  | 'event_upcoming'
  | 'registration_deadline'
  | 'recital_reminder'
  | 'checkout_due'
  | 'return_overdue'
  | 'call_time'
  | 'rehearsal'
  | 'missing_costume'
  | 'repair_needed';

export interface ReminderRule {
  kind: ReminderKind;
  enabled: boolean;
  daysBefore: number;
  channels: ('email' | 'sms' | 'inapp')[];
}

export interface AppNotification extends Base {
  key: string; // dedupe key — the same reminder is never created twice
  kind: ReminderKind | 'manual';
  title: string;
  body: string;
  familyIds: ID[];
  staffIds: ID[];
  admin: boolean;
  link: string;
  channels: ('email' | 'sms' | 'inapp')[];
  status: 'pending' | 'sent' | 'failed';
  sendOn: string; // YYYY-MM-DD
  sentAt: string;
  failure: string;
  readBy: ID[];
}

/* ---- media, videos, notes, requests ---- */

export type MediaCategory =
  | 'costume_photo'
  | 'class_video'
  | 'recital_photo'
  | 'recital_music'
  | 'choreography_video'
  | 'policy'
  | 'signed_agreement'
  | 'teacher_document'
  | 'performance_schedule'
  | 'event_flyer'
  | 'newsletter'
  | 'website_image'
  | 'fundraiser'
  | 'other';

export interface MediaLink {
  type: 'costume' | 'class' | 'recitalNumber' | 'recital' | 'family' | 'performance' | 'event' | 'fundraiser' | 'policy' | 'website' | 'staff';
  id: ID;
}

export interface MediaFile extends Base {
  name: string;
  mime: string;
  size: number;
  category: MediaCategory;
  description: string;
  links: MediaLink[];
  visibility: 'management' | 'staff' | 'parents' | 'public';
  uploadedBy: string;
}

export interface ClassVideo extends Base {
  classId: ID;
  schoolYearId: ID | null;
  teacherId: ID | null;
  title: string;
  description: string;
  lessonDate: string;
  fileId: ID | null;
  url: string; // or an external link (YouTube unlisted, Vimeo…)
  kind: 'combination' | 'choreography' | 'practice' | 'rehearsal' | 'instructions';
  visibility: 'teacher' | 'parents' | 'dancers' | 'management';
  notes: string;
}

export interface ClassNote extends Base {
  classId: ID;
  date: string;
  body: string;
  author: string;
  shareWithFamilies: boolean;
}

export interface ScheduleRequest extends Base {
  staffId: ID;
  classId: ID | null;
  date: string;
  kind: 'cancel' | 'substitute' | 'move' | 'time_off' | 'other';
  details: string;
  status: 'pending' | 'approved' | 'declined';
  response: string;
  respondedBy: string;
}

/* ---- website ---- */

export type SiteBlockType = 'hero' | 'text' | 'image' | 'gallery' | 'video' | 'button' | 'columns' | 'classes' | 'faculty' | 'events' | 'schedule' | 'contact' | 'announcements' | 'recitals' | 'teams' | 'portal_login' | 'spacer' | 'cta' | 'registration';

export interface SiteBlock {
  id: ID;
  type: SiteBlockType;
  heading: string;
  text: string;
  buttonLabel: string;
  buttonLink: string;
  imageId: ID | null;
  imageIds: ID[];
  videoUrl: string;
  columns: { heading: string; text: string }[];
  bg: string;
  color: string;
  align: 'left' | 'center' | 'right';
  padding: 'sm' | 'md' | 'lg';
  bgImageId: ID | null;
}

export interface SitePage extends Base {
  title: string;
  slug: string;
  inNav: boolean;
  order: number;
  published: boolean;
  draft: SiteBlock[];
  live: SiteBlock[];
  publishedAt: string;
  description: string;
}

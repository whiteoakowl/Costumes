import {
  CalendarDays,
  CalendarHeart,
  ClipboardCheck,
  Clock,
  GraduationCap,
  HandHeart,
  Home,
  KeyRound,
  LayoutDashboard,
  ListOrdered,
  Music,
  PackageOpen,
  Printer,
  BarChart3,
  Globe,
  Video,
  CalendarX2,
  FolderOpen,
  Inbox,
  Mail,
  BellRing,
  ClipboardSignature,
  FileSignature,
  HandCoins,
  PartyPopper,
  Ticket,
  Trophy,
  Receipt,
  School,
  Shirt,
  Theater,
  UserRound,
  Users,
  UsersRound,
  Wand2,
  Warehouse,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import type { Portal } from '../data/studio';
import type { Viewer } from './session';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
  section?: string;
  show: (v: Viewer) => boolean;
}

const admin = (v: Viewer) => v.isStaffAdmin;
const teacher = (v: Viewer) => v.portal === 'teacher';
const parent = (v: Viewer) => v.portal === 'parent';
const perf = (v: Viewer) => v.portal === 'performance';

/** One list for every portal; each item decides who sees it (role + permission). */
export const NAV_ITEMS: NavItem[] = [
  // dashboards
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true, show: admin },
  { to: '/teacher', label: 'My Dashboard', icon: LayoutDashboard, end: true, show: teacher },
  { to: '/family', label: 'Family Dashboard', icon: Home, end: true, show: parent },
  { to: '/performance', label: 'Performance Dashboard', icon: LayoutDashboard, end: true, show: perf },

  { to: '/inbox', label: 'Inbox', icon: Inbox, show: () => true },

  // teacher portal
  { to: '/teacher/schedule', label: 'My Schedule', icon: CalendarDays, section: 'Teaching', show: teacher },
  { to: '/teacher/classes', label: 'My Classes & Rosters', icon: School, section: 'Teaching', show: teacher },
  { to: '/attendance', label: 'Attendance', icon: ClipboardCheck, section: 'Teaching', show: (v) => teacher(v) && v.can('attendance.take') },
  { to: '/teacher/hours', label: 'My Hours', icon: Clock, section: 'Teaching', show: teacher },
  { to: '/teacher/videos', label: 'Class Videos & Notes', icon: Video, section: 'Teaching', show: teacher },
  { to: '/teacher/requests', label: 'Schedule Requests', icon: CalendarX2, section: 'Teaching', show: teacher },

  // parent portal
  { to: '/family/dancers', label: 'My Dancers', icon: UserRound, section: 'My Family', show: parent },
  { to: '/family/schedule', label: 'Class Schedule', icon: CalendarDays, section: 'My Family', show: parent },
  { to: '/family/attendance', label: 'Attendance', icon: ClipboardCheck, section: 'My Family', show: parent },
  { to: '/family/costumes', label: 'Recitals & Costumes', icon: Shirt, section: 'My Family', show: parent },
  { to: '/family/account', label: 'Family Account', icon: Users, section: 'My Family', show: parent },
  { to: '/family/billing', label: 'Invoices & Payments', icon: Receipt, section: 'My Family', show: parent },
  { to: '/family/videos', label: 'Class Videos & Notes', icon: Video, section: 'My Family', show: parent },
  { to: '/family/events', label: 'Events & Sign-ups', icon: PartyPopper, section: 'Activities', show: parent },
  { to: '/family/register', label: 'Registration', icon: ClipboardSignature, section: 'Activities', show: parent },
  { to: '/family/policies', label: 'Policies & Forms', icon: FileSignature, section: 'Activities', show: parent },
  { to: '/family/fundraisers', label: 'Fundraisers', icon: HandCoins, section: 'Activities', show: parent },
  { to: '/family/tickets', label: 'Tickets', icon: Ticket, section: 'Activities', show: parent },

  // people
  { to: '/dancers', label: 'Dancers', icon: Users, section: 'People', show: (v) => admin(v) && v.can('dancers.view') },
  { to: '/families', label: 'Families', icon: UsersRound, section: 'People', show: (v) => admin(v) && v.can('families.view') },
  { to: '/staff', label: 'Teachers & Staff', icon: GraduationCap, section: 'People', show: (v) => admin(v) && v.can('staff.view') },
  { to: '/volunteers', label: 'Volunteers', icon: HandHeart, section: 'People', show: (v) => (admin(v) || perf(v)) && v.can('volunteers.view') },

  // classes
  { to: '/classes', label: 'Classes', icon: School, section: 'Classes', show: (v) => admin(v) && v.can('classes.view') },
  { to: '/school-years', label: 'School Years', icon: GraduationCap, section: 'Classes', show: (v) => admin(v) && v.can('classes.view') },
  { to: '/calendar', label: 'Calendar', icon: CalendarDays, section: 'Classes', show: (v) => admin(v) && v.can('classes.view') },
  { to: '/attendance', label: 'Attendance', icon: ClipboardCheck, section: 'Classes', show: (v) => admin(v) && (v.can('attendance.viewAll') || v.can('attendance.take')) },
  { to: '/videos', label: 'Class Videos & Notes', icon: Video, section: 'Classes', show: (v) => admin(v) && v.can('classes.view') },
  { to: '/requests', label: 'Schedule Requests', icon: CalendarX2, section: 'Classes', show: (v) => admin(v) && v.can('calendar.edit') },
  { to: '/hours', label: 'Teacher Hours & Payroll', icon: Clock, section: 'Classes', show: (v) => admin(v) && (v.can('hours.approve') || v.can('payroll.view')) },

  // engagement
  { to: '/registration', label: 'Registration', icon: ClipboardSignature, section: 'Programs', show: (v) => admin(v) && v.can('events.manage') },
  { to: '/teams', label: 'Teams & Companies', icon: Trophy, section: 'Programs', show: (v) => (admin(v) || perf(v) || teacher(v)) && (v.can('events.manage') || v.can('shows.view')) },
  { to: '/events', label: 'Events & Sign-ups', icon: PartyPopper, section: 'Programs', show: (v) => admin(v) && v.can('events.manage') },
  { to: '/policies', label: 'Policies & Signatures', icon: FileSignature, section: 'Programs', show: (v) => admin(v) && v.can('events.manage') },
  { to: '/fundraisers', label: 'Fundraisers', icon: HandCoins, section: 'Programs', show: (v) => admin(v) && v.can('events.manage') },
  { to: '/tickets', label: 'Ticketing', icon: Ticket, section: 'Programs', show: (v) => (admin(v) || perf(v)) && (v.can('events.manage') || v.can('productions.manage')) },

  // communications
  { to: '/communications', label: 'Communications', icon: Mail, section: 'Communications', show: (v) => (admin(v) || teacher(v)) && v.can('comms.send') },
  { to: '/media', label: 'Media Library', icon: FolderOpen, section: 'Communications', show: (v) => (admin(v) || perf(v)) && v.can('media.manage') },
  { to: '/website', label: 'Website', icon: Globe, section: 'Communications', show: (v) => admin(v) && v.can('website.edit') },
  { to: '/notifications', label: 'Notifications & Reminders', icon: BellRing, section: 'Communications', show: (v) => admin(v) && v.can('comms.send') },

  // money
  { to: '/invoices', label: 'Invoices & Payments', icon: Receipt, section: 'Billing', show: (v) => admin(v) && v.can('billing.view') },

  // costumes
  { to: '/costumes', label: 'Costumes', icon: Shirt, section: 'Costumes', show: (v) => (admin(v) || perf(v) || teacher(v)) && v.can('costumes.view') },
  { to: '/props', label: 'Props', icon: Wand2, section: 'Costumes', show: (v) => (admin(v) || perf(v)) && v.can('costumes.view') },
  { to: '/checkout', label: 'Costume Checkout', icon: PackageOpen, section: 'Costumes', show: (v) => (admin(v) || perf(v)) && v.can('costumes.view') },
  { to: '/repairs', label: 'Repair & Cleaning', icon: Wrench, section: 'Costumes', show: (v) => (admin(v) || perf(v)) && v.can('costumes.edit') },
  { to: '/storage', label: 'Storage Locations', icon: Warehouse, section: 'Costumes', show: (v) => (admin(v) || perf(v)) && v.can('costumes.view') },

  // productions
  { to: '/shows', label: 'Shows', icon: Theater, section: 'Productions', show: (v) => (admin(v) || perf(v) || teacher(v)) && v.can('shows.view') },
  { to: '/recitals', label: 'Recitals', icon: Music, section: 'Productions', show: (v) => (admin(v) || perf(v) || teacher(v)) && v.can('shows.view') },
  { to: '/show-day', label: 'Show Day & Backstage', icon: ListOrdered, section: 'Productions', show: (v) => (admin(v) || perf(v) || teacher(v)) && v.can('shows.view') },
  { to: '/performances', label: 'Performance Planning', icon: CalendarHeart, section: 'Productions', show: (v) => (admin(v) || perf(v) || teacher(v)) && v.can('shows.view') },

  // admin
  { to: '/analytics', label: 'Analytics', icon: BarChart3, section: 'Admin', show: (v) => admin(v) && v.can('reports.view') },
  { to: '/reports', label: 'Reports & Printing', icon: Printer, section: 'Admin', show: (v) => (admin(v) || perf(v)) && v.can('reports.view') },
  { to: '/accounts', label: 'Accounts & Access', icon: KeyRound, section: 'Admin', show: (v) => v.can('accounts.manage') },
];

export const portalHome: Record<Portal, string> = {
  management: '/',
  office: '/',
  teacher: '/teacher',
  parent: '/family',
  performance: '/performance',
};

/** Is a path available to this viewer? (Used to guard routes typed into the address bar.) */
export function canVisit(v: Viewer, path: string): boolean {
  if (path === '/settings') return v.can('settings.edit');
  // "/" is everyone's way in: it sends each portal to its own home page.
  if (path === '/') return true;
  const item = [...NAV_ITEMS]
    .sort((a, b) => b.to.length - a.to.length)
    .find((i) => (i.end ? path === i.to : path === i.to || path.startsWith(i.to === '/' ? '/__never' : `${i.to}/`) || path === i.to));
  if (item) return NAV_ITEMS.filter((i) => i.to === item.to).some((i) => i.show(v));
  return true;
}

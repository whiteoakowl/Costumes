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
  Printer,
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

  // teacher portal
  { to: '/teacher/schedule', label: 'My Schedule', icon: CalendarDays, section: 'Teaching', show: teacher },
  { to: '/teacher/classes', label: 'My Classes & Rosters', icon: School, section: 'Teaching', show: teacher },
  { to: '/attendance', label: 'Attendance', icon: ClipboardCheck, section: 'Teaching', show: (v) => teacher(v) && v.can('attendance.take') },
  { to: '/teacher/hours', label: 'My Hours', icon: Clock, section: 'Teaching', show: teacher },

  // parent portal
  { to: '/family/dancers', label: 'My Dancers', icon: UserRound, section: 'My Family', show: parent },
  { to: '/family/schedule', label: 'Class Schedule', icon: CalendarDays, section: 'My Family', show: parent },
  { to: '/family/attendance', label: 'Attendance', icon: ClipboardCheck, section: 'My Family', show: parent },
  { to: '/family/costumes', label: 'Recitals & Costumes', icon: Shirt, section: 'My Family', show: parent },
  { to: '/family/account', label: 'Family Account', icon: Users, section: 'My Family', show: parent },

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
  { to: '/hours', label: 'Teacher Hours & Payroll', icon: Clock, section: 'Classes', show: (v) => admin(v) && (v.can('hours.approve') || v.can('payroll.view')) },

  // costumes
  { to: '/costumes', label: 'Costumes', icon: Shirt, section: 'Costumes', show: (v) => (admin(v) || perf(v) || teacher(v)) && v.can('costumes.view') },
  { to: '/props', label: 'Props', icon: Wand2, section: 'Costumes', show: (v) => (admin(v) || perf(v)) && v.can('costumes.view') },
  { to: '/repairs', label: 'Repair & Cleaning', icon: Wrench, section: 'Costumes', show: (v) => (admin(v) || perf(v)) && v.can('costumes.edit') },
  { to: '/storage', label: 'Storage Locations', icon: Warehouse, section: 'Costumes', show: (v) => (admin(v) || perf(v)) && v.can('costumes.view') },

  // productions
  { to: '/shows', label: 'Shows', icon: Theater, section: 'Productions', show: (v) => (admin(v) || perf(v) || teacher(v)) && v.can('shows.view') },
  { to: '/performances', label: 'Performance Planning', icon: CalendarHeart, section: 'Productions', show: (v) => (admin(v) || perf(v) || teacher(v)) && v.can('shows.view') },

  // admin
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
  const item = [...NAV_ITEMS]
    .sort((a, b) => b.to.length - a.to.length)
    .find((i) => (i.end ? path === i.to : path === i.to || path.startsWith(i.to === '/' ? '/__never' : `${i.to}/`) || path === i.to));
  if (item) return NAV_ITEMS.filter((i) => i.to === item.to).some((i) => i.show(v));
  return true;
}

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { useViewer } from './lib/session';
import { portalHome } from './lib/nav';
import '@fontsource/cormorant-garamond/500.css';
import '@fontsource/cormorant-garamond/600.css';
import '@fontsource/dm-sans/400.css';
import '@fontsource/dm-sans/500.css';
import '@fontsource/dm-sans/600.css';
import './styles.css';
import { Layout } from './components/Layout';
import { FeedbackProvider } from './components/feedback';
import { EditorProvider } from './components/editors';
import { Dashboard } from './pages/Dashboard';
import { DancerProfilePage, DancersPage } from './pages/Dancers';
import { CostumeDetailPage, CostumesPage, PropsPage } from './pages/Costumes';
import { VolunteerDetailPage, VolunteersPage } from './pages/Volunteers';
import { ShowDetailPage, ShowsPage } from './pages/Shows';
import { PerformanceDetailPage, PerformancesPage } from './pages/Performances';
import { StorageDetailPage, StoragePage } from './pages/Storage';
import { SettingsPage } from './pages/Settings';
import { EmptyState } from './components/ui';
import { RepairsPage } from './pages/Repairs';
import { AccountsPage } from './pages/Accounts';
import { PortalsPage } from './pages/Portals';
import { FamiliesPage, FamilyDetailPage } from './pages/Families';
import { StaffDetailPage, StaffPage } from './pages/Staff';
import { SchoolYearsPage } from './pages/SchoolYears';
import { ClassDetailPage, ClassesPage } from './pages/Classes';
import { CalendarPage } from './pages/Calendar';
import { AttendancePage } from './pages/Attendance';
import { HoursPage, MyHoursPage } from './pages/Hours';
import { TeacherClassesPage, TeacherDashboard, TeacherSchedulePage } from './pages/TeacherPortal';
import { FamilyAccountPage, FamilyAttendancePage, FamilyCostumesPage, FamilyDancersPage, FamilyDashboard, FamilySchedulePage } from './pages/ParentPortal';
import { PerformanceDashboard } from './pages/PerformancePortal';
import { ReportsPage } from './pages/Reports';
import { PrintPage } from './pages/Print';
import { FinancePage, InvoiceDetailPage, ParentBillingPage } from './pages/Finance';
import { collectGarbage } from './lib/images';
import { getDb } from './data/store';

function App() {
  return (
    // HashRouter: works on any static host (e.g. GitHub Pages) without server rewrites.
    <HashRouter>
      <FeedbackProvider>
        <EditorProvider>
          <Routes>
            {/* Printable reports render without the app chrome. */}
            <Route path="/print/:report" element={<PrintPage />} />
            <Route path="*" element={<MainApp />} />
          </Routes>
        </EditorProvider>
      </FeedbackProvider>
    </HashRouter>
  );
}

/** "/" is the owner/office dashboard; other portals go to their own home. */
function Home() {
  const v = useViewer();
  return v.isStaffAdmin ? <Dashboard /> : <Navigate to={portalHome[v.portal]} replace />;
}

function MainApp() {
  return (
          <Layout>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/repairs" element={<RepairsPage />} />
              <Route path="/accounts" element={<AccountsPage />} />
              <Route path="/portals" element={<PortalsPage />} />
              <Route path="/families" element={<FamiliesPage />} />
              <Route path="/families/:id" element={<FamilyDetailPage />} />
              <Route path="/staff" element={<StaffPage />} />
              <Route path="/staff/:id" element={<StaffDetailPage />} />
              <Route path="/school-years" element={<SchoolYearsPage />} />
              <Route path="/classes" element={<ClassesPage />} />
              <Route path="/classes/:id" element={<ClassDetailPage />} />
              <Route path="/calendar" element={<CalendarPage />} />
              <Route path="/attendance" element={<AttendancePage />} />
              <Route path="/hours" element={<HoursPage />} />
              <Route path="/teacher" element={<TeacherDashboard />} />
              <Route path="/teacher/schedule" element={<TeacherSchedulePage />} />
              <Route path="/teacher/classes" element={<TeacherClassesPage />} />
              <Route path="/teacher/hours" element={<MyHoursPage />} />
              <Route path="/family" element={<FamilyDashboard />} />
              <Route path="/family/dancers" element={<FamilyDancersPage />} />
              <Route path="/family/schedule" element={<FamilySchedulePage />} />
              <Route path="/family/attendance" element={<FamilyAttendancePage />} />
              <Route path="/family/costumes" element={<FamilyCostumesPage />} />
              <Route path="/family/account" element={<FamilyAccountPage />} />
              <Route path="/performance" element={<PerformanceDashboard />} />
              <Route path="/reports" element={<ReportsPage />} />
              <Route path="/invoices" element={<FinancePage />} />
              <Route path="/invoices/:id" element={<InvoiceDetailPage />} />
              <Route path="/family/billing" element={<ParentBillingPage />} />
              <Route path="/dancers" element={<DancersPage />} />
              <Route path="/dancers/:id" element={<DancerProfilePage />} />
              <Route path="/costumes" element={<CostumesPage />} />
              <Route path="/costumes/:id" element={<CostumeDetailPage />} />
              <Route path="/props" element={<PropsPage />} />
              <Route path="/props/:id" element={<CostumeDetailPage />} />
              <Route path="/volunteers" element={<VolunteersPage />} />
              <Route path="/volunteers/:id" element={<VolunteerDetailPage />} />
              <Route path="/shows" element={<ShowsPage />} />
              <Route path="/shows/:id" element={<ShowDetailPage />} />
              <Route path="/performances" element={<PerformancesPage />} />
              <Route path="/performances/:id" element={<PerformanceDetailPage />} />
              <Route path="/storage" element={<StoragePage />} />
              <Route path="/storage/:id" element={<StorageDetailPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="*" element={<EmptyState title="Page not found" message="Use the menu to find your way back." />} />
            </Routes>
          </Layout>
  );
}

// Tidy up stored photo files that no longer belong to any record.
setTimeout(() => collectGarbage(new Set((getDb().photos ?? []).map((p) => p.id))), 3000);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

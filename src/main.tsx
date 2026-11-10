import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter, Route, Routes } from 'react-router-dom';
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
import { ReportsPage } from './pages/Reports';
import { PrintPage } from './pages/Print';
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

function MainApp() {
  return (
          <Layout>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/repairs" element={<RepairsPage />} />
              <Route path="/reports" element={<ReportsPage />} />
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

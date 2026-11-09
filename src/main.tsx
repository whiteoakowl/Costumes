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
import { CostumeDetailPage, CostumesPage } from './pages/Costumes';
import { ShowDetailPage, ShowsPage } from './pages/Shows';
import { PerformanceDetailPage, PerformancesPage } from './pages/Performances';
import { StorageDetailPage, StoragePage } from './pages/Storage';
import { SettingsPage } from './pages/Settings';
import { EmptyState } from './components/ui';

function App() {
  return (
    // HashRouter: works on any static host (e.g. GitHub Pages) without server rewrites.
    <HashRouter>
      <FeedbackProvider>
        <EditorProvider>
          <Layout>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/dancers" element={<DancersPage />} />
              <Route path="/dancers/:id" element={<DancerProfilePage />} />
              <Route path="/costumes" element={<CostumesPage />} />
              <Route path="/costumes/:id" element={<CostumeDetailPage />} />
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
        </EditorProvider>
      </FeedbackProvider>
    </HashRouter>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

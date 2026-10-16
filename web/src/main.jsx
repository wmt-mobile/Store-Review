import { StrictMode, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import './index.css';
import { DataProvider, UiProvider } from './lib/store.jsx';
import { Shell } from './layout/Shell.jsx';
import { Overview } from './pages/Overview.jsx';

const InReview = lazy(() => import('./pages/InReview.jsx'));
const Attention = lazy(() => import('./pages/Attention.jsx'));
const Apps = lazy(() => import('./pages/Apps.jsx'));
const Accounts = lazy(() => import('./pages/Accounts.jsx'));
const ActivityPage = lazy(() => import('./pages/Activity.jsx'));
const Setup = lazy(() => import('./pages/Setup.jsx'));
const Manage = lazy(() => import('./pages/Manage.jsx'));
const Audit = lazy(() => import('./pages/Audit.jsx'));
const NotificationSettings = lazy(() => import('./pages/NotificationSettings.jsx'));
const Login = lazy(() => import('./pages/Login.jsx'));
const Onboarding = lazy(() => import('./pages/Onboarding.jsx'));
const Landing = lazy(() => import('./pages/Landing.jsx'));

function Dashboard() {
  return (
    <DataProvider>
      <UiProvider>
        <Shell />
      </UiProvider>
    </DataProvider>
  );
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Suspense fallback={null}>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/onboarding" element={<Onboarding />} />
          <Route path="/dashboard" element={<Dashboard />}>
            <Route index element={<Overview />} />
            <Route path="review" element={<InReview />} />
            <Route path="attention" element={<Attention />} />
            <Route path="apps" element={<Apps />} />
            <Route path="accounts" element={<Accounts />} />
            <Route path="activity" element={<ActivityPage />} />
            <Route path="setup" element={<Setup />} />
            <Route path="manage" element={<Manage />} />
            <Route path="audit" element={<Audit />} />
            <Route path="notifications" element={<NotificationSettings />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Route>
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  </StrictMode>
);

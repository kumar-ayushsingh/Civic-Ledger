import React, { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppProvider } from './context/AppContext';
import Header from './components/Header';
import Footer from './components/Footer';
import LandingPage from './pages/LandingPage';
import AppShell from './pages/AppShell';
import PublicDashboardPage from './pages/PublicDashboardPage';
import ReportWizardPage from './pages/ReportWizardPage';
import OfficerPortalPage from './pages/OfficerPortalPage';
import TrackingPage from './pages/TrackingPage';
import LaunchModal from './components/LaunchModal';
import TamperBanner from './components/TamperBanner';

function LandingLayout({ onLaunch }) {
  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-700">
      {/* Landing Header: tab nav is hidden on landing, slim header with logo, a11y controls & launch button */}
      <Header onLaunch={onLaunch} isLanding={true} />
      <TamperBanner />
      <main className="flex-grow max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8">
        <LandingPage onLaunch={onLaunch} />
      </main>
      <Footer />
    </div>
  );
}

export default function App() {
  const [isLaunchModalOpen, setIsLaunchModalOpen] = useState(false);

  return (
    <AppProvider>
      <BrowserRouter>
        <Routes>
          {/* Landing Route */}
          <Route
            path="/"
            element={<LandingLayout onLaunch={() => setIsLaunchModalOpen(true)} />}
          />

          {/* App Routes */}
          <Route
            path="/app"
            element={<AppShell onLaunch={() => setIsLaunchModalOpen(true)} />}
          >
            <Route index element={<Navigate to="/app/ledger" replace />} />
            <Route path="ledger" element={<PublicDashboardPage />} />
            <Route path="report" element={<ReportWizardPage />} />
            <Route path="officer" element={<OfficerPortalPage />} />
          </Route>

          {/* Public Tracking Routes (No login required) */}
          <Route path="/track/:token" element={<TrackingPage />} />
          <Route path="/track" element={<TrackingPage />} />

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>

        {/* Global Fullscreen Launch Loader Modal */}
        <LaunchModal
          isOpen={isLaunchModalOpen}
          onClose={() => setIsLaunchModalOpen(false)}
        />
      </BrowserRouter>
    </AppProvider>
  );
}

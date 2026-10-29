import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { AppProvider } from './context/AppContext';
import Header from './components/Header';
import Footer from './components/Footer';
import LandingPage from './pages/LandingPage';
import AppShell from './pages/AppShell';
import PublicDashboardPage from './pages/PublicDashboardPage';
import ReportWizardPage from './pages/ReportWizardPage';
import OfficerPortalPage from './pages/OfficerPortalPage';
import TrackingPage from './pages/TrackingPage';
import DemoControlPage from './pages/DemoControlPage';
import GuidedDemoOverlay from './components/GuidedDemoOverlay';
import LaunchModal from './components/LaunchModal';
import TamperBanner from './components/TamperBanner';

function LandingLayout({ onLaunch }) {
  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-700">
      <Header onLaunch={onLaunch} isLanding={true} />
      <TamperBanner />
      <main className="flex-grow max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8">
        <LandingPage onLaunch={onLaunch} />
      </main>
      <Footer />
    </div>
  );
}

function DemoLayout({ onLaunch }) {
  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-700">
      <Header onLaunch={onLaunch} isLanding={false} />
      <TamperBanner />
      <main className="flex-grow max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8">
        <DemoControlPage />
      </main>
      <Footer />
    </div>
  );
}

// Global Keyboard Shortcut: Shift + D opens /demo control panel
function GlobalKeyboardShortcuts() {
  const navigate = useNavigate();

  useEffect(() => {
    const handleKeyDown = (e) => {
      // Do not trigger if typing inside an input or textarea
      if (['INPUT', 'TEXTAREA'].includes(e.target?.tagName)) return;

      if (e.shiftKey && (e.key === 'D' || e.key === 'd')) {
        e.preventDefault();
        navigate('/demo');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [navigate]);

  return null;
}

export default function App() {
  const [isLaunchModalOpen, setIsLaunchModalOpen] = useState(false);

  return (
    <AppProvider>
      <BrowserRouter>
        <GlobalKeyboardShortcuts />

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

          {/* Demo Control Center Route (Shift+D or /demo) */}
          <Route
            path="/demo"
            element={<DemoLayout onLaunch={() => setIsLaunchModalOpen(true)} />}
          />

          {/* Public Tracking Routes (No login required) */}
          <Route path="/track/:token" element={<TrackingPage />} />
          <Route path="/track" element={<TrackingPage />} />

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>

        {/* Floating Guided Demo Checklist Overlay */}
        <GuidedDemoOverlay />

        {/* Global Fullscreen Launch Loader Modal */}
        <LaunchModal
          isOpen={isLaunchModalOpen}
          onClose={() => setIsLaunchModalOpen(false)}
        />
      </BrowserRouter>
    </AppProvider>
  );
}

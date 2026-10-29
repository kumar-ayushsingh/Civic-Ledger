import React from 'react';
import { Outlet } from 'react-router-dom';
import Header from '../components/Header';
import Footer from '../components/Footer';
import TamperBanner from '../components/TamperBanner';

export default function AppShell({ onLaunch }) {
  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-700">
      <Header onLaunch={onLaunch} isLanding={false} />
      <TamperBanner />
      <main className="flex-grow max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}

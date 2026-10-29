import React from 'react';
import { useApp } from '../context/AppContext';

export default function Footer() {
  const { t } = useApp();

  return (
    <footer className="bg-white border-t border-slate-200 mt-16 py-8 text-xs text-slate-500" role="contentinfo">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-left">
        <div className="flex items-center gap-2.5">
          <span className="w-2.5 h-2.5 rounded-full bg-sky-500 shrink-0" aria-hidden="true"></span>
          <span className="font-bold text-slate-700">CivicLedger</span>
          <span className="hidden sm:inline text-slate-400">—</span>
          <span>Public Accountability Ledger for Civic Repairs</span>
        </div>
        <div className="font-medium text-slate-500">
          Theme 08: CivicTech and Public Transparency | CYPHER 26
        </div>
      </div>
    </footer>
  );
}

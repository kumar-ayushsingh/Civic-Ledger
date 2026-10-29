import React from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../context/AppContext';

export default function LedgerStubPage() {
  const {
    t,
    chainStatus,
    chainInfo,
    isTampered,
    tamperedBlock,
    verifyLedgerChain,
    simulateTamper,
    restoreChain,
  } = useApp();

  return (
    <div className="space-y-6">
      {/* Top Status & Controls Banner */}
      <div className={`border rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs transition-all ${
        isTampered ? 'bg-rose-50 border-rose-200 text-rose-900' : 'bg-emerald-50 border-emerald-200 text-emerald-900'
      }`}>
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center text-xl font-bold border shrink-0 ${
            isTampered ? 'bg-rose-100 text-rose-700 border-rose-300' : 'bg-emerald-100 text-emerald-700 border-emerald-300'
          }`}>
            <i className={`fa-solid ${isTampered ? 'fa-triangle-exclamation' : 'fa-circle-check'}`} aria-hidden="true"></i>
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              {isTampered ? 'Ledger Chain Broken!' : 'Prototype Data Layer & Ledger Active'}
              <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full border ${
                isTampered ? 'bg-rose-100 text-rose-800 border-rose-300' : 'bg-emerald-100 text-emerald-800 border-emerald-300'
              }`}>
                {isTampered ? 'Tamper Detected' : 'Simulated Data Active'}
              </span>
            </h2>
            <p className="text-xs text-slate-600 mt-0.5">
              {isTampered
                ? `Cryptographic mismatch detected at sequence #${tamperedBlock}. Chain integrity compromised!`
                : `3 Wards, 12 Assets, ~30 Cases. Total ${chainInfo.checked || 121} verified SHA-256 blocks.`}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Verify Chain Button */}
          <button
            onClick={() => verifyLedgerChain()}
            disabled={chainStatus === 'verifying'}
            className="flex items-center gap-2 bg-white hover:bg-sky-50 text-slate-800 hover:text-sky-800 px-3.5 py-2 rounded-full text-xs font-bold border border-slate-300 shadow-xs transition-all min-h-[40px] cursor-pointer"
          >
            {chainStatus === 'verifying' ? (
              <>
                <i className="fa-solid fa-circle-notch fa-spin text-sky-700"></i>
                <span>Verifying Hashes...</span>
              </>
            ) : chainStatus === 'valid' ? (
              <>
                <i className="fa-solid fa-circle-check text-emerald-600"></i>
                <span>Chain valid, {chainInfo.checked} blocks</span>
              </>
            ) : chainStatus === 'broken' ? (
              <>
                <i className="fa-solid fa-triangle-exclamation text-rose-600"></i>
                <span>Broken at block #{tamperedBlock}</span>
              </>
            ) : (
              <>
                <i className="fa-solid fa-link-slash text-sky-700"></i>
                <span>Verify Ledger Chain</span>
              </>
            )}
          </button>

          {/* Tamper / Reset Demo Triggers */}
          {!isTampered ? (
            <button
              onClick={() => simulateTamper(5)}
              className="flex items-center gap-1.5 bg-rose-50 hover:bg-rose-100 text-rose-800 hover:text-rose-950 px-3.5 py-2 rounded-full text-xs font-bold border border-rose-200 transition-all min-h-[40px] cursor-pointer"
              title="Directly corrupts block #5 in database to test audit detection"
            >
              <i className="fa-solid fa-bug text-rose-600"></i>
              <span>Simulate Audit Tamper</span>
            </button>
          ) : (
            <button
              onClick={() => restoreChain()}
              className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white px-3.5 py-2 rounded-full text-xs font-bold shadow-xs transition-all min-h-[40px] cursor-pointer"
            >
              <i className="fa-solid fa-arrow-rotate-left"></i>
              <span>Restore Clean Chain</span>
            </button>
          )}

          <Link
            to="/"
            className="px-4 py-2 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold transition-all min-h-[40px] flex items-center gap-1.5"
          >
            <i className="fa-solid fa-arrow-left text-slate-600"></i>
            <span>{t('nav.overview')}</span>
          </Link>
        </div>
      </div>

      {/* Metrics Row Preview */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="text-xs text-slate-600 font-semibold">Active Wards</div>
          <div className="text-2xl font-black text-slate-900 mt-1">3</div>
          <div className="text-[11px] text-sky-700 font-semibold mt-1">Ward 14, 15, 16</div>
        </div>
        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="text-xs text-slate-600 font-semibold">Simulated Cases</div>
          <div className="text-2xl font-black text-sky-700 mt-1">30</div>
          <div className="text-[11px] text-slate-600 font-semibold mt-1">Across all SLA states</div>
        </div>
        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="text-xs text-slate-600 font-semibold">Escalated Tickets</div>
          <div className="text-2xl font-black text-amber-700 mt-1">5</div>
          <div className="text-[11px] text-amber-700 font-semibold mt-1">L1 & L2 Breached</div>
        </div>
        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="text-xs text-slate-600 font-semibold">Verified Closures</div>
          <div className="text-2xl font-black text-emerald-700 mt-1">4</div>
          <div className="text-[11px] text-emerald-700 font-semibold mt-1">AI Verified & Logged</div>
        </div>
      </div>

      {/* Placeholder Workspace Notice */}
      <div className="bg-white rounded-3xl border border-slate-200 p-8 shadow-xs text-center space-y-4">
        <div className="w-14 h-14 rounded-full bg-sky-50 text-sky-700 flex items-center justify-center text-2xl mx-auto border border-sky-200">
          <i className="fa-solid fa-cubes-stacked"></i>
        </div>
        <div className="max-w-md mx-auto space-y-1">
          <h3 className="text-lg font-bold text-slate-900">
            Data Layer & Ledger Engine Operational
          </h3>
          <p className="text-xs sm:text-sm text-slate-700">
            SQLAlchemy SQLite models, SHA-256 hash chaining, deterministic AI detector, and periodic external anchors are running on the backend. Click <strong>Simulate Audit Tamper</strong> above or use the header button to verify cryptographic integrity!
          </p>
        </div>
        <div className="pt-2">
          <Link
            to="/"
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full bg-sky-700 hover:bg-sky-800 text-white text-xs font-bold shadow-xs transition-all min-h-[44px]"
          >
            <i className="fa-solid fa-house"></i>
            <span>Return to Landing Page Overview</span>
          </Link>
        </div>
      </div>
    </div>
  );
}

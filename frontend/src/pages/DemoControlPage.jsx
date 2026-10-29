import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../context/AppContext';

export default function DemoControlPage() {
  const {
    t,
    lang,
    chainStatus,
    chainInfo,
    isTampered,
    tamperedBlock,
    verifyLedgerChain,
    simulateTamper,
    restoreChain,
  } = useApp();

  // Demo status from backend
  const [demoStatus, setDemoStatus] = useState(null);
  const [isLoadingStatus, setIsLoadingStatus] = useState(true);

  // Clock Advance States
  const [isAdvancingClock, setIsAdvancingClock] = useState(false);
  const [clockToast, setClockToast] = useState(null);

  // Simulated GPS State (Persisted in localStorage)
  const [simGpsPreset, setSimGpsPreset] = useState(() => {
    return localStorage.getItem('civicledger_demo_gps_name') || 'reported_spot';
  });

  // Detector Override States
  const [isUpdatingDetector, setIsUpdatingDetector] = useState(false);
  const [detectorToast, setDetectorToast] = useState(null);

  // Anchor & Reset States
  const [isCreatingAnchor, setIsCreatingAnchor] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [actionMessage, setActionMessage] = useState(null);

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/demo/status');
      if (res.ok) {
        const data = await res.json();
        setDemoStatus(data);
      }
    } catch (err) {
      console.error('Failed to fetch demo status:', err);
    } finally {
      setIsLoadingStatus(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 3000);
    return () => clearInterval(interval);
  }, []);

  // 1. Advance Clock
  const handleAdvanceClock = async (hours) => {
    setIsAdvancingClock(true);
    try {
      const res = await fetch('/api/demo/advance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hours }),
      });
      if (res.ok) {
        const data = await res.json();
        setClockToast(`Clock advanced by +${hours}h (${data.escalations_triggered || 0} auto-escalations triggered)`);
        setTimeout(() => setClockToast(null), 4000);
        await Promise.all([fetchStatus(), verifyLedgerChain()]);
      }
    } catch (err) {
      console.error('Failed to advance clock:', err);
    } finally {
      setIsAdvancingClock(false);
    }
  };

  // 2. Simulated GPS Preset Change
  const handleGpsPresetChange = (presetKey) => {
    setSimGpsPreset(presetKey);
    localStorage.setItem('civicledger_demo_gps_name', presetKey);
    if (presetKey === 'reported_spot') {
      localStorage.setItem(
        'civicledger_demo_gps',
        JSON.stringify({ lat: 28.4095, lng: 77.3180, name: 'Sector 14 Avenue (Within 25m site)' })
      );
    } else {
      localStorage.setItem(
        'civicledger_demo_gps',
        JSON.stringify({ lat: 28.4140, lng: 77.3220, name: '500m Away (Beyond 25m tolerance)' })
      );
    }
    setActionMessage(
      presetKey === 'reported_spot'
        ? 'GPS Preset Set: At reported spot (28.4095, 77.3180) -> Rule 1 GPS Proximity PASS'
        : 'GPS Preset Set: 500m Away (28.4140, 77.3220) -> Rule 1 GPS Proximity FAIL'
    );
    setTimeout(() => setActionMessage(null), 4000);
  };

  // 3. Detector Override
  const handleDetectorOverride = async (defectPresent, clear = false) => {
    setIsUpdatingDetector(true);
    try {
      const payload = clear
        ? { clear: true }
        : { defect_present: defectPresent, defect_type: 'pothole', confidence: defectPresent ? 0.95 : 0.04 };

      const res = await fetch('/api/demo/detector-override', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const data = await res.json();
        setDetectorToast(data.message);
        setTimeout(() => setDetectorToast(null), 4000);
        await fetchStatus();
      }
    } catch (err) {
      console.error('Failed to update detector override:', err);
    } finally {
      setIsUpdatingDetector(false);
    }
  };

  // 4. Create Anchor
  const handleCreateAnchor = async () => {
    setIsCreatingAnchor(true);
    try {
      const res = await fetch('/api/ledger/anchor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: 'Witness checkpoint created from /demo control page' }),
      });
      if (res.ok) {
        const data = await res.json();
        setActionMessage(`Witness Anchor #${data.id} published to sequence #${data.sequence}`);
        setTimeout(() => setActionMessage(null), 4000);
        await Promise.all([fetchStatus(), verifyLedgerChain()]);
      }
    } catch (err) {
      console.error('Failed to create anchor:', err);
    } finally {
      setIsCreatingAnchor(false);
    }
  };

  // 5. Full Reset
  const handleReset = async () => {
    if (isResetting) return;
    setIsResetting(true);
    try {
      const res = await fetch('/api/demo/reset', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setActionMessage(`System reset complete in ${data.duration_seconds}s. Total blocks: ${data.total_blocks}`);
        setTimeout(() => setActionMessage(null), 5000);
        await Promise.all([fetchStatus(), verifyLedgerChain()]);
      }
    } catch (err) {
      console.error('Failed to reset demo state:', err);
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* ================= HEADER STRIP ================= */}
      <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <span className="w-3 h-3 rounded-full bg-rose-500 pulse-circle"></span>
            <h1 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
              DEMO & PRESENTATION CONTROL PANEL
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-rose-100 text-rose-800 border border-rose-300 uppercase">
              DEMO
            </span>
          </div>
          <p className="text-xs text-slate-500 font-medium">
            Global Shortcut: Press <kbd className="px-1.5 py-0.5 bg-slate-100 border border-slate-300 rounded text-[11px] font-mono font-bold text-slate-800">Shift + D</kbd> from any screen to open this panel.
          </p>
        </div>

        {/* Quick Nav Links */}
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to="/app/report"
            className="px-3.5 py-1.5 rounded-full bg-sky-50 hover:bg-sky-100 text-sky-800 border border-sky-200 text-xs font-bold transition-all"
          >
            Report Wizard
          </Link>
          <Link
            to="/app/officer"
            className="px-3.5 py-1.5 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 text-xs font-bold transition-all"
          >
            Officer Portal
          </Link>
          <Link
            to="/app/ledger"
            className="px-3.5 py-1.5 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 text-xs font-bold transition-all"
          >
            Public Dashboard
          </Link>
          <Link
            to="/"
            className="px-3.5 py-1.5 rounded-full bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold transition-all"
          >
            Landing Page
          </Link>
        </div>
      </div>

      {/* Global Feedback Toast */}
      {(actionMessage || clockToast || detectorToast) && (
        <div className="p-3.5 rounded-2xl bg-sky-50 border border-sky-200 text-sky-900 text-xs font-bold flex items-center gap-2 shadow-xs">
          <i className="fa-solid fa-circle-info text-sky-600 text-sm"></i>
          <span>{actionMessage || clockToast || detectorToast}</span>
        </div>
      )}

      {/* ================= CONTROLS GRID ================= */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* CARD 1: LIVE SIMULATED CLOCK & FAST FORWARD */}
        <div className="bg-white rounded-3xl border border-slate-200 p-6 space-y-4 shadow-xs">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <i className="fa-solid fa-clock text-sky-500 text-base"></i>
              <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider">
                Simulated Time & Fast-Forward
              </h2>
            </div>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
              Auto-Escalation Engine
            </span>
          </div>

          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/80 space-y-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase block">
              Current Simulated Clock
            </span>
            <p className="text-xl font-black text-slate-900 font-mono">
              {demoStatus?.clock?.formatted || 'Loading clock...'}
            </p>
            <span className="text-[10px] text-slate-500 font-mono">
              ISO: {demoStatus?.clock?.iso || ''}
            </span>
          </div>

          <p className="text-xs text-slate-500 leading-relaxed">
            Fast-forwarding simulated time immediately evaluates SLA deadlines, reassigns tickets,
            triggers L1 $\rightarrow$ L2 $\rightarrow$ L3 auto-escalations, and logs tamper-evident events.
          </p>

          <div className="flex items-center gap-3 pt-1">
            <button
              onClick={() => handleAdvanceClock(4)}
              disabled={isAdvancingClock}
              className="flex-1 py-2.5 px-4 rounded-full bg-sky-500 hover:bg-sky-600 text-white font-bold text-xs shadow-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <i className={`fa-solid fa-forward ${isAdvancingClock ? 'fa-spin' : ''}`}></i>
              <span>+4 Hours</span>
            </button>

            <button
              onClick={() => handleAdvanceClock(24)}
              disabled={isAdvancingClock}
              className="flex-1 py-2.5 px-4 rounded-full bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs shadow-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <i className={`fa-solid fa-forward-fast ${isAdvancingClock ? 'fa-spin' : ''}`}></i>
              <span>+1 Day (+24 Hours)</span>
            </button>
          </div>
        </div>

        {/* CARD 2: SIMULATED GPS PRESETS */}
        <div className="bg-white rounded-3xl border border-slate-200 p-6 space-y-4 shadow-xs">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <i className="fa-solid fa-location-crosshairs text-sky-500 text-base"></i>
              <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider">
                Simulated GPS Presets
              </h2>
            </div>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
              Rule 1 Verification (≤ 25m)
            </span>
          </div>

          <p className="text-xs text-slate-500 leading-relaxed">
            Select the simulated GPS coordinate preset. This coordinates pair is injected into
            the Citizen Report Wizard and Officer Closure Verification when testing mobile devices or mock mode.
          </p>

          <div className="space-y-2.5">
            {/* Preset 1: At reported spot */}
            <label
              onClick={() => handleGpsPresetChange('reported_spot')}
              className={`p-3.5 rounded-2xl border transition-all flex items-start gap-3 cursor-pointer ${
                simGpsPreset === 'reported_spot'
                  ? 'bg-sky-50/70 border-sky-400 shadow-xs'
                  : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
              }`}
            >
              <input
                type="radio"
                name="gps_preset"
                checked={simGpsPreset === 'reported_spot'}
                onChange={() => {}}
                className="mt-1 text-sky-600"
              />
              <div className="text-xs space-y-0.5">
                <span className="font-bold text-slate-900 block">
                  At Reported Defect Spot (Within 25m Site)
                </span>
                <span className="text-slate-500 font-mono text-[11px] block">
                  Lat: 28.4095, Lon: 77.3180 (Sector 14 Main Avenue)
                </span>
                <span className="text-emerald-700 font-bold text-[10px]">
                  ✓ Passes Rule 1 GPS Proximity Test (Distance = 0m ≤ 25m)
                </span>
              </div>
            </label>

            {/* Preset 2: 500m away */}
            <label
              onClick={() => handleGpsPresetChange('away_500m')}
              className={`p-3.5 rounded-2xl border transition-all flex items-start gap-3 cursor-pointer ${
                simGpsPreset === 'away_500m'
                  ? 'bg-rose-50/70 border-rose-400 shadow-xs'
                  : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
              }`}
            >
              <input
                type="radio"
                name="gps_preset"
                checked={simGpsPreset === 'away_500m'}
                onChange={() => {}}
                className="mt-1 text-rose-600"
              />
              <div className="text-xs space-y-0.5">
                <span className="font-bold text-slate-900 block">
                  500m Away (Beyond 25m Tolerance)
                </span>
                <span className="text-slate-500 font-mono text-[11px] block">
                  Lat: 28.4140, Lon: 77.3220 (Offset ~520m)
                </span>
                <span className="text-rose-700 font-bold text-[10px]">
                  ✗ Triggers Rule 1 Violation (Closure Rejected with distance explanation)
                </span>
              </div>
            </label>
          </div>
        </div>

        {/* CARD 3: COMPUTER VISION DETECTOR MODE & OVERRIDE */}
        <div className="bg-white rounded-3xl border border-slate-200 p-6 space-y-4 shadow-xs">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <i className="fa-solid fa-camera-viewfinder text-sky-500 text-base"></i>
              <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider">
                AI Defect Detector Engine
              </h2>
            </div>
            <span
              className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                demoStatus?.detector?.mode === 'yolo'
                  ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                  : 'bg-amber-100 text-amber-800 border-amber-300'
              }`}
            >
              {demoStatus?.detector?.mode === 'yolo' ? 'YOLO v8 Active' : 'Demo detection mode'}
            </span>
          </div>

          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/80 space-y-2 text-xs">
            <div className="flex justify-between items-center">
              <span className="text-slate-500 font-bold">Active Engine:</span>
              <span className="font-bold text-slate-800 capitalize">
                {demoStatus?.detector?.mode || 'mock'}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-500 font-bold">YOLO Weights:</span>
              <span
                className={`font-mono text-[11px] font-bold ${
                  demoStatus?.detector?.yolo_model_available ? 'text-emerald-700' : 'text-slate-400'
                }`}
              >
                {demoStatus?.detector?.yolo_model_available
                  ? 'backend/models/pothole.pt'
                  : 'Not Present (Mock Fallback)'}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-500 font-bold">Override Active:</span>
              <span
                className={`font-bold ${
                  demoStatus?.detector?.override_active ? 'text-amber-700' : 'text-slate-400'
                }`}
              >
                {demoStatus?.detector?.override_active ? 'Yes' : 'No (Deterministic)'}
              </span>
            </div>
          </div>

          <p className="text-xs text-slate-500">
            Override the detector output for rapid testing of Rule 4 (AI Defect Clearance).
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
            <button
              onClick={() => handleDetectorOverride(true)}
              disabled={isUpdatingDetector}
              className="px-3 py-2 rounded-xl text-xs font-bold bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-200 transition-all cursor-pointer"
              title="Forces detector to return defect (confidence 0.95)"
            >
              Defect Present (95%)
            </button>
            <button
              onClick={() => handleDetectorOverride(false)}
              disabled={isUpdatingDetector}
              className="px-3 py-2 rounded-xl text-xs font-bold bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 transition-all cursor-pointer"
              title="Forces detector to return clean road (confidence 0.04)"
            >
              Clean Road (4%)
            </button>
            <button
              onClick={() => handleDetectorOverride(null, true)}
              disabled={isUpdatingDetector}
              className="px-3 py-2 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 transition-all cursor-pointer"
              title="Clears override and returns to default mode"
            >
              Clear Override
            </button>
          </div>
        </div>

        {/* CARD 4: LEDGER INTEGRITY, TAMPER & WITNESS ANCHOR */}
        <div className="bg-white rounded-3xl border border-slate-200 p-6 space-y-4 shadow-xs">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <i className="fa-solid fa-link text-sky-500 text-base"></i>
              <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider">
                Ledger Tamper & Witness Anchor
              </h2>
            </div>
            <span
              className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                isTampered
                  ? 'bg-rose-100 text-rose-800 border-rose-300'
                  : 'bg-emerald-100 text-emerald-800 border-emerald-300'
              }`}
            >
              {isTampered ? `Broken at #${tamperedBlock}` : 'Chain Valid'}
            </span>
          </div>

          <p className="text-xs text-slate-500 leading-relaxed">
            Test CivicLedger's tamper-evident SHA-256 chain. Directly modify an old block in SQLite to demonstrate audit detection, create witness anchors, or verify hashes.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <button
              onClick={() => simulateTamper(5)}
              className="py-2.5 px-4 rounded-full bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-200 font-bold text-xs shadow-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              title="Corrupts Block #5 payload directly in database"
            >
              <i className="fa-solid fa-bug text-rose-600"></i>
              <span>Corrupt Block #5</span>
            </button>

            <button
              onClick={() => verifyLedgerChain()}
              disabled={chainStatus === 'verifying'}
              className="py-2.5 px-4 rounded-full bg-sky-500 hover:bg-sky-600 text-white font-bold text-xs shadow-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <i className={`fa-solid ${chainStatus === 'verifying' ? 'fa-circle-notch fa-spin' : 'fa-shield-halved'}`}></i>
              <span>Verify Ledger Chain</span>
            </button>

            <button
              onClick={handleCreateAnchor}
              disabled={isCreatingAnchor}
              className="py-2.5 px-4 rounded-full bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs shadow-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <i className="fa-solid fa-anchor text-sky-400"></i>
              <span>Create Witness Anchor</span>
            </button>

            <button
              onClick={() => restoreChain()}
              className="py-2.5 px-4 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <i className="fa-solid fa-arrow-rotate-left"></i>
              <span>Restore Clean Chain</span>
            </button>
          </div>
        </div>
      </div>

      {/* ================= CARD 5: FULL DEMO RESET (< 10 SECONDS) ================= */}
      <div className="bg-slate-900 rounded-3xl p-6 sm:p-8 text-white space-y-4 shadow-xl border border-slate-800">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <h3 className="text-base sm:text-lg font-black tracking-tight flex items-center gap-2">
              <i className="fa-solid fa-rotate text-emerald-400"></i>
              Complete Simulated State Reset
            </h3>
            <p className="text-xs text-slate-400 max-w-xl">
              Flushes all tables and re-seeds 3 Wards, 12 Assets, 6 Contracts with active defect liabilities,
              and 30 initial cases across all SLA tiers in under 3 seconds.
            </p>
          </div>

          <button
            onClick={handleReset}
            disabled={isResetting}
            className="px-6 py-3 rounded-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs uppercase tracking-wider shadow-md transition-all flex items-center justify-center gap-2 shrink-0 cursor-pointer"
          >
            <i className={`fa-solid fa-arrows-rotate ${isResetting ? 'fa-spin' : ''}`}></i>
            <span>{isResetting ? 'Resetting Database...' : 'Reset Entire Demo State (< 10s)'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

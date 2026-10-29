import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useApp } from '../context/AppContext';

export default function GuidedDemoOverlay() {
  const navigate = useNavigate();
  const location = useLocation();
  const { verifyLedgerChain, simulateTamper, restoreChain, isTampered } = useApp();

  const [isOpen, setIsOpen] = useState(false);
  const [completedSteps, setCompletedSteps] = useState({
    1: false,
    2: false,
    3: false,
    4: false,
    5: false,
  });
  const [activeActionMsg, setActiveActionMsg] = useState(null);

  const toggleStep = (stepNum) => {
    setCompletedSteps((prev) => ({ ...prev, [stepNum]: !prev[stepNum] }));
  };

  const showMsg = (msg) => {
    setActiveActionMsg(msg);
    setTimeout(() => setActiveActionMsg(null), 3500);
  };

  // Step Action Handlers
  const handleStep1 = () => {
    navigate('/app/report');
    setCompletedSteps((prev) => ({ ...prev, 1: true }));
    showMsg('Navigated to Citizen Report Wizard');
  };

  const handleStep2 = async () => {
    try {
      const res = await fetch('/api/demo/advance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hours: 4 }),
      });
      if (res.ok) {
        const data = await res.json();
        setCompletedSteps((prev) => ({ ...prev, 2: true }));
        showMsg(`Fast-forwarded +4h (${data.escalations_triggered || 0} escalations triggered)`);
        verifyLedgerChain();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleStep3 = () => {
    navigate('/app/officer');
    setCompletedSteps((prev) => ({ ...prev, 3: true }));
    showMsg('Navigated to Officer Portal & Closure Verification');
  };

  const handleStep4 = async () => {
    if (!isTampered) {
      await simulateTamper(5);
      setCompletedSteps((prev) => ({ ...prev, 4: true }));
      showMsg('Corrupted Block #5 in database! Tamper detected in ledger.');
    } else {
      await restoreChain();
      showMsg('Restored clean cryptographic ledger chain.');
    }
  };

  const handleStep5 = () => {
    navigate('/app/ledger');
    setCompletedSteps((prev) => ({ ...prev, 5: true }));
    showMsg('Navigated to Public Dashboard & Ward Map');
  };

  // If on demo page itself, show pill or compact version
  return (
    <div className="fixed bottom-4 right-4 z-40 max-w-sm sm:max-w-md w-full">
      {!isOpen ? (
        <button
          onClick={() => setIsOpen(true)}
          className="ml-auto bg-slate-900 hover:bg-slate-800 text-white px-4 py-2.5 rounded-full text-xs font-bold shadow-xl border border-slate-700 flex items-center gap-2.5 transition-all hover:scale-105 cursor-pointer"
          title="Open guided hackathon pitch walkthrough checklist"
          aria-label="Open guided demo overlay"
        >
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 pulse-circle"></span>
          <span>Guided Demo Script (3-Min Pitch)</span>
          <span className="px-1.5 py-0.2 rounded text-[9px] font-black bg-rose-500 text-white uppercase">
            DEMO
          </span>
          <i className="fa-solid fa-chevron-up text-[10px] text-slate-400"></i>
        </button>
      ) : (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-3 duration-200">
          {/* Header */}
          <div className="p-4 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400"></span>
                <h4 className="text-xs font-black tracking-tight uppercase">
                  3-Minute Hackathon Demo Script
                </h4>
              </div>
              <p className="text-[10px] text-slate-400">
                Interactive script checklist for live presentation
              </p>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                onClick={() => navigate('/demo')}
                className="px-2 py-1 rounded text-[10px] font-bold bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                title="Open full demo control page"
              >
                /demo
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="w-7 h-7 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center text-xs transition-colors"
                aria-label="Collapse guided demo"
              >
                <i className="fa-solid fa-chevron-down"></i>
              </button>
            </div>
          </div>

          {/* Action Notification */}
          {activeActionMsg && (
            <div className="px-4 py-2 bg-sky-50 border-b border-sky-100 text-sky-900 text-[11px] font-bold flex items-center gap-2">
              <i className="fa-solid fa-check text-sky-600"></i>
              <span>{activeActionMsg}</span>
            </div>
          )}

          {/* Checklist Items */}
          <div className="p-4 space-y-3 max-h-[380px] overflow-y-auto text-xs">
            {/* Step 1 */}
            <div
              className={`p-3 rounded-2xl border transition-all space-y-2 ${
                completedSteps[1] ? 'bg-emerald-50/60 border-emerald-200' : 'bg-slate-50 border-slate-200'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={completedSteps[1]}
                    onChange={() => toggleStep(1)}
                    className="mt-0.5 accent-emerald-600 cursor-pointer"
                  />
                  <div>
                    <span className="font-black text-slate-900 block">
                      1. Report on Phone (Citizen Wizard)
                    </span>
                    <span className="text-[11px] text-slate-500 block leading-tight">
                      Photo capture $\rightarrow$ AI triage $\rightarrow$ auto asset & department assignment $\rightarrow$ SLA clock starts.
                    </span>
                  </div>
                </div>
              </div>
              <button
                onClick={handleStep1}
                className="w-full py-1.5 px-3 rounded-xl bg-sky-500 hover:bg-sky-600 text-white font-bold text-[11px] transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <i className="fa-solid fa-mobile-screen"></i>
                <span>Open Citizen Wizard</span>
              </button>
            </div>

            {/* Step 2 */}
            <div
              className={`p-3 rounded-2xl border transition-all space-y-2 ${
                completedSteps[2] ? 'bg-emerald-50/60 border-emerald-200' : 'bg-slate-50 border-slate-200'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={completedSteps[2]}
                    onChange={() => toggleStep(2)}
                    className="mt-0.5 accent-emerald-600 cursor-pointer"
                  />
                  <div>
                    <span className="font-black text-slate-900 block">
                      2. Escalate via Fast-Forward SLA
                    </span>
                    <span className="text-[11px] text-slate-500 block leading-tight">
                      Advance simulated clock; unattended ticket automatically escalates from L1 to L2.
                    </span>
                  </div>
                </div>
              </div>
              <button
                onClick={handleStep2}
                className="w-full py-1.5 px-3 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-[11px] transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <i className="fa-solid fa-forward-fast"></i>
                <span>Fast-Forward Clock (+4h)</span>
              </button>
            </div>

            {/* Step 3 */}
            <div
              className={`p-3 rounded-2xl border transition-all space-y-2 ${
                completedSteps[3] ? 'bg-emerald-50/60 border-emerald-200' : 'bg-slate-50 border-slate-200'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={completedSteps[3]}
                    onChange={() => toggleStep(3)}
                    className="mt-0.5 accent-emerald-600 cursor-pointer"
                  />
                  <div>
                    <span className="font-black text-slate-900 block">
                      3. Reject Fake Fix $\rightarrow$ Accept Genuine
                    </span>
                    <span className="text-[11px] text-slate-500 block leading-tight">
                      Test 4-rule closure engine in officer portal (rejection shortcuts + genuine repair).
                    </span>
                  </div>
                </div>
              </div>
              <button
                onClick={handleStep3}
                className="w-full py-1.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-900 text-white font-bold text-[11px] transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <i className="fa-solid fa-shield-halved"></i>
                <span>Open Officer Portal</span>
              </button>
            </div>

            {/* Step 4 */}
            <div
              className={`p-3 rounded-2xl border transition-all space-y-2 ${
                completedSteps[4] ? 'bg-emerald-50/60 border-emerald-200' : 'bg-slate-50 border-slate-200'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={completedSteps[4]}
                    onChange={() => toggleStep(4)}
                    className="mt-0.5 accent-emerald-600 cursor-pointer"
                  />
                  <div>
                    <span className="font-black text-slate-900 block">
                      4. Tamper-Evident Ledger Audit Test
                    </span>
                    <span className="text-[11px] text-slate-500 block leading-tight">
                      Verify hash chain, simulate audit tampering in SQLite, see TamperBanner, and restore.
                    </span>
                  </div>
                </div>
              </div>
              <button
                onClick={handleStep4}
                className={`w-full py-1.5 px-3 rounded-xl font-bold text-[11px] transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  isTampered
                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                    : 'bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-300'
                }`}
              >
                <i className={`fa-solid ${isTampered ? 'fa-arrow-rotate-left' : 'fa-bug'}`}></i>
                <span>{isTampered ? 'Restore Clean Chain' : 'Simulate Audit Tamper (Block #5)'}</span>
              </button>
            </div>

            {/* Step 5 */}
            <div
              className={`p-3 rounded-2xl border transition-all space-y-2 ${
                completedSteps[5] ? 'bg-emerald-50/60 border-emerald-200' : 'bg-slate-50 border-slate-200'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={completedSteps[5]}
                    onChange={() => toggleStep(5)}
                    className="mt-0.5 accent-emerald-600 cursor-pointer"
                  />
                  <div>
                    <span className="font-black text-slate-900 block">
                      5. Department Scorecards & Ward Map
                    </span>
                    <span className="text-[11px] text-slate-500 block leading-tight">
                      Public accountability dashboard with letter grades, contractor liability, and map pins.
                    </span>
                  </div>
                </div>
              </div>
              <button
                onClick={handleStep5}
                className="w-full py-1.5 px-3 rounded-xl bg-sky-500 hover:bg-sky-600 text-white font-bold text-[11px] transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <i className="fa-solid fa-chart-simple"></i>
                <span>View Public Dashboard</span>
              </button>
            </div>
          </div>

          {/* Footer */}
          <div className="p-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-[11px]">
            <span className="text-slate-400 font-semibold">
              Shortcut: <kbd className="font-mono text-slate-700 font-bold">Shift+D</kbd>
            </span>
            <button
              onClick={() => {
                setCompletedSteps({ 1: false, 2: false, 3: false, 4: false, 5: false });
                showMsg('Checklist reset');
              }}
              className="text-slate-500 hover:text-slate-800 font-bold cursor-pointer"
            >
              Reset Checklist
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

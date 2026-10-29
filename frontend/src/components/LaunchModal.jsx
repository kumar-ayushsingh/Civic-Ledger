import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';

export default function LaunchModal({ isOpen, onClose }) {
  const { t } = useApp();
  const navigate = useNavigate();
  const [step1State, setStep1State] = useState('idle'); // 'idle' | 'running' | 'done'
  const [step2State, setStep2State] = useState('idle');
  const [step3State, setStep3State] = useState('idle');
  const [isCompleted, setIsCompleted] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setStep1State('idle');
      setStep2State('idle');
      setStep3State('idle');
      setIsCompleted(false);
      return;
    }

    let isMounted = true;

    // Trigger API call and progressive steps
    const runLaunchSequence = async () => {
      setStep1State('running');

      // Kick off POST /api/launch
      const apiPromise = fetch('/api/launch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
        .then((res) => (res.ok ? res.json() : { ok: true }))
        .catch(() => ({ ok: true })); // Safe fallback stub

      // Step 1: Starting services (600ms)
      await new Promise((r) => setTimeout(r, 600));
      if (!isMounted) return;
      setStep1State('done');
      setStep2State('running');

      // Step 2: Loading simulated ward data (700ms)
      await new Promise((r) => setTimeout(r, 700));
      if (!isMounted) return;
      setStep2State('done');
      setStep3State('running');

      // Wait for API call & Step 3: Verifying ledger chain (700ms)
      await Promise.all([
        apiPromise,
        new Promise((r) => setTimeout(r, 700)),
      ]);
      if (!isMounted) return;
      setStep3State('done');
      setIsCompleted(true);

      // Short delay before navigation
      await new Promise((r) => setTimeout(r, 450));
      if (!isMounted) return;

      onClose();
      navigate('/app/ledger');
    };

    runLaunchSequence();

    return () => {
      isMounted = false;
    };
  }, [isOpen, navigate, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="loader-title"
    >
      <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl border border-sky-100 text-center space-y-6 relative overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Decorative Top Accent */}
        <div className="absolute -top-12 -right-12 w-32 h-32 rounded-full bg-sky-100/60 blur-xl pointer-events-none"></div>

        {/* Header Icon */}
        <div className="mx-auto w-16 h-16 rounded-full bg-sky-50 border-2 border-sky-100 flex items-center justify-center text-sky-600 text-2xl shadow-sm">
          <i className="fa-solid fa-layer-group animate-pulse" aria-hidden="true"></i>
        </div>

        {/* Modal Titles */}
        <div className="space-y-1">
          <h2 id="loader-title" className="text-xl sm:text-2xl font-extrabold text-slate-800 tracking-tight">
            {t('loader.title')}
          </h2>
          <p className="text-xs text-slate-500 font-medium">
            {t('loader.subtitle')}
          </p>
        </div>

        {/* Live Lines List */}
        <div className="space-y-3 bg-slate-50 p-4 rounded-2xl border border-slate-200/80 text-left">
          {/* Line 1 */}
          <div className="flex items-center justify-between py-1">
            <span className="text-sm font-semibold text-slate-700 flex items-center gap-2.5">
              <span className="w-2 h-2 rounded-full bg-sky-500"></span>
              {t('loader.step1')}
            </span>
            <div className="w-6 h-6 flex items-center justify-center">
              {step1State === 'running' && (
                <i className="fa-solid fa-circle-notch fa-spin text-sky-500 text-base" aria-hidden="true"></i>
              )}
              {step1State === 'done' && (
                <i className="fa-solid fa-circle-check text-emerald-500 text-base animate-in zoom-in duration-150" aria-label="Completed"></i>
              )}
              {step1State === 'idle' && (
                <span className="w-3 h-3 rounded-full bg-slate-200 inline-block"></span>
              )}
            </div>
          </div>

          {/* Line 2 */}
          <div className="flex items-center justify-between py-1 border-t border-slate-200/60">
            <span className="text-sm font-semibold text-slate-700 flex items-center gap-2.5">
              <span className="w-2 h-2 rounded-full bg-amber-500"></span>
              {t('loader.step2')}
            </span>
            <div className="w-6 h-6 flex items-center justify-center">
              {step2State === 'running' && (
                <i className="fa-solid fa-circle-notch fa-spin text-sky-500 text-base" aria-hidden="true"></i>
              )}
              {step2State === 'done' && (
                <i className="fa-solid fa-circle-check text-emerald-500 text-base animate-in zoom-in duration-150" aria-label="Completed"></i>
              )}
              {step2State === 'idle' && (
                <span className="w-3 h-3 rounded-full bg-slate-200 inline-block"></span>
              )}
            </div>
          </div>

          {/* Line 3 */}
          <div className="flex items-center justify-between py-1 border-t border-slate-200/60">
            <span className="text-sm font-semibold text-slate-700 flex items-center gap-2.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              {t('loader.step3')}
            </span>
            <div className="w-6 h-6 flex items-center justify-center">
              {step3State === 'running' && (
                <i className="fa-solid fa-circle-notch fa-spin text-sky-500 text-base" aria-hidden="true"></i>
              )}
              {step3State === 'done' && (
                <i className="fa-solid fa-circle-check text-emerald-500 text-base animate-in zoom-in duration-150" aria-label="Completed"></i>
              )}
              {step3State === 'idle' && (
                <span className="w-3 h-3 rounded-full bg-slate-200 inline-block"></span>
              )}
            </div>
          </div>
        </div>

        {/* Completion status notification */}
        <div aria-live="polite" className="text-xs font-semibold min-h-[24px]">
          {isCompleted ? (
            <span className="text-emerald-600 flex items-center justify-center gap-1.5 animate-in fade-in">
              <i className="fa-solid fa-circle-check" aria-hidden="true"></i>
              {t('loader.success')}
            </span>
          ) : (
            <span className="text-slate-400">
              <i className="fa-solid fa-hourglass-half me-1" aria-hidden="true"></i>
              Starting in ~2s...
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

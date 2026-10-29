import React from 'react';
import { useApp } from '../context/AppContext';

export default function TamperBanner() {
  const { isTampered, tamperedBlock, restoreChain } = useApp();

  if (!isTampered) return null;

  return (
    <div
      id="tamper-banner"
      role="alert"
      aria-live="assertive"
      className="bg-rose-50 border-b border-rose-200 text-rose-800 px-4 py-2.5 text-xs text-center font-medium flex flex-wrap items-center justify-center gap-2 transition-all animate-in fade-in slide-in-from-top-2 duration-200"
    >
      <i className="fa-solid fa-triangle-exclamation text-rose-600 text-sm shrink-0" aria-hidden="true"></i>
      <span>
        <strong className="font-extrabold uppercase">Ledger Tamper Detected:</strong>{' '}
        Record #{tamperedBlock ? `BLOCK-${String(tamperedBlock).padStart(4, '0')}` : 'UNKNOWN'} (Block #{tamperedBlock || '?'}) hash integrity mismatch! External anchors notified.
      </span>
      <button
        onClick={restoreChain}
        className="underline ml-2 text-rose-900 hover:text-black font-bold text-xs cursor-pointer focus-visible:ring-2 focus-visible:ring-rose-500 rounded px-1.5 py-0.5"
      >
        Restore Clean Chain
      </button>
    </div>
  );
}

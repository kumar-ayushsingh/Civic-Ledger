import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { useApp } from '../context/AppContext';

export default function TrackingPage() {
  const { token } = useParams();
  const { lang, setLang, textSize, setTextSize, highContrast, setHighContrast, t } = useApp();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [caseData, setCaseData] = useState(null);
  const [isReopening, setIsReopening] = useState(false);
  const [reopenSuccess, setReopenSuccess] = useState(false);

  const fetchCaseDetails = async () => {
    try {
      const res = await fetch(`/api/track/${token || 'CAS-8901'}`);
      if (!res.ok) {
        throw new Error('Case not found');
      }
      const data = await res.json();
      setCaseData(data);
      setLoading(false);
    } catch (err) {
      console.error('Failed to load tracking details:', err);
      setError(
        lang === 'hi'
          ? 'शिकायत विवरण लोड करने में असमर्थ। कृपया सही ट्रैकिंग लिंक जांचें।'
          : 'Unable to load case details. Please verify the tracking link.'
      );
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCaseDetails();
  }, [token]);

  const handleStillBroken = async () => {
    if (!caseData) return;
    setIsReopening(true);
    try {
      const res = await fetch(`/api/cases/${caseData.case_id}/reopen`, {
        method: 'POST',
      });
      const data = await res.json();
      setIsReopening(false);
      if (res.ok) {
        setReopenSuccess(true);
        fetchCaseDetails();
      } else {
        alert(data.detail || 'Failed to reopen case.');
      }
    } catch (err) {
      setIsReopening(false);
      alert('Network error while reopening case.');
    }
  };

  const currentUrl = typeof window !== 'undefined' ? window.location.href : '';

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="text-center space-y-3">
          <i className="fa-solid fa-circle-notch fa-spin text-sky-500 text-3xl"></i>
          <p className="text-sm font-bold text-slate-700">
            {lang === 'hi' ? 'ट्रैकिंग डेटा लोड हो रहा है...' : 'Loading tracking information...'}
          </p>
        </div>
      </div>
    );
  }

  if (error || !caseData) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-3xl p-6 border border-slate-200 text-center space-y-4 shadow-sm">
          <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto text-xl">
            <i className="fa-solid fa-triangle-exclamation"></i>
          </div>
          <h2 className="text-lg font-bold text-slate-900">
            {lang === 'hi' ? 'शिकायत नहीं मिली' : 'Case Not Found'}
          </h2>
          <p className="text-xs text-slate-600">{error}</p>
          <Link
            to="/app/ledger"
            className="inline-block px-6 py-3 rounded-full bg-sky-500 hover:bg-sky-600 text-white text-xs font-bold transition-colors"
          >
            {t('track.viewLedger')}
          </Link>
        </div>
      </div>
    );
  }

  const tl = caseData.timeline || {};
  const currentHolder = lang === 'hi' ? tl.current_holder_hi : tl.current_holder_en;
  const timeLeft = lang === 'hi' ? tl.time_left_hi : tl.time_left_en;

  const isReopened = caseData.status === 'Reopened';
  const isResolved = caseData.status === 'Resolved' || caseData.status === 'Closed';

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      {/* Slim Header with A11y Controls */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-xs px-3 sm:px-6 py-2.5">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-2">
          <Link to="/" className="flex items-center gap-2 group">
            <div className="w-8 h-8 rounded-full bg-sky-100 flex items-center justify-center text-sky-700 font-bold text-sm">
              <i className="fa-solid fa-layer-group"></i>
            </div>
            <span className="font-extrabold text-slate-900 text-sm sm:text-base">
              CivicLedger
            </span>
          </Link>

          {/* Controls: Language & Text Size */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            {/* Language Toggle */}
            <button
              onClick={() => setLang(lang === 'en' ? 'hi' : 'en')}
              className="px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 transition-colors"
              title="Toggle Language"
            >
              {lang === 'en' ? 'हिंदी' : 'English'}
            </button>

            {/* Text Size Switcher */}
            <div className="flex items-center bg-slate-100 rounded-full p-0.5 border border-slate-200">
              <button
                onClick={() => setTextSize('a')}
                className={`w-6 h-6 rounded-full text-[10px] font-semibold flex items-center justify-center ${
                  textSize === 'a' ? 'bg-white text-sky-700 shadow-xs' : 'text-slate-600'
                }`}
                title="A"
              >
                A
              </button>
              <button
                onClick={() => setTextSize('aplus')}
                className={`w-6 h-6 rounded-full text-[10px] font-bold flex items-center justify-center ${
                  textSize === 'aplus' ? 'bg-white text-sky-700 shadow-xs' : 'text-slate-600'
                }`}
                title="A+"
              >
                A+
              </button>
              <button
                onClick={() => setTextSize('aplusplus')}
                className={`w-6 h-6 rounded-full text-[10px] font-black flex items-center justify-center ${
                  textSize === 'aplusplus' ? 'bg-white text-sky-700 shadow-xs' : 'text-slate-600'
                }`}
                title="A++"
              >
                A++
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Tracking Content Container */}
      <main className="max-w-4xl mx-auto px-3 sm:px-6 py-6 space-y-6">
        {/* Reopen Alert Banner */}
        {reopenSuccess && (
          <div className="p-4 rounded-2xl bg-amber-50 border-2 border-amber-300 text-amber-950 flex items-start gap-3 shadow-sm animate-fade-in">
            <i className="fa-solid fa-triangle-exclamation text-amber-600 text-lg mt-0.5"></i>
            <div>
              <p className="font-bold text-xs sm:text-sm">{t('track.reopenedSuccess')}</p>
              <p className="text-xs text-amber-800 mt-0.5">
                Ledger event CASE_REOPENED recorded. Countdown timer resumed.
              </p>
            </div>
          </div>
        )}

        {/* Top Status & Case Banner */}
        <div className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-7 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  {t('track.caseId')}
                </span>
                <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-sky-100 text-sky-800 border border-sky-200">
                  {caseData.defect_type}
                </span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight mt-0.5">
                {caseData.case_id}
              </h1>
            </div>

            {/* Status & Severity Badges */}
            <div className="flex flex-wrap items-center gap-2">
              <span className={`px-3 py-1 rounded-full text-xs font-bold border ${
                isReopened
                  ? 'bg-amber-100 text-amber-900 border-amber-300'
                  : isResolved
                  ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                  : 'bg-sky-100 text-sky-900 border-sky-300'
              }`}>
                {caseData.status}
              </span>
              <span className="px-3 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-800 border border-slate-200">
                {caseData.severity} Priority
              </span>
            </div>
          </div>

          {/* Current Holder & Time Left Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-1">
              <span className="text-slate-400 uppercase font-bold text-[10px] tracking-wider">
                {t('track.currentHolder')}
              </span>
              <p className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                <i className="fa-solid fa-user-shield text-sky-600"></i>
                <span>{currentHolder || caseData.department_name}</span>
              </p>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-1">
              <span className="text-slate-400 uppercase font-bold text-[10px] tracking-wider">
                {t('track.timeLeft')}
              </span>
              <p className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                <i className="fa-regular fa-clock text-amber-600"></i>
                <span>{timeLeft || 'In Progress'}</span>
              </p>
            </div>
          </div>

          {/* Contractor Warranty Flag */}
          {caseData.contractor_liability && (
            <div className="p-3 rounded-2xl bg-amber-50/80 border border-amber-200 text-amber-900 text-xs flex items-center gap-2">
              <i className="fa-solid fa-shield-halved text-amber-600"></i>
              <span>
                <strong>Contractor Liability Active:</strong> Repair must be executed by {caseData.contractor_firm} under contractual defect liability.
              </span>
            </div>
          )}
        </div>

        {/* Before and After Photo Evidence Cards */}
        <div className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-7 shadow-xs space-y-4">
          <h2 className="text-base sm:text-lg font-bold text-slate-900">
            {lang === 'hi' ? 'फोटो साक्ष्य' : 'Photographic Evidence'}
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Before Photo */}
            <div className="space-y-2">
              <span className="text-xs font-bold text-slate-600 flex items-center gap-1.5">
                <i className="fa-solid fa-camera text-sky-600"></i>
                {t('track.beforePhoto')}
              </span>
              <div className="rounded-2xl overflow-hidden border border-slate-200 bg-slate-900 aspect-video flex items-center justify-center">
                {caseData.before_photo ? (
                  <img
                    src={`/${caseData.before_photo}`}
                    alt="Before defect"
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      // Fallback dummy view if image not on disk
                      e.target.style.display = 'none';
                    }}
                  />
                ) : (
                  <div className="text-center text-slate-400 p-4 space-y-1">
                    <i className="fa-solid fa-image text-2xl"></i>
                    <p className="text-xs">Original Citizen Photo</p>
                  </div>
                )}
              </div>
            </div>

            {/* After Photo */}
            <div className="space-y-2">
              <span className="text-xs font-bold text-slate-600 flex items-center gap-1.5">
                <i className="fa-solid fa-circle-check text-emerald-600"></i>
                {t('track.afterPhoto')}
              </span>
              <div className="rounded-2xl overflow-hidden border border-slate-200 bg-slate-50 aspect-video flex items-center justify-center p-4 text-center">
                {caseData.after_photo ? (
                  <img
                    src={`/${caseData.after_photo}`}
                    alt="After repair"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="space-y-1 text-slate-500">
                    <i className="fa-solid fa-hourglass-half text-2xl text-slate-400"></i>
                    <p className="text-xs font-semibold">{t('track.afterPhotoPending')}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* 7-Step Chronological Timeline */}
        <div className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-7 shadow-xs space-y-6">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h2 className="text-base sm:text-lg font-bold text-slate-900">
              {lang === 'hi' ? 'मरम्मत की प्रगति (समयरेखा)' : 'Repair Progress Timeline'}
            </h2>
            <span className="text-xs text-slate-500 font-medium">
              SHA-256 Ledger Backed
            </span>
          </div>

          <div className="relative pl-6 sm:pl-8 space-y-6 before:absolute before:left-3 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
            {tl.steps && tl.steps.map((st) => {
              const isDone = st.status === 'completed';
              const isCurrent = st.status === 'current';
              const name = lang === 'hi' ? st.name_hi : st.name_en;
              const desc = lang === 'hi' ? st.description_hi : st.description_en;
              const holder = lang === 'hi' ? st.holder_hi : st.holder_en;

              return (
                <div key={st.sequence} className="relative group">
                  {/* Step Dot Icon */}
                  <div className={`absolute -left-6 sm:-left-8 top-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shadow-xs ${
                    isDone
                      ? 'bg-emerald-500 text-white'
                      : isCurrent
                      ? 'bg-sky-500 text-white ring-4 ring-sky-100 animate-pulse'
                      : 'bg-slate-200 text-slate-500'
                  }`}>
                    {isDone ? (
                      <i className="fa-solid fa-check"></i>
                    ) : (
                      <span>{st.sequence}</span>
                    )}
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center justify-between flex-wrap gap-1">
                      <h3 className={`text-sm font-bold ${
                        isCurrent ? 'text-sky-700' : isDone ? 'text-slate-900' : 'text-slate-600'
                      }`}>
                        {name}
                      </h3>
                      {st.timestamp && (
                        <span className="text-[10px] text-slate-500 font-medium">
                          {new Date(st.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      {desc}
                    </p>
                    <p className="text-[11px] font-semibold text-slate-600">
                      Holder: <span className="text-slate-800">{holder}</span>
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Large One-Tap "Still Broken" Section */}
        <div className="rounded-3xl border-2 border-amber-300 bg-amber-50/70 p-6 sm:p-7 shadow-xs space-y-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-amber-500 text-white flex items-center justify-center text-sm font-bold">
              <i className="fa-solid fa-wrench"></i>
            </div>
            <h3 className="text-base font-bold text-amber-950">
              {t('track.stillBroken')}
            </h3>
          </div>

          <p className="text-xs text-amber-900 leading-relaxed">
            {t('track.stillBrokenDesc')}
          </p>

          <button
            onClick={handleStillBroken}
            disabled={isReopening || isReopened}
            className="w-full py-4 rounded-full bg-amber-600 hover:bg-amber-700 disabled:bg-amber-300 text-white font-black text-sm sm:text-base shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer min-h-[48px]"
          >
            {isReopening ? (
              <>
                <i className="fa-solid fa-circle-notch fa-spin"></i>
                <span>Reopening case...</span>
              </>
            ) : isReopened ? (
              <>
                <i className="fa-solid fa-circle-check"></i>
                <span>Already Reopened (Under Review)</span>
              </>
            ) : (
              <>
                <i className="fa-solid fa-arrow-rotate-left"></i>
                <span>{t('track.reopenBtn')}</span>
              </>
            )}
          </button>
        </div>

        {/* QR Code & Navigation Strip */}
        <div className="rounded-3xl border border-slate-200 bg-white p-5 text-center space-y-4">
          <div className="p-3 bg-slate-50 rounded-2xl inline-block border border-slate-200">
            <QRCodeSVG value={currentUrl} size={110} title="QR code for tracking this case" aria-label="QR code for tracking this case" />
          </div>
          <p className="text-[11px] text-slate-500 font-medium">
            {t('track.qrScan')}
          </p>

          <div className="flex flex-col sm:flex-row gap-2 justify-center pt-1">
            <Link
              to="/app/ledger"
              className="px-5 py-3 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold transition-colors"
            >
              <i className="fa-solid fa-layer-group mr-1.5"></i>
              {t('track.viewLedger')}
            </Link>
            <Link
              to="/app/report"
              className="px-5 py-3 rounded-full bg-sky-500 hover:bg-sky-600 text-white text-xs font-bold shadow-xs transition-colors"
            >
              <i className="fa-solid fa-plus mr-1.5"></i>
              Report Another Defect
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}

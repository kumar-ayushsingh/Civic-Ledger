import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';

export default function Header({ onLaunch, isLanding = false }) {
  const {
    lang,
    setLang,
    textSize,
    setTextSize,
    highContrast,
    setHighContrast,
    t,
    chainStatus,
    chainInfo,
    tamperedBlock,
    verifyLedgerChain,
  } = useApp();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  const handleLaunchClick = () => {
    if (onLaunch) {
      onLaunch();
    } else {
      navigate('/app/ledger');
    }
  };

  const navItems = [
    { key: 'overview', path: '/', label: t('nav.overview'), isOverview: true },
    { key: 'ledger', path: '/app/ledger', label: t('nav.ledger') },
    { key: 'report', path: '/app/report', label: t('nav.report') },
    { key: 'officer', path: '/app/officer', label: t('nav.officer') },
  ];

  const getVerifyButtonContent = () => {
    if (chainStatus === 'verifying') {
      return (
        <>
          <i className="fa-solid fa-circle-notch fa-spin text-sky-700 text-xs" aria-hidden="true"></i>
          <span>{t('nav.verifying')}</span>
        </>
      );
    }
    if (chainStatus === 'valid') {
      return (
        <>
          <i className="fa-solid fa-circle-check text-emerald-600 text-xs" aria-hidden="true"></i>
          <span>Chain valid, {chainInfo.checked} blocks</span>
        </>
      );
    }
    if (chainStatus === 'broken') {
      return (
        <>
          <i className="fa-solid fa-triangle-exclamation text-rose-600 text-xs" aria-hidden="true"></i>
          <span>Broken at block #{tamperedBlock}</span>
        </>
      );
    }
    return (
      <>
        <i className="fa-solid fa-link-slash text-sky-700 text-xs" aria-hidden="true"></i>
        <span>{t('nav.verifyChain')}</span>
      </>
    );
  };

  const getVerifyButtonClass = () => {
    if (chainStatus === 'broken') {
      return 'bg-rose-50 text-rose-800 border-rose-300 hover:bg-rose-100';
    }
    if (chainStatus === 'valid') {
      return 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100';
    }
    return 'bg-slate-100 hover:bg-sky-50 text-slate-800 hover:text-sky-800 border-slate-200';
  };

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-40 shadow-xs w-full overflow-hidden" role="banner">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 min-h-[56px] sm:min-h-[64px] flex items-center justify-between py-1.5 sm:py-2 gap-1 sm:gap-2">
        {/* Brand & Logo */}
        <Link
          to="/"
          className="flex items-center gap-2 sm:gap-3 group focus-visible:ring-2 focus-visible:ring-sky-500 rounded-xl p-0.5 sm:p-1 shrink-0"
        >
          <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-sky-100 flex items-center justify-center text-sky-700 font-bold text-base sm:text-xl border border-sky-200 shadow-sm group-hover:scale-105 transition-transform shrink-0">
            <i className="fa-solid fa-layer-group" aria-hidden="true"></i>
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-1.5 sm:gap-2">
              <span className="font-extrabold text-base sm:text-lg text-slate-900 tracking-tight leading-none group-hover:text-sky-700 transition-colors">
                {t('brand.name')}
              </span>
              <span className="hidden min-[480px]:inline-block text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-sky-100 text-sky-800 border border-sky-200">
                {t('brand.badge')}
              </span>
            </div>
            <span className="text-[11px] text-slate-600 font-medium hidden md:inline-block leading-tight">
              {t('brand.subtitle')}
            </span>
          </div>
        </Link>

        {/* View Switcher Tabs (Only shown in App mode, hidden on Landing) */}
        {!isLanding && (
          <nav
            className="hidden md:flex items-center bg-slate-100 p-1 rounded-full border border-slate-200"
            aria-label="Application tabs"
          >
            {navItems.map((item) => {
              const isActive = item.isOverview
                ? location.pathname === '/'
                : location.pathname.startsWith(item.path);
              return (
                <Link
                  key={item.key}
                  to={item.path}
                  className={`px-4 py-2 text-xs font-semibold rounded-full transition-all duration-200 flex items-center gap-2 min-h-[36px] ${
                    isActive
                      ? 'bg-white text-sky-700 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                  aria-current={isActive ? 'page' : undefined}
                >
                  <span
                    className={`w-2 h-2 rounded-full ${isActive ? 'bg-sky-500' : 'bg-slate-300'}`}
                    aria-hidden="true"
                  ></span>
                  {item.label}
                </Link>
              );
            })}
          </nav>
        )}

        {/* Right Controls: Ledger Verify, A11y & Actions */}
        <div className="flex items-center gap-1 sm:gap-2 shrink-0">
          {/* Verify Ledger Chain Button */}
          <button
            onClick={() => verifyLedgerChain()}
            disabled={chainStatus === 'verifying'}
            className={`flex items-center gap-1.5 px-3 py-1 sm:py-1.5 rounded-full text-[11px] sm:text-xs font-bold border transition-all shadow-xs min-h-[28px] sm:min-h-[36px] cursor-pointer ${getVerifyButtonClass()}`}
            title="Verify SHA-256 Ledger Chain Integrity"
            aria-label={chainStatus === 'broken' ? `Broken at block #${tamperedBlock}` : 'Verify Ledger Chain'}
          >
            {getVerifyButtonContent()}
          </button>

          {/* Text Size Switcher */}
          <div
            className="flex items-center bg-slate-100 rounded-full p-0.5 border border-slate-200"
            role="group"
            aria-label={t('a11y.textSize')}
          >
            <button
              onClick={() => setTextSize('a')}
              className={`w-6 h-6 sm:w-8 sm:h-8 rounded-full text-[11px] sm:text-xs font-semibold flex items-center justify-center transition-all ${
                textSize === 'a' ? 'bg-white text-sky-700 shadow-xs' : 'text-slate-700 hover:text-slate-950'
              }`}
              title={t('a11y.standardText')}
              aria-label="A - Standard text size"
              aria-pressed={textSize === 'a'}
            >
              A
            </button>
            <button
              onClick={() => setTextSize('aplus')}
              className={`w-6 h-6 sm:w-8 sm:h-8 rounded-full text-[11px] sm:text-xs font-bold flex items-center justify-center transition-all ${
                textSize === 'aplus' ? 'bg-white text-sky-700 shadow-xs' : 'text-slate-700 hover:text-slate-950'
              }`}
              title={t('a11y.largeText')}
              aria-label="A+ - Large text size"
              aria-pressed={textSize === 'aplus'}
            >
              A+
            </button>
            <button
              onClick={() => setTextSize('aplusplus')}
              className={`w-6 h-6 sm:w-8 sm:h-8 rounded-full text-[11px] sm:text-xs font-black flex items-center justify-center transition-all ${
                textSize === 'aplusplus' ? 'bg-white text-sky-700 shadow-xs' : 'text-slate-700 hover:text-slate-950'
              }`}
              title={t('a11y.extraLargeText')}
              aria-label="A++ - Extra large text size"
              aria-pressed={textSize === 'aplusplus'}
            >
              A++
            </button>
          </div>

          {/* High Contrast Toggle */}
          <button
            onClick={() => setHighContrast(!highContrast)}
            className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center border transition-all ${
              highContrast
                ? 'bg-slate-900 text-amber-300 border-slate-900 shadow-sm'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-800 border-slate-200'
            }`}
            title={t('a11y.toggleContrast')}
            aria-label={t('a11y.toggleContrast')}
            aria-pressed={highContrast}
          >
            <i className="fa-solid fa-circle-half-stroke text-xs sm:text-sm" aria-hidden="true"></i>
          </button>

          {/* Language Toggle */}
          <button
            onClick={() => setLang(lang === 'en' ? 'hi' : 'en')}
            className="flex items-center gap-1 bg-slate-100 hover:bg-sky-50 text-slate-800 hover:text-sky-800 px-2 sm:px-3 py-1 rounded-full text-[11px] sm:text-xs font-bold border border-slate-200 transition-all shadow-xs min-h-[28px] sm:min-h-[32px]"
            title={lang === 'en' ? 'Switch to Hindi (हिंदी)' : 'Switch to English'}
            aria-label={lang === 'en' ? 'हिं - Switch to Hindi' : 'EN - Switch to English'}
          >
            <i className="fa-solid fa-language text-sky-700 text-xs" aria-hidden="true"></i>
            <span>{lang === 'en' ? 'हिं' : 'EN'}</span>
          </button>

          {/* Launch Prototype CTA Button (Always present on header) */}
          <button
            onClick={handleLaunchClick}
            className="hidden sm:inline-flex items-center gap-2 bg-sky-700 hover:bg-sky-800 active:scale-95 text-white font-bold text-xs px-3.5 py-2 rounded-full shadow-sm hover:shadow-md transition-all min-h-[44px]"
            aria-label={t('nav.launch')}
          >
            <i className="fa-solid fa-rocket" aria-hidden="true"></i>
            <span>{t('nav.launch')}</span>
          </button>

          {/* Mobile hamburger button */}
          {!isLanding && (
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-700 border border-slate-200"
              aria-label="Toggle navigation menu"
              aria-expanded={mobileMenuOpen}
            >
              <i className={`fa-solid ${mobileMenuOpen ? 'fa-xmark' : 'fa-bars'}`} aria-hidden="true"></i>
            </button>
          )}
        </div>
      </div>

      {/* Mobile Menu Dropdown (App mode only) */}
      {!isLanding && mobileMenuOpen && (
        <div className="md:hidden border-t border-slate-200 bg-white px-4 py-3 space-y-2">
          {navItems.map((item) => (
            <Link
              key={item.key}
              to={item.path}
              onClick={() => setMobileMenuOpen(false)}
              className="block w-full text-left px-4 py-2.5 text-xs font-semibold rounded-full bg-slate-50 text-slate-700 hover:bg-sky-50 hover:text-sky-700 min-h-[44px] flex items-center"
            >
              {item.label}
            </Link>
          ))}
          <button
            onClick={() => {
              setMobileMenuOpen(false);
              handleLaunchClick();
            }}
            className="w-full mt-2 flex items-center justify-center gap-2 bg-sky-700 text-white font-bold text-xs px-4 py-2.5 rounded-full shadow-sm min-h-[44px]"
          >
            <i className="fa-solid fa-rocket" aria-hidden="true"></i>
            <span>{t('nav.launch')}</span>
          </button>
        </div>
      )}
    </header>
  );
}

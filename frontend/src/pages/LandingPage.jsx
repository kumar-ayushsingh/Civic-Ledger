import React from 'react';
import { useApp } from '../context/AppContext';

export default function LandingPage({ onLaunch }) {
  const { t } = useApp();

  const scrollToHowItWorks = () => {
    const el = document.getElementById('the-problem');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const approachSteps = [
    {
      num: 1,
      icon: 'fa-camera',
      title: t('approach.step1Title'),
      desc: t('approach.step1Desc'),
      color: 'bg-sky-50 text-sky-700 border-sky-200',
    },
    {
      num: 2,
      icon: 'fa-brain',
      title: t('approach.step2Title'),
      desc: t('approach.step2Desc'),
      color: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    },
    {
      num: 3,
      icon: 'fa-route',
      title: t('approach.step3Title'),
      desc: t('approach.step3Desc'),
      color: 'bg-purple-50 text-purple-700 border-purple-200',
    },
    {
      num: 4,
      icon: 'fa-hourglass-start',
      title: t('approach.step4Title'),
      desc: t('approach.step4Desc'),
      color: 'bg-amber-50 text-amber-700 border-amber-200',
    },
    {
      num: 5,
      icon: 'fa-arrow-trend-up',
      title: t('approach.step5Title'),
      desc: t('approach.step5Desc'),
      color: 'bg-rose-50 text-rose-700 border-rose-200',
    },
    {
      num: 6,
      icon: 'fa-link',
      title: t('approach.step6Title'),
      desc: t('approach.step6Desc'),
      color: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    },
  ];

  const pillars = [
    {
      num: 1,
      icon: 'fa-eye',
      title: t('pillars.p1Title'),
      desc: t('pillars.p1Desc'),
    },
    {
      num: 2,
      icon: 'fa-clock-rotate-left',
      title: t('pillars.p2Title'),
      desc: t('pillars.p2Desc'),
    },
    {
      num: 3,
      icon: 'fa-shield-halved',
      title: t('pillars.p3Title'),
      desc: t('pillars.p3Desc'),
    },
  ];

  const features = [
    {
      icon: 'fa-camera-retro',
      title: t('features.f1Title'),
      desc: t('features.f1Desc'),
      color: 'text-sky-700 bg-sky-50 border-sky-200',
    },
    {
      icon: 'fa-shield-heart',
      title: t('features.f2Title'),
      desc: t('features.f2Desc'),
      color: 'text-indigo-700 bg-indigo-50 border-indigo-200',
    },
    {
      icon: 'fa-language',
      title: t('features.f3Title'),
      desc: t('features.f3Desc'),
      color: 'text-emerald-700 bg-emerald-50 border-emerald-200',
    },
    {
      icon: 'fa-microphone',
      title: t('features.f4Title'),
      desc: t('features.f4Desc'),
      color: 'text-amber-700 bg-amber-50 border-amber-200',
    },
    {
      icon: 'fa-qrcode',
      title: t('features.f5Title'),
      desc: t('features.f5Desc'),
      color: 'text-purple-700 bg-purple-50 border-purple-200',
    },
    {
      icon: 'fa-stopwatch-20',
      title: t('features.f6Title'),
      desc: t('features.f6Desc'),
      color: 'text-rose-700 bg-rose-50 border-rose-200',
    },
    {
      icon: 'fa-circle-xmark',
      title: t('features.f7Title'),
      desc: t('features.f7Desc'),
      color: 'text-orange-700 bg-orange-50 border-orange-200',
    },
    {
      icon: 'fa-cubes-stacked',
      title: t('features.f8Title'),
      desc: t('features.f8Desc'),
      color: 'text-teal-700 bg-teal-50 border-teal-200',
    },
  ];

  const accessibilityItems = [
    {
      icon: 'fa-id-card-clip',
      title: t('builtForEveryone.item1Title'),
      desc: t('builtForEveryone.item1Desc'),
    },
    {
      icon: 'fa-hand-pointer',
      title: t('builtForEveryone.item2Title'),
      desc: t('builtForEveryone.item2Desc'),
    },
    {
      icon: 'fa-comments',
      title: t('builtForEveryone.item3Title'),
      desc: t('builtForEveryone.item3Desc'),
    },
    {
      icon: 'fa-bullhorn',
      title: t('builtForEveryone.item4Title'),
      desc: t('builtForEveryone.item4Desc'),
    },
    {
      icon: 'fa-magnifying-glass-plus',
      title: t('builtForEveryone.item5Title'),
      desc: t('builtForEveryone.item5Desc'),
    },
    {
      icon: 'fa-circle-half-stroke',
      title: t('builtForEveryone.item6Title'),
      desc: t('builtForEveryone.item6Desc'),
    },
  ];

  return (
    <div className="space-y-16 py-6 sm:py-8 w-full max-w-full overflow-x-hidden">
      {/* 1. HERO BANNER */}
      <section aria-labelledby="hero-title" className="px-1 sm:px-2">
        <div className="relative rounded-3xl bg-gradient-to-b from-sky-50 via-white to-slate-50 border border-sky-100/90 p-5 sm:p-12 overflow-hidden shadow-sm text-center max-w-4xl mx-auto space-y-6">
          {/* Decorative Circle Elements */}
          <div className="absolute -top-12 -right-12 w-40 h-40 rounded-full bg-sky-100/50 blur-2xl pointer-events-none"></div>
          <div className="absolute -bottom-12 -left-12 w-40 h-40 rounded-full bg-sky-200/40 blur-2xl pointer-events-none"></div>

          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white border border-sky-200 shadow-sm text-xs font-bold text-sky-800">
            <span className="w-2 h-2 rounded-full bg-sky-500 animate-pulse" aria-hidden="true"></span>
            <span>{t('hero.badge')}</span>
          </div>

          {/* Hero Heading */}
          <h1 id="hero-title" className="text-2xl sm:text-5xl font-extrabold text-slate-900 tracking-tight leading-tight">
            {t('hero.titleLine1')}<br />
            <span className="text-sky-700">{t('hero.titleLine2')}</span>
          </h1>

          {/* Subtitle / Pitch */}
          <p className="text-base sm:text-lg text-slate-700 max-w-2xl mx-auto leading-relaxed font-normal">
            {t('hero.description')}
          </p>

          {/* CTAs */}
          <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-4 pt-2">
            <button
              onClick={onLaunch}
              className="min-h-[48px] px-6 sm:px-8 py-3.5 rounded-full bg-sky-700 hover:bg-sky-800 active:scale-95 text-white font-extrabold text-sm sm:text-base shadow-md hover:shadow-lg transition-all flex items-center gap-2.5 sm:gap-3 cursor-pointer"
              aria-label={t('hero.launchBtn')}
            >
              <span>{t('hero.launchBtn')}</span>
              <i className="fa-solid fa-arrow-right" aria-hidden="true"></i>
            </button>
            <button
              onClick={scrollToHowItWorks}
              className="min-h-[48px] px-5 sm:px-6 py-3.5 rounded-full bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 font-bold text-sm sm:text-base shadow-xs hover:border-slate-400 transition-all flex items-center gap-2.5 cursor-pointer"
              aria-label={t('hero.seeHowBtn')}
            >
              <i className="fa-solid fa-circle-info text-sky-600" aria-hidden="true"></i>
              <span>{t('hero.seeHowBtn')}</span>
            </button>
          </div>

          {/* Circular Pills Feature Badges */}
          <div className="pt-6 flex flex-wrap items-center justify-center gap-2 sm:gap-2.5 border-t border-slate-100">
            <span className="px-3 py-1.5 rounded-full bg-white border border-slate-200 text-xs font-semibold text-slate-800 flex items-center gap-2 shadow-xs">
              <span className="w-2 h-2 rounded-full bg-emerald-600" aria-hidden="true"></span>
              {t('hero.pill1')}
            </span>
            <span className="px-3 py-1.5 rounded-full bg-white border border-slate-200 text-xs font-semibold text-slate-800 flex items-center gap-2 shadow-xs">
              <span className="w-2 h-2 rounded-full bg-sky-600" aria-hidden="true"></span>
              {t('hero.pill2')}
            </span>
            <span className="px-3 py-1.5 rounded-full bg-white border border-slate-200 text-xs font-semibold text-slate-800 flex items-center gap-2 shadow-xs">
              <span className="w-2 h-2 rounded-full bg-amber-600" aria-hidden="true"></span>
              {t('hero.pill3')}
            </span>
          </div>
        </div>
      </section>

      {/* 2. THE PROBLEM SECTION */}
      <section id="the-problem" aria-labelledby="problem-heading" className="max-w-5xl mx-auto px-2 sm:px-4 scroll-mt-20">
        <div className="text-center space-y-2 mb-8">
          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-rose-50 border border-rose-200 text-xs font-bold text-rose-800 uppercase tracking-wider">
            <i className="fa-solid fa-triangle-exclamation" aria-hidden="true"></i>
            {t('problem.tag')}
          </div>
          <h2 id="problem-heading" className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            {t('problem.title')}
          </h2>
          <p className="text-sm sm:text-base text-slate-600 max-w-xl mx-auto">
            {t('problem.subtitle')}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Card 1: MoRTH Total Road Accident Deaths */}
          <div className="bg-white p-6 sm:p-7 rounded-3xl border border-slate-200 shadow-sm space-y-3 hover:border-rose-300 transition-all flex flex-col justify-between">
            <div className="space-y-3">
              <div className="w-12 h-12 rounded-full bg-rose-50 text-rose-700 flex items-center justify-center text-xl font-bold border border-rose-200">
                <i className="fa-solid fa-person-falling-burst" aria-hidden="true"></i>
              </div>
              <div className="text-3xl sm:text-4xl font-black text-rose-700 tracking-tight">
                {t('problem.card1Stat')}
              </div>
              <h3 className="font-bold text-slate-900 text-base">
                {t('problem.card1Label')}
              </h3>
              <p className="text-sm text-slate-700 leading-relaxed">
                {t('problem.card1Desc')}
              </p>
            </div>
            <div className="pt-3 border-t border-slate-100 text-[11px] font-semibold text-slate-600">
              MoRTH Official 2022 Statistics
            </div>
          </div>

          {/* Card 2: Pothole Deaths 2022 vs 2021 */}
          <div className="bg-white p-6 sm:p-7 rounded-3xl border border-slate-200 shadow-sm space-y-3 hover:border-amber-300 transition-all flex flex-col justify-between">
            <div className="space-y-3">
              <div className="w-12 h-12 rounded-full bg-amber-50 text-amber-700 flex items-center justify-center text-xl font-bold border border-amber-200">
                <i className="fa-solid fa-road-spikes" aria-hidden="true"></i>
              </div>
              <div className="text-3xl sm:text-4xl font-black text-amber-700 tracking-tight">
                {t('problem.card2Stat')}
              </div>
              <h3 className="font-bold text-slate-900 text-base">
                {t('problem.card2Label')}
              </h3>
              <p className="text-sm text-slate-700 leading-relaxed">
                {t('problem.card2Desc')}
              </p>
            </div>
            <div className="pt-3 border-t border-slate-100 text-[11px] font-semibold text-slate-600">
              1,481 (2021) ➔ 1,856 (2022)
            </div>
          </div>

          {/* Card 3: Complaints Closed on Paper */}
          <div className="bg-white p-6 sm:p-7 rounded-3xl border border-slate-200 shadow-sm space-y-3 hover:border-sky-300 transition-all flex flex-col justify-between">
            <div className="space-y-3">
              <div className="w-12 h-12 rounded-full bg-sky-50 text-sky-700 flex items-center justify-center text-xl font-bold border border-sky-200">
                <i className="fa-solid fa-file-circle-xmark" aria-hidden="true"></i>
              </div>
              <div className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
                {t('problem.card3Stat')}
              </div>
              <h3 className="font-bold text-slate-900 text-base">
                {t('problem.card3Label')}
              </h3>
              <p className="text-sm text-slate-700 leading-relaxed">
                {t('problem.card3Desc')}
              </p>
            </div>
            <div className="pt-3 border-t border-slate-100 text-[11px] font-semibold text-slate-600">
              Zero Physical Verification Check
            </div>
          </div>
        </div>

        {/* Sources line */}
        <div className="mt-4 text-center">
          <p className="text-xs text-slate-700 font-medium inline-block bg-slate-100 px-4 py-1.5 rounded-full border border-slate-200">
            <i className="fa-solid fa-book-open me-1.5 text-slate-600" aria-hidden="true"></i>
            {t('problem.sources')}
          </p>
        </div>
      </section>

      {/* 3. OUR APPROACH SECTION (6-step horizontal flow) */}
      <section id="our-approach" aria-labelledby="approach-heading" className="max-w-6xl mx-auto px-2 sm:px-4 scroll-mt-20">
        <div className="text-center space-y-2 mb-10">
          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-sky-50 border border-sky-200 text-xs font-bold text-sky-800 uppercase tracking-wider">
            <i className="fa-solid fa-stairs" aria-hidden="true"></i>
            {t('approach.tag')}
          </div>
          <h2 id="approach-heading" className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            {t('approach.title')}
          </h2>
          <p className="text-sm sm:text-base text-slate-600 max-w-xl mx-auto">
            {t('approach.subtitle')}
          </p>
        </div>

        {/* 6-step flow cards reusing reference pillar card style */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {approachSteps.map((step) => (
            <div
              key={step.num}
              className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-4 hover:border-sky-300 hover:shadow-md transition-all relative flex flex-col justify-between"
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center text-xl font-bold border shadow-xs ${step.color}`}>
                    <i className={`fa-solid ${step.icon}`} aria-hidden="true"></i>
                  </div>
                  <span className="w-8 h-8 rounded-full bg-slate-100 border border-slate-200 text-slate-800 font-black text-sm flex items-center justify-center shadow-xs">
                    {step.num}
                  </span>
                </div>
                <h3 className="font-bold text-slate-900 text-base sm:text-lg">
                  {step.title}
                </h3>
                <p className="text-sm text-slate-700 leading-relaxed">
                  {step.desc}
                </p>
              </div>
              <div className="pt-2 flex items-center gap-1.5 text-xs font-bold text-sky-700">
                <span>Step {step.num} of 6</span>
                <i className="fa-solid fa-angle-right text-[10px]" aria-hidden="true"></i>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 4. THREE CORE INNOVATION PILLARS (Exact from reference) */}
      <section aria-labelledby="pillars-heading" className="max-w-5xl mx-auto px-2 sm:px-4">
        <div className="text-center space-y-2 mb-8">
          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-xs font-bold text-emerald-800 uppercase tracking-wider">
            <i className="fa-solid fa-shapes" aria-hidden="true"></i>
            {t('pillars.tag')}
          </div>
          <h2 id="pillars-heading" className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            {t('pillars.title')}
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {pillars.map((pillar) => (
            <div
              key={pillar.num}
              className="bg-white p-6 sm:p-7 rounded-3xl border border-slate-200 shadow-sm space-y-3 hover:border-sky-300 transition-all flex flex-col justify-between"
            >
              <div className="space-y-3">
                <div className="w-12 h-12 rounded-full bg-sky-50 text-sky-700 flex items-center justify-center text-xl font-bold border border-sky-200">
                  <i className={`fa-solid ${pillar.icon}`} aria-hidden="true"></i>
                </div>
                <h3 className="font-bold text-slate-900 text-base">
                  {pillar.title}
                </h3>
                <p className="text-sm text-slate-700 leading-relaxed">
                  {pillar.desc}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 5. PROTOTYPE FEATURES (8 Cards Grid) */}
      <section aria-labelledby="features-heading" className="max-w-6xl mx-auto px-2 sm:px-4">
        <div className="text-center space-y-2 mb-10">
          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-indigo-50 border border-indigo-200 text-xs font-bold text-indigo-800 uppercase tracking-wider">
            <i className="fa-solid fa-microchip" aria-hidden="true"></i>
            {t('features.tag')}
          </div>
          <h2 id="features-heading" className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            {t('features.title')}
          </h2>
          <p className="text-sm sm:text-base text-slate-600 max-w-xl mx-auto">
            {t('features.subtitle')}
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {features.map((feat, idx) => (
            <div
              key={idx}
              className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-3 hover:border-sky-300 hover:shadow-md transition-all flex flex-col justify-between"
            >
              <div className="space-y-3">
                <div className={`w-11 h-11 rounded-2xl flex items-center justify-center text-lg border ${feat.color}`}>
                  <i className={`fa-solid ${feat.icon}`} aria-hidden="true"></i>
                </div>
                <h3 className="font-bold text-slate-900 text-base">
                  {feat.title}
                </h3>
                <p className="text-xs sm:text-sm text-slate-700 leading-relaxed">
                  {feat.desc}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 6. BUILT FOR EVERYONE STRIP */}
      <section aria-labelledby="everyone-heading" className="max-w-6xl mx-auto px-2 sm:px-4">
        <div className="bg-gradient-to-r from-sky-50 via-white to-sky-50/50 rounded-3xl border border-sky-100 p-5 sm:p-10 shadow-sm space-y-8">
          <div className="text-center space-y-2">
            <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-white border border-sky-200 text-xs font-bold text-sky-800 uppercase tracking-wider shadow-xs">
              <i className="fa-solid fa-universal-access" aria-hidden="true"></i>
              {t('builtForEveryone.tag')}
            </div>
            <h2 id="everyone-heading" className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
              {t('builtForEveryone.title')}
            </h2>
            <p className="text-sm sm:text-base text-slate-600 max-w-lg mx-auto">
              {t('builtForEveryone.subtitle')}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
            {accessibilityItems.map((item, idx) => (
              <div
                key={idx}
                className="bg-white/95 backdrop-blur-xs p-5 rounded-2xl border border-slate-200 shadow-xs flex items-start gap-4 hover:border-sky-300 transition-all"
              >
                <div className="w-10 h-10 rounded-full bg-sky-100 text-sky-700 flex items-center justify-center text-lg font-bold shrink-0 border border-sky-200">
                  <i className={`fa-solid ${item.icon}`} aria-hidden="true"></i>
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm sm:text-base">
                    {item.title}
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-700 leading-relaxed mt-0.5">
                    {item.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 7. HOW TO EXPLORE THIS DEMO (3 Steps + Banner) */}
      <section id="how-to-explore" aria-labelledby="howto-heading" className="max-w-5xl mx-auto px-2 sm:px-4">
        <div className="text-center space-y-2 mb-8">
          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-amber-50 border border-amber-200 text-xs font-bold text-amber-800 uppercase tracking-wider">
            <i className="fa-solid fa-compass" aria-hidden="true"></i>
            {t('howTo.tag')}
          </div>
          <h2 id="howto-heading" className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            {t('howTo.title')}
          </h2>

          {/* Visible Banner: Prototype uses simulated data */}
          <div className="pt-2">
            <div className="inline-flex items-center gap-2.5 px-4 py-2 rounded-full bg-amber-100 border border-amber-300 text-amber-900 text-xs sm:text-sm font-bold shadow-xs">
              <i className="fa-solid fa-database text-amber-700" aria-hidden="true"></i>
              <span>{t('howTo.banner')}</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Step 1 */}
          <div className="bg-white p-6 sm:p-7 rounded-3xl border border-slate-200 shadow-sm space-y-3 hover:border-sky-300 transition-all flex flex-col justify-between">
            <div className="space-y-3">
              <div className="w-12 h-12 rounded-full bg-sky-50 text-sky-700 flex items-center justify-center text-xl font-black border border-sky-200">
                1
              </div>
              <h3 className="font-bold text-slate-900 text-base sm:text-lg">
                {t('howTo.step1Title')}
              </h3>
              <p className="text-sm text-slate-700 leading-relaxed">
                {t('howTo.step1Desc')}
              </p>
            </div>
            <button
              onClick={onLaunch}
              className="mt-4 text-xs font-bold text-sky-700 hover:text-sky-800 flex items-center gap-1.5 cursor-pointer"
            >
              <span>{t('nav.launch')}</span>
              <i className="fa-solid fa-arrow-right" aria-hidden="true"></i>
            </button>
          </div>

          {/* Step 2 */}
          <div className="bg-white p-6 sm:p-7 rounded-3xl border border-slate-200 shadow-sm space-y-3 hover:border-sky-300 transition-all flex flex-col justify-between">
            <div className="space-y-3">
              <div className="w-12 h-12 rounded-full bg-indigo-50 text-indigo-700 flex items-center justify-center text-xl font-black border border-indigo-200">
                2
              </div>
              <h3 className="font-bold text-slate-900 text-base sm:text-lg">
                {t('howTo.step2Title')}
              </h3>
              <p className="text-sm text-slate-700 leading-relaxed">
                {t('howTo.step2Desc')}
              </p>
            </div>
            <div className="mt-4 text-xs font-semibold text-slate-600">
              Ward 14 Infrastructure Map & Feed
            </div>
          </div>

          {/* Step 3 */}
          <div className="bg-white p-6 sm:p-7 rounded-3xl border border-slate-200 shadow-sm space-y-3 hover:border-sky-300 transition-all flex flex-col justify-between">
            <div className="space-y-3">
              <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-700 flex items-center justify-center text-xl font-black border border-emerald-200">
                3
              </div>
              <h3 className="font-bold text-slate-900 text-base sm:text-lg">
                {t('howTo.step3Title')}
              </h3>
              <p className="text-sm text-slate-700 leading-relaxed">
                {t('howTo.step3Desc')}
              </p>
            </div>
            <div className="mt-4 text-xs font-semibold text-slate-600">
              Live Hash Chain & Tamper Alerts
            </div>
          </div>
        </div>
      </section>

      {/* 8. FINAL CALL TO ACTION */}
      <section aria-labelledby="cta-heading" className="max-w-4xl mx-auto px-2 sm:px-4">
        <div className="rounded-3xl bg-gradient-to-r from-sky-600 to-sky-700 text-white p-7 sm:p-12 text-center space-y-6 shadow-lg relative overflow-hidden">
          <div className="space-y-2">
            <h2 id="cta-heading" className="text-2xl sm:text-4xl font-extrabold tracking-tight">
              {t('cta.title')}
            </h2>
            <p className="text-sky-50 text-sm sm:text-base max-w-xl mx-auto leading-relaxed">
              {t('cta.subtitle')}
            </p>
          </div>

          <div className="pt-2">
            <button
              onClick={onLaunch}
              className="min-h-[48px] px-8 py-4 rounded-full bg-white hover:bg-sky-50 text-sky-800 font-extrabold text-sm sm:text-base shadow-md hover:shadow-xl active:scale-95 transition-all inline-flex items-center gap-3 cursor-pointer"
              aria-label={t('cta.btn')}
            >
              <i className="fa-solid fa-rocket text-sky-700" aria-hidden="true"></i>
              <span>{t('cta.btn')}</span>
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

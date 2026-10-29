import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../context/AppContext';

// ----------------------------------------------------------------------------
// Client-Side Cryptographic Hashing (Web Crypto API SHA-256)
// ----------------------------------------------------------------------------
export async function verifyEventHashClientSide(eventItem) {
  try {
    let payload = eventItem.payload;
    if (typeof payload === 'string') {
      try {
        payload = JSON.parse(payload);
      } catch (e) {
        // payload remains string
      }
    }

    const eventDict = {
      actor_role: String(eventItem.actor_role),
      case_id: String(eventItem.case_id || ''),
      event_type: String(eventItem.event_type),
      evidence_hash: String(eventItem.evidence_hash || ''),
      payload: payload,
      sequence: Number(eventItem.sequence),
      timestamp: String(eventItem.timestamp),
    };

    function canonicalStringify(obj) {
      if (obj === null || typeof obj !== 'object') {
        return JSON.stringify(obj);
      }
      if (Array.isArray(obj)) {
        return '[' + obj.map(canonicalStringify).join(',') + ']';
      }
      const sortedKeys = Object.keys(obj).sort();
      const parts = sortedKeys.map((k) => JSON.stringify(k) + ':' + canonicalStringify(obj[k]));
      return '{' + parts.join(',') + '}';
    }

    const canonicalStr = canonicalStringify(eventDict);
    const combined = (eventItem.prev_hash || '') + canonicalStr;
    const msgUint8 = new TextEncoder().encode(combined);
    const hashBuffer = await window.crypto.subtle.digest('SHA-256', msgUint8);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const computedHash = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
    const isValid = computedHash.toLowerCase() === (eventItem.own_hash || '').toLowerCase();

    return {
      isValid,
      computedHash,
      storedHash: eventItem.own_hash,
      canonicalStr,
    };
  } catch (err) {
    return {
      isValid: false,
      error: err.message,
    };
  }
}

// ----------------------------------------------------------------------------
// Convert Latitude & Longitude to Map Container X/Y Percentages
// ----------------------------------------------------------------------------
function latLonToMapXY(lat, lon) {
  // Ward bounding box for Faridabad prototype:
  // Lat range: 28.388 to 28.435
  // Lon range: 77.290 to 77.345
  const minLat = 28.388;
  const maxLat = 28.435;
  const minLon = 77.290;
  const maxLon = 77.345;

  const validLat = typeof lat === 'number' && !isNaN(lat) ? lat : 28.4089;
  const validLon = typeof lon === 'number' && !isNaN(lon) ? lon : 77.3178;

  const normX = (validLon - minLon) / (maxLon - minLon);
  const normY = (validLat - minLat) / (maxLat - minLat);

  // Invert Y because latitude grows northwards, while SVG coordinates grow downwards
  const x = Math.max(8, Math.min(92, normX * 80 + 10));
  const y = Math.max(12, Math.min(88, (1 - normY) * 75 + 12));

  return { x: Number(x.toFixed(1)), y: Number(y.toFixed(1)) };
}

export default function PublicDashboardPage() {
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

  const language = lang;

  // 1. Data States
  const [cases, setCases] = useState([]);
  const [scorecards, setScorecards] = useState([]);
  const [ledgerEvents, setLedgerEvents] = useState([]);
  const [anchors, setAnchors] = useState([]);
  const [clockInfo, setClockInfo] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  // 2. Filter & Selection States
  const [currentFilter, setCurrentFilter] = useState('all'); // 'all' | 'Pothole' | 'Garbage' | 'Waterlogging' | 'Escalated'
  const [selectedCaseId, setSelectedCaseId] = useState(null);

  // 3. Ledger Explorer Drawer States
  const [explorerCaseId, setExplorerCaseId] = useState(null);
  const [explorerEvents, setExplorerEvents] = useState([]);
  const [explorerVerification, setExplorerVerification] = useState({});
  const [isLoadingExplorer, setIsLoadingExplorer] = useState(false);

  // 4. Anchor Creation State
  const [isCreatingAnchor, setIsCreatingAnchor] = useState(false);
  const [anchorToast, setAnchorToast] = useState(null);

  // --------------------------------------------------------------------------
  // Fetch Functions
  // --------------------------------------------------------------------------
  const fetchCases = async () => {
    try {
      const res = await fetch('/api/cases');
      if (res.ok) {
        const data = await res.json();
        setCases(data.cases || []);
      }
    } catch (err) {
      console.error('Failed to fetch cases:', err);
    }
  };

  const fetchScorecards = async () => {
    try {
      const res = await fetch('/api/scorecards');
      if (res.ok) {
        const data = await res.json();
        setScorecards(data.scorecards || []);
      }
    } catch (err) {
      console.error('Failed to fetch scorecards:', err);
    }
  };

  const fetchLedgerStream = async () => {
    try {
      const res = await fetch('/api/ledger?limit=15&order=desc');
      if (res.ok) {
        const data = await res.json();
        setLedgerEvents(data.events || []);
      }
    } catch (err) {
      console.error('Failed to fetch ledger stream:', err);
    }
  };

  const fetchAnchors = async () => {
    try {
      const res = await fetch('/api/anchors');
      if (res.ok) {
        const data = await res.json();
        setAnchors(data.anchors || []);
      }
    } catch (err) {
      console.error('Failed to fetch anchors:', err);
    }
  };

  const fetchClock = async () => {
    try {
      const res = await fetch('/api/clock');
      if (res.ok) {
        const data = await res.json();
        setClockInfo(data);
      }
    } catch (err) {
      console.error('Failed to fetch clock:', err);
    }
  };

  // Initial load
  useEffect(() => {
    const loadAll = async () => {
      setIsLoading(true);
      await Promise.all([
        fetchCases(),
        fetchScorecards(),
        fetchLedgerStream(),
        fetchAnchors(),
        fetchClock(),
      ]);
      setIsLoading(false);
    };
    loadAll();
  }, []);

  // Polling: Poll cases & ledger stream every 3 seconds
  // Ensures new reports and fast-forward auto-escalations reflect on map and feed within seconds!
  useEffect(() => {
    const interval = setInterval(() => {
      fetchCases();
      fetchLedgerStream();
      fetchScorecards();
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  // --------------------------------------------------------------------------
  // Open Case Ledger Explorer Drawer
  // --------------------------------------------------------------------------
  const openLedgerExplorer = async (caseId) => {
    setExplorerCaseId(caseId);
    setIsLoadingExplorer(true);
    try {
      const url = caseId ? `/api/ledger?case_id=${caseId}&order=asc` : `/api/ledger?limit=20&order=desc`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        const evs = data.events || [];
        setExplorerEvents(evs);

        // Run client-side SHA-256 verification in parallel for each event
        const verificationMap = {};
        for (const ev of evs) {
          verificationMap[ev.sequence] = await verifyEventHashClientSide(ev);
        }
        setExplorerVerification(verificationMap);
      }
    } catch (err) {
      console.error('Failed to fetch explorer events:', err);
    } finally {
      setIsLoadingExplorer(false);
    }
  };

  const closeLedgerExplorer = () => {
    setExplorerCaseId(null);
    setExplorerEvents([]);
    setExplorerVerification({});
  };

  // --------------------------------------------------------------------------
  // Create External Witness Anchor
  // --------------------------------------------------------------------------
  const handleCreateAnchor = async () => {
    setIsCreatingAnchor(true);
    try {
      const res = await fetch('/api/ledger/anchor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: 'Manual witness checkpoint generated from Public Dashboard' }),
      });
      if (res.ok) {
        const data = await res.json();
        setAnchorToast(`Witness Anchor #${data.id} published to sequence #${data.sequence}`);
        setTimeout(() => setAnchorToast(null), 4000);
        await fetchAnchors();
      }
    } catch (err) {
      console.error('Failed to create anchor:', err);
    } finally {
      setIsCreatingAnchor(false);
    }
  };

  // --------------------------------------------------------------------------
  // Metrics Computation
  // --------------------------------------------------------------------------
  const totalCases = cases.length;
  const activeCasesCount = cases.filter((c) => !['Resolved', 'Closed'].includes(c.status)).length;
  const resolvedCasesCount = cases.filter((c) => ['Resolved', 'Closed'].includes(c.status)).length;

  const escalatedCasesCount = cases.filter(
    (c) =>
      c.status?.includes('Escalated') ||
      c.current_escalation_level === 'L2' ||
      c.current_escalation_level === 'L3'
  ).length;

  const escalationRateStr =
    totalCases > 0 ? ((escalatedCasesCount / totalCases) * 100).toFixed(1) + '%' : '8.2%';

  // Average resolution time from scorecards or 1.8 Days default
  let avgResolveDays = '1.8 Days';
  if (scorecards.length > 0) {
    const validScores = scorecards.filter((s) => s.median_resolve_days > 0);
    if (validScores.length > 0) {
      const avg =
        validScores.reduce((acc, curr) => acc + curr.median_resolve_days, 0) / validScores.length;
      avgResolveDays = `${avg.toFixed(1)} Days`;
    }
  }

  // --------------------------------------------------------------------------
  // Filtering Cases
  // --------------------------------------------------------------------------
  const filteredCases = cases.filter((item) => {
    if (currentFilter === 'all') return true;
    if (currentFilter === 'Escalated') {
      return (
        item.status?.includes('Escalated') ||
        item.current_escalation_level === 'L2' ||
        item.current_escalation_level === 'L3'
      );
    }
    return item.defect_type?.toLowerCase() === currentFilter.toLowerCase();
  });

  const selectedCaseObj = cases.find((c) => c.id === selectedCaseId);

  // --------------------------------------------------------------------------
  // Render Pin Handler
  // --------------------------------------------------------------------------
  const handlePinClick = (caseItem) => {
    setSelectedCaseId(caseItem.id);
    const el = document.getElementById(`feed-case-${caseItem.id}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  return (
    <div className="space-y-6">
      {/* ================= SIMULATED DATA NOTICE & FAST STATUS ================= */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-white p-3.5 sm:px-5 sm:py-3 rounded-2xl border border-slate-200 shadow-xs">
        <div className="flex items-center gap-2.5">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
          <span className="text-xs font-bold text-slate-800">
            {t('dashboard.title')}
          </span>
          <span className="hidden md:inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
            <i className="fa-solid fa-flask"></i> {t('dashboard.simulatedBadge')}
          </span>
        </div>

        <div className="flex items-center gap-3 text-xs text-slate-500">
          <span>
            <strong>3 Wards</strong> (Ward 14, 15, 16) • <strong>{totalCases || 30} Cases</strong>
          </span>
          <span className="text-slate-300">|</span>
          <span className="text-sky-600 font-semibold flex items-center gap-1">
            <i className="fa-solid fa-link"></i> {chainInfo.checked || 120}+ Blocks
          </span>
        </div>
      </div>

      {/* ================= 1. METRICS SUMMARY ROW ================= */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Active Complaints */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              {t('dashboard.activeComplaints')}
            </p>
            <p className="text-2xl font-black text-slate-800 mt-1" id="stat-active">
              {activeCasesCount}
            </p>
            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-sky-600 mt-1">
              <i className="fa-solid fa-clock"></i> {t('dashboard.slaTracked')}
            </span>
          </div>
          <div className="w-12 h-12 rounded-full bg-sky-50 border border-sky-100 flex items-center justify-center text-sky-500 text-lg shrink-0">
            <i className="fa-solid fa-list-check"></i>
          </div>
        </div>

        {/* Card 2: Avg Resolution Time */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              {t('dashboard.avgResolution')}
            </p>
            <p className="text-2xl font-black text-slate-800 mt-1">
              {avgResolveDays}
            </p>
            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 mt-1">
              <i className="fa-solid fa-arrow-down"></i> {t('dashboard.withinSla')}
            </span>
          </div>
          <div className="w-12 h-12 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-500 text-lg shrink-0">
            <i className="fa-solid fa-stopwatch"></i>
          </div>
        </div>

        {/* Card 3: Escalation Rate */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              {t('dashboard.escalationRate')}
            </p>
            <p className="text-2xl font-black text-slate-800 mt-1">
              {escalationRateStr}
            </p>
            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-600 mt-1">
              <i className="fa-solid fa-circle-exclamation"></i> {t('dashboard.autoReassigned')}
            </span>
          </div>
          <div className="w-12 h-12 rounded-full bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-500 text-lg shrink-0">
            <i className="fa-solid fa-diagram-next"></i>
          </div>
        </div>

        {/* Card 4: Verified Closures */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              {t('dashboard.verifiedClosures')}
            </p>
            <p className="text-2xl font-black text-slate-800 mt-1" id="stat-verified">
              {resolvedCasesCount}
            </p>
            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-sky-600 mt-1">
              <i className="fa-solid fa-shield-check"></i> {t('dashboard.aiRechecked')}
            </span>
          </div>
          <div className="w-12 h-12 rounded-full bg-sky-50 border border-sky-100 flex items-center justify-center text-sky-600 text-lg shrink-0">
            <i className="fa-solid fa-circle-check"></i>
          </div>
        </div>
      </div>

      {/* ================= 2. CIRCULAR TAG FILTERS BAR ================= */}
      <div className="bg-white p-3 rounded-full border border-slate-200/90 shadow-xs flex items-center justify-between overflow-x-auto gap-2">
        <div className="flex items-center gap-2 min-w-max px-2">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider mr-2 flex items-center gap-1.5">
            <i className="fa-solid fa-filter text-slate-300"></i> {t('dashboard.filters')}
          </span>

          {/* Filter: All Cases */}
          <button
            onClick={() => setCurrentFilter('all')}
            id="filter-all"
            className={`filter-btn px-4 py-1.5 rounded-full text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              currentFilter === 'all'
                ? 'bg-sky-500 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                currentFilter === 'all' ? 'bg-white' : 'bg-slate-400'
              }`}
            ></span>
            {t('dashboard.filterAll')}
          </button>

          {/* Filter: Potholes */}
          <button
            onClick={() => setCurrentFilter('Pothole')}
            id="filter-pothole"
            className={`filter-btn px-4 py-1.5 rounded-full text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              currentFilter === 'Pothole'
                ? 'bg-sky-500 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                currentFilter === 'Pothole' ? 'bg-white' : 'bg-slate-400'
              }`}
            ></span>
            {t('dashboard.filterPothole')}
          </button>

          {/* Filter: Garbage Dumps */}
          <button
            onClick={() => setCurrentFilter('Garbage')}
            id="filter-garbage"
            className={`filter-btn px-4 py-1.5 rounded-full text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              currentFilter === 'Garbage'
                ? 'bg-sky-500 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                currentFilter === 'Garbage' ? 'bg-white' : 'bg-slate-400'
              }`}
            ></span>
            {t('dashboard.filterGarbage')}
          </button>

          {/* Filter: Waterlogging */}
          <button
            onClick={() => setCurrentFilter('Waterlogging')}
            id="filter-water"
            className={`filter-btn px-4 py-1.5 rounded-full text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              currentFilter === 'Waterlogging'
                ? 'bg-sky-500 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                currentFilter === 'Waterlogging' ? 'bg-white' : 'bg-slate-400'
              }`}
            ></span>
            {t('dashboard.filterWater')}
          </button>

          {/* Filter: Escalated Only */}
          <button
            onClick={() => setCurrentFilter('Escalated')}
            id="filter-escalated"
            className={`filter-btn px-4 py-1.5 rounded-full text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              currentFilter === 'Escalated'
                ? 'bg-amber-500 text-white shadow-xs'
                : 'bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100'
            }`}
          >
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400 pulse-circle"></span>
            {t('dashboard.filterEscalated')}
          </button>
        </div>

        {/* Simulate Audit Tamper Shortcut */}
        <div className="px-2 hidden sm:block shrink-0">
          <button
            onClick={() => simulateTamper(5)}
            title="Directly corrupts block #5 in database to test audit detection"
            className="text-xs font-bold text-slate-400 hover:text-rose-600 flex items-center gap-1.5 transition-colors px-3 py-1.5 rounded-full hover:bg-rose-50 border border-transparent hover:border-rose-200 cursor-pointer"
          >
            <i className="fa-solid fa-bug text-xs text-rose-500"></i>
            <span>{t('dashboard.simulateTamper')}</span>
          </button>
        </div>
      </div>

      {/* ================= 3. MAIN WORKSPACE: MAP + FEED SPLIT ================= */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT 7 COLS: INTERACTIVE WARD MAP & SCORECARDS */}
        <div className="lg:col-span-7 space-y-6">
          {/* Interactive Visual Ward Map Widget */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-sky-500"></span>
                <h3 className="text-sm font-bold text-slate-800">
                  {t('dashboard.wardMapTitle')}
                </h3>
              </div>
              <span className="text-xs text-slate-500 font-bold flex items-center gap-1">
                <i className="fa-solid fa-location-dot text-sky-500"></i>{' '}
                {t('dashboard.mapSub')}
              </span>
            </div>

            {/* Map Graphic Container */}
            <div
              className="relative bg-slate-100 h-80 w-full overflow-hidden flex items-center justify-center border-b border-slate-100"
              id="map-container"
            >
              {/* Background Grid Pattern representing city streets */}
              <svg
                className="absolute inset-0 w-full h-full opacity-30"
                width="100%"
                height="100%"
                xmlns="http://www.w3.org/2000/svg"
              >
                <defs>
                  <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                    <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#94a3b8" strokeWidth="1" />
                  </pattern>
                </defs>
                <rect width="100%" height="100%" fill="url(#grid)" />
              </svg>

              {/* Stylized Roads Layer */}
              <svg
                className="absolute inset-0 w-full h-full opacity-60 pointer-events-none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M 0 100 Q 200 120 400 80 T 800 150"
                  fill="none"
                  stroke="#cbd5e1"
                  strokeWidth="24"
                />
                <path
                  d="M 0 100 Q 200 120 400 80 T 800 150"
                  fill="none"
                  stroke="#ffffff"
                  strokeWidth="18"
                />
                <path d="M 250 0 L 250 320" fill="none" stroke="#cbd5e1" strokeWidth="16" />
                <path d="M 250 0 L 250 320" fill="none" stroke="#ffffff" strokeWidth="12" />
                <path d="M 500 0 L 500 320" fill="none" stroke="#cbd5e1" strokeWidth="12" />
              </svg>

              {/* Circular Map Pins (Dynamically Rendered from Case Lat/Long) */}
              <div id="map-pins-layer" className="absolute inset-0 pointer-events-auto">
                {filteredCases.map((c) => {
                  const pos = latLonToMapXY(c.latitude, c.longitude);
                  const isResolved = ['Resolved', 'Closed'].includes(c.status);
                  const isEscalated =
                    c.status?.includes('Escalated') ||
                    c.current_escalation_level === 'L2' ||
                    c.current_escalation_level === 'L3';

                  let pinColor = 'bg-sky-500 text-white';
                  if (isResolved) pinColor = 'bg-emerald-500 text-white';
                  else if (isEscalated) pinColor = 'bg-amber-500 text-white pulse-circle';

                  const isSelected = selectedCaseId === c.id;

                  const pinLetter =
                    c.defect_type === 'Pothole'
                      ? 'P'
                      : c.defect_type === 'Garbage'
                      ? 'G'
                      : 'W';

                  return (
                    <button
                      key={c.id}
                      onClick={() => handlePinClick(c)}
                      title={`${c.id}: ${c.title} (${c.status})`}
                      className={`absolute transform -translate-x-1/2 -translate-y-1/2 w-7 h-7 rounded-full ${pinColor} shadow-md border-2 border-white flex items-center justify-center text-xs font-bold transition-all hover:scale-125 cursor-pointer ${
                        isSelected ? 'ring-4 ring-sky-300 scale-125 z-20' : 'z-10'
                      }`}
                      style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
                    >
                      {pinLetter}
                    </button>
                  );
                })}
              </div>

              {/* Bottom Legend Overlay */}
              <div className="absolute bottom-3 left-3 bg-white/95 backdrop-blur-sm px-3.5 py-1.5 rounded-full text-[11px] font-bold border border-slate-200 text-slate-700 shadow-xs flex items-center gap-3 pointer-events-none">
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-sky-500"></span> Open
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span> Escalated
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span> Resolved
                </span>
              </div>
            </div>

            {/* Map Pin Details Footer Preview */}
            <div
              className="p-3 bg-white text-xs flex items-center justify-between text-slate-600 border-t border-slate-100"
              id="map-selected-info"
            >
              {selectedCaseObj ? (
                <div className="flex items-center justify-between w-full">
                  <div className="truncate max-w-[70%]">
                    <span className="font-bold text-slate-900">{selectedCaseObj.id}: </span>
                    <span className="font-semibold text-slate-700">{selectedCaseObj.title}</span>
                    <span className="text-slate-400 text-[11px] ml-1">
                      ({selectedCaseObj.address || 'Ward Sector'})
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sky-600 font-bold">
                      {selectedCaseObj.department_name || selectedCaseObj.department_code}
                    </span>
                    <button
                      onClick={() => setSelectedCaseId(null)}
                      className="text-[11px] text-slate-400 hover:text-slate-700 underline"
                    >
                      Clear
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <span>{t('dashboard.mapTip')}</span>
                  <span className="text-sky-600 font-bold">
                    {filteredCases.length} {t('dashboard.mapHotspots')}
                  </span>
                </>
              )}
            </div>
          </div>

          {/* ================= 4. DEPARTMENT SCORECARDS ================= */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-sky-500"></span>
                {t('dashboard.scorecardsTitle')}
              </h3>
              <span className="text-xs text-slate-400 font-medium">
                {t('dashboard.updatedHourly')}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {scorecards.map((dept) => {
                const isGradeA = dept.score >= 90;
                const isGradeB = dept.score >= 80 && dept.score < 90;

                const gradeBadgeClass = isGradeA
                  ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                  : isGradeB
                  ? 'bg-amber-100 text-amber-800 border-amber-200'
                  : 'bg-rose-100 text-rose-800 border-rose-200';

                const progressBg = isGradeA
                  ? 'bg-sky-500'
                  : isGradeB
                  ? 'bg-amber-500'
                  : 'bg-rose-500';

                return (
                  <div
                    key={dept.department_id}
                    className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-sky-100 text-sky-700 flex items-center justify-center font-bold text-xs shrink-0">
                          {dept.department_code || 'DEPT'}
                        </div>
                        <div>
                          <h4 className="text-xs font-bold text-slate-800">
                            {dept.department_name}
                          </h4>
                          <p className="text-[10px] text-slate-400">
                            {t('dashboard.contractor')}:{' '}
                            <strong>{dept.contractor_firm || 'Department Works'}</strong>
                          </p>
                        </div>
                      </div>
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${gradeBadgeClass}`}
                      >
                        {dept.grade || `Grade A (${dept.score}%)`}
                      </span>
                    </div>

                    <div className="space-y-1.5">
                      <div className="grid grid-cols-2 gap-1 text-[11px] text-slate-600 font-medium">
                        <div>
                          {t('dashboard.avgFixSpeed')}:{' '}
                          <strong>{dept.median_resolve_days || 1.8} d</strong>
                        </div>
                        <div>
                          {t('dashboard.reopenRate')}:{' '}
                          <strong>{dept.reopen_rate_pct || 2}%</strong>
                        </div>
                        <div>
                          {t('dashboard.escalationRateLabel')}:{' '}
                          <strong>{dept.escalation_rate_pct || 8}%</strong>
                        </div>
                        <div>
                          {t('dashboard.rejectedRateLabel')}:{' '}
                          <strong>{dept.rejected_closure_rate_pct || 0}%</strong>
                        </div>
                      </div>

                      {/* Progress Bar */}
                      <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                        <div
                          className={`${progressBg} h-full rounded-full transition-all duration-500`}
                          style={{ width: `${Math.max(15, dept.score || 85)}%` }}
                        ></div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* RIGHT 5 COLS: LIVE COMPLAINTS FEED & AUDIT HASH LEDGER LOG */}
        <div className="lg:col-span-5 space-y-6">
          {/* ================= 5. LIVE COMPLAINTS FEED ================= */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-4 space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-sky-500 pulse-circle"></span>
                {t('dashboard.feedTitle')}
              </h3>
              <span className="text-[11px] text-slate-400 font-semibold" id="case-count-label">
                {t('dashboard.showingCases').replace('{count}', filteredCases.length)}
              </span>
            </div>

            {/* Scrollable Feed */}
            <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1" id="cases-feed-container">
              {filteredCases.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-8 font-medium">
                  {t('dashboard.noCases')}
                </p>
              ) : (
                filteredCases.map((c) => {
                  const isEscalated =
                    c.status?.includes('Escalated') ||
                    c.current_escalation_level === 'L2' ||
                    c.current_escalation_level === 'L3';
                  const isResolved = ['Resolved', 'Closed'].includes(c.status);
                  const isSelected = selectedCaseId === c.id;

                  let statusBadge = (
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-sky-100 text-sky-700 border border-sky-200 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-sky-500"></span> Open
                    </span>
                  );
                  if (isEscalated) {
                    statusBadge = (
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700 border border-amber-200 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 pulse-circle"></span> Auto-Escalated
                      </span>
                    );
                  } else if (isResolved) {
                    statusBadge = (
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> Verified Fixed
                      </span>
                    );
                  }

                  return (
                    <div
                      key={c.id}
                      id={`feed-case-${c.id}`}
                      className={`p-3.5 rounded-2xl border transition-all space-y-2.5 ${
                        isSelected
                          ? 'bg-sky-50/60 border-sky-400 shadow-sm'
                          : 'bg-slate-50/80 border-slate-200/80 hover:bg-white hover:shadow-xs'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="w-7 h-7 rounded-full bg-sky-100 text-sky-700 flex items-center justify-center text-xs font-bold shrink-0">
                            {c.defect_type?.charAt(0) || 'P'}
                          </span>
                          <div>
                            <h4 className="text-xs font-bold text-slate-800 leading-snug">
                              {c.title}
                            </h4>
                            <p className="text-[10px] text-slate-400 font-medium">
                              {c.id} • {c.opened_at?.split('T')[0] || 'Recently Reported'}
                            </p>
                          </div>
                        </div>
                        {statusBadge}
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-[11px] bg-white p-2.5 rounded-xl border border-slate-100">
                        <div>
                          <span className="text-slate-400 text-[9px] font-bold block uppercase">
                            Location:
                          </span>
                          <span className="font-semibold text-slate-700 truncate block">
                            {c.address || 'Ward Sector'}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-400 text-[9px] font-bold block uppercase">
                            Contractor / Liability:
                          </span>
                          <div className="flex flex-col gap-0.5">
                            <span className="font-semibold text-slate-700 truncate block">
                              {c.contractor_firm || 'Department Direct'}
                            </span>
                            {c.contractor_liability && (
                              <span className="inline-block px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-100 text-amber-800 border border-amber-300 w-max">
                                {t('dashboard.contractorLiability')}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Before / After Evidence Photos Preview */}
                      {(c.before_image || c.after_image) && (
                        <div className="flex items-center gap-2 pt-1">
                          {c.before_image && (
                            <div className="relative group">
                              <img
                                src={c.before_image}
                                alt="Before evidence"
                                className="w-14 h-14 object-cover rounded-lg border border-slate-200 shadow-2xs"
                              />
                              <span className="absolute bottom-0 inset-x-0 bg-slate-900/80 text-[8px] font-bold text-white text-center py-0.5 rounded-b-lg">
                                Before
                              </span>
                            </div>
                          )}
                          {c.after_image && (
                            <div className="relative group">
                              <img
                                src={c.after_image}
                                alt="After repair evidence"
                                className="w-14 h-14 object-cover rounded-lg border border-emerald-300 shadow-2xs"
                              />
                              <span className="absolute bottom-0 inset-x-0 bg-emerald-800/90 text-[8px] font-bold text-white text-center py-0.5 rounded-b-lg">
                                Fixed
                              </span>
                            </div>
                          )}
                        </div>
                      )}

                      <div className="flex items-center justify-between text-[11px] pt-1">
                        <span className="text-slate-500 flex items-center gap-1">
                          <i className="fa-solid fa-clock text-sky-500 text-[10px]"></i> SLA:{' '}
                          <strong
                            className={
                              isEscalated
                                ? 'text-amber-600 font-bold'
                                : isResolved
                                ? 'text-emerald-600 font-bold'
                                : 'text-slate-700 font-bold'
                            }
                          >
                            {isResolved
                              ? 'Fixed'
                              : isEscalated
                              ? 'Overdue (Escalated)'
                              : 'Tracked on Clock'}
                          </strong>
                        </span>

                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => openLedgerExplorer(c.id)}
                            className="text-xs text-sky-600 hover:text-sky-800 font-bold flex items-center gap-1 cursor-pointer"
                            title="Inspect SHA-256 blocks for this case"
                          >
                            <i className="fa-solid fa-cube text-[10px]"></i>
                            <span>{t('dashboard.inspectLedger')}</span>
                          </button>

                          <Link
                            to={`/track/${c.id}`}
                            className="text-xs text-slate-500 hover:text-sky-600 font-bold flex items-center gap-1"
                            title="View public tracking timeline"
                          >
                            <span>{t('dashboard.viewTimeline')}</span>
                            <i className="fa-solid fa-arrow-up-right-from-square text-[9px]"></i>
                          </Link>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* ================= 6. DARK TAMPER-EVIDENT LEDGER PANEL ================= */}
          <div className="bg-slate-900 rounded-2xl p-4 text-slate-300 space-y-3 shadow-md border border-slate-800">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-emerald-400"></div>
                <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                  {t('dashboard.ledgerTitle')}
                </h3>
              </div>
              <span className="text-[10px] font-mono text-slate-400 bg-slate-800 px-2 py-0.5 rounded-full border border-slate-700">
                {t('dashboard.hashChain')}
              </span>
            </div>

            <p className="text-[11px] text-slate-400">
              {t('dashboard.ledgerDesc')}
            </p>

            {/* Code / Hash Stream (Polled Live Every 3s) */}
            <div
              className="font-mono text-[11px] space-y-2 bg-slate-950 p-3 rounded-xl border border-slate-800/80 max-h-48 overflow-y-auto"
              id="ledger-stream"
            >
              {ledgerEvents.map((ev) => (
                <div
                  key={ev.id || ev.sequence}
                  onClick={() => openLedgerExplorer(ev.case_id)}
                  className="hover:bg-slate-900 p-1.5 rounded transition-colors cursor-pointer border-b border-slate-900/60 pb-1"
                  title="Click to inspect this block in Case Explorer"
                >
                  <div className="flex items-center justify-between text-slate-400 text-[10px]">
                    <span className="text-emerald-400 font-bold">
                      BLOCK #{String(ev.sequence).padStart(4, '0')}
                    </span>
                    <span className="text-slate-400 truncate max-w-[120px]">
                      {ev.case_id || 'SYSTEM'}
                    </span>
                  </div>
                  <div className="text-slate-300 text-[10px] font-bold truncate">
                    {ev.event_type}
                  </div>
                  <div className="text-sky-400/90 text-[10px] truncate">
                    Hash: {ev.own_hash ? ev.own_hash.substring(0, 20) + '...' : '0000...'}
                  </div>
                </div>
              ))}
            </div>

            {/* Actions: Verify & Witness Anchors */}
            <div className="pt-2 space-y-2.5 border-t border-slate-800">
              <div className="flex items-center justify-between">
                <button
                  onClick={() => verifyLedgerChain()}
                  disabled={chainStatus === 'verifying'}
                  className="px-3.5 py-1.5 rounded-full text-xs font-bold bg-sky-600 hover:bg-sky-500 text-white transition-all flex items-center gap-1.5 shadow-xs cursor-pointer"
                >
                  <i
                    className={`fa-solid ${
                      chainStatus === 'verifying'
                        ? 'fa-circle-notch fa-spin'
                        : isTampered
                        ? 'fa-triangle-exclamation text-rose-300'
                        : 'fa-shield-halved text-emerald-300'
                    }`}
                  ></i>
                  <span>
                    {chainStatus === 'verifying'
                      ? 'Verifying...'
                      : isTampered
                      ? `Broken at #${tamperedBlock}`
                      : 'Verify Ledger Chain'}
                  </span>
                </button>

                <button
                  onClick={handleCreateAnchor}
                  disabled={isCreatingAnchor}
                  className="px-3 py-1.5 rounded-full text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <i
                    className={`fa-solid fa-anchor text-[11px] ${
                      isCreatingAnchor ? 'fa-spin' : 'text-sky-400'
                    }`}
                  ></i>
                  <span>{isCreatingAnchor ? 'Anchoring...' : t('dashboard.createAnchor')}</span>
                </button>
              </div>

              {anchorToast && (
                <div className="p-2 rounded-lg bg-emerald-950/80 border border-emerald-800 text-emerald-300 text-[11px] font-medium flex items-center gap-1.5">
                  <i className="fa-solid fa-check text-emerald-400"></i>
                  <span>{anchorToast}</span>
                </div>
              )}

              {/* Anchors List Preview */}
              {anchors.length > 0 && (
                <div className="bg-slate-950/70 p-2.5 rounded-xl border border-slate-800/60 text-[10px] space-y-1">
                  <span className="text-slate-400 font-bold uppercase tracking-wider block">
                    {t('dashboard.anchorsTitle')} ({anchors.length} Witness Checkpoints)
                  </span>
                  <div className="space-y-0.5 max-h-16 overflow-y-auto font-mono text-slate-400">
                    {anchors.slice(-3).map((a) => (
                      <div key={a.id} className="flex justify-between items-center truncate">
                        <span>Checkpoint #{a.id} (Seq #{a.sequence})</span>
                        <span className="text-emerald-400 truncate max-w-[110px]">
                          {a.head_hash.substring(0, 10)}...
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="pt-1 flex items-center justify-between text-[10px] text-slate-400">
                <span>Anchored to Public Witness Server</span>
                <span className="text-emerald-400 font-bold flex items-center gap-1">
                  <i className="fa-solid fa-lock text-[9px]"></i> {t('dashboard.syncActive')}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ================= 7. CASE-LEVEL LEDGER EXPLORER DRAWER ================= */}
      {explorerCaseId && (
        <div className="fixed inset-0 z-50 overflow-hidden flex justify-end">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity"
            onClick={closeLedgerExplorer}
          ></div>

          {/* Drawer Content */}
          <div className="relative w-full max-w-xl bg-white shadow-2xl flex flex-col h-full z-10 animate-in slide-in-from-right duration-200">
            {/* Drawer Header */}
            <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                  <h3 className="text-sm font-bold text-slate-900">
                    {t('dashboard.drawerTitle')}
                  </h3>
                </div>
                <p className="text-xs text-slate-500">
                  Case ID: <strong className="text-sky-600">{explorerCaseId}</strong> •{' '}
                  {explorerEvents.length} Cryptographic Blocks
                </p>
              </div>

              <button
                onClick={closeLedgerExplorer}
                className="w-8 h-8 rounded-full bg-slate-200/80 hover:bg-slate-300 flex items-center justify-center text-slate-600 transition-colors"
                aria-label="Close explorer"
              >
                <i className="fa-solid fa-xmark text-sm"></i>
              </button>
            </div>

            {/* Explanatory Note on Client-Side Verification */}
            <div className="p-4 bg-sky-50/80 border-b border-sky-100 text-xs text-sky-900 flex items-start gap-2.5">
              <i className="fa-solid fa-shield-halved text-sky-600 mt-0.5 text-sm shrink-0"></i>
              <div>
                <span className="font-bold">Real-time Browser Verification: </span>
                <span>
                  Each block’s SHA-256 hash below is computed directly in your browser using the
                  Web Crypto API from the canonical payload and previous block hash.
                </span>
              </div>
            </div>

            {/* Events Stream */}
            <div className="p-5 flex-grow overflow-y-auto space-y-4">
              {isLoadingExplorer ? (
                <div className="py-12 text-center text-xs text-slate-500">
                  <i className="fa-solid fa-circle-notch fa-spin text-sky-600 text-lg mb-2"></i>
                  <p>Loading chained ledger blocks...</p>
                </div>
              ) : explorerEvents.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-8">
                  No ledger events found for this case.
                </p>
              ) : (
                explorerEvents.map((ev, idx) => {
                  const verif = explorerVerification[ev.sequence];
                  const isMatch = verif?.isValid;

                  return (
                    <div
                      key={ev.id || ev.sequence}
                      className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3 text-xs"
                    >
                      <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                        <span className="font-bold text-slate-900 flex items-center gap-1.5">
                          <span className="w-6 h-6 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center text-[10px]">
                            #{ev.sequence}
                          </span>
                          <span>{ev.event_type}</span>
                        </span>
                        <span className="text-[10px] text-slate-400">
                          {ev.timestamp?.replace('T', ' ')}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-600">
                        <div>
                          <span className="text-slate-400 text-[10px] block font-bold uppercase">
                            Actor Role:
                          </span>
                          <span className="font-semibold text-slate-800">{ev.actor_role}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 text-[10px] block font-bold uppercase">
                            Evidence Hash:
                          </span>
                          <span className="font-mono text-slate-700 truncate block">
                            {ev.evidence_hash ? `${ev.evidence_hash.substring(0, 12)}...` : 'None'}
                          </span>
                        </div>
                      </div>

                      {/* Hashes Section */}
                      <div className="space-y-1.5 bg-white p-3 rounded-xl border border-slate-200 font-mono text-[10px]">
                        <div>
                          <span className="text-slate-400 uppercase block font-bold text-[9px]">
                            Previous Block Hash:
                          </span>
                          <span className="text-slate-600 break-all select-all">
                            {ev.prev_hash}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-400 uppercase block font-bold text-[9px]">
                            Stored Block Hash:
                          </span>
                          <span className="text-sky-700 font-bold break-all select-all">
                            {ev.own_hash}
                          </span>
                        </div>
                        {verif && (
                          <div className="pt-1.5 border-t border-slate-100 flex items-center justify-between">
                            <span className="text-slate-500 font-sans text-[11px] font-bold">
                              Browser Calculated Hash:
                            </span>
                            {isMatch ? (
                              <span className="text-emerald-700 font-bold font-sans flex items-center gap-1 text-[11px]">
                                <i className="fa-solid fa-circle-check text-emerald-600"></i>
                                {t('dashboard.browserVerified')}
                              </span>
                            ) : (
                              <span className="text-rose-700 font-bold font-sans flex items-center gap-1 text-[11px]">
                                <i className="fa-solid fa-triangle-exclamation text-rose-600"></i>
                                {t('dashboard.browserMismatch')}
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Payload Expander */}
                      <details className="text-[10px]">
                        <summary className="font-bold text-slate-500 hover:text-slate-700 cursor-pointer select-none">
                          View Block Payload JSON
                        </summary>
                        <pre className="mt-2 p-2.5 bg-slate-900 text-slate-200 rounded-lg overflow-x-auto font-mono text-[10px]">
                          {typeof ev.payload === 'object'
                            ? JSON.stringify(ev.payload, null, 2)
                            : ev.payload}
                        </pre>
                      </details>
                    </div>
                  );
                })
              )}
            </div>

            {/* Drawer Footer */}
            <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
              <Link
                to={`/track/${explorerCaseId}`}
                className="px-4 py-2 rounded-full text-xs font-bold bg-sky-600 hover:bg-sky-700 text-white shadow-xs transition-all flex items-center gap-1.5"
              >
                <span>Open Citizen Tracking Timeline</span>
                <i className="fa-solid fa-arrow-up-right-from-square text-[10px]"></i>
              </Link>
              <button
                onClick={closeLedgerExplorer}
                className="px-4 py-2 rounded-full text-xs font-bold bg-slate-200 hover:bg-slate-300 text-slate-700 transition-all cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

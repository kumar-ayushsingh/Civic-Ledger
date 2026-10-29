import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../context/AppContext';

export default function OfficerPortalPage() {
  const { t, lang, verifyLedgerChain } = useApp();
  const language = lang;

  // Role Switcher: 'worker', 'l1', 'l2', 'l3'
  const [selectedRole, setSelectedRole] = useState('l1');

  // Case Queue & Loading States
  const [cases, setCases] = useState([]);
  const [isLoadingCases, setIsLoadingCases] = useState(true);
  const [sortOption, setSortOption] = useState('priority'); // 'priority' | 'sla' | 'recent' | 'escalated'
  const [clockInfo, setClockInfo] = useState(null);
  const [isAdvancingClock, setIsAdvancingClock] = useState(false);
  const [fastForwardToast, setFastForwardToast] = useState(null);

  // Drawer & Modal States
  const [selectedCaseId, setSelectedCaseId] = useState(null);
  const [drawerCase, setDrawerCase] = useState(null);
  const [drawerTimeline, setDrawerTimeline] = useState(null);
  const [isLoadingDrawer, setIsLoadingDrawer] = useState(false);

  // Drawer Inline Action States
  const [isAcknowledging, setIsAcknowledging] = useState(false);
  const [showReassignModal, setShowReassignModal] = useState(false);
  const [reassignDeptId, setReassignDeptId] = useState(1);
  const [reassignReason, setReassignReason] = useState('');
  const [isReassigning, setIsReassigning] = useState(false);

  const [showOverrideModal, setShowOverrideModal] = useState(false);
  const [overrideType, setOverrideType] = useState('pothole');
  const [overrideSeverity, setOverrideSeverity] = useState('High');
  const [overrideReason, setOverrideReason] = useState('');
  const [isOverriding, setIsOverriding] = useState(false);

  // Closure Verification Modal States
  const [closureModalCase, setClosureModalCase] = useState(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [capturedBlob, setCapturedBlob] = useState(null);
  const [capturedPreview, setCapturedPreview] = useState(null);
  const [photoFilename, setPhotoFilename] = useState('');
  const [cameraError, setCameraError] = useState(null);
  const [isSubmittingClosure, setIsSubmittingClosure] = useState(false);
  const [closureResult, setClosureResult] = useState(null);
  const [activeShortcut, setActiveShortcut] = useState(null);

  const videoRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const fileInputRef = useRef(null);

  // --------------------------------------------------------------------------
  // 1. DATA FETCHING
  // --------------------------------------------------------------------------
  const fetchClock = async () => {
    try {
      const res = await fetch('/api/clock');
      const data = await res.json();
      setClockInfo(data);
    } catch (err) {
      console.error('Failed to fetch simulated clock:', err);
    }
  };

  const fetchCases = async () => {
    try {
      const res = await fetch('/api/cases');
      const data = await res.json();
      if (data && data.cases) {
        setCases(data.cases);
      }
    } catch (err) {
      console.error('Failed to fetch cases:', err);
    } finally {
      setIsLoadingCases(false);
    }
  };

  useEffect(() => {
    fetchClock();
    fetchCases();
    const interval = setInterval(() => {
      fetchClock();
      fetchCases();
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  // Fetch detailed case data when drawer opens
  useEffect(() => {
    if (!selectedCaseId) {
      setDrawerCase(null);
      setDrawerTimeline(null);
      return;
    }
    loadCaseDetails(selectedCaseId);
  }, [selectedCaseId]);

  const loadCaseDetails = async (caseId) => {
    setIsLoadingDrawer(true);
    try {
      const [caseRes, timelineRes] = await Promise.all([
        fetch(`/api/cases/${caseId}`),
        fetch(`/api/cases/${caseId}/timeline`),
      ]);
      const caseData = await caseRes.json();
      const timelineData = await timelineRes.json();
      setDrawerCase(caseData);
      setDrawerTimeline(timelineData);
    } catch (err) {
      console.error('Failed to load case details:', err);
    } finally {
      setIsLoadingDrawer(false);
    }
  };

  // --------------------------------------------------------------------------
  // 2. FAST FORWARD SLA CLOCK
  // --------------------------------------------------------------------------
  const handleFastForward = async () => {
    setIsAdvancingClock(true);
    try {
      const res = await fetch('/api/demo/advance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hours: 2 }),
      });
      const data = await res.json();
      if (data.ok) {
        setFastForwardToast(
          `Simulated clock fast-forwarded by +2h (${data.escalations_triggered || 0} escalations triggered)`
        );
        setTimeout(() => setFastForwardToast(null), 4000);
        await Promise.all([fetchClock(), fetchCases(), verifyLedgerChain()]);
        if (selectedCaseId) {
          loadCaseDetails(selectedCaseId);
        }
      }
    } catch (err) {
      console.error('Failed to advance clock:', err);
    } finally {
      setIsAdvancingClock(false);
    }
  };

  // --------------------------------------------------------------------------
  // 3. CASE DRAWER ACTIONS (ACKNOWLEDGE, REASSIGN, OVERRIDE)
  // --------------------------------------------------------------------------
  const handleAcknowledge = async () => {
    if (!drawerCase) return;
    setIsAcknowledging(true);
    try {
      const res = await fetch(`/api/cases/${drawerCase.id}/acknowledge`, {
        method: 'POST',
      });
      const data = await res.json();
      if (data.ok) {
        // Update case locally without reload
        setCases((prev) =>
          prev.map((c) =>
            c.id === drawerCase.id
              ? { ...c, status: 'Acknowledged', acknowledged_at: data.acknowledged_at }
              : c
          )
        );
        await loadCaseDetails(drawerCase.id);
        verifyLedgerChain();
      }
    } catch (err) {
      console.error('Failed to acknowledge case:', err);
    } finally {
      setIsAcknowledging(false);
    }
  };

  const handleReassignSubmit = async (e) => {
    e.preventDefault();
    if (!drawerCase || !reassignReason.trim()) return;
    setIsReassigning(true);
    try {
      const res = await fetch(`/api/cases/${drawerCase.id}/reassign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          department_id: Number(reassignDeptId),
          reason: reassignReason,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setShowReassignModal(false);
        setReassignReason('');
        await Promise.all([loadCaseDetails(drawerCase.id), fetchCases(), verifyLedgerChain()]);
      }
    } catch (err) {
      console.error('Failed to reassign case:', err);
    } finally {
      setIsReassigning(false);
    }
  };

  const handleOverrideSubmit = async (e) => {
    e.preventDefault();
    if (!drawerCase || !overrideReason.trim()) return;
    setIsOverriding(true);
    try {
      const res = await fetch(`/api/cases/${drawerCase.id}/override-detection`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          defect_type: overrideType,
          severity: overrideSeverity,
          reason: overrideReason,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setShowOverrideModal(false);
        setOverrideReason('');
        await Promise.all([loadCaseDetails(drawerCase.id), fetchCases(), verifyLedgerChain()]);
      }
    } catch (err) {
      console.error('Failed to override detection:', err);
    } finally {
      setIsOverriding(false);
    }
  };

  // --------------------------------------------------------------------------
  // 4. CLOSURE MODAL & REAL VERIFICATION RULES
  // --------------------------------------------------------------------------
  const openClosureModal = (caseItem) => {
    setClosureModalCase(caseItem);
    setCapturedBlob(null);
    setCapturedPreview(null);
    setPhotoFilename('');
    setClosureResult(null);
    setActiveShortcut(null);
    setCameraError(null);
  };

  const closeClosureModal = () => {
    stopCamera();
    setClosureModalCase(null);
    setCapturedBlob(null);
    setCapturedPreview(null);
    setClosureResult(null);
    setActiveShortcut(null);
  };

  const startCamera = async () => {
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      mediaStreamRef.current = stream;
      setIsCameraActive(true);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
    } catch (err) {
      console.warn('Camera access denied:', err);
      setCameraError('Camera access unavailable. Use file fallback or demo shortcuts.');
      setIsCameraActive(false);
    }
  };

  const stopCamera = () => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    setIsCameraActive(false);
  };

  const capturePhotoFromCamera = () => {
    if (!videoRef.current) return;
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth || 640;
    canvas.height = videoRef.current.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      setCapturedBlob(blob);
      setPhotoFilename('after_repair_camera.jpg');
      setCapturedPreview(URL.createObjectURL(blob));
      stopCamera();
    }, 'image/jpeg', 0.9);
  };

  const handleFileChange = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    setCapturedBlob(file);
    setPhotoFilename(file.name);
    setCapturedPreview(URL.createObjectURL(file));
  };

  // Submit Closure to Real Backend API
  const submitClosureVerification = async (shortcutPreset = null) => {
    if (!closureModalCase) return;
    setIsSubmittingClosure(true);
    setActiveShortcut(shortcutPreset);
    setClosureResult(null);

    try {
      const formData = new FormData();
      if (shortcutPreset) {
        formData.append('demo_preset', shortcutPreset);
      } else if (capturedBlob) {
        formData.append('after_photo', capturedBlob, photoFilename || 'after_photo.jpg');
      }

      // Default lat/lng to case coordinates or active demo GPS preset
      let subLat = closureModalCase.latitude;
      let subLng = closureModalCase.longitude;
      if (!shortcutPreset) {
        const savedGps = localStorage.getItem('civicledger_demo_gps');
        if (savedGps) {
          try {
            const parsed = JSON.parse(savedGps);
            if (parsed.lat && parsed.lng) {
              subLat = parsed.lat;
              subLng = parsed.lng;
            }
          } catch (e) {}
        }
      }
      formData.append('lat', subLat);
      formData.append('lng', subLng);
      if (clockInfo?.sim_now) {
        formData.append('captured_at', clockInfo.sim_now);
      }

      const res = await fetch(`/api/cases/${closureModalCase.id}/closure`, {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      setClosureResult(data);

      if (data.verified) {
        // Update case locally in queue table
        setCases((prev) =>
          prev.map((c) =>
            c.id === closureModalCase.id
              ? { ...c, status: 'Resolved', resolved_at: new Date().toISOString() }
              : c
          )
        );
        verifyLedgerChain();
        if (selectedCaseId === closureModalCase.id) {
          loadCaseDetails(closureModalCase.id);
        }
      }
    } catch (err) {
      console.error('Failed to submit closure verification:', err);
    } finally {
      setIsSubmittingClosure(false);
    }
  };

  // --------------------------------------------------------------------------
  // 5. QUEUE FILTERING & SORTING
  // --------------------------------------------------------------------------
  const getFilteredAndSortedCases = () => {
    let list = [...cases];

    // Filter by Role Context
    if (selectedRole === 'worker') {
      // Workers focus on tickets being worked on or requiring fix verification
      list = list.filter((c) => c.status !== 'Resolved' && c.status !== 'Closed');
    } else if (selectedRole === 'l1') {
      // Field engineers see all tickets in ward
      list = list.filter((c) => c.current_escalation_level === 'L1' || c.status === 'Open');
    } else if (selectedRole === 'l2') {
      // Executive engineers focus on L2 escalations and reopened tickets
      list = list.filter(
        (c) =>
          c.current_escalation_level === 'L2' ||
          c.status.includes('Escalated') ||
          c.status === 'Reopened' ||
          c.contractor_liability
      );
    } else if (selectedRole === 'l3') {
      // Zonal heads oversee L3 escalations and system-wide critical tickets
      list = list.filter(
        (c) =>
          c.current_escalation_level === 'L3' ||
          c.status.includes('Escalated_L2') ||
          c.severity === 'High'
      );
    }

    // Sort queue
    if (sortOption === 'priority') {
      // High severity and overdue first
      list.sort((a, b) => {
        const aOverdue = isOverdue(a) ? 2 : 0;
        const bOverdue = isOverdue(b) ? 2 : 0;
        const aSev = a.severity === 'High' ? 2 : a.severity === 'Medium' ? 1 : 0;
        const bSev = b.severity === 'High' ? 2 : b.severity === 'Medium' ? 1 : 0;
        return bOverdue + bSev - (aOverdue + aSev);
      });
    } else if (sortOption === 'sla') {
      // Soonest deadline first
      list.sort((a, b) => {
        const aTime = new Date(a.due_acknowledge_at || a.due_resolve_at || 0).getTime();
        const bTime = new Date(b.due_acknowledge_at || b.due_resolve_at || 0).getTime();
        return aTime - bTime;
      });
    } else if (sortOption === 'recent') {
      list.sort((a, b) => new Date(b.opened_at || 0).getTime() - new Date(a.opened_at || 0).getTime());
    } else if (sortOption === 'escalated') {
      list.sort((a, b) => {
        const aEsc = a.current_escalation_level !== 'L1' ? 1 : 0;
        const bEsc = b.current_escalation_level !== 'L1' ? 1 : 0;
        return bEsc - aEsc;
      });
    }

    return list;
  };

  const isOverdue = (c) => {
    if (c.status === 'Resolved' || c.status === 'Closed') return false;
    const now = clockInfo?.sim_now ? new Date(clockInfo.sim_now).getTime() : Date.now();
    if (!c.acknowledged_at && c.due_acknowledge_at) {
      return new Date(c.due_acknowledge_at).getTime() < now;
    }
    if (c.due_resolve_at) {
      return new Date(c.due_resolve_at).getTime() < now;
    }
    return false;
  };

  const computeSlaBadge = (c) => {
    if (c.status === 'Resolved' || c.status === 'Closed') {
      return { text: 'Completed', color: 'bg-emerald-100 text-emerald-800' };
    }
    const now = clockInfo?.sim_now ? new Date(clockInfo.sim_now).getTime() : Date.now();

    // Check Ack deadline
    if (!c.acknowledged_at && c.due_acknowledge_at) {
      const ackTime = new Date(c.due_acknowledge_at).getTime();
      const diffMs = ackTime - now;
      if (diffMs > 0) {
        const h = Math.floor(diffMs / (1000 * 60 * 60));
        const m = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
        return { text: `${h}h ${m}m left (Ack)`, color: 'bg-sky-100 text-sky-800' };
      } else {
        const absDiff = Math.abs(diffMs);
        const h = Math.floor(absDiff / (1000 * 60 * 60));
        const m = Math.floor((absDiff % (1000 * 60 * 60)) / (1000 * 60));
        return { text: `Ack Overdue by ${h}h ${m}m`, color: 'bg-rose-100 text-rose-800 font-bold' };
      }
    }

    // Check Resolve deadline
    if (c.due_resolve_at) {
      const resTime = new Date(c.due_resolve_at).getTime();
      const diffMs = resTime - now;
      if (diffMs > 0) {
        const d = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        const h = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        return { text: `${d}d ${h}h left (Fix)`, color: 'bg-slate-100 text-slate-800' };
      } else {
        const absDiff = Math.abs(diffMs);
        const d = Math.floor(absDiff / (1000 * 60 * 60 * 24));
        const h = Math.floor((absDiff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        return { text: `Fix Overdue by ${d}d ${h}h`, color: 'bg-rose-100 text-rose-800 font-bold' };
      }
    }

    return { text: 'Active', color: 'bg-slate-100 text-slate-800' };
  };

  const filteredCases = getFilteredAndSortedCases();

  return (
    <div className="space-y-6 pb-16">
      {/* Toast Alert for Fast Forward */}
      {fastForwardToast && (
        <div className="fixed top-20 right-6 z-50 p-4 rounded-2xl bg-amber-500 text-white shadow-xl flex items-center gap-3 animate-bounce">
          <i className="fa-solid fa-forward-fast text-lg"></i>
          <span className="text-sm font-bold">{fastForwardToast}</span>
        </div>
      )}

      {/* 1. HEADER CARD: ROLE SWITCHER & FAST FORWARD BUTTON */}
      <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-5">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-full bg-sky-100 text-sky-700 flex items-center justify-center font-bold text-xl border border-sky-200 shrink-0">
            <i className="fa-solid fa-user-shield"></i>
          </div>
          <div>
            <h1 className="text-base sm:text-lg font-black text-slate-900 tracking-tight">
              {t('officer.portalTitle')}
            </h1>
            <p className="text-xs text-slate-500 font-medium">
              {t('officer.assignedWard')} • {t('officer.officerId')}
            </p>
          </div>
        </div>

        {/* Role Switcher Chips & Fast Forward */}
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="text-xs font-bold text-slate-500 mr-1 select-none">
            {t('officer.roleLabel')}
          </span>
          {[
            { id: 'worker', label: t('officer.roles.worker') },
            { id: 'l1', label: t('officer.roles.l1') },
            { id: 'l2', label: t('officer.roles.l2') },
            { id: 'l3', label: t('officer.roles.l3') },
          ].map((role) => (
            <button
              key={role.id}
              onClick={() => setSelectedRole(role.id)}
              className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer ${
                selectedRole === role.id
                  ? 'bg-sky-500 text-white shadow-xs'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
              }`}
            >
              {role.label}
            </button>
          ))}

          {/* Fast-Forward SLA (+2 Hours) Button */}
          <button
            onClick={handleFastForward}
            disabled={isAdvancingClock}
            className="ml-auto lg:ml-2 px-3.5 py-1.5 rounded-full bg-amber-50 text-amber-700 border border-amber-300 hover:bg-amber-100 text-xs font-black shadow-xs transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            title="Advances simulated time by 2 hours and triggers SLA auto-escalation evaluation"
          >
            <i className={`fa-solid fa-forward-fast ${isAdvancingClock ? 'fa-spin' : ''}`}></i>
            <span>{isAdvancingClock ? t('officer.fastForwarding') : t('officer.fastForward')}</span>
          </button>
        </div>
      </div>

      {/* 2. ACTIVE REPAIR QUEUE TABLE */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Table Controls Header */}
        <div className="p-4 sm:p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="w-2.5 h-2.5 rounded-full bg-sky-500 animate-pulse"></span>
            <h2 className="text-xs sm:text-sm font-black text-slate-800 uppercase tracking-wider">
              {t('officer.queueTitle')}
            </h2>
            <span className="text-[11px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
              {filteredCases.length}
            </span>
          </div>

          {/* Sort Controls */}
          <div className="flex items-center gap-2">
            <label htmlFor="sort-queue-select" className="text-xs font-bold text-slate-500">
              {t('officer.sortBy')}
            </label>
            <select
              id="sort-queue-select"
              aria-label={t('officer.sortBy') || 'Sort queue by'}
              value={sortOption}
              onChange={(e) => setSortOption(e.target.value)}
              className="text-xs font-bold text-slate-700 bg-slate-50 border border-slate-200 rounded-full px-3 py-1 focus:outline-none focus:border-sky-500"
            >
              <option value="priority">{t('officer.sortPriority')}</option>
              <option value="sla">{t('officer.sortSla')}</option>
              <option value="recent">{t('officer.sortRecent')}</option>
              <option value="escalated">{t('officer.sortEscalated')}</option>
            </select>
          </div>
        </div>

        {/* Table Body */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50/80 text-[11px] font-black text-slate-400 uppercase tracking-wider border-b border-slate-100">
                <th className="p-3 pl-5">{t('officer.colCaseId')}</th>
                <th className="p-3">{t('officer.colDefect')}</th>
                <th className="p-3">{t('officer.colLocation')}</th>
                <th className="p-3">{t('officer.colSla')}</th>
                <th className="p-3">{t('officer.colStatus')}</th>
                <th className="p-3 pr-5 text-right">{t('officer.colAction')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredCases.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-400 text-xs">
                    {t('officer.emptyQueue')}
                  </td>
                </tr>
              ) : (
                filteredCases.map((c) => {
                  const sla = computeSlaBadge(c);
                  const isEscalated =
                    c.current_escalation_level !== 'L1' || c.status.includes('Escalated');
                  return (
                    <tr
                      key={c.id}
                      className="hover:bg-slate-50/80 transition-colors group cursor-pointer"
                      onClick={() => setSelectedCaseId(c.id)}
                    >
                      {/* Case ID */}
                      <td className="p-3 pl-5 font-black text-slate-800">
                        <span className="text-sky-600 hover:underline">{c.id}</span>
                      </td>

                      {/* Defect Type & Severity */}
                      <td className="p-3 font-semibold text-slate-700">
                        <div className="flex items-center gap-1.5">
                          <span>{c.defect_type}</span>
                          <span
                            className={`px-1.5 py-0.5 rounded-md text-[10px] font-black ${
                              c.severity === 'High'
                                ? 'bg-rose-100 text-rose-700'
                                : c.severity === 'Medium'
                                ? 'bg-amber-100 text-amber-700'
                                : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {c.severity}
                          </span>
                        </div>
                      </td>

                      {/* Location */}
                      <td className="p-3 text-slate-500 truncate max-w-[160px]" title={c.address}>
                        {c.address || 'Central Ward Sector'}
                      </td>

                      {/* SLA Live Deadline */}
                      <td className="p-3">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold inline-block ${sla.color}`}
                        >
                          {sla.text}
                        </span>
                      </td>

                      {/* Status & Chips */}
                      <td className="p-3">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              c.status === 'Resolved'
                                ? 'bg-emerald-100 text-emerald-700'
                                : c.status.includes('Escalated') || c.status === 'Reopened'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-sky-100 text-sky-800'
                            }`}
                          >
                            {c.status}
                          </span>

                          {/* Contractor Liability Chip */}
                          {c.contractor_liability && (
                            <span
                              className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-amber-100 text-amber-900 border border-amber-300"
                              title="Under active defect liability period. Contractor billed directly."
                            >
                              {t('officer.contractorLiability')}
                            </span>
                          )}

                          {/* Escalated from L1 Chip */}
                          {isEscalated && (
                            <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-rose-100 text-rose-800 border border-rose-300">
                              {c.current_escalation_level === 'L3'
                                ? t('officer.escalatedFromL2')
                                : t('officer.escalatedFromL1')}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Action Button */}
                      <td className="p-3 pr-5 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => openClosureModal(c)}
                            className="px-3 py-1.5 rounded-full bg-sky-500 hover:bg-sky-600 text-white font-bold text-xs shadow-xs transition-all flex items-center gap-1 cursor-pointer"
                          >
                            <i className="fa-solid fa-camera"></i>
                            <span>{t('officer.verifyFix')}</span>
                          </button>
                          <button
                            onClick={() => setSelectedCaseId(c.id)}
                            className="px-2.5 py-1.5 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-all cursor-pointer"
                            title="Inspect details"
                          >
                            <i className="fa-solid fa-circle-info"></i>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 3. CASE DRAWER (DETAILS, SEVERITY FACTORS, TIMELINE & ACTIONS) */}
      {selectedCaseId && (
        <div className="fixed inset-0 z-50 overflow-hidden bg-slate-900/40 backdrop-blur-xs flex justify-end">
          <div className="w-full max-w-xl bg-white h-full shadow-2xl flex flex-col overflow-y-auto border-l border-slate-200">
            {/* Drawer Top Header */}
            <div className="p-5 border-b border-slate-200 flex items-center justify-between sticky top-0 bg-white z-10">
              <div className="flex items-center gap-2.5">
                <span className="w-3 h-3 rounded-full bg-sky-500"></span>
                <h3 className="text-base font-black text-slate-800">
                  {selectedCaseId} {drawerCase?.title ? `• ${drawerCase.title}` : ''}
                </h3>
              </div>
              <button
                onClick={() => setSelectedCaseId(null)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center text-sm cursor-pointer"
                aria-label="Close drawer"
              >
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>

            {/* Drawer Content */}
            {isLoadingDrawer || !drawerCase ? (
              <div className="p-12 text-center text-slate-400">
                <i className="fa-solid fa-circle-notch fa-spin text-2xl mb-2 text-sky-500"></i>
                <p className="text-xs">Loading case data & ledger timeline...</p>
              </div>
            ) : (
              <div className="p-6 space-y-6 flex-grow">
                {/* Meta Strip */}
                <div className="grid grid-cols-2 gap-3 text-xs bg-slate-50 p-4 rounded-2xl border border-slate-200">
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase">
                      Department
                    </span>
                    <p className="font-bold text-slate-800">
                      {drawerCase.department_name || drawerCase.department_code || 'PWD'}
                    </p>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase">
                      Ward & Location
                    </span>
                    <p className="font-bold text-slate-800">
                      {drawerCase.ward_name || 'Central Ward'} ({drawerCase.address})
                    </p>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase">Status</span>
                    <p className="font-bold text-slate-800">{drawerCase.status}</p>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase">
                      Contractor
                    </span>
                    <p className="font-bold text-slate-800">
                      {drawerCase.contractor_firm || 'Department Direct'}
                    </p>
                  </div>
                </div>

                {/* EXPLAINABLE SEVERITY FACTORS */}
                {drawerCase.severity_factors && (
                  <div className="p-4 rounded-2xl bg-sky-50/80 border border-sky-200 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black text-sky-900 uppercase tracking-wider flex items-center gap-1.5">
                        <i className="fa-solid fa-calculator text-sky-600"></i>
                        {t('officer.explainableSeverity')}
                      </span>
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-sky-200 text-sky-900">
                        Tier: {drawerCase.severity_factors.severity_tier}
                      </span>
                    </div>

                    <p className="text-[11px] text-sky-800">
                      Severity Score = Detection Confidence × Defect Size Ratio × Road Importance × Age Factor
                    </p>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                      <div className="bg-white p-2 rounded-xl border border-sky-100 text-center">
                        <span className="text-[9px] font-bold text-slate-400 block uppercase">
                          Confidence
                        </span>
                        <span className="text-xs font-black text-slate-800">
                          {drawerCase.severity_factors.confidence}
                        </span>
                      </div>
                      <div className="bg-white p-2 rounded-xl border border-sky-100 text-center">
                        <span className="text-[9px] font-bold text-slate-400 block uppercase">
                          Area Ratio
                        </span>
                        <span className="text-xs font-black text-slate-800">
                          {drawerCase.severity_factors.area_ratio}
                        </span>
                      </div>
                      <div className="bg-white p-2 rounded-xl border border-sky-100 text-center">
                        <span className="text-[9px] font-bold text-slate-400 block uppercase">
                          Road Imp.
                        </span>
                        <span className="text-xs font-black text-slate-800">
                          {drawerCase.severity_factors.road_importance}x
                        </span>
                      </div>
                      <div className="bg-white p-2 rounded-xl border border-sky-100 text-center">
                        <span className="text-[9px] font-bold text-slate-400 block uppercase">
                          Warranty Age
                        </span>
                        <span className="text-xs font-black text-slate-800">
                          {drawerCase.severity_factors.age_factor}x
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* EVIDENCE PHOTOS */}
                <div className="space-y-2">
                  <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider">
                    {t('officer.evidencePhotos')}
                  </h4>
                  <div className="grid grid-cols-2 gap-3">
                    {/* Original Citizen Photo */}
                    <div className="space-y-1">
                      <span className="text-[11px] font-bold text-slate-500">
                        {t('officer.originalPhoto')}
                      </span>
                      {drawerCase.evidence &&
                      drawerCase.evidence.find((e) => e.evidence_type === 'original') ? (
                        <img
                          src={
                            drawerCase.evidence.find((e) => e.evidence_type === 'original')
                              .file_path
                          }
                          alt="Citizen original defect"
                          className="w-full h-32 object-cover rounded-2xl border border-slate-200"
                        />
                      ) : (
                        <div className="w-full h-32 bg-slate-100 rounded-2xl border border-slate-200 flex items-center justify-center text-xs text-slate-400">
                          Photo Pending
                        </div>
                      )}
                    </div>

                    {/* After Repair Photo */}
                    <div className="space-y-1">
                      <span className="text-[11px] font-bold text-slate-500">
                        {t('officer.afterPhoto')}
                      </span>
                      {drawerCase.evidence &&
                      drawerCase.evidence.find((e) => e.evidence_type === 'after_repair') ? (
                        <img
                          src={
                            drawerCase.evidence.find((e) => e.evidence_type === 'after_repair')
                              .file_path
                          }
                          alt="Verified after repair"
                          className="w-full h-32 object-cover rounded-2xl border border-emerald-300 ring-2 ring-emerald-100"
                        />
                      ) : (
                        <div className="w-full h-32 bg-slate-50 rounded-2xl border border-dashed border-slate-300 flex items-center justify-center text-center p-3 text-[11px] text-slate-400">
                          {t('officer.noAfterPhoto')}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* OFFICER ACTIONS ROW */}
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
                  <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider">
                    {t('officer.actions')}
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {/* Acknowledge Button */}
                    {!drawerCase.acknowledged_at && (
                      <button
                        onClick={handleAcknowledge}
                        disabled={isAcknowledging}
                        className="px-3 py-2 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        <i className="fa-solid fa-check"></i>
                        <span>
                          {isAcknowledging
                            ? t('officer.acknowledging')
                            : t('officer.acknowledge')}
                        </span>
                      </button>
                    )}

                    {/* Reassign Button */}
                    <button
                      onClick={() => setShowReassignModal(true)}
                      className="px-3 py-2 rounded-full bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold text-xs transition-all flex items-center gap-1.5 cursor-pointer"
                    >
                      <i className="fa-solid fa-arrows-split-up-and-left"></i>
                      <span>{t('officer.reassign')}</span>
                    </button>

                    {/* Override Detection Button */}
                    <button
                      onClick={() => setShowOverrideModal(true)}
                      className="px-3 py-2 rounded-full bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold text-xs transition-all flex items-center gap-1.5 cursor-pointer"
                    >
                      <i className="fa-solid fa-pen-to-square"></i>
                      <span>{t('officer.override')}</span>
                    </button>

                    {/* Verify Fix Button */}
                    <button
                      onClick={() => openClosureModal(drawerCase)}
                      className="px-3.5 py-2 rounded-full bg-sky-500 hover:bg-sky-600 text-white font-bold text-xs shadow-xs transition-all flex items-center gap-1.5 cursor-pointer ml-auto"
                    >
                      <i className="fa-solid fa-camera"></i>
                      <span>{t('officer.verifyFix')}</span>
                    </button>
                  </div>
                </div>

                {/* REJECTED CLOSURE ATTEMPTS (IF ANY) */}
                {drawerTimeline?.rejected_attempts && drawerTimeline.rejected_attempts.length > 0 && (
                  <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 space-y-2">
                    <span className="text-xs font-black text-rose-800 uppercase tracking-wider flex items-center gap-1.5">
                      <i className="fa-solid fa-triangle-exclamation text-rose-600"></i>
                      {t('officer.rejectedAttempts')} ({drawerTimeline.rejected_attempts.length})
                    </span>
                    <div className="space-y-1.5">
                      {drawerTimeline.rejected_attempts.map((att, idx) => (
                        <div
                          key={idx}
                          className="bg-white p-2.5 rounded-xl border border-rose-100 text-xs text-rose-700 space-y-0.5"
                        >
                          <div className="font-bold flex items-center justify-between">
                            <span>Attempt #{idx + 1} (Block #{att.sequence})</span>
                            <span className="text-[10px] text-slate-400">{att.timestamp?.split('T')[0]}</span>
                          </div>
                          <ul className="list-disc list-inside text-[11px] text-rose-600">
                            {(language === 'hi' && att.reasons_hi && att.reasons_hi.length > 0
                              ? att.reasons_hi
                              : att.reasons_en
                            ).map((r, rIdx) => (
                              <li key={rIdx}>{r}</li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 7-STEP TIMELINE */}
                <div className="space-y-3">
                  <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider">
                    {t('officer.timeline')}
                  </h4>
                  <div className="space-y-2">
                    {drawerTimeline?.steps?.map((step) => (
                      <div
                        key={step.sequence}
                        className={`p-3 rounded-2xl border text-xs flex items-start gap-3 ${
                          step.status === 'completed'
                            ? 'bg-emerald-50/50 border-emerald-200 text-slate-800'
                            : step.status === 'current'
                            ? 'bg-sky-50 border-sky-300 text-slate-900 ring-2 ring-sky-100'
                            : 'bg-slate-50 border-slate-200 text-slate-500 opacity-75'
                        }`}
                      >
                        <span
                          className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs shrink-0 mt-0.5 ${
                            step.status === 'completed'
                              ? 'bg-emerald-500 text-white'
                              : step.status === 'current'
                              ? 'bg-sky-500 text-white animate-pulse'
                              : 'bg-slate-300 text-slate-600'
                          }`}
                        >
                          {step.status === 'completed' ? (
                            <i className="fa-solid fa-check text-[10px]"></i>
                          ) : (
                            step.sequence
                          )}
                        </span>
                        <div className="space-y-0.5">
                          <p className="font-bold">
                            {language === 'hi' ? step.name_hi : step.name_en}
                          </p>
                          <p className="text-[11px] text-slate-500">
                            {language === 'hi' ? step.description_hi : step.description_en}
                          </p>
                          <span className="text-[10px] text-slate-400 block">
                            Holder: {language === 'hi' ? step.holder_hi : step.holder_en}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* REASSIGN MODAL */}
      {showReassignModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 space-y-4 shadow-xl border border-slate-100">
            <h3 className="text-sm font-black text-slate-800">{t('officer.reassign')}</h3>
            <form onSubmit={handleReassignSubmit} className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-600 block mb-1">
                  {t('officer.targetDept')}
                </label>
                <select
                  value={reassignDeptId}
                  onChange={(e) => setReassignDeptId(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-slate-200 bg-slate-50 font-bold"
                >
                  <option value={1}>Public Works & Roads Dept (PWD_ROADS)</option>
                  <option value={2}>Sanitation & Solid Waste Management (SANITATION)</option>
                  <option value={3}>Stormwater & Drainage Dept (DRAINAGE)</option>
                </select>
              </div>

              <div>
                <label className="font-bold text-slate-600 block mb-1">
                  Reason for Transfer (Audit Log)
                </label>
                <textarea
                  value={reassignReason}
                  onChange={(e) => setReassignReason(e.target.value)}
                  required
                  placeholder="Enter transfer justification..."
                  className="w-full p-2.5 rounded-xl border border-slate-200 h-20"
                ></textarea>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowReassignModal(false)}
                  className="px-4 py-2 rounded-full bg-slate-100 text-slate-700 font-bold"
                >
                  {t('officer.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={isReassigning}
                  className="px-4 py-2 rounded-full bg-sky-500 hover:bg-sky-600 text-white font-bold"
                >
                  {isReassigning ? t('officer.reassigning') : 'Confirm Transfer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* OVERRIDE DETECTION MODAL */}
      {showOverrideModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 space-y-4 shadow-xl border border-slate-100">
            <h3 className="text-sm font-black text-slate-800">{t('officer.override')}</h3>
            <form onSubmit={handleOverrideSubmit} className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-600 block mb-1">
                  {t('officer.newType')}
                </label>
                <select
                  value={overrideType}
                  onChange={(e) => setOverrideType(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-slate-200 bg-slate-50 font-bold"
                >
                  <option value="pothole">Pothole (सड़क का गड्ढा)</option>
                  <option value="garbage">Garbage Heap (कचरे का ढेर)</option>
                  <option value="waterlogging">Waterlogging (जलभराव)</option>
                </select>
              </div>

              <div>
                <label className="font-bold text-slate-600 block mb-1">
                  {t('officer.newSeverity')}
                </label>
                <select
                  value={overrideSeverity}
                  onChange={(e) => setOverrideSeverity(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-slate-200 bg-slate-50 font-bold"
                >
                  <option value="Low">Low</option>
                  <option value="Medium">Medium</option>
                  <option value="High">High</option>
                </select>
              </div>

              <div>
                <label className="font-bold text-slate-600 block mb-1">
                  Officer Justification Reason
                </label>
                <textarea
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                  required
                  placeholder="Enter reason for modifying AI classification..."
                  className="w-full p-2.5 rounded-xl border border-slate-200 h-20"
                ></textarea>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowOverrideModal(false)}
                  className="px-4 py-2 rounded-full bg-slate-100 text-slate-700 font-bold"
                >
                  {t('officer.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={isOverriding}
                  className="px-4 py-2 rounded-full bg-sky-500 hover:bg-sky-600 text-white font-bold"
                >
                  {isOverriding ? t('officer.overriding') : 'Save Override'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 4. CLOSURE MODAL & REAL VERIFICATION RULES */}
      {closureModalCase && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 space-y-5 shadow-2xl border border-slate-100 my-8">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <span className="w-3 h-3 rounded-full bg-sky-500"></span>
                <h3 className="font-black text-sm text-slate-900">
                  {t('officer.modalTitle')} (#{closureModalCase.id})
                </h3>
              </div>
              <button
                onClick={closeClosureModal}
                className="w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center text-xs cursor-pointer"
              >
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>

            <p className="text-xs text-slate-500 leading-relaxed">
              {t('officer.modalSubtitle')}
            </p>

            {/* LIVE CAMERA / FILE UPLOAD SECTION */}
            <div className="space-y-3">
              {isCameraActive ? (
                <div className="space-y-2">
                  <div className="relative rounded-2xl overflow-hidden bg-black aspect-video border border-slate-200">
                    <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={capturePhotoFromCamera}
                      className="w-full py-2.5 rounded-xl bg-sky-500 hover:bg-sky-600 text-white text-xs font-bold shadow-xs cursor-pointer"
                    >
                      <i className="fa-solid fa-camera mr-1"></i> Capture Photo
                    </button>
                    <button
                      type="button"
                      onClick={stopCamera}
                      className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : capturedPreview ? (
                <div className="relative rounded-2xl overflow-hidden border border-slate-200 bg-slate-100 aspect-video flex items-center justify-center">
                  <img src={capturedPreview} alt="Captured after repair" className="w-full h-full object-cover" />
                  <button
                    onClick={() => {
                      setCapturedBlob(null);
                      setCapturedPreview(null);
                    }}
                    className="absolute top-2 right-2 px-3 py-1 rounded-full bg-slate-900/70 text-white text-xs font-bold hover:bg-slate-900 transition-colors"
                  >
                    {t('officer.retake')}
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={startCamera}
                    className="p-3.5 rounded-2xl border-2 border-dashed border-sky-300 hover:border-sky-500 bg-sky-50/50 hover:bg-sky-50 text-sky-800 text-center font-bold text-xs flex flex-col items-center justify-center gap-1.5 transition-all cursor-pointer"
                  >
                    <i className="fa-solid fa-camera text-sky-600 text-lg"></i>
                    <span>{t('officer.capturePhoto')}</span>
                  </button>

                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="p-3.5 rounded-2xl border-2 border-dashed border-slate-300 hover:border-slate-400 bg-slate-50 hover:bg-slate-100 text-slate-700 text-center font-bold text-xs flex flex-col items-center justify-center gap-1.5 transition-all cursor-pointer"
                  >
                    <i className="fa-solid fa-cloud-arrow-up text-slate-500 text-lg"></i>
                    <span>{t('officer.uploadFallback')}</span>
                  </button>
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                  />
                </div>
              )}
              {cameraError && <p className="text-[11px] text-amber-700 font-semibold">{cameraError}</p>}
            </div>

            {/* DEMO SHORTCUT BUTTONS (DIRECT REAL API SUBMISSION) */}
            <div className="space-y-2 pt-2 border-t border-slate-100">
              <span className="text-[11px] font-black text-slate-600 uppercase tracking-wider block">
                {t('officer.demoShortcutsTitle')}
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {/* 1. Reuse Old Photo (Fails Rule 3) */}
                <button
                  type="button"
                  onClick={() => submitClosureVerification('reuse_old_photo')}
                  disabled={isSubmittingClosure}
                  className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                    activeShortcut === 'reuse_old_photo'
                      ? 'border-rose-400 bg-rose-50 ring-2 ring-rose-200'
                      : 'border-slate-200 bg-slate-50 hover:bg-rose-50/50 hover:border-rose-300'
                  }`}
                >
                  <span className="px-1.5 py-0.5 rounded-md bg-rose-100 text-rose-700 text-[9px] font-black uppercase">
                    DEMO • Rule 3 Test
                  </span>
                  <p className="text-xs font-bold text-slate-800 mt-0.5">
                    {t('officer.shortcutReuse')}
                  </p>
                  <p className="text-[10px] text-slate-500">Reuses original defect photo</p>
                </button>

                {/* 2. Wrong Location (Fails Rule 1) */}
                <button
                  type="button"
                  onClick={() => submitClosureVerification('wrong_location')}
                  disabled={isSubmittingClosure}
                  className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                    activeShortcut === 'wrong_location'
                      ? 'border-rose-400 bg-rose-50 ring-2 ring-rose-200'
                      : 'border-slate-200 bg-slate-50 hover:bg-rose-50/50 hover:border-rose-300'
                  }`}
                >
                  <span className="px-1.5 py-0.5 rounded-md bg-rose-100 text-rose-700 text-[9px] font-black uppercase">
                    DEMO • Rule 1 Test
                  </span>
                  <p className="text-xs font-bold text-slate-800 mt-0.5">
                    {t('officer.shortcutWrongLoc')}
                  </p>
                  <p className="text-[10px] text-slate-500">GPS offset 330m away from site</p>
                </button>

                {/* 3. Defect Still Visible (Fails Rule 4) */}
                <button
                  type="button"
                  onClick={() => submitClosureVerification('defect_still_visible')}
                  disabled={isSubmittingClosure}
                  className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                    activeShortcut === 'defect_still_visible'
                      ? 'border-rose-400 bg-rose-50 ring-2 ring-rose-200'
                      : 'border-slate-200 bg-slate-50 hover:bg-rose-50/50 hover:border-rose-300'
                  }`}
                >
                  <span className="px-1.5 py-0.5 rounded-md bg-rose-100 text-rose-700 text-[9px] font-black uppercase">
                    DEMO • Rule 4 Test
                  </span>
                  <p className="text-xs font-bold text-slate-800 mt-0.5">
                    {t('officer.shortcutDefect')}
                  </p>
                  <p className="text-[10px] text-slate-500">Submits unfixed defect scene</p>
                </button>

                {/* 4. Repaired Scene (Genuine Pass - Case Becomes Resolved) */}
                <button
                  type="button"
                  onClick={() => submitClosureVerification('repaired_scene')}
                  disabled={isSubmittingClosure}
                  className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                    activeShortcut === 'repaired_scene'
                      ? 'border-emerald-400 bg-emerald-50 ring-2 ring-emerald-200'
                      : 'border-slate-200 bg-slate-50 hover:bg-emerald-50/50 hover:border-emerald-300'
                  }`}
                >
                  <span className="px-1.5 py-0.5 rounded-md bg-emerald-100 text-emerald-800 text-[9px] font-black uppercase">
                    DEMO • Genuine Pass
                  </span>
                  <p className="text-xs font-bold text-slate-800 mt-0.5">
                    {t('officer.shortcutGenuine')}
                  </p>
                  <p className="text-[10px] text-slate-500">Clean repaired road, passes all 4</p>
                </button>
              </div>
            </div>

            {/* VERIFICATION EVALUATION PROGRESS / RESULT PANEL */}
            {isSubmittingClosure && (
              <div className="p-4 rounded-2xl bg-sky-50 border border-sky-200 text-sky-800 text-xs flex items-center justify-center gap-2.5 font-bold">
                <i className="fa-solid fa-circle-notch fa-spin text-base text-sky-600"></i>
                <span>{t('officer.evaluating')}</span>
              </div>
            )}

            {closureResult && (
              <div
                className={`p-4 rounded-2xl text-xs space-y-3 border ${
                  closureResult.verified
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                    : 'bg-rose-50 border-rose-200 text-rose-900'
                }`}
              >
                {/* Result Header */}
                <div className="flex items-center justify-between pb-1 border-b border-slate-200/50">
                  <span className="font-black text-xs flex items-center gap-1.5">
                    <i
                      className={`fa-solid ${
                        closureResult.verified ? 'fa-circle-check text-emerald-600' : 'fa-circle-xmark text-rose-600'
                      } text-base`}
                    ></i>
                    {closureResult.verified ? t('officer.verifiedTitle') : t('officer.rejectedTitle')}
                  </span>
                  <span className="text-[10px] font-mono text-slate-500">
                    Hash: {closureResult.evidence_hash?.substring(0, 10)}...
                  </span>
                </div>

                {/* 4 Rules Detailed Pass/Fail List */}
                <div className="space-y-2">
                  {closureResult.rules?.map((rule) => (
                    <div
                      key={rule.rule}
                      className={`p-2.5 rounded-xl border text-xs flex items-start gap-2 ${
                        rule.passed
                          ? 'bg-white/80 border-emerald-200 text-emerald-950'
                          : 'bg-white/80 border-rose-200 text-rose-950 font-bold'
                      }`}
                    >
                      <i
                        className={`fa-solid ${
                          rule.passed
                            ? 'fa-circle-check text-emerald-600'
                            : 'fa-circle-xmark text-rose-600'
                        } mt-0.5 text-xs shrink-0`}
                      ></i>
                      <div className="space-y-0.5">
                        <p className="font-bold text-[11px]">
                          {language === 'hi' ? rule.name_hi : rule.name_en}
                        </p>
                        <p className="text-[10px] text-slate-600 font-normal">
                          {language === 'hi' ? rule.reason_hi : rule.reason_en}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Outcome Note */}
                {closureResult.verified ? (
                  <div className="pt-1 flex items-center justify-between">
                    <span className="text-[11px] font-bold text-emerald-800">
                      Case #{closureResult.case_id} status updated to Resolved in Ledger.
                    </span>
                    <Link
                      to="/app/ledger"
                      className="text-xs font-bold text-emerald-700 underline hover:text-emerald-950"
                    >
                      {t('officer.viewInLedger')}
                    </Link>
                  </div>
                ) : (
                  <p className="text-[11px] text-rose-800 font-semibold pt-1">
                    Failed closure attempt recorded in case audit log and ledger block.
                  </p>
                )}
              </div>
            )}

            {/* Modal Footer */}
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={closeClosureModal}
                className="px-4 py-2 rounded-full text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors cursor-pointer"
              >
                {t('officer.cancel')}
              </button>

              {/* Verify Captured Photo Button (if user took or selected a custom photo) */}
              {capturedBlob && !closureResult && (
                <button
                  type="button"
                  onClick={() => submitClosureVerification(null)}
                  disabled={isSubmittingClosure}
                  className="px-5 py-2 rounded-full text-xs font-bold bg-sky-500 hover:bg-sky-600 text-white shadow-xs transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <i className="fa-solid fa-shield-check"></i>
                  <span>{t('officer.submitClosure')}</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

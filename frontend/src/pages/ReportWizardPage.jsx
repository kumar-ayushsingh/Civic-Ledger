import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { useApp } from '../context/AppContext';

export default function ReportWizardPage() {
  const { lang, setLang, t, textSize, highContrast } = useApp();
  const navigate = useNavigate();

  // Wizard state: 1: Phone, 2: Photo, 3: Location, 4: Problem, 5: Review, 6: Success
  const [step, setStep] = useState(1);

  // Step 1: Phone & OTP
  const [phone, setPhone] = useState('9876543210');
  const [isOtpSent, setIsOtpSent] = useState(false);
  const [demoCode, setDemoCode] = useState('');
  const [showSmsToast, setShowSmsToast] = useState(false);
  const [otpDigits, setOtpDigits] = useState(['', '', '', '', '', '']);
  const [isPhoneVerified, setIsPhoneVerified] = useState(false);
  const [otpToken, setOtpToken] = useState('');
  const [otpError, setOtpError] = useState('');
  const [isRequestingOtp, setIsRequestingOtp] = useState(false);

  // Step 2: Photo Capture
  const videoRef = useRef(null);
  const [mediaStream, setMediaStream] = useState(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState(null);
  const [capturedBlob, setCapturedBlob] = useState(null);
  const [capturedPreview, setCapturedPreview] = useState(null);
  const [photoFilename, setPhotoFilename] = useState('pothole_defect.jpg');

  // Step 3: Location
  const [locationState, setLocationState] = useState('idle'); // 'locating' | 'found' | 'error' | 'demo'
  const [coords, setCoords] = useState({ lat: 28.4095, lng: 77.3180 });
  const [locationLabel, setLocationLabel] = useState('Sector 14 Main Commercial Avenue, Ward 14');
  const [locationWard, setLocationWard] = useState('Ward 14 (Old Faridabad)');
  const [locationError, setLocationError] = useState(null);

  // Step 4: Problem & AI Triage
  const [aiDetection, setAiDetection] = useState({
    type: 'pothole',
    confidence: 0.89,
    bbox: [0.25, 0.35, 0.70, 0.75],
    area_ratio: 0.16,
    mode: 'mock',
  });
  const [selectedType, setSelectedType] = useState('pothole');
  const [severity, setSeverity] = useState('Medium');
  const [isAiCorrect, setIsAiCorrect] = useState(true);
  const [description, setDescription] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(true);

  // Step 5 & 6: Submit & Success
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState(null);
  const [copySuccess, setCopySuccess] = useState(false);

  // Reference input elements
  const otpInputsRef = useRef([]);

  // Cleanup camera stream on unmount or step change
  useEffect(() => {
    return () => {
      if (mediaStream) {
        mediaStream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [mediaStream]);

  // Check Web Speech API support
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setSpeechSupported(false);
    }
  }, []);

  // --------------------------------------------------------------------------
  // STEP 1 HANDLERS (PHONE & SIMULATED OTP)
  // --------------------------------------------------------------------------
  const handleSendCode = async () => {
    if (phone.length < 10) {
      setOtpError(lang === 'hi' ? 'कृपया 10 अंकों का मोबाइल नंबर दर्ज करें' : 'Please enter a valid 10-digit mobile number');
      return;
    }
    setOtpError('');
    setIsRequestingOtp(true);
    try {
      const res = await fetch('/api/otp/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: `+91-${phone}` }),
      });
      const data = await res.json();
      setIsRequestingOtp(false);
      setIsOtpSent(true);
      setDemoCode(data.demo_code);
      setShowSmsToast(true);
    } catch (err) {
      setIsRequestingOtp(false);
      // Fallback demo code
      setIsOtpSent(true);
      setDemoCode('742100');
      setShowSmsToast(true);
    }
  };

  const handleOtpDigitChange = (index, value) => {
    if (!/^\d*$/.test(value)) return;
    const newDigits = [...otpDigits];
    newDigits[index] = value.slice(-1);
    setOtpDigits(newDigits);

    // Auto-advance
    if (value && index < 5 && otpInputsRef.current[index + 1]) {
      otpInputsRef.current[index + 1].focus();
    }

    // Auto-verify when 6 digits are filled
    const fullCode = newDigits.join('');
    if (fullCode.length === 6) {
      verifyOtpCode(fullCode);
    }
  };

  const handleOtpKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !otpDigits[index] && index > 0) {
      otpInputsRef.current[index - 1].focus();
    }
  };

  const verifyOtpCode = async (codeToVerify) => {
    const code = codeToVerify || otpDigits.join('');
    if (code.length < 6) return;

    try {
      const res = await fetch('/api/otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: `+91-${phone}`, code }),
      });
      const data = await res.json();
      if (data.ok) {
        setIsPhoneVerified(true);
        setOtpToken(data.token);
        setOtpError('');
      } else {
        setOtpError(data.detail || 'Invalid code');
      }
    } catch (err) {
      setIsPhoneVerified(true);
      setOtpToken(`sim_otp_${phone}_demo`);
    }
  };

  const handleAutoFillCode = () => {
    if (!demoCode) return;
    const digits = demoCode.split('');
    setOtpDigits(digits);
    verifyOtpCode(demoCode);
  };

  // --------------------------------------------------------------------------
  // STEP 2 HANDLERS (CAMERA & PHOTO CAPTURE)
  // --------------------------------------------------------------------------
  const startCamera = async () => {
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      setMediaStream(stream);
      setIsCameraActive(true);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
    } catch (err) {
      console.warn('Camera access denied or unavailable:', err);
      setCameraError(
        lang === 'hi'
          ? 'कैमरा उपलब्ध नहीं है। कृपया नीचे फोटो फाइल चुनें या डेमो फोटो का उपयोग करें।'
          : 'Live camera unavailable or permission denied. Please choose a photo or select a test image below.'
      );
      setIsCameraActive(false);
    }
  };

  const capturePhotoFromVideo = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(
      (blob) => {
        setCapturedBlob(blob);
        const url = URL.createObjectURL(blob);
        setCapturedPreview(url);
        setPhotoFilename('live_captured_pothole.jpg');
        // Stop camera stream
        if (mediaStream) {
          mediaStream.getTracks().forEach((track) => track.stop());
          setMediaStream(null);
        }
        setIsCameraActive(false);
        triggerAiPreview(blob, 'live_captured_pothole.jpg');
      },
      'image/jpeg',
      0.85
    );
  };

  const handleFileUpload = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    setCapturedBlob(file);
    setPhotoFilename(file.name);
    const url = URL.createObjectURL(file);
    setCapturedPreview(url);
    triggerAiPreview(file, file.name);
  };

  const handleSelectSample = async (sampleType) => {
    // Generate simulated in-memory sample
    const canvas = document.createElement('canvas');
    canvas.width = 400;
    canvas.height = 300;
    const ctx = canvas.getContext('2d');

    // Draw simulated asphalt texture
    ctx.fillStyle = sampleType === 'garbage' ? '#78716c' : (sampleType === 'waterlogging' ? '#38bdf8' : '#334155');
    ctx.fillRect(0, 0, 400, 300);
    ctx.fillStyle = sampleType === 'garbage' ? '#d97706' : (sampleType === 'waterlogging' ? '#0284c7' : '#0f172a');
    ctx.beginPath();
    ctx.arc(200, 150, 70, 0, Math.PI * 2);
    ctx.fill();

    canvas.toBlob((blob) => {
      setCapturedBlob(blob);
      const url = URL.createObjectURL(blob);
      setCapturedPreview(url);
      const fname = `${sampleType}_sample.jpg`;
      setPhotoFilename(fname);
      triggerAiPreview(blob, fname);
    }, 'image/jpeg', 0.85);
  };

  const handleRetake = () => {
    setCapturedBlob(null);
    setCapturedPreview(null);
    startCamera();
  };

  // Run AI Preview detection
  const triggerAiPreview = async (blob, fname) => {
    try {
      const formData = new FormData();
      formData.append('photo', blob, fname);
      const res = await fetch('/api/detector/preview', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (data.ok && data.detection) {
        setAiDetection(data.detection);
        setSelectedType(data.detection.type || 'pothole');
        setSeverity(data.detection.confidence > 0.85 ? 'High' : 'Medium');
      }
    } catch (err) {
      console.warn('AI preview lookup fallback:', err);
    }
  };

  // --------------------------------------------------------------------------
  // STEP 3 HANDLERS (GEOLOCATION & REVERSE ASSET LOOKUP)
  // --------------------------------------------------------------------------
  const requestLocation = () => {
    setLocationState('locating');
    setLocationError(null);

    if (!navigator.geolocation) {
      handleUseDemoLocation();
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setCoords({ lat, lng });
        await lookupStreetAddress(lat, lng);
      },
      (err) => {
        console.warn('Geolocation error:', err);
        setLocationState('error');
        setLocationError(
          lang === 'hi'
            ? 'जीपीएस अनुमति अस्वीकृत। नीचे डेमो स्थान चुनें।'
            : 'GPS permission denied or unavailable. Please use demo location.'
        );
      },
      { timeout: 7000 }
    );
  };

  const lookupStreetAddress = async (lat, lng) => {
    try {
      const res = await fetch(`/api/location/lookup?lat=${lat}&lng=${lng}&defect_type=${selectedType}`);
      const data = await res.json();
      if (data.ok) {
        setLocationLabel(data.address || 'Sector 14 Main Road');
        setLocationWard(data.ward_name || 'Ward 14 (Old Faridabad)');
        setLocationState('found');
      } else {
        handleUseDemoLocation();
      }
    } catch (err) {
      handleUseDemoLocation();
    }
  };

  const handleUseDemoLocation = () => {
    let demoLat = 28.4095;
    let demoLng = 77.3180;
    let label = 'Sector 14 Main Commercial Avenue, Ward 14';
    let ward = 'Ward 14 (Old Faridabad & Central Sector)';

    const saved = localStorage.getItem('civicledger_demo_gps');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.lat && parsed.lng) {
          demoLat = parsed.lat;
          demoLng = parsed.lng;
          if (parsed.name) label = parsed.name;
        }
      } catch (e) {}
    }

    setCoords({ lat: demoLat, lng: demoLng });
    setLocationLabel(label);
    setLocationWard(ward);
    setLocationState('demo');
    setLocationError(null);
  };

  // Trigger location automatically when entering step 3
  useEffect(() => {
    if (step === 3 && locationState === 'idle') {
      requestLocation();
    }
  }, [step]);

  // --------------------------------------------------------------------------
  // STEP 4 HANDLERS (VOICE INPUT & AI CONFIRMATION)
  // --------------------------------------------------------------------------
  const startVoiceInput = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setSpeechSupported(false);
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.lang = lang === 'hi' ? 'hi-IN' : 'en-IN';
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;

      recognition.onstart = () => {
        setIsListening(true);
      };

      recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        setDescription((prev) => (prev ? `${prev} ${transcript}` : transcript));
        setIsListening(false);
      };

      recognition.onerror = () => {
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognition.start();
    } catch (e) {
      setIsListening(false);
      setSpeechSupported(false);
    }
  };

  // --------------------------------------------------------------------------
  // STEP 5: FINAL REPORT SUBMISSION
  // --------------------------------------------------------------------------
  const handleSubmitReport = async () => {
    setIsSubmitting(true);
    try {
      const formData = new FormData();
      // Attach photo
      if (capturedBlob) {
        formData.append('photo', capturedBlob, photoFilename);
      } else {
        // Fallback dummy blob
        const dummyBlob = new Blob(['sample_pothole_bytes'], { type: 'image/jpeg' });
        formData.append('photo', dummyBlob, 'pothole_default.jpg');
      }

      formData.append('lat', coords.lat.toString());
      formData.append('lng', coords.lng.toString());
      formData.append('captured_at', new Date().toISOString());
      formData.append('description', description);
      formData.append('language', lang);
      formData.append('otp_token', otpToken || `sim_otp_${phone}`);

      const res = await fetch('/api/reports', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      setIsSubmitting(false);

      if (res.ok) {
        setSubmitResult(data);
        setStep(6); // Success screen
      } else {
        alert(data.detail?.message || data.detail || 'Report submission failed. Please try again.');
      }
    } catch (err) {
      setIsSubmitting(false);
      alert('Network or server error while submitting report.');
    }
  };

  const copyTrackingLink = () => {
    if (!submitResult) return;
    const url = `${window.location.origin}/track/${submitResult.tracking_token || submitResult.case_id}`;
    navigator.clipboard.writeText(url);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2500);
  };

  // ==========================================================================
  // RENDER: STEP PROGRESS BAR
  // ==========================================================================
  const renderProgressBar = () => {
    if (step === 6) return null; // No progress bar on success
    return (
      <div className="w-full space-y-2 mb-6">
        <div className="flex items-center justify-between text-xs font-bold text-slate-700">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-sky-500 animate-pulse"></span>
            {t('wizard.step')} {step} {t('wizard.of')} 5
          </span>
          {/* Quick Language Toggle */}
          <button
            onClick={() => setLang(lang === 'en' ? 'hi' : 'en')}
            className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 flex items-center gap-1 transition-colors"
            title="Switch Language"
          >
            <i className="fa-solid fa-globe text-sky-600"></i>
            <span>{lang === 'en' ? 'हिंदी में बदलें' : 'English'}</span>
          </button>
        </div>

        {/* 5-Segment Progress Bar */}
        <div className="grid grid-cols-5 gap-1.5 w-full h-2 rounded-full overflow-hidden bg-slate-200">
          {[1, 2, 3, 4, 5].map((s) => (
            <div
              key={s}
              className={`h-full transition-all duration-300 ${
                s <= step ? 'bg-sky-500' : 'bg-transparent'
              }`}
            />
          ))}
        </div>
      </div>
    );
  };

  // ==========================================================================
  // RENDER: STEP 1 (PHONE & OTP)
  // ==========================================================================
  const renderStep1Phone = () => {
    return (
      <div className="space-y-6">
        <div className="space-y-1 text-center sm:text-left">
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
            {t('wizard.phoneTitle')}
          </h2>
          <p className="text-sm text-slate-600 leading-relaxed">
            {t('wizard.phoneSubtitle')}
          </p>
        </div>

        {/* Simulated SMS Toast Alert */}
        {showSmsToast && (
          <div
            id="sms-toast"
            className="p-3.5 rounded-2xl bg-amber-50 border-2 border-amber-300 text-amber-900 shadow-md space-y-2 animate-bounce-once"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 text-amber-800">
                <i className="fa-solid fa-comment-sms text-amber-600 text-sm"></i>
                {lang === 'hi' ? 'सिम्युलेटेड एसएमएस अलर्ट' : 'Simulated SMS Preview'}
              </span>
              <button
                onClick={() => setShowSmsToast(false)}
                className="text-amber-700 hover:text-amber-950 text-xs p-1"
                aria-label="Dismiss toast"
              >
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>
            <p className="text-xs font-semibold text-amber-900">
              {t('wizard.simulatedToast')} <strong className="text-base text-amber-950 bg-amber-200 px-2 py-0.5 rounded-lg tracking-widest">{demoCode}</strong>
            </p>
            <button
              onClick={handleAutoFillCode}
              className="w-full py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <i className="fa-solid fa-wand-magic-sparkles"></i>
              <span>{t('wizard.autoFill')}</span>
            </button>
          </div>
        )}

        {/* Phone Input Box */}
        <div className="space-y-2">
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
            {t('wizard.phonePlaceholder')}
          </label>
          <div className="flex rounded-2xl border-2 border-slate-200 focus-within:border-sky-500 overflow-hidden shadow-xs bg-white">
            <span className="px-3.5 py-3 bg-slate-100 text-slate-700 font-bold text-base flex items-center border-r border-slate-200 select-none">
              +91
            </span>
            <input
              type="tel"
              maxLength={10}
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
              placeholder="9876543210"
              className="w-full px-4 py-3 text-lg font-bold text-slate-900 tracking-wider focus:outline-none"
              disabled={isPhoneVerified}
            />
          </div>
        </div>

        {/* Send Code Action */}
        {!isOtpSent && (
          <button
            onClick={handleSendCode}
            disabled={isRequestingOtp || phone.length < 10}
            className="w-full py-4 rounded-full bg-sky-500 hover:bg-sky-600 disabled:bg-slate-300 text-white font-black text-base shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer min-h-[48px]"
          >
            {isRequestingOtp ? (
              <>
                <i className="fa-solid fa-circle-notch fa-spin"></i>
                <span>Sending code...</span>
              </>
            ) : (
              <>
                <i className="fa-solid fa-paper-plane"></i>
                <span>{t('wizard.sendCode')}</span>
              </>
            )}
          </button>
        )}

        {/* 6-Digit OTP Boxes */}
        {isOtpSent && !isPhoneVerified && (
          <div className="space-y-4 pt-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                {t('wizard.enterCode')}
              </label>
              <button
                onClick={handleSendCode}
                className="text-xs text-sky-600 font-bold hover:underline"
              >
                Resend code
              </button>
            </div>

            <div className="flex justify-between gap-1.5 sm:gap-2">
              {otpDigits.map((digit, idx) => (
                <input
                  key={idx}
                  ref={(el) => (otpInputsRef.current[idx] = el)}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleOtpDigitChange(idx, e.target.value)}
                  onKeyDown={(e) => handleOtpKeyDown(idx, e)}
                  className="w-12 h-14 sm:w-14 sm:h-16 text-center text-xl sm:text-2xl font-black rounded-2xl border-2 border-slate-300 focus:border-sky-500 focus:bg-sky-50/30 text-slate-900 shadow-xs focus:outline-none transition-all"
                  aria-label={`OTP Digit ${idx + 1}`}
                />
              ))}
            </div>

            {otpError && (
              <p className="text-xs text-rose-600 font-bold flex items-center gap-1">
                <i className="fa-solid fa-circle-exclamation"></i>
                {otpError}
              </p>
            )}
          </div>
        )}

        {/* Verified State Check */}
        {isPhoneVerified && (
          <div className="p-4 rounded-2xl bg-emerald-50 border-2 border-emerald-300 text-emerald-900 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold text-sm">
                <i className="fa-solid fa-check"></i>
              </div>
              <div>
                <p className="text-sm font-black text-emerald-900">{t('wizard.verified')}</p>
                <p className="text-xs text-emerald-700">+91 {phone}</p>
              </div>
            </div>
            <span className="text-xs font-bold text-emerald-800 bg-emerald-100 px-3 py-1 rounded-full border border-emerald-300">
              Ready
            </span>
          </div>
        )}

        {/* Continue Button */}
        {isPhoneVerified && (
          <button
            onClick={() => {
              setStep(2);
              startCamera();
            }}
            className="w-full py-4 rounded-full bg-sky-500 hover:bg-sky-600 text-white font-black text-base shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer min-h-[48px]"
          >
            <span>{t('wizard.continueToPhoto')}</span>
            <i className="fa-solid fa-arrow-right"></i>
          </button>
        )}
      </div>
    );
  };

  // ==========================================================================
  // RENDER: STEP 2 (PHOTO CAPTURE / UPLOAD)
  // ==========================================================================
  const renderStep2Photo = () => {
    return (
      <div className="space-y-6">
        <div className="space-y-1 text-center sm:text-left">
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
            {t('wizard.photoTitle')}
          </h2>
          <p className="text-sm text-slate-600 leading-relaxed">
            {t('wizard.photoSubtitle')}
          </p>
        </div>

        {/* Live Camera View */}
        {isCameraActive && !capturedPreview && (
          <div className="relative rounded-3xl overflow-hidden bg-slate-900 aspect-video shadow-md border-2 border-sky-400">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
            />
            {/* Viewfinder crosshairs */}
            <div className="absolute inset-8 border-2 border-dashed border-white/60 rounded-2xl pointer-events-none flex items-center justify-center">
              <span className="text-xs text-white/80 bg-black/40 px-3 py-1 rounded-full backdrop-blur-xs font-medium">
                Aim at defect
              </span>
            </div>

            {/* Bottom Capture Button */}
            <div className="absolute bottom-4 inset-x-0 flex items-center justify-center">
              <button
                onClick={capturePhotoFromVideo}
                className="w-16 h-16 rounded-full bg-white border-4 border-sky-500 shadow-xl flex items-center justify-center text-sky-600 hover:scale-105 active:scale-95 transition-transform cursor-pointer"
                aria-label="Capture photo"
              >
                <div className="w-12 h-12 rounded-full bg-sky-500 text-white flex items-center justify-center">
                  <i className="fa-solid fa-camera text-xl"></i>
                </div>
              </button>
            </div>
          </div>
        )}

        {/* Captured Preview Thumbnail */}
        {capturedPreview && (
          <div className="relative rounded-3xl overflow-hidden border-2 border-emerald-400 bg-slate-900 shadow-md">
            <img
              src={capturedPreview}
              alt="Defect preview"
              className="w-full max-h-72 object-cover mx-auto"
            />
            <div className="absolute top-3 left-3 bg-emerald-600 text-white text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1.5 shadow-md">
              <i className="fa-solid fa-circle-check"></i>
              <span>Photo Captured</span>
            </div>
            <button
              onClick={handleRetake}
              className="absolute top-3 right-3 bg-white/90 hover:bg-white text-slate-800 text-xs font-bold px-3 py-1.5 rounded-full shadow-md flex items-center gap-1.5 cursor-pointer"
            >
              <i className="fa-solid fa-rotate-left text-slate-600"></i>
              <span>{t('wizard.retake')}</span>
            </button>
          </div>
        )}

        {/* Camera Permission / Fallback Options */}
        {(!isCameraActive || cameraError) && !capturedPreview && (
          <div className="border-2 border-dashed border-slate-300 hover:border-sky-400 rounded-3xl p-6 text-center space-y-4 bg-slate-50 transition-colors">
            <div className="w-14 h-14 rounded-full bg-sky-100 text-sky-600 flex items-center justify-center mx-auto text-2xl">
              <i className="fa-solid fa-camera"></i>
            </div>

            {cameraError ? (
              <p className="text-xs text-rose-600 font-semibold">{cameraError}</p>
            ) : (
              <p className="text-sm font-semibold text-slate-700">
                Click below to start your phone's live camera or choose a file
              </p>
            )}

            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button
                onClick={startCamera}
                className="px-6 py-3 rounded-full bg-sky-500 hover:bg-sky-600 text-white text-xs font-bold shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer min-h-[48px]"
              >
                <i className="fa-solid fa-video"></i>
                <span>{t('wizard.openCamera')}</span>
              </button>

              <label className="px-6 py-3 rounded-full bg-white hover:bg-slate-100 border border-slate-300 text-slate-800 text-xs font-bold shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer min-h-[48px]">
                <i className="fa-solid fa-upload text-slate-600"></i>
                <span>{t('wizard.uploadFallback')}</span>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
            </div>
          </div>
        )}

        {/* Demo Test Photos (Fast review without physical camera) */}
        {!capturedPreview && (
          <div className="p-4 rounded-2xl bg-sky-50/60 border border-sky-100 space-y-2">
            <p className="text-xs font-bold text-sky-800 uppercase tracking-wider flex items-center gap-1.5">
              <i className="fa-solid fa-flask text-sky-600"></i>
              {t('wizard.useSample')}
            </p>
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => handleSelectSample('pothole')}
                className="py-2.5 px-2 rounded-xl bg-white hover:bg-sky-100 border border-sky-200 text-slate-800 text-xs font-bold transition-colors cursor-pointer flex flex-col items-center gap-1"
              >
                <i className="fa-solid fa-road text-sky-600"></i>
                <span>{t('wizard.samplePothole')}</span>
              </button>
              <button
                onClick={() => handleSelectSample('garbage')}
                className="py-2.5 px-2 rounded-xl bg-white hover:bg-sky-100 border border-sky-200 text-slate-800 text-xs font-bold transition-colors cursor-pointer flex flex-col items-center gap-1"
              >
                <i className="fa-solid fa-trash-can text-amber-600"></i>
                <span>{t('wizard.sampleGarbage')}</span>
              </button>
              <button
                onClick={() => handleSelectSample('waterlogging')}
                className="py-2.5 px-2 rounded-xl bg-white hover:bg-sky-100 border border-sky-200 text-slate-800 text-xs font-bold transition-colors cursor-pointer flex flex-col items-center gap-1"
              >
                <i className="fa-solid fa-water text-blue-500"></i>
                <span>{t('wizard.sampleWaterlog')}</span>
              </button>
            </div>
          </div>
        )}

        {/* Step Navigation Buttons */}
        <div className="flex gap-3 pt-2">
          <button
            onClick={() => setStep(1)}
            className="w-1/3 py-4 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm transition-colors flex items-center justify-center gap-1.5 cursor-pointer min-h-[48px]"
          >
            <i className="fa-solid fa-arrow-left"></i>
            <span>{t('wizard.back')}</span>
          </button>
          <button
            onClick={() => setStep(3)}
            disabled={!capturedBlob}
            className="w-2/3 py-4 rounded-full bg-sky-500 hover:bg-sky-600 disabled:bg-slate-300 text-white font-black text-sm shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer min-h-[48px]"
          >
            <span>{t('wizard.continueToLocation')}</span>
            <i className="fa-solid fa-arrow-right"></i>
          </button>
        </div>
      </div>
    );
  };

  // ==========================================================================
  // RENDER: STEP 3 (LOCATION CONFIRMATION)
  // ==========================================================================
  const renderStep3Location = () => {
    return (
      <div className="space-y-6">
        <div className="space-y-1 text-center sm:text-left">
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
            {t('wizard.locationTitle')}
          </h2>
          <p className="text-sm text-slate-600 leading-relaxed">
            Automatic GPS verification tags the exact street asset and municipal ward.
          </p>
        </div>

        {/* Locating State */}
        {locationState === 'locating' && (
          <div className="p-8 rounded-3xl bg-sky-50 border border-sky-100 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-sky-100 text-sky-600 flex items-center justify-center mx-auto text-xl">
              <i className="fa-solid fa-location-crosshairs fa-spin"></i>
            </div>
            <p className="text-sm font-bold text-sky-900">{t('wizard.findingLocation')}</p>
            <p className="text-xs text-sky-700">Verifying nearest municipal road asset...</p>
          </div>
        )}

        {/* Map-Style Confirmation Card */}
        {(locationState === 'found' || locationState === 'demo') && (
          <div className="rounded-3xl border-2 border-sky-200 bg-white overflow-hidden shadow-sm space-y-4">
            {/* Stylized SVG Map preview banner */}
            <div className="h-36 bg-gradient-to-r from-sky-100 via-slate-100 to-sky-100 relative overflow-hidden flex items-center justify-center">
              <svg className="absolute inset-0 w-full h-full opacity-30" xmlns="http://www.w3.org/2000/svg">
                <defs>
                  <pattern id="grid" width="24" height="24" patternUnits="userSpaceOnUse">
                    <path d="M 24 0 L 0 0 0 24" fill="none" stroke="#0284c7" strokeWidth="1" />
                  </pattern>
                </defs>
                <rect width="100%" height="100%" fill="url(#grid)" />
              </svg>

              {/* Pulsing GPS Pin */}
              <div className="relative flex items-center justify-center">
                <span className="absolute w-12 h-12 rounded-full bg-sky-400/40 animate-ping"></span>
                <div className="w-10 h-10 rounded-full bg-sky-600 text-white flex items-center justify-center shadow-lg border-2 border-white z-10 text-base">
                  <i className="fa-solid fa-location-dot"></i>
                </div>
              </div>
            </div>

            {/* Street Address Details */}
            <div className="p-5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                  <i className="fa-solid fa-circle-check mr-1"></i>
                  GPS Verified
                </span>
                <span className="text-xs text-slate-600 font-bold">
                  {coords.lat.toFixed(4)}° N, {coords.lng.toFixed(4)}° E
                </span>
              </div>
              <h3 className="text-base sm:text-lg font-black text-slate-900 leading-snug">
                {locationLabel}
              </h3>
              <p className="text-xs text-slate-600 font-medium">
                {locationWard}
              </p>
            </div>
          </div>
        )}

        {/* Location Denied / Error Option: One-tap Demo Location */}
        {locationError && (
          <div className="p-4 rounded-2xl bg-amber-50 border-2 border-amber-300 text-amber-900 space-y-2">
            <p className="text-xs font-bold flex items-center gap-1.5 text-amber-800">
              <i className="fa-solid fa-triangle-exclamation"></i>
              {t('wizard.locationDenied')}
            </p>
            <button
              onClick={handleUseDemoLocation}
              className="w-full py-3 rounded-full bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-xs transition-colors cursor-pointer flex items-center justify-center gap-2 min-h-[48px]"
            >
              <i className="fa-solid fa-map-pin"></i>
              <span>{t('wizard.useDemoLocation')}</span>
            </button>
          </div>
        )}

        {/* Step Navigation Buttons */}
        <div className="flex gap-3 pt-2">
          <button
            onClick={() => setStep(2)}
            className="w-1/3 py-4 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm transition-colors flex items-center justify-center gap-1.5 cursor-pointer min-h-[48px]"
          >
            <i className="fa-solid fa-arrow-left"></i>
            <span>{t('wizard.back')}</span>
          </button>
          <button
            onClick={() => setStep(4)}
            className="w-2/3 py-4 rounded-full bg-sky-500 hover:bg-sky-600 text-white font-black text-sm shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer min-h-[48px]"
          >
            <span>{t('wizard.continueToAI')}</span>
            <i className="fa-solid fa-arrow-right"></i>
          </button>
        </div>
      </div>
    );
  };

  // ==========================================================================
  // RENDER: STEP 4 (AI TRIAGE & VOICE REMARKS)
  // ==========================================================================
  const renderStep4Problem = () => {
    const isMockMode = aiDetection.mode !== 'yolo';

    return (
      <div className="space-y-6">
        <div className="space-y-1 text-center sm:text-left">
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
            {t('wizard.problemTitle')}
          </h2>
          <p className="text-sm text-slate-600 leading-relaxed">
            Our computer vision model analyzed your photo to classify the defect.
          </p>
        </div>

        {/* AI Triage Card in Reference Style */}
        <div className="bg-sky-50/70 rounded-3xl p-5 border-2 border-sky-200 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <span className="text-xs font-bold text-sky-900 flex items-center gap-2">
              <i className="fa-solid fa-microchip text-sky-600 animate-pulse"></i>
              AI Computer Vision Triage Analysis
            </span>
            <div className="flex items-center gap-1.5">
              {isMockMode && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                  Demo detection mode
                </span>
              )}
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-sky-200 text-sky-800">
                {Math.round(aiDetection.confidence * 100)}% Match
              </span>
            </div>
          </div>

          {/* Plain Words Question */}
          <div className="bg-white p-4 rounded-2xl border border-sky-100 space-y-3">
            <p className="text-base font-black text-slate-900">
              {t('wizard.aiQuestion')} <span className="text-sky-600 underline capitalize">{selectedType}</span>. {t('wizard.isThatRight')}
            </p>

            <div className="flex gap-2">
              <button
                onClick={() => setIsAiCorrect(true)}
                className={`flex-1 py-2.5 rounded-full text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                  isAiCorrect
                    ? 'bg-sky-500 text-white shadow-xs'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                }`}
              >
                <i className="fa-solid fa-check"></i>
                <span>{t('wizard.yesCorrect')}</span>
              </button>
              <button
                onClick={() => setIsAiCorrect(false)}
                className={`flex-1 py-2.5 rounded-full text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                  !isAiCorrect
                    ? 'bg-slate-800 text-white shadow-xs'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                }`}
              >
                <i className="fa-solid fa-pen-to-square"></i>
                <span>{t('wizard.changeIssue')}</span>
              </button>
            </div>

            {/* Manual Change Options */}
            {!isAiCorrect && (
              <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-100">
                {['pothole', 'garbage', 'waterlogging'].map((typeKey) => (
                  <button
                    key={typeKey}
                    onClick={() => {
                      setSelectedType(typeKey);
                      setIsAiCorrect(true);
                    }}
                    className={`py-2 px-1 rounded-xl text-xs font-bold capitalize transition-all border ${
                      selectedType === typeKey
                        ? 'bg-sky-50 text-sky-700 border-sky-400'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {typeKey}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Severity Badge */}
          <div className="bg-white p-3.5 rounded-2xl border border-sky-100 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm ${
                severity === 'High' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'
              }`}>
                <i className={`fa-solid ${severity === 'High' ? 'fa-triangle-exclamation' : 'fa-circle-exclamation'}`}></i>
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase text-slate-400">{t('wizard.severity')}</span>
                <p className="text-sm font-bold text-slate-900">{severity} Priority</p>
              </div>
            </div>
            <span className="text-xs text-slate-500 font-medium">
              SLA: {severity === 'High' ? '4h / 3 days' : '24h / 7 days'}
            </span>
          </div>
        </div>

        {/* Optional Description with Voice Input */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              Optional Description or Landmarks
            </label>
            <button
              onClick={startVoiceInput}
              disabled={isListening}
              className={`px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                isListening
                  ? 'bg-rose-100 text-rose-700 animate-pulse'
                  : 'bg-sky-50 text-sky-700 hover:bg-sky-100 border border-sky-200'
              }`}
            >
              <i className={`fa-solid ${isListening ? 'fa-microphone-lines' : 'fa-microphone'}`}></i>
              <span>{isListening ? t('wizard.listening') : t('wizard.voiceInput')}</span>
            </button>
          </div>

          {!speechSupported && (
            <p className="text-xs text-amber-700 bg-amber-50 p-2 rounded-xl border border-amber-200">
              {t('wizard.speechUnsupported')}
            </p>
          )}

          <textarea
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t('wizard.descriptionPlaceholder')}
            className="w-full text-sm p-4 rounded-2xl border-2 border-slate-200 focus:border-sky-500 focus:outline-none bg-white text-slate-900 shadow-xs"
          />
        </div>

        {/* Step Navigation Buttons */}
        <div className="flex gap-3 pt-2">
          <button
            onClick={() => setStep(3)}
            className="w-1/3 py-4 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm transition-colors flex items-center justify-center gap-1.5 cursor-pointer min-h-[48px]"
          >
            <i className="fa-solid fa-arrow-left"></i>
            <span>{t('wizard.back')}</span>
          </button>
          <button
            onClick={() => setStep(5)}
            className="w-2/3 py-4 rounded-full bg-sky-500 hover:bg-sky-600 text-white font-black text-sm shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer min-h-[48px]"
          >
            <span>{t('wizard.continueToReview')}</span>
            <i className="fa-solid fa-arrow-right"></i>
          </button>
        </div>
      </div>
    );
  };

  // ==========================================================================
  // RENDER: STEP 5 (REVIEW & SEND)
  // ==========================================================================
  const renderStep5Review = () => {
    return (
      <div className="space-y-6">
        <div className="space-y-1 text-center sm:text-left">
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
            {t('wizard.reviewTitle')}
          </h2>
          <p className="text-sm text-slate-600 leading-relaxed">
            Please confirm your report before publishing to the transparent public ledger.
          </p>
        </div>

        {/* Summary Card */}
        <div className="rounded-3xl border-2 border-slate-200 bg-white p-5 space-y-4 shadow-sm">
          <div className="flex gap-4 items-center">
            {capturedPreview && (
              <img
                src={capturedPreview}
                alt="Defect"
                className="w-20 h-20 rounded-2xl object-cover border border-slate-200 shrink-0"
              />
            )}
            <div className="space-y-1">
              <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-sky-100 text-sky-800">
                {selectedType}
              </span>
              <h3 className="text-base font-black text-slate-900 capitalize">
                {selectedType} on {locationLabel.split(',')[0]}
              </h3>
              <p className="text-xs text-slate-500 font-medium">
                Severity: <strong className="text-slate-800">{severity}</strong>
              </p>
            </div>
          </div>

          <div className="border-t border-slate-100 pt-3 space-y-2 text-xs">
            <div className="flex justify-between py-1">
              <span className="text-slate-500">Location:</span>
              <span className="font-bold text-slate-800 text-right">{locationLabel}</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-slate-500">Citizen Mobile:</span>
              <span className="font-bold text-slate-800">+91 {phone}</span>
            </div>
            {description && (
              <div className="flex justify-between py-1">
                <span className="text-slate-500">Remarks:</span>
                <span className="font-medium text-slate-700 italic text-right max-w-[200px] truncate">{description}</span>
              </div>
            )}
          </div>
        </div>

        {/* One Big Submit Button */}
        <div className="space-y-3">
          <button
            onClick={handleSubmitReport}
            disabled={isSubmitting}
            className="w-full py-4 rounded-full bg-sky-500 hover:bg-sky-600 disabled:bg-slate-300 text-white font-black text-base sm:text-lg shadow-lg hover:shadow-xl transition-all flex items-center justify-center gap-2 cursor-pointer min-h-[52px]"
          >
            {isSubmitting ? (
              <>
                <i className="fa-solid fa-circle-notch fa-spin"></i>
                <span>{t('wizard.submitting')}</span>
              </>
            ) : (
              <>
                <i className="fa-solid fa-paper-plane"></i>
                <span>{t('wizard.sendReport')}</span>
              </>
            )}
          </button>

          <button
            onClick={() => setStep(4)}
            className="w-full py-3 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition-colors cursor-pointer"
          >
            {t('wizard.back')}
          </button>
        </div>
      </div>
    );
  };

  // ==========================================================================
  // RENDER: SUCCESS SCREEN
  // ==========================================================================
  const renderStep6Success = () => {
    if (!submitResult) return null;
    const trackingUrl = `${window.location.origin}/track/${submitResult.tracking_token || submitResult.case_id}`;

    return (
      <div className="space-y-6 text-center animate-fade-in">
        {/* Celebration Header */}
        <div className="space-y-2">
          <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto text-3xl shadow-sm border border-emerald-200">
            <i className="fa-solid fa-circle-check"></i>
          </div>
          <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
            {t('wizard.successTitle')}
          </h2>
          <p className="text-sm text-slate-600 max-w-md mx-auto">
            Your complaint is cryptographically anchored. The countdown clock has started.
          </p>
        </div>

        {/* Case ID & Department Details */}
        <div className="p-6 rounded-3xl bg-white border-2 border-slate-200 shadow-sm space-y-4 max-w-lg mx-auto text-left">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                {t('wizard.caseId')}
              </span>
              <p className="text-2xl font-black text-sky-600 tracking-tight" id="success-case-id">
                {submitResult.case_id}
              </p>
            </div>
            <span className="px-3 py-1 rounded-full text-xs font-bold bg-sky-100 text-sky-800">
              Clock Active
            </span>
          </div>

          <div className="space-y-2 text-xs">
            <div>
              <span className="text-slate-400">{t('wizard.assignedDept')}:</span>
              <p className="font-bold text-slate-800 text-sm mt-0.5">
                {submitResult.department_name || submitResult.department}
              </p>
            </div>

            {/* Contractor Liability Notice */}
            {submitResult.contract_liability && (
              <div className="p-3 rounded-2xl bg-amber-50 border border-amber-300 text-amber-900 flex items-start gap-2">
                <i className="fa-solid fa-shield-halved text-amber-600 mt-0.5"></i>
                <div className="space-y-0.5">
                  <p className="font-bold text-xs">{t('wizard.contractorLiability')}</p>
                  <p className="text-[11px] text-amber-800 leading-tight">
                    Repair expenses are charged directly to the responsible contractor.
                  </p>
                </div>
              </div>
            )}

            <div>
              <span className="text-slate-400">{t('wizard.deadlineNotice')}:</span>
              <p className="font-bold text-slate-800">
                Acknowledge within {submitResult.deadlines?.acknowledge_hours || 4}h • Resolution in {submitResult.deadlines?.resolve_days || 3} days
              </p>
            </div>
          </div>

          {/* QR Code & Tracking Link */}
          <div className="pt-3 border-t border-slate-100 text-center space-y-3">
            <div className="p-3 bg-slate-50 rounded-2xl inline-block border border-slate-200">
              <QRCodeSVG value={trackingUrl} size={130} title="QR code for tracking this case" aria-label="QR code for tracking this case" />
            </div>
            <p className="text-[11px] text-slate-500 font-medium">
              {t('wizard.qrNotice')}
            </p>

            <div className="flex gap-2">
              <input
                type="text"
                readOnly
                value={trackingUrl}
                className="w-full text-xs px-3 py-2 rounded-xl bg-slate-100 border border-slate-200 text-slate-700 select-all"
              />
              <button
                onClick={copyTrackingLink}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold shrink-0 transition-colors cursor-pointer"
              >
                {copySuccess ? t('wizard.linkCopied') : t('wizard.copyLink')}
              </button>
            </div>
          </div>
        </div>

        {/* Simulated SMS Preview Banner */}
        <div className="p-4 rounded-2xl bg-slate-100 border border-slate-300 max-w-lg mx-auto text-left space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
            <i className="fa-solid fa-mobile-screen text-slate-600"></i>
            {t('wizard.smsPreviewTitle')}
          </span>
          <p className="text-xs font-medium text-slate-700">
            "CivicLedger: Case #{submitResult.case_id} registered for {submitResult.detection?.type || 'defect'}. Track live at {trackingUrl}"
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center max-w-lg mx-auto pt-2">
          <Link
            to={`/track/${submitResult.tracking_token || submitResult.case_id}`}
            className="w-full py-4 rounded-full bg-sky-500 hover:bg-sky-600 text-white font-black text-sm shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer min-h-[48px]"
          >
            <i className="fa-solid fa-clock-rotate-left"></i>
            <span>{t('wizard.trackCase')}</span>
          </Link>
          <Link
            to="/app/ledger"
            className="w-full py-4 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-sm transition-colors flex items-center justify-center gap-2 min-h-[48px]"
          >
            <i className="fa-solid fa-layer-group text-slate-600"></i>
            <span>View in Public Ledger</span>
          </Link>
        </div>
      </div>
    );
  };

  // ==========================================================================
  // MAIN COMPONENT WRAPPER
  // ==========================================================================
  return (
    <div className="max-w-2xl mx-auto py-4 sm:py-8 px-4">
      {renderProgressBar()}

      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 sm:p-8">
        {step === 1 && renderStep1Phone()}
        {step === 2 && renderStep2Photo()}
        {step === 3 && renderStep3Location()}
        {step === 4 && renderStep4Problem()}
        {step === 5 && renderStep5Review()}
        {step === 6 && renderStep6Success()}
      </div>
    </div>
  );
}

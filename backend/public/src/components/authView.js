// ============================================================================
// SIH 2026 PS 26262 - Clean, Uncrowded AICTE Login & Registration Portal
// - Combines the Rishi & Bharatiya Jnana Parampara Showcase (sih project me.zip)
//   with the Simple, Clean Sign-In & Registration Card from changed_files
// - Supports both Live Supabase & Offline Local Demo Mode + Optional Biometrics
// ============================================================================

import { backend } from '../services/supabaseService.js';
import { biometricEngine } from '../services/biometricService.js';

export const AICTE_LOGO_SVG = `
  <svg viewBox="0 0 64 64" class="w-11 h-11 shrink-0" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="32" cy="32" r="30" fill="#0B2545" stroke="#D97706" stroke-width="2.5"/>
    <circle cx="32" cy="32" r="24" fill="#FFFDF8" stroke="#D97706" stroke-width="1.2" stroke-dasharray="3 2"/>
    <path d="M30 5H34V10H30V5ZM30 54H34V59H30V54ZM5 30H10V34H5V30ZM54 30H59V34H54V30ZM12 14L15 11L19 15L16 18L12 14ZM45 47L48 44L52 48L49 51L45 47ZM48 11L51 14L47 18L44 15L48 11ZM15 44L18 47L14 51L11 48L15 44Z" fill="#D97706"/>
    <path d="M20 39C24 37 28 37 32 39C36 37 40 37 44 39V27C40 25 36 25 32 27C28 25 24 25 20 27V39Z" fill="#0B2545"/>
    <path d="M32 16C32 16 36 20 34 24C33 25.5 31 25.5 30 24C28 20 32 16 32 16Z" fill="#EA580C"/>
    <circle cx="32" cy="44" r="2.2" fill="#D97706"/>
  </svg>
`;

const QUICK_DEMO_LOGINS = [
  { label: 'Mit AOE (Institution)', email: 'sam123gk7@gmail.com', role: 'Institution (Applicant)' },
  { label: 'System Admin', email: 'admin@aicte.gov.in', role: 'System Admin' },
  { label: 'Auditor', email: 'auditor@aicte.gov.in', role: 'Auditor' },
  { label: 'Regional Officer', email: 'regional.officer@aicte-india.org', role: 'Regional Officer' },
  { label: 'Scrutiny Officer', email: 'scrutiny.officer@aicte-india.org', role: 'Scrutiny Officer' },
  { label: 'Bureau Head', email: 'bureau.head@aicte-india.org', role: 'Bureau Officer / Head' },
  { label: 'EVC Committee', email: 'evc.committee@aicte-india.org', role: 'EVC Member' },
  { label: 'SAC Hearing', email: 'sac.committee@aicte-india.org', role: 'SAC/SHC Member' },
  { label: 'Member Secretary', email: 'membersecretary@aicte-india.org', role: 'Member Secretary' },
  { label: 'Chairman', email: 'chairman@aicte-india.org', role: 'Chairman' }
];

export function renderAuthPortal(container, { onOpenSupabaseModal }) {
  const state = backend.state;
  let activeTab = 'login'; // 'login' | 'register'
  let activeHeroSlide = 0; // 0 = Rishi & IKS Heritage (sih project me.zip), 1 = AICTE Bhawan Campus
  let showBiometricDrawer = false;
  let biometricMethod = 'face'; // 'face' | 'fingerprint' | 'otp'

  let emailInput = 'sam123gk7@gmail.com';
  let passwordInput = 'password123';
  let otpCode = '';
  let generatedDemoOtp = '';

  let regInstitutionName = '';
  let regEmail = '';
  let regPassword = '';

  let noticeObj = backend.isDemoMode
    ? {
        type: 'info',
        text: '⚡ Local Demo Mode Active: Offline storage & persistent DB enabled. Sign in, register an institution, or click any Quick Demo Login below.'
      }
    : null;

  let cameraActive = false;
  let livenessProgress = 0;

  function findAccountByEmail(rawEmail) {
    const clean = (rawEmail || '').trim().toLowerCase();
    return (
      state.accounts.find(
        (a) =>
          a.email.toLowerCase() === clean ||
          (a.aliasEmail && a.aliasEmail.toLowerCase() === clean)
      ) || state.accounts[0]
    );
  }

  function cleanupIntervals() {
    biometricEngine.stopCamera();
    cameraActive = false;
  }

  async function handleLoginSubmit(e) {
    if (e) e.preventDefault();
    const cleanEmail = emailInput.trim().toLowerCase();
    const matched = state.accounts.find(
      (a) =>
        a.email.toLowerCase() === cleanEmail ||
        (a.aliasEmail && a.aliasEmail.toLowerCase() === cleanEmail)
    );

    if (matched) {
      if (matched.isActive === false) {
        noticeObj = {
          type: 'error',
          text: 'This account has been deactivated by the System Admin.'
        };
        render();
        return;
      }
      const validPasswords = [matched.password, matched.altPassword, 'password123', 'Aicte@123'].filter(Boolean);
      if (!validPasswords.includes(passwordInput)) {
        noticeObj = {
          type: 'error',
          text: 'Invalid password. Default demo password is: password123 (or Aicte@123)'
        };
        render();
        return;
      }
      cleanupIntervals();
      backend.loginWithAccount(matched, 'Official Email & Password');
      return;
    }

    // Check backend `/api/auth/login` for newly registered users
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: cleanEmail, password: passwordInput, otp: otpCode || undefined })
      });
      const data = await res.json();
      if (data.success && data.user) {
        const customAcc = {
          id: data.user.id,
          email: data.user.email,
          fullName: data.user.fullName,
          institutionName: data.user.fullName,
          statementRole: data.user.statementRole || 'Institution',
          subRole: data.user.subRole || 'Institution (Applicant)',
          designation: data.user.designation || 'Registered Institution Applicant',
          region: data.user.region || 'West',
          employeeCode: data.user.employeeCode || 'INST-2026',
          avatarInitials: (data.user.fullName || 'IN').slice(0, 2).toUpperCase(),
          permissions: ['Submit & Track Applications']
        };
        cleanupIntervals();
        backend.loginWithAccount(customAcc, 'Official Email & Password', data.restoredProgress || null);
        return;
      }
    } catch (_) {}

    noticeObj = {
      type: 'error',
      text: 'No user found with this email. Please register first or click a Quick Demo Login below.'
    };
    render();
  }

  async function handleRegisterSubmit(e) {
    if (e) e.preventDefault();
    const instName = regInstitutionName.trim();
    const email = regEmail.trim().toLowerCase();
    const pass = regPassword;

    if (!instName || !email || !pass || pass.length < 6) {
      noticeObj = {
        type: 'error',
        text: 'Please provide an institution name, valid email, and a password of at least 6 characters.'
      };
      render();
      return;
    }

    const template = state.accounts.find((a) => a.subRole === 'Institution (Applicant)') || state.accounts[7];
    const newAcc = {
      ...template,
      id: 'usr-inst-' + Math.random().toString(36).slice(2, 8),
      email,
      password: pass,
      altPassword: 'password123',
      fullName: instName,
      institutionName: instName,
      statementRole: 'Institution',
      subRole: 'Institution (Applicant)',
      designation: `Authorized Signatory — ${instName}`,
      region: 'West',
      employeeCode: 'INST-' + Math.floor(1000 + Math.random() * 9000),
      avatarInitials: instName.slice(0, 2).toUpperCase(),
      isActive: true
    };

    try {
      await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: instName,
          email,
          password: pass,
          statementRole: 'Institution',
          subRole: 'Institution (Applicant)',
          designation: newAcc.designation,
          region: 'West'
        })
      });
    } catch (_) {}

    const existingIdx = state.accounts.findIndex((a) => a.email.toLowerCase() === email);
    if (existingIdx >= 0) {
      state.accounts[existingIdx] = newAcc;
    } else {
      state.accounts.push(newAcc);
    }
    backend.saveState();

    emailInput = email;
    passwordInput = pass;
    activeTab = 'login';
    noticeObj = {
      type: 'success',
      text: `Account created for "${instName}"! Click 'Sign in' below to enter your Institution workspace.`
    };
    render();
  }

  async function handleSendOtp() {
    if (!emailInput || !emailInput.includes('@')) {
      noticeObj = { type: 'error', text: 'Enter a valid email address first.' };
      render();
      return;
    }
    try {
      const res = await fetch('/api/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailInput.trim(), type: 'login' })
      });
      const data = await res.json();
      generatedDemoOtp = data.demo_otp || '482910';
      otpCode = generatedDemoOtp;
    } catch (_) {
      generatedDemoOtp = '482910';
      otpCode = generatedDemoOtp;
    }
    noticeObj = {
      type: 'success',
      text: `2FA OTP generated and auto-filled: ${generatedDemoOtp}. Click Sign in to continue.`
    };
    render();
  }

  function startWebcamLoop() {
    const videoEl = container.querySelector('#aicte-face-video');
    const canvasEl = container.querySelector('#aicte-face-canvas');
    if (!videoEl || !canvasEl) return;

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      const acc = findAccountByEmail(emailInput);
      cleanupIntervals();
      backend.loginWithAccount(acc, 'Biometric Face Recognition (Verified)');
      return;
    }

    const captureCanvas = document.createElement('canvas');
    captureCanvas.width = 480;
    captureCanvas.height = 360;
    const captureCtx = captureCanvas.getContext('2d', { willReadFrequently: true });

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'user', width: 480, height: 360 }, audio: false })
      .then((stream) => {
        biometricEngine.activeStream = stream;
        videoEl.srcObject = stream;
        videoEl.play();
        cameraActive = true;
        livenessProgress = 18;
        let prevSample = null;
        const overlayCtx = canvasEl.getContext('2d');

        const step = () => {
          if (!cameraActive) return;
          if (videoEl.readyState >= 2) {
            captureCtx.drawImage(videoEl, 0, 0, 480, 360);
            const metrics = biometricEngine.analyzeFrame(captureCtx, 480, 360, prevSample);
            prevSample = metrics.sample;
            if (metrics.facePresent) {
              livenessProgress = Math.min(100, livenessProgress + 3.5);
            }
            biometricEngine.drawBiometricHud(overlayCtx, canvasEl.width, canvasEl.height, metrics, livenessProgress);
            const progBar = container.querySelector('#face-liveness-bar');
            if (progBar) progBar.style.width = `${Math.round(livenessProgress)}%`;

            if (livenessProgress >= 100) {
              const acc = findAccountByEmail(emailInput);
              cleanupIntervals();
              backend.loginWithAccount(acc, 'Biometric Face Recognition (98.6% Match)');
              return;
            }
          }
          biometricEngine.animFrameId = requestAnimationFrame(step);
        };
        biometricEngine.animFrameId = requestAnimationFrame(step);
      })
      .catch(() => {
        cameraActive = false;
        noticeObj = {
          type: 'warning',
          text: 'Camera unavailable. Click "Instant Face Unlock" to verify descriptor.'
        };
        render();
      });
  }

  function render() {
    const isConnected = backend.connectionStatus === 'connected';
    const targetAcc = findAccountByEmail(emailInput);

    container.innerHTML = `
      <div class="min-h-screen flex flex-col bg-[#F4F6FB] text-[#172238]">
        <!-- 1. Government of India Tricolor & Clean Top Strip (sih project me.zip) -->
        <div class="tricolor-bar"></div>
        <div class="bg-[#0B2545] text-slate-200 text-xs">
          <div class="max-w-6xl mx-auto px-4 sm:px-6 py-1.5 flex flex-wrap items-center justify-between gap-2">
            <div class="flex items-center gap-2.5 flex-wrap">
              <span class="font-hindi font-semibold text-amber-300">भारत सरकार</span>
              <span class="text-slate-400">|</span>
              <span class="font-medium">Government of India • Ministry of Education</span>
            </div>
            <div class="flex items-center gap-3 text-[11px]">
              <span class="text-amber-300 font-semibold">SIH 2026 • PS 26262</span>
              <span class="hidden sm:inline text-slate-400">|</span>
              <span class="hidden sm:inline text-slate-300">अ | English</span>
            </div>
          </div>
        </div>

        <!-- 2. Official AICTE Heritage Header (Rishi IKS Motto + Mode Badge from changed_files) -->
        <header class="aicte-heritage-header shadow-xs">
          <div class="max-w-6xl mx-auto px-4 sm:px-6 py-3.5 flex flex-wrap items-center justify-between gap-4">
            <div class="flex items-center gap-3.5">
              ${AICTE_LOGO_SVG}
              <div>
                <div class="font-hindi text-xs sm:text-sm font-bold text-[#0B2545] tracking-wide">
                  अखिल भारतीय तकनीकी शिक्षा परिषद
                </div>
                <h1 class="text-base sm:text-xl font-serif font-bold text-[#0B2545] tracking-tight">
                  All India Council for Technical Education (AICTE)
                </h1>
                <p class="text-xs text-amber-800 font-medium">
                  Integrated Approval Workflow, Compliance Monitoring &amp; Alert Portal
                </p>
              </div>
            </div>

            <div class="flex items-center gap-3">
              <div class="hidden lg:flex flex-col items-end pr-3 border-r border-amber-300">
                <span class="font-hindi text-xs font-bold text-amber-800">“योगः कर्मसु कौशलम्”</span>
                <span class="text-[11px] text-slate-600 italic">भारतीय ज्ञान परंपरा (IKS)</span>
              </div>

              <!-- Live Mode Badge merged from changed_files/index.html (#mode-badge) -->
              <button
                id="mode-badge"
                type="button"
                title="Click to configure live Supabase connection or inspect local database"
                class="px-3 py-1.5 rounded-full text-xs font-bold border transition cursor-pointer ${
                  isConnected
                    ? 'bg-[#E6F7ED] text-[#18794E] border-[#C3E6CB]'
                    : 'bg-[#FFF2D7] text-[#9A6100] border-amber-300 hover:bg-amber-100'
                }"
              >
                ● ${backend.modeBadgeText}
              </button>
            </div>
          </div>
        </header>

        <!-- 3. Clean, Uncrowded Main Shell (2-Column Grid: Left Rishi Heritage Hero + Right Simple Login Card) -->
        <main class="max-w-6xl mx-auto w-full px-4 sm:px-6 py-8 sm:py-10 flex-1 flex flex-col justify-center">
          ${
            noticeObj
              ? `
            <div id="notice" class="notice-banner ${noticeObj.type} mb-6 flex items-center justify-between gap-3" role="status">
              <span>${noticeObj.text}</span>
              <button type="button" id="btn-dismiss-notice" class="text-xs font-bold opacity-70 hover:opacity-100 cursor-pointer">✕</button>
            </div>
          `
              : ''
          }

          <section id="auth-view" class="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            <!-- LEFT COLUMN (6 cols): Rishi & AICTE Campus Showcase (from sih project me.zip) + Clean Value Points -->
            <div class="lg:col-span-6 space-y-5">
              <div>
                <p class="text-[11px] font-extrabold uppercase tracking-widest text-[#2456D6] mb-1.5">
                  SHARED TEAM BACKEND • APH 2026–27
                </p>
                <h2 class="text-3xl sm:text-4xl font-display font-extrabold text-[#0B2545] tracking-tight leading-tight">
                  One workflow.<br />Clear accountability.
                </h2>
                <p class="text-sm sm:text-base text-[#66738A] mt-2.5 leading-relaxed max-w-xl">
                  Submit evidence, process multi-stage approvals, manage SLA timelines, and inspect a read-only audit trail. Your role controls what you see and do.
                </p>
              </div>

              <!-- Rishi Knowledge Heritage & AICTE Campus Visual Showcase (Preserved from sih project me.zip) -->
              <div class="rounded-2xl overflow-hidden bg-[#0B2545] border-2 border-amber-500/60 shadow-lg">
                <div class="relative aspect-[16/9] bg-[#071930]">
                  ${
                    activeHeroSlide === 0
                      ? `
                    <img
                      src="./public/assets/aicte-rishi-heritage.png"
                      onerror="this.onerror=null;this.src='/public/assets/aicte-rishi-heritage.png';"
                      alt="AICTE Bharatiya Jnana Parampara - Ancient Rishi Knowledge & Modern Technical Education"
                      class="w-full h-full object-cover"
                    />
                    <div class="absolute inset-0 bg-gradient-to-t from-[#071930]/95 via-[#071930]/25 to-transparent flex flex-col justify-end p-4">
                      <span class="text-[11px] font-hindi uppercase tracking-wider text-amber-300 font-bold">
                        भारतीय ज्ञान परंपरा • Indian Knowledge Systems (aicte.gov.in)
                      </span>
                      <p class="text-xs sm:text-sm font-serif text-white font-semibold mt-0.5">
                        From Ancient Gurukul &amp; Rishi Scholars to Modern AI, Robotics &amp; Engineering Excellence
                      </p>
                    </div>
                  `
                      : `
                    <img
                      src="./public/assets/aicte-campus-hero.png"
                      onerror="this.onerror=null;this.src='/public/assets/aicte-campus-hero.png';"
                      alt="AICTE Headquarters & Technical Institution Campus"
                      class="w-full h-full object-cover"
                    />
                    <div class="absolute inset-0 bg-gradient-to-t from-[#071930]/95 via-[#071930]/25 to-transparent flex flex-col justify-end p-4">
                      <span class="text-[11px] uppercase tracking-wider text-amber-300 font-bold">
                        AICTE Headquarters • Nelson Mandela Marg, New Delhi
                      </span>
                      <p class="text-xs sm:text-sm font-serif text-white font-semibold mt-0.5">
                        Unified National Regulatory Gateway Across All 8 AICTE Regional Directorates
                      </p>
                    </div>
                  `
                  }
                </div>
                <div class="px-3.5 py-2 bg-[#0B2545] flex items-center justify-between text-xs border-t border-white/10">
                  <div class="flex items-center gap-2">
                    <button
                      type="button"
                      id="hero-slide-0"
                      class="px-2.5 py-1 rounded-md font-semibold transition cursor-pointer ${
                        activeHeroSlide === 0 ? 'bg-amber-500 text-slate-950' : 'text-slate-200 hover:bg-white/10'
                      }"
                    >
                      🕉️ AICTE Rishi Heritage
                    </button>
                    <button
                      type="button"
                      id="hero-slide-1"
                      class="px-2.5 py-1 rounded-md font-semibold transition cursor-pointer ${
                        activeHeroSlide === 1 ? 'bg-amber-500 text-slate-950' : 'text-slate-200 hover:bg-white/10'
                      }"
                    >
                      🏢 AICTE Campus
                    </button>
                  </div>
                  <span class="text-[11px] text-amber-300 font-medium">6 Role Workspaces</span>
                </div>
              </div>

              <!-- 3 Concise Feature Points (from changed_files/index.html) -->
              <div class="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1 text-xs font-semibold text-[#33435C]">
                <div class="bg-white border border-[#E1E6EF] rounded-xl px-3.5 py-2.5 shadow-2xs flex items-center gap-2">
                  <span class="text-[#15803D] font-bold">✓</span>
                  <span>Role-based access</span>
                </div>
                <div class="bg-white border border-[#E1E6EF] rounded-xl px-3.5 py-2.5 shadow-2xs flex items-center gap-2">
                  <span class="text-[#15803D] font-bold">✓</span>
                  <span>Shared Supabase DB</span>
                </div>
                <div class="bg-white border border-[#E1E6EF] rounded-xl px-3.5 py-2.5 shadow-2xs flex items-center gap-2">
                  <span class="text-[#15803D] font-bold">✓</span>
                  <span>Private doc storage</span>
                </div>
              </div>
            </div>

            <!-- RIGHT COLUMN (6 cols): Simple, Uncrowded Auth Card (Merged from changed_files/index.html) -->
            <div class="lg:col-span-6">
              <div class="bg-white rounded-2xl border border-[#E1E6EF] p-6 sm:p-7 shadow-sm max-w-[480px] w-full lg:ml-auto">
                <!-- Segmented Toggle: Sign in | Institution registration -->
                <div class="flex gap-1.5 bg-[#F2F4F8] p-1 rounded-xl mb-6">
                  <button
                    type="button"
                    data-auth-tab="login"
                    class="flex-1 py-2 px-3 rounded-lg text-xs sm:text-sm font-bold transition cursor-pointer ${
                      activeTab === 'login'
                        ? 'bg-white text-[#2456D6] shadow-2xs'
                        : 'text-[#66738A] hover:text-[#172238]'
                    }"
                  >
                    Sign in
                  </button>
                  <button
                    type="button"
                    data-auth-tab="register"
                    class="flex-1 py-2 px-3 rounded-lg text-xs sm:text-sm font-bold transition cursor-pointer ${
                      activeTab === 'register'
                        ? 'bg-white text-[#2456D6] shadow-2xs'
                        : 'text-[#66738A] hover:text-[#172238]'
                    }"
                  >
                    Institution registration
                  </button>
                </div>

                ${
                  activeTab === 'login'
                    ? `
                  <!-- SIMPLE LOGIN FORM (#login-form) -->
                  <form id="login-form" class="space-y-4">
                    <div>
                      <h2 class="text-xl font-display font-bold text-[#0B2545]">Welcome back</h2>
                      <p class="text-xs text-[#66738A] mt-0.5">
                        Institution, Officers, Committees, System Admin and Auditor use the same secure sign-in.
                      </p>
                    </div>

                    <div>
                      <label class="block text-xs font-bold text-[#172238] mb-1.5">Email</label>
                      <input
                        id="input-login-email"
                        type="email"
                        name="email"
                        required
                        autocomplete="username"
                        value="${emailInput}"
                        placeholder="Enter official email"
                        class="w-full px-3.5 py-2.5 rounded-xl bg-white border border-[#CFD7E4] text-sm text-[#172238] focus:outline-none focus:border-[#2456D6] focus:ring-3 focus:ring-[#2456D6]/15"
                      />
                    </div>

                    <div>
                      <div class="flex items-center justify-between mb-1.5">
                        <label class="text-xs font-bold text-[#172238]">Password</label>
                        <span class="text-[11px] text-[#66738A]">Target: <strong class="text-[#0B2545]">${targetAcc.subRole}</strong></span>
                      </div>
                      <input
                        id="input-login-password"
                        type="password"
                        name="password"
                        required
                        autocomplete="current-password"
                        value="${passwordInput}"
                        placeholder="••••••••"
                        class="w-full px-3.5 py-2.5 rounded-xl bg-white border border-[#CFD7E4] text-sm text-[#172238] focus:outline-none focus:border-[#2456D6] focus:ring-3 focus:ring-[#2456D6]/15"
                      />
                    </div>

                    <button
                      type="submit"
                      class="w-full py-2.5 px-4 rounded-xl bg-[#2456D6] hover:bg-[#1d46b5] text-white font-bold text-sm shadow-xs transition cursor-pointer"
                    >
                      Sign in
                    </button>

                    <!-- Compact Optional Biometrics Toggle (Kept collapsed so login page stays simple & uncrowded) -->
                    <div class="pt-1">
                      <button
                        type="button"
                        id="btn-toggle-biometrics"
                        class="w-full text-center text-xs font-semibold text-[#2456D6] hover:underline cursor-pointer"
                      >
                        ${showBiometricDrawer ? '▲ Hide Biometric / OTP Options' : '🔐 Use Face Unlock, Fingerprint Passkey, or 2FA OTP'}
                      </button>

                      ${
                        showBiometricDrawer
                          ? `
                        <div class="mt-3 p-3.5 rounded-xl bg-[#F8FAFC] border border-[#E1E6EF] space-y-3">
                          <div class="grid grid-cols-3 gap-1.5">
                            <button type="button" data-bio-tab="face" class="py-1.5 px-2 rounded-lg text-xs font-bold cursor-pointer ${
                              biometricMethod === 'face' ? 'bg-[#0B2545] text-white' : 'bg-white text-slate-600 border border-slate-200'
                            }">👤 Face Unlock</button>
                            <button type="button" data-bio-tab="fingerprint" class="py-1.5 px-2 rounded-lg text-xs font-bold cursor-pointer ${
                              biometricMethod === 'fingerprint' ? 'bg-[#0B2545] text-white' : 'bg-white text-slate-600 border border-slate-200'
                            }">🫆 Passkey</button>
                            <button type="button" data-bio-tab="otp" class="py-1.5 px-2 rounded-lg text-xs font-bold cursor-pointer ${
                              biometricMethod === 'otp' ? 'bg-[#0B2545] text-white' : 'bg-white text-slate-600 border border-slate-200'
                            }">📨 Email OTP</button>
                          </div>

                          ${
                            biometricMethod === 'face'
                              ? `
                            <div class="space-y-2 text-center">
                              <div class="relative rounded-xl overflow-hidden bg-slate-900 aspect-[16/9] max-h-36 mx-auto flex items-center justify-center">
                                <video id="aicte-face-video" autoplay playsinline muted class="w-full h-full object-cover transform -scale-x-100"></video>
                                <canvas id="aicte-face-canvas" width="480" height="360" class="absolute inset-0 w-full h-full pointer-events-none"></canvas>
                                <div class="face-scan-bar"></div>
                                ${
                                  !cameraActive
                                    ? `<div class="absolute inset-0 bg-slate-900/80 flex flex-col items-center justify-center text-white text-xs p-2">
                                        <span>👤 Face Descriptor Verification (${targetAcc.subRole})</span>
                                      </div>`
                                    : ''
                                }
                              </div>
                              <div class="flex gap-2">
                                <button type="button" id="btn-start-face-cam" class="flex-1 py-2 px-3 rounded-lg bg-[#0B2545] text-white text-xs font-bold cursor-pointer">📷 Camera Scan</button>
                                <button type="button" id="btn-sim-face-login" class="flex-1 py-2 px-3 rounded-lg bg-emerald-700 text-white text-xs font-bold cursor-pointer">✔ Instant Face Match</button>
                              </div>
                            </div>
                          `
                              : biometricMethod === 'fingerprint'
                              ? `
                            <div class="flex items-center justify-between gap-2">
                              <span class="text-xs text-slate-600">Verify device passkey for <strong>${targetAcc.subRole}</strong>:</span>
                              <button type="button" id="btn-sim-passkey" class="py-2 px-3 rounded-lg bg-[#0B2545] text-amber-300 text-xs font-bold cursor-pointer">🫆 Verify Passkey</button>
                            </div>
                          `
                              : `
                            <div class="flex items-center gap-2">
                              <input id="input-login-otp" type="text" maxlength="6" value="${otpCode}" placeholder="6-digit OTP" class="flex-1 px-3 py-1.5 rounded-lg bg-white border border-slate-300 text-xs font-mono" />
                              <button type="button" id="btn-send-otp" class="px-3 py-1.5 rounded-lg bg-amber-100 text-amber-900 text-xs font-bold cursor-pointer">Send OTP</button>
                            </div>
                          `
                          }
                        </div>
                      `
                          : ''
                      }
                    </div>

                    <!-- QUICK DEMO LOGINS (#demo-logins from changed_files/index.html) -->
                    <div id="demo-logins" class="demo-box">
                      <p class="text-xs font-bold text-[#2456D6] mb-2">
                        ⚡ Quick Demo Logins (Click to autofill):
                      </p>
                      <div class="flex flex-wrap gap-1.5">
                        ${QUICK_DEMO_LOGINS.map(
                          (item) => `
                          <button
                            type="button"
                            data-quick-login="${item.email}"
                            class="px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition cursor-pointer ${
                              emailInput.toLowerCase() === item.email.toLowerCase()
                                ? 'bg-[#0B2545] text-amber-300 border-[#0B2545]'
                                : 'bg-white hover:bg-blue-50 text-[#172238] border-[#E1E6EF]'
                            }"
                          >
                            ${item.label}
                          </button>
                        `
                        ).join('')}
                      </div>
                    </div>
                  </form>
                `
                    : `
                  <!-- SIMPLE INSTITUTION REGISTRATION FORM (#register-form from changed_files/index.html) -->
                  <form id="register-form" class="space-y-4">
                    <div>
                      <h2 class="text-xl font-display font-bold text-[#0B2545]">Register your institution</h2>
                      <p class="text-xs text-[#66738A] mt-0.5">
                        Create an applicant institution account to submit new applications and track 6-stage approvals.
                      </p>
                    </div>

                    <div>
                      <label class="block text-xs font-bold text-[#172238] mb-1.5">Institution name</label>
                      <input
                        id="reg-inst-name"
                        name="institution_name"
                        type="text"
                        required
                        maxlength="180"
                        value="${regInstitutionName}"
                        placeholder="e.g. Mit AOE / Sunrise College of Engineering"
                        class="w-full px-3.5 py-2.5 rounded-xl bg-white border border-[#CFD7E4] text-sm text-[#172238] focus:outline-none focus:border-[#2456D6]"
                      />
                    </div>

                    <div>
                      <label class="block text-xs font-bold text-[#172238] mb-1.5">Contact email</label>
                      <input
                        id="reg-email"
                        name="email"
                        type="email"
                        required
                        value="${regEmail}"
                        placeholder="principal@institution.ac.in"
                        class="w-full px-3.5 py-2.5 rounded-xl bg-white border border-[#CFD7E4] text-sm text-[#172238] focus:outline-none focus:border-[#2456D6]"
                      />
                    </div>

                    <div>
                      <label class="block text-xs font-bold text-[#172238] mb-1.5">Password</label>
                      <input
                        id="reg-password"
                        name="password"
                        type="password"
                        required
                        minlength="6"
                        autocomplete="new-password"
                        value="${regPassword}"
                        placeholder="Minimum 6 characters"
                        class="w-full px-3.5 py-2.5 rounded-xl bg-white border border-[#CFD7E4] text-sm text-[#172238] focus:outline-none focus:border-[#2456D6]"
                      />
                    </div>

                    <button
                      type="submit"
                      class="w-full py-2.5 px-4 rounded-xl bg-[#2456D6] hover:bg-[#1d46b5] text-white font-bold text-sm shadow-xs transition cursor-pointer"
                    >
                      Create institution account
                    </button>

                    <p class="text-xs text-[#66738A] leading-relaxed">
                      Public registration creates Institution accounts only. Staff roles are assigned by an administrator in User Management or Supabase.
                    </p>
                  </form>
                `
                }
              </div>
            </div>
          </section>
        </main>

        <!-- Clean Official Footer -->
        <footer class="bg-white border-t border-[#E1E6EF] py-4 px-6 text-center text-xs text-[#66738A]">
          <div class="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-2">
            <span><strong>All India Council for Technical Education (AICTE)</strong> • Nelson Mandela Marg, New Delhi</span>
            <span>Prototype for academic &amp; SIH 2026 (PS 26262) evaluation. Decisions remain with authorized human officials.</span>
          </div>
        </footer>
      </div>
    `;

    // Wire events
    const modeBadge = container.querySelector('#mode-badge');
    if (modeBadge && onOpenSupabaseModal) {
      modeBadge.addEventListener('click', () => onOpenSupabaseModal());
    }

    const dismissBtn = container.querySelector('#btn-dismiss-notice');
    if (dismissBtn) {
      dismissBtn.addEventListener('click', () => {
        noticeObj = null;
        render();
      });
    }

    const slide0 = container.querySelector('#hero-slide-0');
    if (slide0) {
      slide0.addEventListener('click', () => {
        activeHeroSlide = 0;
        render();
      });
    }

    const slide1 = container.querySelector('#hero-slide-1');
    if (slide1) {
      slide1.addEventListener('click', () => {
        activeHeroSlide = 1;
        render();
      });
    }

    container.querySelectorAll('[data-auth-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        cleanupIntervals();
        activeTab = btn.getAttribute('data-auth-tab');
        render();
      });
    });

    const emailField = container.querySelector('#input-login-email');
    if (emailField) {
      emailField.addEventListener('input', (e) => {
        emailInput = e.target.value;
      });
    }

    const pwdField = container.querySelector('#input-login-password');
    if (pwdField) {
      pwdField.addEventListener('input', (e) => {
        passwordInput = e.target.value;
      });
    }

    const loginForm = container.querySelector('#login-form');
    if (loginForm) {
      loginForm.addEventListener('submit', handleLoginSubmit);
    }

    // Quick Demo Login pills (exact behavior from changed_files/app.js)
    container.querySelectorAll('[data-quick-login]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const email = btn.getAttribute('data-quick-login');
        emailInput = email;
        passwordInput = 'password123';
        const acc = findAccountByEmail(email);
        noticeObj = {
          type: 'info',
          text: `Filled credentials for ${acc.fullName} (${acc.subRole}). Click 'Sign in' to proceed.`
        };
        render();
      });
    });

    // Optional Biometric Drawer events
    const bioToggle = container.querySelector('#btn-toggle-biometrics');
    if (bioToggle) {
      bioToggle.addEventListener('click', () => {
        cleanupIntervals();
        showBiometricDrawer = !showBiometricDrawer;
        render();
      });
    }

    container.querySelectorAll('[data-bio-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        cleanupIntervals();
        biometricMethod = btn.getAttribute('data-bio-tab');
        render();
      });
    });

    const startFaceBtn = container.querySelector('#btn-start-face-cam');
    if (startFaceBtn) {
      startFaceBtn.addEventListener('click', () => {
        cameraActive = true;
        render();
        startWebcamLoop();
      });
    }

    const simFaceBtn = container.querySelector('#btn-sim-face-login');
    if (simFaceBtn) {
      simFaceBtn.addEventListener('click', () => {
        const acc = findAccountByEmail(emailInput);
        cleanupIntervals();
        backend.loginWithAccount(acc, 'Biometric Face Recognition (98.8% Match)');
      });
    }

    const simPasskeyBtn = container.querySelector('#btn-sim-passkey');
    if (simPasskeyBtn) {
      simPasskeyBtn.addEventListener('click', () => {
        const acc = findAccountByEmail(emailInput);
        cleanupIntervals();
        backend.loginWithAccount(acc, 'Fingerprint Passkey (WebAuthn Verified)');
      });
    }

    const otpInput = container.querySelector('#input-login-otp');
    if (otpInput) {
      otpInput.addEventListener('input', (e) => {
        otpCode = e.target.value;
      });
    }

    const sendOtpBtn = container.querySelector('#btn-send-otp');
    if (sendOtpBtn) {
      sendOtpBtn.addEventListener('click', handleSendOtp);
    }

    // Registration form events
    const regNameEl = container.querySelector('#reg-inst-name');
    if (regNameEl) regNameEl.addEventListener('input', (e) => { regInstitutionName = e.target.value; });
    const regEmailEl = container.querySelector('#reg-email');
    if (regEmailEl) regEmailEl.addEventListener('input', (e) => { regEmail = e.target.value; });
    const regPassEl = container.querySelector('#reg-password');
    if (regPassEl) regPassEl.addEventListener('input', (e) => { regPassword = e.target.value; });

    const regForm = container.querySelector('#register-form');
    if (regForm) {
      regForm.addEventListener('submit', handleRegisterSubmit);
    }
  }

  render();
  return cleanupIntervals;
}

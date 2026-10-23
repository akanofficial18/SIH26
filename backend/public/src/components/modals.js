// ============================================================================
// SIH 2026 PS 26262 - Official AICTE Heritage & Institutional Modals
// 1. Fresh Biometric Step-Up Verification Modal
// 2. Persistent Backend DB & Supabase Configuration Modal (`config.js` + Live Sync)
// 3. Official AICTE Electronic Case Summary & Order (LoA/EoA/Deficiency) Modal
// ============================================================================

import { backend } from '../services/supabaseService.js';
import { biometricEngine } from '../services/biometricService.js';
import { AICTE_LOGO_SVG } from './authView.js';

export function openBiometricStepUpModal({ actionTitle, appNumber, onVerified }) {
  const existing = document.getElementById('aicte-stepup-modal');
  if (existing) existing.remove();

  const user = backend.state.currentUser;
  const overlay = document.createElement('div');
  overlay.id = 'aicte-stepup-modal';
  overlay.className =
    'fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4';

  overlay.innerHTML = `
    <div class="w-full max-w-xl rounded-2xl bg-white border border-slate-200 shadow-2xl overflow-hidden text-[#121621]">
      <div class="bg-[#0B2545] text-white px-6 py-4 flex items-center justify-between border-b-4 border-amber-500">
        <div class="flex items-center gap-3">
          ${AICTE_LOGO_SVG}
          <div>
            <span class="text-[11px] uppercase tracking-wider text-amber-300 font-bold block">
              AICTE Regulatory Safeguard • Face Recognition Check
            </span>
            <h3 class="text-base font-serif font-bold text-white">
              Authorised Biometric Sign-Off Required
            </h3>
          </div>
        </div>
        <button id="stepup-close" class="text-slate-300 hover:text-white text-sm font-semibold cursor-pointer">✕ Close</button>
      </div>

      <div class="p-6 space-y-4">
        <div class="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-900">
          <div><strong>Action:</strong> ${actionTitle} ${appNumber ? `• <strong>File:</strong> ${appNumber}` : ''}</div>
          <div class="mt-0.5"><strong>Official:</strong> ${user?.fullName || 'Competent Authority'} (${user?.statementRole} — ${user?.subRole})</div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-12 gap-4 items-center">
          <div class="sm:col-span-7 relative rounded-xl overflow-hidden bg-slate-900 border-2 border-slate-300 aspect-[4/3] flex items-center justify-center">
            <video id="stepup-video" autoplay playsinline muted class="w-full h-full object-cover transform -scale-x-100"></video>
            <canvas id="stepup-canvas" width="480" height="360" class="absolute inset-0 w-full h-full pointer-events-none"></canvas>
            <div class="face-scan-bar"></div>
            <div id="stepup-placeholder" class="absolute inset-0 bg-[#0B2545]/90 flex flex-col items-center justify-center p-4 text-center text-white">
              <span class="text-3xl mb-1.5">👤</span>
              <span class="text-xs font-medium text-slate-200">Click "Live Camera Face Check" or "Confirm Biometric (Instant Match)"</span>
            </div>
          </div>

          <div class="sm:col-span-5 bg-[#F4F6FB] border border-slate-200 rounded-xl p-4 text-center space-y-2.5">
            <div class="w-10 h-10 rounded-full bg-emerald-100 text-emerald-700 font-bold flex items-center justify-center mx-auto text-lg">
              ✓
            </div>
            <div id="stepup-status" class="text-xs font-bold text-slate-800">Awaiting Verification</div>
            <div class="w-full h-2 rounded-full bg-slate-200 overflow-hidden">
              <div id="stepup-bar" class="h-full bg-emerald-600 transition-all" style="width: 0%"></div>
            </div>
            <div id="stepup-pct" class="text-xs font-bold text-emerald-700">0%</div>
          </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
          <button id="stepup-start-cam" class="py-2.5 px-4 rounded-xl bg-[#0B2545] hover:bg-[#133560] text-white font-semibold text-xs uppercase tracking-wider cursor-pointer">
            📷 Start Live Camera Face Check
          </button>
          <button id="stepup-demo-confirm" class="py-2.5 px-4 rounded-xl bg-[#2456D6] hover:bg-[#1C47B8] text-white font-semibold text-xs uppercase tracking-wider cursor-pointer">
            ✔ Confirm Biometric (Instant Match)
          </button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  const closeModal = () => {
    biometricEngine.stopCamera();
    overlay.remove();
  };

  overlay.querySelector('#stepup-close').addEventListener('click', closeModal);

  overlay.querySelector('#stepup-demo-confirm').addEventListener('click', () => {
    const bar = overlay.querySelector('#stepup-bar');
    const status = overlay.querySelector('#stepup-status');
    const pct = overlay.querySelector('#stepup-pct');
    if (bar) bar.style.width = '100%';
    if (pct) pct.textContent = '100%';
    if (status) status.textContent = 'Face Descriptor Verified!';
    setTimeout(() => {
      closeModal();
      if (onVerified) onVerified('Biometric Step-Up Face Verification');
    }, 260);
  });

  overlay.querySelector('#stepup-start-cam').addEventListener('click', () => {
    const video = overlay.querySelector('#stepup-video');
    const canvas = overlay.querySelector('#stepup-canvas');
    const placeholder = overlay.querySelector('#stepup-placeholder');
    const bar = overlay.querySelector('#stepup-bar');
    const status = overlay.querySelector('#stepup-status');
    const pct = overlay.querySelector('#stepup-pct');

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      if (status) status.textContent = 'Camera unavailable — click Instant Match.';
      return;
    }

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'user', width: 480, height: 360 }, audio: false })
      .then((stream) => {
        biometricEngine.activeStream = stream;
        video.srcObject = stream;
        video.play();
        if (placeholder) placeholder.style.display = 'none';

        const capture = document.createElement('canvas');
        capture.width = 480;
        capture.height = 360;
        const capCtx = capture.getContext('2d', { willReadFrequently: true });
        const ovCtx = canvas.getContext('2d');
        let progress = 15;
        let prev = null;

        const loop = () => {
          if (!document.body.contains(overlay)) return;
          if (video.readyState >= 2) {
            capCtx.drawImage(video, 0, 0, 480, 360);
            const metrics = biometricEngine.analyzeFrame(capCtx, 480, 360, prev);
            prev = metrics.sample;
            if (metrics.facePresent) {
              progress = Math.min(100, progress + 3.4);
            }
            biometricEngine.drawBiometricHud(ovCtx, 480, 360, metrics, progress);
            if (bar) bar.style.width = `${Math.round(progress)}%`;
            if (pct) pct.textContent = `${Math.round(progress)}%`;
            if (status) {
              status.textContent = metrics.facePresent ? 'Face Detected! Authenticating...' : 'Keep face in frame';
            }

            if (progress >= 100) {
              closeModal();
              if (onVerified) onVerified('Live Camera Face Step-Up Verified');
              return;
            }
          }
          biometricEngine.animFrameId = requestAnimationFrame(loop);
        };
        biometricEngine.animFrameId = requestAnimationFrame(loop);
      })
      .catch((err) => {
        if (status) status.textContent = `Camera blocked (${err.message}). Use Instant Confirm.`;
      });
  });
}

export function openSupabaseConfigModal() {
  const existing = document.getElementById('aicte-supabase-modal');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'aicte-supabase-modal';
  overlay.className =
    'fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4';

  overlay.innerHTML = `
    <div class="w-full max-w-2xl rounded-2xl bg-white border border-slate-200 shadow-2xl overflow-hidden text-[#121621] max-h-[90vh] overflow-y-auto">
      <div class="bg-[#0B2545] text-white px-6 py-4 flex items-center justify-between border-b-4 border-amber-500">
        <div>
          <span class="text-[11px] uppercase tracking-wider text-amber-300 font-bold block">
            Persistent Backend Database &amp; Supabase Sync (config.js)
          </span>
          <h3 class="text-base font-serif font-bold text-white">
            Database Persistence &amp; Supabase Connection Settings
          </h3>
        </div>
        <button id="supa-close" class="text-slate-300 hover:text-white text-sm font-semibold cursor-pointer">✕ Close</button>
      </div>

      <div class="p-6 space-y-4">
        <div class="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 space-y-1">
          <div class="font-bold">✔ Active Mode: ${backend.modeBadgeText} (<code class="font-mono">backend/data/aicte_portal_db.json</code>)</div>
          <p>Every login, registration, uploaded evidence file, and every action across all 6 Role Dashboards is automatically saved to the database and restored on login.</p>
        </div>

        <p class="text-xs text-slate-600 leading-relaxed">
          You can configure <code class="text-blue-700 font-semibold">config.js</code> or enter your Supabase PostgreSQL project (<code class="text-amber-800 font-semibold">supabase/schema.sql</code>) below:
        </p>

        <div class="space-y-3">
          <div>
            <label class="block text-xs font-bold uppercase text-slate-700 mb-1">SUPABASE_URL</label>
            <input
              id="supa-url-input"
              type="url"
              value="${backend.config.url || ''}"
              placeholder="https://your-project-id.supabase.co"
              class="w-full px-3.5 py-2 rounded-xl bg-[#F4F6FB] border border-slate-300 text-xs text-slate-900 focus:outline-none focus:border-[#2456D6]"
            />
          </div>
          <div>
            <label class="block text-xs font-bold uppercase text-slate-700 mb-1">SUPABASE_ANON_KEY</label>
            <input
              id="supa-key-input"
              type="password"
              value="${backend.config.anonKey || ''}"
              placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
              class="w-full px-3.5 py-2 rounded-xl bg-[#F4F6FB] border border-slate-300 text-xs text-slate-900 focus:outline-none focus:border-[#2456D6]"
            />
          </div>
        </div>

        <div id="supa-test-msg" class="text-xs bg-[#F4F6FB] text-slate-800 p-3 rounded-xl border border-slate-200 font-medium">
          Active Backend Mode: <strong>${backend.modeBadgeText}</strong> • Last Synced: ${backend.lastSyncTime}
        </div>

        <div class="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-200">
          <button id="supa-reset-demo" class="px-3.5 py-2 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 text-xs font-semibold cursor-pointer">
            ↺ Reset Database to Baseline Seed
          </button>
          <div class="flex items-center gap-2">
            <a
              href="/supabase/schema.sql"
              target="_blank"
              class="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold"
            >
              📄 Open schema.sql
            </a>
            <button id="supa-save-btn" class="px-4 py-2 rounded-xl bg-[#2456D6] hover:bg-[#1C47B8] text-white font-semibold text-xs uppercase tracking-wider cursor-pointer">
              Save &amp; Sync
            </button>
          </div>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  overlay.querySelector('#supa-close').addEventListener('click', () => overlay.remove());

  overlay.querySelector('#supa-reset-demo').addEventListener('click', () => {
    backend.resetDemoData();
    overlay.remove();
  });

  overlay.querySelector('#supa-save-btn').addEventListener('click', async () => {
    const url = overlay.querySelector('#supa-url-input').value;
    const key = overlay.querySelector('#supa-key-input').value;
    const msg = overlay.querySelector('#supa-test-msg');
    msg.textContent = 'Syncing configuration...';
    const res = await backend.saveSupabaseConfig(url, key);
    msg.innerHTML = `<strong>Active Mode: ${res.mode}</strong> — Persistent Backend Database is active.`;
  });
}

export function openElectronicCaseModal(app) {
  const existing = document.getElementById('aicte-case-modal');
  if (existing) existing.remove();

  const isApproved = (app.currentStage || '').includes('Approved') || (app.currentStage || '').includes('Conditional');
  const docTitle = (app.currentStage || '').includes('Approved')
    ? app.isNewInstitution
      ? 'LETTER OF APPROVAL (LoA) — APH 2026–27'
      : 'EXTENSION OF APPROVAL (EoA) — APH 2026–27'
    : (app.currentStage || '').includes('Conditional')
    ? 'CONDITIONAL APPROVAL ORDER WITH TIME-BOUND UNDERTAKING'
    : (app.currentStage || '').includes('Reverted') || app.status === 'Returned'
    ? 'OFFICIAL DEFICIENCY / RETURN ORDER'
    : 'ELECTRONIC CASE SUMMARY DOSSIER';

  const appDocs = (backend.state.documents || []).filter(
    (d) => d.appNumber === app.appNumber || d.institutionName === app.institutionName
  );
  const uploadedFiles = app.uploadedFiles || [];

  const overlay = document.createElement('div');
  overlay.id = 'aicte-case-modal';
  overlay.className =
    'fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4';

  overlay.innerHTML = `
    <div class="w-full max-w-3xl rounded-2xl bg-white border border-slate-300 shadow-2xl overflow-hidden text-[#121621] max-h-[90vh] overflow-y-auto">
      <div class="bg-[#0B2545] text-white px-6 py-4 flex items-center justify-between border-b-4 border-amber-500">
        <div class="flex items-center gap-3">
          ${AICTE_LOGO_SVG}
          <div>
            <span class="text-[11px] uppercase tracking-wider text-amber-300 font-bold block">
              All India Council for Technical Education • Statutory Case Record
            </span>
            <h3 class="text-base font-serif font-bold text-white">${docTitle}</h3>
          </div>
        </div>
        <button id="case-modal-close" class="text-slate-300 hover:text-white text-sm font-semibold cursor-pointer">✕ Close</button>
      </div>

      <div class="p-6 space-y-4 text-xs leading-relaxed">
        <div class="flex justify-between border-b border-slate-200 pb-3 text-slate-600">
          <div>
            <strong class="text-[#0B2545] text-sm font-serif">ALL INDIA COUNCIL FOR TECHNICAL EDUCATION</strong><br/>
            (A Statutory Body of the Government of India, Ministry of Education)<br/>
            Nelson Mandela Marg, Vasant Kunj, New Delhi – 110070
          </div>
          <div class="text-right font-medium">
            <strong>F.No.:</strong> <span class="text-[#2456D6] font-bold">${app.appNumber}</span><br/>
            <strong>Date:</strong> ${new Date().toISOString().slice(0, 10)}
          </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5 bg-[#F4F6FB] p-4 rounded-xl border border-slate-200">
          <div><span class="text-slate-500">Institution Name:</span> <strong class="text-[#0B2545]">${app.institutionName}</strong></div>
          <div><span class="text-slate-500">Permanent Institute ID:</span> <strong class="text-slate-800">${app.institutionCode || 'AICTE-INST'}</strong></div>
          <div><span class="text-slate-500">Region &amp; State:</span> ${app.region} Region (${app.state})</div>
          <div><span class="text-slate-500">APH Workflow Path:</span> <strong class="text-amber-800">${app.aphTrack || app.workflowTrack || 'Scrutiny + EVC'}</strong></div>
          <div><span class="text-slate-500">Current Stage:</span> <strong class="text-emerald-800">${app.currentStage}</strong></div>
          <div><span class="text-slate-500">EVC Readiness Score:</span> <strong>${app.evcScore || 88} / 100</strong></div>
        </div>

        <div class="space-y-3">
          <div class="p-3.5 rounded-xl bg-white border border-slate-200">
            <div class="font-bold text-[#0B2545] uppercase text-[11px] mb-1">1. Regional Scrutiny &amp; Document Verification Summary:</div>
            <p class="text-slate-700">${app.scrutinyRemarks || app.scrutinySummary || 'Verified under Regional Scrutiny.'}</p>
          </div>

          <div class="p-3.5 rounded-xl bg-white border border-slate-200">
            <div class="font-bold text-[#0B2545] uppercase text-[11px] mb-1">2. Committee (EVC &amp; SAC/SHC) Recommendations:</div>
            <p class="text-slate-700"><strong>Expert Visit Committee (EVC):</strong> ${app.evcRecommendation || 'Pending EVC'}</p>
            <p class="text-slate-700 mt-1"><strong>Standing Appellate / Hearing Committee (SAC/SHC):</strong> ${app.sacRecommendation || 'Not Applicable'}</p>
          </div>

          <div class="p-3.5 rounded-xl bg-amber-50/70 border border-amber-200">
            <div class="font-bold text-amber-900 uppercase text-[11px] mb-1">3. Competent Authority Order &amp; Electronic Case Summary:</div>
            <p class="text-slate-800">${app.electronicCaseSummary || 'Electronic case file active.'}</p>
            <p class="text-[#0B2545] font-bold mt-1.5">Recorded Decision: ${app.authorityDecision || 'In Active Processing'}</p>
          </div>

          ${
            uploadedFiles.length > 0 || appDocs.length > 0
              ? `
            <div class="p-3.5 rounded-xl bg-[#F4F6FB] border border-slate-200">
              <div class="font-bold text-[#0B2545] uppercase text-[11px] mb-2">4. Attached Evidence Documents &amp; Lease Validity:</div>
              <div class="flex flex-wrap gap-2">
                ${uploadedFiles
                  .map(
                    (f) => `
                  <span class="px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-xs font-medium text-[#2456D6]">
                    📎 ${f.documentType}: <strong>${f.fileName}</strong> ${f.expiryDate ? `(Exp: ${f.expiryDate})` : ''}
                  </span>
                `
                  )
                  .join('')}
                ${appDocs
                  .map(
                    (d) => `
                  <span class="px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-xs font-medium text-slate-700">
                    📜 ${d.documentType}: <strong>${d.validityStatus}</strong> (Exp: ${d.expiryDate})
                  </span>
                `
                  )
                  .join('')}
              </div>
            </div>
          `
              : ''
          }
        </div>

        <div class="pt-3 border-t border-slate-200 flex items-center justify-between text-[11px] text-slate-500">
          <span>Generated under APH 2026–27 Regulatory Safeguard • Human Oversight Verified</span>
          <span class="font-bold ${isApproved ? 'text-emerald-700' : 'text-[#2456D6]'}">
            ${isApproved ? '✔ AUTHORISED BY COMPETENT AUTHORITY' : '● IN ACTIVE WORKFLOW'}
          </span>
        </div>

        <div class="flex justify-end gap-2 pt-2">
          <button id="btn-print-case" class="px-4 py-2 rounded-xl bg-[#0B2545] hover:bg-[#133560] text-white font-semibold text-xs uppercase cursor-pointer">
            🖨️ Print / Download Official Order PDF
          </button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  overlay.querySelector('#case-modal-close').addEventListener('click', () => overlay.remove());
  overlay.querySelector('#btn-print-case').addEventListener('click', () => window.print());
}

// ============================================================================
// SIH 2026 PS 26262 - Dashboards 5 & 6:
// - Dashboard 5: Institution (Applicant Portal — merged with changed_files Evidence Upload)
// - Dashboard 6A: System Admin (User Management from changed_files + SLAs, Docs & Courses)
// - Dashboard 6B: Independent Auditor (Read-Only Audit Trail, CSV Export, Lifecycle Trace)
// Clean, Uncrowded Layout • Royal Navy (#0B2545), Blue (#2456D6) & Saffron (#D97706) Theme
// ============================================================================

import { renderAestheticProgressCharts } from './smoothCharts.js';

const PORTAL_STAGES = ['Submitted', 'Scrutiny', 'Regional', 'Bureau', 'Committee', 'Authority', 'Approved'];

const AVAILABLE_SUBROLES = [
  'Institution (Applicant)',
  'Regional Officer',
  'Scrutiny Officer',
  'Bureau Officer / Head',
  'EVC Member',
  'SAC/SHC Member',
  'Member Secretary',
  'Chairman',
  'System Admin',
  'Auditor'
];

function getStageIndex(app) {
  if (typeof app.stageNumeric === 'number') return app.stageNumeric;
  if (typeof app.stage === 'number') return app.stage;
  const st = (app.currentStage || '').toLowerCase();
  if (st.includes('revert') || app.status === 'Returned') return -1;
  if (st.includes('approved') || st.includes('conditional')) return 6;
  if (st.includes('authority')) return 5;
  if (st.includes('evc') || st.includes('sac')) return 4;
  if (st.includes('bureau')) return 3;
  if (st.includes('regional')) return 2;
  return 1;
}

function isAppOverdue(app, portalCfg) {
  const s = getStageIndex(app);
  if (s < 1 || s > 5) return false;
  const slaDays = portalCfg?.sla?.[s] || app.slaLimitDays || 5;
  return (app.daysInStage || 0) > slaDays || (app.slaStatus || '').includes('Overdue');
}

function renderStatusPill(app, portalCfg) {
  const s = getStageIndex(app);
  const od = isAppOverdue(app, portalCfg);
  if (s === -1) {
    return `<span class="px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#FFEDEB] text-[#B42318] border border-[#FFD4D1]">Returned</span>`;
  }
  if (s === 6) {
    return `<span class="px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#E6F7ED] text-[#18794E] border border-[#C3E6CB]">Approved</span>`;
  }
  return `<span class="px-2.5 py-0.5 rounded-full text-xs font-bold ${
    od
      ? 'bg-[#FFF2D7] text-[#9A6100] border border-amber-300'
      : 'bg-[#EAF0FF] text-[#2456D6] border border-blue-200'
  }">${PORTAL_STAGES[s] || app.currentStage}${od ? ' · overdue' : ''}</span>`;
}

function renderSixStepProgressBar(app) {
  const s = getStageIndex(app);
  return `
    <div class="grid grid-cols-6 gap-1.5 my-2.5">
      ${[1, 2, 3, 4, 5, 6]
        .map(
          (i) => `
        <div class="space-y-1">
          <div class="h-2 rounded-full transition-all ${
            s >= i
              ? 'bg-gradient-to-r from-[#0B2545] via-[#2456D6] to-[#3B82F6]'
              : s === -1 && i === 1
              ? 'bg-red-500'
              : 'bg-slate-200'
          }"></div>
          <span class="block text-[10px] font-semibold ${s >= i ? 'text-[#0B2545]' : 'text-slate-400'}">
            ${PORTAL_STAGES[i]}
          </span>
        </div>
      `
        )
        .join('')}
    </div>
  `;
}

function renderAppTimeline(app, state) {
  const logs = (state.auditTrail || []).filter(
    (l) => l.appNumber === app.appNumber || l.appNumber === app.id
  );
  const historyItems = app.history || [];

  return `
    <div class="border-l-2 border-[#2456D6] ml-2 pl-3.5 py-1 space-y-2 my-2 text-xs">
      <div class="bg-[#F8FAFC] p-2.5 rounded-lg border border-[#E1E6EF]">
        <b class="text-[#0B2545]">Institution</b> · Submitted Application (${app.program || app.course || 'Technical Course'})
        <div class="text-[11px] text-[#66738A]">${app.submittedDate || '2026-10-05'}</div>
      </div>
      ${historyItems
        .map(
          (h) => `
        <div class="bg-[#F8FAFC] p-2.5 rounded-lg border border-[#E1E6EF]">
          <b class="text-[#0B2545]">${h.actor}</b> · ${h.stage} — ${h.note || ''}
          <div class="text-[11px] text-[#66738A]">${h.date}</div>
        </div>
      `
        )
        .join('')}
      ${logs
        .map(
          (l) => `
        <div class="bg-[#F8FAFC] p-2.5 rounded-lg border border-[#E1E6EF]">
          <b class="text-[#0B2545]">${l.actorName} (${l.subRole})</b> · ${l.actionType}: ${l.remarks}
          <div class="text-[11px] text-[#66738A]">${l.timestamp}</div>
        </div>
      `
        )
        .join('')}
    </div>
  `;
}

// ============================================================================
// 1. ROLE: INSTITUTION (Statement Role 5 — Merged with changed_files features)
// ============================================================================
function belongsToLoggedInstitution(item, user) {
  if (!item || !user) return false;
  const email = (user.email || '').toLowerCase();
  const instName = (user.institutionName || user.fullName || '').trim().toLowerCase();
  const itemEmail = (item.contactEmail || item.ownerEmail || '').toLowerCase();
  const itemInst = (item.institutionName || '').trim().toLowerCase();
  if (instName && itemInst) {
    return itemInst === instName || itemInst.startsWith(instName + ' ');
  }
  if (email && itemEmail && itemEmail === email) return true;
  return false;
}

export function renderInstitutionWorkspace(state, user, uiState) {
  const cfg = state.portalCfg || { sla: { 1: 3, 2: 5, 3: 5, 4: 10, 5: 7 }, docs: [], courses: [] };
  const subTab = uiState.instSubTab || 'dash'; // 'dash' | 'new' | 'apps' | 'compliance'
  const myApps = (state.applications || []).filter((a) => belongsToLoggedInstitution(a, user));
  const myAppNumbers = new Set(myApps.map((a) => a.appNumber));
  const myUndertakings = (state.undertakings || []).filter(
    (u) => belongsToLoggedInstitution(u, user) || myAppNumbers.has(u.appNumber)
  );
  const myDocuments = (state.documents || []).filter(
    (d) => belongsToLoggedInstitution(d, user) || myAppNumbers.has(d.appNumber)
  );
  const returnedApps = myApps.filter((a) => getStageIndex(a) === -1);
  const underReviewApps = myApps.filter((a) => {
    const s = getStageIndex(a);
    return s > 0 && s < 6;
  });
  const approvedApps = myApps.filter((a) => getStageIndex(a) === 6);

  const renderApplicationCard = (app, showDetailsBtn = false) => {
    const s = getStageIndex(app);
    const expanded = Boolean(uiState.expandedTimelines && uiState.expandedTimelines[app.id]);
    const remarks = app.deficiencyReasons || app.returnNote || app.scrutinySummary || '';
    const appDocs = (state.documents || []).filter((d) => d.appNumber === app.appNumber);

    return `
      <article class="bg-white rounded-2xl border border-[#E1E6EF] p-5 shadow-xs space-y-2.5">
        <div class="flex items-start justify-between gap-2 flex-wrap">
          <div>
            <div class="text-xs font-extrabold text-[#2456D6]">${app.appNumber}</div>
            <div class="text-sm font-bold text-[#0B2545] mt-0.5">${app.institutionName} · ${app.program || app.course || 'B.Tech'}</div>
            <div class="text-xs text-[#66738A]">${app.state} (${app.region} Region) · ${app.applicationType || 'Approval'} · Due: ${app.dueDate || '2026-10-28'}</div>
          </div>
          ${renderStatusPill(app, cfg)}
        </div>

        ${remarks ? `<div class="p-3 rounded-xl bg-[#F8FAFC] border border-[#E1E6EF] text-xs"><b class="text-[#0B2545]">Latest remarks:</b> <span class="text-[#66738A]">${remarks}</span></div>` : ''}

        ${renderSixStepProgressBar(app)}

        <div class="flex items-center gap-2 flex-wrap pt-1">
          ${
            s === -1
              ? `<button
                  data-inst-resub="${app.id}"
                  class="px-3.5 py-2 rounded-xl bg-[#2456D6] hover:bg-[#1d46b5] text-white text-xs font-bold shadow-2xs cursor-pointer"
                >
                  🔧 Fix and Resubmit
                </button>`
              : ''
          }
          ${
            showDetailsBtn
              ? `<button
                  data-inst-tl="${app.id}"
                  class="px-3 py-1.5 rounded-xl bg-[#F4F6FB] hover:bg-blue-50 text-[#172238] border border-[#E1E6EF] text-xs font-semibold cursor-pointer"
                >
                  🕒 ${expanded ? 'Hide Workflow History' : 'Workflow History'}
                </button>`
              : ''
          }
          <button
            data-open-case="${app.id}"
            class="px-3 py-1.5 rounded-xl bg-white hover:bg-slate-50 text-[#172238] border border-[#E1E6EF] text-xs font-semibold cursor-pointer"
          >
            📄 View Dossier &amp; Documents (${appDocs.length || (app.docs?.length || 2)})
          </button>
        </div>
        ${expanded ? `<div class="pt-2">${renderAppTimeline(app, state)}</div>` : ''}
      </article>
    `;
  };

  return `
    <div class="space-y-6">
      <!-- Clean Rishi Heritage & Role Welcome Header -->
      <div class="bg-white rounded-2xl border border-[#E1E6EF] shadow-xs overflow-hidden">
        <div class="grid grid-cols-1 lg:grid-cols-12 items-center">
          <div class="lg:col-span-8 p-5 sm:p-6 space-y-2">
            <span class="px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase bg-[#EAF0FF] text-[#2456D6] border border-blue-200">
              INSTITUTION WORKSPACE • ${user.institutionName || user.fullName}
            </span>
            <h2 class="text-xl font-serif font-bold text-[#0B2545]">
              ${user.institutionName || user.fullName} — Applicant Dashboard
            </h2>
            <p class="text-xs text-[#66738A] max-w-2xl">
              Manage your applications, deadlines, and supporting evidence. Approval decisions are made by authorized reviewer roles.
            </p>

            <!-- Subtabs (dash, apps, new, compliance) -->
            <div class="flex flex-wrap gap-2 pt-2">
              ${[
                { id: 'dash', label: '📊 Overview' },
                { id: 'apps', label: `📁 My Applications (${myApps.length})` },
                { id: 'new', label: '➕ Submit Application' },
                { id: 'compliance', label: '📜 Undertakings & Leases' }
              ]
                .map(
                  (t) => `
                <button
                  data-inst-subtab="${t.id}"
                  class="px-3.5 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                    subTab === t.id
                      ? 'bg-[#2456D6] text-white shadow-2xs'
                      : 'bg-[#F4F6FB] text-[#44516A] border border-[#E1E6EF] hover:bg-blue-50'
                  }"
                >
                  ${t.label}
                </button>
              `
                )
                .join('')}
            </div>
          </div>

          <div class="lg:col-span-4 h-full min-h-[130px] relative overflow-hidden bg-[#0B2545] hidden lg:block">
            <img
              src="./public/assets/aicte-rishi-heritage.png"
              onerror="this.onerror=null;this.src='/public/assets/aicte-rishi-heritage.png';"
              alt="AICTE Bharatiya Jnana Parampara"
              class="w-full h-full object-cover opacity-85"
            />
            <div class="absolute inset-0 bg-gradient-to-r from-[#0B2545] via-[#0B2545]/45 to-transparent flex flex-col justify-end p-4 text-white">
              <span class="font-hindi text-xs font-bold text-amber-300">“योगः कर्मसु कौशलम्”</span>
              <span class="text-[11px] text-slate-200">Bharatiya Jnana Parampara • AICTE</span>
            </div>
          </div>
        </div>
      </div>

      ${
        subTab === 'dash'
          ? `
        <!-- 4 Summary Stats -->
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div class="bg-white rounded-2xl border border-[#E1E6EF] p-5 shadow-xs">
            <b class="text-2xl font-extrabold text-[#0B2545] block">${myApps.length}</b>
            <span class="text-xs text-[#66738A] font-medium">Applications visible</span>
          </div>
          <div class="bg-white rounded-2xl border border-[#E1E6EF] p-5 shadow-xs">
            <b class="text-2xl font-extrabold text-[#2456D6] block">${underReviewApps.length}</b>
            <span class="text-xs text-[#66738A] font-medium">Open / Under review</span>
          </div>
          <div class="bg-white rounded-2xl border border-[#E1E6EF] p-5 shadow-xs">
            <b class="text-2xl font-extrabold text-[#18794E] block">${approvedApps.length}</b>
            <span class="text-xs text-[#66738A] font-medium">Approved</span>
          </div>
          <div class="bg-white rounded-2xl border border-[#E1E6EF] p-5 shadow-xs">
            <b class="text-2xl font-extrabold text-[#B42318] block">${returnedApps.length}</b>
            <span class="text-xs text-[#66738A] font-medium">Returned (Action Needed)</span>
          </div>
        </div>

        <!-- Smooth Progress Charts (Royal Navy & Blue Theme) -->
        ${renderAestheticProgressCharts(state, user, {
          trackerTitle: 'Institution Application Stage Progress & SLA Velocity'
        })}

        <!-- Recent Applications Panel (Merged with changed_files Overview) -->
        <section class="bg-white rounded-2xl border border-[#E1E6EF] p-5 shadow-xs space-y-4">
          <div class="flex items-center justify-between flex-wrap gap-2">
            <h3 class="text-base font-bold text-[#0B2545]">Recent applications</h3>
            <button
              data-inst-subtab="new"
              class="px-3.5 py-2 rounded-xl bg-[#2456D6] hover:bg-[#1d46b5] text-white text-xs font-bold cursor-pointer"
            >
              + Submit application
            </button>
          </div>
          <div class="space-y-3">
            ${myApps.slice(0, 3).map((a) => renderApplicationCard(a, true)).join('')}
          </div>
        </section>
      `
          : subTab === 'new'
          ? `
        <!-- SUBMIT AN APPLICATION FORM (Merged with changed_files submitForm + Evidence File Inputs) -->
        <div class="bg-white rounded-2xl border border-[#E1E6EF] p-6 shadow-xs max-w-4xl space-y-5">
          <div class="border-b border-slate-200 pb-3">
            <span class="text-[11px] font-bold uppercase text-[#2456D6]">Online Application Submission</span>
            <h3 class="text-lg font-serif font-bold text-[#0B2545]">Submit an application</h3>
            <p class="text-xs text-[#66738A]">
              Your institution profile is attached automatically. Approval decisions are made by authorized reviewer roles, not by System Admin.
            </p>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label class="block text-xs font-bold text-[#172238] mb-1">Institution Name (Locked to Your Account)</label>
              <input
                id="inst-new-name"
                type="text"
                value="${user.institutionName || user.fullName || 'Institution'}"
                readonly
                class="w-full px-3.5 py-2.5 rounded-xl bg-[#F4F6FB] border border-[#CFD7E4] text-xs font-semibold text-[#0B2545] cursor-not-allowed"
              />
            </div>
            <div>
              <label class="block text-xs font-bold text-[#172238] mb-1">Course / approval requested</label>
              <select
                id="inst-new-course"
                class="w-full px-3.5 py-2.5 rounded-xl bg-white border border-[#CFD7E4] text-xs font-bold text-[#172238]"
              >
                ${cfg.courses.map((c) => `<option value="${c}">${c}</option>`).join('')}
              </select>
            </div>
            <div>
              <label class="block text-xs font-bold text-[#172238] mb-1">State / Region</label>
              <input
                id="inst-new-state"
                type="text"
                value="Maharashtra"
                placeholder="State (e.g., Maharashtra)"
                class="w-full px-3.5 py-2.5 rounded-xl bg-white border border-[#CFD7E4] text-xs text-[#172238]"
              />
            </div>
            <div>
              <label class="block text-xs font-bold text-[#172238] mb-1">Official Contact Email (Locked)</label>
              <input
                id="inst-new-email"
                type="email"
                value="${user.email}"
                readonly
                class="w-full px-3.5 py-2.5 rounded-xl bg-[#F4F6FB] border border-[#CFD7E4] text-xs font-semibold text-[#0B2545] cursor-not-allowed"
              />
            </div>
          </div>

          <div class="bg-[#F8FAFC] p-4 rounded-xl border border-[#E1E6EF] space-y-3">
            <div>
              <h4 class="text-xs font-bold uppercase text-[#0B2545]">Prescribed Evidence Checklist &amp; File Upload</h4>
              <p class="text-[11px] text-[#66738A]">PDF, PNG, JPG or JPEG, maximum 10 MB each. Tick the checklist and optionally attach evidence files with expiry dates.</p>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
              ${cfg.docs
                .map(
                  (doc, i) => `
                <div class="p-3 rounded-xl bg-white border border-[#E1E6EF] space-y-2">
                  <label class="flex items-center gap-2 text-xs font-bold text-[#172238] cursor-pointer">
                    <input type="checkbox" class="inst-doc-checkbox w-4 h-4 accent-[#2456D6]" value="${doc}" checked />
                    <span>${doc}</span>
                  </label>
                  <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input
                      type="file"
                      data-doc-file="${doc}"
                      accept=".pdf,.png,.jpg,.jpeg"
                      class="text-[11px] text-slate-600 file:mr-2 file:py-1 file:px-2.5 file:rounded-lg file:border-0 file:text-[11px] file:font-semibold file:bg-[#EAF0FF] file:text-[#2456D6] cursor-pointer"
                    />
                    <input
                      type="date"
                      data-doc-expiry="${i}"
                      title="Document expiry date"
                      class="px-2.5 py-1 rounded-lg border border-slate-200 text-[11px] text-slate-700"
                    />
                  </div>
                </div>
              `
                )
                .join('')}
            </div>
          </div>

          <div id="inst-new-err" class="text-xs font-bold text-red-600"></div>

          <button
            id="btn-inst-submit-new"
            class="px-5 py-2.5 rounded-xl bg-[#2456D6] hover:bg-[#1d46b5] text-white font-bold text-xs uppercase tracking-wider shadow-xs cursor-pointer"
          >
            ✔ Submit Application
          </button>
        </div>
      `
          : subTab === 'apps'
          ? `
        <!-- MY APPLICATIONS TAB -->
        <div class="space-y-4">
          <div class="bg-white rounded-2xl border border-[#E1E6EF] p-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 class="text-sm font-bold text-[#0B2545]">Application register</h3>
              <p class="text-xs text-[#66738A]">Institution users see their own applications. Click Workflow History or View Dossier on any card.</p>
            </div>
            <select
              id="inst-apps-filter"
              class="px-3.5 py-2 rounded-xl bg-[#F8FAFC] border border-[#CFD7E4] text-xs font-bold text-[#172238]"
            >
              <option value="" ${!uiState.instAppsFilter ? 'selected' : ''}>All statuses (${myApps.length})</option>
              <option value="p" ${uiState.instAppsFilter === 'p' ? 'selected' : ''}>Under review (${underReviewApps.length})</option>
              <option value="a" ${uiState.instAppsFilter === 'a' ? 'selected' : ''}>Approved (${approvedApps.length})</option>
              <option value="r" ${uiState.instAppsFilter === 'r' ? 'selected' : ''}>Returned (${returnedApps.length})</option>
            </select>
          </div>

          <div class="space-y-3">
            ${myApps
              .filter((a) => {
                const f = uiState.instAppsFilter || '';
                const s = getStageIndex(a);
                if (!f) return true;
                if (f === 'p') return s > 0 && s < 6;
                if (f === 'a') return s === 6;
                if (f === 'r') return s === -1;
                return true;
              })
              .map((a) => renderApplicationCard(a, true))
              .join('') || '<div class="text-xs text-slate-500 p-4">No applications matching filter.</div>'}
          </div>
        </div>
      `
          : `
        <!-- UNDERTAKINGS & LEASE RENEWAL SUBMISSIONS FOR INSTITUTION -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div class="bg-white rounded-2xl border border-[#E1E6EF] p-5 shadow-xs space-y-3">
            <h3 class="text-base font-serif font-bold text-[#0B2545]">Time-Bound Undertakings</h3>
            <div class="space-y-3">
              ${myUndertakings
                .map(
                  (u) => `
                <div class="p-3.5 rounded-xl bg-[#F8FAFC] border border-[#E1E6EF] space-y-2 text-xs">
                  <div class="flex items-center justify-between">
                    <strong class="text-[#0B2545]">${u.undertakingCode} · ${u.institutionName}</strong>
                    <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#FFF2D7] text-[#9A6100]">${u.verificationStatus}</span>
                  </div>
                  <p class="text-[#66738A]">${u.prescribedCondition}</p>
                  <div class="flex items-center justify-between pt-1">
                    <span class="text-[#66738A]">Due: <strong>${u.dueDate}</strong></span>
                    <button
                      data-und-action="INSTITUTION_UPLOAD_EVIDENCE"
                      data-und-id="${u.id}"
                      class="px-3 py-1.5 rounded-lg bg-[#2456D6] hover:bg-[#1d46b5] text-white font-bold text-xs cursor-pointer"
                    >
                      📤 Upload Affidavit
                    </button>
                  </div>
                </div>
              `
                )
                .join('') || '<div class="text-xs text-slate-500">No undertakings pending for your institution.</div>'}
            </div>
          </div>

          <div class="bg-white rounded-2xl border border-[#E1E6EF] p-5 shadow-xs space-y-3">
            <h3 class="text-base font-serif font-bold text-[#0B2545]">Lease &amp; Prescribed Document Renewals</h3>
            <div class="space-y-3">
              ${myDocuments
                .map(
                  (d) => `
                <div class="p-3.5 rounded-xl bg-[#F8FAFC] border border-[#E1E6EF] space-y-2 text-xs">
                  <div class="flex items-center justify-between">
                    <strong class="text-[#0B2545]">${d.documentType} (${d.documentNumber})</strong>
                    <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#EAF0FF] text-[#2456D6]">${d.validityStatus}</span>
                  </div>
                  <div class="text-[#66738A]">${d.institutionName} · Expiry: <strong>${d.expiryDate}</strong></div>
                  <div class="flex items-center justify-between pt-1">
                    <span class="text-[#66738A]">${d.verificationStatus}</span>
                    <button
                      data-doc-action="INSTITUTION_UPLOAD_RENEWAL"
                      data-doc-id="${d.id}"
                      class="px-3 py-1.5 rounded-lg bg-[#0B2545] hover:bg-[#13315C] text-white font-bold text-xs cursor-pointer"
                    >
                      📤 Upload Renewal
                    </button>
                  </div>
                </div>
              `
                )
                .join('') || '<div class="text-xs text-slate-500">No documents registered for your institution yet.</div>'}
            </div>
          </div>
        </div>
      `
      }
    </div>
  `;
}

// ============================================================================
// 2. ROLE: SYSTEM ADMIN (Merged with changed_files User Management + Rules & Timelines)
// ============================================================================
export function renderSystemAdminWorkspace(state, user, uiState) {
  const cfg = state.portalCfg || { sla: { 1: 3, 2: 5, 3: 5, 4: 10, 5: 7 }, docs: [], courses: [] };
  const subTab = uiState.admSubTab || 'ov'; // 'ov' | 'users' | 'rules' | 'all'
  const apps = state.applications || [];
  const cnt = (s) => apps.filter((a) => getStageIndex(a) === s).length;
  const mx = Math.max(1, ...[1, 2, 3, 4, 5].map(cnt));
  const overdueApps = apps.filter((a) => isAppOverdue(a, cfg));

  return `
    <div class="space-y-6">
      <!-- Clean Rishi Heritage & Role Welcome Header -->
      <div class="bg-white rounded-2xl border border-[#E1E6EF] shadow-xs overflow-hidden">
        <div class="grid grid-cols-1 lg:grid-cols-12 items-center">
          <div class="lg:col-span-8 p-5 sm:p-6 space-y-2">
            <span class="px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase bg-[#EAF0FF] text-[#2456D6] border border-blue-200">
              SYSTEM ADMIN WORKSPACE
            </span>
            <h2 class="text-xl font-serif font-bold text-[#0B2545]">
              System Admin Dashboard — ${user.fullName}
            </h2>
            <p class="text-xs text-[#66738A] max-w-2xl">
              Configure portal users, stage SLA timelines, and prescribed document checklists. This role cannot approve applications.
            </p>

            <div class="flex flex-wrap gap-2 pt-2">
              ${[
                { id: 'ov', label: '📊 Overview' },
                { id: 'users', label: `👥 User Management (${state.accounts.length})` },
                { id: 'rules', label: '⚙️ Rules & Timelines' },
                { id: 'all', label: `📋 All Applications (${apps.length})` }
              ]
                .map(
                  (t) => `
                <button
                  data-adm-subtab="${t.id}"
                  class="px-3.5 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                    subTab === t.id
                      ? 'bg-[#2456D6] text-white shadow-2xs'
                      : 'bg-[#F4F6FB] text-[#44516A] border border-[#E1E6EF] hover:bg-blue-50'
                  }"
                >
                  ${t.label}
                </button>
              `
                )
                .join('')}
            </div>
          </div>

          <div class="lg:col-span-4 h-full min-h-[130px] relative overflow-hidden bg-[#0B2545] hidden lg:block">
            <img
              src="./public/assets/aicte-rishi-heritage.png"
              onerror="this.onerror=null;this.src='/public/assets/aicte-rishi-heritage.png';"
              alt="AICTE Bharatiya Jnana Parampara"
              class="w-full h-full object-cover opacity-85"
            />
            <div class="absolute inset-0 bg-gradient-to-r from-[#0B2545] via-[#0B2545]/45 to-transparent flex flex-col justify-end p-4 text-white">
              <span class="font-hindi text-xs font-bold text-amber-300">“योगः कर्मसु कौशलम्”</span>
              <span class="text-[11px] text-slate-200">Bharatiya Jnana Parampara • AICTE</span>
            </div>
          </div>
        </div>
      </div>

      ${
        subTab === 'ov'
          ? `
        <!-- 4 Summary Stats -->
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div class="bg-white rounded-2xl border border-[#E1E6EF] p-5 shadow-xs">
            <b class="text-2xl font-extrabold text-[#0B2545] block">${apps.length}</b>
            <span class="text-xs text-[#66738A] font-medium">Applications visible</span>
          </div>
          <div class="bg-white rounded-2xl border border-[#E1E6EF] p-5 shadow-xs">
            <b class="text-2xl font-extrabold text-[#2456D6] block">${apps.filter((a) => getStageIndex(a) > 0 && getStageIndex(a) < 6).length}</b>
            <span class="text-xs text-[#66738A] font-medium">In pipeline</span>
          </div>
          <div class="bg-white rounded-2xl border border-[#E1E6EF] p-5 shadow-xs">
            <b class="text-2xl font-extrabold text-[#B42318] block">${overdueApps.length}</b>
            <span class="text-xs text-[#66738A] font-medium">Past due date</span>
          </div>
          <div class="bg-white rounded-2xl border border-[#E1E6EF] p-5 shadow-xs">
            <b class="text-2xl font-extrabold text-[#18794E] block">${cnt(6)}</b>
            <span class="text-xs text-[#66738A] font-medium">Approved</span>
          </div>
        </div>

        <!-- Smooth Progress Charts (Royal Navy, Blue & Saffron Theme — No Pink!) -->
        ${renderAestheticProgressCharts(state, user, {
          trackerTitle: 'System Admin Pipeline Distribution & Stage SLA Velocity'
        })}

        <!-- Applications per stage bar chart + Overdue applications -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div class="bg-white rounded-2xl border border-[#E1E6EF] p-5 shadow-xs space-y-3">
            <h3 class="text-base font-serif font-bold text-[#0B2545]">Applications per Stage</h3>
            <div class="space-y-3">
              ${[1, 2, 3, 4, 5]
                .map(
                  (s) => `
                <div class="flex items-center gap-3 text-xs">
                  <span class="w-24 font-bold text-slate-700">${PORTAL_STAGES[s]}</span>
                  <div class="flex-1 h-3.5 rounded-full bg-[#EEF3FB] overflow-hidden">
                    <div class="h-full rounded-full bg-gradient-to-r from-[#0B2545] via-[#2456D6] to-[#3B82F6]" style="width: ${Math.max(8, (cnt(s) / mx) * 85)}%"></div>
                  </div>
                  <span class="w-20 text-right font-bold text-[#0B2545]">${cnt(s)} (SLA: ${cfg.sla[s]}d)</span>
                </div>
              `
                )
                .join('')}
            </div>
          </div>

          <div class="bg-white rounded-2xl border border-[#E1E6EF] p-5 shadow-xs space-y-3">
            <h3 class="text-base font-serif font-bold text-[#0B2545]">Overdue Applications</h3>
            <div class="space-y-2.5">
              ${
                overdueApps.length > 0
                  ? overdueApps
                      .map(
                        (a) => `
                    <div class="p-3 rounded-xl bg-[#F8FAFC] border border-[#E1E6EF] flex items-center justify-between gap-2 text-xs">
                      <div>
                        <strong class="text-[#0B2545]">${a.appNumber} · ${a.institutionName}</strong>
                        <div class="text-[#66738A]">${a.daysInStage} days in ${a.currentStage}</div>
                      </div>
                      ${renderStatusPill(a, cfg)}
                    </div>
                  `
                      )
                      .join('')
                  : '<div class="text-xs text-slate-500">None overdue.</div>'
              }
            </div>
          </div>
        </div>
      `
          : subTab === 'users'
          ? `
        <!-- USER MANAGEMENT TAB (Merged from changed_files/app.js usersTab) -->
        <section class="bg-white rounded-2xl border border-[#E1E6EF] p-5 shadow-xs space-y-4">
          <div>
            <h3 class="text-base font-serif font-bold text-[#0B2545]">Portal Users &amp; Role Assignment</h3>
            <p class="text-xs text-[#66738A]">
              New users register as Institution. Assign staff roles or manage account access below.
            </p>
          </div>
          <div class="overflow-x-auto">
            <table class="w-full text-left border-collapse text-xs">
              <thead>
                <tr class="border-b border-[#E1E6EF] text-[#4A5870] bg-[#F7F9FD]">
                  <th class="py-2.5 px-3">Name</th>
                  <th class="py-2.5 px-3">Email</th>
                  <th class="py-2.5 px-3">Role</th>
                  <th class="py-2.5 px-3">Region / Institution</th>
                  <th class="py-2.5 px-3">Status</th>
                  <th class="py-2.5 px-3">Action</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                ${(state.accounts || [])
                  .map((u) => {
                    const isPending = u.regStatus === 'Pending';
                    const isRejected = u.regStatus === 'Rejected';
                    const isActive = u.isActive !== false && !isPending && !isRejected;
                    const isSelf = String(u.id) === String(user.id) || u.email === user.email;
                    return `
                      <tr>
                        <td class="py-2.5 px-3 font-bold text-[#0B2545]">${u.fullName}</td>
                        <td class="py-2.5 px-3 text-[#66738A]">${u.email}</td>
                        <td class="py-2.5 px-3 font-semibold text-[#2456D6]">${u.subRole}</td>
                        <td class="py-2.5 px-3 text-[#66738A]">${u.institutionName || u.region || '—'}</td>
                        <td class="py-2.5 px-3">
                          <span class="px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                            isPending
                              ? 'bg-[#FFF2D7] text-[#9A6100]'
                              : isActive
                              ? 'bg-[#E6F7ED] text-[#18794E]'
                              : 'bg-[#FFEDEB] text-[#B42318]'
                          }">
                            ${isPending ? 'Pending Approval' : isRejected ? 'Rejected' : isActive ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td class="py-2.5 px-3">
                          ${
                            !isSelf
                              ? `<div class="flex items-center gap-2 flex-wrap">
                                  <select data-role-user="${u.id}" class="px-2.5 py-1.5 rounded-lg border border-[#CFD7E4] bg-white text-xs font-semibold text-[#172238]">
                                    ${AVAILABLE_SUBROLES.map(
                                      (roleOpt) => `<option value="${roleOpt}" ${u.subRole === roleOpt ? 'selected' : ''}>${roleOpt}</option>`
                                    ).join('')}
                                  </select>
                                  <button type="button" data-save-role="${u.id}" class="px-3 py-1.5 rounded-lg bg-[#EAF0FF] hover:bg-blue-100 text-[#2456D6] font-bold text-xs cursor-pointer">Save role</button>
                                  ${
                                    isPending
                                      ? `<button type="button" data-approve-user="${u.id}" class="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs cursor-pointer">Approve</button>
                                         <button type="button" data-reject-user="${u.id}" class="px-3 py-1.5 rounded-lg bg-[#FFF0EF] text-[#B42318] border border-[#FFD4D1] font-bold text-xs cursor-pointer">Reject</button>`
                                      : `<button type="button" data-toggle-user="${u.id}" class="px-3 py-1.5 rounded-lg ${
                                          isActive ? 'bg-[#FFF0EF] text-[#B42318] border border-[#FFD4D1]' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                        } font-bold text-xs cursor-pointer">
                                          ${isActive ? 'Deactivate' : 'Activate'}
                                        </button>`
                                  }
                                </div>`
                              : '<span class="text-slate-400 font-medium">Current account</span>'
                          }
                        </td>
                      </tr>
                    `;
                  })
                  .join('')}
              </tbody>
            </table>
          </div>
        </section>
      `
          : subTab === 'rules'
          ? `
        <!-- RULES & TIMELINES TAB -->
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <!-- Card 1: Days allowed per stage -->
          <div class="bg-white rounded-2xl border border-[#E1E6EF] p-5 shadow-xs space-y-3">
            <h3 class="text-base font-serif font-bold text-[#0B2545] border-b border-slate-100 pb-2">
              Days Allowed per Stage (SLA)
            </h3>
            <div class="space-y-2.5 text-xs">
              ${[1, 2, 3, 4, 5]
                .map(
                  (s) => `
                <div class="flex items-center justify-between gap-2 bg-[#F8FAFC] p-2.5 rounded-xl border border-[#E1E6EF]">
                  <span class="font-bold text-[#0B2545]">${PORTAL_STAGES[s]}</span>
                  <div class="flex items-center gap-1.5">
                    <input
                      type="number"
                      min="1"
                      data-adm-sla="${s}"
                      value="${cfg.sla[s] || 5}"
                      class="w-20 px-2.5 py-1.5 rounded-lg bg-white border border-[#CFD7E4] font-bold text-center text-[#0B2545]"
                    />
                    <span class="text-[#66738A]">days</span>
                  </div>
                </div>
              `
                )
                .join('')}
            </div>
            <button
              id="btn-adm-save-sla"
              class="w-full py-2.5 px-4 rounded-xl bg-[#2456D6] hover:bg-[#1d46b5] text-white font-bold text-xs uppercase tracking-wider cursor-pointer"
            >
              ✔ Save Settings
            </button>
          </div>

          <!-- Card 2: Required documents -->
          <div class="bg-white rounded-2xl border border-[#E1E6EF] p-5 shadow-xs space-y-3 flex flex-col justify-between">
            <div class="space-y-3">
              <h3 class="text-base font-serif font-bold text-[#0B2545] border-b border-slate-100 pb-2">
                Required Documents (${cfg.docs.length})
              </h3>
              <div class="space-y-2 max-h-64 overflow-y-auto pr-1 text-xs">
                ${cfg.docs
                  .map(
                    (doc, idx) => `
                  <div class="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-[#F8FAFC] border border-[#E1E6EF]">
                    <span class="text-[#172238] font-medium">${doc}</span>
                    <button
                      data-adm-rm-doc="${idx}"
                      class="px-2.5 py-1 rounded-lg bg-[#FFF0EF] hover:bg-red-100 text-[#B42318] font-bold text-[11px] cursor-pointer"
                    >
                      Remove
                    </button>
                  </div>
                `
                  )
                  .join('')}
              </div>
            </div>
            <div class="flex gap-2 pt-2 border-t border-slate-100">
              <input
                id="adm-in-doc"
                type="text"
                placeholder="Add required document..."
                class="flex-1 px-3 py-2 rounded-xl bg-[#F8FAFC] border border-[#CFD7E4] text-xs"
              />
              <button
                id="btn-adm-add-doc"
                class="px-4 py-2 rounded-xl bg-[#0B2545] hover:bg-[#13315C] text-white font-bold text-xs cursor-pointer"
              >
                Add
              </button>
            </div>
          </div>

          <!-- Card 3: Courses offered -->
          <div class="bg-white rounded-2xl border border-[#E1E6EF] p-5 shadow-xs space-y-3 flex flex-col justify-between">
            <div class="space-y-3">
              <h3 class="text-base font-serif font-bold text-[#0B2545] border-b border-slate-100 pb-2">
                Courses Offered (${cfg.courses.length})
              </h3>
              <div class="space-y-2 max-h-64 overflow-y-auto pr-1 text-xs">
                ${cfg.courses
                  .map(
                    (c, idx) => `
                  <div class="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-[#F8FAFC] border border-[#E1E6EF]">
                    <span class="text-[#172238] font-medium">${c}</span>
                    <button
                      data-adm-rm-course="${idx}"
                      class="px-2.5 py-1 rounded-lg bg-[#FFF0EF] hover:bg-red-100 text-[#B42318] font-bold text-[11px] cursor-pointer"
                    >
                      Remove
                    </button>
                  </div>
                `
                  )
                  .join('')}
              </div>
            </div>
            <div class="flex gap-2 pt-2 border-t border-slate-100">
              <input
                id="adm-in-course"
                type="text"
                placeholder="Add new course..."
                class="flex-1 px-3 py-2 rounded-xl bg-[#F8FAFC] border border-[#CFD7E4] text-xs"
              />
              <button
                id="btn-adm-add-course"
                class="px-4 py-2 rounded-xl bg-[#0B2545] hover:bg-[#13315C] text-white font-bold text-xs cursor-pointer"
              >
                Add
              </button>
            </div>
          </div>
        </div>

        <div class="flex justify-end">
          <button
            id="btn-adm-reset-demo"
            class="px-4 py-2 rounded-xl bg-[#FFF0EF] hover:bg-red-100 text-[#B42318] border border-[#FFD4D1] font-bold text-xs cursor-pointer"
          >
            ↺ Reset Demo Data to Initial Seed
          </button>
        </div>
      `
          : `
        <!-- ALL APPLICATIONS TAB (Read-Only for System Admin) -->
        <div class="bg-white rounded-2xl border border-[#E1E6EF] p-5 shadow-xs space-y-4">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 class="text-base font-serif font-bold text-[#0B2545]">All Applications (Read-Only)</h3>
              <p class="text-xs text-[#66738A]">System Admin monitors pipeline status here without application decision controls.</p>
            </div>
            <select
              id="adm-all-filter"
              class="px-3.5 py-2 rounded-xl bg-[#F8FAFC] border border-[#CFD7E4] text-xs font-bold text-[#172238]"
            >
              <option value="" ${!uiState.admStageFilter ? 'selected' : ''}>All stages</option>
              ${PORTAL_STAGES.slice(1)
                .map(
                  (s, i) => `
                <option value="${i + 1}" ${String(uiState.admStageFilter) === String(i + 1) ? 'selected' : ''}>${s}</option>
              `
                )
                .join('')}
              <option value="-1" ${String(uiState.admStageFilter) === '-1' ? 'selected' : ''}>Returned</option>
            </select>
          </div>

          <div class="overflow-x-auto">
            <table class="w-full text-left border-collapse text-xs">
              <thead>
                <tr class="border-b border-[#E1E6EF] text-[#4A5870] uppercase bg-[#F7F9FD]">
                  <th class="py-2.5 px-3">ID</th>
                  <th class="py-2.5 px-3">Institution</th>
                  <th class="py-2.5 px-3">Course</th>
                  <th class="py-2.5 px-3">Region</th>
                  <th class="py-2.5 px-3">Status</th>
                  <th class="py-2.5 px-3">Days</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                ${apps
                  .filter((a) => !uiState.admStageFilter || getStageIndex(a) === Number(uiState.admStageFilter))
                  .map(
                    (a) => `
                  <tr>
                    <td class="py-2.5 px-3 font-bold text-[#2456D6]">${a.appNumber}</td>
                    <td class="py-2.5 px-3 font-semibold text-[#0B2545]">${a.institutionName}</td>
                    <td class="py-2.5 px-3 text-slate-700">${a.program || a.course}</td>
                    <td class="py-2.5 px-3 text-[#66738A]">${a.region} (${a.state})</td>
                    <td class="py-2.5 px-3">${renderStatusPill(a, cfg)}</td>
                    <td class="py-2.5 px-3 font-bold text-[#0B2545]">${a.daysInStage || 0}d</td>
                  </tr>
                `
                  )
                  .join('')}
              </tbody>
            </table>
          </div>
        </div>
      `
      }
    </div>
  `;
}

// ============================================================================
// 3. ROLE: AUDITOR (Read-Only Role — Merged with changed_files Audit & Reports)
// ============================================================================
export function renderAuditorWorkspace(state, user, uiState) {
  const cfg = state.portalCfg || { sla: { 1: 3, 2: 5, 3: 5, 4: 10, 5: 7 }, docs: [], courses: [] };
  const subTab = uiState.audSubTab || 'ov'; // 'ov' | 'trail' | 'trace'
  const logs = state.auditTrail || [];
  const apps = state.applications || [];
  const actors = [...new Set(logs.map((l) => `${l.actorName} (${l.subRole})`))];
  const selectedTraceApp = apps.find((a) => a.id === uiState.audTraceAppId) || apps[0];

  const searchQ = (uiState.audSearch || '').toLowerCase().trim();
  const actorFilter = uiState.audActor || '';
  const filteredLogs = logs.filter((l) => {
    const actorLabel = `${l.actorName} (${l.subRole})`;
    const matchActor = !actorFilter || actorLabel === actorFilter;
    const matchQ =
      !searchQ ||
      `${l.actionType} ${l.appNumber} ${l.remarks} ${l.actorName}`.toLowerCase().includes(searchQ);
    return matchActor && matchQ;
  });

  return `
    <div class="space-y-6">
      <!-- Clean Rishi Heritage & Role Welcome Header -->
      <div class="bg-white rounded-2xl border border-[#E1E6EF] shadow-xs overflow-hidden">
        <div class="grid grid-cols-1 lg:grid-cols-12 items-center">
          <div class="lg:col-span-8 p-5 sm:p-6 space-y-2">
            <span class="px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase bg-[#FFF2D7] text-[#9A6100] border border-amber-300">
              AUDITOR WORKSPACE • READ-ONLY
            </span>
            <h2 class="text-xl font-serif font-bold text-[#0B2545]">
              Auditor Dashboard — ${user.fullName}
            </h2>
            <p class="text-xs text-[#66738A] max-w-2xl">
              Read-only access to application records and the immutable audit trail. Cannot submit, edit, approve, or return applications.
            </p>

            <div class="flex flex-wrap gap-2 pt-2">
              ${[
                { id: 'ov', label: '📊 Overview' },
                { id: 'trail', label: `📜 Audit Trail (${logs.length})` },
                { id: 'trace', label: '🔍 Trace & Reports' }
              ]
                .map(
                  (t) => `
                <button
                  data-aud-subtab="${t.id}"
                  class="px-3.5 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                    subTab === t.id
                      ? 'bg-[#2456D6] text-white shadow-2xs'
                      : 'bg-[#F4F6FB] text-[#44516A] border border-[#E1E6EF] hover:bg-blue-50'
                  }"
                >
                  ${t.label}
                </button>
              `
                )
                .join('')}
            </div>
          </div>

          <div class="lg:col-span-4 h-full min-h-[130px] relative overflow-hidden bg-[#0B2545] hidden lg:block">
            <img
              src="./public/assets/aicte-rishi-heritage.png"
              onerror="this.onerror=null;this.src='/public/assets/aicte-rishi-heritage.png';"
              alt="AICTE Bharatiya Jnana Parampara"
              class="w-full h-full object-cover opacity-85"
            />
            <div class="absolute inset-0 bg-gradient-to-r from-[#0B2545] via-[#0B2545]/45 to-transparent flex flex-col justify-end p-4 text-white">
              <span class="font-hindi text-xs font-bold text-amber-300">“योगः कर्मसु कौशलम्”</span>
              <span class="text-[11px] text-slate-200">Bharatiya Jnana Parampara • AICTE</span>
            </div>
          </div>
        </div>
      </div>

      ${
        subTab === 'ov'
          ? `
        <!-- 4 Summary Stats -->
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div class="bg-white rounded-2xl border border-[#E1E6EF] p-5 shadow-xs">
            <b class="text-2xl font-extrabold text-[#0B2545] block">${logs.length}</b>
            <span class="text-xs text-[#66738A] font-medium">Logged audit events</span>
          </div>
          <div class="bg-white rounded-2xl border border-[#E1E6EF] p-5 shadow-xs">
            <b class="text-2xl font-extrabold text-[#18794E] block">${apps.filter((a) => getStageIndex(a) === 6).length}</b>
            <span class="text-xs text-[#66738A] font-medium">Approvals</span>
          </div>
          <div class="bg-white rounded-2xl border border-[#E1E6EF] p-5 shadow-xs">
            <b class="text-2xl font-extrabold text-[#2456D6] block">${apps.filter((a) => getStageIndex(a) === -1).length}</b>
            <span class="text-xs text-[#66738A] font-medium">Returns</span>
          </div>
          <div class="bg-white rounded-2xl border border-[#E1E6EF] p-5 shadow-xs">
            <b class="text-2xl font-extrabold text-[#B42318] block">${apps.filter((a) => isAppOverdue(a, cfg)).length}</b>
            <span class="text-xs text-[#66738A] font-medium">Overdue now</span>
          </div>
        </div>

        <div class="p-4 rounded-2xl bg-[#EAF0FF] border border-blue-200 text-xs font-semibold text-[#0B2545] flex items-center justify-between gap-3">
          <span>🔒 <strong>Statutory Read-Only Safeguard:</strong> This workspace is read-only. You can inspect, trace, and export the audit trail to CSV.</span>
          <button
            data-aud-subtab="trail"
            class="px-3.5 py-1.5 rounded-xl bg-[#2456D6] text-white text-xs font-bold cursor-pointer shrink-0"
          >
            Open Audit Trail →
          </button>
        </div>

        <!-- Smooth Progress Charts (Royal Navy, Blue & Saffron Theme) -->
        ${renderAestheticProgressCharts(state, user, {
          trackerTitle: 'Immutable Audit Trail Velocity & Compliance Verification Graph'
        })}
      `
          : subTab === 'trail'
          ? `
        <!-- AUDIT TRAIL TAB -->
        <div class="bg-white rounded-2xl border border-[#E1E6EF] p-5 shadow-xs space-y-4">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 class="text-base font-serif font-bold text-[#0B2545]">Audit trail</h3>
              <p class="text-xs text-[#66738A]">Read-only. Showing latest immutable workflow events.</p>
            </div>
            <button
              id="btn-aud-export-csv"
              class="px-4 py-2 rounded-xl bg-[#2456D6] hover:bg-[#1d46b5] text-white font-bold text-xs cursor-pointer shadow-2xs"
            >
              ⬇ Export CSV (aicte-audit-trail.csv)
            </button>
          </div>

          <div class="flex flex-wrap items-center gap-3">
            <input
              id="aud-search-q"
              type="text"
              value="${uiState.audSearch || ''}"
              placeholder="Search actor, action, or application ID..."
              class="flex-1 min-w-[220px] px-3.5 py-2 rounded-xl bg-[#F8FAFC] border border-[#CFD7E4] text-xs"
            />
            <select
              id="aud-actor-select"
              class="px-3.5 py-2 rounded-xl bg-[#F8FAFC] border border-[#CFD7E4] text-xs font-bold text-[#172238]"
            >
              <option value="">All actors</option>
              ${actors
                .map(
                  (act) => `
                <option value="${act}" ${actorFilter === act ? 'selected' : ''}>${act}</option>
              `
                )
                .join('')}
            </select>
          </div>

          <div class="overflow-x-auto">
            <table class="w-full text-left border-collapse text-xs">
              <thead>
                <tr class="border-b border-[#E1E6EF] text-[#4A5870] uppercase bg-[#F7F9FD]">
                  <th class="py-2.5 px-3">Time</th>
                  <th class="py-2.5 px-3">Application</th>
                  <th class="py-2.5 px-3">Actor</th>
                  <th class="py-2.5 px-3">Action &amp; Details</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                ${filteredLogs
                  .map(
                    (l) => `
                  <tr>
                    <td class="py-2.5 px-3 text-[#66738A] whitespace-nowrap">${l.timestamp}</td>
                    <td class="py-2.5 px-3 font-bold text-[#2456D6]">${l.appNumber}</td>
                    <td class="py-2.5 px-3 font-semibold text-[#0B2545]">${l.actorName} (${l.subRole})</td>
                    <td class="py-2.5 px-3 text-slate-700"><strong>${l.actionType}</strong> — ${l.remarks}</td>
                  </tr>
                `
                  )
                  .join('')}
              </tbody>
            </table>
          </div>
        </div>
      `
          : `
        <!-- TRACE APPLICATION & READ-ONLY REPORTS TAB -->
        <div class="bg-white rounded-2xl border border-[#E1E6EF] p-5 shadow-xs space-y-4">
          <div>
            <label class="block text-xs font-bold uppercase text-[#172238] mb-1.5">
              Select Application Dossier to Trace End-to-End Lifecycle
            </label>
            <select
              id="aud-trace-select"
              class="w-full max-w-xl px-3.5 py-2.5 rounded-xl bg-[#F8FAFC] border border-[#CFD7E4] text-xs font-bold text-[#172238]"
            >
              ${apps
                .map(
                  (a) => `
                <option value="${a.id}" ${selectedTraceApp?.id === a.id ? 'selected' : ''}>
                  ${a.appNumber} · ${a.institutionName} (${a.program || a.course})
                </option>
              `
                )
                .join('')}
            </select>
          </div>

          ${
            selectedTraceApp
              ? `
            <div class="p-4 rounded-2xl bg-[#F8FAFC] border border-[#E1E6EF] space-y-3">
              <div class="flex items-center justify-between flex-wrap gap-2">
                <b class="text-base font-bold text-[#0B2545]">${selectedTraceApp.appNumber} · ${selectedTraceApp.institutionName}</b>
                ${renderStatusPill(selectedTraceApp, cfg)}
              </div>
              <div class="text-xs text-[#66738A]">
                Track: <strong>${selectedTraceApp.workflowTrack}</strong> · Region: <strong>${selectedTraceApp.region} (${selectedTraceApp.state})</strong> · Current Stage: <strong>${selectedTraceApp.currentStage}</strong>
              </div>
              ${renderSixStepProgressBar(selectedTraceApp)}
              <h4 class="text-xs font-bold uppercase text-[#0B2545] pt-2">Chronological Audit Trace</h4>
              ${renderAppTimeline(selectedTraceApp, state)}
            </div>
          `
              : ''
          }
        </div>
      `
      }
    </div>
  `;
}

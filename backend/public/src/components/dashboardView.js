// ============================================================================
// SIH 2026 PS 26262 - Unified 6-Dashboard Workspace Engine
// Official AICTE Heritage & Clean Institutional Design:
// - Background: Clean Cool Alabaster (#F4F6FB), Cards: Crisp White (#FFFFFF)
// - Accents: Royal Navy (#0B2545), Institutional Blue (#2456D6), Saffron (#D97706), Emerald (#15803D)
// - Preserves Rishi Heritage (`aicte-rishi-heritage.png`) & AICTE Campus Visuals
// - Merges `changed_files` User Management, Evidence File Uploads, & `config.js` Mode Badge
// - Integrates all 6 Role Dashboards & persists progress via `/api/portal/state` + Supabase
// ============================================================================

import { backend } from '../services/supabaseService.js';
import { AICTE_LOGO_SVG } from './authView.js';
import {
  openBiometricStepUpModal,
  openSupabaseConfigModal,
  openElectronicCaseModal
} from './modals.js';
import { renderAestheticProgressCharts } from './smoothCharts.js';
import { renderRegionalScrutinyAndBureauWorkspace } from './officerBureauViews.js';
import {
  renderInstitutionWorkspace,
  renderSystemAdminWorkspace,
  renderAuditorWorkspace
} from './instAdminAuditorViews.js';

export function renderDashboardWorkspace(container) {
  const currentUser = backend.state.currentUser || backend.state.accounts[0];
  const saved = backend.getUserSavedProgress(currentUser.email) || currentUser.restoredProgress || {};

  // Restore user's exact last active module & subtabs from persistent backend DB
  let activeModule = saved.activeModule || 'dashboard';
  let searchQuery = saved.searchQuery || '';
  let regionFilter = saved.regionFilter || 'ALL';
  let trackFilter = saved.trackFilter || 'ALL';
  let slaFilter = saved.slaFilter || 'ALL';
  let evcSubTab = saved.evcSubTab || 'ALL';
  let complianceSubTab = saved.complianceSubTab || 'ALL';
  let docSubTab = saved.docSubTab || 'ALL';
  let selectedAppIdForAction = saved.selectedAppIdForAction || null;
  let selectedEvcIdForScoring = saved.selectedEvcIdForScoring || null;

  // Sub-state for Dashboards 1, 2, 5, 6 (also persisted in DB per user)
  const uiState = {
    officerSubTab: saved.officerSubTab || 'overview',
    officerSearch: saved.officerSearch || '',
    officerStatusFilter: saved.officerStatusFilter || 'all',
    officerPriorityFilter: saved.officerPriorityFilter || 'all',
    officerRegionFilter: saved.officerRegionFilter || 'ALL',
    selectedScrutinyAppId: saved.selectedScrutinyAppId || null,
    selectedOversightAppId: saved.selectedOversightAppId || null,
    instSubTab: saved.instSubTab || 'dash',
    instAppsFilter: saved.instAppsFilter || '',
    expandedTimelines: saved.expandedTimelines || {},
    admSubTab: saved.admSubTab || 'ov',
    admStageFilter: saved.admStageFilter || '',
    audSubTab: saved.audSubTab || 'ov',
    audSearch: saved.audSearch || '',
    audActor: saved.audActor || '',
    audTraceAppId: saved.audTraceAppId || null
  };

  let toastMessage = null;

  function persistCurrentProgress() {
    backend.saveUserProgress({
      activeModule,
      searchQuery,
      regionFilter,
      trackFilter,
      slaFilter,
      evcSubTab,
      complianceSubTab,
      docSubTab,
      selectedAppIdForAction,
      selectedEvcIdForScoring,
      ...uiState
    });
  }

  function showToast(text, type = 'success') {
    toastMessage = { text, type, time: new Date().toLocaleTimeString() };
    persistCurrentProgress();
    render();
    setTimeout(() => {
      toastMessage = null;
      if (document.body.contains(container)) render();
    }, 4000);
  }

  function exportCsvReport() {
    const apps = backend.state.applications;
    const headers = [
      'Application ID',
      'Institution Name',
      'Region',
      'State',
      'Program',
      'APH Track',
      'Current Stage',
      'Days In Stage',
      'SLA Status',
      'Assigned Role',
      'Assigned Sub-Role',
      'EVC Score',
      'Authority Decision'
    ];
    const rows = apps.map((a) => [
      a.appNumber,
      `"${(a.institutionName || '').replace(/"/g, '""')}"`,
      a.region,
      a.state,
      `"${(a.program || a.course || '').replace(/"/g, '""')}"`,
      a.workflowTrack,
      a.currentStage,
      a.daysInStage,
      a.slaStatus,
      a.assignedRole,
      a.assignedSubRole,
      a.evcScore,
      `"${(a.authorityDecision || '').replace(/"/g, '""')}"`
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const link = document.createElement('a');
    link.setAttribute('href', encodeURI(csvContent));
    link.setAttribute('download', `AICTE_PS26262_Consolidated_Report_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();

    const u = backend.state.currentUser;
    backend.appendAudit({
      actorName: u.fullName,
      statementRole: u.statementRole,
      subRole: u.subRole,
      actionType: 'REPORT_CSV_EXPORTED',
      appNumber: 'ALL-REGIONS',
      stageFrom: 'Reports & Analytics',
      stageTo: 'CSV Downloaded',
      authMethod: u.loginMethod,
      remarks: 'Generated consolidated pendency, EVC, compliance & document validity report.'
    });
    backend.saveState();
    showToast('Consolidated AICTE CSV Report downloaded and logged to database.');
  }

  function statusBadgePill(status = '') {
    if (status.includes('Overdue') || status.includes('Expired') || status.includes('Delayed') || status.includes('Reverted') || status.includes('Returned')) {
      return `<span class="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-red-50 text-red-700 border border-red-200">${status}</span>`;
    }
    if (status.includes('Approaching') || status.includes('Expiring') || status.includes('Pending') || status.includes('Progress') || status.includes('Review')) {
      return `<span class="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-200">${status}</span>`;
    }
    return `<span class="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">${status}</span>`;
  }

  function getFilteredApplications() {
    return backend.state.applications.filter((app) => {
      const matchesSearch =
        !searchQuery ||
        app.institutionName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        app.appNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
        app.state.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesRegion = regionFilter === 'ALL' || app.region === regionFilter;
      const matchesTrack = trackFilter === 'ALL' || app.workflowTrack === trackFilter;
      const matchesSla = slaFilter === 'ALL' || app.slaStatus === slaFilter;
      return matchesSearch && matchesRegion && matchesTrack && matchesSla;
    });
  }

  // ==========================================================================
  // DASHBOARD 3 & 4 HOME: COMMITTEE (EVC / SAC) & COMPETENT AUTHORITY (MS / CHAIRMAN)
  // ==========================================================================
  function renderCommitteeAndAuthorityDashboardHome(state, user) {
    const isCommittee = user.statementRole === 'Committee';
    const myQueueApps = state.applications.filter(
      (a) => a.assignedSubRole === user.subRole || a.assignedRole === user.statementRole
    );
    const overdueCount = state.applications.filter((a) => (a.slaStatus || '').includes('Overdue')).length;

    return `
      <div class="space-y-6">
        <!-- Official AICTE Heritage & Role Welcome Strip -->
        <div class="rounded-2xl bg-white border border-[#E1E6EF] shadow-2xs overflow-hidden">
          <div class="grid grid-cols-1 lg:grid-cols-12 items-center">
            <div class="lg:col-span-8 p-6 space-y-2">
              <div class="flex items-center gap-2 flex-wrap">
                <span class="px-2.5 py-0.5 rounded-full text-xs font-bold uppercase bg-blue-50 text-[#2456D6] border border-blue-200">
                  ${user.statementRole} Workspace • ${user.subRole}
                </span>
                <span class="text-xs text-slate-500 font-medium">Signed in via: ${user.loginMethod}</span>
              </div>
              <h2 class="text-xl font-serif font-bold text-[#0B2545]">
                Welcome, ${user.fullName} — <span class="text-slate-600 font-sans font-medium text-base">${user.designation}</span>
              </h2>
              <p class="text-xs text-slate-600 leading-relaxed max-w-2xl">
                ${
                  user.subRole === 'EVC Member'
                    ? 'Expert Visit Committee Console: Inspect institutions requiring EVC verification, submit 4-pillar field rubrics, and route files to SAC/SHC or Competent Authority.'
                    : user.subRole === 'SAC/SHC Member'
                    ? 'Standing Appellate & Hearing Bench Console: Conduct deficiency appeal hearings, verify rectified institutional documents, and submit bench recommendations.'
                    : user.subRole === 'Member Secretary'
                    ? 'Member Secretary Command Console: Monitor national pendency across all 8 regions, enforce overdue escalations, verify undertakings, and configure APH rules.'
                    : 'Hon’ble Chairman Apex Console: Final statutory LoA/EoA approval authority, conditional approvals with time-bound undertakings, and national compliance oversight.'
                }
              </p>
            </div>
            <div class="lg:col-span-4 h-full min-h-[120px] relative overflow-hidden bg-[#0B2545]">
              <img
                src="./public/assets/aicte-rishi-heritage.png"
                onerror="this.onerror=null;this.src='/public/assets/aicte-rishi-heritage.png';"
                alt="AICTE Bharatiya Jnana Parampara"
                class="w-full h-full object-cover opacity-80"
              />
              <div class="absolute inset-0 bg-gradient-to-r from-[#0B2545] via-[#0B2545]/50 to-transparent flex flex-col justify-end p-4 text-white">
                <span class="font-hindi text-xs font-bold text-amber-300">“योगः कर्मसु कौशलम्”</span>
                <span class="text-[11px] text-slate-200">Bharatiya Jnana Parampara • AICTE</span>
              </div>
            </div>
          </div>
        </div>

        <!-- 4 Summary KPI Cards -->
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div class="rounded-2xl bg-white border border-[#E1E6EF] p-5 shadow-2xs flex items-center gap-4">
            <div class="w-11 h-11 rounded-xl bg-blue-50 text-[#2456D6] flex items-center justify-center text-xl font-bold shrink-0">
              📄
            </div>
            <div>
              <div class="text-xs font-semibold text-slate-500">Total Active Dossiers</div>
              <div class="text-2xl font-extrabold text-[#0B2545] mt-0.5">${state.applications.length}</div>
              <div class="text-[11px] text-slate-500">Across 8 AICTE Regions</div>
            </div>
          </div>

          <div class="rounded-2xl bg-white border border-[#E1E6EF] p-5 shadow-2xs flex items-center gap-4">
            <div class="w-11 h-11 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center text-xl font-bold shrink-0">
              ⏳
            </div>
            <div>
              <div class="text-xs font-semibold text-slate-500">In ${user.subRole} Queue</div>
              <div class="text-2xl font-extrabold text-[#0B2545] mt-0.5">${myQueueApps.length}</div>
              <div class="text-[11px] text-amber-800 font-medium">Assigned to your role</div>
            </div>
          </div>

          <div class="rounded-2xl bg-white border border-[#E1E6EF] p-5 shadow-2xs flex items-center gap-4">
            <div class="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center text-xl font-bold shrink-0">
              🏛️
            </div>
            <div>
              <div class="text-xs font-semibold text-slate-500">EVC Inspections</div>
              <div class="text-2xl font-extrabold text-[#0B2545] mt-0.5">${state.evcInspections.length}</div>
              <div class="text-[11px] text-emerald-700 font-medium">${state.evcInspections.filter((e) => e.isNewInstitution).length} New Institutions (LoA)</div>
            </div>
          </div>

          <div class="rounded-2xl bg-white border border-[#E1E6EF] p-5 shadow-2xs flex items-center gap-4">
            <div class="w-11 h-11 rounded-xl bg-red-50 text-red-600 flex items-center justify-center text-xl font-bold shrink-0">
              🚨
            </div>
            <div>
              <div class="text-xs font-semibold text-slate-500">Overdue / Escalated</div>
              <div class="text-2xl font-extrabold text-red-600 mt-0.5">${overdueCount}</div>
              <div class="text-[11px] text-red-600 font-medium">Requires priority action</div>
            </div>
          </div>
        </div>

        <!-- Smooth Progress Charts (Royal Navy / Blue / Saffron — Zero Pink) -->
        ${renderAestheticProgressCharts(state, user, {
          trackerTitle: isCommittee
            ? `${user.subRole} Inspection & Hearing Velocity Tracker`
            : `${user.subRole} National Statutory Approval & SLA Tracker`
        })}

        <!-- Role Priority Queue & Quick Actions -->
        <div class="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div class="lg:col-span-8 rounded-2xl bg-white border border-[#E1E6EF] p-5 shadow-2xs">
            <div class="flex flex-wrap items-center justify-between gap-2 mb-4">
              <div>
                <h3 class="text-base font-serif font-bold text-[#0B2545]">
                  Active Applications &amp; Priority Queue (${user.subRole})
                </h3>
                <p class="text-xs text-slate-500">
                  Click "Process" to approve, route to SAC/EVC, or revert for deficiency.
                </p>
              </div>
              <button
                data-goto-module="applications"
                class="px-3.5 py-1.5 rounded-xl bg-[#2456D6] hover:bg-[#1C47B8] text-white text-xs font-bold cursor-pointer"
              >
                Open Full Workflow Engine →
              </button>
            </div>

            <div class="overflow-x-auto">
              <table class="w-full text-left border-collapse text-xs">
                <thead>
                  <tr class="bg-[#F4F6FB] border-b border-slate-200 text-slate-600 font-semibold uppercase">
                    <th class="py-2.5 px-3">App ID &amp; Institution</th>
                    <th class="py-2.5 px-3">Region</th>
                    <th class="py-2.5 px-3">APH Track</th>
                    <th class="py-2.5 px-3">Current Stage</th>
                    <th class="py-2.5 px-3">SLA Status</th>
                    <th class="py-2.5 px-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-100">
                  ${state.applications
                    .map(
                      (app) => `
                    <tr class="hover:bg-[#F4F6FB]">
                      <td class="py-3 px-3">
                        <div class="font-bold text-[#2456D6]">${app.appNumber}</div>
                        <div class="text-[#0B2545] font-semibold">${app.institutionName}</div>
                      </td>
                      <td class="py-3 px-3 font-medium text-slate-700">${app.region} (${app.state})</td>
                      <td class="py-3 px-3">
                        <span class="px-2 py-0.5 rounded bg-blue-50 text-[#2456D6] border border-blue-200 font-semibold">${app.workflowTrack}</span>
                      </td>
                      <td class="py-3 px-3 font-semibold text-[#0B2545]">${app.currentStage}</td>
                      <td class="py-3 px-3">${statusBadgePill(app.slaStatus)}</td>
                      <td class="py-3 px-3 text-right whitespace-nowrap space-x-1.5">
                        <button
                          data-quick-process="${app.id}"
                          class="px-2.5 py-1.5 rounded-lg bg-[#2456D6] hover:bg-[#1C47B8] text-white font-semibold cursor-pointer"
                        >
                          Process
                        </button>
                        <button
                          data-open-case="${app.id}"
                          class="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold cursor-pointer"
                        >
                          Dossier
                        </button>
                      </td>
                    </tr>
                  `
                    )
                    .join('')}
                </tbody>
              </table>
            </div>
          </div>

          <!-- Right Quick Actions Card -->
          <div class="lg:col-span-4 rounded-2xl bg-white border border-[#E1E6EF] p-5 shadow-2xs flex flex-col justify-between space-y-4">
            <div class="space-y-2.5">
              <h3 class="text-base font-serif font-bold text-[#0B2545]">Quick Statutory Actions</h3>
              <button
                data-goto-module="${user.subRole === 'EVC Member' ? 'evc' : user.subRole === 'SAC/SHC Member' ? 'sac' : 'applications'}"
                class="w-full p-3 rounded-xl bg-[#F4F6FB] hover:bg-blue-50/70 border border-slate-200 flex items-center justify-between text-left transition cursor-pointer"
              >
                <div>
                  <div class="text-xs font-bold text-[#0B2545]">
                    ${
                      user.subRole === 'EVC Member'
                        ? '🏛️ Submit EVC Rubric & Review'
                        : user.subRole === 'SAC/SHC Member'
                        ? '⚖️ Record SAC / SHC Bench Verdict'
                        : '✍️ Sign-Off EoA / LoA Orders'
                    }
                  </div>
                  <div class="text-[11px] text-slate-500">Auto-routes to next stage &amp; saves in DB</div>
                </div>
                <span class="text-[#2456D6] font-bold">→</span>
              </button>

              <button
                data-goto-module="compliance"
                class="w-full p-3 rounded-xl bg-[#F4F6FB] hover:bg-amber-50/70 border border-slate-200 flex items-center justify-between text-left transition cursor-pointer"
              >
                <div>
                  <div class="text-xs font-bold text-[#0B2545]">📑 Verify Time-Bound Undertakings</div>
                  <div class="text-[11px] text-slate-500">${state.undertakings.length} Conditional Approval Undertakings</div>
                </div>
                <span class="text-amber-700 font-bold">→</span>
              </button>

              <button
                data-goto-module="documents"
                class="w-full p-3 rounded-xl bg-[#F4F6FB] hover:bg-emerald-50/70 border border-slate-200 flex items-center justify-between text-left transition cursor-pointer"
              >
                <div>
                  <div class="text-xs font-bold text-[#0B2545]">📜 Lease &amp; Document Validity</div>
                  <div class="text-[11px] text-slate-500">Track 30-Yr Land Leases &amp; Fire NOCs</div>
                </div>
                <span class="text-emerald-700 font-bold">→</span>
              </button>

              <button
                id="btn-overview-biometric-recheck"
                class="w-full p-3 rounded-xl bg-[#F4F6FB] hover:bg-slate-100 border border-slate-200 flex items-center justify-between text-left transition cursor-pointer"
              >
                <div>
                  <div class="text-xs font-bold text-[#0B2545]">👤 Biometric Step-Up Face Check</div>
                  <div class="text-[11px] text-slate-500">Verify live identity before statutory orders</div>
                </div>
                <span class="text-[#0B2545] font-bold">→</span>
              </button>
            </div>

            <button
              id="btn-overview-export-csv"
              class="w-full py-2.5 px-4 rounded-xl bg-[#0B2545] hover:bg-[#133560] text-white text-xs font-bold uppercase tracking-wider cursor-pointer"
            >
              ⬇ Export Consolidated CSV Report
            </button>
          </div>
        </div>
      </div>
    `;
  }

  // ==========================================================================
  // APPLICATIONS & END-TO-END WORKFLOW AUTOMATION TAB
  // ==========================================================================
  function renderApplicationsWorkflowTab(state, user) {
    const isCommittee = user.statementRole === 'Committee';
    const filtered = getFilteredApplications();
    const selectedApp =
      state.applications.find((a) => a.id === selectedAppIdForAction) ||
      filtered[0] ||
      state.applications[0];

    return `
      <div class="space-y-6">
        <!-- Search & Filter Bar -->
        <div class="rounded-2xl bg-white border border-[#E1E6EF] p-5 shadow-2xs space-y-4">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 class="text-base font-serif font-bold text-[#0B2545]">
                End-to-End APH Approval Workflow Automation &amp; Routing Engine
              </h3>
              <p class="text-xs text-slate-500">
                Supports Only Scrutiny, Scrutiny + EVC, EVC + SAC/SHC, and Only EVC with recorded deficiency return &amp; database persistence.
              </p>
            </div>
            <span class="px-3 py-1 rounded-full bg-blue-50 text-[#2456D6] border border-blue-200 text-xs font-bold">
              Active Actor: ${user.subRole}
            </span>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <input
              id="wf-search-input"
              type="text"
              value="${searchQuery}"
              placeholder="Search Institution, App ID, or State..."
              class="px-3.5 py-2 rounded-xl bg-[#F4F6FB] border border-slate-300 text-xs text-[#121621]"
            />
            <select id="wf-region-select" class="px-3 py-2 rounded-xl bg-[#F4F6FB] border border-slate-300 text-xs font-semibold">
              <option value="ALL" ${regionFilter === 'ALL' ? 'selected' : ''}>All 8 AICTE Regions</option>
              ${['North', 'South', 'West', 'East', 'Central', 'North-West', 'South-West', 'South-Central']
                .map((r) => `<option value="${r}" ${regionFilter === r ? 'selected' : ''}>${r} Region</option>`)
                .join('')}
            </select>
            <select id="wf-track-select" class="px-3 py-2 rounded-xl bg-[#F4F6FB] border border-slate-300 text-xs font-semibold">
              <option value="ALL" ${trackFilter === 'ALL' ? 'selected' : ''}>All APH Workflow Tracks</option>
              ${['Only Scrutiny', 'Scrutiny + EVC', 'EVC + SAC/SHC', 'Only EVC']
                .map((t) => `<option value="${t}" ${trackFilter === t ? 'selected' : ''}>${t}</option>`)
                .join('')}
            </select>
            <select id="wf-sla-select" class="px-3 py-2 rounded-xl bg-[#F4F6FB] border border-slate-300 text-xs font-semibold">
              <option value="ALL" ${slaFilter === 'ALL' ? 'selected' : ''}>All SLA Statuses</option>
              ${['On Track', 'Approaching Deadline', 'Overdue / Escalated']
                .map((s) => `<option value="${s}" ${slaFilter === s ? 'selected' : ''}>${s}</option>`)
                .join('')}
            </select>
          </div>
        </div>

        <!-- 2-Column Split: Left Applications List (7 cols) + Right Action & Routing Console (5 cols) -->
        <div class="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div class="lg:col-span-7 space-y-3">
            ${filtered
              .map((app) => {
                const isSelected = selectedApp && selectedApp.id === app.id;
                return `
                  <div
                    data-select-wf-app="${app.id}"
                    class="rounded-2xl bg-white border-2 p-4 shadow-2xs transition cursor-pointer ${
                      isSelected ? 'border-[#2456D6] ring-2 ring-blue-100' : 'border-[#E1E6EF] hover:border-slate-300'
                    }"
                  >
                    <div class="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <div class="flex items-center gap-2 flex-wrap">
                          <span class="font-bold text-xs text-[#2456D6]">${app.appNumber}</span>
                          <span class="px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-[11px] font-semibold">${app.region} (${app.state})</span>
                          <span class="px-2 py-0.5 rounded bg-amber-50 text-amber-900 border border-amber-200 text-[11px] font-semibold">Track: ${app.workflowTrack}</span>
                        </div>
                        <h4 class="text-sm font-bold text-[#0B2545] mt-1">${app.institutionName}</h4>
                        <div class="text-xs text-slate-500">${app.program || app.course} • ${app.applicationType}</div>
                      </div>
                      <div class="text-right">
                        ${statusBadgePill(app.slaStatus)}
                        <div class="text-[11px] text-slate-500 mt-1">Stage Ageing: <strong>${app.daysInStage}d / ${app.slaLimitDays || 10}d</strong></div>
                      </div>
                    </div>

                    <div class="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600">
                      <span>Current Stage: <strong class="text-[#0B2545]">${app.currentStage}</strong> (${app.assignedSubRole})</span>
                      <button
                        data-open-case="${app.id}"
                        class="text-[#2456D6] hover:underline font-bold cursor-pointer"
                      >
                        📄 Electronic Case Summary
                      </button>
                    </div>
                  </div>
                `;
              })
              .join('')}
          </div>

          <!-- Right Action Decision Panel -->
          <div class="lg:col-span-5 rounded-2xl bg-white border-2 border-[#0B2545] p-5 shadow-md sticky top-20 space-y-4">
            ${
              selectedApp
                ? `
              <div class="border-b border-slate-200 pb-3">
                <span class="text-[10px] font-bold uppercase tracking-wider text-[#2456D6] block">
                  Authorised Stage Routing &amp; Decision Console
                </span>
                <h3 class="text-base font-serif font-bold text-[#0B2545] mt-0.5">${selectedApp.institutionName}</h3>
                <div class="text-xs text-slate-500">${selectedApp.appNumber} • Current Stage: <strong class="text-[#0B2545]">${selectedApp.currentStage}</strong></div>
              </div>

              <div class="space-y-2 text-xs bg-[#F4F6FB] p-3.5 rounded-xl border border-slate-200">
                <div><strong class="text-[#0B2545]">Scrutiny Summary:</strong> <span class="text-slate-600">${selectedApp.scrutinySummary}</span></div>
                <div><strong class="text-[#0B2545]">EVC Readiness (${selectedApp.evcScore || 86}%):</strong> <span class="text-slate-600">${selectedApp.evcRecommendation}</span></div>
                <div><strong class="text-[#0B2545]">SAC/SHC Bench:</strong> <span class="text-slate-600">${selectedApp.sacRecommendation}</span></div>
              </div>

              <div>
                <label class="block text-xs font-bold uppercase text-slate-700 mb-1">
                  Official Remarks / Deficiency Reason / Undertaking Condition
                </label>
                <textarea
                  id="wf-action-remarks"
                  rows="3"
                  placeholder="Enter statutory observation, deficiency reason for return, or time-bound undertaking condition..."
                  class="w-full px-3 py-2 rounded-xl bg-[#F4F6FB] border border-slate-300 text-xs text-[#121621] focus:outline-none focus:border-[#2456D6]"
                ></textarea>
              </div>

              <div class="space-y-2">
                ${
                  isCommittee
                    ? `
                  <button
                    data-wf-execute="FORWARD_TO_CA"
                    data-wf-app="${selectedApp.id}"
                    class="w-full py-2.5 px-4 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs uppercase tracking-wider shadow-xs cursor-pointer"
                  >
                    ✔ Complete ${user.subRole} Stage &amp; Forward to Competent Authority
                  </button>
                  <button
                    data-wf-execute="ROUTE_TO_SAC"
                    data-wf-app="${selectedApp.id}"
                    class="w-full py-2.5 px-4 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs uppercase tracking-wider shadow-xs cursor-pointer"
                  >
                    ⚖️ Flag Deficiency &amp; Route to SAC/SHC Hearing
                  </button>
                `
                    : `
                  <button
                    data-wf-execute="APPROVE_FINAL"
                    data-wf-app="${selectedApp.id}"
                    class="w-full py-2.5 px-4 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs uppercase tracking-wider shadow-xs cursor-pointer"
                  >
                    ✔ Grant Final Statutory Approval (Issue EoA / LoA)
                  </button>
                  <button
                    data-wf-execute="APPROVE_CONDITIONAL"
                    data-wf-app="${selectedApp.id}"
                    class="w-full py-2.5 px-4 rounded-xl bg-[#2456D6] hover:bg-[#1C47B8] text-white font-bold text-xs uppercase tracking-wider shadow-xs cursor-pointer"
                  >
                    ⏳ Grant Conditional Approval with Time-Bound Undertaking
                  </button>
                `
                }

                <button
                  data-wf-execute="REVERT_DEFICIENCY"
                  data-wf-app="${selectedApp.id}"
                  class="w-full py-2 px-4 rounded-xl bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 font-bold text-xs uppercase tracking-wider cursor-pointer"
                >
                  ↩ Return / Revert Application for Deficiency
                </button>
              </div>
            `
                : ''
            }
          </div>
        </div>
      </div>
    `;
  }

  // ==========================================================================
  // EVC SCHEDULING, 4-PILLAR RUBRIC & COMMITTEE REVIEW TAB
  // ==========================================================================
  function renderEvcSchedulingTab(state) {
    const list =
      evcSubTab === 'OVERDUE'
        ? state.evcInspections.filter((e) => e.status.includes('Delayed') || e.isNewInstitution)
        : state.evcInspections;
    const selectedEvc =
      state.evcInspections.find((e) => e.id === selectedEvcIdForScoring) || state.evcInspections[0];

    return `
      <div class="space-y-6">
        <div class="flex flex-wrap items-center justify-between gap-3 bg-white p-5 rounded-2xl border border-[#E1E6EF] shadow-2xs">
          <div>
            <h3 class="text-base font-serif font-bold text-[#0B2545]">
              Expert Visit Committee (EVC) Scheduling, 4-Pillar Rubric &amp; Review Console
            </h3>
            <p class="text-xs text-slate-500">
              Schedule EVC inspections, score Infrastructure/Lab/Faculty/Library, and record Committee Reviews in the database.
            </p>
          </div>
          <div class="flex items-center gap-2">
            <button
              data-evc-subtab="ALL"
              class="px-3.5 py-1.5 rounded-xl text-xs font-bold cursor-pointer ${
                evcSubTab === 'ALL' ? 'bg-[#0B2545] text-white' : 'bg-slate-100 text-slate-700'
              }"
            >
              Scheduled EVCs (${state.evcInspections.length})
            </button>
            <button
              data-evc-subtab="OVERDUE"
              class="px-3.5 py-1.5 rounded-xl text-xs font-bold cursor-pointer ${
                evcSubTab === 'OVERDUE' ? 'bg-red-600 text-white' : 'bg-red-50 text-red-700 border border-red-200'
              }"
            >
              New Institutions &amp; Overdue Alerts
            </button>
          </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div class="lg:col-span-7 space-y-4">
            <div class="rounded-2xl bg-white border border-[#E1E6EF] p-5 shadow-2xs overflow-x-auto">
              <table class="w-full text-left border-collapse text-xs">
                <thead>
                  <tr class="bg-[#F4F6FB] border-b border-slate-200 text-slate-600 uppercase font-semibold">
                    <th class="py-2.5 px-3">App ID &amp; Institution</th>
                    <th class="py-2.5 px-3">Region</th>
                    <th class="py-2.5 px-3">Scheduled / SLA</th>
                    <th class="py-2.5 px-3">Composite Score</th>
                    <th class="py-2.5 px-3">Status</th>
                    <th class="py-2.5 px-3 text-right">Inspect</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-100">
                  ${list
                    .map(
                      (evc) => `
                    <tr class="hover:bg-[#F4F6FB] ${selectedEvc?.id === evc.id ? 'bg-blue-50/50' : ''}">
                      <td class="py-3 px-3">
                        <div class="font-bold text-[#2456D6]">${evc.appNumber}</div>
                        <div class="text-[#0B2545] font-semibold">${evc.institutionName}</div>
                      </td>
                      <td class="py-3 px-3 font-medium text-slate-700">${evc.region}</td>
                      <td class="py-3 px-3">
                        <div class="font-semibold text-slate-800">Visit: ${evc.scheduledDate}</div>
                        <div class="text-slate-500">SLA: ${evc.slaDueDate}</div>
                      </td>
                      <td class="py-3 px-3">
                        <span class="text-sm font-extrabold text-[#0B2545]">${evc.overallScore}%</span>
                      </td>
                      <td class="py-3 px-3">${statusBadgePill(evc.status)}</td>
                      <td class="py-3 px-3 text-right">
                        <button
                          data-select-evc="${evc.id}"
                          class="px-3 py-1.5 rounded-lg bg-[#2456D6] text-white font-semibold cursor-pointer"
                        >
                          Rubric
                        </button>
                      </td>
                    </tr>
                  `
                    )
                    .join('')}
                </tbody>
              </table>
            </div>

            <!-- Schedule New EVC Visit Card -->
            <div class="rounded-2xl bg-white border border-[#E1E6EF] p-5 shadow-2xs">
              <h4 class="text-sm font-serif font-bold text-[#0B2545] mb-3">
                Schedule EVC Field Visit
              </h4>
              <form id="form-schedule-evc" class="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                <div>
                  <label class="block text-[11px] font-bold uppercase text-slate-600 mb-1">Application</label>
                  <select id="evc-sched-app" class="w-full px-3 py-2 rounded-xl bg-[#F4F6FB] border border-slate-300 text-xs font-semibold">
                    ${state.applications
                      .map((a) => `<option value="${a.appNumber}">${a.appNumber} — ${a.institutionName.slice(0, 26)}...</option>`)
                      .join('')}
                  </select>
                </div>
                <div>
                  <label class="block text-[11px] font-bold uppercase text-slate-600 mb-1">Inspection Date</label>
                  <input id="evc-sched-date" type="date" value="2026-10-27" class="w-full px-3 py-2 rounded-xl bg-[#F4F6FB] border border-slate-300 text-xs" />
                </div>
                <button type="submit" class="py-2 px-4 rounded-xl bg-[#0B2545] hover:bg-[#133560] text-white font-bold text-xs uppercase cursor-pointer">
                  + Schedule EVC Visit
                </button>
              </form>
            </div>
          </div>

          <!-- Right 4-Pillar EVC Scoring Rubric -->
          <div class="lg:col-span-5 rounded-2xl bg-white border-2 border-[#2456D6] p-5 shadow-md space-y-4">
            ${
              selectedEvc
                ? `
              <div class="border-b border-slate-200 pb-3">
                <span class="text-[10px] font-bold uppercase tracking-wider text-[#2456D6] block">
                  EVC Field Inspection Rubric
                </span>
                <h4 class="text-base font-serif font-bold text-[#0B2545]">${selectedEvc.institutionName}</h4>
                <div class="text-xs text-slate-500">${selectedEvc.appNumber} • Chair: ${selectedEvc.evcChairperson}</div>
              </div>

              <div class="space-y-3 text-xs">
                <div>
                  <div class="flex justify-between font-semibold mb-1">
                    <span>1. Built-Up Instructional Area &amp; Classrooms</span>
                    <span id="lbl-infra" class="font-bold text-[#0B2545]">${selectedEvc.infraScore}%</span>
                  </div>
                  <input id="inp-infra" type="range" min="40" max="100" value="${selectedEvc.infraScore}" class="w-full accent-[#2456D6]" />
                </div>

                <div>
                  <div class="flex justify-between font-semibold mb-1">
                    <span>2. Laboratory &amp; Computing Readiness</span>
                    <span id="lbl-lab" class="font-bold text-[#0B2545]">${selectedEvc.labScore}%</span>
                  </div>
                  <input id="inp-lab" type="range" min="40" max="100" value="${selectedEvc.labScore}" class="w-full accent-[#2456D6]" />
                </div>

                <div>
                  <div class="flex justify-between font-semibold mb-1">
                    <span>3. Faculty Cadre &amp; Aadhaar-Verified FSR</span>
                    <span id="lbl-fac" class="font-bold text-[#0B2545]">${selectedEvc.facultyScore}%</span>
                  </div>
                  <input id="inp-fac" type="range" min="40" max="100" value="${selectedEvc.facultyScore}" class="w-full accent-[#2456D6]" />
                </div>

                <div>
                  <div class="flex justify-between font-semibold mb-1">
                    <span>4. Digital Library &amp; Barrier-Free Norms</span>
                    <span id="lbl-lib" class="font-bold text-[#0B2545]">${selectedEvc.libraryScore}%</span>
                  </div>
                  <input id="inp-lib" type="range" min="40" max="100" value="${selectedEvc.libraryScore}" class="w-full accent-[#2456D6]" />
                </div>
              </div>

              <div>
                <label class="block text-xs font-bold uppercase text-slate-700 mb-1">Field Observations</label>
                <textarea
                  id="evc-obs-input"
                  rows="3"
                  class="w-full px-3 py-2 rounded-xl bg-[#F4F6FB] border border-slate-300 text-xs text-[#121621]"
                >${selectedEvc.fieldObservations}</textarea>
              </div>

              <div class="space-y-2">
                <button
                  id="btn-evc-submit-ca"
                  data-evc-id="${selectedEvc.id}"
                  class="w-full py-2.5 px-4 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs uppercase tracking-wider cursor-pointer"
                >
                  ✔ Submit EVC Report &amp; Recommend to Competent Authority
                </button>
                <button
                  id="btn-evc-submit-sac"
                  data-evc-id="${selectedEvc.id}"
                  class="w-full py-2 px-4 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs uppercase tracking-wider cursor-pointer"
                >
                  ⚖️ Flag EVC Deficiencies &amp; Route to SAC/SHC Bench
                </button>
              </div>
            `
                : ''
            }
          </div>
        </div>
      </div>
    `;
  }

  // ==========================================================================
  // SAC / SHC APPELLATE HEARING BENCH TAB
  // ==========================================================================
  function renderSacTab(state) {
    return `
      <div class="space-y-6">
        <div class="rounded-2xl bg-white border border-[#E1E6EF] p-5 shadow-2xs">
          <h3 class="text-base font-serif font-bold text-[#0B2545]">
            Standing Appellate Committee (SAC) &amp; Standing Hearing Committee (SHC) Bench
          </h3>
          <p class="text-xs text-slate-500">
            Evaluate institutional appeal representations, verify rectified deficiency proofs, and forward Bench Verdict to Competent Authority.
          </p>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-5">
          ${state.sacHearings
            .map(
              (sac) => `
            <div class="rounded-2xl bg-white border border-[#E1E6EF] p-5 shadow-2xs flex flex-col justify-between space-y-4">
              <div class="space-y-3">
                <div class="flex items-center justify-between gap-2">
                  <span class="px-2.5 py-0.5 rounded-full bg-blue-50 text-[#2456D6] border border-blue-200 text-[11px] font-bold">${sac.committeeType}</span>
                  ${statusBadgePill(sac.status)}
                </div>
                <div>
                  <div class="text-xs font-bold text-[#2456D6]">${sac.appNumber} • ${sac.region} Region</div>
                  <h4 class="text-sm font-serif font-bold text-[#0B2545] mt-0.5">${sac.institutionName}</h4>
                  <div class="text-[11px] text-slate-500">Hearing Date: ${sac.hearingDate} • Chair: ${sac.benchChair}</div>
                </div>

                <div class="p-3 rounded-xl bg-red-50/70 border border-red-200 text-xs">
                  <strong class="text-red-900 block mb-0.5">Core Deficiencies Flagged:</strong>
                  <span class="text-red-800">${sac.coreDeficiencies}</span>
                </div>

                <div class="p-3 rounded-xl bg-emerald-50/70 border border-emerald-200 text-xs">
                  <strong class="text-emerald-900 block mb-0.5">Institution Representation:</strong>
                  <span class="text-emerald-800">${sac.institutionRepresentation}</span>
                </div>

                <div>
                  <label class="block text-[11px] font-bold uppercase text-slate-700 mb-1">Bench Observations</label>
                  <textarea
                    id="sac-obs-${sac.id}"
                    rows="2"
                    class="w-full px-3 py-1.5 rounded-xl bg-[#F4F6FB] border border-slate-300 text-xs"
                  >${sac.benchObservations}</textarea>
                </div>

                <div>
                  <label class="block text-[11px] font-bold uppercase text-slate-700 mb-1">Bench Recommendation</label>
                  <select id="sac-rec-${sac.id}" class="w-full px-3 py-2 rounded-xl bg-[#F4F6FB] border border-slate-300 text-xs font-semibold">
                    <option value="Recommend Conditional Approval with 60-Day Undertaking">Recommend Conditional Approval with Undertaking</option>
                    <option value="Recommend Full EoA / LoA Grant (Deficiencies Cured)">Recommend Full Approval (Deficiencies Cured)</option>
                    <option value="Reject Appeal & Revert for Re-Inspection">Reject Appeal &amp; Revert for Deficiency</option>
                  </select>
                </div>
              </div>

              <button
                data-sac-submit="${sac.id}"
                class="w-full py-2.5 px-4 rounded-xl bg-[#0B2545] hover:bg-[#133560] text-white font-bold text-xs uppercase tracking-wider cursor-pointer"
              >
                ⚖️ Record Bench Verdict &amp; Forward to Authority
              </button>
            </div>
          `
            )
            .join('')}
        </div>
      </div>
    `;
  }

  // ==========================================================================
  // TIME-BOUND UNDERTAKINGS & INSTITUTIONAL COMPLIANCE TAB
  // ==========================================================================
  function belongsToUserInstitution(item, user, state) {
    if (!item || !user) return false;
    const email = (user.email || '').toLowerCase();
    const instName = (user.institutionName || user.fullName || '').trim().toLowerCase();
    const itemEmail = (item.contactEmail || item.ownerEmail || '').toLowerCase();
    const itemInst = (item.institutionName || '').trim().toLowerCase();
    if (instName && itemInst) {
      return itemInst === instName || itemInst.startsWith(instName + ' ');
    }
    if (email && itemEmail && itemEmail === email) return true;
    const myAppNumbers = new Set(
      (state.applications || [])
        .filter((a) => {
          const aInst = (a.institutionName || '').trim().toLowerCase();
          return instName && (aInst === instName || aInst.startsWith(instName + ' '));
        })
        .map((a) => a.appNumber)
    );
    return item.appNumber ? myAppNumbers.has(item.appNumber) : false;
  }

  function renderComplianceTab(state, user) {
    const isInstitution = user?.subRole === 'Institution (Applicant)' || user?.statementRole === 'Institution';
    const isReadOnlyRole = isInstitution || user?.subRole === 'Auditor' || user?.subRole === 'System Admin';
    const sourceUndertakings = isInstitution
      ? state.undertakings.filter((u) => belongsToUserInstitution(u, user, state))
      : state.undertakings;
    const filtered = sourceUndertakings.filter((u) => {
      if (complianceSubTab === 'PENDING') return !u.verificationStatus.includes('Closed');
      if (complianceSubTab === 'COMPLETED') return u.verificationStatus.includes('Closed');
      return true;
    });

    return `
      <div class="space-y-6">
        <div class="rounded-2xl bg-white border border-[#E1E6EF] p-5 shadow-2xs flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 class="text-base font-serif font-bold text-[#0B2545]">
              Monitoring of Time-Bound Undertakings &amp; Institutional Compliance
            </h3>
            <p class="text-xs text-slate-500">
              Digital ledger of conditional approvals, compliance evidence verification, and overdue escalations.
            </p>
          </div>
          <div class="flex items-center gap-2">
            <button data-comp-subtab="ALL" class="px-3.5 py-1.5 rounded-xl text-xs font-bold cursor-pointer ${complianceSubTab === 'ALL' ? 'bg-[#0B2545] text-white' : 'bg-slate-100 text-slate-700'}">All (${sourceUndertakings.length})</button>
            <button data-comp-subtab="PENDING" class="px-3.5 py-1.5 rounded-xl text-xs font-bold cursor-pointer ${complianceSubTab === 'PENDING' ? 'bg-[#2456D6] text-white' : 'bg-slate-100 text-slate-700'}">Pending / Overdue</button>
            <button data-comp-subtab="COMPLETED" class="px-3.5 py-1.5 rounded-xl text-xs font-bold cursor-pointer ${complianceSubTab === 'COMPLETED' ? 'bg-emerald-700 text-white' : 'bg-slate-100 text-slate-700'}">Verified &amp; Closed</button>
          </div>
        </div>

        <div class="rounded-2xl bg-white border border-[#E1E6EF] p-5 shadow-2xs overflow-x-auto">
          <table class="w-full text-left border-collapse text-xs">
            <thead>
              <tr class="bg-[#F4F6FB] border-b border-slate-200 text-slate-600 uppercase font-semibold">
                <th class="py-2.5 px-3">Code &amp; Institution</th>
                <th class="py-2.5 px-3">Prescribed Condition</th>
                <th class="py-2.5 px-3">Due Date</th>
                <th class="py-2.5 px-3">Evidence</th>
                <th class="py-2.5 px-3">Status</th>
                <th class="py-2.5 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              ${filtered
                .map(
                  (u) => `
                <tr class="hover:bg-[#F4F6FB]">
                  <td class="py-3 px-3">
                    <div class="font-bold text-[#2456D6]">${u.undertakingCode}</div>
                    <div class="font-semibold text-[#0B2545]">${u.institutionName}</div>
                  </td>
                  <td class="py-3 px-3 max-w-xs">
                    <div class="font-semibold text-slate-800">${u.conditionCategory}</div>
                    <div class="text-slate-600">${u.prescribedCondition}</div>
                  </td>
                  <td class="py-3 px-3 font-semibold">${u.dueDate}</td>
                  <td class="py-3 px-3">
                    ${
                      u.evidenceSubmitted
                        ? `<span class="px-2 py-1 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 font-medium inline-block">📄 ${u.evidenceDocumentName}</span>`
                        : `<span class="px-2 py-1 rounded bg-red-50 text-red-700 border border-red-200 font-semibold inline-block">Not Uploaded</span>`
                    }
                  </td>
                  <td class="py-3 px-3">${statusBadgePill(u.verificationStatus)}</td>
                  <td class="py-3 px-3 text-right space-y-1">
                    ${
                      isInstitution
                        ? `<button
                            data-und-action="INSTITUTION_UPLOAD_EVIDENCE"
                            data-und-id="${u.id}"
                            class="block w-full px-2.5 py-1 rounded bg-[#2456D6] hover:bg-[#1d46b5] text-white font-semibold cursor-pointer"
                          >
                            📤 Upload Affidavit
                          </button>`
                        : isReadOnlyRole
                        ? `<span class="text-slate-400 font-semibold">Read-Only</span>`
                        : `<button
                            data-und-action="VERIFY_CLOSE"
                            data-und-id="${u.id}"
                            class="block w-full px-2.5 py-1 rounded bg-emerald-700 hover:bg-emerald-800 text-white font-semibold cursor-pointer"
                          >
                            ✔ Verify &amp; Close
                          </button>
                          <button
                            data-und-action="ESCALATE_OVERDUE"
                            data-und-id="${u.id}"
                            class="block w-full px-2.5 py-1 rounded bg-red-600 hover:bg-red-700 text-white font-semibold cursor-pointer"
                          >
                            🚨 Escalate Overdue
                          </button>`
                    }
                  </td>
                </tr>
              `
                )
                .join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  // ==========================================================================
  // LEASE & DOCUMENT VALIDITY MONITORING TAB
  // ==========================================================================
  function renderDocumentsTab(state, user) {
    const isInstitution = user?.subRole === 'Institution (Applicant)' || user?.statementRole === 'Institution';
    const isReadOnlyRole = isInstitution || user?.subRole === 'Auditor' || user?.subRole === 'System Admin';
    const sourceDocuments = isInstitution
      ? state.documents.filter((d) => belongsToUserInstitution(d, user, state))
      : state.documents;
    const filtered = sourceDocuments.filter((d) => {
      if (docSubTab === 'LEASE') return d.documentType.includes('Lease');
      if (docSubTab === 'OTHER') return !d.documentType.includes('Lease');
      return true;
    });

    return `
      <div class="space-y-6">
        <div class="rounded-2xl bg-white border border-[#E1E6EF] p-5 shadow-2xs flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 class="text-base font-serif font-bold text-[#0B2545]">
              Lease &amp; Prescribed Document Validity Monitoring
            </h3>
            <p class="text-xs text-slate-500">
              Track expiry dates of registered land lease deeds, Fire Safety NOCs, Structural Stability Certificates &amp; Joint FDRs.
            </p>
          </div>
          <div class="flex items-center gap-2">
            <button data-doc-subtab="ALL" class="px-3.5 py-1.5 rounded-xl text-xs font-bold cursor-pointer ${docSubTab === 'ALL' ? 'bg-[#0B2545] text-white' : 'bg-slate-100 text-slate-700'}">All (${sourceDocuments.length})</button>
            <button data-doc-subtab="LEASE" class="px-3.5 py-1.5 rounded-xl text-xs font-bold cursor-pointer ${docSubTab === 'LEASE' ? 'bg-[#2456D6] text-white' : 'bg-slate-100 text-slate-700'}">Land Lease Deeds</button>
            <button data-doc-subtab="OTHER" class="px-3.5 py-1.5 rounded-xl text-xs font-bold cursor-pointer ${docSubTab === 'OTHER' ? 'bg-[#0B2545] text-white' : 'bg-slate-100 text-slate-700'}">Fire, Structural &amp; FDR</button>
          </div>
        </div>

        <div class="rounded-2xl bg-white border border-[#E1E6EF] p-5 shadow-2xs overflow-x-auto">
          <table class="w-full text-left border-collapse text-xs">
            <thead>
              <tr class="bg-[#F4F6FB] border-b border-slate-200 text-slate-600 uppercase font-semibold">
                <th class="py-2.5 px-3">Institution</th>
                <th class="py-2.5 px-3">Document Type</th>
                <th class="py-2.5 px-3">Expiry Date</th>
                <th class="py-2.5 px-3">Validity Status</th>
                <th class="py-2.5 px-3">Renewal File</th>
                <th class="py-2.5 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              ${filtered
                .map(
                  (d) => `
                <tr class="hover:bg-[#F4F6FB]">
                  <td class="py-3 px-3">
                    <div class="font-bold text-[#0B2545]">${d.institutionName}</div>
                    <div class="text-slate-500">${d.appNumber} • ${d.region}</div>
                  </td>
                  <td class="py-3 px-3">
                    <div class="font-bold text-slate-800">${d.documentType}</div>
                    <div class="text-slate-500">${d.documentNumber}</div>
                  </td>
                  <td class="py-3 px-3 font-semibold">${d.expiryDate}</td>
                  <td class="py-3 px-3">${statusBadgePill(d.validityStatus)}</td>
                  <td class="py-3 px-3">
                    ${
                      d.renewalDocumentName
                        ? `<span class="px-2 py-1 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 font-medium inline-block">📄 ${d.renewalDocumentName}</span>`
                        : `<span class="text-red-600 font-semibold">No Renewal Uploaded</span>`
                    }
                  </td>
                  <td class="py-3 px-3 text-right space-y-1">
                    ${
                      isInstitution
                        ? `<button
                            data-doc-action="INSTITUTION_UPLOAD_RENEWAL"
                            data-doc-id="${d.id}"
                            class="block w-full px-2.5 py-1 rounded bg-[#0B2545] hover:bg-[#13315C] text-white font-semibold cursor-pointer"
                          >
                            📤 Upload Renewal
                          </button>`
                        : isReadOnlyRole
                        ? `<span class="text-slate-400 font-semibold">Read-Only</span>`
                        : `<button
                            data-doc-action="VERIFY_RENEWAL"
                            data-doc-id="${d.id}"
                            class="block w-full px-2.5 py-1 rounded bg-emerald-700 hover:bg-emerald-800 text-white font-semibold cursor-pointer"
                          >
                            ✔ Verify Renewal
                          </button>
                          <button
                            data-doc-action="ESCALATE_EXPIRED"
                            data-doc-id="${d.id}"
                            class="block w-full px-2.5 py-1 rounded bg-red-600 hover:bg-red-700 text-white font-semibold cursor-pointer"
                          >
                            🚨 Escalate Expired
                          </button>`
                    }
                  </td>
                </tr>
              `
                )
                .join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  // ==========================================================================
  // ALERTS & ESCALATIONS TAB
  // ==========================================================================
  function renderAlertsTab(state, user) {
    const isInstitution = user?.subRole === 'Institution (Applicant)' || user?.statementRole === 'Institution';
    const isAuditor = user?.subRole === 'Auditor';
    const sourceAlerts = isInstitution
      ? state.alerts.filter((a) => belongsToUserInstitution(a, user, state))
      : state.alerts;

    return `
      <div class="space-y-6">
        <div class="rounded-2xl bg-white border border-[#E1E6EF] p-5 shadow-2xs flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 class="text-base font-serif font-bold text-[#0B2545]">
              Automated Notifications, Deadline Reminders &amp; Overdue Escalations
            </h3>
            <p class="text-xs text-slate-500">
              Real-time alerts for stage pendency breaches, EVC delays, unfulfilled undertakings, and expired leases.
            </p>
          </div>
          ${
            !isAuditor
              ? `<button
                  id="btn-mark-all-alerts"
                  class="px-4 py-2 rounded-xl bg-[#0B2545] hover:bg-[#133560] text-white text-xs font-bold cursor-pointer"
                >
                  ✔ Mark All as Acknowledged
                </button>`
              : ''
          }
        </div>

        <div class="space-y-3">
          ${sourceAlerts
            .map(
              (alt) => `
            <div class="rounded-2xl bg-white border-l-4 ${
              alt.severity === 'Critical'
                ? 'border-l-red-600'
                : alt.severity === 'High'
                ? 'border-l-[#2456D6]'
                : 'border-l-amber-500'
            } border border-[#E1E6EF] p-4 shadow-2xs flex flex-wrap items-center justify-between gap-4">
              <div class="space-y-1 max-w-3xl">
                <div class="flex items-center gap-2 flex-wrap">
                  <span class="px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                    alt.severity === 'Critical' ? 'bg-red-100 text-red-800' : 'bg-blue-50 text-[#2456D6]'
                  }">${alt.severity} • ${alt.category}</span>
                  <span class="text-xs font-bold text-slate-500">${alt.alertCode} • File: ${alt.appNumber}</span>
                  <span class="text-[11px] text-slate-400">${alt.createdAt}</span>
                </div>
                <h4 class="text-sm font-bold text-[#0B2545]">${alt.title}</h4>
                <p class="text-xs text-slate-600">${alt.message}</p>
              </div>
              <div>
                ${
                  alt.isAcknowledged
                    ? `<span class="px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold">✔ Acknowledged</span>`
                    : isAuditor
                    ? `<span class="px-3 py-1.5 rounded-xl bg-slate-100 text-slate-600 text-xs font-bold">Unacknowledged</span>`
                    : `<button data-ack-alert="${alt.id}" class="px-3.5 py-2 rounded-xl bg-[#2456D6] hover:bg-[#1C47B8] text-white text-xs font-bold cursor-pointer">Acknowledge Alert</button>`
                }
              </div>
            </div>
          `
            )
            .join('')}
        </div>
      </div>
    `;
  }

  // ==========================================================================
  // REPORTS, ANALYTICS & APH RULES TAB
  // ==========================================================================
  function renderReportsTab(state, user) {
    return `
      <div class="space-y-6">
        <div class="rounded-2xl bg-white border border-[#E1E6EF] p-5 shadow-2xs flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 class="text-base font-serif font-bold text-[#0B2545]">
              Consolidated Reports, Region-Wise Performance &amp; Configurable APH Rules
            </h3>
            <p class="text-xs text-slate-500">
              Export CSV reports, configure APH 2026–27 SLA rules, and inspect the complete digital audit trail.
            </p>
          </div>
          <button
            id="btn-reports-download"
            class="px-4 py-2 rounded-xl bg-[#2456D6] hover:bg-[#1C47B8] text-white text-xs font-bold cursor-pointer"
          >
            ⬇ Download Consolidated CSV Report
          </button>
        </div>

        ${renderAestheticProgressCharts(state, user, {
          trackerTitle: 'National Region-Wise Approval & Compliance Performance Graph'
        })}

        <!-- Configurable APH Rules Table -->
        <div class="rounded-2xl bg-white border border-[#E1E6EF] p-5 shadow-2xs">
          <h4 class="text-sm font-serif font-bold text-[#0B2545] mb-3">
            Configurable APH 2026–27 Workflow Rules &amp; Stage Timelines
          </h4>
          <div class="overflow-x-auto">
            <table class="w-full text-left border-collapse text-xs">
              <thead>
                <tr class="bg-[#F4F6FB] border-b border-slate-200 text-slate-600 uppercase font-semibold">
                  <th class="py-2.5 px-3">Rule Code</th>
                  <th class="py-2.5 px-3">APH Track</th>
                  <th class="py-2.5 px-3">SLA Days</th>
                  <th class="py-2.5 px-3">Warning Days</th>
                  <th class="py-2.5 px-3">Auto-Escalate To</th>
                  <th class="py-2.5 px-3 text-right">Update</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                ${state.aphRules
                  .map(
                    (r) => `
                  <tr>
                    <td class="py-2.5 px-3 font-bold text-[#0B2545]">${r.ruleCode}</td>
                    <td class="py-2.5 px-3 font-semibold text-[#2456D6]">${r.workflowTrack}</td>
                    <td class="py-2.5 px-3">
                      <input id="rule-sla-${r.id}" type="number" value="${r.prescribedSlaDays}" class="w-16 px-2 py-1 rounded border border-slate-300 font-bold" />
                    </td>
                    <td class="py-2.5 px-3">
                      <input id="rule-warn-${r.id}" type="number" value="${r.warningThresholdDays}" class="w-16 px-2 py-1 rounded border border-slate-300 font-bold" />
                    </td>
                    <td class="py-2.5 px-3 text-slate-600">${r.autoEscalateTo}</td>
                    <td class="py-2.5 px-3 text-right">
                      <button data-save-rule="${r.id}" class="px-3 py-1 rounded bg-[#0B2545] text-white font-semibold cursor-pointer">Save</button>
                    </td>
                  </tr>
                `
                  )
                  .join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  }

  // ==========================================================================
  // PROFILE & 6-DASHBOARD ROLE MATRIX TAB
  // ==========================================================================
  function renderProfileTab(state, user) {
    return `
      <div class="space-y-6">
        <div class="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div class="lg:col-span-4 rounded-2xl bg-white border border-[#E1E6EF] p-6 shadow-2xs text-center space-y-3">
            <div class="w-20 h-20 rounded-full bg-[#0B2545] text-amber-300 font-serif font-bold text-2xl flex items-center justify-center mx-auto border-4 border-[#2456D6]">
              ${user.avatarInitials}
            </div>
            <h3 class="text-lg font-serif font-bold text-[#0B2545]">${user.fullName}</h3>
            <div class="px-3 py-1 rounded-full bg-blue-50 text-[#2456D6] border border-blue-200 font-bold text-xs inline-block">
              ${user.statementRole} • ${user.subRole}
            </div>
            <p class="text-xs text-slate-600">${user.designation}</p>
            <p class="text-xs text-slate-500">Region: ${user.region} • Code: ${user.employeeCode}</p>
          </div>

          <div class="lg:col-span-8 rounded-2xl bg-white border border-[#E1E6EF] p-6 shadow-2xs space-y-4">
            <h3 class="text-base font-serif font-bold text-[#0B2545] border-b border-slate-200 pb-3">
              Authorised Statutory Permissions &amp; Database Session Status
            </h3>
            <ul class="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs text-slate-700">
              ${(user.permissions || [])
                .map(
                  (p) => `
                <li class="p-3 rounded-xl bg-[#F4F6FB] border border-slate-200 flex items-center gap-2">
                  <span class="text-emerald-700 font-bold">✔</span>
                  <span>${p}</span>
                </li>
              `
                )
                .join('')}
            </ul>
          </div>
        </div>

        <div class="rounded-2xl bg-white border border-[#E1E6EF] p-6 shadow-2xs">
          <h3 class="text-base font-serif font-bold text-[#0B2545] mb-3">
            Complete 6-Dashboard Role Architecture
          </h3>
          <div class="overflow-x-auto">
            <table class="w-full text-left border-collapse text-xs">
              <thead>
                <tr class="bg-[#F4F6FB] border-b border-slate-200 text-slate-600 uppercase font-semibold">
                  <th class="py-2.5 px-3">Statement Role Group</th>
                  <th class="py-2.5 px-3">Real-Life Roles Under It</th>
                  <th class="py-2.5 px-3">Workspace Status</th>
                  <th class="py-2.5 px-3">Capabilities</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                ${state.roleMappingMatrix
                  .map(
                    (row) => `
                  <tr>
                    <td class="py-2.5 px-3 font-bold text-[#0B2545]">${row.statementRole}</td>
                    <td class="py-2.5 px-3 font-medium text-slate-800">${row.realLifeRoles}</td>
                    <td class="py-2.5 px-3">
                      <span class="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[11px]">✔ ${row.badge}</span>
                    </td>
                    <td class="py-2.5 px-3 text-slate-600">${row.note}</td>
                  </tr>
                `
                  )
                  .join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  }

  // ==========================================================================
  // MAIN RENDER FUNCTION (Routes Primary View by Role & Active Module)
  // ==========================================================================
  function render() {
    const state = backend.state;
    const user = state.currentUser || state.accounts[0];
    const unackAlertsCount = state.alerts.filter((a) => !a.isAcknowledged).length;

    const isOfficerOrBureau =
      user.subRole === 'Regional Officer' ||
      user.subRole === 'Scrutiny Officer' ||
      user.subRole === 'Bureau Officer / Head';
    const isInstitution = user.subRole === 'Institution (Applicant)' || user.statementRole === 'Institution';
    const isSysAdmin = user.subRole === 'System Admin';
    const isAuditor = user.subRole === 'Auditor';

    // Keep sidebar navigation clean and uncrowded based on active role
    const fullSidebarItems = [
      {
        id: 'dashboard',
        icon: '📊',
        label: isInstitution
          ? 'Institution Portal'
          : isSysAdmin
          ? 'Admin Console'
          : isAuditor
          ? 'Auditor Console'
          : isOfficerOrBureau
          ? `${user.subRole}`
          : 'Dashboard Overview',
        badge: null
      },
      { id: 'applications', icon: '📋', label: 'Workflow Engine', badge: state.applications.length },
      { id: 'evc', icon: '🏛️', label: 'EVC Rubric & Visits', badge: state.evcInspections.length },
      { id: 'sac', icon: '⚖️', label: 'SAC / SHC Bench', badge: state.sacHearings.length },
      { id: 'compliance', icon: '📑', label: 'Undertakings', badge: state.undertakings.length },
      { id: 'documents', icon: '📜', label: 'Lease & Validity', badge: state.documents.length },
      { id: 'alerts', icon: '🔔', label: 'Alerts & SLA', badge: unackAlertsCount },
      { id: 'reports', icon: '📈', label: 'Reports & Rules', badge: null },
      { id: 'profile', icon: '👤', label: 'Role Matrix', badge: null }
    ];

    const sidebarItems =
      isInstitution || isSysAdmin || isAuditor
        ? fullSidebarItems.filter((i) => ['dashboard', 'documents', 'alerts', 'profile'].includes(i.id))
        : fullSidebarItems;

    let mainViewportHtml = '';
    if (activeModule === 'dashboard') {
      if (isOfficerOrBureau) {
        mainViewportHtml = renderRegionalScrutinyAndBureauWorkspace(state, user, uiState);
      } else if (isInstitution) {
        mainViewportHtml = renderInstitutionWorkspace(state, user, uiState);
      } else if (isSysAdmin) {
        mainViewportHtml = renderSystemAdminWorkspace(state, user, uiState);
      } else if (isAuditor) {
        mainViewportHtml = renderAuditorWorkspace(state, user, uiState);
      } else {
        mainViewportHtml = renderCommitteeAndAuthorityDashboardHome(state, user);
      }
    } else if (activeModule === 'applications') {
      mainViewportHtml = renderApplicationsWorkflowTab(state, user);
    } else if (activeModule === 'evc') {
      mainViewportHtml = renderEvcSchedulingTab(state);
    } else if (activeModule === 'sac') {
      mainViewportHtml = renderSacTab(state);
    } else if (activeModule === 'compliance') {
      mainViewportHtml = renderComplianceTab(state, user);
    } else if (activeModule === 'documents') {
      mainViewportHtml = renderDocumentsTab(state, user);
    } else if (activeModule === 'alerts') {
      mainViewportHtml = renderAlertsTab(state, user);
    } else if (activeModule === 'reports') {
      mainViewportHtml = renderReportsTab(state, user);
    } else {
      mainViewportHtml = renderProfileTab(state, user);
    }

    container.innerHTML = `
      <div class="min-h-screen flex flex-col bg-[#F4F6FB] text-[#121621]">
        <!-- Government of India Top Tricolor Strip -->
        <div class="tricolor-bar"></div>

        <div class="flex flex-1 min-h-[calc(100vh-4px)]">
          <!-- Clean Institutional Sidebar (Royal Navy & Institutional Blue — Zero Clutter) -->
          <aside class="w-60 bg-white text-[#121621] shrink-0 hidden md:flex flex-col justify-between border-r border-[#E1E6EF]">
            <div>
              <!-- Brand Header -->
              <div class="p-4 border-b border-[#E1E6EF] flex items-center gap-3">
                ${AICTE_LOGO_SVG}
                <div>
                  <div class="font-serif font-bold text-base text-[#0B2545] tracking-tight">AICTE Portal</div>
                  <div class="text-[11px] text-amber-700 font-bold">SIH 2026 • PS 26262</div>
                </div>
              </div>

              <!-- Active Role Badge in Sidebar -->
              <div class="px-4 py-3 bg-[#F4F6FB] border-b border-[#E1E6EF] text-xs">
                <div class="flex items-center justify-between">
                  <span class="text-slate-500 text-[10px] font-bold uppercase">Active Role</span>
                  <span class="text-[10px] font-bold text-emerald-700">● Synced</span>
                </div>
                <div class="font-bold text-[#0B2545] mt-0.5">${user.subRole}</div>
                <div class="text-[11px] text-slate-500 truncate">${user.fullName}</div>
              </div>

              <!-- Navigation Links -->
              <nav class="p-3 space-y-1">
                ${sidebarItems
                  .map(
                    (item) => `
                  <button
                    data-nav-tab="${item.id}"
                    class="w-full px-3.5 py-2.5 rounded-xl text-xs font-bold flex items-center justify-between transition cursor-pointer ${
                      activeModule === item.id
                        ? 'bg-[#0B2545] text-white shadow-xs'
                        : 'text-slate-700 hover:bg-[#F4F6FB]'
                    }"
                  >
                    <div class="flex items-center gap-2.5">
                      <span>${item.icon}</span>
                      <span>${item.label}</span>
                    </div>
                    ${
                      item.badge !== null
                        ? `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            activeModule === item.id ? 'bg-amber-400 text-[#0B2545]' : 'bg-slate-100 text-slate-700'
                          }">${item.badge}</span>`
                        : ''
                    }
                  </button>
                `
                  )
                  .join('')}
              </nav>
            </div>

            <!-- Sidebar Bottom Persistent DB Status Card -->
            <div class="p-3.5 m-3 rounded-xl bg-[#F4F6FB] border border-[#E1E6EF] text-xs space-y-1">
              <div class="font-bold text-[#0B2545] flex items-center gap-1.5">
                <span class="w-2 h-2 rounded-full bg-emerald-600"></span>
                <span>${backend.modeBadgeText}</span>
              </div>
              <div class="text-[11px] text-slate-500 leading-snug truncate">
                ${user.email}
              </div>
            </div>
          </aside>

          <!-- Right Main Content Column -->
          <div class="flex-1 flex flex-col min-w-0">
            <!-- Clean Top White Header Bar -->
            <header class="bg-white border-b border-[#E1E6EF] sticky top-0 z-20 px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3 shadow-2xs">
              <div class="flex items-center gap-2.5">
                <span class="font-serif font-bold text-[#0B2545] text-base sm:text-lg">
                  ${sidebarItems.find((i) => i.id === activeModule)?.label || 'Workspace'}
                </span>
                <span class="hidden sm:inline-block px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-50 text-[#2456D6] border border-blue-200">
                  ${user.statementRole}
                </span>
              </div>

              <!-- Right Official Profile, Mode Badge & Role Switcher -->
              <div class="flex flex-wrap items-center gap-2">
                <button
                  id="mode-badge"
                  title="Configure Supabase or Local Demo Mode"
                  class="px-3 py-1.5 rounded-full text-xs font-bold border cursor-pointer ${
                    backend.isLiveSupabase
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                      : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
                  }"
                >
                  ${backend.modeBadgeText}
                </button>

                <div class="flex items-center gap-1.5 bg-[#F4F6FB] px-3 py-1.5 rounded-xl border border-slate-300 text-xs" title="Direct account switching is disabled for security. Log out to sign in with another account.">
                  <span class="text-emerald-700 font-bold">🔒</span>
                  <span class="text-[#0B2545] font-bold">${user.subRole}</span>
                  <span class="text-slate-400 hidden sm:inline">• Account Locked</span>
                </div>

                <button
                  id="header-logout-btn"
                  class="px-3.5 py-1.5 rounded-xl bg-[#0B2545] hover:bg-[#133560] text-white text-xs font-bold cursor-pointer"
                >
                  Log out
                </button>
              </div>

              <!-- Mobile Navigation Strip -->
              <div class="w-full flex md:hidden gap-1.5 overflow-x-auto pt-2 border-t border-slate-100">
                ${sidebarItems
                  .map(
                    (item) => `
                  <button
                    data-nav-tab="${item.id}"
                    class="px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap ${
                      activeModule === item.id ? 'bg-[#0B2545] text-white' : 'bg-slate-100 text-slate-700'
                    }"
                  >
                    ${item.icon} ${item.label}
                  </button>
                `
                  )
                  .join('')}
              </div>
            </header>

            ${
              toastMessage
                ? `
              <div class="px-6 pt-4">
                <div class="p-3.5 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-900 text-xs font-semibold flex items-center justify-between shadow-2xs">
                  <span>✔ [${toastMessage.time}] ${toastMessage.text}</span>
                  <span class="text-[11px] uppercase font-bold text-emerald-700">${backend.modeBadgeText}</span>
                </div>
              </div>
            `
                : ''
            }

            <!-- Main Module Viewport -->
            <main class="p-4 sm:p-6 flex-1 max-w-[1400px] w-full mx-auto">
              ${mainViewportHtml}
            </main>

            <!-- Footer -->
            <footer class="bg-white border-t border-[#E1E6EF] py-3 px-6 text-xs text-slate-500 flex flex-wrap items-center justify-between gap-2">
              <span><strong>All India Council for Technical Education (AICTE)</strong> • Unified 6-Dashboard Portal (SIH 2026 PS 26262)</span>
              <span>Mode: <strong>${backend.modeBadgeText}</strong> • Synced: ${backend.lastSyncTime}</span>
            </footer>
          </div>
        </div>
      </div>
    `;

    // ========================================================================
    // EVENT BINDINGS ACROSS ALL 6 DASHBOARDS (WITH AUTOMATIC DB PERSISTENCE)
    // ========================================================================
    const modeBadgeBtn = container.querySelector('#mode-badge');
    if (modeBadgeBtn) modeBadgeBtn.addEventListener('click', () => openSupabaseConfigModal());

    const logoutBtn = container.querySelector('#header-logout-btn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => {
        persistCurrentProgress();
        backend.logout();
      });
    }

    container.querySelectorAll('[data-nav-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        activeModule = btn.getAttribute('data-nav-tab');
        persistCurrentProgress();
        render();
      });
    });

    container.querySelectorAll('[data-goto-module]').forEach((btn) => {
      btn.addEventListener('click', () => {
        activeModule = btn.getAttribute('data-goto-module');
        persistCurrentProgress();
        render();
      });
    });

    // Dossier Modal
    container.querySelectorAll('[data-open-case]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const appId = btn.getAttribute('data-open-case');
        const app = state.applications.find((a) => a.id === appId || a.appNumber === appId);
        if (app) openElectronicCaseModal(app);
      });
    });

    // ========================================================================
    // DASHBOARD 1 & 2 BINDINGS (Regional, Scrutiny & Bureau Officers)
    // ========================================================================
    container.querySelectorAll('[data-officer-subtab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        uiState.officerSubTab = btn.getAttribute('data-officer-subtab');
        persistCurrentProgress();
        render();
      });
    });

    const offSearch = container.querySelector('#officer-search-input');
    if (offSearch) {
      offSearch.addEventListener('input', (e) => {
        uiState.officerSearch = e.target.value;
        persistCurrentProgress();
        render();
      });
    }
    const offStatus = container.querySelector('#officer-status-filter');
    if (offStatus) {
      offStatus.addEventListener('change', (e) => {
        uiState.officerStatusFilter = e.target.value;
        persistCurrentProgress();
        render();
      });
    }
    const offPriority = container.querySelector('#officer-priority-filter');
    if (offPriority) {
      offPriority.addEventListener('change', (e) => {
        uiState.officerPriorityFilter = e.target.value;
        persistCurrentProgress();
        render();
      });
    }
    const offRefresh = container.querySelector('#btn-officer-refresh');
    if (offRefresh) {
      offRefresh.addEventListener('click', () => {
        backend.hydrateFromBackendDb();
        showToast('Refreshed cases from persistent backend database.');
      });
    }

    container.querySelectorAll('[data-open-scrutiny]').forEach((btn) => {
      btn.addEventListener('click', () => {
        uiState.selectedScrutinyAppId = btn.getAttribute('data-open-scrutiny');
        uiState.officerSubTab = 'queue';
        persistCurrentProgress();
        render();
      });
    });

    container.querySelectorAll('[data-open-oversight]').forEach((btn) => {
      btn.addEventListener('click', () => {
        uiState.selectedOversightAppId = btn.getAttribute('data-open-oversight');
        uiState.officerSubTab = 'queue';
        persistCurrentProgress();
        render();
      });
    });

    const scrutinyForm = container.querySelector('#officer-scrutiny-form');
    if (scrutinyForm) {
      scrutinyForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const applicationId = container.querySelector('#scrutiny-app-id')?.value;
        const observations = container.querySelector('#scrutiny-observations-input')?.value.trim();
        const outcome = container.querySelector('#scrutiny-outcome-select')?.value;
        if (!observations || !outcome) {
          alert('Please enter observations and select an outcome.');
          return;
        }
        backend.saveScrutinyRecord({ applicationId, observations, outcome });
        showToast(`Scrutiny record (${outcome}) saved to database and routed.`);
      });
    }

    const bureauDirBtn = container.querySelector('#btn-issue-bureau-directive');
    if (bureauDirBtn) {
      bureauDirBtn.addEventListener('click', () => {
        const appId = bureauDirBtn.getAttribute('data-app-id');
        const note = container.querySelector('#oversight-directive-input')?.value.trim();
        backend.triggerBureauEscalationFollowUp(appId, note);
        showToast('Priority Overdue Follow-Up Directive dispatched and saved in DB.');
      });
    }

    const oversightFwdBtn = container.querySelector('#btn-oversight-forward-ca');
    if (oversightFwdBtn) {
      oversightFwdBtn.addEventListener('click', () => {
        const appId = oversightFwdBtn.getAttribute('data-app-id');
        const note = container.querySelector('#oversight-directive-input')?.value.trim();
        backend.advanceApplicationStage(appId, {
          actionDecision: 'FORWARD_TO_CA',
          remarks: note || `Forwarded by ${user.fullName} (${user.subRole}) after oversight verification.`,
          authMethodUsed: user.loginMethod
        });
        showToast('Application forwarded to next APH stage and saved in database.');
      });
    }

    // ========================================================================
    // DASHBOARD 5 BINDINGS (Institution Portal + Evidence Upload)
    // ========================================================================
    container.querySelectorAll('[data-inst-subtab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        uiState.instSubTab = btn.getAttribute('data-inst-subtab');
        persistCurrentProgress();
        render();
      });
    });

    container.querySelectorAll('[data-inst-resub]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const appId = btn.getAttribute('data-inst-resub');
        backend.resubmitInstitutionApplication(appId);
        showToast('Deficiencies rectified & application resubmitted to Scrutiny queue.');
      });
    });

    container.querySelectorAll('[data-inst-tl]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const appId = btn.getAttribute('data-inst-tl');
        uiState.expandedTimelines[appId] = !uiState.expandedTimelines[appId];
        persistCurrentProgress();
        render();
      });
    });

    const instSubmitNewBtn = container.querySelector('#btn-inst-submit-new');
    if (instSubmitNewBtn) {
      instSubmitNewBtn.addEventListener('click', async () => {
        const name = container.querySelector('#inst-new-name')?.value.trim();
        const course = container.querySelector('#inst-new-course')?.value;
        const st = container.querySelector('#inst-new-state')?.value.trim();
        const email = container.querySelector('#inst-new-email')?.value.trim();
        const errEl = container.querySelector('#inst-new-err');
        const checkboxes = [...container.querySelectorAll('.inst-doc-checkbox')];

        if (!name || !st) {
          if (errEl) errEl.textContent = 'Institution name and state are required.';
          return;
        }
        if (!/^\S+@\S+\.\S+$/.test(email || '')) {
          if (errEl) errEl.textContent = 'Enter a valid official contact email.';
          return;
        }
        if (checkboxes.some((c) => !c.checked)) {
          if (errEl) errEl.textContent = 'Please tick every required statutory document before submitting.';
          return;
        }

        const docsChecked = checkboxes.filter((c) => c.checked).map((c) => c.value);
        const created = backend.submitInstitutionApplication({
          name,
          course,
          state: st,
          email,
          docsChecked
        });

        // Also process any attached evidence files (`changed_files` feature)
        const fileInputs = [...container.querySelectorAll('[data-doc-file]')];
        for (const inp of fileInputs) {
          const idx = inp.getAttribute('data-doc-file');
          const fileObj = inp.files && inp.files[0];
          const expInput = container.querySelector(`[data-doc-expiry="${idx}"]`);
          const expiryDate = expInput ? expInput.value : '';
          const docType = checkboxes[Number(idx)]?.value || 'Statutory Document';
          if (fileObj) {
            await backend.uploadApplicationEvidence(created.id, {
              documentType: docType,
              fileName: fileObj.name,
              expiryDate,
              fileObj
            });
          }
        }

        uiState.instSubTab = 'apps';
        showToast(`Submitted new application ${created.appNumber} to database!`);
      });
    }

    const instAppsFilter = container.querySelector('#inst-apps-filter');
    if (instAppsFilter) {
      instAppsFilter.addEventListener('change', (e) => {
        uiState.instAppsFilter = e.target.value;
        persistCurrentProgress();
        render();
      });
    }

    // ========================================================================
    // DASHBOARD 6A BINDINGS (System Admin + User Role Management)
    // ========================================================================
    container.querySelectorAll('[data-adm-subtab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        uiState.admSubTab = btn.getAttribute('data-adm-subtab');
        persistCurrentProgress();
        render();
      });
    });

    container.querySelectorAll('[data-save-role]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const uid = btn.getAttribute('data-save-role');
        const sel = container.querySelector(`[data-role-user="${uid}"]`);
        if (sel) {
          await backend.updateAccountRole(uid, sel.value);
          showToast(`Updated account role to "${sel.value}".`);
        }
      });
    });

    container.querySelectorAll('[data-toggle-user]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const uid = btn.getAttribute('data-toggle-user');
        await backend.toggleAccountActive(uid);
        showToast('Updated account active status.');
      });
    });

    container.querySelectorAll('[data-approve-user]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const uid = btn.getAttribute('data-approve-user');
        await backend.toggleAccountActive(uid, { approve: true });
        showToast('Approved AICTE Member registration and activated account.');
      });
    });

    container.querySelectorAll('[data-reject-user]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const uid = btn.getAttribute('data-reject-user');
        await backend.toggleAccountActive(uid, { reject: true });
        showToast('Rejected registration and deactivated account.');
      });
    });

    const admSaveSlaBtn = container.querySelector('#btn-adm-save-sla');
    if (admSaveSlaBtn) {
      admSaveSlaBtn.addEventListener('click', () => {
        const slaObj = {};
        container.querySelectorAll('[data-adm-sla]').forEach((inp) => {
          slaObj[inp.getAttribute('data-adm-sla')] = Math.max(1, Number(inp.value) || 3);
        });
        backend.saveAdminTimelines(slaObj);
        showToast('Stage SLA timelines updated and persisted to database.');
      });
    }

    container.querySelectorAll('[data-adm-rm-doc]').forEach((btn) => {
      btn.addEventListener('click', () => {
        backend.removeAdminRequiredDoc(Number(btn.getAttribute('data-adm-rm-doc')));
        showToast('Removed required document from checklist.');
      });
    });

    const admAddDocBtn = container.querySelector('#btn-adm-add-doc');
    if (admAddDocBtn) {
      admAddDocBtn.addEventListener('click', () => {
        const val = container.querySelector('#adm-in-doc')?.value.trim();
        if (val) {
          backend.addAdminRequiredDoc(val);
          showToast(`Added "${val}" to required documents.`);
        }
      });
    }

    container.querySelectorAll('[data-adm-rm-course]').forEach((btn) => {
      btn.addEventListener('click', () => {
        backend.removeAdminCourse(Number(btn.getAttribute('data-adm-rm-course')));
        showToast('Removed course from offered list.');
      });
    });

    const admAddCourseBtn = container.querySelector('#btn-adm-add-course');
    if (admAddCourseBtn) {
      admAddCourseBtn.addEventListener('click', () => {
        const val = container.querySelector('#adm-in-course')?.value.trim();
        if (val) {
          backend.addAdminCourse(val);
          showToast(`Added "${val}" to courses offered.`);
        }
      });
    }

    const admResetBtn = container.querySelector('#btn-adm-reset-demo');
    if (admResetBtn) {
      admResetBtn.addEventListener('click', () => {
        backend.resetDemoData();
        showToast('Database reset to baseline seed.');
      });
    }

    const admAllFilter = container.querySelector('#adm-all-filter');
    if (admAllFilter) {
      admAllFilter.addEventListener('change', (e) => {
        uiState.admStageFilter = e.target.value;
        persistCurrentProgress();
        render();
      });
    }

    // ========================================================================
    // DASHBOARD 6B BINDINGS (Auditor)
    // ========================================================================
    container.querySelectorAll('[data-aud-subtab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        uiState.audSubTab = btn.getAttribute('data-aud-subtab');
        persistCurrentProgress();
        render();
      });
    });

    const audSearchQ = container.querySelector('#aud-search-q');
    if (audSearchQ) {
      audSearchQ.addEventListener('input', (e) => {
        uiState.audSearch = e.target.value;
        persistCurrentProgress();
        render();
      });
    }

    const audActorSel = container.querySelector('#aud-actor-select');
    if (audActorSel) {
      audActorSel.addEventListener('change', (e) => {
        uiState.audActor = e.target.value;
        persistCurrentProgress();
        render();
      });
    }

    const audCsvBtn = container.querySelector('#btn-aud-export-csv');
    if (audCsvBtn) {
      audCsvBtn.addEventListener('click', () => {
        const logs = state.auditTrail || [];
        const csv =
          'time,app,actor,role,action,remarks\n' +
          logs
            .map((l) =>
              [l.timestamp, l.appNumber, l.actorName, l.subRole, l.actionType, l.remarks]
                .map((v) => '"' + String(v || '').replace(/"/g, '""') + '"')
                .join(',')
            )
            .join('\n');
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
        a.download = 'audit-trail.csv';
        a.click();
        showToast('Exported certified audit-trail.csv.');
      });
    }

    const audTraceSel = container.querySelector('#aud-trace-select');
    if (audTraceSel) {
      audTraceSel.addEventListener('change', (e) => {
        uiState.audTraceAppId = e.target.value;
        persistCurrentProgress();
        render();
      });
    }

    // ========================================================================
    // DASHBOARD 3 & 4 BINDINGS (Committee & Competent Authority)
    // ========================================================================
    const bioRecheckBtn = container.querySelector('#btn-overview-biometric-recheck');
    if (bioRecheckBtn) {
      bioRecheckBtn.addEventListener('click', () => {
        openBiometricStepUpModal({
          actionTitle: 'Restricted Statutory Session Re-Verification',
          appNumber: 'SESSION-CHECK',
          onVerified: (method) => {
            backend.appendAudit({
              actorName: user.fullName,
              statementRole: user.statementRole,
              subRole: user.subRole,
              actionType: 'BIOMETRIC_STEP_UP_VERIFIED',
              appNumber: 'GLOBAL-SESSION',
              stageFrom: 'Active Session',
              stageTo: 'Biometric Verified',
              authMethod: method,
              remarks: 'Completed fresh face check for restricted statutory actions.'
            });
            backend.saveState();
            showToast('Biometric Face Verification confirmed and logged.');
          }
        });
      });
    }

    const csvBtn = container.querySelector('#btn-overview-export-csv');
    if (csvBtn) csvBtn.addEventListener('click', exportCsvReport);

    const repDlBtn = container.querySelector('#btn-reports-download');
    if (repDlBtn) repDlBtn.addEventListener('click', exportCsvReport);

    container.querySelectorAll('[data-quick-process]').forEach((btn) => {
      btn.addEventListener('click', () => {
        selectedAppIdForAction = btn.getAttribute('data-quick-process');
        activeModule = 'applications';
        persistCurrentProgress();
        render();
      });
    });

    // Workflow Bindings
    const wfSearch = container.querySelector('#wf-search-input');
    if (wfSearch) {
      wfSearch.addEventListener('input', (e) => {
        searchQuery = e.target.value;
        persistCurrentProgress();
        render();
      });
    }
    const wfRegion = container.querySelector('#wf-region-select');
    if (wfRegion) {
      wfRegion.addEventListener('change', (e) => {
        regionFilter = e.target.value;
        persistCurrentProgress();
        render();
      });
    }
    const wfTrack = container.querySelector('#wf-track-select');
    if (wfTrack) {
      wfTrack.addEventListener('change', (e) => {
        trackFilter = e.target.value;
        persistCurrentProgress();
        render();
      });
    }
    const wfSla = container.querySelector('#wf-sla-select');
    if (wfSla) {
      wfSla.addEventListener('change', (e) => {
        slaFilter = e.target.value;
        persistCurrentProgress();
        render();
      });
    }

    container.querySelectorAll('[data-select-wf-app]').forEach((card) => {
      card.addEventListener('click', () => {
        selectedAppIdForAction = card.getAttribute('data-select-wf-app');
        persistCurrentProgress();
        render();
      });
    });

    container.querySelectorAll('[data-wf-execute]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const decision = btn.getAttribute('data-wf-execute');
        const appId = btn.getAttribute('data-wf-app');
        const remarksEl = container.querySelector('#wf-action-remarks');
        const remarks = remarksEl ? remarksEl.value.trim() : '';

        if (decision === 'REVERT_DEFICIENCY' && !remarks) {
          alert('Please record the specific deficiency reason before returning an application.');
          return;
        }

        const app = state.applications.find((a) => a.id === appId);
        openBiometricStepUpModal({
          actionTitle: `Workflow Decision: ${decision}`,
          appNumber: app?.appNumber,
          onVerified: (authMethodUsed) => {
            backend.advanceApplicationStage(appId, {
              actionDecision: decision,
              remarks: remarks || `Authorised ${decision} by ${user.subRole}`,
              authMethodUsed,
              conditionText: remarks
            });
            showToast(`Application ${app?.appNumber} updated (${decision}) and saved in DB.`);
          }
        });
      });
    });

    // EVC Bindings
    container.querySelectorAll('[data-evc-subtab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        evcSubTab = btn.getAttribute('data-evc-subtab');
        persistCurrentProgress();
        render();
      });
    });

    container.querySelectorAll('[data-select-evc]').forEach((btn) => {
      btn.addEventListener('click', () => {
        selectedEvcIdForScoring = btn.getAttribute('data-select-evc');
        persistCurrentProgress();
        render();
      });
    });

    ['infra', 'lab', 'fac', 'lib'].forEach((key) => {
      const inp = container.querySelector(`#inp-${key}`);
      const lbl = container.querySelector(`#lbl-${key}`);
      if (inp && lbl) {
        inp.addEventListener('input', (e) => {
          lbl.textContent = `${e.target.value}%`;
        });
      }
    });

    const handleEvcSubmit = (routeAction) => {
      const btn = container.querySelector(routeAction === 'ROUTE_TO_SAC' ? '#btn-evc-submit-sac' : '#btn-evc-submit-ca');
      if (!btn) return;
      const evcId = btn.getAttribute('data-evc-id');
      const infraScore = container.querySelector('#inp-infra')?.value || 85;
      const labScore = container.querySelector('#inp-lab')?.value || 85;
      const facultyScore = container.querySelector('#inp-fac')?.value || 85;
      const libraryScore = container.querySelector('#inp-lib')?.value || 85;
      const fieldObservations = container.querySelector('#evc-obs-input')?.value || '';

      openBiometricStepUpModal({
        actionTitle: routeAction === 'ROUTE_TO_SAC' ? 'Flag EVC Deficiency & Route to SAC' : 'Submit EVC Report to Competent Authority',
        appNumber: evcId,
        onVerified: (authMethodUsed) => {
          backend.submitEvcInspectionReport(evcId, {
            infraScore,
            labScore,
            facultyScore,
            libraryScore,
            fieldObservations,
            recommendation:
              routeAction === 'ROUTE_TO_SAC'
                ? 'Deficiencies Flagged — Referred to SAC/SHC Hearing'
                : 'Recommended for Approval by EVC Panel',
            routeAction,
            authMethodUsed
          });
          showToast('EVC Inspection Report submitted and saved to database.');
        }
      });
    };

    const evcCaBtn = container.querySelector('#btn-evc-submit-ca');
    if (evcCaBtn) evcCaBtn.addEventListener('click', () => handleEvcSubmit('FORWARD_TO_CA'));

    const evcSacBtn = container.querySelector('#btn-evc-submit-sac');
    if (evcSacBtn) evcSacBtn.addEventListener('click', () => handleEvcSubmit('ROUTE_TO_SAC'));

    const schedForm = container.querySelector('#form-schedule-evc');
    if (schedForm) {
      schedForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const appNumber = container.querySelector('#evc-sched-app').value;
        const scheduledDate = container.querySelector('#evc-sched-date').value;
        backend.scheduleNewEvcVisit({
          appNumber,
          scheduledDate,
          inspectionMode: 'Physical Field Inspection',
          evcChairperson: user.fullName
        });
        showToast(`Scheduled EVC Inspection for ${appNumber} on ${scheduledDate}.`);
      });
    }

    // SAC Bindings
    container.querySelectorAll('[data-sac-submit]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const sacId = btn.getAttribute('data-sac-submit');
        const obs = container.querySelector(`#sac-obs-${sacId}`)?.value || '';
        const rec = container.querySelector(`#sac-rec-${sacId}`)?.value || 'Recommend Conditional Approval';
        openBiometricStepUpModal({
          actionTitle: `SAC/SHC Bench Recommendation: ${rec}`,
          appNumber: sacId,
          onVerified: (authMethodUsed) => {
            backend.recordSacBenchVerdict(sacId, {
              benchObservations: obs,
              benchRecommendation: rec,
              authMethodUsed
            });
            showToast(`SAC/SHC Bench verdict recorded (${rec}) and forwarded to Authority.`);
          }
        });
      });
    });

    // Compliance & Undertaking Bindings
    container.querySelectorAll('[data-comp-subtab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        complianceSubTab = btn.getAttribute('data-comp-subtab');
        persistCurrentProgress();
        render();
      });
    });

    container.querySelectorAll('[data-und-action]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const decision = btn.getAttribute('data-und-action');
        const undId = btn.getAttribute('data-und-id');
        backend.verifyUndertakingCompliance(undId, {
          decision,
          remarks: `Processed (${decision}) by ${user.fullName} (${user.subRole}).`,
          authMethodUsed: user.loginMethod
        });
        showToast(`Undertaking action "${decision}" persisted in database.`);
      });
    });

    // Document Validity Bindings
    container.querySelectorAll('[data-doc-subtab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        docSubTab = btn.getAttribute('data-doc-subtab');
        persistCurrentProgress();
        render();
      });
    });

    container.querySelectorAll('[data-doc-action]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const actionType = btn.getAttribute('data-doc-action');
        const docId = btn.getAttribute('data-doc-id');
        backend.processDocumentValidityAction(docId, {
          actionType,
          newExpiryDate: '2036-10-22',
          remarks: `Action ${actionType} completed by ${user.fullName} (${user.subRole}).`,
          authMethodUsed: user.loginMethod
        });
        showToast(`Document validity action "${actionType}" persisted in database.`);
      });
    });

    // Alerts Bindings
    const markAllBtn = container.querySelector('#btn-mark-all-alerts');
    if (markAllBtn) {
      markAllBtn.addEventListener('click', () => {
        state.alerts.forEach((a) => {
          a.isAcknowledged = true;
        });
        backend.saveState();
        showToast('All notifications marked as acknowledged in database.');
      });
    }

    container.querySelectorAll('[data-ack-alert]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const alertId = btn.getAttribute('data-ack-alert');
        backend.acknowledgeAlert(alertId);
        showToast('Alert acknowledged and saved in database.');
      });
    });

    // APH Rules Bindings
    container.querySelectorAll('[data-save-rule]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const ruleId = btn.getAttribute('data-save-rule');
        const sla = container.querySelector(`#rule-sla-${ruleId}`)?.value || 15;
        const warn = container.querySelector(`#rule-warn-${ruleId}`)?.value || 10;
        backend.updateAphRule(ruleId, {
          prescribedSlaDays: sla,
          warningThresholdDays: warn,
          isActive: true
        });
        showToast(`Updated APH 2026 SLA rule (${sla} days SLA / ${warn} days warning).`);
      });
    });
  }

  render();
  return () => {};
}

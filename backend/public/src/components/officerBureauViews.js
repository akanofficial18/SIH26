// ============================================================================
// SIH 2026 PS 26262 - Dashboards 1 & 2:
// 1. Regional Officer + Scrutiny Officer Workspace
// 2. Bureau Officer / Regulation Bureau Head Workspace
// Clean, Uncrowded Tabbed Layout • Royal Navy (#0B2545), Blue (#2456D6) & Saffron (#D97706)
// ============================================================================

import { renderAestheticProgressCharts } from './smoothCharts.js';

export function renderRegionalScrutinyAndBureauWorkspace(state, user, uiState) {
  const isBureau = user.subRole === 'Bureau Officer / Head' || user.statementRole === 'Bureau Officer';
  const isScrutiny = user.subRole === 'Scrutiny Officer';
  const subTab = uiState.officerSubTab || 'overview'; // 'overview' | 'queue'

  const search = (uiState.officerSearch || '').toLowerCase().trim();
  const statusFilter = uiState.officerStatusFilter || 'all';
  const priorityFilter = uiState.officerPriorityFilter || 'all';
  const regionFilter = uiState.officerRegionFilter || 'ALL';

  const allApps = state.applications || [];
  const filteredApps = allApps.filter((item) => {
    const text = `${item.appNumber || ''} ${item.institutionName || ''} ${item.program || ''} ${item.state || ''}`.toLowerCase();
    const matchesSearch = !search || text.includes(search);
    const normStatus =
      item.stageNumeric === -1 || item.status === 'Returned'
        ? 'Returned'
        : item.stageNumeric === 6 || (item.currentStage || '').includes('Approved')
        ? 'Completed'
        : item.stageNumeric === 1
        ? 'Pending'
        : 'Under Review';
    const matchesStatus = statusFilter === 'all' || normStatus === statusFilter || item.status === statusFilter;
    const matchesPriority = priorityFilter === 'all' || (item.priority || 'Medium') === priorityFilter;
    const matchesRegion = regionFilter === 'ALL' || item.region === regionFilter;
    return matchesSearch && matchesStatus && matchesPriority && matchesRegion;
  });

  const highPriorityCount = allApps.filter((a) => (a.priority || 'Medium') === 'High').length;
  const overdueCount = allApps.filter(
    (a) => (a.slaStatus || '').includes('Overdue') || a.daysInStage > (a.slaLimitDays || 10)
  ).length;
  const scrutinySavedCount = (state.scrutinyRecords || []).length;

  const selectedScrutinyApp = uiState.selectedScrutinyAppId
    ? allApps.find((a) => a.id === uiState.selectedScrutinyAppId)
    : isScrutiny
    ? allApps[0]
    : null;

  const selectedOversightApp = uiState.selectedOversightAppId
    ? allApps.find((a) => a.id === uiState.selectedOversightAppId)
    : !isScrutiny
    ? allApps[0]
    : null;

  const latestEvcReview = selectedOversightApp
    ? (state.committeeReviews || []).find(
        (r) => r.applicationId === selectedOversightApp.id || r.appNumber === selectedOversightApp.appNumber
      )
    : null;

  const latestScrutinyRec = selectedScrutinyApp
    ? (state.scrutinyRecords || []).find(
        (r) => r.applicationId === selectedScrutinyApp.id || r.appNumber === selectedScrutinyApp.appNumber
      )
    : null;

  const welcomeTitle = isBureau
    ? 'Bureau Officer / Regulation Bureau Head'
    : isScrutiny
    ? 'Scrutiny Officer Workspace'
    : 'Regional Officer Workspace';

  const welcomeSubtitle = isBureau
    ? 'Monitor applications across all 8 regions, track high-priority & overdue cases, and issue follow-up directives.'
    : isScrutiny
    ? `Verify prescribed documents in ${user.region} Region and record scrutiny observations & outcomes.`
    : `Coordinate ${user.region} Region applications, inspect scrutiny & EVC dossiers, and route files.`;

  const casesHeading = isBureau
    ? 'Application Oversight (All Regions)'
    : isScrutiny
    ? 'Applications for Scrutiny & Document Verification'
    : 'Regional Applications & Queue Oversight';

  return `
    <div class="space-y-6">
      <!-- Clean Rishi Heritage & Role Welcome Header (Preserved from sih project me.zip) -->
      <div class="rounded-2xl bg-white border border-[#E1E6EF] shadow-xs overflow-hidden">
        <div class="grid grid-cols-1 lg:grid-cols-12 items-center">
          <div class="lg:col-span-8 p-5 sm:p-6 space-y-2">
            <div class="flex items-center gap-2 flex-wrap">
              <span class="px-2.5 py-0.5 rounded-full text-xs font-bold uppercase bg-[#EAF0FF] text-[#2456D6] border border-blue-200">
                ${user.statementRole} • ${user.subRole}
              </span>
              <span class="text-xs text-[#66738A] font-medium">Region: <strong class="text-[#0B2545]">${user.region}</strong></span>
            </div>
            <h2 class="text-xl font-serif font-bold text-[#0B2545]">${welcomeTitle} — ${user.fullName}</h2>
            <p class="text-xs text-[#66738A] leading-relaxed max-w-2xl">${welcomeSubtitle}</p>

            <!-- Focused Sub-Tabs to keep the workspace clean and uncrowded -->
            <div class="flex flex-wrap gap-2 pt-2">
              <button
                type="button"
                data-officer-subtab="overview"
                class="px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                  subTab === 'overview'
                    ? 'bg-[#2456D6] text-white shadow-2xs'
                    : 'bg-[#F4F6FB] text-[#44516A] border border-[#E1E6EF] hover:bg-blue-50'
                }"
              >
                📊 Overview &amp; Analytics
              </button>
              <button
                type="button"
                data-officer-subtab="queue"
                class="px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                  subTab === 'queue'
                    ? 'bg-[#2456D6] text-white shadow-2xs'
                    : 'bg-[#F4F6FB] text-[#44516A] border border-[#E1E6EF] hover:bg-blue-50'
                }"
              >
                🔍 ${isScrutiny ? 'Scrutiny Queue & Form' : 'Oversight Queue & Directives'} (${allApps.length})
              </button>
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
        subTab === 'overview'
          ? `
        <!-- 4 Clean Stat Cards -->
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <article class="bg-white rounded-2xl border border-[#E1E6EF] p-5 shadow-xs">
            <span class="text-xs font-semibold text-[#66738A] block">Visible Cases</span>
            <strong class="text-2xl font-extrabold text-[#0B2545] mt-1 block">${filteredApps.length}</strong>
            <span class="text-[11px] text-[#66738A] mt-0.5 block">Active dossiers</span>
          </article>

          <article class="bg-white rounded-2xl border border-[#E1E6EF] p-5 shadow-xs">
            <span class="text-xs font-semibold text-[#66738A] block">High Priority</span>
            <strong class="text-2xl font-extrabold text-[#2456D6] mt-1 block">${highPriorityCount}</strong>
            <span class="text-[11px] text-[#2456D6] font-medium mt-0.5 block">Priority processing</span>
          </article>

          <article class="bg-white rounded-2xl border border-[#E1E6EF] p-5 shadow-xs">
            <span class="text-xs font-semibold text-[#66738A] block">Overdue Cases</span>
            <strong class="text-2xl font-extrabold text-[#B42318] mt-1 block">${overdueCount}</strong>
            <span class="text-[11px] text-[#B42318] font-medium mt-0.5 block">Past SLA deadline</span>
          </article>

          <article class="bg-white rounded-2xl border border-[#E1E6EF] p-5 shadow-xs">
            <span class="text-xs font-semibold text-[#66738A] block">Verified Dossiers</span>
            <strong class="text-2xl font-extrabold text-[#15803D] mt-1 block">${scrutinySavedCount + (state.committeeReviews || []).length}</strong>
            <span class="text-[11px] text-[#15803D] font-medium mt-0.5 block">Saved in database</span>
          </article>
        </div>

        <!-- Smooth Progress Charts (Royal Navy, Blue & Saffron Theme — No Pink) -->
        ${renderAestheticProgressCharts(state, user, {
          trackerTitle: isBureau
            ? 'National Bureau Stage Velocity & Regional SLA Tracker'
            : isScrutiny
            ? 'Document Scrutiny & Deficiency Resolution Velocity'
            : 'Regional Directorate Application Movement Tracker'
        })}

        <!-- Compact Priority Queue Preview -->
        <section class="bg-white rounded-2xl border border-[#E1E6EF] p-5 shadow-xs space-y-4">
          <div class="flex items-center justify-between gap-2 flex-wrap">
            <div>
              <h3 class="text-base font-bold text-[#0B2545]">Priority Applications Requiring Attention</h3>
              <p class="text-xs text-[#66738A]">Select any application to open the ${isScrutiny ? 'Scrutiny Verification Form' : 'Oversight & Follow-Up Console'}.</p>
            </div>
            <button
              type="button"
              data-officer-subtab="queue"
              class="px-3.5 py-2 rounded-xl bg-[#2456D6] hover:bg-[#1d46b5] text-white text-xs font-bold cursor-pointer"
            >
              Open Full Queue (${allApps.length}) →
            </button>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            ${allApps
              .slice(0, 4)
              .map(
                (item) => `
              <div class="p-4 rounded-xl bg-[#F8FAFC] border border-[#E1E6EF] flex items-center justify-between gap-3">
                <div class="space-y-1">
                  <div class="font-bold text-xs text-[#0B2545]">${item.appNumber} · ${item.institutionName}</div>
                  <div class="text-xs text-[#66738A]">${item.program || item.course} · ${item.region} (${item.state})</div>
                  <span class="inline-block px-2 py-0.5 rounded-full text-[11px] font-bold bg-[#EAF0FF] text-[#2456D6]">
                    ${item.currentStage}
                  </span>
                </div>
                <button
                  type="button"
                  ${isScrutiny ? `data-open-scrutiny="${item.id}"` : `data-open-oversight="${item.id}"`}
                  class="px-3 py-2 rounded-xl bg-[#0B2545] hover:bg-[#13315C] text-white text-xs font-bold shrink-0 cursor-pointer"
                >
                  ${isScrutiny ? 'Scrutinize' : 'Oversight'} →
                </button>
              </div>
            `
              )
              .join('')}
          </div>
        </section>
      `
          : `
        <!-- QUEUE & WORKBENCH TAB -->
        <div class="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <!-- LEFT PANEL (7 cols): Applications List & Filters -->
          <section class="lg:col-span-7 bg-white rounded-2xl border border-[#E1E6EF] p-5 shadow-xs space-y-4">
            <div class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
              <div>
                <h3 class="text-base font-serif font-bold text-[#0B2545]">${casesHeading}</h3>
                <p class="text-xs text-[#66738A]">
                  ${
                    isScrutiny
                      ? 'Click "Open Scrutiny" on any application to record scrutiny observations & outcome.'
                      : 'Click "Oversight View" to inspect EVC review & issue follow-up directives.'
                  }
                </p>
              </div>
              <button
                id="btn-officer-refresh"
                class="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold cursor-pointer"
              >
                ↻ Refresh
              </button>
            </div>

            <!-- Search & Filters Bar -->
            <div class="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
              <input
                id="officer-search-input"
                type="search"
                value="${uiState.officerSearch || ''}"
                placeholder="Search application or institution..."
                class="sm:col-span-2 px-3 py-2 rounded-xl bg-[#F8FAFC] border border-[#CFD7E4] text-xs text-[#172238] focus:outline-none focus:border-[#2456D6]"
              />
              <select
                id="officer-status-filter"
                class="px-3 py-2 rounded-xl bg-[#F8FAFC] border border-[#CFD7E4] text-xs font-semibold text-[#172238]"
              >
                <option value="all" ${statusFilter === 'all' ? 'selected' : ''}>All statuses</option>
                <option value="Pending" ${statusFilter === 'Pending' ? 'selected' : ''}>Pending</option>
                <option value="Under Review" ${statusFilter === 'Under Review' ? 'selected' : ''}>Under Review</option>
                <option value="Returned" ${statusFilter === 'Returned' ? 'selected' : ''}>Returned</option>
                <option value="Completed" ${statusFilter === 'Completed' ? 'selected' : ''}>Completed</option>
              </select>
              <select
                id="officer-priority-filter"
                class="px-3 py-2 rounded-xl bg-[#F8FAFC] border border-[#CFD7E4] text-xs font-semibold text-[#172238]"
              >
                <option value="all" ${priorityFilter === 'all' ? 'selected' : ''}>All priorities</option>
                <option value="High" ${priorityFilter === 'High' ? 'selected' : ''}>High Priority</option>
                <option value="Medium" ${priorityFilter === 'Medium' ? 'selected' : ''}>Medium Priority</option>
                <option value="Low" ${priorityFilter === 'Low' ? 'selected' : ''}>Low Priority</option>
              </select>
            </div>

            <!-- Case Cards List -->
            <div class="space-y-3 max-h-[560px] overflow-y-auto pr-1">
              ${
                filteredApps.length === 0
                  ? `<div class="p-6 rounded-xl bg-[#F8FAFC] border border-slate-200 text-center text-xs text-slate-500">
                      <strong>No cases found.</strong> No applications match your current filter.
                    </div>`
                  : filteredApps
                      .map((item) => {
                        const overdue =
                          (item.slaStatus || '').includes('Overdue') || item.daysInStage > (item.slaLimitDays || 10);
                        const priority = item.priority || 'Medium';
                        const priorityBadge =
                          priority === 'High'
                            ? 'bg-[#EAF0FF] text-[#2456D6] border-blue-200'
                            : priority === 'Medium'
                            ? 'bg-amber-50 text-amber-800 border-amber-200'
                            : 'bg-slate-100 text-slate-700 border-slate-200';
                        const isSelected =
                          (isScrutiny && selectedScrutinyApp?.id === item.id) ||
                          (!isScrutiny && selectedOversightApp?.id === item.id);

                        return `
                          <article
                            class="p-4 rounded-xl border-2 transition ${
                              isSelected
                                ? 'bg-blue-50/40 border-[#2456D6] shadow-2xs'
                                : 'bg-[#F8FAFC] border-[#E1E6EF] hover:border-slate-300'
                            }"
                          >
                            <div class="flex flex-wrap items-start justify-between gap-3">
                              <div class="space-y-1 flex-1 min-w-[220px]">
                                <div class="font-bold text-sm text-[#0B2545]">${item.appNumber} · ${item.institutionName}</div>
                                <div class="text-xs text-[#66738A]">
                                  Stage: <strong class="text-[#0B2545]">${item.currentStage}</strong> · Program: <strong>${item.program || item.course || 'B.Tech'}</strong>
                                </div>
                                <div class="text-xs text-[#66738A]">
                                  Region: <strong>${item.region} (${item.state})</strong> · Ageing: <strong>${item.daysInStage}d</strong> (SLA: ${item.slaLimitDays || 10}d)
                                </div>
                                <div class="flex items-center gap-2 flex-wrap pt-1">
                                  <span class="px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${priorityBadge}">
                                    ${priority} priority
                                  </span>
                                  ${
                                    overdue
                                      ? `<span class="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-red-100 text-red-700 border border-red-200">Overdue</span>`
                                      : `<span class="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">Within SLA</span>`
                                  }
                                </div>
                              </div>

                              <div class="flex items-center gap-2 shrink-0">
                                ${
                                  isScrutiny
                                    ? `<button
                                        data-open-scrutiny="${item.id}"
                                        class="px-3.5 py-2 rounded-xl bg-[#2456D6] hover:bg-[#1d46b5] text-white text-xs font-bold cursor-pointer"
                                      >
                                        🔍 Open Scrutiny
                                      </button>`
                                    : `<button
                                        data-open-oversight="${item.id}"
                                        class="px-3.5 py-2 rounded-xl bg-[#0B2545] hover:bg-[#13315C] text-white text-xs font-bold cursor-pointer"
                                      >
                                        ${overdue ? '⚡ Follow-Up' : '👁️ Oversight'}
                                      </button>`
                                }
                                <button
                                  data-open-case="${item.id}"
                                  class="px-3 py-2 rounded-xl bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 text-xs font-semibold cursor-pointer"
                                >
                                  Dossier
                                </button>
                              </div>
                            </div>
                          </article>
                        `;
                      })
                      .join('')
              }
            </div>
          </section>

          <!-- RIGHT PANEL (5 cols): Scrutiny Form OR Oversight Panel -->
          <div class="lg:col-span-5 space-y-5">
            ${
              isScrutiny && selectedScrutinyApp
                ? `
              <section id="scrutiny-panel" class="bg-white rounded-2xl border-2 border-[#2456D6] p-5 shadow-xs space-y-4">
                <div class="border-b border-slate-200 pb-3">
                  <span class="text-[10px] font-bold uppercase tracking-wider text-[#2456D6] block">
                    Scrutiny Officer Verification Form
                  </span>
                  <h3 class="text-base font-serif font-bold text-[#0B2545]">
                    ${selectedScrutinyApp.appNumber} — ${selectedScrutinyApp.institutionName}
                  </h3>
                  <p class="text-xs text-[#66738A] mt-0.5">
                    Program: ${selectedScrutinyApp.program || selectedScrutinyApp.course} · Track: ${selectedScrutinyApp.workflowTrack}
                  </p>
                </div>

                <form id="officer-scrutiny-form" class="space-y-3.5">
                  <input type="hidden" id="scrutiny-app-id" value="${selectedScrutinyApp.id}" />
                  <div>
                    <label class="block text-xs font-bold text-[#172238] mb-1">
                      Observations / Deficiencies
                    </label>
                    <textarea
                      id="scrutiny-observations-input"
                      rows="4"
                      required
                      placeholder="Record document verification notes, faculty/lab observations, or deficiencies..."
                      class="w-full px-3 py-2 rounded-xl bg-[#F8FAFC] border border-[#CFD7E4] text-xs text-[#172238] focus:outline-none focus:border-[#2456D6]"
                    >${latestScrutinyRec?.observations || selectedScrutinyApp.scrutinySummary || ''}</textarea>
                  </div>

                  <div>
                    <label class="block text-xs font-bold text-[#172238] mb-1">
                      Scrutiny Outcome
                    </label>
                    <select
                      id="scrutiny-outcome-select"
                      required
                      class="w-full px-3 py-2.5 rounded-xl bg-[#F8FAFC] border border-[#CFD7E4] text-xs font-bold text-[#172238]"
                    >
                      <option value="">Select scrutiny outcome</option>
                      <option value="Scrutiny Complete" ${selectedScrutinyApp.scrutinyOutcome === 'Scrutiny Complete' ? 'selected' : ''}>
                        Scrutiny Complete (Clear &amp; Advance Stage)
                      </option>
                      <option value="Forward for Committee Review" ${selectedScrutinyApp.scrutinyOutcome === 'Forward for Committee Review' ? 'selected' : ''}>
                        Forward for Committee Review (Queue for EVC / SAC)
                      </option>
                      <option value="Deficiency Found" ${selectedScrutinyApp.scrutinyOutcome === 'Deficiency Found' ? 'selected' : ''}>
                        Deficiency Found (Return to Institution)
                      </option>
                    </select>
                  </div>

                  <button
                    type="submit"
                    class="w-full py-2.5 px-4 rounded-xl bg-[#2456D6] hover:bg-[#1d46b5] text-white font-bold text-xs uppercase tracking-wider shadow-xs transition cursor-pointer"
                  >
                    ✔ Save Scrutiny Record
                  </button>
                </form>
              </section>
            `
                : selectedOversightApp
                ? `
              <section id="oversight-panel" class="bg-white rounded-2xl border-2 border-[#0B2545] p-5 shadow-xs space-y-4">
                <div class="flex items-center justify-between border-b border-slate-200 pb-3">
                  <div>
                    <span class="text-[10px] font-bold uppercase tracking-wider text-[#2456D6] block">
                      ${isBureau ? 'Regulation Bureau Oversight' : 'Regional Directorate Oversight'}
                    </span>
                    <h3 class="text-base font-serif font-bold text-[#0B2545]">
                      ${selectedOversightApp.appNumber}
                    </h3>
                    <p class="text-xs text-[#66738A]">${selectedOversightApp.institutionName}</p>
                  </div>
                  <span class="px-2.5 py-1 rounded-full bg-[#EAF0FF] text-[#2456D6] text-[11px] font-bold">
                    Stage ${selectedOversightApp.stageNumeric > 0 ? selectedOversightApp.stageNumeric : 'Returned'}/6
                  </span>
                </div>

                <div class="bg-[#F8FAFC] rounded-xl border border-[#E1E6EF] p-3.5 text-xs space-y-1.5">
                  <div class="grid grid-cols-2 gap-2">
                    <div><span class="text-[#66738A]">Region:</span> <strong class="text-[#0B2545]">${selectedOversightApp.region} (${selectedOversightApp.state})</strong></div>
                    <div><span class="text-[#66738A]">Stage:</span> <strong class="text-[#2456D6]">${selectedOversightApp.currentStage}</strong></div>
                    <div><span class="text-[#66738A]">Priority:</span> <strong>${selectedOversightApp.priority || 'High'}</strong></div>
                    <div><span class="text-[#66738A]">EVC Score:</span> <strong class="text-emerald-700">${selectedOversightApp.evcScore || 86}/100</strong></div>
                  </div>
                  <p class="pt-1 border-t border-slate-200 text-slate-700">
                    <strong>Observations:</strong> ${latestEvcReview?.observations || selectedOversightApp.scrutinySummary || 'No adverse observations.'}
                  </p>
                </div>

                <div class="space-y-2.5">
                  <label class="block text-xs font-bold text-[#172238]">
                    Official Follow-Up Directive / Routing Remarks
                  </label>
                  <textarea
                    id="oversight-directive-input"
                    rows="3"
                    placeholder="Enter follow-up directive, SLA escalation note, or forwarding remarks..."
                    class="w-full px-3 py-2 rounded-xl bg-[#F8FAFC] border border-[#CFD7E4] text-xs text-[#172238] focus:outline-none focus:border-[#2456D6]"
                  ></textarea>

                  <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <button
                      id="btn-issue-bureau-directive"
                      data-app-id="${selectedOversightApp.id}"
                      class="py-2.5 px-3 rounded-xl bg-[#D97706] hover:bg-amber-700 text-white font-bold text-xs cursor-pointer"
                    >
                      🔔 Issue Follow-Up Alert
                    </button>
                    <button
                      id="btn-oversight-forward-ca"
                      data-app-id="${selectedOversightApp.id}"
                      class="py-2.5 px-3 rounded-xl bg-[#0B2545] hover:bg-[#13315C] text-white font-bold text-xs cursor-pointer"
                    >
                      ➜ Forward Next Stage
                    </button>
                  </div>
                </div>
              </section>
            `
                : ''
            }
          </div>
        </div>
      `
      }
    </div>
  `;
}

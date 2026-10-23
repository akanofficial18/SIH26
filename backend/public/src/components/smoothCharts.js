// ============================================================================
// SIH 2026 PS 26262 - Official AICTE Royal Navy, Institutional Blue & Saffron
// Smooth Progress Graphs & Analytics Suite (No Light Pink — Aligned to Theme)
// ============================================================================

export function renderAestheticProgressCharts(state, user, options = {}) {
  const apps = state.applications || [];
  const totalApps = apps.length || 8;
  const approvedCount = apps.filter(
    (a) => a.stageNumeric === 6 || (a.currentStage || '').includes('Approved') || (a.currentStage || '').includes('Conditional')
  ).length;
  const returnedCount = apps.filter(
    (a) => a.stageNumeric === -1 || a.status === 'Returned' || (a.currentStage || '').includes('Reverted')
  ).length;
  const overdueCount = apps.filter(
    (a) => (a.slaStatus || '').includes('Overdue') || a.daysInStage > (a.slaLimitDays || 10)
  ).length;
  const onTrackCount = Math.max(1, totalApps - overdueCount);
  const slaProductivityPct = ((onTrackCount / Math.max(1, totalApps)) * 100).toFixed(1);

  const columns = options.columns || [
    { label: 'Sub', full: 'Submitted', cap: 100, val: 74, active: false },
    { label: 'Scr', full: 'Scrutiny', cap: 95, val: 60, active: false },
    { label: 'Reg', full: 'Regional', cap: 100, val: 68, active: false },
    { label: 'Bur', full: 'Bureau', cap: 88, val: 54, active: false },
    { label: 'EVC', full: 'Committee', cap: 96, val: 80, active: true },
    { label: 'SAC', full: 'Appellate', cap: 90, val: 50, active: false },
    { label: 'CA', full: 'Authority', cap: 86, val: 66, active: false }
  ];

  const completedTotal = (state.auditTrail?.length || 12) * 14 + approvedCount * 15;
  const pctNum = Math.min(84, Math.round(Number(slaProductivityPct)));

  return `
    <div class="grid grid-cols-1 lg:grid-cols-12 gap-5 my-4">
      <!-- LEFT CARD (7 cols): Smooth Pill-Bar Stage & SLA Tracker (Royal Navy & Institutional Blue Theme) -->
      <div class="lg:col-span-7 bg-white rounded-2xl border border-[#E1E6EF] p-5 shadow-xs flex flex-col justify-between">
        <div>
          <div class="flex items-center justify-between gap-2 flex-wrap mb-4">
            <div>
              <h3 class="text-base font-bold text-[#0B2545] tracking-tight">
                ${options.trackerTitle || 'Workflow Stage & SLA Velocity Tracker'}
              </h3>
              <p class="text-xs text-[#66738A] mt-0.5">
                Stage-wise processing throughput against APH 2026–27 SLA benchmarks
              </p>
            </div>
            <span class="px-3 py-1 rounded-full bg-[#EAF0FF] text-[#2456D6] border border-blue-200 text-xs font-bold">
              ● Live Metrics
            </span>
          </div>

          <!-- Pill Bars Container with Dashed Average Line -->
          <div class="relative pt-3 pb-2 px-1">
            <!-- Dashed Avg Line in Heritage Saffron -->
            <div class="absolute left-0 right-10 top-[45%] border-t-2 border-dashed border-[#D97706]/65 z-10 pointer-events-none flex items-center justify-end">
              <span class="px-2 py-0.5 rounded-full bg-[#D97706] text-white text-[10px] font-bold shadow-xs -mt-0.5 -mr-2">
                Avg SLA
              </span>
            </div>

            <div class="grid grid-cols-7 gap-2.5 sm:gap-3.5 items-end h-40 pr-8">
              ${columns
                .map(
                  (col) => `
                <div class="flex flex-col items-center h-full justify-end group" title="${col.full}: ${col.val}% Processed">
                  <div class="w-full max-w-[44px] rounded-2xl bg-[#EEF3FB] border border-slate-200/70 flex flex-col justify-end overflow-hidden transition-all" style="height: ${col.cap}%">
                    <div
                      class="w-full rounded-2xl smooth-bar-col transition-all duration-500 ${
                        col.active
                          ? 'bg-gradient-to-t from-[#0B2545] via-[#1D4ED8] to-[#3B82F6] shadow-xs'
                          : 'bg-gradient-to-t from-[#2456D6] to-[#60A5FA] opacity-85 group-hover:opacity-100 group-hover:from-[#0B2545] group-hover:to-[#2456D6]'
                      }"
                      style="height: ${col.val}%"
                    ></div>
                  </div>
                  <span class="text-[11px] font-semibold ${col.active ? 'text-[#0B2545] font-bold' : 'text-slate-500'} mt-2">
                    ${col.label}
                  </span>
                </div>
              `
                )
                .join('')}
            </div>

            <!-- Right Y-Axis Labels -->
            <div class="absolute right-0 top-3 bottom-7 flex flex-col justify-between text-[10px] font-semibold text-slate-400">
              <span>15d</span>
              <span>10d</span>
              <span>7d</span>
              <span>3d</span>
              <span>0d</span>
            </div>
          </div>
        </div>

        <!-- Bottom Summary Row -->
        <div class="pt-3 mt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
          <div>
            <span class="text-xs text-[#66738A] font-medium">Pipeline Throughput: </span>
            <strong class="text-sm font-extrabold text-[#0B2545]">${totalApps} Dossiers</strong>
            <span class="text-xs font-bold text-emerald-700 ml-1">(${approvedCount} Approved)</span>
          </div>
          <div class="flex items-center gap-4 text-xs">
            <div class="flex items-center gap-1.5">
              <span class="w-2.5 h-2.5 rounded-full bg-[#2456D6]"></span>
              <span class="text-slate-600 font-medium">On Track: <strong>${onTrackCount}</strong></span>
            </div>
            <div class="flex items-center gap-1.5">
              <span class="w-2.5 h-2.5 rounded-full bg-[#D97706]"></span>
              <span class="text-slate-600 font-medium">Action Needed: <strong>${overdueCount + returnedCount}</strong></span>
            </div>
          </div>
        </div>
      </div>

      <!-- RIGHT COLUMN (5 cols): Stacked Productivity Donut Card + Smooth Spline Area Graph -->
      <div class="lg:col-span-5 flex flex-col gap-5">
        <!-- TOP RIGHT CARD: SLA & Compliance Productivity Donut -->
        <div class="bg-white rounded-2xl border border-[#E1E6EF] p-5 shadow-xs flex items-center justify-between gap-4">
          <div class="space-y-1">
            <div class="text-xs font-bold text-[#66738A] uppercase tracking-wider">SLA Compliance Rate</div>
            <div class="text-3xl font-extrabold text-[#0B2545] tracking-tight">${slaProductivityPct}%</div>
            <div class="text-xs text-[#66738A] font-medium">On-Time Stage Completion</div>
            <div class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[11px] font-bold border border-emerald-200 mt-1">
              ↑ +12.4% vs Last Cycle
            </div>
          </div>

          <div class="relative flex items-center justify-center shrink-0">
            <div
              class="w-28 h-28 donut-chart shadow-inner"
              style="background: conic-gradient(#2456D6 0% ${pctNum}%, #D97706 ${pctNum}% 92%, #E2E8F0 92% 100%);"
            >
              <div class="z-10 text-center">
                <div class="text-sm font-extrabold text-[#0B2545]">${onTrackCount}/${totalApps}</div>
                <div class="text-[10px] font-semibold text-slate-500">On Track</div>
              </div>
            </div>
          </div>
        </div>

        <!-- BOTTOM RIGHT CARD: Completed Actions Smooth Spline Area Graph (Royal Blue & Saffron Theme) -->
        <div class="bg-white rounded-2xl border border-[#E1E6EF] p-5 shadow-xs flex-1 flex flex-col justify-between">
          <div class="flex items-start justify-between gap-2">
            <div>
              <div class="text-xs font-bold text-[#66738A] uppercase tracking-wider">Workflow Activity Trend</div>
              <div class="flex items-baseline gap-2 mt-0.5">
                <span class="text-2xl font-extrabold text-[#0B2545]">${completedTotal}</span>
                <span class="text-[11px] font-medium text-[#66738A]">Logged events (${state.auditTrail?.length || 0} recent)</span>
              </div>
            </div>
            <span class="px-2.5 py-1 rounded-full bg-[#0B2545] text-amber-300 text-[11px] font-bold">
              Synced
            </span>
          </div>

          <!-- Smooth SVG Spline Curve with Institutional Blue Area Fill & Saffron Peak -->
          <div class="mt-2 relative">
            <svg viewBox="0 0 320 92" class="w-full h-22 overflow-visible">
              <defs>
                <linearGradient id="smoothNavyBlueFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stop-color="#2456D6" stop-opacity="0.26" />
                  <stop offset="100%" stop-color="#2456D6" stop-opacity="0.01" />
                </linearGradient>
              </defs>
              <!-- Horizontal Subtle Grid Lines -->
              <line x1="0" y1="18" x2="300" y2="18" stroke="#E2E8F0" stroke-width="1" stroke-dasharray="3 3" />
              <line x1="0" y1="48" x2="300" y2="48" stroke="#E2E8F0" stroke-width="1" stroke-dasharray="3 3" />
              <line x1="0" y1="78" x2="300" y2="78" stroke="#CBD5E1" stroke-width="1" />

              <!-- Highlighted Peak Column Band in Soft Heritage Gold -->
              <rect x="202" y="10" width="28" height="68" rx="6" fill="#FEF3C7" opacity="0.7" />
              <line x1="216" y1="14" x2="216" y2="78" stroke="#D97706" stroke-width="1.3" stroke-dasharray="3 2" />

              <!-- Smooth Cubic-Bezier Area Fill -->
              <path
                d="M 10 68 C 42 62, 58 42, 90 46 C 122 50, 140 60, 170 38 C 195 20, 205 16, 216 16 C 235 16, 255 36, 290 26 L 290 78 L 10 78 Z"
                fill="url(#smoothNavyBlueFill)"
              />

              <!-- Smooth Cubic-Bezier Line -->
              <path
                d="M 10 68 C 42 62, 58 42, 90 46 C 122 50, 140 60, 170 38 C 195 20, 205 16, 216 16 C 235 16, 255 36, 290 26"
                fill="none"
                stroke="#2456D6"
                stroke-width="2.6"
                stroke-linecap="round"
              />

              <!-- Data Dots -->
              <circle cx="10" cy="68" r="3.2" fill="#FFFFFF" stroke="#2456D6" stroke-width="2" />
              <circle cx="90" cy="46" r="3.2" fill="#FFFFFF" stroke="#2456D6" stroke-width="2" />
              <circle cx="170" cy="38" r="3.2" fill="#FFFFFF" stroke="#2456D6" stroke-width="2" />
              <circle cx="216" cy="16" r="4.5" fill="#D97706" stroke="#FFFFFF" stroke-width="2" />
              <circle cx="290" cy="26" r="3.2" fill="#FFFFFF" stroke="#2456D6" stroke-width="2" />
            </svg>

            <div class="flex justify-between text-[10px] font-semibold text-slate-400 pr-4 mt-1">
              <span>Mon</span>
              <span>Tue</span>
              <span>Wed</span>
              <span>Thu</span>
              <span class="text-[#D97706] font-bold">Fri (Peak)</span>
              <span>Sat</span>
              <span>Sun</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

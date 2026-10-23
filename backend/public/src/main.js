// ============================================================================
// SIH 2026 Problem Statement ID: 26262
// Integrated AICTE Approval Workflow Automation, Compliance Monitoring and
// Alert Management System — Authenticated Dashboard Entry (/dashboard)
// ============================================================================

import { backend } from './services/supabaseService.js';
import { renderDashboardWorkspace } from './components/dashboardView.js';

const rootEl = document.getElementById('root');
let currentViewCleanup = null;
let mountedForUserEmail = null;

function mountApp() {
  if (!rootEl) return;

  if (!backend.authToken || !backend.state.currentUser) {
    window.location.replace('/login');
    return;
  }

  if (currentViewCleanup) {
    currentViewCleanup();
    currentViewCleanup = null;
  }

  mountedForUserEmail = backend.state.currentUser.email;
  currentViewCleanup = renderDashboardWorkspace(rootEl);
}

backend.subscribe((state) => {
  if (!backend.authToken || !state.currentUser) {
    window.location.replace('/login');
    return;
  }
  if (state.currentUser.email !== mountedForUserEmail) {
    mountApp();
  }
});

mountApp();

// ============================================================================
// SIH 2026 PS 26262 - Secure, Account-Isolated Backend & Real-Time State Engine
// - Authenticates every request with the JWT Bearer token issued by `/login`
// - Strictly locks each session to its own authenticated account (no role switching)
// - Isolates Institution records and per-user dashboard progress in SQLite
// ============================================================================

import {
  AUTHORIZED_ACCOUNTS,
  ROLE_MAPPING_MATRIX,
  INITIAL_PORTAL_CFG,
  INITIAL_SCRUTINY_RECORDS,
  INITIAL_COMMITTEE_REVIEWS,
  INITIAL_APH_RULES,
  INITIAL_APPLICATIONS,
  INITIAL_EVC_INSPECTIONS,
  INITIAL_SAC_HEARINGS,
  INITIAL_UNDERTAKINGS,
  INITIAL_DOCUMENTS,
  INITIAL_ALERTS,
  INITIAL_AUDIT_TRAIL,
  REGION_METRICS
} from '../data/mockDatabase.js';

const AUTH_SESSION_KEY = 'aicte_session';
const SUPABASE_CFG_KEY = 'aicte_ps26262_supabase_config';

function belongsToInstitutionAccount(item, user) {
  if (!item || !user) return false;
  const email = String(user.email || '').trim().toLowerCase();
  const instName = String(user.institutionName || '').trim().toLowerCase();
  const itemEmail = String(item.contactEmail || item.contact || item.ownerEmail || '').trim().toLowerCase();
  if (email && itemEmail && itemEmail === email) return true;
  const itemInst = String(item.institutionName || '').trim().toLowerCase();
  if (instName && itemInst && itemInst === instName) return true;
  if (item.ownerUserId && String(item.ownerUserId) === String(user.userId)) return true;
  return false;
}

class AicteSupabaseBackend {
  constructor() {
    this.listeners = new Set();
    this.supabaseClient = null;
    this.isDemoMode = true;
    this.mockBlobUrls = {};
    this.connectionStatus = 'backend_db_connected';
    this.lastSyncTime = new Date().toLocaleTimeString();
    this.authToken = null;
    this.authSession = this.loadAuthSessionFromLogin();
    this.config = this.loadSupabaseConfig();
    this.state = this.loadInitialState();
    if (this.authToken) {
      this.hydrateFromBackendDb();
      this.initSupabase();
    }
  }

  get modeBadgeText() {
    return this.connectionStatus === 'connected' ? 'Supabase + SQLite Connected' : 'SQLite Secure DB Active';
  }

  loadAuthSessionFromLogin() {
    try {
      const raw = localStorage.getItem(AUTH_SESSION_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || !parsed.token || !parsed.user || !parsed.user.email) {
        localStorage.removeItem(AUTH_SESSION_KEY);
        return null;
      }
      this.authToken = parsed.token;
      return parsed;
    } catch (_) {
      localStorage.removeItem(AUTH_SESSION_KEY);
      return null;
    }
  }

  getUserStorageKey() {
    const email = (this.state?.currentUser?.email || this.authSession?.user?.email || 'anon')
      .trim()
      .toLowerCase();
    return `aicte_ps26262_state_v4_${email}`;
  }

  getAuthHeaders(extra = {}) {
    return {
      'Content-Type': 'application/json',
      ...(this.authToken ? { Authorization: `Bearer ${this.authToken}` } : {}),
      ...extra
    };
  }

  loadSupabaseConfig() {
    const saved = localStorage.getItem(SUPABASE_CFG_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.url && parsed.anonKey && !parsed.url.includes('PASTE_')) return parsed;
      } catch (_) {}
    }
    const portalCfg = window.PORTAL_CONFIG || {};
    const env = window.__AICTE_ENV__ || {};
    const url = portalCfg.SUPABASE_URL || env.VITE_SUPABASE_URL || '';
    const anonKey = portalCfg.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || '';
    const isPlaceholder =
      !url ||
      url.includes('PASTE_') ||
      url.includes('your-project-ref') ||
      !anonKey ||
      anonKey.includes('PASTE_') ||
      anonKey.includes('your-supabase-anon-key');

    return {
      url: isPlaceholder ? '' : url,
      anonKey: isPlaceholder ? '' : anonKey
    };
  }

  saveSupabaseConfig(url, anonKey) {
    const cleanUrl = (url || '').trim();
    const cleanKey = (anonKey || '').trim();
    if (!cleanUrl || cleanUrl.includes('PASTE_') || !cleanKey || cleanKey.includes('PASTE_')) {
      this.config = { url: '', anonKey: '' };
      localStorage.removeItem(SUPABASE_CFG_KEY);
    } else {
      this.config = { url: cleanUrl, anonKey: cleanKey };
      localStorage.setItem(SUPABASE_CFG_KEY, JSON.stringify(this.config));
    }
    return this.initSupabase();
  }

  async initSupabase() {
    if (!this.config.url || !this.config.anonKey) {
      this.isDemoMode = true;
      this.connectionStatus = 'backend_db_connected';
      this.notify();
      return { connected: true, mode: 'SQLite Secure DB Active' };
    }

    try {
      if (window.supabase && typeof window.supabase.createClient === 'function') {
        this.supabaseClient = window.supabase.createClient(this.config.url, this.config.anonKey);
      }
      const response = await fetch(`${this.config.url.replace(/\/$/, '')}/rest/v1/applications?select=id&limit=1`, {
        headers: {
          apikey: this.config.anonKey,
          Authorization: `Bearer ${this.config.anonKey}`
        }
      });

      if (response.ok) {
        this.isDemoMode = false;
        this.connectionStatus = 'connected';
        this.lastSyncTime = new Date().toLocaleTimeString();
        this.notify();
        return { connected: true, mode: 'Supabase + SQLite Connected' };
      } else {
        this.isDemoMode = false;
        this.connectionStatus = response.status === 404 ? 'schema_pending' : 'connected';
        this.notify();
        return { connected: true, mode: this.connectionStatus, status: response.status };
      }
    } catch (err) {
      this.isDemoMode = true;
      this.connectionStatus = 'backend_db_connected';
      this.notify();
      return { connected: true, mode: 'SQLite Secure DB Active', error: err.message };
    }
  }

  async supabaseRest(table, method = 'GET', body = null, query = '') {
    if (!this.config.url || !this.config.anonKey) return null;
    try {
      const baseUrl = this.config.url.replace(/\/$/, '');
      const res = await fetch(`${baseUrl}/rest/v1/${table}${query}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          apikey: this.config.anonKey,
          Authorization: `Bearer ${this.config.anonKey}`,
          Prefer: 'return=representation'
        },
        body: body ? JSON.stringify(body) : undefined
      });
      if (!res.ok) return null;
      this.lastSyncTime = new Date().toLocaleTimeString();
      return await res.json();
    } catch (_) {
      return null;
    }
  }

  resolveInitialUserFromSession() {
    if (!this.authSession || !this.authSession.user) return null;
    const rawUser = this.authSession.user;
    const method = this.authSession.method || 'Biometric / OTP Session';
    const matchedSeed = AUTHORIZED_ACCOUNTS.find(
      (a) =>
        a.email.toLowerCase() === String(rawUser.email || '').toLowerCase() ||
        (a.aliasEmail && a.aliasEmail.toLowerCase() === String(rawUser.email || '').toLowerCase())
    );
    const base = {
      ...(matchedSeed || {}),
      ...rawUser,
      fullName: rawUser.fullName || rawUser.name || matchedSeed?.fullName || rawUser.email,
      statementRole: rawUser.statementRole || matchedSeed?.statementRole || 'Institution',
      subRole: rawUser.subRole || matchedSeed?.subRole || 'Institution (Applicant)',
      designation: rawUser.designation || matchedSeed?.designation || 'Authorized Portal User',
      region: rawUser.region || matchedSeed?.region || 'West',
      institutionName: rawUser.institutionName || matchedSeed?.institutionName || rawUser.name,
      employeeCode: rawUser.employeeCode || matchedSeed?.employeeCode || 'AICTE-USR',
      avatarInitials:
        rawUser.avatarInitials ||
        matchedSeed?.avatarInitials ||
        String(rawUser.name || 'U')
          .slice(0, 2)
          .toUpperCase(),
      permissions: rawUser.permissions || matchedSeed?.permissions || [],
      loginMethod: method,
      locked: true
    };
    return base;
  }

  filterDataForUser(rawState, user) {
    if (!user) return rawState;
    const isInst = user.roleKey === 'institution' || user.subRole === 'Institution (Applicant)' || user.statementRole === 'Institution';
    if (!isInst) return rawState;

    const myApps = (rawState.applications || []).filter((a) => belongsToInstitutionAccount(a, user));
    const myAppNumbers = new Set(myApps.map((a) => a.appNumber));
    const myAppIds = new Set(myApps.map((a) => a.id));

    return {
      ...rawState,
      applications: myApps,
      undertakings: (rawState.undertakings || []).filter(
        (u) => belongsToInstitutionAccount(u, user) || myAppNumbers.has(u.appNumber)
      ),
      documents: (rawState.documents || []).filter(
        (d) => belongsToInstitutionAccount(d, user) || myAppNumbers.has(d.appNumber)
      ),
      evcInspections: (rawState.evcInspections || []).filter(
        (e) => belongsToInstitutionAccount(e, user) || myAppNumbers.has(e.appNumber)
      ),
      sacHearings: (rawState.sacHearings || []).filter(
        (s) => belongsToInstitutionAccount(s, user) || myAppNumbers.has(s.appNumber)
      ),
      alerts: (rawState.alerts || []).filter(
        (al) => belongsToInstitutionAccount(al, user) || myAppNumbers.has(al.appNumber)
      ),
      auditTrail: (rawState.auditTrail || []).filter(
        (l) =>
          myAppNumbers.has(l.appNumber) ||
          myAppIds.has(l.appNumber) ||
          String(l.actorName || '').toLowerCase() === String(user.fullName || '').toLowerCase() ||
          String(l.actorName || '').toLowerCase() === String(user.institutionName || '').toLowerCase()
      ),
      accounts: [user]
    };
  }

  getFreshSeedState() {
    const initialUser = this.resolveInitialUserFromSession();
    const baseState = {
      currentUser: initialUser,
      accounts: initialUser ? [initialUser] : [],
      roleMappingMatrix: ROLE_MAPPING_MATRIX,
      portalCfg: JSON.parse(JSON.stringify(INITIAL_PORTAL_CFG)),
      scrutinyRecords: JSON.parse(JSON.stringify(INITIAL_SCRUTINY_RECORDS)),
      committeeReviews: JSON.parse(JSON.stringify(INITIAL_COMMITTEE_REVIEWS)),
      aphRules: JSON.parse(JSON.stringify(INITIAL_APH_RULES)),
      applications: JSON.parse(JSON.stringify(INITIAL_APPLICATIONS)),
      evcInspections: JSON.parse(JSON.stringify(INITIAL_EVC_INSPECTIONS)),
      sacHearings: JSON.parse(JSON.stringify(INITIAL_SAC_HEARINGS)),
      undertakings: JSON.parse(JSON.stringify(INITIAL_UNDERTAKINGS)),
      documents: JSON.parse(JSON.stringify(INITIAL_DOCUMENTS)),
      alerts: JSON.parse(JSON.stringify(INITIAL_ALERTS)),
      auditTrail: JSON.parse(JSON.stringify(INITIAL_AUDIT_TRAIL)),
      regionMetrics: JSON.parse(JSON.stringify(REGION_METRICS)),
      userProgressMap: {},
      sessionLogs: [
        {
          id: 'slog-1',
          time: new Date().toLocaleTimeString(),
          event: 'AICTE Secure SQLite Database & 6-Dashboard Workflow Engine Initialized'
        }
      ]
    };
    return this.filterDataForUser(baseState, initialUser);
  }

  loadInitialState() {
    const fresh = this.getFreshSeedState();
    if (!fresh.currentUser) return fresh;

    const storageKey = `aicte_ps26262_state_v4_${fresh.currentUser.email.toLowerCase()}`;
    const raw = localStorage.getItem(storageKey);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.applications)) {
          const merged = this.filterDataForUser(
            {
              ...fresh,
              ...parsed,
              currentUser: fresh.currentUser,
              roleMappingMatrix: ROLE_MAPPING_MATRIX,
              portalCfg: parsed.portalCfg || fresh.portalCfg,
              scrutinyRecords: parsed.scrutinyRecords || fresh.scrutinyRecords,
              committeeReviews: parsed.committeeReviews || fresh.committeeReviews,
              userProgressMap: parsed.userProgressMap || {}
            },
            fresh.currentUser
          );
          return merged;
        }
      } catch (_) {}
    }
    return fresh;
  }

  async hydrateFromBackendDb() {
    if (!this.authToken) {
      this.logout();
      return;
    }
    try {
      const res = await fetch('/api/portal/state', {
        headers: this.getAuthHeaders()
      });
      if (res.status === 401 || res.status === 403) {
        this.logout();
        return;
      }
      if (!res.ok) return;
      const data = await res.json();
      if (!data.success) return;

      this.connectionStatus = 'backend_db_connected';
      this.lastSyncTime = new Date().toLocaleTimeString();

      // Always bind currentUser to the server-verified `data.me` profile from SQLite + JWT
      const verifiedUser = {
        ...(this.state.currentUser || {}),
        ...(data.me || {}),
        loginMethod: this.authSession?.method || this.state.currentUser?.loginMethod || 'Verified JWT Session',
        restoredProgress: data.userProgress || null,
        locked: true
      };

      // Update local aicte_session user metadata
      try {
        localStorage.setItem(
          AUTH_SESSION_KEY,
          JSON.stringify({
            ...this.authSession,
            user: verifiedUser,
            token: this.authToken
          })
        );
      } catch (_) {}

      const emailKey = verifiedUser.email.toLowerCase();
      if (data.portalState) {
        this.state = this.filterDataForUser(
          {
            ...this.state,
            ...data.portalState,
            roleMappingMatrix: ROLE_MAPPING_MATRIX,
            currentUser: verifiedUser,
            accounts:
              verifiedUser.roleKey === 'system_admin' && Array.isArray(data.portalState.accounts)
                ? data.portalState.accounts
                : [verifiedUser],
            userProgressMap: {
              [emailKey]: data.userProgress || (this.state.userProgressMap && this.state.userProgressMap[emailKey]) || {}
            }
          },
          verifiedUser
        );
        localStorage.setItem(this.getUserStorageKey(), JSON.stringify({ ...this.state, currentUser: null }));
        this.notify();
      } else {
        this.state.currentUser = verifiedUser;
        await this.pushStateToBackendDb();
        this.notify();
      }
    } catch (_) {}
  }

  async pushStateToBackendDb(userEmail = null, userProgress = null, activityEntry = null) {
    if (!this.authToken || !this.state.currentUser) return;
    try {
      const emailKey = this.state.currentUser.email.toLowerCase();
      const stateToPersist = {
        ...this.state,
        currentUser: null,
        userProgressMap: {}
      };
      const res = await fetch('/api/portal/state', {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify({
          portalState: stateToPersist,
          userEmail: emailKey,
          userProgress: userProgress || (this.state.userProgressMap && this.state.userProgressMap[emailKey]) || null,
          activityEntry
        })
      });
      if (res.status === 401 || res.status === 403) {
        this.logout();
        return;
      }
      if (res.ok) {
        this.connectionStatus = 'backend_db_connected';
        this.lastSyncTime = new Date().toLocaleTimeString();
      }
    } catch (_) {}
  }

  saveState(userProgressPatch = null, activityEntry = null) {
    if (!this.state.currentUser) return;
    this.lastSyncTime = new Date().toLocaleTimeString();
    const email = this.state.currentUser.email.toLowerCase();
    if (userProgressPatch) {
      this.state.userProgressMap = {
        [email]: {
          ...((this.state.userProgressMap && this.state.userProgressMap[email]) || {}),
          ...userProgressPatch,
          updatedAt: new Date().toISOString()
        }
      };
    }

    const serializable = { ...this.state, currentUser: null };
    localStorage.setItem(this.getUserStorageKey(), JSON.stringify(serializable));
    this.pushStateToBackendDb(email, this.state.userProgressMap?.[email], activityEntry);
    this.notify();
  }

  getUserSavedProgress(email) {
    if (!email || !this.state.currentUser) return null;
    const key = email.toLowerCase();
    if (key !== this.state.currentUser.email.toLowerCase()) return null;
    return (
      (this.state.userProgressMap && this.state.userProgressMap[key]) ||
      this.state.currentUser.restoredProgress ||
      null
    );
  }

  saveUserProgress(patch, notifyListeners = false) {
    if (!this.state.currentUser?.email) return;
    const key = this.state.currentUser.email.toLowerCase();
    this.state.userProgressMap = {
      [key]: {
        ...((this.state.userProgressMap && this.state.userProgressMap[key]) || {}),
        ...patch,
        updatedAt: new Date().toISOString()
      }
    };
    this.state.currentUser.restoredProgress = this.state.userProgressMap[key];
    const serializable = { ...this.state, currentUser: null };
    localStorage.setItem(this.getUserStorageKey(), JSON.stringify(serializable));
    this.pushStateToBackendDb(key, this.state.userProgressMap[key]);
    if (notifyListeners) this.notify();
  }

  async resetDemoData() {
    if (!this.authToken) return;
    localStorage.removeItem(this.getUserStorageKey());
    try {
      await fetch('/api/portal/reset', {
        method: 'POST',
        headers: this.getAuthHeaders()
      });
    } catch (_) {}
    await this.hydrateFromBackendDb();
  }

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  notify() {
    for (const fn of this.listeners) {
      fn(this.state, this.connectionStatus, this.lastSyncTime);
    }
  }

  addSessionLog(event) {
    this.state.sessionLogs.unshift({
      id: 'slog-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
      time: new Date().toLocaleTimeString(),
      event
    });
    if (this.state.sessionLogs.length > 30) {
      this.state.sessionLogs.pop();
    }
  }

  appendAudit({
    actorName,
    statementRole,
    subRole,
    actionType,
    appNumber = 'GLOBAL-PORTAL',
    stageFrom = '-',
    stageTo = '-',
    authMethod = 'Session Token',
    remarks = ''
  }) {
    const now = new Date();
    const timestamp =
      now.getFullYear() +
      '-' +
      String(now.getMonth() + 1).padStart(2, '0') +
      '-' +
      String(now.getDate()).padStart(2, '0') +
      ' ' +
      now.toTimeString().slice(0, 8);

    const entry = {
      id: 'aud-' + Date.now() + '-' + Math.random().toString(36).slice(2, 5),
      eventCode: 'AUD-2026-' + Math.floor(1000 + Math.random() * 9000),
      timestamp,
      actorName,
      statementRole,
      subRole,
      actionType,
      appNumber,
      stageFrom,
      stageTo,
      authMethod,
      regulatorySafeguardVerified: true,
      remarks
    };

    this.state.auditTrail.unshift(entry);
    this.addSessionLog(`[${actionType}] ${appNumber}: ${remarks}`);

    this.supabaseRest('audit_trail', 'POST', {
      event_code: entry.eventCode,
      actor_name: entry.actorName,
      statement_role: entry.statementRole,
      sub_role: entry.subRole,
      action_type: entry.actionType,
      app_number: entry.appNumber,
      stage_from: entry.stageFrom,
      stage_to: entry.stageTo,
      auth_method: entry.authMethod,
      regulatory_safeguard_verified: true,
      remarks: entry.remarks
    });

    return entry;
  }

  // ==========================================================================
  // ACCOUNT LOCK ENFORCEMENT: NO DIRECT SWITCHING TO OTHER ACCOUNTS
  // ==========================================================================
  switchActiveRole() {
    console.warn('[Security] Direct cross-account switching is disabled. Sign out and authenticate on /login.');
    return this.state.currentUser;
  }

  logout() {
    const storageKey = this.getUserStorageKey();
    this.authToken = null;
    this.authSession = null;
    this.state.currentUser = null;
    try {
      localStorage.removeItem(AUTH_SESSION_KEY);
      localStorage.removeItem(storageKey);
    } catch (_) {}
    this.notify();
    window.location.replace('/login');
  }

  // ==========================================================================
  // DASHBOARD 1 & 2: REGIONAL / SCRUTINY OFFICER & BUREAU OFFICER ACTIONS
  // ==========================================================================
  saveScrutinyRecord({ applicationId, observations, outcome }) {
    const app = this.state.applications.find((a) => a.id === applicationId || a.appNumber === applicationId);
    if (!app) return null;

    const user = this.state.currentUser;
    if (!user) return null;
    const prevStage = app.currentStage;
    const nowStr = new Date().toISOString().slice(0, 16).replace('T', ' ');

    const record = {
      id: 'scr-' + Date.now(),
      applicationId: app.id,
      application_id: app.id,
      appNumber: app.appNumber,
      institutionName: app.institutionName,
      region: app.region,
      officerName: user.fullName,
      officer_name: user.fullName,
      observations,
      outcome,
      createdAt: nowStr,
      created_at: nowStr
    };

    this.state.scrutinyRecords = this.state.scrutinyRecords || [];
    this.state.scrutinyRecords.unshift(record);

    app.scrutinyScore = outcome === 'Deficiency Found' ? 68 : 93;
    app.scrutinyRemarks = observations;
    app.scrutinySummary = observations;
    app.scrutinyOutcome = outcome;

    if (outcome === 'Deficiency Found') {
      app.currentStage = 'Reverted for Deficiency';
      app.stageNumeric = -1;
      app.stage = -1;
      app.status = 'Returned';
      app.returnNote = observations;
      app.deficiencyReasons = observations;
      app.slaStatus = 'Overdue / Escalated';
    } else if (outcome === 'Forward for Committee Review') {
      app.currentStage = 'EVC Inspection';
      app.stageNumeric = 4;
      app.stage = 4;
      app.status = 'Under Review';
      app.assignedRole = 'Committee';
      app.assignedSubRole = 'EVC Member';
      app.slaStatus = 'On Track';
      app.daysInStage = 1;
    } else {
      const isOnlyScrutiny = (app.workflowTrack || app.aphTrack) === 'Only Scrutiny';
      app.currentStage = isOnlyScrutiny ? 'Competent Authority Review' : 'EVC Inspection';
      app.stageNumeric = isOnlyScrutiny ? 5 : 4;
      app.stage = app.stageNumeric;
      app.status = 'Under Review';
      app.slaStatus = 'On Track';
      app.daysInStage = 1;
    }

    if (!Array.isArray(app.history)) app.history = [];
    app.history.push({
      stage: `Scrutiny: ${outcome}`,
      actor: 'Scrutiny Officer',
      date: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
      note: observations
    });

    const aud = this.appendAudit({
      actorName: user.fullName,
      statementRole: user.statementRole,
      subRole: user.subRole,
      actionType: 'SCRUTINY_SUBMITTED',
      appNumber: app.appNumber,
      stageFrom: prevStage,
      stageTo: `${outcome} -> ${app.currentStage}`,
      authMethod: user.loginMethod || 'Session Token',
      remarks: `${outcome}: ${observations}`
    });

    this.saveState(null, aud);
    return record;
  }

  saveCommitteeReview({ applicationId, committeeType, observations, recommendation }) {
    const app = this.state.applications.find((a) => a.id === applicationId || a.appNumber === applicationId);
    if (!app) return null;

    const user = this.state.currentUser;
    if (!user) return null;
    const prevStage = app.currentStage;
    const nowStr = new Date().toISOString().slice(0, 16).replace('T', ' ');

    const review = {
      id: 'crev-' + Date.now(),
      applicationId: app.id,
      application_id: app.id,
      appNumber: app.appNumber,
      institutionName: app.institutionName,
      committeeType: committeeType || 'EVC',
      committee_type: committeeType || 'EVC',
      reviewerName: user.fullName,
      reviewer_name: user.fullName,
      observations,
      recommendation,
      createdAt: nowStr,
      created_at: nowStr
    };

    this.state.committeeReviews = this.state.committeeReviews || [];
    this.state.committeeReviews.unshift(review);

    app.evcRecommendation = `${recommendation} (${committeeType || 'EVC'}): ${observations}`;

    if (recommendation === 'Return for Clarification') {
      app.currentStage = 'Reverted for Deficiency';
      app.stageNumeric = -1;
      app.stage = -1;
      app.status = 'Returned';
      app.returnNote = observations;
      app.deficiencyReasons = observations;
      app.slaStatus = 'Overdue / Escalated';
    } else if (recommendation === 'Further Review Required') {
      app.currentStage = 'SAC/SHC Hearing';
      app.stageNumeric = 4;
      app.stage = 4;
      app.status = 'Under Review';
      app.assignedRole = 'Committee';
      app.assignedSubRole = 'SAC/SHC Member';
    } else {
      app.currentStage = 'Competent Authority Review';
      app.stageNumeric = 5;
      app.stage = 5;
      app.status = 'Under Review';
      app.assignedRole = 'Competent Authority';
      app.assignedSubRole = app.isNewInstitution ? 'Chairman' : 'Member Secretary';
    }

    if (!Array.isArray(app.history)) app.history = [];
    app.history.push({
      stage: `${committeeType || 'EVC'} Review: ${recommendation}`,
      actor: `${committeeType || 'EVC'} Committee`,
      date: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
      note: observations
    });

    const aud = this.appendAudit({
      actorName: user.fullName,
      statementRole: user.statementRole,
      subRole: user.subRole,
      actionType: 'COMMITTEE_REVIEW_SAVED',
      appNumber: app.appNumber,
      stageFrom: prevStage,
      stageTo: `${recommendation} -> ${app.currentStage}`,
      authMethod: user.loginMethod || 'Session Token',
      remarks: `${committeeType || 'EVC'} Review (${recommendation}): ${observations}`
    });

    this.saveState(null, aud);
    return review;
  }

  triggerBureauEscalationFollowUp(appId, note) {
    const app = this.state.applications.find((a) => a.id === appId || a.appNumber === appId);
    if (!app) return null;
    const user = this.state.currentUser;
    if (!user) return null;

    const directive = note || `Bureau Head Priority Directive issued for ${app.appNumber}: Expedite SLA completion within 24 hours.`;
    app.electronicCaseSummary = `[Bureau Directive ${new Date().toLocaleTimeString()}] ${directive}`;

    this.state.alerts.unshift({
      id: 'alt-' + Date.now(),
      alertCode: 'ALT-BUR-' + Math.floor(100 + Math.random() * 899),
      severity: 'High',
      category: 'Stage Pendency SLA',
      title: `Bureau Priority Follow-Up: ${app.appNumber}`,
      message: `${app.institutionName} (${app.region}) — ${directive}`,
      appNumber: app.appNumber,
      institutionName: app.institutionName,
      contactEmail: app.contactEmail,
      region: app.region,
      targetStatementRole: 'Both',
      targetSubRole: app.assignedSubRole || 'Regional Officer',
      escalatedFrom: `${user.statementRole} (${user.subRole})`,
      escalatedTo: app.assignedOfficer || 'Regional Office & EVC Queue',
      isAcknowledged: false,
      createdAt: new Date().toISOString().slice(0, 16).replace('T', ' ')
    });

    const aud = this.appendAudit({
      actorName: user.fullName,
      statementRole: user.statementRole,
      subRole: user.subRole,
      actionType: 'BUREAU_FOLLOWUP_DIRECTIVE',
      appNumber: app.appNumber,
      stageFrom: app.currentStage,
      stageTo: app.currentStage,
      authMethod: user.loginMethod || 'Session Token',
      remarks: directive
    });

    this.saveState(null, aud);
    return app;
  }

  // ==========================================================================
  // DASHBOARD 5: INSTITUTION (APPLICANT) ACTIONS (Strictly Scoped to Own Account)
  // ==========================================================================
  submitInstitutionApplication({ name, course, state, email, docsChecked }) {
    const user = this.state.currentUser;
    if (!user) return null;

    const lockedInstName = user.institutionName || name || user.fullName;
    const lockedEmail = user.email || email;

    const num = 1043 + this.state.applications.length + Math.floor(Math.random() * 90);
    const appId = `AICTE/2026/NEW/${num}`;
    const todayFormatted = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    const region =
      state.toLowerCase().includes('maha') || state.toLowerCase().includes('guj')
        ? 'West'
        : state.toLowerCase().includes('kar')
        ? 'South-West'
        : state.toLowerCase().includes('tamil') || state.toLowerCase().includes('kerala')
        ? 'South'
        : state.toLowerCase().includes('odisha') || state.toLowerCase().includes('bengal') || state.toLowerCase().includes('assam')
        ? 'East'
        : 'North';

    const newApp = {
      id: 'app-' + Date.now(),
      appNumber: appId,
      institutionName: lockedInstName,
      institutionCode: user.employeeCode || `1-${Math.floor(10000000 + Math.random() * 90000000)}`,
      owner: 'inst-' + (user.userId || 'custom'),
      ownerUserId: user.userId,
      ownerEmail: lockedEmail,
      contactEmail: lockedEmail,
      contact: lockedEmail,
      state,
      city: state,
      region,
      isNewInstitution: true,
      program: course,
      programApplied: course,
      course,
      applicationType: `New Recognition / Approval (${course})`,
      intakeRequested: 120,
      workflowTrack: 'Scrutiny + EVC',
      aphTrack: 'Scrutiny + EVC',
      ruleCode: 'APH-2026-TRK2',
      currentStage: 'Scrutiny',
      stageNumeric: 1,
      stage: 1,
      stageOrder: ['Scrutiny', 'Re-Scrutiny', 'EVC Inspection', 'Competent Authority Review', 'Approved (EoA/LoA)'],
      status: 'Under Review',
      priority: 'High',
      dueDate: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
      assignedRole: 'Regional Officer',
      assignedSubRole: 'Scrutiny Officer',
      assignedOfficer: 'Dr. Vikramaditya Kulkarni',
      daysInStage: 0,
      totalAgeingDays: 0,
      slaLimitDays: this.state.portalCfg?.sla?.[1] || 3,
      slaStatus: 'On Track',
      submittedDate: new Date().toISOString().slice(0, 10),
      submitted: todayFormatted,
      docs: docsChecked || [],
      returnNote: '',
      scrutinyScore: 90,
      scrutinyRemarks: 'Submitted online by Institution; queued for Regional Scrutiny.',
      scrutinySummary: `Submitted online by ${lockedInstName} with ${(docsChecked || []).length} prescribed documents verified.`,
      scrutinyOutcome: 'Pending Scrutiny',
      evcScore: 85,
      evcRecommendation: 'Pending EVC',
      sacRecommendation: 'N/A',
      deficiencyReasons: '',
      authorityDecision: 'Pending Workflow Completion',
      electronicCaseSummary: `${lockedInstName} applied for ${course} approval in ${state} (${(docsChecked || []).length} statutory documents attached).`,
      history: [
        {
          stage: 'Submitted',
          actor: 'Institution',
          date: todayFormatted,
          note: `Initial application submitted with ${(docsChecked || []).length} verified documents.`
        }
      ]
    };

    this.state.applications.unshift(newApp);

    const aud = this.appendAudit({
      actorName: lockedInstName,
      statementRole: user.statementRole || 'Institution',
      subRole: user.subRole || 'Institution (Applicant)',
      actionType: 'Submitted',
      appNumber: appId,
      stageFrom: 'Draft',
      stageTo: 'Scrutiny',
      authMethod: user.loginMethod || 'Session Token',
      remarks: `Submitted application for ${course} (${state}) with ${(docsChecked || []).length} required documents.`
    });

    this.saveState(null, aud);
    return newApp;
  }

  resubmitInstitutionApplication(appId, noteText = '') {
    const app = this.state.applications.find((a) => a.id === appId || a.appNumber === appId);
    if (!app) return null;

    const user = this.state.currentUser;
    if (!user || !belongsToInstitutionAccount(app, user)) return null;

    const prevStage = app.currentStage;
    const todayFormatted = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    const note = noteText || 'Rectified deficiency documents and compliance affidavit uploaded by Institution.';

    app.status = 'Under Review';
    app.returnNote = '';
    app.deficiencyReasons = '';
    app.daysInStage = 0;
    app.currentStage = 'Scrutiny';
    app.stageNumeric = 1;
    app.stage = 1;
    app.slaStatus = 'On Track';
    app.assignedRole = 'Regional Officer';
    app.assignedSubRole = 'Scrutiny Officer';

    if (!Array.isArray(app.history)) app.history = [];
    app.history.push({
      stage: 'Resubmitted',
      actor: 'Institution',
      date: todayFormatted,
      note
    });

    const aud = this.appendAudit({
      actorName: app.institutionName,
      statementRole: user.statementRole || 'Institution',
      subRole: user.subRole || 'Institution (Applicant)',
      actionType: 'Resubmitted',
      appNumber: app.appNumber,
      stageFrom: prevStage,
      stageTo: 'Scrutiny (Re-Scrutiny)',
      authMethod: user.loginMethod || 'Session Token',
      remarks: note
    });

    this.saveState(null, aud);
    return app;
  }

  // ==========================================================================
  // DASHBOARD 6: SYSTEM ADMIN CONFIGURATION & USER MANAGEMENT ACTIONS
  // ==========================================================================
  saveAdminTimelines(slaInput) {
    const user = this.state.currentUser;
    if (!user || user.subRole !== 'System Admin') return null;
    this.state.portalCfg = this.state.portalCfg || JSON.parse(JSON.stringify(INITIAL_PORTAL_CFG));
    if (Array.isArray(slaInput)) {
      this.state.portalCfg.sla = {
        1: Math.max(1, parseInt(slaInput[0], 10) || 3),
        2: Math.max(1, parseInt(slaInput[1], 10) || 5),
        3: Math.max(1, parseInt(slaInput[2], 10) || 5),
        4: Math.max(1, parseInt(slaInput[3], 10) || 10),
        5: Math.max(1, parseInt(slaInput[4], 10) || 7)
      };
    } else if (slaInput && typeof slaInput === 'object') {
      this.state.portalCfg.sla = {
        1: Math.max(1, parseInt(slaInput[1], 10) || 3),
        2: Math.max(1, parseInt(slaInput[2], 10) || 5),
        3: Math.max(1, parseInt(slaInput[3], 10) || 5),
        4: Math.max(1, parseInt(slaInput[4], 10) || 10),
        5: Math.max(1, parseInt(slaInput[5], 10) || 7)
      };
    }

    const summaryStr = [1, 2, 3, 4, 5].map((s) => `${this.state.portalCfg.sla[s]}d`).join(', ');
    const aud = this.appendAudit({
      actorName: user.fullName,
      statementRole: user.statementRole,
      subRole: user.subRole,
      actionType: 'Updated stage timelines',
      appNumber: 'GLOBAL-SLA',
      stageFrom: 'Rules & Timelines',
      stageTo: `SLAs: ${summaryStr}`,
      authMethod: user.loginMethod || 'Session Token',
      remarks: `Updated stage timelines (Scrutiny, Regional, Bureau, Committee, Authority): ${summaryStr}`
    });

    this.saveState(null, aud);
    return this.state.portalCfg;
  }

  addAdminRequiredDoc(docName) {
    if (!docName || !docName.trim()) return;
    const user = this.state.currentUser;
    if (!user || user.subRole !== 'System Admin') return;
    this.state.portalCfg = this.state.portalCfg || JSON.parse(JSON.stringify(INITIAL_PORTAL_CFG));
    this.state.portalCfg.docs.push(docName.trim());

    this.appendAudit({
      actorName: user.fullName,
      statementRole: user.statementRole,
      subRole: user.subRole,
      actionType: 'Added required doc',
      appNumber: 'System',
      stageFrom: 'Required Documents',
      stageTo: docName.trim(),
      authMethod: user.loginMethod || 'Session Token',
      remarks: docName.trim()
    });

    this.saveState();
  }

  removeAdminRequiredDoc(index) {
    const user = this.state.currentUser;
    if (!user || user.subRole !== 'System Admin') return;
    this.state.portalCfg = this.state.portalCfg || JSON.parse(JSON.stringify(INITIAL_PORTAL_CFG));
    const removed = this.state.portalCfg.docs.splice(index, 1)[0];
    if (!removed) return;

    this.appendAudit({
      actorName: user.fullName,
      statementRole: user.statementRole,
      subRole: user.subRole,
      actionType: 'Removed required doc',
      appNumber: 'System',
      stageFrom: removed,
      stageTo: 'Removed',
      authMethod: user.loginMethod || 'Session Token',
      remarks: removed
    });

    this.saveState();
  }

  addAdminCourse(courseName) {
    if (!courseName || !courseName.trim()) return;
    const user = this.state.currentUser;
    if (!user || user.subRole !== 'System Admin') return;
    this.state.portalCfg = this.state.portalCfg || JSON.parse(JSON.stringify(INITIAL_PORTAL_CFG));
    this.state.portalCfg.courses.push(courseName.trim());

    this.appendAudit({
      actorName: user.fullName,
      statementRole: user.statementRole,
      subRole: user.subRole,
      actionType: 'Added course',
      appNumber: 'System',
      stageFrom: 'Courses Offered',
      stageTo: courseName.trim(),
      authMethod: user.loginMethod || 'Session Token',
      remarks: courseName.trim()
    });

    this.saveState();
  }

  removeAdminCourse(index) {
    const user = this.state.currentUser;
    if (!user || user.subRole !== 'System Admin') return;
    this.state.portalCfg = this.state.portalCfg || JSON.parse(JSON.stringify(INITIAL_PORTAL_CFG));
    const removed = this.state.portalCfg.courses.splice(index, 1)[0];
    if (!removed) return;

    this.appendAudit({
      actorName: user.fullName,
      statementRole: user.statementRole,
      subRole: user.subRole,
      actionType: 'Removed course',
      appNumber: 'System',
      stageFrom: removed,
      stageTo: 'Removed',
      authMethod: user.loginMethod || 'Session Token',
      remarks: removed
    });

    this.saveState();
  }

  // ==========================================================================
  // PART A: END-TO-END WORKFLOW AUTOMATION & ROUTING
  // ==========================================================================
  advanceApplicationStage(appId, { actionDecision, remarks, authMethodUsed, conditionText }) {
    const app = this.state.applications.find((a) => a.id === appId || a.appNumber === appId);
    if (!app) return null;

    const user = this.state.currentUser;
    if (!user) return null;
    const prevStage = app.currentStage;
    const todayFormatted = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

    if (actionDecision === 'REVERT_DEFICIENCY') {
      app.currentStage = 'Reverted for Deficiency';
      app.stageNumeric = -1;
      app.stage = -1;
      app.status = 'Returned';
      app.returnNote = remarks || 'Returned for deficiency clarification & mandatory document re-upload.';
      app.slaStatus = 'Overdue / Escalated';
      app.deficiencyReasons = app.returnNote;
      app.authorityDecision = `Reverted by ${user.subRole}: ${app.deficiencyReasons}`;
      app.daysInStage = 0;

      this.state.alerts.unshift({
        id: 'alt-' + Date.now(),
        alertCode: 'ALT-REV-' + Math.floor(100 + Math.random() * 899),
        severity: 'High',
        category: 'Stage Pendency SLA',
        title: `Application Reverted for Deficiency: ${app.appNumber}`,
        message: `${app.institutionName} returned by ${user.fullName} (${user.subRole}). Reason: ${app.deficiencyReasons}`,
        appNumber: app.appNumber,
        institutionName: app.institutionName,
        contactEmail: app.contactEmail,
        region: app.region,
        targetStatementRole: 'Both',
        targetSubRole: user.subRole,
        escalatedFrom: `${user.statementRole} (${user.subRole})`,
        escalatedTo: 'Institution & Scrutiny Queue',
        isAcknowledged: false,
        createdAt: new Date().toISOString().slice(0, 16).replace('T', ' ')
      });
    } else if (actionDecision === 'ROUTE_TO_SAC') {
      app.currentStage = 'SAC/SHC Hearing';
      app.stageNumeric = 4;
      app.stage = 4;
      app.status = 'Under Review';
      app.assignedRole = 'Committee';
      app.assignedSubRole = 'SAC/SHC Member';
      app.assignedOfficer = 'Justice (Retd.) Meenakshi Sundaram';
      app.daysInStage = 1;
      app.slaStatus = 'On Track';
      app.evcRecommendation = remarks || 'Deficiencies noted in EVC; routed automatically to SAC/SHC Hearing Bench.';

      const existingSac = this.state.sacHearings.find((s) => s.appNumber === app.appNumber);
      if (!existingSac) {
        this.state.sacHearings.unshift({
          id: 'sac-' + Date.now(),
          appNumber: app.appNumber,
          institutionName: app.institutionName,
          region: app.region,
          committeeType: 'SAC (Standing Appellate Committee)',
          hearingDate: '2026-10-26',
          benchChair: 'Justice (Retd.) Meenakshi Sundaram',
          coreDeficiencies: remarks || app.deficiencyReasons || 'Referred from EVC for deficiency hearing.',
          institutionRepresentation: 'Awaiting institution representation & compliance docket upload.',
          benchObservations: 'Auto-routed from EVC Inspection under APH Track.',
          benchRecommendation: 'Pending Hearing',
          status: 'Scheduled'
        });
      }
    } else if (actionDecision === 'FORWARD_TO_CA') {
      app.currentStage = 'Competent Authority Review';
      app.stageNumeric = 5;
      app.stage = 5;
      app.status = 'Under Review';
      app.assignedRole = 'Competent Authority';
      app.assignedSubRole = app.isNewInstitution ? 'Chairman' : 'Member Secretary';
      app.assignedOfficer = app.isNewInstitution ? 'Prof. T. G. Sitharam' : 'Prof. Rajive Kumar, IAS';
      app.daysInStage = 1;
      app.slaStatus = 'On Track';
      if (user.subRole === 'EVC Member') {
        app.evcRecommendation = remarks || 'EVC verification passed; forwarded to Competent Authority.';
      } else {
        app.sacRecommendation = remarks || 'SAC Bench hearing completed; recommended to Competent Authority.';
      }
    } else if (actionDecision === 'APPROVE_FINAL') {
      app.currentStage = 'Approved (EoA/LoA)';
      app.stageNumeric = 6;
      app.stage = 6;
      app.status = 'Approved';
      app.returnNote = '';
      app.deficiencyReasons = '';
      app.slaStatus = 'On Track';
      app.authorityDecision = `Approved (EoA/LoA Issued) by ${user.fullName} (${user.subRole}) — ${remarks || 'All APH 2026 norms satisfied.'}`;
      app.daysInStage = 0;
    } else if (actionDecision === 'APPROVE_CONDITIONAL') {
      app.currentStage = 'Conditional Approval';
      app.stageNumeric = 6;
      app.stage = 6;
      app.status = 'Approved';
      app.slaStatus = 'On Track';
      const condDetails = conditionText || remarks || 'Submit compliance evidence within 60 days as prescribed under APH Chapter VII.';
      app.authorityDecision = `Conditional Approval Granted Subject to Time-Bound Undertaking by ${user.fullName}`;

      this.state.undertakings.unshift({
        id: 'und-' + Date.now(),
        undertakingCode: `UND-2026-${app.region.slice(0, 2).toUpperCase()}-${Math.floor(100 + Math.random() * 899)}`,
        appNumber: app.appNumber,
        institutionName: app.institutionName,
        contactEmail: app.contactEmail,
        region: app.region,
        conditionCategory: 'Conditional Approval Undertaking',
        prescribedCondition: condDetails,
        approvalGrantedDate: '2026-10-22',
        dueDate: '2026-12-21',
        daysRemaining: 60,
        evidenceSubmitted: false,
        evidenceDocumentName: null,
        evidenceSubmittedAt: null,
        verificationStatus: 'Awaiting Submission',
        verifiedBy: null,
        escalatedTo: null,
        remarks: `Created automatically upon Conditional Approval by ${user.fullName} (${user.subRole}).`
      });
    }

    if (!Array.isArray(app.history)) app.history = [];
    app.history.push({
      stage: app.currentStage,
      actor: user.subRole,
      date: todayFormatted,
      note: remarks || `Transitioned via ${actionDecision}`
    });

    app.electronicCaseSummary = `[Auto-Updated ${new Date().toLocaleTimeString()}] Stage moved from "${prevStage}" to "${app.currentStage}" by ${user.fullName} (${user.subRole}). Notes: ${remarks || 'Standard APH workflow transition.'}`;

    this.appendAudit({
      actorName: user.fullName,
      statementRole: user.statementRole,
      subRole: user.subRole,
      actionType: `WORKFLOW_${actionDecision}`,
      appNumber: app.appNumber,
      stageFrom: prevStage,
      stageTo: app.currentStage,
      authMethod: authMethodUsed || user.loginMethod,
      remarks: `${remarks || 'Stage transition executed'} (${app.institutionName})`
    });

    this.saveState();
    return app;
  }

  // ==========================================================================
  // PART C: EVC SCHEDULING, RUBRIC SCORING & ESCALATION
  // ==========================================================================
  submitEvcInspectionReport(evcId, { infraScore, labScore, facultyScore, libraryScore, fieldObservations, recommendation, routeAction, authMethodUsed }) {
    const evc = this.state.evcInspections.find((e) => e.id === evcId);
    if (!evc) return null;

    const user = this.state.currentUser;
    if (!user) return null;
    evc.infraScore = Number(infraScore);
    evc.labScore = Number(labScore);
    evc.facultyScore = Number(facultyScore);
    evc.libraryScore = Number(libraryScore);
    evc.overallScore = Math.round((evc.infraScore + evc.labScore + evc.facultyScore + evc.libraryScore) / 4);
    evc.fieldObservations = fieldObservations;
    evc.recommendation = recommendation;
    evc.status = 'Report Submitted';
    evc.escalatedTo = null;

    const app = this.state.applications.find((a) => a.appNumber === evc.appNumber);
    if (app) {
      app.evcScore = evc.overallScore;
      app.evcRecommendation = `${recommendation} (Composite Score: ${evc.overallScore}/100)`;
      if (routeAction === 'ROUTE_TO_SAC') {
        this.advanceApplicationStage(app.id, {
          actionDecision: 'ROUTE_TO_SAC',
          remarks: `EVC Score ${evc.overallScore}%: ${fieldObservations}`,
          authMethodUsed
        });
      } else {
        this.advanceApplicationStage(app.id, {
          actionDecision: 'FORWARD_TO_CA',
          remarks: `EVC Score ${evc.overallScore}% — ${recommendation}: ${fieldObservations}`,
          authMethodUsed
        });
      }
    } else {
      this.saveState();
    }

    return evc;
  }

  scheduleNewEvcVisit({ appNumber, scheduledDate, inspectionMode, evcChairperson }) {
    const app = this.state.applications.find((a) => a.appNumber === appNumber);
    if (!app) return null;

    const user = this.state.currentUser;
    if (!user) return null;
    const existing = this.state.evcInspections.find((e) => e.appNumber === appNumber);
    if (existing) {
      existing.scheduledDate = scheduledDate;
      existing.inspectionMode = inspectionMode;
      existing.evcChairperson = evcChairperson;
      existing.status = 'Scheduled';
    } else {
      this.state.evcInspections.unshift({
        id: 'evc-' + Date.now(),
        appNumber: app.appNumber,
        institutionName: app.institutionName,
        region: app.region,
        isNewInstitution: app.isNewInstitution,
        scheduledDate,
        slaDueDate: scheduledDate,
        evcChairperson,
        inspectionMode,
        status: 'Scheduled',
        infraScore: 85,
        labScore: 85,
        facultyScore: 85,
        libraryScore: 85,
        overallScore: 85,
        fieldObservations: 'Scheduled via EVC Automation Queue.',
        recommendation: 'Pending Inspection',
        escalatedTo: null
      });
    }

    this.appendAudit({
      actorName: user.fullName,
      statementRole: user.statementRole,
      subRole: user.subRole,
      actionType: 'EVC_VISIT_SCHEDULED',
      appNumber: app.appNumber,
      stageFrom: app.currentStage,
      stageTo: 'EVC Scheduled',
      authMethod: user.loginMethod,
      remarks: `Scheduled ${inspectionMode} for ${app.institutionName} on ${scheduledDate}.`
    });

    this.saveState();
  }

  // ==========================================================================
  // SAC / SHC HEARING BENCH VERDICT
  // ==========================================================================
  recordSacBenchVerdict(sacId, { benchObservations, benchRecommendation, authMethodUsed }) {
    const sac = this.state.sacHearings.find((s) => s.id === sacId);
    if (!sac) return null;

    const user = this.state.currentUser;
    if (!user) return null;
    sac.benchObservations = benchObservations;
    sac.benchRecommendation = benchRecommendation;
    sac.status = 'Forwarded to Competent Authority';

    const app = this.state.applications.find((a) => a.appNumber === sac.appNumber);
    if (app) {
      app.sacRecommendation = `${benchRecommendation}: ${benchObservations}`;
      this.advanceApplicationStage(app.id, {
        actionDecision: benchRecommendation.includes('Reject') ? 'REVERT_DEFICIENCY' : 'FORWARD_TO_CA',
        remarks: `SAC/SHC Bench Verdict (${benchRecommendation}): ${benchObservations}`,
        authMethodUsed
      });
    } else {
      this.saveState();
    }
    return sac;
  }

  // ==========================================================================
  // PART D: TIME-BOUND UNDERTAKINGS & COMPLIANCE VERIFICATION
  // ==========================================================================
  verifyUndertakingCompliance(undId, { decision, remarks, authMethodUsed }) {
    const und = this.state.undertakings.find((u) => u.id === undId);
    if (!und) return null;

    const user = this.state.currentUser;
    if (!user) return null;
    if (decision === 'VERIFY_CLOSE') {
      und.verificationStatus = 'Verified & Closed';
      und.verifiedBy = `${user.fullName} (${user.subRole})`;
      und.escalatedTo = null;
      und.remarks = remarks || 'Supporting compliance evidence verified and undertaking closed.';
    } else if (decision === 'ESCALATE_OVERDUE') {
      und.verificationStatus = 'Overdue - Escalated';
      und.escalatedTo = 'Chairman & Member Secretary (Competent Authority)';
      und.remarks = remarks || 'Escalated due to non-fulfilment beyond stipulated APH timeline.';

      this.state.alerts.unshift({
        id: 'alt-' + Date.now(),
        alertCode: 'ALT-UND-' + Math.floor(100 + Math.random() * 899),
        severity: 'Critical',
        category: 'Undertaking Breach',
        title: `Undertaking Escalated: ${und.undertakingCode} (${und.institutionName})`,
        message: `${und.prescribedCondition} — Escalated by ${user.fullName} (${user.subRole}) for Competent Authority statutory action.`,
        appNumber: und.appNumber,
        institutionName: und.institutionName,
        region: und.region,
        targetStatementRole: 'Competent Authority',
        targetSubRole: 'Chairman',
        escalatedFrom: `${user.statementRole} (${user.subRole})`,
        escalatedTo: 'Chairman & Member Secretary',
        isAcknowledged: false,
        createdAt: new Date().toISOString().slice(0, 16).replace('T', ' ')
      });
    } else if (decision === 'SEND_REMINDER') {
      und.remarks = `[Reminder Sent ${new Date().toLocaleTimeString()}] Automated compliance deadline notice sent to Institution.`;
    } else if (decision === 'INSTITUTION_UPLOAD_EVIDENCE') {
      und.evidenceSubmitted = true;
      und.evidenceDocumentName = remarks || 'Affidavit_Compliance_Evidence_2026.pdf';
      und.evidenceSubmittedAt = new Date().toISOString().slice(0, 10);
      und.verificationStatus = 'Submitted - Pending Verification';
      und.remarks = `Compliance evidence uploaded by Institution (${und.evidenceDocumentName}).`;
    }

    this.appendAudit({
      actorName: user.fullName,
      statementRole: user.statementRole,
      subRole: user.subRole,
      actionType: `UNDERTAKING_${decision}`,
      appNumber: und.appNumber,
      stageFrom: 'Undertaking Compliance',
      stageTo: und.verificationStatus,
      authMethod: authMethodUsed || user.loginMethod,
      remarks: `Undertaking ${und.undertakingCode} (${und.institutionName}): ${und.remarks}`
    });

    this.saveState();
    return und;
  }

  // ==========================================================================
  // PART E: LEASE & PRESCRIBED DOCUMENT VALIDITY MONITORING
  // ==========================================================================
  processDocumentValidityAction(docId, { actionType, newExpiryDate, remarks, authMethodUsed }) {
    const doc = this.state.documents.find((d) => d.id === docId);
    if (!doc) return null;

    const user = this.state.currentUser;
    if (!user) return null;
    if (actionType === 'VERIFY_RENEWAL') {
      doc.validityStatus = 'Valid';
      doc.verificationStatus = `Verified by ${user.subRole}`;
      doc.expiryDate = newExpiryDate || '2036-10-22';
      doc.daysToExpiry = 3650;
      doc.escalatedTo = null;
    } else if (actionType === 'SEND_RENEWAL_NOTICE') {
      doc.alertSent = true;
      doc.verificationStatus = `Renewal Alert Dispatched (${new Date().toLocaleTimeString()})`;
    } else if (actionType === 'INSTITUTION_UPLOAD_RENEWAL') {
      doc.renewalSubmitted = true;
      doc.renewalDocumentName = remarks || `Renewed_${doc.documentType.replace(/\s+/g, '_')}_2026.pdf`;
      doc.verificationStatus = 'Renewal Uploaded - Awaiting Officer Verification';
    } else if (actionType === 'ESCALATE_EXPIRED') {
      doc.validityStatus = 'Expired - Action Required';
      doc.escalatedTo = 'Chairman & Member Secretary (Competent Authority)';
      doc.verificationStatus = 'Escalated to Competent Authority for Show-Cause Notice';

      this.state.alerts.unshift({
        id: 'alt-' + Date.now(),
        alertCode: 'ALT-DOC-' + Math.floor(100 + Math.random() * 899),
        severity: 'Critical',
        category: 'Document Expiry',
        title: `Expired Document Escalated: ${doc.documentType}`,
        message: `${doc.institutionName} (${doc.appNumber}) — ${doc.documentType} (${doc.documentNumber}) expired without verified renewal.`,
        appNumber: doc.appNumber,
        institutionName: doc.institutionName,
        region: doc.region,
        targetStatementRole: 'Competent Authority',
        targetSubRole: 'Member Secretary',
        escalatedFrom: `${user.statementRole} (${user.subRole})`,
        escalatedTo: 'Competent Authority',
        isAcknowledged: false,
        createdAt: new Date().toISOString().slice(0, 16).replace('T', ' ')
      });
    }

    this.appendAudit({
      actorName: user.fullName,
      statementRole: user.statementRole,
      subRole: user.subRole,
      actionType: `DOCUMENT_${actionType}`,
      appNumber: doc.appNumber,
      stageFrom: doc.documentType,
      stageTo: doc.validityStatus,
      authMethod: authMethodUsed || user.loginMethod,
      remarks: `${doc.documentType} (${doc.documentNumber}) for ${doc.institutionName}: ${remarks || doc.verificationStatus}`
    });

    this.saveState();
    return doc;
  }

  // ==========================================================================
  // PART F: ALERTS, ESCALATION & CONFIGURABLE APH RULES
  // ==========================================================================
  acknowledgeAlert(alertId) {
    const alert = this.state.alerts.find((a) => a.id === alertId);
    if (!alert) return;
    const user = this.state.currentUser;
    if (!user) return;
    alert.isAcknowledged = true;
    this.appendAudit({
      actorName: user.fullName,
      statementRole: user.statementRole,
      subRole: user.subRole,
      actionType: 'ALERT_ACKNOWLEDGED',
      appNumber: alert.appNumber || 'GLOBAL',
      stageFrom: 'Unacknowledged Alert',
      stageTo: 'Acknowledged',
      authMethod: user.loginMethod,
      remarks: `Acknowledged alert ${alert.alertCode}: ${alert.title}`
    });
    this.saveState();
  }

  updateAphRule(ruleId, { prescribedSlaDays, warningThresholdDays, isActive }) {
    const rule = this.state.aphRules.find((r) => r.id === ruleId);
    if (!rule) return;
    const user = this.state.currentUser;
    if (!user) return;
    rule.prescribedSlaDays = Number(prescribedSlaDays);
    rule.warningThresholdDays = Number(warningThresholdDays);
    rule.isActive = Boolean(isActive);

    this.appendAudit({
      actorName: user.fullName,
      statementRole: user.statementRole,
      subRole: user.subRole,
      actionType: 'APH_SLA_RULE_UPDATED',
      appNumber: rule.ruleCode,
      stageFrom: 'APH Configuration',
      stageTo: `SLA: ${rule.prescribedSlaDays}d (Warn: ${rule.warningThresholdDays}d)`,
      authMethod: user.loginMethod,
      remarks: `Updated configurable APH 2026 rule ${rule.ruleCode} (${rule.workflowTrack}).`
    });
    this.saveState();
  }

  // ==========================================================================
  // SYSTEM ADMIN USER MANAGEMENT (Persisted in SQLite `users` & `registrations`)
  // ==========================================================================
  async updateAccountRole(accountId, newSubRole) {
    const acc = this.state.accounts.find((a) => String(a.id) === String(accountId) || String(a.userId) === String(accountId));
    const user = this.state.currentUser;
    if (!user || user.subRole !== 'System Admin') return null;

    const prevRole = acc ? acc.subRole : '-';
    try {
      const res = await fetch(`/api/portal/users/${encodeURIComponent(accountId)}`, {
        method: 'PUT',
        headers: this.getAuthHeaders(),
        body: JSON.stringify({ subRole: newSubRole })
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.accounts)) {
          this.state.accounts = data.accounts;
        }
      }
    } catch (_) {}

    this.appendAudit({
      actorName: user.fullName,
      statementRole: user.statementRole,
      subRole: user.subRole,
      actionType: 'user_role_updated',
      appNumber: 'USER-MGMT',
      stageFrom: prevRole,
      stageTo: newSubRole,
      authMethod: user.loginMethod || 'Session Token',
      remarks: `Updated role for ${acc?.email || accountId} from ${prevRole} to ${newSubRole}.`
    });
    this.saveState();
    return acc;
  }

  async toggleAccountActive(accountId, actionOpts = {}) {
    const acc = this.state.accounts.find((a) => String(a.id) === String(accountId) || String(a.userId) === String(accountId));
    const user = this.state.currentUser;
    if (!user || user.subRole !== 'System Admin') return null;

    const nextActive = actionOpts.approve
      ? 1
      : actionOpts.reject
      ? 0
      : acc && acc.isActive === false
      ? 1
      : 0;

    try {
      const res = await fetch(`/api/portal/users/${encodeURIComponent(accountId)}`, {
        method: 'PUT',
        headers: this.getAuthHeaders(),
        body: JSON.stringify({
          is_active: nextActive,
          approve: Boolean(actionOpts.approve),
          reject: Boolean(actionOpts.reject)
        })
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.accounts)) {
          this.state.accounts = data.accounts;
        }
      }
    } catch (_) {}

    this.appendAudit({
      actorName: user.fullName,
      statementRole: user.statementRole,
      subRole: user.subRole,
      actionType: actionOpts.approve
        ? 'member_registration_approved'
        : actionOpts.reject
        ? 'member_registration_rejected'
        : 'user_access_updated',
      appNumber: 'USER-MGMT',
      stageFrom: acc?.regStatus || (acc?.isActive ? 'Active' : 'Inactive'),
      stageTo: actionOpts.reject ? 'Rejected' : nextActive ? 'Active' : 'Inactive',
      authMethod: user.loginMethod || 'Session Token',
      remarks: `${actionOpts.approve ? 'Approved member registration' : actionOpts.reject ? 'Rejected member registration' : nextActive ? 'Activated' : 'Deactivated'} portal account ${acc?.email || accountId}.`
    });
    this.saveState();
    return acc;
  }

  uploadApplicationEvidence(appId, { documentType, fileName, expiryDate, fileObj }) {
    const app = this.state.applications.find((a) => a.id === appId || a.appNumber === appId);
    if (!app) return null;
    const user = this.state.currentUser;
    if (!user) return null;
    const docId = 'doc-' + Date.now() + '-' + Math.random().toString(36).slice(2, 5);
    const blobUrl = fileObj ? URL.createObjectURL(fileObj) : null;
    if (blobUrl) {
      this.mockBlobUrls[docId] = blobUrl;
    }

    const newDoc = {
      id: docId,
      appNumber: app.appNumber,
      institutionName: app.institutionName,
      ownerEmail: user.email,
      region: app.region,
      documentType: documentType || 'Supporting Evidence',
      documentNumber: `DOC-2026-${Math.floor(1000 + Math.random() * 9000)}`,
      originalFilename: fileName || 'uploaded_evidence.pdf',
      issueDate: new Date().toISOString().slice(0, 10),
      expiryDate: expiryDate || '2028-10-23',
      daysToExpiry: 730,
      validityStatus: 'Valid',
      alertSent: false,
      renewalSubmitted: true,
      renewalDocumentName: fileName || 'uploaded_evidence.pdf',
      verificationStatus: 'Verified',
      escalatedTo: null,
      blobUrl
    };

    this.state.documents.unshift(newDoc);
    this.appendAudit({
      actorName: user.fullName,
      statementRole: user.statementRole,
      subRole: user.subRole,
      actionType: 'evidence_uploaded',
      appNumber: app.appNumber,
      stageFrom: documentType,
      stageTo: fileName,
      authMethod: user.loginMethod || 'Session Token',
      remarks: `Uploaded evidence document ${fileName} (${documentType}) for ${app.appNumber}.`
    });
    this.saveState();
    return newDoc;
  }
}

export const backend = new AicteSupabaseBackend();

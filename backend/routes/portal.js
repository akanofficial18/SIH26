// Unified & Secure API for AICTE Authority Portal PS 26262 (/api/portal/*)
// - Enforces JWT authentication from `/login` on every request
// - Locks every user to their own authenticated account (no cross-account switching)
// - Isolates Institution data so each Institution only sees & modifies its own records
// - Isolates per-user dashboard progress in SQLite `user_progress`

const express = require('express');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const { db } = require('../db/init');
const {
  ROLE_TO_PS26262,
  SUBROLE_TO_ROLE_KEY,
  mapUserToAccount
} = require('../services/registration');
require('dotenv').config();

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'gesture_face_auth_secret_key_2026';
const JSON_DB_FILE = path.join(__dirname, '..', 'data', 'aicte_portal_db.json');

function loadMasterPortalState() {
  const row = db.prepare('SELECT state_json FROM ps26262_state WHERE id = 1').get();
  if (row && row.state_json) {
    try {
      return JSON.parse(row.state_json);
    } catch (e) {}
  }
  if (fs.existsSync(JSON_DB_FILE)) {
    try {
      const raw = JSON.parse(fs.readFileSync(JSON_DB_FILE, 'utf8'));
      if (raw && raw.portalState) {
        saveMasterPortalState(raw.portalState);
        return raw.portalState;
      }
    } catch (e) {}
  }
  return null;
}

function saveMasterPortalState(portalState) {
  if (!portalState) return;
  const cleanState = {
    ...portalState,
    currentUser: null,
    userProgressMap: {}
  };
  const jsonStr = JSON.stringify(cleanState);
  const exists = db.prepare('SELECT id FROM ps26262_state WHERE id = 1').get();
  if (exists) {
    db.prepare("UPDATE ps26262_state SET state_json = ?, updated_at = datetime('now') WHERE id = 1").run(jsonStr);
  } else {
    db.prepare('INSERT INTO ps26262_state (id, state_json) VALUES (1, ?)').run(jsonStr);
  }
}

function getAllSafeAccountsFromDb() {
  const rows = db.prepare(`
    SELECT u.id, u.name, u.email, u.created_at,
           p.default_role, p.institution_name, p.designation, p.is_active,
           r.account_type, r.requested_role, r.institution_name AS reg_inst,
           r.aicte_id, r.contact_person, r.employee_id, r.organisation,
           r.designation AS reg_desig, r.phone, r.region, r.status AS reg_status,
           CASE WHEN f.id IS NOT NULL THEN 1 ELSE 0 END AS hasFace
    FROM users u
    LEFT JOIN user_prefs p ON p.user_id = u.id
    LEFT JOIN registrations r ON r.user_id = u.id
    LEFT JOIN face_descriptors f ON f.user_id = u.id
    ORDER BY (r.status = 'Pending') DESC, u.id ASC
  `).all();

  return rows.map((r) => {
    const user = { id: r.id, name: r.name, email: r.email, created_at: r.created_at };
    const prefs = {
      default_role: r.default_role,
      institution_name: r.institution_name,
      designation: r.designation,
      is_active: r.is_active
    };
    const reg = {
      account_type: r.account_type,
      requested_role: r.requested_role,
      institution_name: r.reg_inst,
      aicte_id: r.aicte_id,
      contact_person: r.contact_person,
      employee_id: r.employee_id,
      organisation: r.organisation,
      designation: r.reg_desig,
      phone: r.phone,
      region: r.region,
      status: r.reg_status
    };
    const acc = mapUserToAccount(user, prefs, reg);
    acc.hasFace = r.hasFace;
    return acc;
  });
}

function belongsToInstitution(item, account) {
  if (!item || !account) return false;
  const userEmail = String(account.email || '').trim().toLowerCase();
  const instName = String(account.institutionName || '').trim().toLowerCase();
  const itemInst = String(item.institutionName || '').trim().toLowerCase();

  // If both item and account specify an institutionName, they must match (or be a campus of the same institution)
  if (instName && itemInst) {
    return itemInst === instName || itemInst.startsWith(instName + ' ');
  }

  const itemEmail = String(item.contactEmail || item.contact || item.ownerEmail || '').trim().toLowerCase();
  if (userEmail && itemEmail && itemEmail === userEmail) return true;

  if (item.ownerUserId && String(item.ownerUserId) === String(account.userId)) return true;
  return false;
}

function filterPortalStateForAccount(masterState, account) {
  if (!masterState) return null;
  const copy = JSON.parse(JSON.stringify(masterState));

  if (account.roleKey === 'institution') {
    const myApps = (copy.applications || []).filter((a) => belongsToInstitution(a, account));
    const myAppNumbers = new Set(myApps.map((a) => a.appNumber));
    const myAppIds = new Set(myApps.map((a) => a.id));

    copy.applications = myApps;
    copy.undertakings = (copy.undertakings || []).filter(
      (u) => belongsToInstitution(u, account) || myAppNumbers.has(u.appNumber)
    );
    copy.documents = (copy.documents || []).filter(
      (d) => belongsToInstitution(d, account) || myAppNumbers.has(d.appNumber)
    );
    copy.evcInspections = (copy.evcInspections || []).filter(
      (e) => belongsToInstitution(e, account) || myAppNumbers.has(e.appNumber)
    );
    copy.sacHearings = (copy.sacHearings || []).filter(
      (s) => belongsToInstitution(s, account) || myAppNumbers.has(s.appNumber)
    );
    copy.scrutinyRecords = (copy.scrutinyRecords || []).filter(
      (r) => belongsToInstitution(r, account) || myAppNumbers.has(r.appNumber) || myAppIds.has(r.applicationId)
    );
    copy.committeeReviews = (copy.committeeReviews || []).filter(
      (r) => belongsToInstitution(r, account) || myAppNumbers.has(r.appNumber) || myAppIds.has(r.applicationId)
    );
    copy.alerts = (copy.alerts || []).filter(
      (al) => belongsToInstitution(al, account) || myAppNumbers.has(al.appNumber)
    );
    copy.auditTrail = (copy.auditTrail || []).filter(
      (log) =>
        myAppNumbers.has(log.appNumber) ||
        myAppIds.has(log.appNumber) ||
        String(log.actorName || '').toLowerCase() === String(account.fullName || '').toLowerCase() ||
        String(log.actorName || '').toLowerCase() === String(account.institutionName || '').toLowerCase()
    );
    copy.accounts = [account];
  } else if (account.roleKey === 'system_admin') {
    copy.accounts = getAllSafeAccountsFromDb();
  } else {
    copy.accounts = [account];
  }

  copy.currentUser = account;
  copy.userProgressMap = {};
  return copy;
}

function mergeInstitutionStateIntoMaster(masterState, incomingState, account) {
  const master = masterState ? JSON.parse(JSON.stringify(masterState)) : JSON.parse(JSON.stringify(incomingState));

  // Keep all other institutions' applications intact; update or insert only this institution's applications
  const otherApps = (master.applications || []).filter((a) => !belongsToInstitution(a, account));
  const incomingMyApps = (incomingState.applications || [])
    .filter((a) => belongsToInstitution(a, account))
    .map((a) => ({
      ...a,
      institutionName: account.institutionName || a.institutionName || account.fullName,
      contactEmail: account.email,
      ownerEmail: account.email,
      ownerUserId: account.userId
    }));
  master.applications = [...incomingMyApps, ...otherApps];

  const myAppNumbers = new Set(incomingMyApps.map((a) => a.appNumber));

  // Merge undertakings belonging to this institution
  const otherUnd = (master.undertakings || []).filter(
    (u) => !belongsToInstitution(u, account) && !myAppNumbers.has(u.appNumber)
  );
  const incomingMyUnd = (incomingState.undertakings || []).filter(
    (u) => belongsToInstitution(u, account) || myAppNumbers.has(u.appNumber)
  );
  master.undertakings = [...incomingMyUnd, ...otherUnd];

  // Merge documents belonging to this institution
  const otherDocs = (master.documents || []).filter(
    (d) => !belongsToInstitution(d, account) && !myAppNumbers.has(d.appNumber)
  );
  const incomingMyDocs = (incomingState.documents || [])
    .filter((d) => belongsToInstitution(d, account) || myAppNumbers.has(d.appNumber))
    .map((d) => ({
      ...d,
      institutionName: account.institutionName || d.institutionName || account.fullName,
      ownerEmail: account.email
    }));
  master.documents = [...incomingMyDocs, ...otherDocs];

  // Merge audit trail entries (prepend new ones that aren't in master)
  const existingAuditIds = new Set((master.auditTrail || []).map((l) => l.id));
  const newAuditEntries = (incomingState.auditTrail || []).filter((l) => l.id && !existingAuditIds.has(l.id));
  master.auditTrail = [...newAuditEntries, ...(master.auditTrail || [])].slice(0, 500);

  return master;
}

// ─────────────────────────────────────────────────────────────────────────────
// AUTHENTICATION MIDDLEWARE (Requires Valid Bearer Token from /login)
// ─────────────────────────────────────────────────────────────────────────────
router.use((req, res, next) => {
  const h = req.headers.authorization || '';
  if (!h.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required. Please sign in at /login.' });
  }
  let decoded;
  try {
    decoded = jwt.verify(h.slice(7), JWT_SECRET);
  } catch (e) {
    return res.status(401).json({ error: 'Session expired or invalid token. Please sign in again.' });
  }

  const user = db.prepare('SELECT id, name, email, created_at FROM users WHERE id = ?').get(decoded.userId);
  if (!user) {
    return res.status(401).json({ error: 'Account not found. Please sign in again.' });
  }

  let prefs = db.prepare('SELECT * FROM user_prefs WHERE user_id = ?').get(user.id);
  if (!prefs) {
    db.prepare('INSERT INTO user_prefs (user_id, default_role, institution_name, designation, is_active) VALUES (?,?,?,?,1)')
      .run(user.id, 'institution', user.name, `Authorized Signatory — ${user.name}`);
    prefs = db.prepare('SELECT * FROM user_prefs WHERE user_id = ?').get(user.id);
  }
  const reg = db.prepare('SELECT * FROM registrations WHERE user_id = ?').get(user.id);

  if (prefs.is_active === 0 || (reg && reg.status !== 'Active')) {
    const msg =
      reg && reg.status === 'Pending'
        ? 'Your AICTE Member registration is awaiting System Admin approval.'
        : reg && reg.status === 'Rejected'
        ? 'Your member registration was not approved by the System Admin.'
        : 'Your portal account has been deactivated by the System Admin.';
    return res.status(403).json({ error: msg });
  }

  req.user = user;
  req.prefs = prefs;
  req.reg = reg;
  req.account = mapUserToAccount(user, prefs, reg);
  next();
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/portal/state
// Returns isolated portal state & isolated user progress for the authenticated user
// ─────────────────────────────────────────────────────────────────────────────
router.get('/state', (req, res) => {
  const masterState = loadMasterPortalState();
  const filteredState = filterPortalStateForAccount(masterState, req.account);

  const progRow = db.prepare('SELECT progress_json FROM user_progress WHERE user_id = ?').get(req.user.id);
  let myProgress = null;
  if (progRow && progRow.progress_json) {
    try {
      myProgress = JSON.parse(progRow.progress_json);
    } catch (e) {}
  }

  res.json({
    success: true,
    me: req.account,
    portalState: filteredState,
    userProgress: myProgress,
    savedAt: new Date().toISOString()
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/portal/state
// Saves isolated user progress and authorized state updates
// ─────────────────────────────────────────────────────────────────────────────
router.post('/state', (req, res) => {
  const body = req.body || {};

  // 1. Save ONLY the authenticated user's own UI progress
  if (body.userProgress && typeof body.userProgress === 'object') {
    const existingRow = db.prepare('SELECT progress_json FROM user_progress WHERE user_id = ?').get(req.user.id);
    let mergedProg = {};
    if (existingRow && existingRow.progress_json) {
      try {
        mergedProg = JSON.parse(existingRow.progress_json);
      } catch (e) {}
    }
    mergedProg = {
      ...mergedProg,
      ...body.userProgress,
      updatedAt: new Date().toISOString()
    };
    const exists = db.prepare('SELECT 1 x FROM user_progress WHERE user_id = ?').get(req.user.id);
    if (exists) {
      db.prepare("UPDATE user_progress SET progress_json = ?, updated_at = datetime('now') WHERE user_id = ?")
        .run(JSON.stringify(mergedProg), req.user.id);
    } else {
      db.prepare('INSERT INTO user_progress (user_id, email, progress_json) VALUES (?, ?, ?)')
        .run(req.user.id, req.user.email, JSON.stringify(mergedProg));
    }
  }

  // 2. Save portalState updates according to user's role permissions
  if (body.portalState && typeof body.portalState === 'object') {
    const currentMaster = loadMasterPortalState();

    if (req.account.roleKey === 'auditor') {
      // Auditor is strictly read-only — never mutate master portalState
    } else if (req.account.roleKey === 'institution') {
      const mergedMaster = mergeInstitutionStateIntoMaster(currentMaster, body.portalState, req.account);
      saveMasterPortalState(mergedMaster);
    } else {
      // Authorized AICTE Officer / Committee / Authority / System Admin
      const nextMaster = {
        ...(currentMaster || {}),
        ...body.portalState,
        currentUser: null,
        userProgressMap: {}
      };
      saveMasterPortalState(nextMaster);
    }
  }

  if (body.activityEntry) {
    db.prepare('INSERT INTO audit_logs (actor_email, actor_role, action, application_id, details) VALUES (?,?,?,?,?)')
      .run(
        req.user.email,
        req.account.subRole,
        body.activityEntry.actionType || 'DASHBOARD_ACTION',
        body.activityEntry.appNumber || null,
        JSON.stringify(body.activityEntry)
      );
  }

  const progRow = db.prepare('SELECT progress_json FROM user_progress WHERE user_id = ?').get(req.user.id);
  let myProgress = null;
  if (progRow && progRow.progress_json) {
    try {
      myProgress = JSON.parse(progRow.progress_json);
    } catch (e) {}
  }

  res.json({
    success: true,
    savedAt: new Date().toLocaleTimeString(),
    userProgress: myProgress
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/portal/users/:id  (System Admin Only: Approve/Reject/Activate/Assign Role)
// ─────────────────────────────────────────────────────────────────────────────
router.put('/users/:id', (req, res) => {
  if (req.account.roleKey !== 'system_admin') {
    return res.status(403).json({ error: 'Only System Admin can manage user accounts and roles.' });
  }

  const rawId = String(req.params.id || '').replace(/^usr-/, '');
  const targetUserId = Number(rawId);
  if (!Number.isFinite(targetUserId)) {
    return res.status(400).json({ error: 'Invalid user ID' });
  }

  const targetUser = db.prepare('SELECT id, name, email FROM users WHERE id = ?').get(targetUserId);
  if (!targetUser) {
    return res.status(404).json({ error: 'User not found' });
  }

  const { subRole, default_role, is_active, approve, reject } = req.body || {};
  const roleKey = default_role || (subRole ? SUBROLE_TO_ROLE_KEY[subRole] : null);

  if (targetUser.id === req.user.id && (is_active === 0 || reject)) {
    return res.status(400).json({ error: 'You cannot deactivate or reject your own System Admin account.' });
  }

  if (!db.prepare('SELECT 1 x FROM user_prefs WHERE user_id = ?').get(targetUser.id)) {
    db.prepare('INSERT INTO user_prefs (user_id, default_role, institution_name, designation, is_active) VALUES (?,?,?,?,1)')
      .run(targetUser.id, roleKey || 'institution', targetUser.name, `${subRole || 'Official'} — AICTE Portal`);
  }

  if (roleKey && ROLE_TO_PS26262[roleKey]) {
    const mapped = ROLE_TO_PS26262[roleKey];
    db.prepare('UPDATE user_prefs SET default_role = ?, designation = ? WHERE user_id = ?')
      .run(roleKey, `${mapped.subRole} — AICTE Portal`, targetUser.id);
    db.prepare('UPDATE registrations SET requested_role = ? WHERE user_id = ?')
      .run(roleKey, targetUser.id);
  }

  if (approve) {
    db.prepare('UPDATE user_prefs SET is_active = 1 WHERE user_id = ?').run(targetUser.id);
    db.prepare("UPDATE registrations SET status = 'Active' WHERE user_id = ?").run(targetUser.id);
  } else if (reject) {
    db.prepare('UPDATE user_prefs SET is_active = 0 WHERE user_id = ?').run(targetUser.id);
    db.prepare("UPDATE registrations SET status = 'Rejected' WHERE user_id = ?").run(targetUser.id);
  } else if (is_active === 0 || is_active === 1) {
    db.prepare('UPDATE user_prefs SET is_active = ? WHERE user_id = ?').run(is_active, targetUser.id);
    db.prepare('UPDATE registrations SET status = ? WHERE user_id = ?')
      .run(is_active === 1 ? 'Active' : 'Inactive', targetUser.id);
  }

  db.prepare('INSERT INTO audit_logs (actor_email, actor_role, action, application_id, details) VALUES (?,?,?,?,?)')
    .run(
      req.user.email,
      req.account.subRole,
      approve ? 'member_approved' : reject ? 'member_rejected' : 'user_updated',
      'USER-MGMT',
      JSON.stringify({ targetEmail: targetUser.email, roleKey, is_active, approve, reject })
    );

  res.json({
    success: true,
    accounts: getAllSafeAccountsFromDb()
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/portal/reset  (System Admin / Competent Authority Only)
// ─────────────────────────────────────────────────────────────────────────────
router.post('/reset', (req, res) => {
  if (!['system_admin', 'member_secretary', 'chairman'].includes(req.account.roleKey)) {
    return res.status(403).json({ error: 'Only System Admin or Competent Authority can reset demo data.' });
  }
  db.prepare('DELETE FROM ps26262_state WHERE id = 1').run();
  if (fs.existsSync(JSON_DB_FILE)) {
    try {
      const raw = JSON.parse(fs.readFileSync(JSON_DB_FILE, 'utf8'));
      if (raw && raw.portalState) {
        saveMasterPortalState(raw.portalState);
      }
    } catch (e) {}
  }
  res.json({ success: true, message: 'Database reset to baseline seed.' });
});

module.exports = router;

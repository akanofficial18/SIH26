// Portal (PS 26262 6-Dashboard) schema + official account & state seeding in SQLite (data/auth.db).
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const STAGES = {
  SUBMITTED: 'Submitted',
  SCRUTINY: 'Scrutiny / Re-Scrutiny',
  DEFICIENCY: 'Deficiency (With Institution)',
  EVC: 'EVC Verification',
  BENCH: 'SAC/SHC Bench',
  AUTHORITY: 'Competent Authority',
  APPROVED: 'Approved',
  REJECTED: 'Rejected'
};

const OFFICIAL_SEED_USERS = [
  {
    email: 'regional.officer@aicte-india.org',
    name: 'Dr. Sneha Patil',
    password: 'Aicte@123',
    accountType: 'member',
    role: 'regional_officer',
    designation: 'Regional Officer — Western & Northern Regional Directorate',
    region: 'West',
    employeeId: 'AICTE-RO-1024',
    organisation: 'AICTE Western Regional Directorate'
  },
  {
    email: 'scrutiny.officer@aicte-india.org',
    name: 'Dr. Vikramaditya Kulkarni',
    password: 'Aicte@123',
    accountType: 'member',
    role: 'scrutiny_officer',
    designation: 'Senior Scrutiny Officer (Regional Directorate)',
    region: 'West',
    employeeId: 'AICTE-SCR-1108',
    organisation: 'AICTE Regional Scrutiny Cell'
  },
  {
    email: 'bureau.head@aicte-india.org',
    name: 'Shri Aniruddha Deshmukh, IRAS',
    password: 'Aicte@123',
    accountType: 'member',
    role: 'bureau_head',
    designation: 'Advisor-I & Head — AICTE Regulation Bureau',
    region: 'All India HQ (New Delhi)',
    employeeId: 'AICTE-BUR-2001',
    organisation: 'AICTE Regulation Bureau HQ'
  },
  {
    email: 'evc.committee@aicte-india.org',
    name: 'Prof. (Dr.) Rajeev Vasudevan',
    password: 'Aicte@123',
    accountType: 'member',
    role: 'evc_member',
    designation: 'Chairperson — Expert Visit Committee (EVC Panel)',
    region: 'All India EVC Panel',
    employeeId: 'AICTE-EVC-4092',
    organisation: 'AICTE Expert Visit Committee'
  },
  {
    email: 'sac.committee@aicte-india.org',
    name: 'Justice (Retd.) Meenakshi Sundaram',
    password: 'Aicte@123',
    accountType: 'member',
    role: 'sac_member',
    designation: 'Presiding Bench Member — Standing Appellate & Hearing Committee (SAC/SHC)',
    region: 'AICTE HQ Hearing Bench',
    employeeId: 'AICTE-SAC-3108',
    organisation: 'AICTE Standing Appellate Committee'
  },
  {
    email: 'membersecretary@aicte-india.org',
    name: 'Prof. Rajive Kumar, IAS',
    password: 'Aicte@123',
    accountType: 'member',
    role: 'member_secretary',
    designation: 'Member Secretary — All India Council for Technical Education',
    region: 'All India HQ (New Delhi)',
    employeeId: 'AICTE-CA-0002',
    organisation: 'AICTE Executive Council'
  },
  {
    email: 'chairman@aicte-india.org',
    name: 'Prof. T. G. Sitharam',
    password: 'Aicte@123',
    accountType: 'member',
    role: 'chairman',
    designation: 'Hon’ble Chairman — All India Council for Technical Education',
    region: 'All India Apex Command (New Delhi)',
    employeeId: 'AICTE-CA-0001',
    organisation: 'AICTE Apex Command'
  },
  {
    email: 'sam123gk7@gmail.com',
    name: 'Mit AOE (Dr. Arvind Deshpande)',
    password: 'password123',
    accountType: 'institution',
    role: 'institution',
    institutionName: 'Mit AOE',
    designation: 'Principal & Authorized Signatory — Mit AOE, Maharashtra',
    region: 'West',
    aicteId: 'INST-MH-1042'
  },
  {
    email: 'principal@sunrise-edu.ac.in',
    name: 'Sunrise Technical & Teacher Training Institute',
    password: 'Aicte@123',
    accountType: 'institution',
    role: 'institution',
    institutionName: 'Sunrise Technical & Teacher Training Institute',
    designation: 'Principal & Authorized Signatory — Sunrise Technical & Teacher Training Institute',
    region: 'West',
    aicteId: 'INST-MH-3115'
  },
  {
    email: 'admin@aicte.gov.in',
    name: 'Portal System Admin (Er. Siddharth Verma)',
    password: 'password123',
    accountType: 'member',
    role: 'system_admin',
    designation: 'Chief Portal Administrator — e-Governance & APH Rule Engine',
    region: 'All India HQ (New Delhi)',
    employeeId: 'AICTE-ADM-9001',
    organisation: 'AICTE e-Governance Division'
  },
  {
    email: 'sysadmin@aicte-india.org',
    name: 'Portal System Admin (Er. Siddharth Verma)',
    password: 'Aicte@123',
    accountType: 'member',
    role: 'system_admin',
    designation: 'Chief Portal Administrator — e-Governance & APH Rule Engine',
    region: 'All India HQ (New Delhi)',
    employeeId: 'AICTE-ADM-9001B',
    organisation: 'AICTE e-Governance Division'
  },
  {
    email: 'auditor@aicte.gov.in',
    name: 'AICTE Audit Officer (CA Rituja Chatterjee)',
    password: 'password123',
    accountType: 'member',
    role: 'auditor',
    designation: 'Independent Regulatory & Vigilance Auditor (Read-Only Role)',
    region: 'All India Vigilance & Audit Cell',
    employeeId: 'AICTE-AUD-9002',
    organisation: 'AICTE Vigilance & Audit Cell'
  },
  {
    email: 'auditor@aicte-india.org',
    name: 'AICTE Audit Officer (CA Rituja Chatterjee)',
    password: 'Aicte@123',
    accountType: 'member',
    role: 'auditor',
    designation: 'Independent Regulatory & Vigilance Auditor (Read-Only Role)',
    region: 'All India Vigilance & Audit Cell',
    employeeId: 'AICTE-AUD-9002B',
    organisation: 'AICTE Vigilance & Audit Cell'
  }
];

function initPortal(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_prefs (
      user_id INTEGER PRIMARY KEY,
      default_role TEXT,
      institution_name TEXT,
      designation TEXT,
      is_active INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS ps26262_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      state_json TEXT NOT NULL,
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS user_progress (
      user_id INTEGER PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      progress_json TEXT NOT NULL,
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      actor_email TEXT,
      actor_role TEXT,
      action TEXT NOT NULL,
      application_id TEXT,
      details TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // Seed official PS 26262 accounts into SQLite `users`, `user_prefs`, and `registrations` if not present
  const hashAicte = bcrypt.hashSync('Aicte@123', 10);
  const hashPass123 = bcrypt.hashSync('password123', 10);

  for (const acc of OFFICIAL_SEED_USERS) {
    const email = acc.email.toLowerCase();
    let existing = db.prepare('SELECT id FROM users WHERE LOWER(email) = ?').get(email);
    const pwHash = acc.password === 'password123' ? hashPass123 : hashAicte;
    let userId;
    if (!existing) {
      const res = db.prepare('INSERT INTO users (name, email, password_hash, is_verified) VALUES (?, ?, ?, 1)')
        .run(acc.name, email, pwHash);
      userId = res.lastInsertRowid;
    } else {
      userId = existing.id;
    }

    const pref = db.prepare('SELECT user_id FROM user_prefs WHERE user_id = ?').get(userId);
    if (!pref) {
      db.prepare('INSERT INTO user_prefs (user_id, default_role, institution_name, designation, is_active) VALUES (?, ?, ?, ?, 1)')
        .run(userId, acc.role, acc.institutionName || acc.organisation || 'AICTE', acc.designation);
    }

    const reg = db.prepare('SELECT user_id FROM registrations WHERE user_id = ?').get(userId);
    if (!reg) {
      db.prepare(`INSERT INTO registrations (user_id, account_type, requested_role, institution_name, aicte_id, contact_person, employee_id, organisation, designation, phone, region, status)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Active')`)
        .run(
          userId,
          acc.accountType,
          acc.role,
          acc.institutionName || null,
          acc.aicteId || null,
          acc.accountType === 'institution' ? acc.name : null,
          acc.employeeId || null,
          acc.organisation || null,
          acc.designation,
          null,
          acc.region || 'All India HQ'
        );
    }
  }

  // Seed initial PS 26262 portal state from backend/data/aicte_portal_db.json if not yet in SQLite
  const existingState = db.prepare('SELECT id FROM ps26262_state WHERE id = 1').get();
  if (!existingState) {
    const seedFile = path.join(__dirname, '..', 'data', 'aicte_portal_db.json');
    if (fs.existsSync(seedFile)) {
      try {
        const raw = JSON.parse(fs.readFileSync(seedFile, 'utf8'));
        if (raw && raw.portalState) {
          // Ensure each seeded application belongs cleanly to its own institution account
          const apps = (raw.portalState.applications || []).map((a) => {
            if (a.id === 'app-101') {
              return { ...a, institutionName: 'Mit AOE', contactEmail: 'sam123gk7@gmail.com', ownerEmail: 'sam123gk7@gmail.com' };
            }
            if (a.id === 'app-102') {
              return { ...a, contactEmail: 'principal@kaveri.edu.in', ownerEmail: 'principal@kaveri.edu.in' };
            }
            if (a.id === 'app-108') {
              return { ...a, contactEmail: 'principal@deccankakatiya.edu.in', ownerEmail: 'principal@deccankakatiya.edu.in' };
            }
            return a;
          });
          const cleanState = { ...raw.portalState, applications: apps, currentUser: null, userProgressMap: {} };
          db.prepare('INSERT INTO ps26262_state (id, state_json) VALUES (1, ?)').run(JSON.stringify(cleanState));
          console.log('[Portal] Seeded PS 26262 dashboard state into SQLite database.');
        }
      } catch (e) {
        console.warn('[Portal] Could not load initial JSON seed:', e.message);
      }
    }
  }

  return db;
}

module.exports = { initPortal, STAGES, OFFICIAL_SEED_USERS };

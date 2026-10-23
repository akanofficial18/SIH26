// Registration profiles: two separate sign-up paths.
//   institution -> applicant college; active immediately; Institution workspace only.
//   member      -> AICTE officer / committee member; held "Pending" until the System Admin approves.
// Self-service sign-up can NEVER create a System Admin or Auditor (admin-assigned only).

const MEMBER_ROLES = {
  evc_member:       'EVC Member (Expert Visit Committee)',
  sac_member:       'SAC / SHC Member (Standing Appellate / Hearing Committee)',
  shc_member:       'SHC Member (Standing Hearing Committee)',
  scrutiny_officer: 'Scrutiny Officer',
  regional_officer: 'Regional Officer',
  bureau_officer:   'Bureau Officer / Head',
  bureau_head:      'Bureau Head (Regulation Bureau)',
  member_secretary: 'Member Secretary (Competent Authority)',
  chairman:         'Chairman (Competent Authority)'
};

const ROLE_TO_PS26262 = {
  institution: {
    statementRole: 'Institution',
    subRole: 'Institution (Applicant)',
    clearanceLevel: 'Applicant Institution Portal',
    permissions: [
      'Submit New Application for Approval / Recognition with Document Checklist',
      'Track Live 6-Stage Application Progress & Stage Ageing',
      'Fix Deficiencies & Resubmit Returned Applications',
      'Upload Time-Bound Undertaking Proof & Renewed Lease Documents'
    ]
  },
  regional_officer: {
    statementRole: 'Regional Officer',
    subRole: 'Regional Officer',
    clearanceLevel: 'Level-3 Regional Directorate',
    permissions: [
      'Monitor Regional Application Queue & Priorities',
      'Inspect EVC Reviews & Scrutiny Observations in Oversight Panel',
      'Trigger Overdue Follow-Up & Forward Files to Bureau / EVC',
      'Verify Regional Undertaking & Lease Renewals'
    ]
  },
  scrutiny_officer: {
    statementRole: 'Regional Officer',
    subRole: 'Scrutiny Officer',
    clearanceLevel: 'Level-3 Document Scrutiny',
    permissions: [
      'Open Applications for Initial & Re-Scrutiny Verification',
      'Record Detailed Scrutiny Observations & Deficiencies',
      'Mark Outcome: Scrutiny Complete, Deficiency Found, or Forward for Committee Review',
      'Return Deficient Applications to Institution with Recorded Reasons'
    ]
  },
  bureau_officer: {
    statementRole: 'Bureau Officer',
    subRole: 'Bureau Officer / Head',
    clearanceLevel: 'Level-4 Regulation Bureau',
    permissions: [
      'National Application Oversight Across All 8 AICTE Regions',
      'Track High-Priority & Overdue Cases with Direct Follow-Up',
      'Review EVC Recommendations & Scrutiny Dossiers Before Authority Routing',
      'Coordinate Inter-Regional Workload & Escalations'
    ]
  },
  bureau_head: {
    statementRole: 'Bureau Officer',
    subRole: 'Bureau Officer / Head',
    clearanceLevel: 'Level-4 Regulation Bureau Head',
    permissions: [
      'National Application Oversight Across All 8 AICTE Regions',
      'Track High-Priority & Overdue Cases with Direct Follow-Up',
      'Review EVC Recommendations & Scrutiny Dossiers Before Authority Routing',
      'Coordinate Inter-Regional Workload & Escalations'
    ]
  },
  evc_member: {
    statementRole: 'Committee',
    subRole: 'EVC Member',
    clearanceLevel: 'Level-4 Technical Inspection Committee',
    permissions: [
      'Execute EVC Field & Geo-Tagged Inspections',
      'Submit Infrastructure, Lab, Faculty & Library Rubric Scores',
      'Record Committee Review (Recommend Approval / Clarification / Further Review)',
      'Route Verified Files to Competent Authority or SAC/SHC'
    ]
  },
  sac_member: {
    statementRole: 'Committee',
    subRole: 'SAC/SHC Member',
    clearanceLevel: 'Level-4 Appellate Hearing Bench',
    permissions: [
      'Conduct SAC / SHC Institutional Appeal Hearings',
      'Evaluate Deficiency Clarifications & Lease Rectification Proofs',
      'Recommend Conditional Approval with Undertakings',
      'Forward Bench Verdict to Competent Authority'
    ]
  },
  shc_member: {
    statementRole: 'Committee',
    subRole: 'SAC/SHC Member',
    clearanceLevel: 'Level-4 Appellate Hearing Bench',
    permissions: [
      'Conduct SAC / SHC Institutional Appeal Hearings',
      'Evaluate Deficiency Clarifications & Lease Rectification Proofs',
      'Recommend Conditional Approval with Undertakings',
      'Forward Bench Verdict to Competent Authority'
    ]
  },
  member_secretary: {
    statementRole: 'Competent Authority',
    subRole: 'Member Secretary',
    clearanceLevel: 'Level-5 Statutory Competent Authority',
    permissions: [
      'Approve / Revert Applications Across All 8 Regions',
      'Issue Conditional Approvals with Time-Bound Undertakings',
      'Enforce Escalations on Overdue EVCs, Undertakings & Expired Leases',
      'Configure APH Workflow Timelines & SLA Rules'
    ]
  },
  chairman: {
    statementRole: 'Competent Authority',
    subRole: 'Chairman',
    clearanceLevel: 'Level-5 Apex Statutory Authority',
    permissions: [
      'Final Statutory Sign-Off on New Institutions (LoA) & EoA',
      'Executive Override & National Pendency / Bottleneck Command',
      'Final Appellate Adjudication & Show-Cause / Withdrawal Orders',
      'Full Audit Trail & National Compliance Oversight'
    ]
  },
  system_admin: {
    statementRole: 'System Admin',
    subRole: 'System Admin',
    clearanceLevel: 'System Configuration Admin',
    permissions: [
      'Configure Days Allowed per Stage (Scrutiny, Regional, Bureau, Committee, Authority)',
      'Manage Portal Users, Approve Member Registrations & Assign Roles',
      'Manage Prescribed Document Checklist & Approved Courses Offered',
      'Monitor Pipeline Overview & Reset Demo Database'
    ]
  },
  auditor: {
    statementRole: 'Auditor',
    subRole: 'Auditor',
    clearanceLevel: 'Read-Only Statutory Auditor',
    permissions: [
      'Read-Only Access to Complete Immutable Audit Trail',
      'Filter & Search All Actor Actions Across Every Application',
      'End-to-End Application Lifecycle Trace & Stage History',
      'Export Certified Audit Trail CSV Reports'
    ]
  }
};

const SUBROLE_TO_ROLE_KEY = {
  'Institution (Applicant)': 'institution',
  'Regional Officer': 'regional_officer',
  'Scrutiny Officer': 'scrutiny_officer',
  'Bureau Officer / Head': 'bureau_head',
  'EVC Member': 'evc_member',
  'SAC/SHC Member': 'sac_member',
  'Member Secretary': 'member_secretary',
  'Chairman': 'chairman',
  'System Admin': 'system_admin',
  'Auditor': 'auditor'
};

const REGIONS = ['North', 'South', 'West', 'East', 'Central', 'South-West', 'North-West', 'South-Central'];
const clean = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, n);

function parseProfile(body) {
  const type = body.accountType === 'member' ? 'member' : 'institution';
  if (type === 'institution') {
    const institutionName = clean(body.institutionName, 160);
    if (institutionName.length < 3) return { error: 'Please enter the institution name (at least 3 characters).' };
    const aicteId = clean(body.aicteId, 40);
    const contactPerson = clean(body.contactPerson, 80);
    const phone = clean(body.phone, 20);
    if (phone && !/^[0-9+\-\s]{7,20}$/.test(phone)) return { error: 'Enter a valid contact phone number.' };
    return { profile: { type, role: 'institution', institutionName, aicteId, contactPerson, phone, region: clean(body.region, 30) || 'West', status: 'Active' } };
  }
  const role = String(body.requestedRole || '');
  if (!MEMBER_ROLES[role]) return { error: 'Please choose a valid member role.' };
  const employeeId = clean(body.employeeId, 40);
  if (employeeId.length < 3) return { error: 'Please enter your AICTE employee / member ID.' };
  const region = clean(body.region, 30);
  if (region && !REGIONS.includes(region)) return { error: 'Please choose a valid AICTE region.' };
  return { profile: { type, role, employeeId, designation: clean(body.designation, 100), organisation: clean(body.organisation, 120), phone: clean(body.phone, 20), region: region || 'All India HQ', status: 'Pending' } };
}

function applyProfile(db, userId, p) {
  const designation = p.type === 'institution' ? ('Authorized Signatory — ' + p.institutionName) : (p.designation || MEMBER_ROLES[p.role]);
  const old = db.prepare('SELECT user_id FROM user_prefs WHERE user_id = ?').get(userId);
  const active = p.status === 'Active' ? 1 : 0;
  if (old) db.prepare('UPDATE user_prefs SET default_role=?, institution_name=?, designation=?, is_active=? WHERE user_id=?').run(p.role, p.institutionName || p.organisation || 'AICTE', designation, active, userId);
  else db.prepare('INSERT INTO user_prefs (user_id, default_role, institution_name, designation, is_active) VALUES (?,?,?,?,?)').run(userId, p.role, p.institutionName || p.organisation || 'AICTE', designation, active);
  db.prepare('DELETE FROM registrations WHERE user_id = ?').run(userId);
  db.prepare(`INSERT INTO registrations (user_id, account_type, requested_role, institution_name, aicte_id, contact_person, employee_id, organisation, designation, phone, region, status)
              VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(userId, p.type, p.role, p.institutionName || null, p.aicteId || null, p.contactPerson || null, p.employeeId || null, p.organisation || null, designation, p.phone || null, p.region || null, p.status);
}

function getInitials(name) {
  const parts = String(name || 'U').replace(/[^a-zA-Z\s]/g, ' ').trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return (parts[0] || 'U').slice(0, 2).toUpperCase();
}

function mapUserToAccount(user, prefs, reg) {
  const roleKey = (prefs && prefs.default_role) || (reg && reg.requested_role) || 'institution';
  const mapped = ROLE_TO_PS26262[roleKey] || ROLE_TO_PS26262.institution;
  const isInst = roleKey === 'institution';
  const instName = isInst
    ? ((prefs && prefs.institution_name) || (reg && reg.institution_name) || user.name)
    : null;
  const regStatus = (reg && reg.status) || ((prefs && prefs.is_active === 0) ? 'Inactive' : 'Active');
  const isActive = (prefs ? prefs.is_active !== 0 : true) && regStatus === 'Active';

  return {
    id: 'usr-' + user.id,
    userId: user.id,
    email: user.email,
    fullName: user.name,
    name: user.name,
    roleKey,
    statementRole: mapped.statementRole,
    subRole: mapped.subRole,
    designation: (prefs && prefs.designation) || (reg && reg.designation) || `${mapped.subRole} — AICTE Portal`,
    institutionName: instName,
    region: (reg && reg.region) || (isInst ? 'West' : 'All India HQ'),
    employeeCode: (reg && (reg.employee_id || reg.aicte_id)) || `AICTE-USR-${1000 + Number(user.id)}`,
    avatarInitials: getInitials(user.name),
    clearanceLevel: mapped.clearanceLevel,
    permissions: mapped.permissions,
    accountType: (reg && reg.account_type) || (isInst ? 'institution' : 'member'),
    regStatus,
    isActive,
    locked: true
  };
}

module.exports = {
  MEMBER_ROLES,
  ROLE_TO_PS26262,
  SUBROLE_TO_ROLE_KEY,
  REGIONS,
  parseProfile,
  applyProfile,
  mapUserToAccount
};

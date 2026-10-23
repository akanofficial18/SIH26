-- ============================================================================
-- SIH 2026 Problem Statement ID: 26262
-- Title: Integrated AICTE Approval Workflow Automation, Compliance Monitoring
--        and Alert Management System
-- Target Roles: Committee (EVC Member, SAC/SHC Member) &
--               Competent Authority (Member Secretary, Chairman)
-- Backend: Supabase PostgreSQL Schema, RLS Policies, Triggers & Seed Data
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. ROLE PROFILES & BIOMETRIC TEMPLATES TABLE
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    auth_user_id UUID UNIQUE,
    email TEXT UNIQUE NOT NULL,
    full_name TEXT NOT NULL,
    statement_role TEXT NOT NULL CHECK (statement_role IN ('Committee', 'Competent Authority')),
    sub_role TEXT NOT NULL CHECK (sub_role IN ('EVC Member', 'SAC/SHC Member', 'Member Secretary', 'Chairman')),
    designation TEXT NOT NULL,
    region TEXT NOT NULL DEFAULT 'All India HQ (New Delhi)',
    employee_code TEXT UNIQUE NOT NULL,
    face_template_vector JSONB,
    webauthn_credential_id TEXT,
    last_login_method TEXT,
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. APH CONFIGURABLE WORKFLOW & SLA RULES TABLE (Key Requirement: Configurable APH Rules)
CREATE TABLE IF NOT EXISTS public.aph_rules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    rule_code TEXT UNIQUE NOT NULL,
    workflow_track TEXT NOT NULL,
    stage_name TEXT NOT NULL,
    prescribed_sla_days INTEGER NOT NULL,
    warning_threshold_days INTEGER NOT NULL,
    auto_escalate_to TEXT NOT NULL,
    regulatory_reference TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. INSTITUTION APPROVAL APPLICATIONS TABLE (Part A & Part B)
CREATE TABLE IF NOT EXISTS public.applications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    app_number TEXT UNIQUE NOT NULL,
    institution_name TEXT NOT NULL,
    institution_code TEXT NOT NULL,
    region TEXT NOT NULL CHECK (region IN ('North', 'South', 'West', 'East', 'Central', 'South-West', 'North-West', 'South-Central')),
    state TEXT NOT NULL,
    program TEXT NOT NULL,
    application_type TEXT NOT NULL,
    is_new_institution BOOLEAN NOT NULL DEFAULT FALSE,
    workflow_track TEXT NOT NULL CHECK (workflow_track IN ('Only Scrutiny', 'Scrutiny + EVC', 'EVC + SAC/SHC', 'Only EVC')),
    current_stage TEXT NOT NULL CHECK (current_stage IN ('Scrutiny', 'Re-Scrutiny', 'EVC Inspection', 'SAC/SHC Hearing', 'Competent Authority Review', 'Approved (EoA/LoA)', 'Conditional Approval', 'Reverted for Deficiency', 'Rejected')),
    stage_history JSONB NOT NULL DEFAULT '[]'::jsonb,
    days_in_stage INTEGER NOT NULL DEFAULT 1,
    total_ageing_days INTEGER NOT NULL DEFAULT 1,
    sla_limit_days INTEGER NOT NULL DEFAULT 15,
    sla_status TEXT NOT NULL CHECK (sla_status IN ('On Track', 'Approaching Deadline', 'Overdue / Escalated')),
    assigned_role TEXT NOT NULL CHECK (assigned_role IN ('Committee', 'Competent Authority')),
    assigned_sub_role TEXT NOT NULL CHECK (assigned_sub_role IN ('EVC Member', 'SAC/SHC Member', 'Member Secretary', 'Chairman')),
    assigned_officer TEXT NOT NULL,
    scrutiny_summary TEXT,
    evc_score INTEGER DEFAULT 0,
    evc_recommendation TEXT,
    sac_recommendation TEXT,
    deficiency_reasons TEXT,
    authority_decision TEXT,
    electronic_case_summary TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. EXPERT VISIT COMMITTEE (EVC) SCHEDULING & INSPECTIONS TABLE (Part C)
CREATE TABLE IF NOT EXISTS public.evc_inspections (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    app_number TEXT NOT NULL REFERENCES public.applications(app_number) ON DELETE CASCADE,
    institution_name TEXT NOT NULL,
    region TEXT NOT NULL,
    is_new_institution BOOLEAN NOT NULL DEFAULT FALSE,
    scheduled_date DATE NOT NULL,
    sla_due_date DATE NOT NULL,
    evc_chairperson TEXT NOT NULL,
    inspection_mode TEXT NOT NULL DEFAULT 'Physical Field Inspection',
    status TEXT NOT NULL CHECK (status IN ('Queued for Scheduling', 'Scheduled', 'Inspection In Progress', 'Report Submitted', 'Delayed / Escalated')),
    infra_score INTEGER NOT NULL DEFAULT 0,
    lab_score INTEGER NOT NULL DEFAULT 0,
    faculty_score INTEGER NOT NULL DEFAULT 0,
    library_score INTEGER NOT NULL DEFAULT 0,
    overall_score INTEGER NOT NULL DEFAULT 0,
    field_observations TEXT,
    recommendation TEXT,
    escalated_to TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. SAC / SHC STANDING APPELLATE & HEARING COMMITTEE BENCH TABLE (Part A & Committee Role)
CREATE TABLE IF NOT EXISTS public.sac_hearings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    app_number TEXT NOT NULL REFERENCES public.applications(app_number) ON DELETE CASCADE,
    institution_name TEXT NOT NULL,
    region TEXT NOT NULL,
    committee_type TEXT NOT NULL CHECK (committee_type IN ('SAC (Standing Appellate Committee)', 'SHC (Standing Hearing Committee)')),
    hearing_date DATE NOT NULL,
    bench_chair TEXT NOT NULL,
    core_deficiencies TEXT NOT NULL,
    institution_representation TEXT,
    bench_observations TEXT,
    bench_recommendation TEXT CHECK (bench_recommendation IN ('Pending Hearing', 'Recommend Conditional Approval', 'Recommend Full EoA/LoA', 'Upheld Deficiency / Reject', 'Order Re-EVC')),
    status TEXT NOT NULL DEFAULT 'Scheduled',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. TIME-BOUND UNDERTAKINGS & INSTITUTIONAL COMPLIANCE TABLE (Part D)
CREATE TABLE IF NOT EXISTS public.undertakings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    undertaking_code TEXT UNIQUE NOT NULL,
    app_number TEXT NOT NULL REFERENCES public.applications(app_number) ON DELETE CASCADE,
    institution_name TEXT NOT NULL,
    region TEXT NOT NULL,
    condition_category TEXT NOT NULL,
    prescribed_condition TEXT NOT NULL,
    approval_granted_date DATE NOT NULL,
    due_date DATE NOT NULL,
    days_remaining INTEGER NOT NULL,
    evidence_submitted BOOLEAN NOT NULL DEFAULT FALSE,
    evidence_document_name TEXT,
    evidence_submitted_at TIMESTAMPTZ,
    verification_status TEXT NOT NULL CHECK (verification_status IN ('Awaiting Submission', 'Submitted - Pending Verification', 'Verified & Closed', 'Overdue - Escalated', 'Rejected - Re-upload Required')),
    verified_by TEXT,
    escalated_to TEXT,
    remarks TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. LEASE DEEDS & PRESCRIBED DOCUMENT VALIDITY MONITORING TABLE (Part E)
CREATE TABLE IF NOT EXISTS public.document_validity (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    doc_code TEXT UNIQUE NOT NULL,
    app_number TEXT NOT NULL REFERENCES public.applications(app_number) ON DELETE CASCADE,
    institution_name TEXT NOT NULL,
    region TEXT NOT NULL,
    document_type TEXT NOT NULL CHECK (document_type IN ('Registered Land Lease Deed', 'Fire Safety Certificate (NOC)', 'Building Structural Stability Certificate', 'Occupancy Certificate', 'Fixed Deposit / Corpus Joint FDR')),
    document_number TEXT NOT NULL,
    issue_date DATE NOT NULL,
    expiry_date DATE NOT NULL,
    days_to_expiry INTEGER NOT NULL,
    validity_status TEXT NOT NULL CHECK (validity_status IN ('Valid', 'Expiring Soon (<45 Days)', 'Expired - Action Required', 'Renewal Submitted - Pending Verification')),
    renewal_document_name TEXT,
    verification_status TEXT NOT NULL DEFAULT 'Verified',
    alert_sent BOOLEAN NOT NULL DEFAULT FALSE,
    escalated_to TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. AUTOMATED ALERTS & ESCALATION ENGINE TABLE (Part F)
CREATE TABLE IF NOT EXISTS public.alerts_escalations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    alert_code TEXT UNIQUE NOT NULL,
    severity TEXT NOT NULL CHECK (severity IN ('Critical', 'High', 'Warning', 'Info')),
    category TEXT NOT NULL CHECK (category IN ('Stage Pendency SLA', 'EVC Delay Alert', 'Undertaking Breach', 'Document Expiry', 'Escalation Notice', 'Biometric Security')),
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    app_number TEXT,
    region TEXT NOT NULL,
    target_statement_role TEXT NOT NULL CHECK (target_statement_role IN ('Committee', 'Competent Authority', 'Both')),
    target_sub_role TEXT NOT NULL,
    escalated_from TEXT,
    escalated_to TEXT,
    is_acknowledged BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 9. DIGITAL AUDIT TRAIL TABLE (Part B, Part F & Regulatory Safeguard)
CREATE TABLE IF NOT EXISTS public.audit_trail (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_code TEXT NOT NULL,
    actor_name TEXT NOT NULL,
    statement_role TEXT NOT NULL,
    sub_role TEXT NOT NULL,
    action_type TEXT NOT NULL,
    app_number TEXT,
    stage_from TEXT,
    stage_to TEXT,
    auth_method TEXT NOT NULL,
    regulatory_safeguard_verified BOOLEAN NOT NULL DEFAULT TRUE,
    remarks TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aph_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evc_inspections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sac_hearings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.undertakings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_validity ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alerts_escalations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_trail ENABLE ROW LEVEL SECURITY;

-- Policies for authenticated and demo access
CREATE POLICY "Allow read access for portal users" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Allow update profile for portal users" ON public.profiles FOR ALL USING (true);
CREATE POLICY "Allow full access to aph_rules" ON public.aph_rules FOR ALL USING (true);
CREATE POLICY "Allow full access to applications" ON public.applications FOR ALL USING (true);
CREATE POLICY "Allow full access to evc_inspections" ON public.evc_inspections FOR ALL USING (true);
CREATE POLICY "Allow full access to sac_hearings" ON public.sac_hearings FOR ALL USING (true);
CREATE POLICY "Allow full access to undertakings" ON public.undertakings FOR ALL USING (true);
CREATE POLICY "Allow full access to document_validity" ON public.document_validity FOR ALL USING (true);
CREATE POLICY "Allow full access to alerts_escalations" ON public.alerts_escalations FOR ALL USING (true);
CREATE POLICY "Allow insert and select on audit_trail" ON public.audit_trail FOR ALL USING (true);

# AICTE Approval & Compliance Portal — Combined Authentication + PS 26262 6-Role Dashboard

Unified portal combining:
1. **Home Page (`/`) & Multi-Modal Biometric Authentication (`/login`)** from `aicte-portal-combined` (Face Biometrics, Fingertip Gesture Hover Selection, Password + Gmail OTP, and separate **Institution** vs **AICTE Member** Registration).
2. **6-Role Authority & Compliance Dashboard (`/dashboard`)** from `aicte-authority-portal-ps26262` (SIH 2026 Problem Statement 26262).
3. **Strict Account & Data Isolation**:
   - **No Cross-Account Role Switcher**: Direct role/account switching in the dashboard header is completely removed and disabled. Users are strictly locked into their authenticated account and must log out to sign in as another user.
   - **JWT-Enforced API & Session Security**: Every `/api/portal/*` endpoint requires a valid JWT (`Authorization: Bearer <token>`) verified against the SQLite user and registration records. Unauthenticated visits to `/dashboard` immediately redirect to `/login`.
   - **Per-Institution Data Isolation**: Each Institution account (seeded or newly registered) can **only** view and manage its own applications, undertakings, documents, alerts, and audit logs. It cannot view or modify any other institution's data.
   - **Per-User Progress Isolation**: Saved dashboard state and progress are isolated per authenticated user ID in SQLite (`user_progress`) and namespaced by user email in `localStorage`.
   - **Pending Member Approval Gate**: Newly registered AICTE Members (`Pending` status) do not receive an active session token and cannot log in until approved by a System Admin in the **User Management** tab.

---

## Quick Start

```bash
cd backend
npm install
npm start
# Server runs at http://localhost:3001
```

Or on Windows, double-click `start.bat`.

---

## Seeded Official & Institution Accounts

All seeded accounts work on `/login` with either **`Aicte@123`** or **`password123`** (or 6-digit OTP / Enrolled Face Biometrics):

| Statement Role | Sub-Role | Email | Password |
|---|---|---|---|
| **1. Regional / Scrutiny Officer** | Regional Officer | `regional.officer@aicte-india.org` | `Aicte@123` |
| **1. Regional / Scrutiny Officer** | Scrutiny Officer | `scrutiny.officer@aicte-india.org` | `Aicte@123` |
| **2. Bureau Officer / Head** | Bureau Officer / Head | `bureau.head@aicte-india.org` | `Aicte@123` |
| **3. Committee (EVC & SAC/SHC)** | EVC Member | `evc.committee@aicte-india.org` | `Aicte@123` |
| **3. Committee (EVC & SAC/SHC)** | SAC/SHC Member | `sac.committee@aicte-india.org` | `Aicte@123` |
| **4. Competent Authority** | Member Secretary | `membersecretary@aicte-india.org` | `Aicte@123` |
| **4. Competent Authority** | Chairman | `chairman@aicte-india.org` | `Aicte@123` |
| **5. Institution** | Institution (Applicant) — Mit AOE | `sam123gk7@gmail.com` | `password123` |
| **5. Institution** | Institution (Applicant) — Sunrise | `principal@sunrise-edu.ac.in` | `Aicte@123` |
| **6. System Admin & Auditor** | System Admin | `admin@aicte.gov.in` / `sysadmin@aicte-india.org` | `password123` / `Aicte@123` |
| **6. System Admin & Auditor** | Auditor | `auditor@aicte.gov.in` / `auditor@aicte-india.org` | `password123` / `Aicte@123` |

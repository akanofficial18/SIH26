// AICTE Approval Workflow Portal Configuration (SIH 2026 - PS 26262)
// ==================================================================
// Option 1: Live Supabase Backend
//   1. Open https://supabase.com/ and create a project.
//   2. Run supabase/schema.sql in the Supabase SQL Editor.
//   3. Copy Project URL and publishable/anon key from Project Settings > API.
//   4. Paste them into SUPABASE_URL and SUPABASE_ANON_KEY below (or via the Portal UI).
//
// Option 2: Local Demo Mode (Offline + Persistent Local/Server DB)
//   Keep the placeholder strings starting with "PASTE_".
//   The portal will automatically run with a local mock Supabase client + persistent
//   database so you can immediately register, sign in, and test all 6 role dashboards!

window.PORTAL_CONFIG = {
  SUPABASE_URL: "PASTE_YOUR_SUPABASE_PROJECT_URL_HERE",
  SUPABASE_ANON_KEY: "PASTE_YOUR_SUPABASE_PUBLISHABLE_OR_ANON_KEY_HERE"
};

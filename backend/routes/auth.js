const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { db } = require('../db/init');
const { sendOTPEmail, updateCredentials, verifyCredentials, getStatus } = require('../services/mailer');
const { parseProfile, applyProfile, MEMBER_ROLES, REGIONS, mapUserToAccount } = require('../services/registration');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET || 'gesture_face_auth_secret_key_2026';
const OTP_EXPIRY_MINUTES = 10;

// Helper: generate 6-digit OTP
function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Helper: clean up expired/used OTPs for an email
function cleanupOTPs(email) {
  try {
    db.prepare(`DELETE FROM otps WHERE LOWER(email) = LOWER(?) AND (used = 1 OR datetime(expires_at) < datetime('now'))`).run(email);
  } catch (e) {}
}

function getFullUserAccount(userId) {
  const user = db.prepare('SELECT id, name, email, created_at FROM users WHERE id = ?').get(userId);
  if (!user) return null;
  const prefs = db.prepare('SELECT * FROM user_prefs WHERE user_id = ?').get(user.id);
  const reg = db.prepare('SELECT * FROM registrations WHERE user_id = ?').get(user.id);
  return mapUserToAccount(user, prefs, reg);
}

function checkAccountActiveStatus(userId) {
  const prefs = db.prepare('SELECT * FROM user_prefs WHERE user_id = ?').get(userId);
  const reg = db.prepare('SELECT * FROM registrations WHERE user_id = ?').get(userId);
  if (reg && reg.status === 'Pending') {
    return { allowed: false, error: 'Your AICTE Member registration is awaiting System Admin approval.' };
  }
  if (reg && reg.status === 'Rejected') {
    return { allowed: false, error: 'Your member registration was not approved by the System Admin.' };
  }
  if (prefs && prefs.is_active === 0) {
    return { allowed: false, error: 'Your portal account has been deactivated by the System Admin.' };
  }
  return { allowed: true };
}

function maskEmail(email) {
  if (!email || !email.includes('@')) return '***';
  const [local, domain] = email.split('@');
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}***@${domain}`;
}

// ──────────────────────────────────────────────────
// GET /api/auth/smtp-status
// ──────────────────────────────────────────────────
router.get('/smtp-status', (req, res) => {
  res.json(getStatus());
});

// ──────────────────────────────────────────────────
// POST /api/auth/smtp-config
// Save Gmail SMTP credentials, verify connection, and persist to .env
// ──────────────────────────────────────────────────
router.post('/smtp-config', async (req, res) => {
  try {
    const { gmailUser, gmailPass } = req.body;
    if (!gmailUser || !gmailPass) {
      return res.status(400).json({ error: 'Both Gmail address and 16-character App Password are required' });
    }

    await verifyCredentials(gmailUser, gmailPass);
    updateCredentials(gmailUser, gmailPass);

    const envPath = path.join(__dirname, '..', '.env');
    let envContent = '';
    if (fs.existsSync(envPath)) {
      envContent = fs.readFileSync(envPath, 'utf8');
      envContent = envContent.replace(/GMAIL_USER=.*/g, `GMAIL_USER=${gmailUser.trim()}`);
      envContent = envContent.replace(/GMAIL_PASS=.*/g, `GMAIL_PASS=${gmailPass.trim().replace(/\s+/g, '')}`);
    } else {
      envContent = `GMAIL_USER=${gmailUser.trim()}\nGMAIL_PASS=${gmailPass.trim().replace(/\s+/g, '')}\n`;
    }
    fs.writeFileSync(envPath, envContent, 'utf8');

    console.log(`[SMTP Config] Successfully verified and saved Gmail credentials for ${gmailUser}`);
    res.json({
      success: true,
      message: 'Gmail credentials verified and saved successfully! Real OTP emails will now be dispatched.',
      status: getStatus()
    });
  } catch (err) {
    console.error('[SMTP Config Error]', err.message);
    res.status(400).json({
      success: false,
      error: `Gmail verification failed: ${err.message}. Please make sure you are using a 16-character Google App Password (not your normal Gmail account password).`
    });
  }
});

// ──────────────────────────────────────────────────
// POST /api/auth/send-otp
// Body: { email, name?, purpose: 'register'|'login' }
// ──────────────────────────────────────────────────
router.post('/send-otp', async (req, res) => {
  try {
    const rawEmail = req.body.email;
    const { name, purpose = 'register' } = req.body;
    if (!rawEmail) return res.status(400).json({ error: 'Email address required' });
    const email = String(rawEmail).trim().toLowerCase();

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) return res.status(400).json({ error: 'Invalid email address format' });

    if (purpose === 'login') {
      const user = db.prepare('SELECT id, name FROM users WHERE LOWER(email) = ?').get(email);
      if (!user) return res.status(404).json({ error: 'No account found with this email. Please register first.' });
      const activeCheck = checkAccountActiveStatus(user.id);
      if (!activeCheck.allowed) return res.status(403).json({ error: activeCheck.error });
    }

    cleanupOTPs(email);

    const recentCount = db.prepare(
      `SELECT COUNT(*) as cnt FROM otps WHERE LOWER(email) = ? AND datetime(created_at) > datetime('now', '-5 minutes')`
    ).get(email);

    if (recentCount && recentCount.cnt >= 10) {
      return res.status(429).json({ error: 'Too many OTP requests. Please wait a minute before requesting another code.' });
    }

    const otp = generateOTP();
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000).toISOString();

    db.prepare('INSERT INTO otps (email, otp, purpose, expires_at) VALUES (?, ?, ?, ?)').run(email, otp, purpose, expiresAt);

    console.log(`\n==============================================`);
    console.log(`🔑 [OTP DISPATCH] Email: ${email} | Code: ${otp} | Purpose: ${purpose}`);
    console.log(`==============================================\n`);

    const userName = name || email.split('@')[0];
    const mailResult = await sendOTPEmail(email, otp, userName);

    res.json({
      success: true,
      deliveredToGmail: mailResult.delivered,
      simulated: mailResult.simulated,
      message: mailResult.delivered
        ? `Live verification code sent to ${email} inbox!`
        : `Verification code generated: [ ${otp} ] (Configure Gmail App Password in Settings for real inbox delivery)`,
      debugOtp: otp,
      smtpStatus: getStatus(),
      expiresInMinutes: OTP_EXPIRY_MINUTES
    });
  } catch (err) {
    console.error('[OTP Error]', err);
    res.status(500).json({ error: 'Failed to generate verification OTP' });
  }
});

// ──────────────────────────────────────────────────
// POST /api/auth/verify-otp
// Body: { email, otp, purpose? }
// ──────────────────────────────────────────────────
router.post('/verify-otp', (req, res) => {
  try {
    const rawEmail = req.body.email;
    const { otp, purpose } = req.body;
    if (!rawEmail || !otp) return res.status(400).json({ error: 'Email and OTP code required' });
    const email = String(rawEmail).trim().toLowerCase();

    let query = 'SELECT * FROM otps WHERE LOWER(email) = ? AND otp = ? AND used = 0 AND datetime(expires_at) > datetime(\'now\')';
    const params = [email, String(otp).trim()];

    if (purpose) {
      query += ' AND purpose = ?';
      params.push(purpose);
    }
    query += ' ORDER BY created_at DESC LIMIT 1';

    const record = db.prepare(query).get(...params);

    if (!record) {
      return res.status(400).json({ error: 'Invalid or expired OTP code. Please request a new code.' });
    }

    db.prepare('UPDATE otps SET used = 1 WHERE id = ?').run(record.id);

    if (req.session) {
      req.session.otpVerified = email;
      req.session.otpPurpose = purpose || record.purpose;
    }

    res.json({ success: true, message: 'OTP verified successfully' });
  } catch (err) {
    console.error('[Verify OTP Error]', err);
    res.status(500).json({ error: 'Verification failed' });
  }
});

// GET /api/auth/registration-options  (roles + regions for the member form)
router.get('/registration-options', (req, res) => {
  res.json({ roles: Object.entries(MEMBER_ROLES).map(([key, label]) => ({ key, label })), regions: REGIONS });
});

// ──────────────────────────────────────────────────
// POST /api/auth/register
// Body: { email, name, password?, otp? }
// ──────────────────────────────────────────────────
router.post('/register', async (req, res) => {
  try {
    const rawEmail = req.body.email;
    const { name, password, otp } = req.body;
    if (!rawEmail) return res.status(400).json({ error: 'Email is required' });
    const email = String(rawEmail).trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Invalid email address format' });
    const parsed = parseProfile(req.body);
    if (parsed.error) return res.status(400).json({ error: parsed.error });

    const existing = db.prepare('SELECT id, name, email FROM users WHERE LOWER(email) = ?').get(email);
    if (existing) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }

    if (otp) {
      const otpRecord = db.prepare(
        `SELECT id FROM otps WHERE LOWER(email) = ? AND otp = ? AND used = 0 AND datetime(expires_at) > datetime('now') ORDER BY created_at DESC LIMIT 1`
      ).get(email, String(otp).trim());
      if (!otpRecord && (!req.session || req.session.otpVerified !== email)) {
        return res.status(400).json({ error: 'Invalid or expired OTP verification code' });
      }
      if (otpRecord) {
        db.prepare('UPDATE otps SET used = 1 WHERE id = ?').run(otpRecord.id);
      }
    }

    const userName = (name && String(name).trim()) || email.split('@')[0];
    let passwordHash = null;
    if (password && password.trim().length > 0) {
      passwordHash = await bcrypt.hash(password, 10);
    }

    const result = db.prepare(
      'INSERT INTO users (name, email, password_hash, is_verified) VALUES (?, ?, ?, 1)'
    ).run(userName, email, passwordHash);

    const userId = result.lastInsertRowid;
    applyProfile(db, userId, parsed.profile);

    // Only issue active session token if account is immediately Active (i.e. Institution).
    // Pending member registrations must wait for System Admin approval.
    const isPending = parsed.profile.status === 'Pending';
    const token = isPending
      ? null
      : jwt.sign({ userId, email, name: userName }, JWT_SECRET, { expiresIn: '7d' });

    if (req.session) {
      req.session.otpVerified = null;
    }

    const accountProfile = getFullUserAccount(userId);
    console.log(`[Auth Register] User registered successfully: ${userName} (${email}) [${parsed.profile.role}]`);

    res.json({
      success: true,
      message: parsed.profile.type === 'member'
        ? 'Member registration received. A System Admin must approve it before you can open the portal.'
        : 'Institution registered successfully!',
      token,
      accountType: parsed.profile.type,
      status: parsed.profile.status,
      user: accountProfile
    });
  } catch (err) {
    console.error('[Register Error]', err);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// ──────────────────────────────────────────────────
// POST /api/auth/login
// Body: { email, password?, otp? }
// ──────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const rawEmail = req.body.email;
    const { password, otp } = req.body;
    if (!rawEmail) return res.status(400).json({ error: 'Email required' });
    const email = String(rawEmail).trim().toLowerCase();

    const user = db.prepare('SELECT * FROM users WHERE LOWER(email) = ?').get(email);
    if (!user) return res.status(404).json({ error: 'No account found with this email' });

    const activeCheck = checkAccountActiveStatus(user.id);
    if (!activeCheck.allowed) {
      return res.status(403).json({ error: activeCheck.error });
    }

    if (otp) {
      const otpRecord = db.prepare(
        `SELECT id FROM otps WHERE LOWER(email) = ? AND otp = ? AND used = 0 AND datetime(expires_at) > datetime('now') ORDER BY created_at DESC LIMIT 1`
      ).get(email, String(otp).trim());
      if (otpRecord) {
        db.prepare('UPDATE otps SET used = 1 WHERE id = ?').run(otpRecord.id);
      } else {
        return res.status(400).json({ error: 'Invalid or expired OTP code' });
      }
    } else if (password) {
      if (!user.password_hash) {
        return res.status(400).json({ error: 'No password set for this account. Please login with Face or OTP.' });
      }
      const match = await bcrypt.compare(password, user.password_hash);
      if (!match) {
        return res.status(401).json({ error: 'Incorrect password' });
      }
    } else {
      return res.status(400).json({ error: 'Password or OTP required for login' });
    }

    const token = jwt.sign(
      { userId: user.id, email: user.email, name: user.name },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    const accountProfile = getFullUserAccount(user.id);
    res.json({
      success: true,
      message: 'Login successful!',
      token,
      user: accountProfile
    });
  } catch (err) {
    console.error('[Login Error]', err);
    res.status(500).json({ error: 'Authentication failed' });
  }
});

// ──────────────────────────────────────────────────
// GET /api/auth/users
// Returns registered users count & masked summary (protects private emails)
// ──────────────────────────────────────────────────
router.get('/users', (req, res) => {
  try {
    const users = db.prepare(`
      SELECT u.id, u.name, u.email, u.created_at,
             CASE WHEN f.id IS NOT NULL THEN 1 ELSE 0 END as hasFace,
             CASE WHEN u.password_hash IS NOT NULL THEN 1 ELSE 0 END as hasPassword
      FROM users u
      LEFT JOIN face_descriptors f ON u.id = f.user_id
      ORDER BY u.id DESC
    `).all();

    const safeUsers = (users || []).map((u) => ({
      id: u.id,
      name: u.name,
      email: maskEmail(u.email),
      created_at: u.created_at,
      hasFace: u.hasFace,
      hasPassword: u.hasPassword
    }));

    res.json({ users: safeUsers });
  } catch (e) {
    res.status(500).json({ error: 'Failed to retrieve users' });
  }
});

// ──────────────────────────────────────────────────
// GET /api/auth/me
// ──────────────────────────────────────────────────
router.get('/me', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No authorization token provided' });
  }
  try {
    const token = authHeader.slice(7);
    const decoded = jwt.verify(token, JWT_SECRET);
    const activeCheck = checkAccountActiveStatus(decoded.userId);
    if (!activeCheck.allowed) {
      return res.status(403).json({ error: activeCheck.error });
    }
    const accountProfile = getFullUserAccount(decoded.userId);
    if (!accountProfile) return res.status(404).json({ error: 'User not found' });
    const hasFaceRow = db.prepare('SELECT id FROM face_descriptors WHERE user_id = ?').get(decoded.userId);
    accountProfile.hasFace = hasFaceRow ? 1 : 0;
    res.json({ user: accountProfile });
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
});

module.exports = router;

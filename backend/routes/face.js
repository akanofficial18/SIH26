const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { db } = require('../db/init');
const { parseProfile, applyProfile, mapUserToAccount } = require('../services/registration');
require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET || 'gesture_face_auth_secret_key_2026';

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

function cosineSimilarity(a, b) {
  if (!a || !b || !Array.isArray(a) || !Array.isArray(b) || a.length !== b.length || a.length === 0) {
    return 0;
  }
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    const valA = Number(a[i]);
    const valB = Number(b[i]);
    dot += valA * valB;
    normA += valA * valA;
    normB += valB * valB;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function rmseDistance(a, b) {
  if (!a || !b || !Array.isArray(a) || !Array.isArray(b) || a.length !== b.length || a.length === 0) {
    return Infinity;
  }
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = Number(a[i]) - Number(b[i]);
    sum += diff * diff;
  }
  return Math.sqrt(sum / a.length);
}

// ──────────────────────────────────────────────────
// POST /api/face/register
// ──────────────────────────────────────────────────
router.post('/register', async (req, res) => {
  try {
    const rawEmail = req.body.email;
    const { name, descriptor } = req.body;
    const email = rawEmail ? String(rawEmail).trim().toLowerCase() : '';
    if (!descriptor || !Array.isArray(descriptor) || descriptor.length < 3) {
      return res.status(400).json({ error: 'Valid facial descriptor vector required' });
    }

    let user = null;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const decoded = jwt.verify(authHeader.slice(7), JWT_SECRET);
        user = db.prepare('SELECT id, name, email FROM users WHERE id = ?').get(decoded.userId);
      } catch (e) {}
    }

    if (!user && email) {
      user = db.prepare('SELECT id, name, email FROM users WHERE LOWER(email) = ?').get(email);
      if (user) {
        const hasFace = db.prepare('SELECT 1 x FROM face_descriptors WHERE user_id = ?').get(user.id);
        if (hasFace) return res.status(403).json({ error: 'A face is already enrolled for this account. Sign in first to re-enroll.' });
      }
      if (!user) {
        const parsed = parseProfile(req.body);
        if (parsed.error) return res.status(400).json({ error: parsed.error });
        const userName = (name && String(name).trim()) || email.split('@')[0];
        const result = db.prepare('INSERT INTO users (name, email, is_verified) VALUES (?, ?, 1)').run(userName, email);
        user = { id: result.lastInsertRowid, name: userName, email };
        applyProfile(db, user.id, parsed.profile);
      }
    }

    if (!user) {
      return res.status(400).json({ error: 'User email or authorization token required to register face' });
    }

    db.prepare('DELETE FROM face_descriptors WHERE user_id = ?').run(user.id);
    db.prepare('INSERT INTO face_descriptors (user_id, descriptor) VALUES (?, ?)').run(
      user.id,
      JSON.stringify(descriptor)
    );

    const regRow = db.prepare('SELECT status FROM registrations WHERE user_id = ?').get(user.id);
    const status = (regRow && regRow.status) || 'Active';
    const token = status === 'Pending'
      ? null
      : jwt.sign({ userId: user.id, email: user.email, name: user.name }, JWT_SECRET, { expiresIn: '7d' });

    const accountProfile = getFullUserAccount(user.id);
    console.log(`[Face Register] Successfully enrolled face for user: ${user.name} (${user.email})`);

    res.json({
      success: true,
      message: `Face enrolled successfully for ${user.name}!`,
      token,
      status,
      user: accountProfile
    });
  } catch (err) {
    console.error('[Face Register Error]', err);
    res.status(500).json({ error: 'Failed to register face template' });
  }
});

// ──────────────────────────────────────────────────
// POST /api/face/detect-unlock
// ──────────────────────────────────────────────────
router.post('/detect-unlock', (req, res) => {
  try {
    const { descriptor } = req.body;
    if (!descriptor || !Array.isArray(descriptor) || descriptor.length < 3) {
      return res.status(400).json({ error: 'Valid facial descriptor vector required' });
    }

    const records = db.prepare(`
      SELECT f.id, f.user_id, f.descriptor, u.name, u.email
      FROM face_descriptors f
      JOIN users u ON f.user_id = u.id
    `).all();

    if (!records || records.length === 0) {
      return res.json({
        matched: false,
        error: 'No registered face profiles found in the database. Please enroll your face first.'
      });
    }

    let bestMatch = null;
    let highestSimilarity = -1;
    let bestRmse = Infinity;

    for (const record of records) {
      try {
        const storedVec = JSON.parse(record.descriptor);
        const sim = cosineSimilarity(descriptor, storedVec);
        const rmse = rmseDistance(descriptor, storedVec);

        if (sim > highestSimilarity) {
          highestSimilarity = sim;
          bestRmse = rmse;
          bestMatch = record;
        }
      } catch (e) {}
    }

    console.log(`[Face Detect-Unlock] Cosine Sim: ${highestSimilarity.toFixed(4)}, RMSE: ${bestRmse.toFixed(4)}, Best Match: ${bestMatch ? bestMatch.name : 'none'}`);

    const isMatch = highestSimilarity >= 0.86 || bestRmse <= 0.22;

    if (bestMatch && isMatch) {
      const activeCheck = checkAccountActiveStatus(bestMatch.user_id);
      if (!activeCheck.allowed) {
        return res.json({
          success: false,
          matched: false,
          error: activeCheck.error
        });
      }

      const confidence = Math.round(Math.min(99, Math.max(75, highestSimilarity * 100)));
      const token = jwt.sign(
        { userId: bestMatch.user_id, email: bestMatch.email, name: bestMatch.name },
        JWT_SECRET,
        { expiresIn: '7d' }
      );
      const accountProfile = getFullUserAccount(bestMatch.user_id);

      res.json({
        success: true,
        matched: true,
        confidence,
        similarity: Number(highestSimilarity.toFixed(4)),
        rmse: Number(bestRmse.toFixed(4)),
        token,
        user: accountProfile,
        message: `Face recognized! Welcome back, ${bestMatch.name}.`
      });
    } else {
      res.json({
        success: false,
        matched: false,
        similarity: highestSimilarity > 0 ? Number(highestSimilarity.toFixed(4)) : 0,
        confidence: Math.round(Math.max(0, highestSimilarity * 80)),
        error: 'Face not recognized. Ensure good lighting or enroll your face first.'
      });
    }
  } catch (err) {
    console.error('[Face Detect Error]', err);
    res.status(500).json({ error: 'Face detection processing failed' });
  }
});

// ──────────────────────────────────────────────────
// POST /api/face/verify
// ──────────────────────────────────────────────────
router.post('/verify', (req, res) => {
  try {
    const rawEmail = req.body.email;
    const { descriptor } = req.body;
    if (!rawEmail) return res.status(400).json({ error: 'Email required' });
    const email = String(rawEmail).trim().toLowerCase();
    if (!descriptor || !Array.isArray(descriptor) || descriptor.length < 3) {
      return res.status(400).json({ error: 'Valid facial descriptor vector required' });
    }

    const user = db.prepare('SELECT id, name, email FROM users WHERE LOWER(email) = ?').get(email);
    if (!user) {
      return res.json({ matched: false, error: 'No account found with this email. Please register first.' });
    }

    const activeCheck = checkAccountActiveStatus(user.id);
    if (!activeCheck.allowed) {
      return res.json({ matched: false, error: activeCheck.error });
    }

    const stored = db.prepare('SELECT descriptor FROM face_descriptors WHERE user_id = ?').get(user.id);
    if (!stored) {
      return res.json({ matched: false, error: 'No facial template enrolled yet for this account.' });
    }

    const storedDescriptor = JSON.parse(stored.descriptor);
    const sim = cosineSimilarity(descriptor, storedDescriptor);
    const rmse = rmseDistance(descriptor, storedDescriptor);

    console.log(`[Face Verify] Email: ${email}, Cosine Sim: ${sim.toFixed(4)}, RMSE: ${rmse.toFixed(4)}`);

    const isMatch = sim >= 0.86 || rmse <= 0.22;

    if (isMatch) {
      const confidence = Math.round(Math.min(99, Math.max(75, sim * 100)));
      const token = jwt.sign(
        { userId: user.id, email: user.email, name: user.name },
        JWT_SECRET,
        { expiresIn: '7d' }
      );
      const accountProfile = getFullUserAccount(user.id);
      res.json({
        success: true,
        matched: true,
        confidence,
        similarity: Number(sim.toFixed(4)),
        rmse: Number(rmse.toFixed(4)),
        token,
        user: accountProfile,
        message: `Face verified! Welcome back, ${user.name}.`
      });
    } else {
      res.json({
        success: false,
        matched: false,
        confidence: Math.round(Math.max(0, sim * 80)),
        similarity: Number(sim.toFixed(4)),
        error: 'Face does not match the registered profile for this account.'
      });
    }
  } catch (err) {
    console.error('[Face Verify Error]', err);
    res.status(500).json({ error: 'Face verification failed' });
  }
});

// ──────────────────────────────────────────────────
// GET /api/face/stats
// ──────────────────────────────────────────────────
router.get('/stats', (req, res) => {
  try {
    const count = db.prepare('SELECT COUNT(*) as cnt FROM face_descriptors').get();
    res.json({ totalFaces: count ? count.cnt : 0 });
  } catch (e) {
    res.json({ totalFaces: 0 });
  }
});

module.exports = router;

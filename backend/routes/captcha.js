const express = require('express');
const router = express.Router();
const svgCaptcha = require('svg-captcha');

// GET /api/captcha — generate a new CAPTCHA, store answer in session
router.get('/', (req, res) => {
  const captcha = svgCaptcha.create({
    size: 6,
    ignoreChars: '0oO1ilI',
    noise: 4,
    color: true,
    background: '#0d0d1a',
    width: 180,
    height: 60,
    fontSize: 52,
  });

  req.session.captchaText = captcha.text.toLowerCase();
  req.session.captchaCreatedAt = Date.now();

  res.set('Content-Type', 'image/svg+xml');
  res.send(captcha.data);
});

// POST /api/captcha/verify — verify captcha answer (used internally or as standalone)
router.post('/verify', (req, res) => {
  const { answer } = req.body;
  if (!answer) return res.status(400).json({ error: 'Answer required' });
  if (!req.session.captchaText) return res.status(400).json({ error: 'No captcha session found' });

  const captchaAge = Date.now() - (req.session.captchaCreatedAt || 0);
  if (captchaAge > 5 * 60 * 1000) {
    req.session.captchaText = null;
    return res.status(400).json({ error: 'CAPTCHA expired, please refresh' });
  }

  const isValid = answer.toLowerCase() === req.session.captchaText;
  if (isValid) {
    req.session.captchaVerified = true;
    req.session.captchaText = null;
    return res.json({ success: true });
  }

  req.session.captchaVerified = false;
  return res.status(400).json({ error: 'Incorrect CAPTCHA answer' });
});

module.exports = router;

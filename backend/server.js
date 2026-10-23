const express = require('express');
const cors = require('cors');
const session = require('express-session');
const path = require('path');
require('dotenv').config();

const { initDB, db } = require('./db/init');
const { initPortal } = require('./db/portal');
const authRoutes = require('./routes/auth');
const faceRoutes = require('./routes/face');
const captchaRoutes = require('./routes/captcha');
const portalRoutes = require('./routes/portal');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
  origin: true,
  credentials: true
}));
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));

app.use(session({
  secret: process.env.SESSION_SECRET || 'gesture_session_secret_key_849204',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false, // set true in production HTTPS
    maxAge: 24 * 60 * 60 * 1000
  }
}));

// Serve static frontend files from 'public' directory
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));
// Friendly page routes: / (home) -> /login (single sign-in) -> /dashboard
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));
app.get('/dashboard', (req, res) => res.sendFile(path.join(__dirname, 'public', 'dashboard.html')));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/face', faceRoutes);
app.use('/api/captcha', captchaRoutes);
app.use('/api/portal', portalRoutes);   // integrated dashboard (needs the login token)

// Health Check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    system: 'Camera Gesture & Face Biometric System',
    timestamp: new Date().toISOString()
  });
});

// Fallback to index.html for single-page app
app.get('*', (req, res) => {
  const indexPath = path.join(__dirname, 'public', 'index.html');
  res.sendFile(indexPath);
});

// Start Server
async function startServer() {
  try {
    await initDB();
    initPortal(db);
    app.listen(PORT, () => {
      console.log(`\n======================================================`);
      console.log(`🚀 GESTURE-VISION AUTH SERVER ACTIVE`);
      console.log(`🌐 URL: http://localhost:${PORT}`);
      console.log(`📡 API: http://localhost:${PORT}/api/auth`);
      console.log(`👁️  FACE: http://localhost:${PORT}/api/face`);
      console.log(`======================================================\n`);
    });
  } catch (err) {
    console.error('Fatal Server Boot Error:', err);
    process.exit(1);
  }
}

startServer();

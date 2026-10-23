const nodemailer = require('nodemailer');
require('dotenv').config();

let activeTransporter = null;
let currentGmailUser = process.env.GMAIL_USER || '';
let currentGmailPass = process.env.GMAIL_PASS || '';

function createGmailTransporter(user, pass) {
  if (!user || !pass || user.includes('your_email') || pass.includes('your_app_password')) {
    return null;
  }
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: user.trim(),
      pass: pass.trim().replace(/\s+/g, ''), // Google App passwords have spaces like "xxxx xxxx xxxx xxxx"
    },
  });
}

function getTransporter() {
  if (!activeTransporter && currentGmailUser && currentGmailPass) {
    activeTransporter = createGmailTransporter(currentGmailUser, currentGmailPass);
  }
  return activeTransporter;
}

function updateCredentials(user, pass) {
  currentGmailUser = user ? user.trim() : '';
  currentGmailPass = pass ? pass.trim().replace(/\s+/g, '') : '';
  activeTransporter = createGmailTransporter(currentGmailUser, currentGmailPass);
  process.env.GMAIL_USER = currentGmailUser;
  process.env.GMAIL_PASS = currentGmailPass;
}

function getStatus() {
  const isConfigured = Boolean(currentGmailUser && currentGmailPass && !currentGmailUser.includes('your_email'));
  let masked = null;
  if (isConfigured) {
    const parts = currentGmailUser.split('@');
    masked = parts[0].slice(0, 3) + '***@' + (parts[1] || 'gmail.com');
  }
  return {
    isConfigured,
    user: masked,
  };
}

async function verifyCredentials(user, pass) {
  const testTransporter = createGmailTransporter(user, pass);
  if (!testTransporter) {
    throw new Error('Please enter a valid Gmail address and 16-character App Password');
  }
  await testTransporter.verify();
  return true;
}

async function sendOTPEmail(to, otp, name = 'User') {
  const t = getTransporter();

  // If no real Gmail credentials configured yet
  if (!t) {
    console.log(`\n======================================================`);
    console.log(`📧 [VIRTUAL SIMULATED OTP DISPATCH]`);
    console.log(`Target: ${to}`);
    console.log(`Name: ${name}`);
    console.log(`Code: >>> [ ${otp} ] <<<`);
    console.log(`Notice: To send real email to Gmail inbox, configure GMAIL_USER & GMAIL_PASS`);
    console.log(`======================================================\n`);
    return {
      delivered: false,
      simulated: true,
      message: 'Gmail SMTP credentials not configured. Code logged in terminal & UI toast.',
    };
  }

  const sender = currentGmailUser || process.env.GMAIL_USER;
  const mailOptions = {
    from: `"Gesture & Face Auth HUD" <${sender}>`,
    to,
    subject: `🔐 Your Verification Code: ${otp}`,
    html: `
      <!DOCTYPE html>
      <html>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #030712; margin: 0; padding: 40px 20px;">
        <div style="max-width: 520px; margin: 0 auto; background: #0b1329; border-radius: 20px; padding: 36px; border: 1px solid #38bdf8; color: #f8fafc; box-shadow: 0 10px 40px rgba(6,182,212,0.15);">
          <div style="text-align: center; margin-bottom: 24px;">
            <h1 style="color: #38bdf8; font-size: 26px; margin: 0; letter-spacing: 2px;">GESTURE-VISION AUTH</h1>
            <p style="color: #94a3b8; margin: 6px 0 0; font-size: 13px;">Biometric Verification System</p>
          </div>
          <p style="color: #e2e8f0; font-size: 15px;">Hello <strong>${name}</strong>,</p>
          <p style="color: #94a3b8; font-size: 14px; line-height: 1.6;">Your single-use One-Time Password (OTP) for authentication is:</p>
          <div style="background: rgba(56, 189, 248, 0.08); border: 2px solid #38bdf8; border-radius: 14px; padding: 18px; text-align: center; margin: 24px 0;">
            <div style="letter-spacing: 12px; font-size: 38px; font-weight: 800; color: #38bdf8; font-family: monospace;">${otp}</div>
          </div>
          <p style="color: #cbd5e1; font-size: 12px; text-align: center;">⏱️ This code will expire in 10 minutes. If you did not request this, please disregard.</p>
        </div>
      </body>
      </html>
    `,
  };

  try {
    const info = await t.sendMail(mailOptions);
    console.log(`[Mail] Real SMTP OTP dispatched successfully to ${to}. MessageId: ${info.messageId}`);
    return { delivered: true, simulated: false, messageId: info.messageId };
  } catch (err) {
    console.error(`[Mail Error] Failed to send email to ${to}:`, err.message);
    return {
      delivered: false,
      simulated: true,
      error: err.message,
      message: `Failed to deliver to Gmail: ${err.message}`,
    };
  }
}

module.exports = {
  sendOTPEmail,
  updateCredentials,
  verifyCredentials,
  getStatus,
};

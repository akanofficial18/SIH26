// ============================================================================
// SIH 2026 PS 26262 - Biometric Authentication Engine
// 1. Webcam Face Detection + Liveness Check + Numeric Template Vector Matching
// 2. WebAuthn Passkey / Fingerprint Hardware Sensor Integration
// 3. Demo Simulation Fallbacks for Judge Presentations without Hardware
// ============================================================================

const FACE_TEMPLATES_KEY = 'aicte_ps26262_face_templates_v1';
const WEBAUTHN_CREDS_KEY = 'aicte_ps26262_webauthn_creds_v1';

export class BiometricEngine {
  constructor() {
    this.activeStream = null;
    this.animFrameId = null;
  }

  getSavedFaceTemplates() {
    try {
      return JSON.parse(localStorage.getItem(FACE_TEMPLATES_KEY) || '{}');
    } catch (_) {
      return {};
    }
  }

  saveFaceTemplate(accountId, vector) {
    const all = this.getSavedFaceTemplates();
    all[accountId] = {
      vector,
      registeredAt: new Date().toLocaleTimeString(),
      dimensions: vector.length
    };
    localStorage.setItem(FACE_TEMPLATES_KEY, JSON.stringify(all));
  }

  hasFaceTemplate(accountId) {
    const all = this.getSavedFaceTemplates();
    return Boolean(all[accountId] && Array.isArray(all[accountId].vector));
  }

  getSavedWebAuthnCreds() {
    try {
      return JSON.parse(localStorage.getItem(WEBAUTHN_CREDS_KEY) || '{}');
    } catch (_) {
      return {};
    }
  }

  saveWebAuthnCred(accountId, credInfo) {
    const all = this.getSavedWebAuthnCreds();
    all[accountId] = credInfo;
    localStorage.setItem(WEBAUTHN_CREDS_KEY, JSON.stringify(all));
  }

  // Extract a 64-element normalized numeric feature template from the central face ROI
  // Never saves an image—only a compact numeric array.
  extractNumericFaceTemplate(ctx, width, height) {
    const roiX = Math.floor(width * 0.28);
    const roiY = Math.floor(height * 0.18);
    const roiW = Math.floor(width * 0.44);
    const roiH = Math.floor(height * 0.64);

    const imgData = ctx.getImageData(roiX, roiY, roiW, roiH).data;
    const grid = 8; // 8x8 = 64 numeric cells
    const cellW = Math.max(1, Math.floor(roiW / grid));
    const cellH = Math.max(1, Math.floor(roiH / grid));
    const vector = [];

    for (let gy = 0; gy < grid; gy++) {
      for (let gx = 0; gx < grid; gx++) {
        let sumLum = 0;
        let count = 0;
        for (let y = gy * cellH; y < (gy + 1) * cellH && y < roiH; y += 2) {
          for (let x = gx * cellW; x < (gx + 1) * cellW && x < roiW; x += 2) {
            const idx = (y * roiW + x) * 4;
            const r = imgData[idx];
            const g = imgData[idx + 1];
            const b = imgData[idx + 2];
            sumLum += 0.299 * r + 0.587 * g + 0.114 * b;
            count++;
          }
        }
        vector.push(count > 0 ? +(sumLum / count / 255).toFixed(4) : 0.5);
      }
    }

    // Normalize vector
    const mean = vector.reduce((a, b) => a + b, 0) / vector.length;
    const std = Math.sqrt(vector.reduce((a, b) => a + (b - mean) ** 2, 0) / vector.length) || 1;
    return vector.map((v) => +((v - mean) / std).toFixed(4));
  }

  compareTemplates(vecA, vecB) {
    if (!vecA || !vecB || vecA.length !== vecB.length) return 0.91;
    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < vecA.length; i++) {
      dot += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }
    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    if (!denom) return 0.88;
    const cosine = dot / denom; // -1 to 1
    // Convert cosine similarity to confidence score (0..100%)
    const score = Math.max(0, Math.min(99.6, ((cosine + 1) / 2) * 100));
    return +score.toFixed(1);
  }

  // Analyze frame for face presence & liveness motion (blink / head nod)
  analyzeFrame(ctx, width, height, prevFrameSample) {
    const roiX = Math.floor(width * 0.28);
    const roiY = Math.floor(height * 0.18);
    const roiW = Math.floor(width * 0.44);
    const roiH = Math.floor(height * 0.64);
    const data = ctx.getImageData(roiX, roiY, roiW, roiH).data;

    let skinPixels = 0;
    let totalSampled = 0;
    let brightnessSum = 0;
    let motionDiff = 0;
    const currentSample = [];

    for (let i = 0; i < data.length; i += 32) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      brightnessSum += lum;
      currentSample.push(lum);

      // Broad skin-tone & facial luminance heuristic working across diverse lighting
      const isSkinTone =
        r > 45 &&
        g > 30 &&
        b > 15 &&
        r > b &&
        Math.abs(r - g) < 115 &&
        lum > 35 &&
        lum < 245;
      if (isSkinTone) skinPixels++;
      totalSampled++;
    }

    if (prevFrameSample && prevFrameSample.length === currentSample.length) {
      for (let i = 0; i < currentSample.length; i++) {
        motionDiff += Math.abs(currentSample[i] - prevFrameSample[i]);
      }
      motionDiff = motionDiff / currentSample.length;
    }

    const avgBrightness = totalSampled > 0 ? brightnessSum / totalSampled : 0;
    const skinRatio = totalSampled > 0 ? skinPixels / totalSampled : 0;
    const facePresent = avgBrightness > 28 && skinRatio > 0.18;

    return {
      facePresent,
      skinRatio: +(skinRatio * 100).toFixed(0),
      avgBrightness: +avgBrightness.toFixed(0),
      motionDelta: +motionDiff.toFixed(2),
      sample: currentSample
    };
  }

  // Draw clean green corner brackets & frame on overlay canvas (Matches Panel 3 of Reference Image)
  drawBiometricHud(overlayCtx, width, height, metrics, livenessProgress) {
    overlayCtx.clearRect(0, 0, width, height);

    const cx = width / 2;
    const cy = height / 2;
    const rx = width * 0.22;
    const ry = height * 0.32;

    const strokeColor = metrics.facePresent
      ? '#16a34a' // Clean Emerald Green like Reference Image Panel 3
      : '#d97706'; // Warm Saffron Amber when positioning face

    // Corner Frame Brackets (Clean Green Frame around Face like Panel 3)
    const bx = cx - rx - 16;
    const by = cy - ry - 16;
    const bw = (rx + 16) * 2;
    const bh = (ry + 16) * 2;
    const corner = 28;

    overlayCtx.strokeStyle = strokeColor;
    overlayCtx.lineWidth = 4;
    overlayCtx.lineCap = 'round';
    overlayCtx.beginPath();
    // Top-left
    overlayCtx.moveTo(bx, by + corner);
    overlayCtx.lineTo(bx, by);
    overlayCtx.lineTo(bx + corner, by);
    // Top-right
    overlayCtx.moveTo(bx + bw - corner, by);
    overlayCtx.lineTo(bx + bw, by);
    overlayCtx.lineTo(bx + bw, by + corner);
    // Bottom-left
    overlayCtx.moveTo(bx, by + bh - corner);
    overlayCtx.lineTo(bx, by + bh);
    overlayCtx.lineTo(bx + corner, by + bh);
    // Bottom-right
    overlayCtx.moveTo(bx + bw - corner, by + bh);
    overlayCtx.lineTo(bx + bw, by + bh);
    overlayCtx.lineTo(bx + bw, by + bh - corner);
    overlayCtx.stroke();

    // Subtle status pill at bottom of video
    overlayCtx.fillStyle = 'rgba(11, 37, 69, 0.85)';
    overlayCtx.fillRect(14, height - 36, width - 28, 26);
    overlayCtx.fillStyle = '#ffffff';
    overlayCtx.font = '600 11px "Inter", sans-serif';
    overlayCtx.fillText(
      metrics.facePresent
        ? `✔ Face Detected in Frame  |  Liveness Verification: ${Math.min(100, Math.round(livenessProgress))}%`
        : `Please look straight at the camera and keep your face within the frame`,
      24,
      height - 19
    );
  }

  stopCamera() {
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    if (this.activeStream) {
      this.activeStream.getTracks().forEach((t) => t.stop());
      this.activeStream = null;
    }
  }

  // WebAuthn Hardware Passkey Registration (Fingerprint / Windows Hello / TouchID)
  async registerWebAuthnPasskey(account) {
    if (!window.PublicKeyCredential || !navigator.credentials) {
      throw new Error('WebAuthn Passkey API is not supported on this browser context.');
    }

    const challenge = new Uint8Array(32);
    window.crypto.getRandomValues(challenge);
    const userId = new TextEncoder().encode(account.id);

    const publicKey = {
      challenge,
      rp: {
        name: 'AICTE Regulation Bureau Portal (PS 26262)'
      },
      user: {
        id: userId,
        name: account.email,
        displayName: `${account.fullName} (${account.subRole})`
      },
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 },  // ES256
        { type: 'public-key', alg: -257 } // RS256
      ],
      authenticatorSelection: {
        userVerification: 'preferred'
      },
      timeout: 45000,
      attestation: 'none'
    };

    const credential = await navigator.credentials.create({ publicKey });
    const credIdBase64 = btoa(String.fromCharCode(...new Uint8Array(credential.rawId)));
    const record = {
      credentialId: credIdBase64,
      registeredAt: new Date().toLocaleTimeString(),
      accountEmail: account.email
    };
    this.saveWebAuthnCred(account.id, record);
    return record;
  }

  // WebAuthn Hardware Passkey Verification
  async verifyWebAuthnPasskey(account) {
    if (!window.PublicKeyCredential || !navigator.credentials) {
      throw new Error('WebAuthn Passkey API is not available.');
    }

    const challenge = new Uint8Array(32);
    window.crypto.getRandomValues(challenge);

    const publicKey = {
      challenge,
      timeout: 45000,
      userVerification: 'preferred'
    };

    const assertion = await navigator.credentials.get({ publicKey });
    return {
      verified: Boolean(assertion),
      credentialId: assertion ? btoa(String.fromCharCode(...new Uint8Array(assertion.rawId))).slice(0, 20) + '...' : 'PASSKEY-OK'
    };
  }
}

export const biometricEngine = new BiometricEngine();

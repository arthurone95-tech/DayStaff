import { toQR } from './vendor/toqr.mjs';

const encoder = new TextEncoder();
const RETURN_TTL_MS = 5_000;
const RETURN_REFRESH_MS = 4_000;

const ui = {
  initials: document.getElementById('initials'),
  staffCode: document.getElementById('staffCode'),
  modeLabel: document.getElementById('modeLabel'),
  sessionRow: document.getElementById('sessionRow'),
  sessionText: document.getElementById('sessionText'),
  message: document.getElementById('message'),
  actionButton: document.getElementById('actionButton'),
  resetButton: document.getElementById('resetButton'),
  qrSection: document.getElementById('qrSection'),
  qrCanvas: document.getElementById('qrCanvas'),
  qrTimer: document.getElementById('qrTimer'),
  alertBox: document.getElementById('alertBox'),
};

const state = {
  session: null,
  credential: null,
  busy: false,
  signingQr: false,
  signTimer: null,
  lastIssuedAt: 0,
  sessionExpired: false,
  returnKind: null,
};

const hmacKeys = new Map();

function base64Url(bytes) {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function base64UrlToBytes(value) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function randomBytes(length) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

async function hmac(secret, message) {
  let key = hmacKeys.get(secret);
  if (!key) {
    key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    hmacKeys.set(secret, key);
  }
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(message),
  );
  return base64Url(new Uint8Array(signature));
}

function parseSession() {
  const params = new URLSearchParams(window.location.search);
  const version = params.get('v');
  const mode = params.get('m');
  const code = (params.get('c') || '').trim().toUpperCase();
  const sessionId = params.get('s') || '';
  const nonce = params.get('n') || '';
  const initials = params.get('i') || '••';
  const issuedAt = Number(params.get('t'));
  const expiresAt = Number(params.get('x'));

  if (version !== '1') {
    throw new Error('This kiosk QR is not a DayStaff verification code.');
  }
  if (mode !== 'attend' && mode !== 'pair') {
    throw new Error('This kiosk QR has an unknown verification mode.');
  }
  if (!/^[A-Z0-9]{2,12}$/.test(code)) {
    throw new Error('This kiosk QR has an invalid staff code.');
  }
  if (!sessionId || !nonce) {
    throw new Error('This kiosk QR is missing its session information.');
  }
  if (!Number.isFinite(issuedAt) || !Number.isFinite(expiresAt)) {
    throw new Error('This kiosk QR has an invalid timestamp.');
  }
  return {
    version,
    mode,
    code,
    sessionId,
    nonce,
    initials,
    issuedAt,
    expiresAt,
  };
}

function storageKey(code) {
  return `daystaff.device.v1.${code}`;
}

function loadCredential(code) {
  try {
    const raw = window.localStorage.getItem(storageKey(code));
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw);
    if (
      !parsed ||
      typeof parsed.token !== 'string' ||
      typeof parsed.secret !== 'string' ||
      typeof parsed.credentialId !== 'string'
    ) {
      window.localStorage.removeItem(storageKey(code));
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function saveCredential(code, credential) {
  window.localStorage.setItem(storageKey(code), JSON.stringify(credential));
}

function setInitials(session) {
  ui.initials.textContent = session.initials || '••';
  ui.staffCode.textContent = `#${session.code}`;
  ui.modeLabel.textContent =
    session.mode === 'pair'
      ? 'Pair this phone with the staff profile'
      : 'Attendance verification';
  document.title =
    session.mode === 'pair'
      ? `DayStaff pairing #${session.code}`
      : `DayStaff attendance #${session.code}`;
}

function setMessage(text) {
  ui.message.textContent = text;
}

function clearAlert() {
  ui.alertBox.hidden = true;
  ui.alertBox.textContent = '';
  ui.alertBox.className = 'alert';
}

function showAlert(text, tone = 'danger') {
  ui.alertBox.hidden = false;
  ui.alertBox.textContent = text;
  ui.alertBox.className = `alert${tone === 'danger' ? '' : ` ${tone}`}`;
}

function hideAction() {
  ui.actionButton.hidden = true;
  ui.actionButton.disabled = false;
  ui.actionButton.textContent = '';
  ui.actionButton.onclick = null;
}

function showAction(label, handler) {
  ui.resetButton.hidden = true;
  ui.resetButton.onclick = null;
  ui.actionButton.hidden = false;
  ui.actionButton.disabled = state.busy;
  ui.actionButton.textContent = label;
  ui.actionButton.onclick = () => {
    if (!state.busy) {
      void handler();
    }
  };
}

function showReset(label, handler) {
  ui.resetButton.hidden = false;
  ui.resetButton.disabled = state.busy;
  ui.resetButton.textContent = label;
  ui.resetButton.onclick = () => {
    if (!state.busy) {
      void handler();
    }
  };
}

function setBusy(busy, label) {
  state.busy = busy;
  if (!ui.actionButton.hidden) {
    ui.actionButton.disabled = busy;
  }
  if (busy && label) {
    ui.actionButton.textContent = label;
  }
}

function formatError(error) {
  switch (error?.name) {
    case 'NotAllowedError':
      return 'The biometric check was cancelled or timed out. Keep the phone unlocked and try again.';
    case 'NotSupportedError':
      return 'This browser does not support the phone biometric API. Open this page in Safari or Chrome on the phone.';
    case 'SecurityError':
      return 'The verifier must be served over HTTPS to use the phone biometrics.';
    case 'InvalidStateError':
      return 'This phone already has a passkey for DayStaff. Remove the old passkey in phone settings, then pair again.';
    default:
      return (
        error?.message ||
        'The verification could not be completed. Please try again.'
      );
  }
}

async function platformBiometricAvailable() {
  if (
    !window.PublicKeyCredential ||
    !window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable
  ) {
    return null;
  }
  try {
    return await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return null;
  }
}

async function createPasskey(session) {
  if (
    !window.PublicKeyCredential ||
    !navigator.credentials ||
    !navigator.credentials.create
  ) {
    throw new Error(
      'This browser does not support phone biometrics. Open this page in a modern Safari or Chrome.',
    );
  }
  const available = await platformBiometricAvailable();
  if (available === false) {
    throw new Error(
      'This phone does not report a built-in biometric authenticator. Add Face ID or a fingerprint in phone settings, then try again.',
    );
  }
  const userId = randomBytes(16);
  const credential = await navigator.credentials.create({
    publicKey: {
      challenge: randomBytes(32),
      rp: { name: 'DayStaff', id: window.location.hostname },
      user: {
        id: userId,
        name: `staff-${session.code.toLowerCase()}@daystaff.local`,
        displayName: `DayStaff staff ${session.code}`,
      },
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 },
        { type: 'public-key', alg: -257 },
      ],
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        userVerification: 'required',
        residentKey: 'preferred',
      },
      timeout: 60_000,
      attestation: 'none',
    },
  });
  if (!credential || !credential.rawId) {
    throw new Error('The phone did not create a biometric credential.');
  }
  return credential;
}

async function verifyPasskey(record) {
  if (
    !navigator.credentials ||
    !navigator.credentials.get ||
    !window.PublicKeyCredential
  ) {
    throw new Error(
      'This browser does not support phone biometrics. Open this page in a modern Safari or Chrome.',
    );
  }
  const available = await platformBiometricAvailable();
  if (available === false) {
    throw new Error(
      'This phone does not report a built-in biometric authenticator. Add Face ID or a fingerprint in phone settings, then try again.',
    );
  }
  const assertion = await navigator.credentials.get({
    publicKey: {
      challenge: randomBytes(32),
      timeout: 60_000,
      rpId: window.location.hostname,
      userVerification: 'required',
      allowCredentials: [
        { type: 'public-key', id: base64UrlToBytes(record.credentialId) },
      ],
    },
  });
  if (!assertion) {
    throw new Error('The biometric check did not return a credential.');
  }
}

async function buildSignedPayload(kind, credential) {
  const session = state.session;
  const timestamp = Date.now();
  const payload = {
    v: 1,
    kind,
    code: session.code,
    sessionId: session.sessionId,
    timestamp,
    deviceToken: credential.token,
    biometric: true,
  };
  let canonical;
  if (kind === 'pair') {
    payload.deviceSecret = credential.secret;
    canonical = [
      'PAIR',
      1,
      'pair',
      session.code,
      session.sessionId,
      timestamp,
      credential.token,
      credential.secret,
    ].join('|');
  } else {
    canonical = [
      'ATTEND',
      1,
      'attend',
      session.code,
      session.sessionId,
      timestamp,
      credential.token,
    ].join('|');
  }
  payload.sig = await hmac(
    kind === 'pair' ? session.nonce : credential.secret,
    canonical,
  );
  return payload;
}

function drawQr(text) {
  const modules = toQR(encoder.encode(text));
  const extent = Math.round(Math.sqrt(modules.length));
  if (extent < 21) {
    throw new Error('The QR code could not be generated.');
  }
  const quietZone = 4;
  const total = extent + quietZone * 2;
  const scale = 8;
  const canvas = ui.qrCanvas;
  canvas.width = total * scale;
  canvas.height = total * scale;
  const context = canvas.getContext('2d');
  context.fillStyle = '#FFFFFF';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#06142B';
  for (let row = 0; row < extent; row += 1) {
    for (let column = 0; column < extent; column += 1) {
      if (modules[row * extent + column]) {
        context.fillRect(
          (column + quietZone) * scale,
          (row + quietZone) * scale,
          scale,
          scale,
        );
      }
    }
  }
}

function stopReturnQr() {
  if (state.signTimer) {
    window.clearInterval(state.signTimer);
    state.signTimer = null;
  }
  state.signingQr = false;
  state.lastIssuedAt = 0;
  state.returnKind = null;
  ui.qrSection.hidden = true;
  ui.qrCanvas.width = 0;
  ui.qrCanvas.height = 0;
  ui.qrTimer.textContent = 'Show this QR to the kiosk';
  ui.resetButton.hidden = true;
  ui.resetButton.onclick = null;
}

async function startReturnQr(kind, credential) {
  const session = state.session;
  if (!session || session.mode !== kind) {
    return;
  }
  if (Date.now() > session.expiresAt) {
    handleSessionExpired();
    return;
  }
  stopReturnQr();
  state.returnKind = kind;
  clearAlert();

  const signOnce = async () => {
    if (state.signingQr || state.sessionExpired || !state.returnKind) {
      return;
    }
    if (Date.now() > session.expiresAt) {
      handleSessionExpired();
      return;
    }
    state.signingQr = true;
    try {
      const payload = await buildSignedPayload(kind, credential);
      const raw = `DST1:${base64Url(
        encoder.encode(JSON.stringify(payload)),
      )}`;
      drawQr(raw);
      state.lastIssuedAt = payload.timestamp;
      ui.qrSection.hidden = false;
      hideAction();
      showReset(
        kind === 'pair' ? 'Pair again' : 'Verify again',
        kind === 'pair'
          ? () => handlePair(session)
          : () => handleAttendance(session),
      );
      showAlert(
        kind === 'pair'
          ? 'Phone paired. Hold the signed QR up to the kiosk camera now.'
          : 'Identity confirmed. Hold the signed QR up to the kiosk camera now.',
        'success',
      );
      setMessage(
        kind === 'pair'
          ? 'The kiosk will store the device token and finish pairing.'
          : 'The signed code expires in a few seconds. It refreshes automatically.',
      );
    } catch (error) {
      stopReturnQr();
      showAlert(formatError(error));
      if (kind === 'pair') {
        setupPairAction(session);
      } else {
        setupAttendanceAction(session);
      }
    } finally {
      state.signingQr = false;
    }
  };

  await signOnce();
  if (!state.sessionExpired && state.returnKind) {
    state.signTimer = window.setInterval(() => {
      void signOnce();
    }, RETURN_REFRESH_MS);
  }
}

function handleSessionExpired() {
  if (!state.session || state.sessionExpired) {
    return;
  }
  state.sessionExpired = true;
  stopReturnQr();
  hideAction();
  ui.resetButton.hidden = true;
  ui.sessionRow.classList.add('warning');
  ui.sessionText.textContent = 'Kiosk session expired';
  showAlert(
    'This kiosk code has expired. Scan the fresh QR shown on the kiosk to continue.',
    'info',
  );
}

function setupPairAction(session) {
  const existing = state.credential;
  if (existing) {
    setMessage(
      'This phone already holds a pairing for this staff code. Pairing again replaces the old device token and secret.',
    );
  } else {
    setMessage(
      'No pairing was found on this phone. Confirm with Face ID or your fingerprint to create a device-bound credential.',
    );
  }
  showAction(
    existing
      ? 'Replace this phone pairing'
      : 'Pair with Face ID / fingerprint',
    () => handlePair(session),
  );
}

function setupAttendanceAction(session) {
  if (!state.credential) {
    hideAction();
    showAlert(
      `This phone is not paired for staff code #${session.code}. Ask an administrator to pair it from the staff profile, then scan a fresh kiosk QR.`,
      'info',
    );
    setMessage(
      'Pairing is completed once by an administrator from the staff profile. After that, attendance only needs your phone biometrics.',
    );
    return;
  }
  setMessage(
    'Paired phone found. Confirm with Face ID or your fingerprint to sign this attendance session.',
  );
  showAction('Verify with Face ID / fingerprint', () =>
    handleAttendance(session),
  );
}

async function handlePair(session) {
  if (state.busy || state.sessionExpired) {
    return;
  }
  clearAlert();
  stopReturnQr();
  setBusy(true, 'Waiting for Face ID / fingerprint…');
  try {
    const credential = await createPasskey(session);
    const record = {
      token: base64Url(randomBytes(18)),
      secret: base64Url(randomBytes(32)),
      credentialId: base64Url(new Uint8Array(credential.rawId)),
      pairedAt: Date.now(),
    };
    saveCredential(session.code, record);
    state.credential = record;
    setBusy(false);
    await startReturnQr('pair', record);
  } catch (error) {
    setBusy(false);
    showAlert(formatError(error));
    setupPairAction(session);
  }
}

async function handleAttendance(session) {
  if (state.busy || state.sessionExpired || !state.credential) {
    return;
  }
  clearAlert();
  hideAction();
  stopReturnQr();
  setBusy(true, 'Waiting for Face ID / fingerprint…');
  showAction('Waiting for Face ID / fingerprint…', () => {});
  setBusy(true);
  try {
    await verifyPasskey(state.credential);
    if (Date.now() > session.expiresAt) {
      handleSessionExpired();
      return;
    }
    setBusy(false);
    await startReturnQr('attend', state.credential);
  } catch (error) {
    setBusy(false);
    showAlert(formatError(error));
    setupAttendanceAction(session);
  }
}

function tick() {
  const session = state.session;
  if (!session || state.sessionExpired) {
    return;
  }
  const now = Date.now();
  const remaining = Math.max(0, Math.ceil((session.expiresAt - now) / 1000));
  ui.sessionText.textContent =
    remaining > 0
      ? `Kiosk session: ${remaining}s remaining`
      : 'Kiosk session expired';
  ui.sessionRow.classList.toggle('warning', remaining <= 3);
  if (remaining <= 0) {
    handleSessionExpired();
    return;
  }
  if (state.lastIssuedAt && !ui.qrSection.hidden) {
    const qrRemaining = Math.max(
      0,
      Math.ceil((state.lastIssuedAt + RETURN_TTL_MS - now) / 1000),
    );
    ui.qrTimer.textContent =
      qrRemaining > 0
        ? `Show to kiosk: ${qrRemaining}s`
        : 'Refreshing signed code…';
    ui.qrTimer.classList.toggle('warning', qrRemaining <= 2);
  }
}

async function init() {
  try {
    state.session = parseSession();
  } catch (error) {
    ui.staffCode.textContent = 'DayStaff';
    ui.modeLabel.textContent = 'Verification link';
    ui.sessionText.textContent = 'No active kiosk session';
    ui.sessionRow.classList.add('warning');
    setMessage(
      'This page is opened by scanning a QR code displayed on the DayStaff kiosk.',
    );
    showAlert(formatError(error), 'danger');
    hideAction();
    return;
  }

  setInitials(state.session);
  const session = state.session;

  if (!window.isSecureContext) {
    ui.staffCode.textContent = `#${session.code}`;
    ui.sessionText.textContent = 'HTTPS required';
    ui.sessionRow.classList.add('warning');
    showAlert(
      'Open this page over HTTPS. Phone biometrics are disabled on insecure addresses.',
      'danger',
    );
    hideAction();
    return;
  }

  if (!window.crypto?.subtle) {
    ui.sessionText.textContent = 'Browser not supported';
    ui.sessionRow.classList.add('warning');
    showAlert(
      'This browser does not expose the cryptography needed for signed QR codes. Use a current Safari or Chrome.',
      'danger',
    );
    hideAction();
    return;
  }

  if (Date.now() > session.expiresAt) {
    handleSessionExpired();
    return;
  }

  if (session.mode === 'pair') {
    state.credential = loadCredential(session.code);
    setupPairAction(session);
  } else {
    state.credential = loadCredential(session.code);
    setupAttendanceAction(session);
  }

  window.setInterval(tick, 250);
  tick();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      // Offline caching is a progressive enhancement; verification still works.
    });
  }
}

void init();

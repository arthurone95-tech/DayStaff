/**
 * Two-way visual QR protocol.
 *
 * Kiosk -> phone : a short-lived session URL containing the staff code, session
 *                   id, issue/expiry times and a random nonce. The URL points at
 *                   the kiosk's embedded local server.
 * Phone -> kiosk : a signed attendance payload posted to the kiosk's local API
 *                   after the phone confirms the biometric locally.
 *
 * No data leaves the kiosk or the phone. The phone verifier runs through the
 * native biometric flow, so no public internet host is required.
 */

import * as Crypto from 'expo-crypto';

import { QR_PAIRING_TTL_MS, QR_SESSION_TTL_MS } from '../config/app';
import type { Staff } from '../types';
import { getQrVerifierUrl } from './appSettings';
import { bytesToBase64Url, utf8ToBytes } from './qrCrypto';

export type QrMode = 'attend' | 'pair';

export interface QrSession {
  mode: QrMode;
  staffId: number;
  staffCode: string;
  staffName: string;
  initials: string;
  sessionId: string;
  nonce: string;
  issuedAt: number;
  expiresAt: number;
  qrUrl: string;
}

function randomUrlToken(byteCount = 24): string {
  return bytesToBase64Url(Crypto.getRandomBytes(byteCount));
}

/** First letters of the first two words, e.g. "Ama Mensah" -> "A.M." */
export function maskInitials(fullName: string): string {
  const parts = fullName
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  if (parts.length === 0) {
    return '••';
  }
  return parts.map((part) => `${part.charAt(0).toUpperCase()}.`).join('');
}

function appendQuery(base: string, query: string): string {
  return `${base}${base.includes('?') ? '&' : '?'}${query}`;
}

export function createQrSession(
  staff: Staff,
  mode: QrMode,
  verifierUrl?: string,
  now: number = Date.now(),
): QrSession {
  const ttl = mode === 'pair' ? QR_PAIRING_TTL_MS : QR_SESSION_TTL_MS;
  const sessionId = randomUrlToken(18);
  const nonce = randomUrlToken(24);
  const initials = maskInitials(staff.fullName);
  const expiresAt = now + ttl;
  const kioskBaseUrl = verifierUrl || getQrVerifierUrl();
  const params = [
    ['v', '1'],
    ['m', mode],
    ['c', staff.staffCode],
    ['s', sessionId],
    ['t', String(now)],
    ['x', String(expiresAt)],
    ['n', nonce],
    ['i', initials],
    ['k', kioskBaseUrl],
  ]
    .map(
      ([key, value]) =>
        `${encodeURIComponent(key)}=${encodeURIComponent(value)}`,
    )
    .join('&');
  return {
    mode,
    staffId: staff.id,
    staffCode: staff.staffCode,
    staffName: staff.fullName,
    initials,
    sessionId,
    nonce,
    issuedAt: now,
    expiresAt,
    qrUrl: `daystaff://verify?${params}`,
  };
}

export function isSessionExpired(session: QrSession, now: number = Date.now()): boolean {
  return now > session.expiresAt;
}

export function sessionRemainingSeconds(
  session: QrSession,
  now: number = Date.now(),
): number {
  return Math.max(0, Math.ceil((session.expiresAt - now) / 1000));
}

export function parseQrSession(raw: string): QrSession | null {
  const queryIndex = raw.indexOf('?');
  const query = queryIndex >= 0 ? raw.slice(queryIndex + 1) : '';
  const pairs = query.split('&').filter(Boolean);
  const params = new Map<string, string>();
  for (const pair of pairs) {
    const separator = pair.indexOf('=');
    if (separator < 0) {
      continue;
    }
    const key = pair.slice(0, separator);
    const val = pair.slice(separator + 1);
    params.set(key, val);
  }

  const version = params.get('v');
  const mode = params.get('m') === 'pair' ? 'pair' : params.get('m') === 'attend' ? 'attend' : null;
  const code = (params.get('c') || '').toUpperCase();
  const sessionId = params.get('s') || '';
  const nonce = params.get('n') || '';
  const initials = params.get('i') || '';
  const issuedAt = Number(params.get('t') || 0);
  const expiresAt = Number(params.get('x') || 0);

  if (
    version !== '1' ||
    !mode ||
    !code ||
    !sessionId ||
    !nonce ||
    !Number.isFinite(expiresAt) ||
    !Number.isFinite(issuedAt)
  ) {
    return null;
  }

  return {
    mode,
    staffId: 0,
    staffCode: code,
    staffName: initials,
    initials,
    sessionId,
    nonce,
    issuedAt,
    expiresAt,
    qrUrl: raw,
  };
}

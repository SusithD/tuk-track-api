import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { env } from '../config/env.js';

const ISSUER = 'tuk-track-api';

/**
 * Sign a short-lived access token. Carries identity + scope claims so the
 * RBAC middleware can authorize without an extra DB lookup on every request.
 */
export function signAccessToken(user) {
  const payload = {
    sub: user.id,
    role: user.role,
    province_id: user.province_id || null,
    station_id: user.station_id || null,
  };
  return jwt.sign(payload, env.JWT_SECRET, {
    issuer: ISSUER,
    expiresIn: env.JWT_ACCESS_TTL,
    algorithm: 'HS256',
  });
}

export function verifyAccessToken(token) {
  return jwt.verify(token, env.JWT_SECRET, { issuer: ISSUER, algorithms: ['HS256'] });
}

/**
 * Refresh tokens are 256-bit random strings; we never sign them as JWTs.
 * The plaintext is returned to the client; only sha256(token) is stored.
 * This means we get O(1) lookup on revocation without any cryptographic
 * cost on every refresh call.
 */
export function generateRefreshToken() {
  const raw = crypto.randomBytes(48).toString('base64url');
  const hash = crypto.createHash('sha256').update(raw).digest('hex');
  return { raw, hash };
}

export function hashRefreshToken(raw) {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

/**
 * Parse JWT TTL strings (e.g. "15m", "7d") into milliseconds — used so the
 * refresh-token row's `expires_at` matches what the client should expect.
 */
export function parseTtlMs(ttl) {
  const match = /^(\d+)([smhd])$/.exec(ttl);
  if (!match) throw new Error(`Invalid TTL: ${ttl}`);
  const n = Number(match[1]);
  const unit = match[2];
  const map = { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  return n * map[unit];
}

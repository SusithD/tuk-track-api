import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { env } from '../config/env.js';

const ISSUER = 'tuk-track-api';

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

export function generateRefreshToken() {
  const raw = crypto.randomBytes(48).toString('base64url');
  const hash = crypto.createHash('sha256').update(raw).digest('hex');
  return { raw, hash };
}

export function hashRefreshToken(raw) {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

export function parseTtlMs(ttl) {
  const match = /^(\d+)([smhd])$/.exec(ttl);
  if (!match) throw new Error(`Invalid TTL: ${ttl}`);
  const n = Number(match[1]);
  const unit = match[2];
  const map = { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  return n * map[unit];
}

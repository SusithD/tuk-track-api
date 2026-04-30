import createError from 'http-errors';
import { db } from '../../config/database.js';
import { verifyPassword } from '../../utils/passwords.js';
import {
  signAccessToken,
  generateRefreshToken,
  hashRefreshToken,
  parseTtlMs,
} from '../../utils/tokens.js';
import { env } from '../../config/env.js';

const SAFE_USER_FIELDS = [
  'id',
  'email',
  'full_name',
  'role',
  'province_id',
  'station_id',
  'status',
  'last_login_at',
  'created_at',
];

/**
 * Authenticate a user by email + password and issue a token pair.
 * Refresh tokens are stored only as their sha256 hash so a database leak
 * does not yield usable session credentials.
 */
export async function loginUser({ email, password, userAgent, ip }) {
  const user = await db('users').whereRaw('lower(email) = lower(?)', [email]).first();
  if (!user) throw createError(401, 'Invalid credentials', { code: 'INVALID_CREDENTIALS' });

  if (user.status !== 'active') {
    throw createError(403, 'Account disabled', { code: 'ACCOUNT_DISABLED' });
  }

  const ok = await verifyPassword(password, user.password_hash);
  if (!ok) throw createError(401, 'Invalid credentials', { code: 'INVALID_CREDENTIALS' });

  await db('users').where({ id: user.id }).update({ last_login_at: db.fn.now() });

  return issueTokens(user, { userAgent, ip });
}

export async function rotateRefreshToken({ rawToken, userAgent, ip }) {
  const token_hash = hashRefreshToken(rawToken);
  const row = await db('refresh_tokens').where({ token_hash }).first();
  if (!row) throw createError(401, 'Refresh token invalid', { code: 'REFRESH_INVALID' });
  if (row.revoked_at) {
    // Reuse of a revoked token is suspicious; revoke the entire chain.
    await db('refresh_tokens').where({ user_id: row.user_id }).update({ revoked_at: db.fn.now() });
    throw createError(401, 'Refresh token reuse detected', { code: 'REFRESH_REUSED' });
  }
  if (new Date(row.expires_at) <= new Date()) {
    throw createError(401, 'Refresh token expired', { code: 'REFRESH_EXPIRED' });
  }

  const user = await db('users').where({ id: row.user_id }).first();
  if (!user || user.status !== 'active') {
    throw createError(403, 'Account disabled', { code: 'ACCOUNT_DISABLED' });
  }

  await db('refresh_tokens').where({ id: row.id }).update({ revoked_at: db.fn.now() });
  return issueTokens(user, { userAgent, ip });
}

export async function revokeRefreshToken(rawToken) {
  const token_hash = hashRefreshToken(rawToken);
  await db('refresh_tokens').where({ token_hash }).update({ revoked_at: db.fn.now() });
}

export async function getUserById(id) {
  return db('users').where({ id }).first(SAFE_USER_FIELDS);
}

async function issueTokens(user, { userAgent, ip } = {}) {
  const accessToken = signAccessToken(user);
  const { raw: refreshToken, hash: token_hash } = generateRefreshToken();
  const ttlMs = parseTtlMs(env.JWT_REFRESH_TTL);

  await db('refresh_tokens').insert({
    user_id: user.id,
    token_hash,
    expires_at: new Date(Date.now() + ttlMs),
    user_agent: userAgent?.slice(0, 240) || null,
    ip: ip?.slice(0, 64) || null,
  });

  return {
    accessToken,
    refreshToken,
    tokenType: 'Bearer',
    expiresIn: Math.floor(parseTtlMs(env.JWT_ACCESS_TTL) / 1000),
    user: pickSafeUser(user),
  };
}

export function pickSafeUser(user) {
  return SAFE_USER_FIELDS.reduce((out, k) => ((out[k] = user[k]), out), {});
}

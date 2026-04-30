import createError from 'http-errors';
import { verifyAccessToken } from '../utils/tokens.js';
import {
  bodySha256Hex,
  buildSigningString,
  computeSignature,
  timingSafeEqualHex,
  isFreshTimestamp,
  nonceCache,
} from '../utils/hmac.js';
import { db } from '../config/database.js';

function extractBearer(req) {
  const header = req.header('authorization') || '';
  const [scheme, token] = header.split(' ');
  if (!scheme || scheme.toLowerCase() !== 'bearer' || !token) return null;
  return token;
}

/**
 * Verifies the Bearer JWT and attaches a stable `req.user` object derived
 * from the token claims. We deliberately do NOT re-fetch the user on every
 * request — the access token is short-lived (15 min) and revocation is
 * handled by rotating refresh tokens.
 */
export function requireUser(req, _res, next) {
  const token = extractBearer(req);
  if (!token) return next(createError(401, 'Bearer token required', { code: 'AUTH_REQUIRED' }));

  try {
    const payload = verifyAccessToken(token);
    req.user = {
      id: payload.sub,
      role: payload.role,
      province_id: payload.province_id,
      station_id: payload.station_id,
    };
    return next();
  } catch (err) {
    const code = err.name === 'TokenExpiredError' ? 'TOKEN_EXPIRED' : 'TOKEN_INVALID';
    return next(createError(401, err.message, { code }));
  }
}

/**
 * Restrict to one or more roles. Order is unimportant — duplicates allowed,
 * since the rule is "must match at least one".
 */
export function requireRole(...roles) {
  return (req, _res, next) => {
    if (!req.user) return next(createError(401, 'Not authenticated', { code: 'AUTH_REQUIRED' }));
    if (!roles.includes(req.user.role)) {
      return next(
        createError(403, `Role '${req.user.role}' is not permitted on this resource`, {
          code: 'FORBIDDEN',
        }),
      );
    }
    return next();
  };
}

/**
 * Tracking-device authentication via an HMAC-SHA256 signed request.
 *
 * Required headers:
 *   x-key-id      device key identifier
 *   x-timestamp   unix epoch seconds (within ±5min of server clock)
 *   x-nonce       unique-per-window string (replay defence)
 *   x-signature   hex(HMAC-SHA256(secret, "<ts>\n<nonce>\n<METHOD>\n<path>\n<sha256(body)>"))
 *
 * On success, attaches `req.device` and `req.vehicle`.
 */
export async function requireDevice(req, _res, next) {
  try {
    const keyId = req.header('x-key-id');
    const timestamp = Number(req.header('x-timestamp'));
    const nonce = req.header('x-nonce');
    const signature = req.header('x-signature');

    if (!keyId || !timestamp || !nonce || !signature) {
      throw createError(401, 'Missing device signature headers', { code: 'DEVICE_AUTH_REQUIRED' });
    }
    if (!isFreshTimestamp(timestamp)) {
      throw createError(401, 'Stale timestamp — outside acceptable clock skew', {
        code: 'DEVICE_TIMESTAMP_STALE',
      });
    }

    const nonceKey = `${keyId}:${nonce}`;
    if (nonceCache.has(nonceKey)) {
      throw createError(409, 'Nonce replay detected', { code: 'DEVICE_NONCE_REPLAY' });
    }

    const device = await db('devices')
      .where({ key_id: keyId, status: 'active' })
      .first('id', 'vehicle_id', 'hmac_secret');
    if (!device) {
      throw createError(401, 'Unknown or revoked device', { code: 'DEVICE_UNKNOWN' });
    }

    const rawBody = req.rawBody || '';
    const expected = computeSignature(
      device.hmac_secret,
      buildSigningString({
        timestamp,
        nonce,
        method: req.method,
        path: req.originalUrl.split('?')[0],
        bodyHash: bodySha256Hex(rawBody),
      }),
    );
    if (!timingSafeEqualHex(signature, expected)) {
      throw createError(401, 'Invalid signature', { code: 'DEVICE_SIGNATURE_INVALID' });
    }

    nonceCache.add(nonceKey);
    req.device = { id: device.id, vehicle_id: device.vehicle_id };
    return next();
  } catch (err) {
    return next(err);
  }
}

import crypto from 'node:crypto';

/**
 * Open-standards HMAC request authentication for tracking devices, modelled
 * on AWS SigV4 / RFC 9421 (HTTP Message Signatures). Signing string:
 *
 *   `${timestamp}\n${nonce}\n${method}\n${path}\n${sha256(body)}`
 *
 * Replay defence: timestamp must be inside ±SKEW_SECONDS, and the (key, nonce)
 * pair must not have been seen inside NONCE_TTL_MS.
 */
export const SKEW_SECONDS = 300; // 5 minutes
export const NONCE_TTL_MS = 10 * 60 * 1000;

export function bodySha256Hex(rawBody) {
  return crypto
    .createHash('sha256')
    .update(rawBody || '')
    .digest('hex');
}

export function buildSigningString({ timestamp, nonce, method, path, bodyHash }) {
  return `${timestamp}\n${nonce}\n${method.toUpperCase()}\n${path}\n${bodyHash}`;
}

export function computeSignature(secret, signingString) {
  return crypto.createHmac('sha256', secret).update(signingString).digest('hex');
}

export function timingSafeEqualHex(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
}

export function isFreshTimestamp(unixSeconds, nowMs = Date.now()) {
  if (!Number.isFinite(unixSeconds)) return false;
  const deltaSec = Math.abs(nowMs / 1000 - unixSeconds);
  return deltaSec <= SKEW_SECONDS;
}

/**
 * In-memory TTL-bounded set used as a nonce cache. Sufficient for a single
 * Node instance; behind a multi-instance deploy this should be Redis.
 * The Limitations section of the report flags this trade-off.
 */
export class TtlSet {
  constructor(ttlMs = NONCE_TTL_MS) {
    this.ttlMs = ttlMs;
    this.map = new Map();
  }

  has(key) {
    const exp = this.map.get(key);
    if (!exp) return false;
    if (exp < Date.now()) {
      this.map.delete(key);
      return false;
    }
    return true;
  }

  add(key) {
    this.map.set(key, Date.now() + this.ttlMs);
  }

  prune() {
    const now = Date.now();
    for (const [k, exp] of this.map) {
      if (exp < now) this.map.delete(k);
    }
  }

  get size() {
    return this.map.size;
  }
}

export const nonceCache = new TtlSet();
setInterval(() => nonceCache.prune(), 60_000).unref();

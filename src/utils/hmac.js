import crypto from 'node:crypto';

export const SKEW_SECONDS = 300;
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
  return Math.abs(nowMs / 1000 - unixSeconds) <= SKEW_SECONDS;
}

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

import {
  bodySha256Hex,
  buildSigningString,
  computeSignature,
  timingSafeEqualHex,
  isFreshTimestamp,
  TtlSet,
} from '../../src/utils/hmac.js';

describe('bodySha256Hex', () => {
  it('returns 64 hex chars for any input', () => {
    expect(bodySha256Hex('')).toMatch(/^[a-f0-9]{64}$/);
    expect(bodySha256Hex('hello')).toMatch(/^[a-f0-9]{64}$/);
  });

  it('treats null and undefined as empty', () => {
    const empty = bodySha256Hex('');
    expect(bodySha256Hex(null)).toBe(empty);
    expect(bodySha256Hex(undefined)).toBe(empty);
  });

  it('produces a different hash for a 1-character change', () => {
    expect(bodySha256Hex('hello')).not.toBe(bodySha256Hex('hellp'));
  });
});

describe('buildSigningString', () => {
  it('joins fields with newlines in canonical order', () => {
    const s = buildSigningString({
      timestamp: 1714649400,
      nonce: 'abc',
      method: 'POST',
      path: '/foo',
      bodyHash: 'deadbeef',
    });
    expect(s).toBe('1714649400\nabc\nPOST\n/foo\ndeadbeef');
  });

  it('uppercases the method', () => {
    const s = buildSigningString({
      timestamp: 1,
      nonce: 'n',
      method: 'post',
      path: '/x',
      bodyHash: 'h',
    });
    expect(s).toContain('\nPOST\n');
  });
});

describe('computeSignature', () => {
  it('is deterministic for the same inputs', () => {
    const sig1 = computeSignature('secret', 'msg');
    const sig2 = computeSignature('secret', 'msg');
    expect(sig1).toBe(sig2);
  });

  it('changes when the secret changes', () => {
    expect(computeSignature('a', 'msg')).not.toBe(computeSignature('b', 'msg'));
  });

  it('changes when the message changes', () => {
    expect(computeSignature('s', 'msgA')).not.toBe(computeSignature('s', 'msgB'));
  });

  it('produces 64 hex chars (sha256 output)', () => {
    expect(computeSignature('s', 'm')).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe('timingSafeEqualHex', () => {
  it('returns true for identical hex strings', () => {
    expect(timingSafeEqualHex('deadbeef', 'deadbeef')).toBe(true);
  });

  it('returns false for different content of same length', () => {
    expect(timingSafeEqualHex('deadbeef', 'deadbee0')).toBe(false);
  });

  it('returns false for different lengths (does not throw)', () => {
    expect(timingSafeEqualHex('abcd', 'abcdef')).toBe(false);
  });

  it('returns false for non-string inputs', () => {
    expect(timingSafeEqualHex(null, 'abcd')).toBe(false);
    expect(timingSafeEqualHex('abcd', undefined)).toBe(false);
  });
});

describe('isFreshTimestamp', () => {
  const NOW_MS = 1_714_649_400_000;
  const NOW_S = NOW_MS / 1000;

  it('accepts the exact current second', () => {
    expect(isFreshTimestamp(NOW_S, NOW_MS)).toBe(true);
  });

  it('accepts ±5 minutes', () => {
    expect(isFreshTimestamp(NOW_S - 300, NOW_MS)).toBe(true);
    expect(isFreshTimestamp(NOW_S + 300, NOW_MS)).toBe(true);
  });

  it('rejects beyond ±5 minutes', () => {
    expect(isFreshTimestamp(NOW_S - 301, NOW_MS)).toBe(false);
    expect(isFreshTimestamp(NOW_S + 301, NOW_MS)).toBe(false);
  });

  it('rejects non-finite timestamps', () => {
    expect(isFreshTimestamp(NaN, NOW_MS)).toBe(false);
    expect(isFreshTimestamp(undefined, NOW_MS)).toBe(false);
  });
});

describe('TtlSet', () => {
  it('treats added keys as present', () => {
    const s = new TtlSet(60_000);
    s.add('k');
    expect(s.has('k')).toBe(true);
    expect(s.has('other')).toBe(false);
  });

  it('expires keys after TTL elapses', () => {
    const s = new TtlSet(1);
    s.add('k');
    return new Promise((resolve) =>
      setTimeout(() => {
        expect(s.has('k')).toBe(false);
        resolve();
      }, 5),
    );
  });

  it('reports size and prunes expired entries', () => {
    const s = new TtlSet(1);
    s.add('a');
    s.add('b');
    expect(s.size).toBe(2);
    return new Promise((resolve) =>
      setTimeout(() => {
        s.prune();
        expect(s.size).toBe(0);
        resolve();
      }, 5),
    );
  });
});

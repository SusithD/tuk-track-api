import {
  signAccessToken,
  verifyAccessToken,
  generateRefreshToken,
  hashRefreshToken,
  parseTtlMs,
} from '../../src/utils/tokens.js';

const sampleUser = {
  id: 'a194d183-b4bb-4bc8-8e48-b87c67c3eca1',
  role: 'station',
  province_id: 'p-uuid',
  station_id: 's-uuid',
};

describe('signAccessToken / verifyAccessToken', () => {
  it('round-trips identity claims', () => {
    const token = signAccessToken(sampleUser);
    const decoded = verifyAccessToken(token);
    expect(decoded.sub).toBe(sampleUser.id);
    expect(decoded.role).toBe('station');
    expect(decoded.province_id).toBe('p-uuid');
    expect(decoded.station_id).toBe('s-uuid');
  });

  it('issues a JWT with the expected issuer', () => {
    const decoded = verifyAccessToken(signAccessToken(sampleUser));
    expect(decoded.iss).toBe('tuk-track-api');
  });

  it('rejects a tampered token', () => {
    const token = signAccessToken(sampleUser);
    const parts = token.split('.');
    const tampered = `${parts[0]}.${parts[1]}AAA.${parts[2]}`;
    expect(() => verifyAccessToken(tampered)).toThrow();
  });

  it('null province_id and station_id default cleanly for HQ users', () => {
    const decoded = verifyAccessToken(signAccessToken({ id: 'h', role: 'hq' }));
    expect(decoded.province_id).toBeNull();
    expect(decoded.station_id).toBeNull();
  });
});

describe('generateRefreshToken + hashRefreshToken', () => {
  it('generates a non-empty random token plus its sha256 hash', () => {
    const { raw, hash } = generateRefreshToken();
    expect(typeof raw).toBe('string');
    expect(raw.length).toBeGreaterThan(40);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('hashRefreshToken produces a stable hash for the same input', () => {
    const { raw } = generateRefreshToken();
    expect(hashRefreshToken(raw)).toBe(hashRefreshToken(raw));
  });

  it('different raw tokens hash to different values', () => {
    const a = generateRefreshToken();
    const b = generateRefreshToken();
    expect(a.raw).not.toBe(b.raw);
    expect(a.hash).not.toBe(b.hash);
  });
});

describe('parseTtlMs', () => {
  it('parses common JWT TTL strings', () => {
    expect(parseTtlMs('30s')).toBe(30_000);
    expect(parseTtlMs('15m')).toBe(15 * 60_000);
    expect(parseTtlMs('2h')).toBe(2 * 3_600_000);
    expect(parseTtlMs('7d')).toBe(7 * 86_400_000);
  });

  it('throws on malformed input', () => {
    expect(() => parseTtlMs('abc')).toThrow(/Invalid TTL/);
    expect(() => parseTtlMs('15')).toThrow(/Invalid TTL/);
  });
});

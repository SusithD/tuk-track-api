import { honorLastModified, publicCache, privateNoStore } from '../../src/utils/cache-headers.js';

function fakeRes() {
  const headers = {};
  let statusCode;
  let ended = false;
  return {
    headers,
    statusCode: () => statusCode,
    wasEnded: () => ended,
    setHeader: (k, v) => (headers[k] = v),
    status(code) {
      statusCode = code;
      return this;
    },
    end() {
      ended = true;
    },
  };
}

describe('honorLastModified', () => {
  const lastMod = new Date('2026-05-01T12:00:00Z');

  it('sets Last-Modified header and returns false when no If-Modified-Since', () => {
    const res = fakeRes();
    const req = { header: () => undefined };
    expect(honorLastModified(req, res, lastMod)).toBe(false);
    expect(res.headers['Last-Modified']).toBe(lastMod.toUTCString());
  });

  it('returns 304 when If-Modified-Since is at or after lastModified', () => {
    const res = fakeRes();
    const req = { header: (n) => (n === 'if-modified-since' ? lastMod.toUTCString() : null) };
    expect(honorLastModified(req, res, lastMod)).toBe(true);
    expect(res.statusCode()).toBe(304);
    expect(res.wasEnded()).toBe(true);
  });

  it('returns false when the resource is newer than If-Modified-Since', () => {
    const res = fakeRes();
    const earlier = new Date(lastMod.getTime() - 60_000);
    const req = { header: (n) => (n === 'if-modified-since' ? earlier.toUTCString() : null) };
    expect(honorLastModified(req, res, lastMod)).toBe(false);
    expect(res.wasEnded()).toBe(false);
  });

  it('returns false silently when lastModified is invalid', () => {
    const res = fakeRes();
    expect(honorLastModified({ header: () => null }, res, null)).toBe(false);
    expect(honorLastModified({ header: () => null }, res, new Date('not-a-date'))).toBe(false);
  });
});

describe('publicCache + privateNoStore middleware', () => {
  it('publicCache(300) sets Cache-Control: public, max-age=300, must-revalidate', () => {
    const res = fakeRes();
    let nextCalled = false;
    publicCache(300)({}, res, () => (nextCalled = true));
    expect(res.headers['Cache-Control']).toBe('public, max-age=300, must-revalidate');
    expect(nextCalled).toBe(true);
  });

  it('privateNoStore sets Cache-Control: no-store, private', () => {
    const res = fakeRes();
    let nextCalled = false;
    privateNoStore({}, res, () => (nextCalled = true));
    expect(res.headers['Cache-Control']).toBe('no-store, private');
    expect(nextCalled).toBe(true);
  });
});

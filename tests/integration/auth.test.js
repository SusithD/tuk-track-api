import request from 'supertest';
import { createApp } from '../../src/app.js';
import { db, truncateAll } from '../setup/db.js';
import { makeUser } from '../setup/factories.js';

const app = createApp();

beforeAll(async () => {
  await truncateAll();
});

afterAll(async () => {
  await db.destroy();
});

describe('POST /api/v1/auth/login', () => {
  beforeEach(truncateAll);

  it('issues access + refresh tokens for valid credentials', async () => {
    const user = await makeUser({ role: 'hq', password: 'CorrectHorseBatteryStaple1!' });

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: 'CorrectHorseBatteryStaple1!' });

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(res.body.refreshToken).toEqual(expect.any(String));
    expect(res.body.tokenType).toBe('Bearer');
    expect(res.body.expiresIn).toBeGreaterThan(0);
    expect(res.body.user.email).toBe(user.email);
    expect(res.body.user.role).toBe('hq');
    expect(res.body.user.password_hash).toBeUndefined();
  });

  it('rejects unknown email with 401', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'nobody@example.com', password: 'whatever' });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('rejects wrong password with 401 (no user enumeration)', async () => {
    const user = await makeUser({ role: 'hq', password: 'right-password' });
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: 'wrong-password' });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('rejects disabled accounts with 403', async () => {
    const user = await makeUser({ role: 'hq', password: 'pw1', status: 'disabled' });
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: 'pw1' });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('ACCOUNT_DISABLED');
  });

  it('returns 422 on malformed body', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({ email: 'not-an-email' });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('POST /api/v1/auth/refresh', () => {
  beforeEach(truncateAll);

  it('rotates the refresh token and returns a new pair', async () => {
    const user = await makeUser({ role: 'hq', password: 'pw1' });
    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: 'pw1' });

    const refresh = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: login.body.refreshToken });

    expect(refresh.status).toBe(200);
    expect(refresh.body.refreshToken).not.toBe(login.body.refreshToken);
    expect(refresh.body.accessToken).toEqual(expect.any(String));
  });

  it('rejects a previously used (revoked) refresh token AND revokes the chain', async () => {
    const user = await makeUser({ role: 'hq', password: 'pw1' });
    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: 'pw1' });

    const first = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: login.body.refreshToken });
    expect(first.status).toBe(200);

    // Reusing the original (now revoked) token must fail and revoke the new one too.
    const reuse = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: login.body.refreshToken });
    expect(reuse.status).toBe(401);
    expect(reuse.body.error.code).toBe('REFRESH_REUSED');

    const newOneAlsoRevoked = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: first.body.refreshToken });
    expect(newOneAlsoRevoked.status).toBe(401);
  });

  it('rejects unknown refresh token', async () => {
    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: 'not-a-real-token-but-passes-zod-length' });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('REFRESH_INVALID');
  });
});

describe('POST /api/v1/auth/logout', () => {
  beforeEach(truncateAll);

  it('revokes a refresh token (idempotent)', async () => {
    const user = await makeUser({ role: 'hq', password: 'pw1' });
    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: 'pw1' });

    const a = await request(app)
      .post('/api/v1/auth/logout')
      .send({ refreshToken: login.body.refreshToken });
    expect(a.status).toBe(204);

    // Idempotent — calling logout again does not error
    const b = await request(app)
      .post('/api/v1/auth/logout')
      .send({ refreshToken: login.body.refreshToken });
    expect(b.status).toBe(204);

    // The refresh token should now be unusable
    const refresh = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: login.body.refreshToken });
    expect(refresh.status).toBe(401);
  });
});

describe('GET /api/v1/auth/me', () => {
  beforeEach(truncateAll);

  it('returns 401 without a Bearer token', async () => {
    const res = await request(app).get('/api/v1/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('AUTH_REQUIRED');
  });

  it('returns the authenticated user profile', async () => {
    const user = await makeUser({ role: 'station', password: 'pw1' });
    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: 'pw1' });

    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${login.body.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(user.email);
    expect(res.body.user.role).toBe('station');
    expect(res.body.user.password_hash).toBeUndefined();
  });

  it('returns 401 when token is malformed', async () => {
    const res = await request(app).get('/api/v1/auth/me').set('Authorization', 'Bearer not-a-jwt');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('TOKEN_INVALID');
  });
});

import express from 'express';
import request from 'supertest';
import { requireUser, requireRole, requireDevice } from '../../src/middleware/auth.js';
import { errorHandler } from '../../src/middleware/errorHandler.js';
import { requestId } from '../../src/middleware/requestId.js';
import { signAccessToken } from '../../src/utils/tokens.js';
import { signDeviceRequest } from '../setup/sign-device-request.js';
import { db, truncateAll } from '../setup/db.js';
import { makeUser, makeVehicleWithDevice } from '../setup/factories.js';

/** Minimal app exposing the middleware so we can exercise it without real routes. */
function buildApp() {
  const app = express();
  app.use(requestId);
  app.use(
    express.json({
      verify: (req, _res, buf) => {
        req.rawBody = buf.toString('utf8');
      },
    }),
  );

  app.get('/protected/hq-only', requireUser, requireRole('hq'), (req, res) =>
    res.json({ ok: true, user: req.user }),
  );
  app.get(
    '/protected/station-or-province',
    requireUser,
    requireRole('station', 'province'),
    (req, res) => res.json({ ok: true, user: req.user }),
  );
  app.post('/protected/device-only', requireDevice, (req, res) =>
    res.json({ ok: true, device: req.device, body: req.body }),
  );

  app.use(errorHandler);
  return app;
}

const app = buildApp();
const PATH = '/protected/device-only';

beforeAll(async () => {
  await truncateAll();
});

afterAll(async () => {
  await db.destroy();
});

describe('requireRole', () => {
  beforeEach(truncateAll);

  it('allows when role matches', async () => {
    const user = await makeUser({ role: 'hq' });
    const token = signAccessToken(user);

    const res = await request(app)
      .get('/protected/hq-only')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.user.role).toBe('hq');
  });

  it('rejects when role does not match (403)', async () => {
    const user = await makeUser({ role: 'station' });
    const token = signAccessToken(user);

    const res = await request(app)
      .get('/protected/hq-only')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('accepts any role from a multi-role allowlist', async () => {
    const user = await makeUser({ role: 'province' });
    const token = signAccessToken(user);

    const res = await request(app)
      .get('/protected/station-or-province')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
  });
});

describe('requireDevice (HMAC)', () => {
  beforeEach(truncateAll);

  it('accepts a correctly signed request', async () => {
    const { key_id, hmac_secret, vehicle_id } = await makeVehicleWithDevice();
    const body = { lat: 6.9271, lng: 79.8612 };
    const headers = signDeviceRequest({
      keyId: key_id,
      hmacSecret: hmac_secret,
      method: 'POST',
      path: PATH,
      body: JSON.stringify(body),
    });

    const res = await request(app).post(PATH).set(headers).send(body);
    expect(res.status).toBe(200);
    expect(res.body.device.vehicle_id).toBe(vehicle_id);
  });

  it('rejects when the signature does not match the body', async () => {
    const { key_id, hmac_secret } = await makeVehicleWithDevice();
    const body = { lat: 6.9271, lng: 79.8612 };
    const headers = signDeviceRequest({
      keyId: key_id,
      hmacSecret: hmac_secret,
      method: 'POST',
      path: PATH,
      body: JSON.stringify(body),
    });

    const res = await request(app)
      .post(PATH)
      .set(headers)
      .send({ ...body, lat: 0 });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('DEVICE_SIGNATURE_INVALID');
  });

  it('rejects stale timestamps (outside skew window)', async () => {
    const { key_id, hmac_secret } = await makeVehicleWithDevice();
    const tooOld = Math.floor(Date.now() / 1000) - 3600;
    const body = { lat: 6.9271, lng: 79.8612 };
    const headers = signDeviceRequest({
      keyId: key_id,
      hmacSecret: hmac_secret,
      method: 'POST',
      path: PATH,
      body: JSON.stringify(body),
      timestamp: tooOld,
    });

    const res = await request(app).post(PATH).set(headers).send(body);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('DEVICE_TIMESTAMP_STALE');
  });

  it('rejects nonce replay', async () => {
    const { key_id, hmac_secret } = await makeVehicleWithDevice();
    const body = { lat: 6.9271, lng: 79.8612 };
    const headers = signDeviceRequest({
      keyId: key_id,
      hmacSecret: hmac_secret,
      method: 'POST',
      path: PATH,
      body: JSON.stringify(body),
    });

    const first = await request(app).post(PATH).set(headers).send(body);
    expect(first.status).toBe(200);

    const replay = await request(app).post(PATH).set(headers).send(body);
    expect(replay.status).toBe(409);
    expect(replay.body.error.code).toBe('DEVICE_NONCE_REPLAY');
  });

  it('rejects unknown key id', async () => {
    const { hmac_secret } = await makeVehicleWithDevice();
    const body = {};
    const headers = signDeviceRequest({
      keyId: 'dev_doesnotexist',
      hmacSecret: hmac_secret,
      method: 'POST',
      path: PATH,
      body: JSON.stringify(body),
    });

    const res = await request(app).post(PATH).set(headers).send(body);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('DEVICE_UNKNOWN');
  });

  it('rejects when required headers are missing', async () => {
    const res = await request(app).post(PATH).send({});
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('DEVICE_AUTH_REQUIRED');
  });
});

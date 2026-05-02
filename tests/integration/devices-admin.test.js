import request from 'supertest';
import { createApp } from '../../src/app.js';
import { db, truncateAll } from '../setup/db.js';
import { makeUser, makePlace, makeVehicle, makeVehicleWithDevice } from '../setup/factories.js';
import { signAccessToken } from '../../src/utils/tokens.js';

const app = createApp();
const auth = (user) => ({ Authorization: `Bearer ${signAccessToken(user)}` });

beforeAll(async () => {
  await truncateAll();
});

afterAll(async () => {
  await db.destroy();
});

describe('POST /api/v1/devices — provisioning', () => {
  beforeEach(truncateAll);

  it('HQ provisions a device on a vehicle and receives credentials once', async () => {
    const place = await makePlace();
    const v = await makeVehicle({ station_id: place.station_id, plate_no: 'PRV-0001' });
    const hq = await makeUser({ role: 'hq' });

    const res = await request(app).post('/api/v1/devices').set(auth(hq)).send({ vehicle_id: v.id });

    expect(res.status).toBe(201);
    expect(res.body.data.device.vehicle_id).toBe(v.id);
    expect(res.body.data.device.status).toBe('active');
    expect(res.body.data.credentials.key_id).toMatch(/^dev_[0-9a-f]+$/);
    expect(res.body.data.credentials.hmac_secret).toEqual(expect.any(String));
    expect(res.body.data.credentials.hmac_secret.length).toBeGreaterThan(20);
    expect(res.headers['location']).toBe(`/api/v1/devices/${res.body.data.device.id}`);

    // Persisted in DB; secret column is set, but the response is the only
    // way to recover it (we never round-trip plaintext on subsequent reads).
    const persisted = await db('devices').where({ id: res.body.data.device.id }).first();
    expect(persisted.hmac_secret).toBe(res.body.data.credentials.hmac_secret);
  });

  it('returns 409 when the vehicle already has an active device (no revoke flag)', async () => {
    const place = await makePlace();
    const { vehicle_id } = await makeVehicleWithDevice({ station_id: place.station_id });
    const hq = await makeUser({ role: 'hq' });

    const res = await request(app).post('/api/v1/devices').set(auth(hq)).send({ vehicle_id });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('DEVICE_EXISTS');
  });

  it('with revoke_existing: true, revokes the prior device and provisions a fresh one', async () => {
    const place = await makePlace();
    const { vehicle_id, device_id: oldId } = await makeVehicleWithDevice({
      station_id: place.station_id,
    });
    const hq = await makeUser({ role: 'hq' });

    const res = await request(app)
      .post('/api/v1/devices')
      .set(auth(hq))
      .send({ vehicle_id, revoke_existing: true });

    expect(res.status).toBe(201);
    expect(res.body.data.device.id).not.toBe(oldId);

    const old = await db('devices').where({ id: oldId }).first('status', 'revoked_at');
    expect(old.status).toBe('revoked');
    expect(old.revoked_at).not.toBeNull();
  });

  it('returns 404 for unknown vehicle', async () => {
    const hq = await makeUser({ role: 'hq' });
    const res = await request(app)
      .post('/api/v1/devices')
      .set(auth(hq))
      .send({ vehicle_id: '00000000-0000-0000-0000-000000000000' });
    expect(res.status).toBe(404);
  });

  it('rejects provisioning on an inactive vehicle', async () => {
    const place = await makePlace();
    const v = await makeVehicle({
      station_id: place.station_id,
      plate_no: 'INA-0001',
      status: 'inactive',
    });
    const hq = await makeUser({ role: 'hq' });
    const res = await request(app).post('/api/v1/devices').set(auth(hq)).send({ vehicle_id: v.id });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VEHICLE_NOT_ACTIVE');
  });

  it('forbids station officer from provisioning for a different station', async () => {
    const home = await makePlace();
    const elsewhere = await makePlace();
    const v = await makeVehicle({ station_id: elsewhere.station_id, plate_no: 'OUT-0001' });
    const officer = await makeUser({
      role: 'station',
      province_id: home.province_id,
      station_id: home.station_id,
    });

    const res = await request(app)
      .post('/api/v1/devices')
      .set(auth(officer))
      .send({ vehicle_id: v.id });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN_SCOPE');
  });

  it('forbids province admin from provisioning (read-only role)', async () => {
    const place = await makePlace();
    const v = await makeVehicle({ station_id: place.station_id, plate_no: 'P-0001' });
    const admin = await makeUser({ role: 'province', province_id: place.province_id });

    const res = await request(app)
      .post('/api/v1/devices')
      .set(auth(admin))
      .send({ vehicle_id: v.id });
    expect(res.status).toBe(403);
  });
});

describe('GET /api/v1/devices', () => {
  beforeEach(truncateAll);

  it('lists devices in the caller scope without leaking secrets', async () => {
    const place = await makePlace();
    const elsewhere = await makePlace();
    await makeVehicleWithDevice({ station_id: place.station_id });
    await makeVehicleWithDevice({ station_id: elsewhere.station_id });
    const officer = await makeUser({
      role: 'station',
      province_id: place.province_id,
      station_id: place.station_id,
    });

    const res = await request(app).get('/api/v1/devices').set(auth(officer));

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].hmac_secret).toBeUndefined();
    expect(res.body.data[0].api_key_hash).toBeUndefined();
    expect(res.body.data[0].key_id).toEqual(expect.any(String));
  });

  it('filters by status=revoked', async () => {
    const place = await makePlace();
    await makeVehicleWithDevice({ station_id: place.station_id });
    const { vehicle_id, device_id } = await makeVehicleWithDevice({ station_id: place.station_id });
    await db('devices')
      .where({ id: device_id })
      .update({ status: 'revoked', revoked_at: new Date() });

    const hq = await makeUser({ role: 'hq' });
    const res = await request(app).get('/api/v1/devices?status=revoked').set(auth(hq));

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].vehicle_id).toBe(vehicle_id);
  });

  it('filters by ?province= via station→district→province join', async () => {
    const wp = await makePlace({ provinceCode: 'DWP', districtCode: 'DCO', stationCode: 'DCO-A' });
    const cp = await makePlace({ provinceCode: 'DCP', districtCode: 'DKA', stationCode: 'DKA-A' });
    await makeVehicleWithDevice({ station_id: wp.station_id });
    await makeVehicleWithDevice({ station_id: cp.station_id });
    const hq = await makeUser({ role: 'hq' });

    const res = await request(app).get('/api/v1/devices?province=DWP').set(auth(hq));
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
  });

  it('GET /:id returns 404 when device exists but is outside scope', async () => {
    const home = await makePlace();
    const elsewhere = await makePlace();
    const { device_id } = await makeVehicleWithDevice({ station_id: elsewhere.station_id });
    const officer = await makeUser({
      role: 'station',
      province_id: home.province_id,
      station_id: home.station_id,
    });

    const res = await request(app).get(`/api/v1/devices/${device_id}`).set(auth(officer));
    expect(res.status).toBe(404);
  });
});

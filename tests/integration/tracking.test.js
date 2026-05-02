import request from 'supertest';
import { createApp } from '../../src/app.js';
import { db, truncateAll } from '../setup/db.js';
import {
  makeUser,
  makePlace,
  makeStationInDistrict,
  makeVehicle,
  makeVehicleWithDevice,
  makePing,
} from '../setup/factories.js';
import { signAccessToken } from '../../src/utils/tokens.js';
import { signDeviceRequest } from '../setup/sign-device-request.js';

const app = createApp();
const auth = (user) => ({ Authorization: `Bearer ${signAccessToken(user)}` });
const PINGS_PATH = '/api/v1/devices/pings';

beforeAll(async () => {
  await truncateAll();
});

afterAll(async () => {
  await db.destroy();
});

describe('POST /api/v1/devices/pings — ingest', () => {
  beforeEach(truncateAll);

  it('accepts a single signed ping and returns 202', async () => {
    const { key_id, hmac_secret, vehicle_id } = await makeVehicleWithDevice();
    const body = {
      lat: 6.9271,
      lng: 79.8612,
      speed_kmh: 25,
      recorded_at: new Date().toISOString(),
    };
    const headers = signDeviceRequest({
      keyId: key_id,
      hmacSecret: hmac_secret,
      method: 'POST',
      path: PINGS_PATH,
      body: JSON.stringify(body),
    });

    const res = await request(app).post(PINGS_PATH).set(headers).send(body);

    expect(res.status).toBe(202);
    expect(res.body.data.accepted).toBe(1);

    const persisted = await db('locations').where({ vehicle_id }).count({ c: 'id' }).first();
    expect(Number(persisted.c)).toBe(1);

    const dev = await db('devices').where({ vehicle_id }).first('last_seen_at');
    expect(dev.last_seen_at).not.toBeNull();
  });

  it('accepts a batch of pings under one signature', async () => {
    const { key_id, hmac_secret, vehicle_id } = await makeVehicleWithDevice();
    const now = Date.now();
    const body = {
      pings: [
        { lat: 6.9, lng: 79.8, recorded_at: new Date(now - 60_000).toISOString() },
        { lat: 6.91, lng: 79.81, recorded_at: new Date(now - 30_000).toISOString() },
        { lat: 6.92, lng: 79.82, recorded_at: new Date(now).toISOString() },
      ],
    };
    const headers = signDeviceRequest({
      keyId: key_id,
      hmacSecret: hmac_secret,
      method: 'POST',
      path: PINGS_PATH,
      body: JSON.stringify(body),
    });

    const res = await request(app).post(PINGS_PATH).set(headers).send(body);
    expect(res.status).toBe(202);
    expect(res.body.data.accepted).toBe(3);

    const count = await db('locations').where({ vehicle_id }).count({ c: 'id' }).first();
    expect(Number(count.c)).toBe(3);
  });

  it('rejects pings with future recorded_at (>2min)', async () => {
    const { key_id, hmac_secret } = await makeVehicleWithDevice();
    const body = {
      lat: 6.9,
      lng: 79.8,
      recorded_at: new Date(Date.now() + 10 * 60_000).toISOString(),
    };
    const headers = signDeviceRequest({
      keyId: key_id,
      hmacSecret: hmac_secret,
      method: 'POST',
      path: PINGS_PATH,
      body: JSON.stringify(body),
    });

    const res = await request(app).post(PINGS_PATH).set(headers).send(body);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects out-of-range lat with 422', async () => {
    const { key_id, hmac_secret } = await makeVehicleWithDevice();
    const body = { lat: 200, lng: 79.8, recorded_at: new Date().toISOString() };
    const headers = signDeviceRequest({
      keyId: key_id,
      hmacSecret: hmac_secret,
      method: 'POST',
      path: PINGS_PATH,
      body: JSON.stringify(body),
    });

    const res = await request(app).post(PINGS_PATH).set(headers).send(body);
    expect(res.status).toBe(422);
  });

  it('rejects unsigned (no headers) requests with 401', async () => {
    const res = await request(app)
      .post(PINGS_PATH)
      .send({ lat: 6.9, lng: 79.8, recorded_at: new Date().toISOString() });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('DEVICE_AUTH_REQUIRED');
  });
});

describe('GET /api/v1/vehicles/:id/location — last known', () => {
  beforeEach(truncateAll);

  it('returns the most recent ping with age_seconds annotation', async () => {
    const place = await makePlace();
    const v = await makeVehicle({ station_id: place.station_id, plate_no: 'LIV-0001' });
    await makePing({ vehicle_id: v.id, recorded_at: new Date(Date.now() - 60_000) });
    await makePing({ vehicle_id: v.id, recorded_at: new Date(Date.now() - 10_000), lat: 7.0 });
    const hq = await makeUser({ role: 'hq' });

    const res = await request(app).get(`/api/v1/vehicles/${v.id}/location`).set(auth(hq));

    expect(res.status).toBe(200);
    expect(res.body.data.location.lat).toBeCloseTo(7.0, 4);
    expect(res.body.data.location.age_seconds).toBeLessThan(60);
    expect(res.body.data.location.stale).toBe(false);
    expect(res.body.data.vehicle.plate_no).toBe('LIV-0001');
  });

  it('returns null location when vehicle has no pings yet', async () => {
    const place = await makePlace();
    const v = await makeVehicle({ station_id: place.station_id, plate_no: 'LIV-EMPTY' });
    const hq = await makeUser({ role: 'hq' });

    const res = await request(app).get(`/api/v1/vehicles/${v.id}/location`).set(auth(hq));
    expect(res.status).toBe(200);
    expect(res.body.data.location).toBeNull();
  });

  it('flags stale locations (>24h old)', async () => {
    const place = await makePlace();
    const v = await makeVehicle({ station_id: place.station_id, plate_no: 'LIV-STALE' });
    await makePing({ vehicle_id: v.id, recorded_at: new Date(Date.now() - 48 * 3600_000) });
    const hq = await makeUser({ role: 'hq' });

    const res = await request(app).get(`/api/v1/vehicles/${v.id}/location`).set(auth(hq));
    expect(res.status).toBe(200);
    expect(res.body.data.location.stale).toBe(true);
  });

  it('returns 404 when vehicle is outside scope (no existence leak)', async () => {
    const wp = await makePlace();
    const cp = await makePlace();
    const v = await makeVehicle({ station_id: cp.station_id, plate_no: 'LIV-OUT' });
    await makePing({ vehicle_id: v.id });

    const officer = await makeUser({
      role: 'station',
      province_id: wp.province_id,
      station_id: wp.station_id,
    });
    const res = await request(app).get(`/api/v1/vehicles/${v.id}/location`).set(auth(officer));
    expect(res.status).toBe(404);
  });
});

describe('GET /api/v1/vehicles/:id/history', () => {
  beforeEach(truncateAll);

  it('returns points within the default 24h window, sorted ascending', async () => {
    const place = await makePlace();
    const v = await makeVehicle({ station_id: place.station_id, plate_no: 'HIS-0001' });
    const now = Date.now();
    await makePing({ vehicle_id: v.id, recorded_at: new Date(now - 3600_000), lat: 6.9 });
    await makePing({ vehicle_id: v.id, recorded_at: new Date(now - 1800_000), lat: 6.91 });
    await makePing({ vehicle_id: v.id, recorded_at: new Date(now - 600_000), lat: 6.92 });
    // outside window - 2 days old
    await makePing({ vehicle_id: v.id, recorded_at: new Date(now - 48 * 3600_000), lat: 5.0 });

    const hq = await makeUser({ role: 'hq' });
    const res = await request(app).get(`/api/v1/vehicles/${v.id}/history`).set(auth(hq));

    expect(res.status).toBe(200);
    expect(res.body.data.points.length).toBe(3);
    expect(res.body.data.points[0].lat).toBeCloseTo(6.9, 2);
    expect(res.body.data.points[2].lat).toBeCloseTo(6.92, 2);
    expect(res.body.meta.total).toBe(3);
  });

  it('honours explicit from/to range', async () => {
    const place = await makePlace();
    const v = await makeVehicle({ station_id: place.station_id, plate_no: 'HIS-0002' });
    const now = Date.now();
    await makePing({ vehicle_id: v.id, recorded_at: new Date(now - 3 * 3600_000) });
    await makePing({ vehicle_id: v.id, recorded_at: new Date(now - 2 * 3600_000) });
    await makePing({ vehicle_id: v.id, recorded_at: new Date(now - 1 * 3600_000) });

    const hq = await makeUser({ role: 'hq' });
    const from = new Date(now - 2.5 * 3600_000).toISOString();
    const to = new Date(now - 0.5 * 3600_000).toISOString();

    const res = await request(app)
      .get(
        `/api/v1/vehicles/${v.id}/history?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      )
      .set(auth(hq));

    expect(res.status).toBe(200);
    expect(res.body.data.points.length).toBe(2);
  });

  it('rejects windows greater than 7 days with 422', async () => {
    const place = await makePlace();
    const v = await makeVehicle({ station_id: place.station_id, plate_no: 'HIS-0003' });
    const hq = await makeUser({ role: 'hq' });

    const from = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const to = new Date().toISOString();

    const res = await request(app)
      .get(
        `/api/v1/vehicles/${v.id}/history?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      )
      .set(auth(hq));

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects to <= from with 422', async () => {
    const place = await makePlace();
    const v = await makeVehicle({ station_id: place.station_id, plate_no: 'HIS-0004' });
    const hq = await makeUser({ role: 'hq' });

    const from = new Date().toISOString();
    const to = new Date(Date.now() - 3600_000).toISOString();

    const res = await request(app)
      .get(
        `/api/v1/vehicles/${v.id}/history?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      )
      .set(auth(hq));

    expect(res.status).toBe(422);
  });

  it('returns 404 when vehicle is outside scope', async () => {
    const wp = await makePlace();
    const cp = await makePlace();
    const v = await makeVehicle({ station_id: cp.station_id, plate_no: 'HIS-OUT' });
    const officer = await makeUser({
      role: 'station',
      province_id: wp.province_id,
      station_id: wp.station_id,
    });
    const res = await request(app).get(`/api/v1/vehicles/${v.id}/history`).set(auth(officer));
    expect(res.status).toBe(404);
  });
});

describe('GET /api/v1/locations — cross-fleet ops view', () => {
  beforeEach(truncateAll);

  it('returns the latest ping per vehicle, scoped to caller', async () => {
    // Setup: HQ sees both, station officer sees only their own.
    const place = await makePlace();
    const otherStation = await makeStationInDistrict(place.district_id);

    const v1 = await makeVehicle({ station_id: place.station_id, plate_no: 'OPS-0001' });
    const v2 = await makeVehicle({ station_id: otherStation.id, plate_no: 'OPS-0002' });

    const now = Date.now();
    await makePing({ vehicle_id: v1.id, recorded_at: new Date(now - 600_000), lat: 6.9 });
    await makePing({ vehicle_id: v1.id, recorded_at: new Date(now - 60_000), lat: 7.0 }); // newer
    await makePing({ vehicle_id: v2.id, recorded_at: new Date(now - 60_000), lat: 6.5 });

    const hq = await makeUser({ role: 'hq' });
    const officer = await makeUser({
      role: 'station',
      province_id: place.province_id,
      station_id: place.station_id,
    });

    const hqRes = await request(app).get('/api/v1/locations').set(auth(hq));
    expect(hqRes.status).toBe(200);
    expect(hqRes.body.data.length).toBe(2);
    const opsRow = hqRes.body.data.find((r) => r.plate_no === 'OPS-0001');
    expect(Number(opsRow.lat)).toBeCloseTo(7.0, 4);

    const stationRes = await request(app).get('/api/v1/locations').set(auth(officer));
    expect(stationRes.status).toBe(200);
    expect(stationRes.body.data.length).toBe(1);
    expect(stationRes.body.data[0].plate_no).toBe('OPS-0001');
  });

  it('filters by province code', async () => {
    const wp = await makePlace({ provinceCode: 'TWP', districtCode: 'TCO', stationCode: 'TCO-A' });
    const cp = await makePlace({ provinceCode: 'TCP', districtCode: 'TKA', stationCode: 'TKA-A' });
    const v1 = await makeVehicle({ station_id: wp.station_id, plate_no: 'WPS-0001' });
    const v2 = await makeVehicle({ station_id: cp.station_id, plate_no: 'CPS-0001' });
    await makePing({ vehicle_id: v1.id });
    await makePing({ vehicle_id: v2.id });

    const hq = await makeUser({ role: 'hq' });
    const res = await request(app).get('/api/v1/locations?province=TWP').set(auth(hq));

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].plate_no).toBe('WPS-0001');
  });

  it('filters by status=stale (older than 24h)', async () => {
    const place = await makePlace();
    const fresh = await makeVehicle({ station_id: place.station_id, plate_no: 'FRH-0001' });
    const stale = await makeVehicle({ station_id: place.station_id, plate_no: 'STL-0001' });

    await makePing({ vehicle_id: fresh.id, recorded_at: new Date() });
    await makePing({ vehicle_id: stale.id, recorded_at: new Date(Date.now() - 48 * 3600_000) });

    const hq = await makeUser({ role: 'hq' });
    const res = await request(app).get('/api/v1/locations?status=stale').set(auth(hq));

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].plate_no).toBe('STL-0001');
    expect(res.body.data[0].stale).toBe(true);
  });

  it('omits vehicles that have never reported', async () => {
    const place = await makePlace();
    const reported = await makeVehicle({ station_id: place.station_id, plate_no: 'RPT-0001' });
    await makeVehicle({ station_id: place.station_id, plate_no: 'GHO-0001' }); // no pings
    await makePing({ vehicle_id: reported.id });

    const hq = await makeUser({ role: 'hq' });
    const res = await request(app).get('/api/v1/locations').set(auth(hq));

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].plate_no).toBe('RPT-0001');
  });
});

import request from 'supertest';
import { createApp } from '../../src/app.js';
import { db, truncateAll } from '../setup/db.js';
import { makeUser, makePlace, makeStationInDistrict, makeVehicle } from '../setup/factories.js';
import { signAccessToken } from '../../src/utils/tokens.js';

const app = createApp();
const auth = (user) => ({ Authorization: `Bearer ${signAccessToken(user)}` });

beforeAll(async () => {
  await truncateAll();
});

afterAll(async () => {
  await db.destroy();
});

describe('GET /api/v1/vehicles — list, filter, sort, fields, pagination', () => {
  beforeEach(truncateAll);

  it('lists vehicles for HQ users (no scope)', async () => {
    const place = await makePlace();
    await makeVehicle({ station_id: place.station_id, plate_no: 'ABC-1001' });
    await makeVehicle({ station_id: place.station_id, plate_no: 'ABC-1002' });
    const hq = await makeUser({ role: 'hq' });

    const res = await request(app).get('/api/v1/vehicles').set(auth(hq));

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(2);
    expect(res.body.meta.total).toBe(2);
    expect(res.body.meta.page).toBe(1);
    expect(res.body.links.self).toContain('/api/v1/vehicles');
    expect(res.headers['link']).toMatch(/rel="self"/);
    expect(res.headers['cache-control']).toMatch(/no-store/);
  });

  it('filters by status', async () => {
    const place = await makePlace();
    await makeVehicle({ station_id: place.station_id, plate_no: 'AAA-1001', status: 'active' });
    await makeVehicle({ station_id: place.station_id, plate_no: 'AAA-1002', status: 'inactive' });
    const hq = await makeUser({ role: 'hq' });

    const res = await request(app).get('/api/v1/vehicles?status=inactive').set(auth(hq));

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].plate_no).toBe('AAA-1002');
  });

  it('paginates with page + limit', async () => {
    const place = await makePlace();
    for (let i = 0; i < 7; i++) {
      await makeVehicle({ station_id: place.station_id, plate_no: `BBB-100${i}` });
    }
    const hq = await makeUser({ role: 'hq' });

    const res = await request(app).get('/api/v1/vehicles?limit=3&page=2').set(auth(hq));

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(3);
    expect(res.body.meta.page).toBe(2);
    expect(res.body.meta.totalPages).toBe(3);
    expect(res.body.links.prev).toContain('page=1');
    expect(res.body.links.next).toContain('page=3');
  });

  it('honours sort=-plate_no (descending)', async () => {
    const place = await makePlace();
    await makeVehicle({ station_id: place.station_id, plate_no: 'CCC-1001' });
    await makeVehicle({ station_id: place.station_id, plate_no: 'CCC-1099' });
    const hq = await makeUser({ role: 'hq' });

    const res = await request(app).get('/api/v1/vehicles?sort=-plate_no').set(auth(hq));

    expect(res.status).toBe(200);
    expect(res.body.data[0].plate_no).toBe('CCC-1099');
  });

  it('rejects sort on a non-allowlisted column', async () => {
    const hq = await makeUser({ role: 'hq' });
    const res = await request(app).get('/api/v1/vehicles?sort=password_hash').set(auth(hq));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('BAD_SORT');
  });

  it('respects sparse fieldsets (?fields=...)', async () => {
    const place = await makePlace();
    await makeVehicle({ station_id: place.station_id, plate_no: 'DDD-1001' });
    const hq = await makeUser({ role: 'hq' });

    const res = await request(app).get('/api/v1/vehicles?fields=id,plate_no').set(auth(hq));

    expect(res.status).toBe(200);
    expect(Object.keys(res.body.data[0]).sort()).toEqual(['id', 'plate_no']);
  });

  it('rejects unknown field in sparse fieldset', async () => {
    const hq = await makeUser({ role: 'hq' });
    const res = await request(app).get('/api/v1/vehicles?fields=lat,lng').set(auth(hq));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('BAD_FIELD');
  });

  it('filters by province code via station→district→province join', async () => {
    const wp = await makePlace({
      provinceCode: 'XW1',
      districtCode: 'XCO1',
      stationCode: 'XCO1-A',
    });
    const cp = await makePlace({
      provinceCode: 'XC1',
      districtCode: 'XKA1',
      stationCode: 'XKA1-A',
    });
    await makeVehicle({ station_id: wp.station_id, plate_no: 'WP-001-1234' });
    await makeVehicle({ station_id: cp.station_id, plate_no: 'CP-001-1234' });
    const hq = await makeUser({ role: 'hq' });

    const res = await request(app).get('/api/v1/vehicles?province=XW1').set(auth(hq));
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].plate_no).toBe('WP-001-1234');
  });
});

describe('GET /api/v1/vehicles — RBAC scoping', () => {
  beforeEach(truncateAll);

  it('station officer sees only their own station', async () => {
    const place = await makePlace();
    const otherStation = await makeStationInDistrict(place.district_id);

    await makeVehicle({ station_id: place.station_id, plate_no: 'AAA-1001' });
    await makeVehicle({ station_id: otherStation.id, plate_no: 'BBB-1001' });

    const officer = await makeUser({
      role: 'station',
      province_id: place.province_id,
      station_id: place.station_id,
    });

    const res = await request(app).get('/api/v1/vehicles').set(auth(officer));
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].plate_no).toBe('AAA-1001');
  });

  it('province admin sees all stations within their province', async () => {
    const wp = await makePlace({
      provinceCode: 'XW2',
      districtCode: 'XCO2',
      stationCode: 'XCO2-A',
    });
    const wpStationB = await makeStationInDistrict(wp.district_id, { code: 'XCO2-B' });
    const cp = await makePlace({
      provinceCode: 'XC2',
      districtCode: 'XKA2',
      stationCode: 'XKA2-A',
    });

    await makeVehicle({ station_id: wp.station_id, plate_no: 'AAA-1001' });
    await makeVehicle({ station_id: wpStationB.id, plate_no: 'AAA-1002' });
    await makeVehicle({ station_id: cp.station_id, plate_no: 'BBB-1001' });

    const admin = await makeUser({ role: 'province', province_id: wp.province_id });

    const res = await request(app).get('/api/v1/vehicles').set(auth(admin));
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(2);
    expect(res.body.data.map((v) => v.plate_no).sort()).toEqual(['AAA-1001', 'AAA-1002']);
  });

  it('GET /:id returns 404 when vehicle is outside scope (no existence leak)', async () => {
    const wp = await makePlace({
      provinceCode: 'XW3',
      districtCode: 'XCO3',
      stationCode: 'XCO3-A',
    });
    const cp = await makePlace({
      provinceCode: 'XC3',
      districtCode: 'XKA3',
      stationCode: 'XKA3-A',
    });
    const v = await makeVehicle({ station_id: cp.station_id, plate_no: 'OUT-9999' });

    const officer = await makeUser({
      role: 'station',
      province_id: wp.province_id,
      station_id: wp.station_id,
    });
    const res = await request(app).get(`/api/v1/vehicles/${v.id}`).set(auth(officer));
    expect(res.status).toBe(404);
  });
});

describe('POST /api/v1/vehicles — create', () => {
  beforeEach(truncateAll);

  it('creates as HQ and returns 201 with Location header', async () => {
    const place = await makePlace();
    const hq = await makeUser({ role: 'hq' });

    const res = await request(app).post('/api/v1/vehicles').set(auth(hq)).send({
      plate_no: 'NEW-1234',
      owner_name: 'Test Owner',
      station_id: place.station_id,
    });

    expect(res.status).toBe(201);
    expect(res.headers['location']).toBe(`/api/v1/vehicles/${res.body.data.id}`);
    expect(res.body.data.plate_no).toBe('NEW-1234');
    expect(res.body.data.status).toBe('active');
  });

  it('returns 409 on duplicate plate', async () => {
    const place = await makePlace();
    await makeVehicle({ station_id: place.station_id, plate_no: 'DUP-1234' });
    const hq = await makeUser({ role: 'hq' });

    const res = await request(app)
      .post('/api/v1/vehicles')
      .set(auth(hq))
      .send({ plate_no: 'DUP-1234', owner_name: 'Test Owner', station_id: place.station_id });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('PLATE_CONFLICT');
  });

  it('returns 422 on bad plate format', async () => {
    const place = await makePlace();
    const hq = await makeUser({ role: 'hq' });
    const res = await request(app)
      .post('/api/v1/vehicles')
      .set(auth(hq))
      .send({ plate_no: 'not-a-plate', owner_name: 'Test Owner', station_id: place.station_id });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 422 on unknown station_id', async () => {
    const hq = await makeUser({ role: 'hq' });
    const res = await request(app).post('/api/v1/vehicles').set(auth(hq)).send({
      plate_no: 'ZZZ-1234',
      owner_name: 'Test Owner',
      station_id: '00000000-0000-0000-0000-000000000000',
    });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('STATION_NOT_FOUND');
  });

  it('forbids province admin from creating (read-only oversight role)', async () => {
    const place = await makePlace();
    const admin = await makeUser({ role: 'province', province_id: place.province_id });

    const res = await request(app)
      .post('/api/v1/vehicles')
      .set(auth(admin))
      .send({ plate_no: 'NEW-9999', owner_name: 'Test Owner', station_id: place.station_id });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('forbids station officer from creating for a different station', async () => {
    const home = await makePlace();
    const otherDistrict = await makePlace();
    const officer = await makeUser({
      role: 'station',
      province_id: home.province_id,
      station_id: home.station_id,
    });

    const res = await request(app).post('/api/v1/vehicles').set(auth(officer)).send({
      plate_no: 'XYZ-1234',
      owner_name: 'Test Owner',
      station_id: otherDistrict.station_id,
    });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN_SCOPE');
  });
});

describe('PATCH /api/v1/vehicles/:id — update', () => {
  beforeEach(truncateAll);

  it('updates status as HQ', async () => {
    const place = await makePlace();
    const v = await makeVehicle({ station_id: place.station_id, plate_no: 'PAT-0001' });
    const hq = await makeUser({ role: 'hq' });

    const res = await request(app)
      .patch(`/api/v1/vehicles/${v.id}`)
      .set(auth(hq))
      .send({ status: 'impounded' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('impounded');
  });

  it('rejects empty patch body with 422', async () => {
    const place = await makePlace();
    const v = await makeVehicle({ station_id: place.station_id, plate_no: 'PAT-0002' });
    const hq = await makeUser({ role: 'hq' });

    const res = await request(app).patch(`/api/v1/vehicles/${v.id}`).set(auth(hq)).send({});
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 404 when patching a vehicle outside scope', async () => {
    const wp = await makePlace();
    const cp = await makePlace();
    const v = await makeVehicle({ station_id: cp.station_id, plate_no: 'PAT-0003' });
    const officer = await makeUser({
      role: 'station',
      province_id: wp.province_id,
      station_id: wp.station_id,
    });

    const res = await request(app)
      .patch(`/api/v1/vehicles/${v.id}`)
      .set(auth(officer))
      .send({ status: 'inactive' });
    expect(res.status).toBe(404);
  });
});

describe('GET /api/v1/vehicles/:id — conditional GET', () => {
  beforeEach(truncateAll);

  it('returns 304 on If-None-Match with matching ETag', async () => {
    const place = await makePlace();
    const v = await makeVehicle({ station_id: place.station_id, plate_no: 'ETG-0001' });
    const hq = await makeUser({ role: 'hq' });

    const first = await request(app).get(`/api/v1/vehicles/${v.id}`).set(auth(hq));
    expect(first.status).toBe(200);
    const etag = first.headers['etag'];
    expect(etag).toBeDefined();

    const second = await request(app)
      .get(`/api/v1/vehicles/${v.id}`)
      .set(auth(hq))
      .set('If-None-Match', etag);
    expect(second.status).toBe(304);
  });
});

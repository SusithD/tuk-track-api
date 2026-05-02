import request from 'supertest';
import { createApp } from '../../src/app.js';
import { db, truncateAll } from '../setup/db.js';
import {
  makeUser,
  makePlace,
  makeDistrictInProvince,
  makeStationInDistrict,
} from '../setup/factories.js';
import { signAccessToken } from '../../src/utils/tokens.js';

const app = createApp();

beforeAll(async () => {
  await truncateAll();
});

afterAll(async () => {
  await db.destroy();
});

describe('GET /api/v1/provinces', () => {
  beforeEach(truncateAll);

  it('lists provinces (auth required)', async () => {
    await makePlace({ provinceCode: 'XW', districtCode: 'XCO', stationCode: 'XCO-MAIN' });
    await makePlace({ provinceCode: 'XC', districtCode: 'XKAN', stationCode: 'XKAN-MAIN' });
    const user = await makeUser({ role: 'hq' });
    const token = signAccessToken(user);

    const res = await request(app).get('/api/v1/provinces').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(2);
    expect(res.body.meta.count).toBe(2);
    expect(res.headers['cache-control']).toMatch(/public/);
    expect(res.headers['etag']).toBeDefined();
  });

  it('rejects without bearer token', async () => {
    const res = await request(app).get('/api/v1/provinces');
    expect(res.status).toBe(401);
  });

  it('returns 304 on conditional GET (If-None-Match)', async () => {
    await makePlace();
    const user = await makeUser({ role: 'hq' });
    const token = signAccessToken(user);

    const first = await request(app)
      .get('/api/v1/provinces')
      .set('Authorization', `Bearer ${token}`);
    expect(first.status).toBe(200);
    const etag = first.headers['etag'];

    const second = await request(app)
      .get('/api/v1/provinces')
      .set('Authorization', `Bearer ${token}`)
      .set('If-None-Match', etag);
    expect(second.status).toBe(304);
  });
});

describe('GET /api/v1/districts', () => {
  beforeEach(truncateAll);

  it('filters by province code', async () => {
    await makePlace({ provinceCode: 'XW', districtCode: 'XCOL', stationCode: 'XCOL-MAIN' });
    await makePlace({ provinceCode: 'XC', districtCode: 'XKAN', stationCode: 'XKAN-MAIN' });
    const user = await makeUser({ role: 'hq' });
    const token = signAccessToken(user);

    const res = await request(app)
      .get('/api/v1/districts?province=XW')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].code).toBe('XCOL');
    expect(res.body.meta.filter).toEqual({ province: 'XW' });
  });
});

describe('GET /api/v1/stations', () => {
  beforeEach(truncateAll);

  it('filters by district code', async () => {
    const a = await makePlace({ provinceCode: 'XW', districtCode: 'XCOL', stationCode: 'XCOL-A' });
    await makePlace({ provinceCode: 'XC', districtCode: 'XKAN', stationCode: 'XKAN-A' });
    const user = await makeUser({ role: 'hq' });
    const token = signAccessToken(user);

    const res = await request(app)
      .get('/api/v1/stations?district=XCOL')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].district_id).toBe(a.district_id);
  });

  it('filters by province code via JOIN', async () => {
    const wp = await makePlace({ provinceCode: 'XW', districtCode: 'XCOL', stationCode: 'XCOL-A' });
    const gam = await makeDistrictInProvince(wp.province_id, { code: 'XGAM' });
    await makeStationInDistrict(gam.id, { code: 'XGAM-A' });
    await makePlace({ provinceCode: 'XC', districtCode: 'XKAN', stationCode: 'XKAN-A' });
    const user = await makeUser({ role: 'hq' });
    const token = signAccessToken(user);

    const res = await request(app)
      .get('/api/v1/stations?province=XW')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(2);
  });

  it('returns 404 for unknown station id', async () => {
    const user = await makeUser({ role: 'hq' });
    const token = signAccessToken(user);
    const res = await request(app)
      .get('/api/v1/stations/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});

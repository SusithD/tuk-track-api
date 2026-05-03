import request from 'supertest';
import { createApp } from '../../src/app.js';
import { db, truncateAll } from '../setup/db.js';
import { makeUser, makePlace } from '../setup/factories.js';
import { signAccessToken } from '../../src/utils/tokens.js';

const app = createApp();
const auth = (user) => ({ Authorization: `Bearer ${signAccessToken(user)}` });

beforeAll(async () => {
  await truncateAll();
});

afterAll(async () => {
  await db.destroy();
});

describe('POST /api/v1/users', () => {
  beforeEach(truncateAll);

  it('HQ creates an HQ user (no province/station)', async () => {
    const hq = await makeUser({ role: 'hq' });

    const res = await request(app).post('/api/v1/users').set(auth(hq)).send({
      email: 'newadmin@police.lk',
      password: 'long-enough-password',
      full_name: 'New HQ Admin',
      role: 'hq',
    });

    expect(res.status).toBe(201);
    expect(res.headers['location']).toBe(`/api/v1/users/${res.body.data.id}`);
    expect(res.body.data.email).toBe('newadmin@police.lk');
    expect(res.body.data.role).toBe('hq');
    expect(res.body.data.password_hash).toBeUndefined();
  });

  it('HQ creates a station officer with both province_id + station_id', async () => {
    const hq = await makeUser({ role: 'hq' });
    const place = await makePlace();

    const res = await request(app).post('/api/v1/users').set(auth(hq)).send({
      email: 'officer.new@police.lk',
      password: 'long-enough-password',
      full_name: 'New Officer',
      role: 'station',
      province_id: place.province_id,
      station_id: place.station_id,
    });

    expect(res.status).toBe(201);
    expect(res.body.data.role).toBe('station');
    expect(res.body.data.station_id).toBe(place.station_id);
  });

  it('rejects role/scope mismatch (station user without station_id)', async () => {
    const hq = await makeUser({ role: 'hq' });
    const res = await request(app).post('/api/v1/users').set(auth(hq)).send({
      email: 'wrong@police.lk',
      password: 'long-enough-password',
      full_name: 'Wrong',
      role: 'station',
    });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects HQ users that carry province/station', async () => {
    const hq = await makeUser({ role: 'hq' });
    const place = await makePlace();
    const res = await request(app).post('/api/v1/users').set(auth(hq)).send({
      email: 'wrong@police.lk',
      password: 'long-enough-password',
      full_name: 'Wrong',
      role: 'hq',
      station_id: place.station_id,
    });
    expect(res.status).toBe(422);
  });

  it('returns 409 on duplicate email', async () => {
    const hq = await makeUser({ role: 'hq' });
    const existing = await makeUser({ role: 'hq', email: 'taken@police.lk' });

    const res = await request(app).post('/api/v1/users').set(auth(hq)).send({
      email: existing.email,
      password: 'long-enough-password',
      full_name: 'Dup',
      role: 'hq',
    });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('EMAIL_CONFLICT');
  });

  it('returns 422 on unknown station_id', async () => {
    const hq = await makeUser({ role: 'hq' });
    const place = await makePlace();
    const res = await request(app).post('/api/v1/users').set(auth(hq)).send({
      email: 'ghost@police.lk',
      password: 'long-enough-password',
      full_name: 'Ghost',
      role: 'station',
      province_id: place.province_id,
      station_id: '00000000-0000-0000-0000-000000000000',
    });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('STATION_NOT_FOUND');
  });

  it('forbids province admins from creating users (HQ-only)', async () => {
    const place = await makePlace();
    const admin = await makeUser({ role: 'province', province_id: place.province_id });

    const res = await request(app).post('/api/v1/users').set(auth(admin)).send({
      email: 'attempt@police.lk',
      password: 'long-enough-password',
      full_name: 'Attempt',
      role: 'hq',
    });
    expect(res.status).toBe(403);
  });
});

describe('GET /api/v1/users', () => {
  beforeEach(truncateAll);

  it('HQ sees all users', async () => {
    const placeA = await makePlace();
    const placeB = await makePlace();
    await makeUser({ role: 'province', province_id: placeA.province_id });
    await makeUser({
      role: 'station',
      province_id: placeB.province_id,
      station_id: placeB.station_id,
    });
    const hq = await makeUser({ role: 'hq' });

    const res = await request(app).get('/api/v1/users').set(auth(hq));

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(3);
    expect(res.body.meta.total).toBe(3);
  });

  it('province admin sees only users in their province', async () => {
    const wp = await makePlace();
    const cp = await makePlace();
    await makeUser({
      role: 'station',
      province_id: wp.province_id,
      station_id: wp.station_id,
    });
    await makeUser({
      role: 'station',
      province_id: cp.province_id,
      station_id: cp.station_id,
    });
    const admin = await makeUser({ role: 'province', province_id: wp.province_id });

    const res = await request(app).get('/api/v1/users').set(auth(admin));
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(2);
    expect(res.body.data.every((u) => u.province_id === wp.province_id)).toBe(true);
  });

  it('station officer cannot list (forbidden)', async () => {
    const place = await makePlace();
    const officer = await makeUser({
      role: 'station',
      province_id: place.province_id,
      station_id: place.station_id,
    });

    const res = await request(app).get('/api/v1/users').set(auth(officer));
    expect(res.status).toBe(403);
  });

  it('?role= filter works', async () => {
    const place = await makePlace();
    await makeUser({
      role: 'station',
      province_id: place.province_id,
      station_id: place.station_id,
    });
    await makeUser({ role: 'province', province_id: place.province_id });
    const hq = await makeUser({ role: 'hq' });

    const res = await request(app).get('/api/v1/users?role=station').set(auth(hq));
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].role).toBe('station');
  });

  it('?q= free-text search on email', async () => {
    await makeUser({ role: 'hq', email: 'specific.search@police.lk' });
    await makeUser({ role: 'hq' });
    const hq = await makeUser({ role: 'hq' });

    const res = await request(app).get('/api/v1/users?q=specific').set(auth(hq));
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].email).toBe('specific.search@police.lk');
  });
});

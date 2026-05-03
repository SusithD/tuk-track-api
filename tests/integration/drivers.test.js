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

describe('GET /api/v1/drivers — list', () => {
  beforeEach(truncateAll);

  it('lists distinct drivers with vehicle_count, dedup on (nic,name,phone)', async () => {
    const place = await makePlace();
    await makeVehicle({
      station_id: place.station_id,
      plate_no: 'ABC-0001',
      owner_name: 'Alice Perera',
      owner_nic: '111111111V',
      owner_phone: '+94770000001',
    });
    await makeVehicle({
      station_id: place.station_id,
      plate_no: 'ABC-0002',
      owner_name: 'Bob Silva',
      owner_nic: '222222222V',
      owner_phone: '+94770000002',
    });
    await makeVehicle({
      station_id: place.station_id,
      plate_no: 'ABC-0003',
      owner_name: 'Alice Perera',
      owner_nic: '111111111V',
      owner_phone: '+94770000001',
    });

    const hq = await makeUser({ role: 'hq' });
    const res = await request(app).get('/api/v1/drivers').set(auth(hq));

    expect(res.status).toBe(200);
    expect(res.body.meta.total).toBe(2);
    expect(res.body.data.length).toBe(2);

    const alice = res.body.data.find((d) => d.nic === '111111111V');
    expect(alice.name).toBe('Alice Perera');
    expect(alice.vehicle_count).toBe(2);
  });

  it('excludes vehicles missing owner_name or owner_nic', async () => {
    const place = await makePlace();
    await makeVehicle({
      station_id: place.station_id,
      plate_no: 'AAA-0001',
      owner_name: 'Charlie',
      owner_nic: '333333333V',
    });
    await makeVehicle({
      station_id: place.station_id,
      plate_no: 'AAA-0002',
      owner_name: 'Dave',
    });

    const hq = await makeUser({ role: 'hq' });
    const res = await request(app).get('/api/v1/drivers').set(auth(hq));

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].nic).toBe('333333333V');
  });

  it('?q= searches name / nic / phone', async () => {
    const place = await makePlace();
    await makeVehicle({
      station_id: place.station_id,
      plate_no: 'AAA-0001',
      owner_name: 'Specific Person',
      owner_nic: '888888888V',
    });
    await makeVehicle({
      station_id: place.station_id,
      plate_no: 'AAA-0002',
      owner_name: 'Other Owner',
      owner_nic: '777777777V',
    });

    const hq = await makeUser({ role: 'hq' });
    const res = await request(app).get('/api/v1/drivers?q=specific').set(auth(hq));

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].name).toBe('Specific Person');
  });

  it('scope: station officer sees only drivers at their station', async () => {
    const home = await makePlace();
    const otherStation = await makeStationInDistrict(home.district_id);

    await makeVehicle({
      station_id: home.station_id,
      plate_no: 'AAA-0001',
      owner_name: 'Mine',
      owner_nic: '111111111V',
    });
    await makeVehicle({
      station_id: otherStation.id,
      plate_no: 'BBB-0001',
      owner_name: 'NotMine',
      owner_nic: '999999999V',
    });

    const officer = await makeUser({
      role: 'station',
      province_id: home.province_id,
      station_id: home.station_id,
    });
    const res = await request(app).get('/api/v1/drivers').set(auth(officer));

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].nic).toBe('111111111V');
  });

  it('?province= filter via station→district→province join', async () => {
    const wp = await makePlace({ provinceCode: 'DRP', districtCode: 'DRD', stationCode: 'DRD-A' });
    const cp = await makePlace({
      provinceCode: 'DRX',
      districtCode: 'DRY',
      stationCode: 'DRY-A',
    });

    await makeVehicle({
      station_id: wp.station_id,
      plate_no: 'AAA-0001',
      owner_name: 'WP Driver',
      owner_nic: '111111111V',
    });
    await makeVehicle({
      station_id: cp.station_id,
      plate_no: 'BBB-0001',
      owner_name: 'CP Driver',
      owner_nic: '222222222V',
    });

    const hq = await makeUser({ role: 'hq' });
    const res = await request(app).get('/api/v1/drivers?province=DRP').set(auth(hq));

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].name).toBe('WP Driver');
  });
});

describe('GET /api/v1/drivers/:nic — detail', () => {
  beforeEach(truncateAll);

  it('returns the driver + their vehicles', async () => {
    const place = await makePlace();
    await makeVehicle({
      station_id: place.station_id,
      plate_no: 'XYZ-0001',
      owner_name: 'Multi Owner',
      owner_nic: '999888777V',
      owner_phone: '+94771112222',
    });
    await makeVehicle({
      station_id: place.station_id,
      plate_no: 'XYZ-0002',
      owner_name: 'Multi Owner',
      owner_nic: '999888777V',
      owner_phone: '+94771112222',
    });

    const hq = await makeUser({ role: 'hq' });
    const res = await request(app).get('/api/v1/drivers/999888777V').set(auth(hq));

    expect(res.status).toBe(200);
    expect(res.body.data.nic).toBe('999888777V');
    expect(res.body.data.name).toBe('Multi Owner');
    expect(res.body.data.vehicle_count).toBe(2);
    expect(res.body.data.vehicles.map((v) => v.plate_no).sort()).toEqual(['XYZ-0001', 'XYZ-0002']);
  });

  it('returns 404 when no vehicles for this NIC are in scope', async () => {
    const home = await makePlace();
    const elsewhere = await makePlace();
    await makeVehicle({
      station_id: elsewhere.station_id,
      plate_no: 'OUT-0001',
      owner_name: 'Hidden',
      owner_nic: '555555555V',
    });

    const officer = await makeUser({
      role: 'station',
      province_id: home.province_id,
      station_id: home.station_id,
    });
    const res = await request(app).get('/api/v1/drivers/555555555V').set(auth(officer));

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('returns 422 for malformed NIC', async () => {
    const hq = await makeUser({ role: 'hq' });
    const res = await request(app).get('/api/v1/drivers/not-a-nic').set(auth(hq));

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

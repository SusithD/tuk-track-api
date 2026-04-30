import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { db } from '../../src/config/database.js';

/** Inserts a province + district + station and returns their ids. */
export async function makePlace(overrides = {}) {
  const provinceCode =
    overrides.provinceCode || `P${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
  const districtCode =
    overrides.districtCode || `D${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
  const stationCode =
    overrides.stationCode || `S-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

  const [province] = await db('provinces')
    .insert({ code: provinceCode, name: `Test ${provinceCode}` })
    .returning('id');
  const [district] = await db('districts')
    .insert({ province_id: province.id, code: districtCode, name: `Test ${districtCode}` })
    .returning('id');
  const [station] = await db('stations')
    .insert({ district_id: district.id, code: stationCode, name: `Test ${stationCode}` })
    .returning('id');

  return { province_id: province.id, district_id: district.id, station_id: station.id };
}

export async function makeUser({ role = 'hq', password = 'Password123!', ...overrides } = {}) {
  const email = overrides.email || `${role}.${crypto.randomBytes(4).toString('hex')}@test.local`;
  const password_hash = await bcrypt.hash(password, 6);

  const place =
    role === 'hq'
      ? { province_id: null, station_id: null }
      : role === 'province'
        ? {
            province_id: overrides.province_id || (await makePlace()).province_id,
            station_id: null,
          }
        : await (async () => {
            const p = await makePlace();
            return { province_id: p.province_id, station_id: p.station_id };
          })();

  const [user] = await db('users')
    .insert({
      email,
      password_hash,
      full_name: overrides.full_name || `Test ${role}`,
      role,
      status: overrides.status || 'active',
      ...place,
    })
    .returning(['id', 'email', 'role', 'province_id', 'station_id', 'status']);

  return { ...user, password };
}

export async function makeVehicleWithDevice({ station_id } = {}) {
  if (!station_id) ({ station_id } = await makePlace());

  const [vehicle] = await db('vehicles')
    .insert({
      plate_no: `TST-${crypto.randomBytes(2).toString('hex').toUpperCase()}`,
      owner_name: 'Test Owner',
      station_id,
      status: 'active',
    })
    .returning(['id']);

  const key_id = `dev_${crypto.randomBytes(6).toString('hex')}`;
  const hmac_secret = crypto.randomBytes(32).toString('base64url');

  const [device] = await db('devices')
    .insert({
      vehicle_id: vehicle.id,
      key_id,
      api_key_hash: await bcrypt.hash('placeholder', 6),
      hmac_secret,
      status: 'active',
    })
    .returning(['id']);

  return { vehicle_id: vehicle.id, device_id: device.id, key_id, hmac_secret };
}

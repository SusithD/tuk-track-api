import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { db } from '../../src/config/database.js';

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

  let place;
  if (role === 'hq') {
    place = { province_id: null, station_id: null };
  } else if (role === 'province') {
    const province_id = overrides.province_id || (await makePlace()).province_id;
    place = { province_id, station_id: null };
  } else {
    if (overrides.station_id && overrides.province_id) {
      place = { province_id: overrides.province_id, station_id: overrides.station_id };
    } else {
      const p = await makePlace();
      place = { province_id: p.province_id, station_id: p.station_id };
    }
  }

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

export async function makeDistrictInProvince(province_id, overrides = {}) {
  const code = overrides.code || `D${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
  const [row] = await db('districts')
    .insert({ province_id, code, name: overrides.name || `Test ${code}` })
    .returning(['id', 'province_id', 'code', 'name']);
  return row;
}

export async function makeStationInDistrict(district_id, overrides = {}) {
  const code = overrides.code || `S-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
  const [row] = await db('stations')
    .insert({ district_id, code, name: overrides.name || `Test ${code}` })
    .returning(['id', 'district_id', 'code', 'name']);
  return row;
}

export async function makeVehicle({ station_id, ...overrides } = {}) {
  if (!station_id) ({ station_id } = await makePlace());
  const [row] = await db('vehicles')
    .insert({
      plate_no: overrides.plate_no || `TST-${crypto.randomBytes(2).toString('hex').toUpperCase()}`,
      owner_name: overrides.owner_name || 'Test Owner',
      owner_nic: overrides.owner_nic,
      owner_phone: overrides.owner_phone,
      station_id,
      status: overrides.status || 'active',
    })
    .returning('*');
  return row;
}

export async function makePing({ vehicle_id, recorded_at, lat = 6.9271, lng = 79.8612, ...rest }) {
  const at = recorded_at ? new Date(recorded_at) : new Date();
  const [row] = await db('locations')
    .insert({
      vehicle_id,
      lat,
      lng,
      speed_kmh: rest.speed_kmh ?? 0,
      heading_deg: rest.heading_deg ?? null,
      recorded_at: at.toISOString(),
      received_at: at.toISOString(),
    })
    .returning('*');
  return row;
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

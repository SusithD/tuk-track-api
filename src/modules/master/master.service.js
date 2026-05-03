import { db } from '../../config/database.js';

const PROVINCE_COLS = ['id', 'code', 'name', 'created_at'];
const DISTRICT_COLS = ['id', 'province_id', 'code', 'name', 'created_at'];
const STATION_COLS = [
  'id',
  'district_id',
  'code',
  'name',
  'address',
  'contact_phone',
  'created_at',
  'updated_at',
];

export async function listProvinces() {
  return db('provinces').select(PROVINCE_COLS).orderBy('name');
}

export async function getProvinceById(id) {
  return db('provinces').where({ id }).first(PROVINCE_COLS);
}

export async function listDistricts({ provinceCode, provinceId } = {}) {
  const q = db('districts')
    .select(DISTRICT_COLS.map((c) => `districts.${c}`))
    .orderBy('districts.name');

  if (provinceCode) {
    q.join('provinces', 'provinces.id', 'districts.province_id').where(
      'provinces.code',
      provinceCode,
    );
  } else if (provinceId) {
    q.where('districts.province_id', provinceId);
  }
  return q;
}

export async function getDistrictById(id) {
  return db('districts').where({ id }).first(DISTRICT_COLS);
}

export async function listStations({ districtCode, districtId, provinceCode } = {}) {
  const q = db('stations')
    .select(STATION_COLS.map((c) => `stations.${c}`))
    .orderBy('stations.name');

  if (districtCode) {
    q.join('districts', 'districts.id', 'stations.district_id').where(
      'districts.code',
      districtCode,
    );
  } else if (districtId) {
    q.where('stations.district_id', districtId);
  } else if (provinceCode) {
    q.join('districts', 'districts.id', 'stations.district_id')
      .join('provinces', 'provinces.id', 'districts.province_id')
      .where('provinces.code', provinceCode);
  }
  return q;
}

export async function getStationById(id) {
  return db('stations').where({ id }).first(STATION_COLS);
}

export function maxUpdatedAt(rows) {
  let max = null;
  for (const r of rows) {
    const t = r.updated_at || r.created_at;
    if (!t) continue;
    const d = new Date(t);
    if (!max || d > max) max = d;
  }
  return max;
}

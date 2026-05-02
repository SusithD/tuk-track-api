import createError from 'http-errors';
import { db } from '../../config/database.js';
import { applyVehicleScope, userCanAccessStation } from '../../utils/scope.js';

export const VEHICLE_FIELDS = [
  'id',
  'plate_no',
  'owner_name',
  'owner_nic',
  'owner_phone',
  'station_id',
  'status',
  'registered_at',
  'created_at',
  'updated_at',
];

export const SORTABLE = ['plate_no', 'created_at', 'updated_at', 'registered_at', 'status'];

export async function listVehicles({ user, filter = {}, sort = [], fields, page = 1, limit = 50 }) {
  const projection = (fields ?? VEHICLE_FIELDS).map((c) => `vehicles.${c}`);

  let base = db('vehicles');
  base = applyVehicleScope(base, user);

  if (filter.status) base = base.where('vehicles.status', filter.status);
  if (filter.station_id) base = base.where('vehicles.station_id', filter.station_id);
  if (filter.q) {
    base = base.where((qb) => {
      qb.whereILike('vehicles.plate_no', `%${filter.q}%`).orWhereILike(
        'vehicles.owner_name',
        `%${filter.q}%`,
      );
    });
  }
  if (filter.district || filter.province) {
    base = base
      .join('stations as s', 's.id', 'vehicles.station_id')
      .join('districts as d', 'd.id', 's.district_id');
    if (filter.district) base = base.where('d.code', filter.district);
    if (filter.province) {
      base = base.join('provinces as p', 'p.id', 'd.province_id').where('p.code', filter.province);
    }
  }

  const dataQuery = base
    .clone()
    .select(projection)
    .limit(limit)
    .offset((page - 1) * limit);
  for (const { column, direction } of sort) {
    dataQuery.orderBy(`vehicles.${column}`, direction);
  }
  if (sort.length === 0) dataQuery.orderBy('vehicles.plate_no', 'asc');

  const [rows, countRow] = await Promise.all([
    dataQuery,
    base.clone().clearSelect().clearOrder().count({ total: 'vehicles.id' }).first(),
  ]);

  return { rows, total: Number(countRow.total) };
}

export async function getVehicleById(user, id, { fields } = {}) {
  const projection = (fields ?? VEHICLE_FIELDS).map((c) => `vehicles.${c}`);
  const q = applyVehicleScope(db('vehicles').where('vehicles.id', id), user);
  return q.first(projection);
}

export async function createVehicle(user, payload) {
  const station = await db('stations as s')
    .join('districts as d', 'd.id', 's.district_id')
    .where('s.id', payload.station_id)
    .first('s.id', 's.district_id', 'd.province_id as province_id');

  if (!station) throw createError(422, 'Unknown station_id', { code: 'STATION_NOT_FOUND' });
  if (!userCanAccessStation(user, station)) {
    throw createError(403, 'Cannot register a vehicle for a station outside your scope', {
      code: 'FORBIDDEN_SCOPE',
    });
  }

  try {
    const [row] = await db('vehicles')
      .insert({ ...payload })
      .returning(VEHICLE_FIELDS);
    return row;
  } catch (err) {
    if (err.code === '23505') {
      throw createError(409, `Plate '${payload.plate_no}' is already registered`, {
        code: 'PLATE_CONFLICT',
      });
    }
    throw err;
  }
}

export async function updateVehicle(user, id, patch) {
  const existing = await getVehicleById(user, id);
  if (!existing) throw createError(404, 'Vehicle not found', { code: 'NOT_FOUND' });

  if (patch.station_id && patch.station_id !== existing.station_id) {
    const station = await db('stations as s')
      .join('districts as d', 'd.id', 's.district_id')
      .where('s.id', patch.station_id)
      .first('s.id', 'd.province_id as province_id');
    if (!station) throw createError(422, 'Unknown station_id', { code: 'STATION_NOT_FOUND' });
    if (!userCanAccessStation(user, station)) {
      throw createError(403, 'Cannot reassign vehicle outside your scope', {
        code: 'FORBIDDEN_SCOPE',
      });
    }
  }

  const [row] = await db('vehicles')
    .where({ id })
    .update({ ...patch, updated_at: db.fn.now() })
    .returning(VEHICLE_FIELDS);
  return row;
}

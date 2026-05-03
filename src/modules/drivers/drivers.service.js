import createError from 'http-errors';
import { db } from '../../config/database.js';
import { applyVehicleScope } from '../../utils/scope.js';

export async function listDrivers({ user, filter = {}, page = 1, limit = 50 }) {
  let base = applyVehicleScope(db('vehicles as v'), user, { vehicleAlias: 'v' })
    .whereNotNull('v.owner_name')
    .whereNotNull('v.owner_nic');

  if (filter.station_id) base = base.where('v.station_id', filter.station_id);
  if (filter.q) {
    base = base.where((qb) => {
      qb.whereILike('v.owner_name', `%${filter.q}%`)
        .orWhereILike('v.owner_nic', `%${filter.q}%`)
        .orWhereILike('v.owner_phone', `%${filter.q}%`);
    });
  }
  if (filter.district || filter.province) {
    base = base
      .join('stations as s', 's.id', 'v.station_id')
      .join('districts as d', 'd.id', 's.district_id');
    if (filter.district) base = base.where('d.code', filter.district);
    if (filter.province) {
      base = base.join('provinces as p', 'p.id', 'd.province_id').where('p.code', filter.province);
    }
  }

  const dataQuery = base
    .clone()
    .select('v.owner_nic as nic', 'v.owner_name as name', 'v.owner_phone as phone')
    .count('v.id as vehicle_count')
    .groupBy('v.owner_nic', 'v.owner_name', 'v.owner_phone')
    .orderBy('v.owner_name', 'asc')
    .limit(limit)
    .offset((page - 1) * limit);

  const distinctSub = base.clone().distinct('v.owner_nic', 'v.owner_name', 'v.owner_phone');

  const [rows, totalRow] = await Promise.all([
    dataQuery,
    db.from(distinctSub.as('sub')).count('* as total').first(),
  ]);

  return {
    rows: rows.map((r) => ({ ...r, vehicle_count: Number(r.vehicle_count) })),
    total: Number(totalRow.total),
  };
}

export async function getDriverByNic(user, nic) {
  const vehicles = await applyVehicleScope(db('vehicles'), user)
    .where('vehicles.owner_nic', nic)
    .select(
      'vehicles.id',
      'vehicles.plate_no',
      'vehicles.status',
      'vehicles.station_id',
      'vehicles.created_at',
      'vehicles.owner_name',
      'vehicles.owner_phone',
    );

  if (vehicles.length === 0) {
    throw createError(404, 'Driver not found', { code: 'NOT_FOUND' });
  }

  const newest = [...vehicles].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  )[0];

  return {
    nic,
    name: newest.owner_name,
    phone: newest.owner_phone,
    vehicle_count: vehicles.length,
    vehicles: vehicles.map((v) => ({
      id: v.id,
      plate_no: v.plate_no,
      status: v.status,
      station_id: v.station_id,
    })),
  };
}

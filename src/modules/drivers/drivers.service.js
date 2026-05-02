import createError from 'http-errors';
import { db } from '../../config/database.js';
import { applyVehicleScope } from '../../utils/scope.js';

/**
 * Drivers are a virtual resource — there's no `drivers` table. The endpoint
 * runs SELECT DISTINCT against the embedded owner columns on the vehicles
 * table, scope-filtered by the caller's role.
 *
 * Vehicles missing owner_name OR owner_nic are excluded; the brief considers
 * a "registered tuk-tuk" to have a known operator.
 */
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

  // Total = number of distinct (nic, name, phone) tuples in the scoped set.
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

/**
 * Detailed view: a driver's profile + the list of vehicles they own that
 * are visible to the caller (scope-checked). 404 when no vehicles match;
 * we don't reveal whether the NIC exists outside the caller's scope.
 */
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

  // owner_name / owner_phone may differ across registrations (data drift);
  // we report the most recently-registered values as canonical.
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

import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import createError from 'http-errors';
import { db } from '../../config/database.js';
import { applyVehicleScope, userCanAccessStation } from '../../utils/scope.js';

export const DEVICE_FIELDS = [
  'id',
  'vehicle_id',
  'key_id',
  'status',
  'last_seen_at',
  'issued_at',
  'revoked_at',
];
export const SORTABLE = ['issued_at', 'last_seen_at', 'status'];

/**
 * Provisions a new tracking device for an existing vehicle.
 *
 * Returns the raw secret exactly once (the operator copies it onto the
 * device firmware); the database stores only the bcrypt hash for the
 * legacy api_key column and the plaintext HMAC secret used at verify time.
 *
 * If the vehicle already has an active device, fail with 409 unless the
 * caller passed `revoke_existing: true`.
 */
export async function provisionDevice(user, { vehicle_id, revoke_existing }) {
  const vehicle = await db('vehicles as v')
    .leftJoin('stations as s', 's.id', 'v.station_id')
    .leftJoin('districts as d', 'd.id', 's.district_id')
    .where('v.id', vehicle_id)
    .first('v.id', 'v.station_id', 'v.status', 'd.province_id as province_id');

  if (!vehicle) throw createError(404, 'Vehicle not found', { code: 'NOT_FOUND' });
  if (vehicle.status !== 'active') {
    throw createError(422, 'Cannot provision a device on a non-active vehicle', {
      code: 'VEHICLE_NOT_ACTIVE',
    });
  }
  if (!userCanAccessStation(user, { id: vehicle.station_id, province_id: vehicle.province_id })) {
    throw createError(403, 'Cannot provision a device outside your scope', {
      code: 'FORBIDDEN_SCOPE',
    });
  }

  const key_id = `dev_${crypto.randomBytes(8).toString('hex')}`;
  const hmac_secret = crypto.randomBytes(32).toString('base64url');
  const api_key_hash = await bcrypt.hash(crypto.randomBytes(16).toString('hex'), 8);

  return db.transaction(async (trx) => {
    const existing = await trx('devices').where({ vehicle_id, status: 'active' }).first('id');
    if (existing) {
      if (!revoke_existing) {
        throw createError(409, 'Vehicle already has an active device', {
          code: 'DEVICE_EXISTS',
        });
      }
      await trx('devices').where({ id: existing.id }).update({
        status: 'revoked',
        revoked_at: trx.fn.now(),
      });
    }

    const [row] = await trx('devices')
      .insert({ vehicle_id, key_id, api_key_hash, hmac_secret, status: 'active' })
      .returning(DEVICE_FIELDS);

    return {
      device: row,
      // Plaintext credentials — surfaced exactly once. Operator must copy to
      // the device immediately; we cannot recover them later.
      credentials: { key_id, hmac_secret },
    };
  });
}

export async function listDevices({ user, filter = {}, sort = [], fields, page = 1, limit = 50 }) {
  const projection = (fields ?? DEVICE_FIELDS).map((c) => `devices.${c}`);

  // Devices are scope-checked indirectly through their vehicle.
  const allowedVehicleIds = applyVehicleScope(db('vehicles').select('vehicles.id'), user);

  let base = db('devices').whereIn('devices.vehicle_id', allowedVehicleIds);

  if (filter.vehicle_id) base = base.where('devices.vehicle_id', filter.vehicle_id);
  if (filter.status) base = base.where('devices.status', filter.status);
  if (filter.station_id || filter.district || filter.province) {
    base = base.join('vehicles as v', 'v.id', 'devices.vehicle_id');
    if (filter.station_id) base = base.where('v.station_id', filter.station_id);
    if (filter.district || filter.province) {
      base = base
        .join('stations as s', 's.id', 'v.station_id')
        .join('districts as d', 'd.id', 's.district_id');
      if (filter.district) base = base.where('d.code', filter.district);
      if (filter.province) {
        base = base
          .join('provinces as p', 'p.id', 'd.province_id')
          .where('p.code', filter.province);
      }
    }
  }

  const dataQuery = base
    .clone()
    .select(projection)
    .limit(limit)
    .offset((page - 1) * limit);
  for (const { column, direction } of sort) {
    dataQuery.orderBy(`devices.${column}`, direction);
  }
  if (sort.length === 0) dataQuery.orderBy('devices.issued_at', 'desc');

  const [rows, countRow] = await Promise.all([
    dataQuery,
    base.clone().clearSelect().clearOrder().count({ total: 'devices.id' }).first(),
  ]);

  return { rows, total: Number(countRow.total) };
}

export async function getDeviceById(user, id) {
  const allowedVehicleIds = applyVehicleScope(db('vehicles').select('vehicles.id'), user);
  return db('devices')
    .where('devices.id', id)
    .whereIn('devices.vehicle_id', allowedVehicleIds)
    .first(DEVICE_FIELDS);
}

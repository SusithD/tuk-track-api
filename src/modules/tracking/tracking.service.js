import createError from 'http-errors';
import { db } from '../../config/database.js';
import { applyVehicleScope } from '../../utils/scope.js';

const STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000;

export async function ingestPings({ device, pings }) {
  const rows = pings.map((p) => ({
    vehicle_id: device.vehicle_id,
    device_id: device.id,
    lat: p.lat,
    lng: p.lng,
    speed_kmh: p.speed_kmh ?? null,
    heading_deg: p.heading_deg ?? null,
    recorded_at: new Date(p.recorded_at).toISOString(),
  }));

  const lastSeenAt = new Date();

  await db.transaction(async (trx) => {
    await trx('locations').insert(rows);
    await trx('devices').where({ id: device.id }).update({ last_seen_at: lastSeenAt });
  });

  return { accepted: rows.length, last_seen_at: lastSeenAt.toISOString() };
}

export async function getLastKnownLocation(user, vehicleId) {
  const vehicle = await applyVehicleScope(
    db('vehicles').where('vehicles.id', vehicleId),
    user,
  ).first('vehicles.id', 'vehicles.plate_no', 'vehicles.station_id', 'vehicles.status');
  if (!vehicle) throw createError(404, 'Vehicle not found', { code: 'NOT_FOUND' });

  const row = await db('locations')
    .where({ vehicle_id: vehicleId })
    .orderBy('recorded_at', 'desc')
    .first('lat', 'lng', 'speed_kmh', 'heading_deg', 'recorded_at', 'received_at');

  if (!row) return { vehicle, location: null };

  const ageSec = Math.floor((Date.now() - new Date(row.recorded_at).getTime()) / 1000);
  return {
    vehicle,
    location: { ...row, age_seconds: ageSec, stale: ageSec * 1000 > STALE_THRESHOLD_MS },
  };
}

export async function getVehicleHistory(user, vehicleId, { from, to, page = 1, limit = 500 }) {
  const vehicle = await applyVehicleScope(
    db('vehicles').where('vehicles.id', vehicleId),
    user,
  ).first('vehicles.id', 'vehicles.plate_no');
  if (!vehicle) throw createError(404, 'Vehicle not found', { code: 'NOT_FOUND' });

  const toDate = to ? new Date(to) : new Date();
  const fromDate = from ? new Date(from) : new Date(toDate.getTime() - 24 * 60 * 60 * 1000);

  const base = db('locations')
    .where('vehicle_id', vehicleId)
    .andWhere('recorded_at', '>=', fromDate.toISOString())
    .andWhere('recorded_at', '<=', toDate.toISOString());

  const [points, countRow] = await Promise.all([
    base
      .clone()
      .select('lat', 'lng', 'speed_kmh', 'heading_deg', 'recorded_at')
      .orderBy('recorded_at', 'asc')
      .limit(limit)
      .offset((page - 1) * limit),
    base.clone().count({ total: 'id' }).first(),
  ]);

  return {
    vehicle,
    range: { from: fromDate.toISOString(), to: toDate.toISOString() },
    points,
    total: Number(countRow.total),
  };
}

export async function listLatestLocations(user, filter, { page = 1, limit = 200 }) {
  const sinceFilter = filter.since ? new Date(filter.since) : null;
  const staleCutoff = new Date(Date.now() - STALE_THRESHOLD_MS);

  let vehicleIdsQ = applyVehicleScope(db('vehicles').select('vehicles.id'), user);
  if (filter.station_id) vehicleIdsQ = vehicleIdsQ.where('vehicles.station_id', filter.station_id);
  if (filter.province || filter.district) {
    vehicleIdsQ = vehicleIdsQ
      .join('stations as s', 's.id', 'vehicles.station_id')
      .join('districts as d', 'd.id', 's.district_id');
    if (filter.district) vehicleIdsQ = vehicleIdsQ.where('d.code', filter.district);
    if (filter.province) {
      vehicleIdsQ = vehicleIdsQ
        .join('provinces as p', 'p.id', 'd.province_id')
        .where('p.code', filter.province);
    }
  }

  const dataQuery = db
    .select(
      'l.vehicle_id',
      'v.plate_no',
      'v.station_id',
      'l.lat',
      'l.lng',
      'l.speed_kmh',
      'l.heading_deg',
      'l.recorded_at',
      'l.received_at',
    )
    .distinctOn('l.vehicle_id')
    .from('locations as l')
    .join('vehicles as v', 'v.id', 'l.vehicle_id')
    .whereIn('l.vehicle_id', vehicleIdsQ)
    .orderBy([
      { column: 'l.vehicle_id', order: 'asc' },
      { column: 'l.recorded_at', order: 'desc' },
    ]);

  if (sinceFilter) dataQuery.andWhere('l.recorded_at', '>=', sinceFilter.toISOString());

  const allRows = await dataQuery;
  const annotated = allRows.map((r) => {
    const ageMs = Date.now() - new Date(r.recorded_at).getTime();
    return { ...r, age_seconds: Math.floor(ageMs / 1000), stale: ageMs > STALE_THRESHOLD_MS };
  });

  let filtered = annotated;
  if (filter.status === 'fresh') filtered = annotated.filter((r) => !r.stale);
  else if (filter.status === 'stale') filtered = annotated.filter((r) => r.stale);

  const total = filtered.length;
  const offset = (page - 1) * limit;
  const slice = filtered.slice(offset, offset + limit);

  return { rows: slice, total, staleCutoff };
}

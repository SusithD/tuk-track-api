import createError from 'http-errors';
import { db } from '../../config/database.js';
import { applyVehicleScope } from '../../utils/scope.js';

const STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000;

/**
 * Persist one or more GPS pings from an authenticated tracking device.
 * Wraps insert + last_seen_at update in a single transaction so a failure
 * in either half rolls the whole thing back.
 */
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

  // Use a single received_at for the whole batch so all rows share an arrival.
  const lastSeenAt = new Date();

  await db.transaction(async (trx) => {
    await trx('locations').insert(rows);
    await trx('devices').where({ id: device.id }).update({ last_seen_at: lastSeenAt });
  });

  return { accepted: rows.length, last_seen_at: lastSeenAt.toISOString() };
}

/** Fetches the most recent ping for a vehicle, or null if it has never reported. */
export async function getLastKnownLocation(user, vehicleId) {
  // Confirm scope first so we 404 (not leak) when the row exists but is out of reach.
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

/**
 * Fetch a vehicle's GPS history within the given window.
 *  - default window: last 24 hours
 *  - max window:     7 days (enforced by the schema)
 *  - returns `points` ordered by recorded_at ascending (good for polylines)
 */
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

/**
 * Cross-fleet "where is everyone right now" view.
 *
 * Uses Postgres DISTINCT ON to fetch the latest ping per vehicle in a single
 * pass, then joins back to vehicles + stations + districts so the response
 * carries enough context for an operations dashboard. Scope-aware (HQ ↔
 * province ↔ station) and filterable by province / district / station_id.
 */
export async function listLatestLocations(user, filter, { page = 1, limit = 200 }) {
  const sinceFilter = filter.since ? new Date(filter.since) : null;
  const staleCutoff = new Date(Date.now() - STALE_THRESHOLD_MS);

  // Sub-query: scoped vehicle ids the caller is allowed to see.
  // Qualify the projection because joins introduce columns of the same name.
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

  // Use DISTINCT ON for "latest per vehicle" — single index scan on the
  // (vehicle_id, recorded_at) composite index defined in the migration.
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

  // DISTINCT ON queries don't compose neatly with COUNT(*), so we paginate
  // in-memory. The scope filter ensures the result set is bounded.
  const total = filtered.length;
  const offset = (page - 1) * limit;
  const slice = filtered.slice(offset, offset + limit);

  return { rows: slice, total, staleCutoff };
}

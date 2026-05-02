/**
 * Role-based row-level filtering for vehicle queries.
 *
 *  - hq:        no filter — sees the entire fleet
 *  - province:  vehicles whose station's district sits in the user's province
 *  - station:   vehicles whose station_id matches the user's
 *
 * The province path needs JOINs onto stations + districts; we expose them
 * via WHERE-IN subqueries to avoid duplicating rows when other JOINs are
 * already present in the calling query.
 */
export function applyVehicleScope(qb, user, { vehicleAlias = 'vehicles' } = {}) {
  if (!user) return qb;
  if (user.role === 'hq') return qb;

  if (user.role === 'station') {
    return qb.where(`${vehicleAlias}.station_id`, user.station_id);
  }

  if (user.role === 'province') {
    return qb.whereIn(
      `${vehicleAlias}.station_id`,
      qb.client
        .queryBuilder()
        .select('s.id')
        .from('stations as s')
        .join('districts as d', 'd.id', 's.district_id')
        .where('d.province_id', user.province_id),
    );
  }

  // Unknown role — fail closed.
  return qb.whereRaw('1 = 0');
}

/** Returns true when the user can see/act on this specific station. */
export function userCanAccessStation(user, station) {
  if (!user || !station) return false;
  if (user.role === 'hq') return true;
  if (user.role === 'station') return user.station_id === station.id;
  if (user.role === 'province') return user.province_id === station.province_id;
  return false;
}

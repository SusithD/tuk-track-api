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

  return qb.whereRaw('1 = 0');
}

export function userCanAccessStation(user, station) {
  if (!user || !station) return false;
  if (user.role === 'hq') return true;
  if (user.role === 'station') return user.station_id === station.id;
  if (user.role === 'province') return user.province_id === station.province_id;
  return false;
}

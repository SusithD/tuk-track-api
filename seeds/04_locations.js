import { mulberry32, pick, intBetween, floatBetween } from './data/random.js';
import { districts as DISTRICTS, stations as STATIONS } from './data/sri-lanka.js';

const HISTORY_DAYS = Number(process.env.SEED_HISTORY_DAYS || 7);
const PING_INTERVAL_MIN = Number(process.env.SEED_PING_INTERVAL_MIN || 10);
const RNG_SEED = Number(process.env.SEED_RNG || 20260430);
const FORCE = process.env.SEED_FORCE === '1';

export async function seed(knex) {
  const existing = await knex('locations').count({ c: 'id' }).first();
  if (Number(existing.c) > 0 && !FORCE) {
    // eslint-disable-next-line no-console
    console.log('  ⊙ location pings already present, skipping');
    return;
  }

  const rng = mulberry32(RNG_SEED);

  const districtByCode = Object.fromEntries(DISTRICTS.map((d) => [d.code, d]));
  const stationByCode = Object.fromEntries(STATIONS.map((s) => [s.code, s]));

  const devices = await knex('devices')
    .join('vehicles', 'devices.vehicle_id', 'vehicles.id')
    .join('stations', 'vehicles.station_id', 'stations.id')
    .where('devices.status', 'active')
    .select('devices.id as device_id', 'devices.vehicle_id', 'stations.code as station_code');

  if (devices.length === 0) {
    // eslint-disable-next-line no-console
    console.log('  ⚠ no active devices — skipping location seeding');
    return;
  }

  const stationHome = (stationCode) => {
    const station = stationByCode[stationCode];
    const district = districtByCode[station.district];
    return {
      lat: district.lat + station.latOffset,
      lng: district.lng + station.lngOffset,
    };
  };

  const now = Date.now();
  const startMs = now - HISTORY_DAYS * 24 * 60 * 60 * 1000;
  const intervalMs = PING_INTERVAL_MIN * 60 * 1000;
  const totalPingsPerVehicle = Math.floor((now - startMs) / intervalMs);

  const silentCutoff = now - 24 * 60 * 60 * 1000;
  const batch = [];
  const BATCH_SIZE = 2000;
  let totalInserted = 0;

  const flush = async () => {
    if (batch.length === 0) return;
    await knex.batchInsert('locations', batch.splice(0, batch.length), BATCH_SIZE);
  };

  for (const dev of devices) {
    const home = stationHome(dev.station_code);
    let curLat = home.lat;
    let curLng = home.lng;
    const goesSilent = rng() < 0.05;

    for (let i = 0; i < totalPingsPerVehicle; i++) {
      const recordedMs = startMs + i * intervalMs + intBetween(rng, -5_000, 5_000);
      if (goesSilent && recordedMs > silentCutoff) break;

      const hour = new Date(recordedMs).getHours();
      const isDaytime = hour >= 6 && hour < 22;

      let speed = 0;
      if (isDaytime) {
        speed = rng() < 0.7 ? floatBetween(rng, 8, 45) : 0;
        if (speed > 0) {
          curLat += floatBetween(rng, -0.004, 0.004);
          curLng += floatBetween(rng, -0.004, 0.004);
          curLat += (home.lat - curLat) * 0.05;
          curLng += (home.lng - curLng) * 0.05;
        }
      } else {
        curLat = home.lat + floatBetween(rng, -0.0005, 0.0005);
        curLng = home.lng + floatBetween(rng, -0.0005, 0.0005);
      }

      batch.push({
        vehicle_id: dev.vehicle_id,
        device_id: dev.device_id,
        lat: Number(curLat.toFixed(6)),
        lng: Number(curLng.toFixed(6)),
        speed_kmh: Number(speed.toFixed(2)),
        heading_deg: speed > 0 ? Math.floor(rng() * 360) : null,
        recorded_at: new Date(recordedMs).toISOString(),
        received_at: new Date(recordedMs + intBetween(rng, 50, 30_000)).toISOString(),
      });

      if (batch.length >= BATCH_SIZE) {
        await flush();
        totalInserted += BATCH_SIZE;
      }
    }
  }

  if (batch.length > 0) {
    totalInserted += batch.length;
    await flush();
  }

  const lastSeenRows = await knex('locations')
    .select('device_id')
    .max('received_at as last')
    .whereNotNull('device_id')
    .groupBy('device_id');

  for (const row of lastSeenRows) {
    await knex('devices').where({ id: row.device_id }).update({ last_seen_at: row.last });
  }

  // eslint-disable-next-line no-console
  console.log(
    `  ✓ locations: ${totalInserted.toLocaleString()} pings across ${devices.length} devices over ${HISTORY_DAYS} day(s)`,
  );
}

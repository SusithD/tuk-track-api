import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { faker } from '@faker-js/faker';
import { mulberry32, pick, intBetween } from './data/random.js';
import { platePrefixes } from './data/sri-lanka.js';

const VEHICLE_COUNT = Number(process.env.SEED_VEHICLE_COUNT || 200);
const RNG_SEED = Number(process.env.SEED_RNG || 20260430);
const FORCE = process.env.SEED_FORCE === '1';

/**
 * Generates `VEHICLE_COUNT` vehicles distributed across all stations,
 * each with an active tracking device. Plate numbers and owner identities
 * are deterministically derived from RNG seed so re-seeding produces the
 * same fleet (useful for demos and viva consistency).
 */
export async function seed(knex) {
  const existing = await knex('vehicles').count({ c: 'id' }).first();
  if (Number(existing.c) > 0 && !FORCE) {
    // eslint-disable-next-line no-console
    console.log('  ⊙ vehicles already present, skipping');
    return;
  }

  const rng = mulberry32(RNG_SEED);
  faker.seed(RNG_SEED);

  const stations = await knex('stations').select('id', 'code');
  if (stations.length === 0) {
    throw new Error('No stations seeded — run master data seeder first');
  }

  const vehicles = [];
  const usedPlates = new Set();

  while (vehicles.length < VEHICLE_COUNT) {
    const prefix = pick(rng, platePrefixes);
    const number = intBetween(rng, 1000, 9999);
    const plate = `${prefix}-${number}`;
    if (usedPlates.has(plate)) continue;
    usedPlates.add(plate);

    const station = pick(rng, stations);
    vehicles.push({
      plate_no: plate,
      owner_name: faker.person.fullName(),
      owner_nic: `${intBetween(rng, 700000000, 999999999)}V`,
      owner_phone: `+947${intBetween(rng, 10000000, 99999999)}`,
      station_id: station.id,
      status: rng() < 0.95 ? 'active' : 'inactive',
    });
  }

  const insertedVehicles = await knex
    .batchInsert('vehicles', vehicles, 100)
    .returning(['id', 'status']);

  const devices = [];
  for (const v of insertedVehicles) {
    if (v.status !== 'active') continue;
    const keyId = `dev_${crypto.randomBytes(6).toString('hex')}`;
    const apiKey = crypto.randomBytes(24).toString('base64url');
    const hmacSecret = crypto.randomBytes(32).toString('base64url');

    devices.push({
      vehicle_id: v.id,
      key_id: keyId,
      api_key_hash: bcrypt.hashSync(apiKey, 8),
      hmac_secret: hmacSecret,
      status: 'active',
    });
  }

  await knex.batchInsert('devices', devices, 100);
  // eslint-disable-next-line no-console
  console.log(
    `  ✓ vehicles: ${insertedVehicles.length} (${devices.length} active devices provisioned)`,
  );
}

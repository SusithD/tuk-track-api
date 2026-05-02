import { provinces, districts, stations } from './data/sri-lanka.js';

const FORCE = process.env.SEED_FORCE === '1';

/**
 * Master data seeder.
 *
 * Default behaviour: skip silently if data already exists. This makes
 * `yarn seed` safe to run on every deploy. Set SEED_FORCE=1 to reset
 * the database (used in dev / when re-seeding a demo).
 */
export async function seed(knex) {
  const existing = await knex('provinces').count({ c: 'id' }).first();
  if (Number(existing.c) > 0 && !FORCE) {
    // eslint-disable-next-line no-console
    console.log('  ⊙ master data already present, skipping (set SEED_FORCE=1 to reset)');
    return;
  }

  await knex.raw(`
    TRUNCATE TABLE
      audit_log,
      locations,
      devices,
      vehicles,
      refresh_tokens,
      users,
      stations,
      districts,
      provinces
    RESTART IDENTITY CASCADE
  `);

  const provinceRows = await knex('provinces').insert(provinces).returning(['id', 'code']);
  const provinceByCode = Object.fromEntries(provinceRows.map((p) => [p.code, p.id]));

  const districtRows = await knex('districts')
    .insert(
      districts.map((d) => ({
        province_id: provinceByCode[d.province],
        code: d.code,
        name: d.name,
      })),
    )
    .returning(['id', 'code']);
  const districtByCode = Object.fromEntries(districtRows.map((d) => [d.code, d.id]));

  await knex('stations').insert(
    stations.map((s) => ({
      district_id: districtByCode[s.district],
      code: s.code,
      name: s.name,
    })),
  );

  // eslint-disable-next-line no-console
  console.log(
    `  ✓ master data: ${provinceRows.length} provinces, ${districtRows.length} districts, ${stations.length} stations`,
  );
}

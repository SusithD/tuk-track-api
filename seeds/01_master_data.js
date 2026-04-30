import { provinces, districts, stations } from './data/sri-lanka.js';

/**
 * Master data seeder.
 *
 * Wipes every domain table (in FK-safe order) before inserting, so the
 * full seed pipeline is idempotent regardless of prior state.
 */
export async function seed(knex) {
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

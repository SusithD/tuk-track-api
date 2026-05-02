import bcrypt from 'bcryptjs';

const FORCE = process.env.SEED_FORCE === '1';

/**
 * User seeder.
 *
 * Provisions a small but representative cast of operators across all three
 * roles. All passwords are the same (Password123!) for ease of demo —
 * documented in the README and report Limitations section.
 */
export async function seed(knex) {
  const existing = await knex('users').count({ c: 'id' }).first();
  if (Number(existing.c) > 0 && !FORCE) {
    // eslint-disable-next-line no-console
    console.log('  ⊙ users already present, skipping');
    return;
  }

  const password_hash = await bcrypt.hash('Password123!', 10);

  const stations = await knex('stations').select('id', 'code', 'district_id');
  const districts = await knex('districts').select('id', 'code', 'province_id');
  const provinceByDistrict = Object.fromEntries(districts.map((d) => [d.id, d.province_id]));

  const users = [
    {
      email: 'hq.admin@police.lk',
      full_name: 'HQ Administrator',
      role: 'hq',
      password_hash,
    },
    {
      email: 'wp.admin@police.lk',
      full_name: 'Western Province Admin',
      role: 'province',
      province_id: (await knex('provinces').where({ code: 'WP' }).first()).id,
      password_hash,
    },
    {
      email: 'cp.admin@police.lk',
      full_name: 'Central Province Admin',
      role: 'province',
      province_id: (await knex('provinces').where({ code: 'CP' }).first()).id,
      password_hash,
    },
  ];

  const stationOfficerCodes = ['COL-CENTRAL', 'COL-PETTAH', 'GAM-MAIN', 'KAN-MAIN', 'GAL-FORT'];
  for (const code of stationOfficerCodes) {
    const s = stations.find((x) => x.code === code);
    if (!s) continue;
    users.push({
      email: `officer.${code.toLowerCase().replace(/[^a-z0-9]/g, '')}@police.lk`,
      full_name: `Officer ${code}`,
      role: 'station',
      province_id: provinceByDistrict[s.district_id],
      station_id: s.id,
      password_hash,
    });
  }

  await knex('users').insert(users);
  // eslint-disable-next-line no-console
  console.log(
    `  ✓ users: ${users.length} (1 HQ, 2 province, ${stationOfficerCodes.length} station)`,
  );
}

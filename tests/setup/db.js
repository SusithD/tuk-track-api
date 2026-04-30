import { db } from '../../src/config/database.js';

export { db };

/** Wipes every domain table between tests, in FK-safe order. */
export async function truncateAll() {
  await db.raw(`
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
}

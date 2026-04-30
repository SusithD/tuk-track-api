import knex from 'knex';
import config from '../../knexfile.js';

/**
 * Runs once before the entire Jest run: ensures the test database has the
 * latest schema. We rollback first so a stale schema from a previous run
 * cannot mask migration bugs.
 */
export default async function globalSetup() {
  const k = knex(config.test);
  try {
    await k.migrate.rollback({}, true);
    await k.migrate.latest();
  } finally {
    await k.destroy();
  }
}

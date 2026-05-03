import knex from 'knex';
import config from '../../knexfile.js';

export default async function globalSetup() {
  const k = knex(config.test);
  try {
    await k.migrate.rollback({}, true);
    await k.migrate.latest();
  } finally {
    await k.destroy();
  }
}

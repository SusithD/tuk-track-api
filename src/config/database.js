import knex from 'knex';
import pg from 'pg';
import config from '../../knexfile.js';
import { env } from './env.js';
import { logger } from '../utils/logger.js';

pg.types.setTypeParser(pg.types.builtins.NUMERIC, (val) => (val === null ? null : Number(val)));
pg.types.setTypeParser(pg.types.builtins.INT8, (val) => (val === null ? null : Number(val)));

const profile = env.NODE_ENV in config ? env.NODE_ENV : 'development';

export const db = knex(config[profile]);

export async function pingDatabase() {
  const result = await db.raw('select 1 as ok');
  return result.rows?.[0]?.ok === 1 || result?.[0]?.ok === 1;
}

export async function closeDatabase() {
  try {
    await db.destroy();
    logger.info('Database pool closed');
  } catch (err) {
    logger.error({ err }, 'Failed to close database pool');
  }
}

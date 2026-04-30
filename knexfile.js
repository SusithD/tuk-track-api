import 'dotenv/config';

const shared = {
  client: 'pg',
  pool: { min: 2, max: 10 },
  migrations: {
    directory: './migrations',
    tableName: 'knex_migrations',
    extension: 'js',
    loadExtensions: ['.js'],
  },
  seeds: {
    directory: './seeds',
    extension: 'js',
    loadExtensions: ['.js'],
  },
};

const config = {
  development: {
    ...shared,
    connection: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5433/tuktrack',
  },
  test: {
    ...shared,
    connection:
      process.env.TEST_DATABASE_URL || 'postgres://postgres:postgres@localhost:5433/tuktrack_test',
    pool: { min: 1, max: 4 },
  },
  production: {
    ...shared,
    connection: {
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    },
    pool: { min: 2, max: 20 },
  },
};

export default config;

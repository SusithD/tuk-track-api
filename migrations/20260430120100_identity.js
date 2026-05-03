export async function up(knex) {
  await knex.schema.createTable('users', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.string('email', 160).notNullable().unique();
    t.string('password_hash', 120).notNullable();
    t.string('full_name', 120).notNullable();
    t.enu('role', ['hq', 'province', 'station'], {
      useNative: true,
      enumName: 'user_role',
    }).notNullable();
    t.uuid('province_id').references('id').inTable('provinces').onDelete('RESTRICT');
    t.uuid('station_id').references('id').inTable('stations').onDelete('RESTRICT');
    t.enu('status', ['active', 'disabled'], { useNative: true, enumName: 'user_status' })
      .notNullable()
      .defaultTo('active');
    t.timestamp('last_login_at', { useTz: true });
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    t.index(['role'], 'idx_users_role');
    t.index(['station_id'], 'idx_users_station');
    t.index(['province_id'], 'idx_users_province');
  });

  await knex.schema.raw(`
    ALTER TABLE users
      ADD CONSTRAINT users_role_scope_chk CHECK (
        (role = 'hq'       AND province_id IS NULL AND station_id IS NULL) OR
        (role = 'province' AND province_id IS NOT NULL AND station_id IS NULL) OR
        (role = 'station'  AND station_id  IS NOT NULL)
      )
  `);

  await knex.schema.createTable('refresh_tokens', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.string('token_hash', 120).notNullable().unique();
    t.timestamp('expires_at', { useTz: true }).notNullable();
    t.timestamp('revoked_at', { useTz: true });
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.string('user_agent', 240);
    t.string('ip', 64);
    t.index(['user_id'], 'idx_refresh_tokens_user');
  });
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('refresh_tokens');
  await knex.schema.dropTableIfExists('users');
  await knex.raw('DROP TYPE IF EXISTS user_status');
  await knex.raw('DROP TYPE IF EXISTS user_role');
}

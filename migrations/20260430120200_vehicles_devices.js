export async function up(knex) {
  await knex.schema.createTable('vehicles', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.string('plate_no', 16).notNullable().unique();
    t.string('owner_name', 120).notNullable();
    t.string('owner_nic', 16);
    t.string('owner_phone', 24);
    t.uuid('station_id').notNullable().references('id').inTable('stations').onDelete('RESTRICT');
    t.enu('status', ['active', 'inactive', 'impounded'], {
      useNative: true,
      enumName: 'vehicle_status',
    })
      .notNullable()
      .defaultTo('active');
    t.timestamp('registered_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    t.index(['station_id'], 'idx_vehicles_station');
    t.index(['status'], 'idx_vehicles_status');
  });

  await knex.schema.createTable('devices', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('vehicle_id').notNullable().references('id').inTable('vehicles').onDelete('CASCADE');
    t.string('key_id', 24).notNullable().unique();
    t.string('api_key_hash', 120).notNullable();
    t.string('hmac_secret', 120).notNullable();
    t.enu('status', ['active', 'revoked'], { useNative: true, enumName: 'device_status' })
      .notNullable()
      .defaultTo('active');
    t.timestamp('last_seen_at', { useTz: true });
    t.timestamp('issued_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('revoked_at', { useTz: true });

    t.unique(['vehicle_id'], {
      indexName: 'devices_vehicle_active_uniq',
      predicate: knex.whereRaw("status = 'active'"),
    });
    t.index(['vehicle_id'], 'idx_devices_vehicle');
  });
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('devices');
  await knex.schema.dropTableIfExists('vehicles');
  await knex.raw('DROP TYPE IF EXISTS device_status');
  await knex.raw('DROP TYPE IF EXISTS vehicle_status');
}

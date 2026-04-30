/**
 * Location pings:
 *  - high-volume table; expect ~1 ping/min/vehicle in production
 *  - recorded_at is the device's wall-clock; received_at is server-side
 *  - composite index supports both "last known" (DESC limit 1) and
 *    "history within window" queries
 *
 * For coursework simplicity, lat/lng are stored as numeric. PostGIS could be
 * layered later for geo-fencing without changing the API contract.
 */
export async function up(knex) {
  await knex.schema.createTable('locations', (t) => {
    t.bigIncrements('id').primary();
    t.uuid('vehicle_id').notNullable().references('id').inTable('vehicles').onDelete('CASCADE');
    t.uuid('device_id').references('id').inTable('devices').onDelete('SET NULL');
    t.decimal('lat', 9, 6).notNullable();
    t.decimal('lng', 9, 6).notNullable();
    t.decimal('speed_kmh', 5, 2);
    t.decimal('heading_deg', 5, 2);
    t.timestamp('recorded_at', { useTz: true }).notNullable();
    t.timestamp('received_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.string('nonce', 64);

    t.index(['vehicle_id', 'recorded_at'], 'idx_locations_vehicle_time');
    t.index(['recorded_at'], 'idx_locations_time');
  });

  await knex.raw(`
    ALTER TABLE locations
      ADD CONSTRAINT locations_lat_chk CHECK (lat BETWEEN -90 AND 90),
      ADD CONSTRAINT locations_lng_chk CHECK (lng BETWEEN -180 AND 180)
  `);
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('locations');
}

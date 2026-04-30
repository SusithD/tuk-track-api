/**
 * Administrative master data: provinces → districts → police stations.
 * These three form the geographic backbone for filtering and access control.
 */
export async function up(knex) {
  await knex.schema.createTable('provinces', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.string('code', 8).notNullable().unique();
    t.string('name', 80).notNullable();
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('districts', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('province_id').notNullable().references('id').inTable('provinces').onDelete('RESTRICT');
    t.string('code', 8).notNullable().unique();
    t.string('name', 80).notNullable();
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.index(['province_id'], 'idx_districts_province');
  });

  await knex.schema.createTable('stations', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('district_id').notNullable().references('id').inTable('districts').onDelete('RESTRICT');
    t.string('code', 16).notNullable().unique();
    t.string('name', 120).notNullable();
    t.string('address', 240);
    t.string('contact_phone', 24);
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.index(['district_id'], 'idx_stations_district');
  });
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('stations');
  await knex.schema.dropTableIfExists('districts');
  await knex.schema.dropTableIfExists('provinces');
}

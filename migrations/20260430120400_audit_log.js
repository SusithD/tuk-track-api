export async function up(knex) {
  await knex.schema.createTable('audit_log', (t) => {
    t.bigIncrements('id').primary();
    t.uuid('actor_user_id').references('id').inTable('users').onDelete('SET NULL');
    t.string('actor_role', 16);
    t.string('action', 64).notNullable();
    t.string('entity', 32).notNullable();
    t.string('entity_id', 64);
    t.jsonb('meta');
    t.string('request_id', 64);
    t.string('ip', 64);
    t.timestamp('at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    t.index(['entity', 'entity_id'], 'idx_audit_entity');
    t.index(['actor_user_id', 'at'], 'idx_audit_actor_time');
    t.index(['at'], 'idx_audit_time');
  });
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('audit_log');
}

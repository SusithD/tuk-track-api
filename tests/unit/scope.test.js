import knex from 'knex';
import { applyVehicleScope, userCanAccessStation } from '../../src/utils/scope.js';

const k = knex({ client: 'pg' });

afterAll(async () => {
  await k.destroy();
});

describe('applyVehicleScope', () => {
  it('adds no WHERE for HQ users', () => {
    const sql = applyVehicleScope(k('vehicles').select('*'), { role: 'hq' }).toSQL().sql;
    expect(sql.toLowerCase()).not.toContain('where');
  });

  it('filters by station_id for station users', () => {
    const built = applyVehicleScope(k('vehicles').select('*'), {
      role: 'station',
      station_id: 'station-uuid',
    }).toSQL();
    expect(built.sql).toMatch(/where "vehicles"\."station_id" = \?/);
    expect(built.bindings).toContain('station-uuid');
  });

  it('uses an IN-subquery for province users', () => {
    const built = applyVehicleScope(k('vehicles').select('*'), {
      role: 'province',
      province_id: 'province-uuid',
    }).toSQL();
    expect(built.sql.toLowerCase()).toContain('where "vehicles"."station_id" in');
    expect(built.sql).toContain('"stations"');
    expect(built.sql).toContain('"districts"');
    expect(built.bindings).toContain('province-uuid');
  });

  it('respects a custom vehicleAlias', () => {
    const built = applyVehicleScope(
      k('vehicles as v').select('*'),
      { role: 'station', station_id: 'x' },
      { vehicleAlias: 'v' },
    ).toSQL();
    expect(built.sql).toContain('"v"."station_id"');
  });

  it('fails closed for an unknown role', () => {
    const built = applyVehicleScope(k('vehicles').select('*'), { role: 'rogue' }).toSQL();
    expect(built.sql).toMatch(/1 = 0/);
  });

  it('returns the query unchanged when no user is supplied', () => {
    const before = k('vehicles').select('*').toSQL().sql;
    const after = applyVehicleScope(k('vehicles').select('*'), null).toSQL().sql;
    expect(after).toBe(before);
  });
});

describe('userCanAccessStation', () => {
  const station = { id: 'station-1', province_id: 'province-1' };

  it('always allows HQ', () => {
    expect(userCanAccessStation({ role: 'hq' }, station)).toBe(true);
  });

  it('allows station officer only for their own station', () => {
    expect(userCanAccessStation({ role: 'station', station_id: 'station-1' }, station)).toBe(true);
    expect(userCanAccessStation({ role: 'station', station_id: 'other' }, station)).toBe(false);
  });

  it('allows province admin only for stations in their province', () => {
    expect(userCanAccessStation({ role: 'province', province_id: 'province-1' }, station)).toBe(
      true,
    );
    expect(userCanAccessStation({ role: 'province', province_id: 'province-2' }, station)).toBe(
      false,
    );
  });

  it('returns false for unknown roles or missing inputs', () => {
    expect(userCanAccessStation({ role: 'guest' }, station)).toBe(false);
    expect(userCanAccessStation(null, station)).toBe(false);
    expect(userCanAccessStation({ role: 'hq' }, null)).toBe(false);
  });
});

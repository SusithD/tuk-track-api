import createError from 'http-errors';
import { db } from '../../config/database.js';
import { hashPassword } from '../../utils/passwords.js';

export const USER_FIELDS = [
  'id',
  'email',
  'full_name',
  'role',
  'province_id',
  'station_id',
  'status',
  'last_login_at',
  'created_at',
  'updated_at',
];

export const SORTABLE = ['email', 'full_name', 'role', 'created_at', 'last_login_at'];

export function applyUserScope(qb, user) {
  if (!user) return qb;
  if (user.role === 'hq') return qb;
  if (user.role === 'province') return qb.where('users.province_id', user.province_id);
  return qb.where('users.id', user.id);
}

export async function createUser(payload) {
  if (payload.station_id) {
    const station = await db('stations as s')
      .join('districts as d', 'd.id', 's.district_id')
      .where('s.id', payload.station_id)
      .first('s.id', 'd.province_id as province_id');
    if (!station) throw createError(422, 'Unknown station_id', { code: 'STATION_NOT_FOUND' });
    if (payload.province_id && station.province_id !== payload.province_id) {
      throw createError(422, 'station_id does not belong to the supplied province_id', {
        code: 'STATION_PROVINCE_MISMATCH',
      });
    }
  }
  if (payload.province_id) {
    const exists = await db('provinces').where({ id: payload.province_id }).first('id');
    if (!exists) throw createError(422, 'Unknown province_id', { code: 'PROVINCE_NOT_FOUND' });
  }

  const password_hash = await hashPassword(payload.password);

  try {
    const [row] = await db('users')
      .insert({
        email: payload.email.toLowerCase(),
        password_hash,
        full_name: payload.full_name,
        role: payload.role,
        province_id: payload.province_id || null,
        station_id: payload.station_id || null,
        status: payload.status,
      })
      .returning(USER_FIELDS);
    return row;
  } catch (err) {
    if (err.code === '23505') {
      throw createError(409, 'Email already in use', { code: 'EMAIL_CONFLICT' });
    }
    throw err;
  }
}

export async function listUsers({ user, filter = {}, sort = [], fields, page = 1, limit = 50 }) {
  const projection = (fields ?? USER_FIELDS).map((c) => `users.${c}`);

  let base = db('users');
  base = applyUserScope(base, user);

  if (filter.role) base = base.where('users.role', filter.role);
  if (filter.province_id) base = base.where('users.province_id', filter.province_id);
  if (filter.station_id) base = base.where('users.station_id', filter.station_id);
  if (filter.status) base = base.where('users.status', filter.status);
  if (filter.q) {
    base = base.where((qb) => {
      qb.whereILike('users.email', `%${filter.q}%`).orWhereILike(
        'users.full_name',
        `%${filter.q}%`,
      );
    });
  }

  const dataQuery = base
    .clone()
    .select(projection)
    .limit(limit)
    .offset((page - 1) * limit);
  for (const { column, direction } of sort) {
    dataQuery.orderBy(`users.${column}`, direction);
  }
  if (sort.length === 0) dataQuery.orderBy('users.email', 'asc');

  const [rows, countRow] = await Promise.all([
    dataQuery,
    base.clone().clearSelect().clearOrder().count({ total: 'users.id' }).first(),
  ]);

  return { rows, total: Number(countRow.total) };
}

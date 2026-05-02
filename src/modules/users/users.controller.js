import * as svc from './users.service.js';
import { createUserSchema, listUserQuerySchema } from './users.schemas.js';
import {
  parsePagination,
  parseSort,
  parseFields,
  paginated,
  setLinkHeader,
} from '../../utils/query.js';

/**
 * @openapi
 * /api/v1/users:
 *   post:
 *     tags: [Users]
 *     summary: Create a user account (HQ admin only)
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password, full_name, role]
 *             properties:
 *               email:       { type: string, format: email }
 *               password:    { type: string, format: password, minLength: 8 }
 *               full_name:   { type: string, minLength: 2, maxLength: 120 }
 *               role:        { type: string, enum: [hq, province, station] }
 *               province_id: { type: string, format: uuid }
 *               station_id:  { type: string, format: uuid }
 *               status:      { type: string, enum: [active, disabled], default: active }
 *     responses:
 *       201:
 *         description: User created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data: { $ref: '#/components/schemas/User' }
 *       409: { description: Email already in use }
 *       422: { $ref: '#/components/responses/ValidationError' }
 */
export async function create(req, res, next) {
  try {
    const body = createUserSchema.parse(req.body);
    const row = await svc.createUser(body);
    res.status(201).location(`/api/v1/users/${row.id}`).json({ data: row });
  } catch (err) {
    next(err);
  }
}

/**
 * @openapi
 * /api/v1/users:
 *   get:
 *     tags: [Users]
 *     summary: List users (HQ sees all; province admin sees their province)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: role
 *         schema: { type: string, enum: [hq, province, station] }
 *       - in: query
 *         name: province_id
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: station_id
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [active, disabled] }
 *       - in: query
 *         name: q
 *         description: Free-text search on email or full_name
 *         schema: { type: string }
 *       - in: query
 *         name: sort
 *         schema: { type: string }
 *       - in: query
 *         name: fields
 *         schema: { type: string }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 50, maximum: 200 }
 *     responses:
 *       200:
 *         description: Page of users
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items: { $ref: '#/components/schemas/User' }
 *                 meta:  { $ref: '#/components/schemas/PaginationMeta' }
 *                 links: { $ref: '#/components/schemas/PaginationLinks' }
 */
export async function list(req, res, next) {
  try {
    const q = listUserQuerySchema.parse(req.query);
    const { page, limit } = parsePagination({ page: q.page, limit: q.limit });
    const sort = parseSort(q.sort, svc.SORTABLE);
    const fields = parseFields(q.fields, svc.USER_FIELDS);

    const { rows, total } = await svc.listUsers({
      user: req.user,
      filter: {
        role: q.role,
        province_id: q.province_id,
        station_id: q.station_id,
        status: q.status,
        q: q.q,
      },
      sort,
      fields,
      page,
      limit,
    });

    const envelope = paginated(req, rows, { page, limit, total });
    setLinkHeader(res, envelope.links);
    res.json(envelope);
  } catch (err) {
    next(err);
  }
}

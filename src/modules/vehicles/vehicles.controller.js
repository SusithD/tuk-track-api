import createError from 'http-errors';
import { z } from 'zod';
import * as svc from './vehicles.service.js';
import {
  createVehicleSchema,
  updateVehicleSchema,
  listVehicleQuerySchema,
} from './vehicles.schemas.js';
import {
  parsePagination,
  parseSort,
  parseFields,
  paginated,
  setLinkHeader,
} from '../../utils/query.js';
import { honorLastModified } from '../../utils/cache-headers.js';

const uuid = z.string().uuid();

/**
 * @openapi
 * /api/v1/vehicles:
 *   get:
 *     tags: [Vehicles]
 *     summary: List vehicles, scoped to the caller's role
 *     description: |
 *       Supports filtering, sorting, sparse fieldsets, and offset pagination.
 *       Results are automatically scoped: HQ sees all, province admins see
 *       their province, station officers see their own station.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [active, inactive, impounded] }
 *       - in: query
 *         name: station_id
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: district
 *         schema: { type: string, example: COL }
 *       - in: query
 *         name: province
 *         schema: { type: string, example: WP }
 *       - in: query
 *         name: q
 *         description: Free-text search on plate_no or owner_name
 *         schema: { type: string }
 *       - in: query
 *         name: sort
 *         description: 'Comma-separated. Prefix `-` for desc. Example: `-created_at,plate_no`'
 *         schema: { type: string }
 *       - in: query
 *         name: fields
 *         description: 'Sparse fieldset. Example: `id,plate_no,status`'
 *         schema: { type: string }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 50, maximum: 200 }
 *     responses:
 *       200:
 *         description: Page of vehicles + pagination metadata
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items: { $ref: '#/components/schemas/Vehicle' }
 *                 meta:  { $ref: '#/components/schemas/PaginationMeta' }
 *                 links: { $ref: '#/components/schemas/PaginationLinks' }
 *       304: { description: Not modified (If-None-Match matched) }
 *       400: { description: Bad query (unsortable column or unknown field) }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
export async function list(req, res, next) {
  try {
    const q = listVehicleQuerySchema.parse(req.query);
    const { page, limit } = parsePagination({ page: q.page, limit: q.limit });
    const sort = parseSort(q.sort, svc.SORTABLE);
    const fields = parseFields(q.fields, svc.VEHICLE_FIELDS);

    const { rows, total } = await svc.listVehicles({
      user: req.user,
      filter: {
        status: q.status,
        station_id: q.station_id,
        district: q.district,
        province: q.province,
        q: q.q,
      },
      sort,
      fields,
      page,
      limit,
    });

    // List endpoints honour Last-Modified by max(updated_at) — cheap conditional GET
    // without recomputing the body.
    let last = null;
    for (const r of rows) {
      const t = r.updated_at;
      if (!t) continue;
      const d = new Date(t);
      if (!last || d > last) last = d;
    }
    if (last && honorLastModified(req, res, last)) return;

    const envelope = paginated(req, rows, { page, limit, total });
    setLinkHeader(res, envelope.links);
    res.json(envelope);
  } catch (err) {
    next(err);
  }
}

/**
 * @openapi
 * /api/v1/vehicles/{id}:
 *   get:
 *     tags: [Vehicles]
 *     summary: Fetch a single vehicle (scope-checked)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Vehicle
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data: { $ref: '#/components/schemas/Vehicle' }
 *       304: { description: Not modified (If-None-Match matched) }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
export async function getById(req, res, next) {
  try {
    uuid.parse(req.params.id);
    const row = await svc.getVehicleById(req.user, req.params.id);
    // 404 even when the row exists outside scope: don't leak existence.
    if (!row) throw createError(404, 'Vehicle not found', { code: 'NOT_FOUND' });
    if (honorLastModified(req, res, new Date(row.updated_at))) return;
    res.json({ data: row });
  } catch (err) {
    next(err);
  }
}

/**
 * @openapi
 * /api/v1/vehicles:
 *   post:
 *     tags: [Vehicles]
 *     summary: Register a new vehicle (HQ or owning station only)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/VehicleCreate' }
 *     responses:
 *       201:
 *         description: Created — Location header points at new resource
 *         headers:
 *           Location:
 *             description: URL of the newly created vehicle
 *             schema: { type: string, format: uri }
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data: { $ref: '#/components/schemas/Vehicle' }
 *       409: { description: Plate already registered }
 *       422: { $ref: '#/components/responses/ValidationError' }
 */
export async function create(req, res, next) {
  try {
    const payload = createVehicleSchema.parse(req.body);
    const row = await svc.createVehicle(req.user, payload);
    res.status(201).location(`/api/v1/vehicles/${row.id}`).json({ data: row });
  } catch (err) {
    next(err);
  }
}

/**
 * @openapi
 * /api/v1/vehicles/{id}:
 *   patch:
 *     tags: [Vehicles]
 *     summary: Partially update a vehicle (scope-checked)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/VehicleUpdate' }
 *     responses:
 *       200:
 *         description: Updated vehicle
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data: { $ref: '#/components/schemas/Vehicle' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       422: { $ref: '#/components/responses/ValidationError' }
 */
export async function update(req, res, next) {
  try {
    uuid.parse(req.params.id);
    const patch = updateVehicleSchema.parse(req.body);
    const row = await svc.updateVehicle(req.user, req.params.id, patch);
    res.json({ data: row });
  } catch (err) {
    next(err);
  }
}

import createError from 'http-errors';
import { z } from 'zod';
import * as svc from './devices.service.js';
import { provisionDeviceSchema, listDeviceQuerySchema } from './devices.schemas.js';
import {
  parsePagination,
  parseSort,
  parseFields,
  paginated,
  setLinkHeader,
} from '../../utils/query.js';

const uuid = z.string().uuid();

/**
 * @openapi
 * /api/v1/devices:
 *   post:
 *     tags: [Devices]
 *     summary: Provision a new tracking device for a vehicle
 *     description: |
 *       Returns the device's `key_id` and `hmac_secret` exactly once — the
 *       operator must copy these to the tracker hardware immediately. The
 *       server retains only the verifier, not a recoverable plaintext.
 *
 *       If the vehicle already has an active device, returns 409 unless the
 *       caller explicitly passes `revoke_existing: true`.
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [vehicle_id]
 *             properties:
 *               vehicle_id:      { type: string, format: uuid }
 *               revoke_existing: { type: boolean, default: false }
 *     responses:
 *       201:
 *         description: Device provisioned (credentials shown once)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     device:
 *                       $ref: '#/components/schemas/Device'
 *                     credentials:
 *                       type: object
 *                       properties:
 *                         key_id:      { type: string }
 *                         hmac_secret: { type: string }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       409: { description: Vehicle already has an active device }
 *       422: { $ref: '#/components/responses/ValidationError' }
 */
export async function provision(req, res, next) {
  try {
    const body = provisionDeviceSchema.parse(req.body);
    const result = await svc.provisionDevice(req.user, body);
    res.status(201).location(`/api/v1/devices/${result.device.id}`).json({ data: result });
  } catch (err) {
    next(err);
  }
}

/**
 * @openapi
 * /api/v1/devices:
 *   get:
 *     tags: [Devices]
 *     summary: List provisioned devices, scope-aware
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: vehicle_id
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: station_id
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: district
 *         schema: { type: string }
 *       - in: query
 *         name: province
 *         schema: { type: string }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [active, revoked] }
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
 *         description: Page of device metadata (no secrets)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items: { $ref: '#/components/schemas/Device' }
 *                 meta:  { $ref: '#/components/schemas/PaginationMeta' }
 *                 links: { $ref: '#/components/schemas/PaginationLinks' }
 */
export async function list(req, res, next) {
  try {
    const q = listDeviceQuerySchema.parse(req.query);
    const { page, limit } = parsePagination({ page: q.page, limit: q.limit });
    const sort = parseSort(q.sort, svc.SORTABLE);
    const fields = parseFields(q.fields, svc.DEVICE_FIELDS);

    const { rows, total } = await svc.listDevices({
      user: req.user,
      filter: {
        vehicle_id: q.vehicle_id,
        station_id: q.station_id,
        district: q.district,
        province: q.province,
        status: q.status,
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

/**
 * @openapi
 * /api/v1/devices/{id}:
 *   get:
 *     tags: [Devices]
 *     summary: Get a single device by id (scope-checked)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Device metadata
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data: { $ref: '#/components/schemas/Device' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
export async function getById(req, res, next) {
  try {
    uuid.parse(req.params.id);
    const row = await svc.getDeviceById(req.user, req.params.id);
    if (!row) throw createError(404, 'Device not found', { code: 'NOT_FOUND' });
    res.json({ data: row });
  } catch (err) {
    next(err);
  }
}

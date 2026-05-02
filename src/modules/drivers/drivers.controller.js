import * as svc from './drivers.service.js';
import { listDriverQuerySchema, nicParamSchema } from './drivers.schemas.js';
import { parsePagination, paginated, setLinkHeader } from '../../utils/query.js';

/**
 * @openapi
 * /api/v1/drivers:
 *   get:
 *     tags: [Drivers]
 *     summary: List registered tuk-tuk drivers (virtual resource over vehicles)
 *     description: |
 *       Drivers are derived from the embedded owner_* fields on vehicles —
 *       there is no separate drivers table. This endpoint deduplicates
 *       drivers by (nic, name, phone) and returns each with a vehicle_count.
 *
 *       Scope-aware: HQ sees all drivers, province admins see drivers whose
 *       vehicles fall within their province, station officers see drivers
 *       whose vehicles are at their station.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
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
 *         description: Free-text search on owner_name, owner_nic, or owner_phone
 *         schema: { type: string }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 50, maximum: 200 }
 *     responses:
 *       200:
 *         description: Page of drivers
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items: { $ref: '#/components/schemas/Driver' }
 *                 meta:  { $ref: '#/components/schemas/PaginationMeta' }
 *                 links: { $ref: '#/components/schemas/PaginationLinks' }
 */
export async function list(req, res, next) {
  try {
    const q = listDriverQuerySchema.parse(req.query);
    const { page, limit } = parsePagination({ page: q.page, limit: q.limit });

    const { rows, total } = await svc.listDrivers({
      user: req.user,
      filter: { station_id: q.station_id, district: q.district, province: q.province, q: q.q },
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
 * /api/v1/drivers/{nic}:
 *   get:
 *     tags: [Drivers]
 *     summary: Driver profile + the vehicles they own (scope-filtered)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: nic
 *         required: true
 *         description: Sri Lankan NIC (legacy 9-digit + V/X, or modern 12-digit)
 *         schema: { type: string, example: '882233456V' }
 *     responses:
 *       200:
 *         description: Driver detail
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data: { $ref: '#/components/schemas/DriverDetail' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       422: { description: NIC parameter is malformed }
 */
export async function getByNic(req, res, next) {
  try {
    const nic = nicParamSchema.parse(req.params.nic);
    const data = await svc.getDriverByNic(req.user, nic);
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

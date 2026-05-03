import { z } from 'zod';
import * as svc from './tracking.service.js';
import { pingPayloadSchema, historyQuerySchema, opsListQuerySchema } from './tracking.schemas.js';
import { parsePagination, paginated, setLinkHeader } from '../../utils/query.js';
import { honorLastModified } from '../../utils/cache-headers.js';

const uuid = z.string().uuid();

/**
 * @openapi
 * /api/v1/devices/pings:
 *   post:
 *     tags: [Devices]
 *     summary: Ingest one or more GPS pings from a tracking device
 *     description: |
 *       Authenticated via HMAC-SHA256 signature (see headers below). The body
 *       may be a single ping object or `{ pings: [...] }` for batch upload
 *       (max 100 per request). Pings are persisted atomically with the
 *       device's last_seen_at update.
 *     security:
 *       - deviceHmac: []
 *     parameters:
 *       - in: header
 *         name: x-key-id
 *         required: true
 *         schema: { type: string }
 *       - in: header
 *         name: x-timestamp
 *         required: true
 *         schema: { type: integer }
 *         description: Unix epoch seconds, must be within ±5min of server clock.
 *       - in: header
 *         name: x-nonce
 *         required: true
 *         schema: { type: string }
 *       - in: header
 *         name: x-signature
 *         required: true
 *         schema: { type: string }
 *         description: hex(HMAC-SHA256(secret, "<ts>\n<nonce>\n<METHOD>\n<path>\n<sha256(body)>"))
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             oneOf:
 *               - $ref: '#/components/schemas/PingIngest'
 *               - $ref: '#/components/schemas/PingBatch'
 *     responses:
 *       202:
 *         description: Pings accepted
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     accepted:     { type: integer }
 *                     last_seen_at: { type: string, format: date-time }
 *       401: { description: Device signature invalid or stale }
 *       409: { description: Nonce replay }
 *       422: { $ref: '#/components/responses/ValidationError' }
 */
export async function ingest(req, res, next) {
  try {
    const body = pingPayloadSchema.parse(req.body);
    const pings = Array.isArray(body.pings) ? body.pings : [body];
    const result = await svc.ingestPings({ device: req.device, pings });
    res.status(202).json({ data: result });
  } catch (err) {
    next(err);
  }
}

/**
 * @openapi
 * /api/v1/vehicles/{id}/location:
 *   get:
 *     tags: [Locations]
 *     summary: Last-known live location for a vehicle
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Latest ping with stale/age annotations
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     vehicle:  { $ref: '#/components/schemas/Vehicle' }
 *                     location:
 *                       oneOf:
 *                         - { $ref: '#/components/schemas/LocationPing' }
 *                         - { type: 'null' }
 *       304: { description: Not modified }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
export async function lastKnown(req, res, next) {
  try {
    uuid.parse(req.params.id);
    const result = await svc.getLastKnownLocation(req.user, req.params.id);
    if (result.location && honorLastModified(req, res, new Date(result.location.recorded_at))) {
      return;
    }
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
}

/**
 * @openapi
 * /api/v1/vehicles/{id}/history:
 *   get:
 *     tags: [Locations]
 *     summary: Historical movement log for a vehicle within a time window
 *     description: Default window is the last 24 hours; max 7 days.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: from
 *         schema: { type: string, format: date-time }
 *       - in: query
 *         name: to
 *         schema: { type: string, format: date-time }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 500, maximum: 2000 }
 *     responses:
 *       200: { description: Paginated array of ping points (asc by recorded_at) }
 *       404: { description: Vehicle not found OR outside your scope }
 *       422: { description: Invalid time window }
 */
export async function history(req, res, next) {
  try {
    uuid.parse(req.params.id);
    const q = historyQuerySchema.parse(req.query);
    const { page, limit } = parsePagination(
      { page: q.page, limit: q.limit },
      { defaultLimit: 500, maxLimit: 2000 },
    );

    const result = await svc.getVehicleHistory(req.user, req.params.id, {
      from: q.from,
      to: q.to,
      page,
      limit,
    });

    const envelope = paginated(req, result.points, { page, limit, total: result.total });
    envelope.data = {
      vehicle: result.vehicle,
      range: result.range,
      points: result.points,
    };
    setLinkHeader(res, envelope.links);
    res.json(envelope);
  } catch (err) {
    next(err);
  }
}

/**
 * @openapi
 * /api/v1/locations:
 *   get:
 *     tags: [Locations]
 *     summary: Cross-fleet "where is everyone now" — latest ping per vehicle
 *     description: |
 *       Returns the most recent ping for every vehicle the caller has scope
 *       to see, optionally filtered by province / district / station / freshness.
 *       Each row is annotated with `age_seconds` and `stale` (true when older
 *       than 24 hours).
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: province
 *         schema: { type: string, example: WP }
 *       - in: query
 *         name: district
 *         schema: { type: string, example: COL }
 *       - in: query
 *         name: station_id
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: since
 *         schema: { type: string, format: date-time }
 *         description: Only include vehicles that pinged at or after this timestamp.
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [fresh, stale, any] }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 200, maximum: 500 }
 *     responses:
 *       200:
 *         description: Page of latest-per-vehicle rows
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items: { $ref: '#/components/schemas/FleetLocationRow' }
 *                 meta:  { $ref: '#/components/schemas/PaginationMeta' }
 *                 links: { $ref: '#/components/schemas/PaginationLinks' }
 */
export async function opsList(req, res, next) {
  try {
    const q = opsListQuerySchema.parse(req.query);
    const { page, limit } = parsePagination(
      { page: q.page, limit: q.limit },
      { defaultLimit: 200, maxLimit: 500 },
    );

    const { rows, total } = await svc.listLatestLocations(
      req.user,
      {
        province: q.province,
        district: q.district,
        station_id: q.station_id,
        since: q.since,
        status: q.status,
      },
      { page, limit },
    );

    const envelope = paginated(req, rows, { page, limit, total });
    setLinkHeader(res, envelope.links);
    res.json(envelope);
  } catch (err) {
    next(err);
  }
}

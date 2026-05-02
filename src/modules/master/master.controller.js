import createError from 'http-errors';
import { z } from 'zod';
import * as svc from './master.service.js';
import { honorLastModified } from '../../utils/cache-headers.js';

const uuid = z.string().uuid();

/**
 * @openapi
 * /api/v1/provinces:
 *   get:
 *     tags: [Master Data]
 *     summary: List all provinces
 *     description: Cacheable for 5 minutes. Honors If-None-Match (ETag) and If-Modified-Since.
 *     responses:
 *       200: { description: Array of provinces }
 *       304: { description: Not modified }
 */
export async function listProvinces(req, res, next) {
  try {
    const rows = await svc.listProvinces();
    if (honorLastModified(req, res, svc.maxUpdatedAt(rows))) return;
    res.json({ data: rows, meta: { count: rows.length } });
  } catch (err) {
    next(err);
  }
}

/**
 * @openapi
 * /api/v1/provinces/{id}:
 *   get:
 *     tags: [Master Data]
 *     summary: Fetch a single province
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Province }
 *       404: { description: Not found }
 */
export async function getProvince(req, res, next) {
  try {
    uuid.parse(req.params.id);
    const row = await svc.getProvinceById(req.params.id);
    if (!row) throw createError(404, 'Province not found', { code: 'NOT_FOUND' });
    if (honorLastModified(req, res, new Date(row.created_at))) return;
    res.json({ data: row });
  } catch (err) {
    next(err);
  }
}

/**
 * @openapi
 * /api/v1/districts:
 *   get:
 *     tags: [Master Data]
 *     summary: List districts, optionally filtered by province
 *     parameters:
 *       - in: query
 *         name: province
 *         schema: { type: string, example: WP }
 *         description: Filter by province code (e.g. WP, CP, NP)
 *     responses:
 *       200: { description: Array of districts }
 */
export async function listDistricts(req, res, next) {
  try {
    const provinceCode = req.query.province ? String(req.query.province) : undefined;
    const rows = await svc.listDistricts({ provinceCode });
    if (honorLastModified(req, res, svc.maxUpdatedAt(rows))) return;
    res.json({
      data: rows,
      meta: { count: rows.length, filter: provinceCode ? { province: provinceCode } : null },
    });
  } catch (err) {
    next(err);
  }
}

export async function getDistrict(req, res, next) {
  try {
    uuid.parse(req.params.id);
    const row = await svc.getDistrictById(req.params.id);
    if (!row) throw createError(404, 'District not found', { code: 'NOT_FOUND' });
    if (honorLastModified(req, res, new Date(row.created_at))) return;
    res.json({ data: row });
  } catch (err) {
    next(err);
  }
}

/**
 * @openapi
 * /api/v1/stations:
 *   get:
 *     tags: [Master Data]
 *     summary: List police stations
 *     parameters:
 *       - in: query
 *         name: district
 *         schema: { type: string }
 *         description: Filter by district code
 *       - in: query
 *         name: province
 *         schema: { type: string }
 *         description: Filter by province code
 *     responses:
 *       200: { description: Array of stations }
 */
export async function listStations(req, res, next) {
  try {
    const districtCode = req.query.district ? String(req.query.district) : undefined;
    const provinceCode = req.query.province ? String(req.query.province) : undefined;
    const rows = await svc.listStations({ districtCode, provinceCode });
    if (honorLastModified(req, res, svc.maxUpdatedAt(rows))) return;
    res.json({
      data: rows,
      meta: {
        count: rows.length,
        filter:
          districtCode || provinceCode ? { district: districtCode, province: provinceCode } : null,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function getStation(req, res, next) {
  try {
    uuid.parse(req.params.id);
    const row = await svc.getStationById(req.params.id);
    if (!row) throw createError(404, 'Station not found', { code: 'NOT_FOUND' });
    if (honorLastModified(req, res, new Date(row.updated_at))) return;
    res.json({ data: row });
  } catch (err) {
    next(err);
  }
}

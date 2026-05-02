import createError from 'http-errors';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

/**
 * Parses `?page` and `?limit` (or RFC-style `?page[number]`/`?page[size]`)
 * into safe integers with defaults clamped to MAX_LIMIT.
 */
export function parsePagination(
  query,
  { defaultLimit = DEFAULT_LIMIT, maxLimit = MAX_LIMIT } = {},
) {
  const rawPage = query.page?.number ?? query.page ?? 1;
  const rawLimit = query.page?.size ?? query.limit ?? defaultLimit;

  const page = Math.max(1, Number.parseInt(rawPage, 10) || 1);
  const limit = Math.min(maxLimit, Math.max(1, Number.parseInt(rawLimit, 10) || defaultLimit));
  const offset = (page - 1) * limit;
  return { page, limit, offset };
}

/**
 * Parses `?sort=foo,-bar` into ordered [{column,direction}] entries, but
 * only allows columns explicitly listed in `allowed`. Reject everything
 * else — sort injection is a real bug class.
 */
export function parseSort(sortParam, allowed) {
  if (!sortParam) return [];
  const allowSet = new Set(allowed);
  const parts = String(sortParam)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  return parts.map((part) => {
    const direction = part.startsWith('-') ? 'desc' : 'asc';
    const column = part.replace(/^[-+]/, '');
    if (!allowSet.has(column)) {
      throw createError(400, `Cannot sort by '${column}'`, { code: 'BAD_SORT' });
    }
    return { column, direction };
  });
}

/**
 * Parses `?fields=a,b,c` into a Set of requested columns. Returns null
 * when the param is absent so callers can keep the default projection.
 */
export function parseFields(fieldsParam, allowed) {
  if (!fieldsParam) return null;
  const allowSet = new Set(allowed);
  const requested = String(fieldsParam)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  for (const f of requested) {
    if (!allowSet.has(f)) throw createError(400, `Unknown field '${f}'`, { code: 'BAD_FIELD' });
  }
  return requested.length === 0 ? null : requested;
}

/**
 * JSON:API-flavoured collection envelope. `links` follow RFC 8288 conventions.
 */
export function paginated(req, rows, { page, limit, total, basePath } = {}) {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const path = basePath || req.originalUrl.split('?')[0];
  const buildUrl = (p) => {
    const params = new URLSearchParams(req.query);
    params.set('page', String(p));
    params.set('limit', String(limit));
    return `${path}?${params.toString()}`;
  };

  return {
    data: rows,
    meta: { page, limit, total, totalPages },
    links: {
      self: buildUrl(page),
      first: buildUrl(1),
      last: buildUrl(totalPages),
      prev: page > 1 ? buildUrl(page - 1) : null,
      next: page < totalPages ? buildUrl(page + 1) : null,
    },
  };
}

/** Sets RFC 8288 Link headers in addition to the body links — handy for non-JSON clients. */
export function setLinkHeader(res, links) {
  const parts = [];
  for (const [rel, url] of Object.entries(links)) {
    if (url) parts.push(`<${url}>; rel="${rel}"`);
  }
  if (parts.length) res.setHeader('Link', parts.join(', '));
}

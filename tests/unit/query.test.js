import {
  parsePagination,
  parseSort,
  parseFields,
  paginated,
  setLinkHeader,
} from '../../src/utils/query.js';

describe('parsePagination', () => {
  it('returns sensible defaults when nothing is supplied', () => {
    const r = parsePagination({});
    expect(r.page).toBe(1);
    expect(r.limit).toBe(50);
    expect(r.offset).toBe(0);
  });

  it('parses page + limit and computes offset', () => {
    const r = parsePagination({ page: '3', limit: '10' });
    expect(r).toEqual({ page: 3, limit: 10, offset: 20 });
  });

  it('clamps invalid page values to 1', () => {
    expect(parsePagination({ page: '0' }).page).toBe(1);
    expect(parsePagination({ page: 'abc' }).page).toBe(1);
    expect(parsePagination({ page: '-5' }).page).toBe(1);
  });

  it('clamps limit to MAX_LIMIT (200)', () => {
    expect(parsePagination({ limit: '5000' }).limit).toBe(200);
  });

  it('honours per-call overrides', () => {
    const r = parsePagination({}, { defaultLimit: 25, maxLimit: 100 });
    expect(r.limit).toBe(25);
    expect(parsePagination({ limit: '500' }, { maxLimit: 100 }).limit).toBe(100);
  });
});

describe('parseSort', () => {
  const allowed = ['plate_no', 'created_at'];

  it('returns [] for empty input', () => {
    expect(parseSort(undefined, allowed)).toEqual([]);
    expect(parseSort('', allowed)).toEqual([]);
  });

  it('parses ascending and descending columns', () => {
    expect(parseSort('plate_no', allowed)).toEqual([{ column: 'plate_no', direction: 'asc' }]);
    expect(parseSort('-created_at', allowed)).toEqual([
      { column: 'created_at', direction: 'desc' },
    ]);
  });

  it('handles multiple comma-separated columns', () => {
    expect(parseSort('-created_at,plate_no', allowed)).toEqual([
      { column: 'created_at', direction: 'desc' },
      { column: 'plate_no', direction: 'asc' },
    ]);
  });

  it('throws BAD_SORT for non-allowlisted columns', () => {
    expect(() => parseSort('password_hash', allowed)).toThrow(/Cannot sort by/);
    try {
      parseSort('password_hash', allowed);
    } catch (err) {
      expect(err.status).toBe(400);
      expect(err.code).toBe('BAD_SORT');
    }
  });
});

describe('parseFields', () => {
  const allowed = ['id', 'plate_no', 'status'];

  it('returns null when no fields supplied', () => {
    expect(parseFields(undefined, allowed)).toBeNull();
    expect(parseFields('', allowed)).toBeNull();
  });

  it('returns the requested subset', () => {
    expect(parseFields('id,plate_no', allowed)).toEqual(['id', 'plate_no']);
  });

  it('throws BAD_FIELD for unknown fields', () => {
    expect(() => parseFields('lat,lng', allowed)).toThrow(/Unknown field/);
    try {
      parseFields('lat', allowed);
    } catch (err) {
      expect(err.status).toBe(400);
      expect(err.code).toBe('BAD_FIELD');
    }
  });
});

describe('paginated envelope + setLinkHeader', () => {
  const fakeReq = {
    originalUrl: '/api/v1/vehicles?status=active',
    query: { status: 'active' },
  };

  it('builds meta + links with first/prev/next/last', () => {
    const env = paginated(fakeReq, [{ id: 1 }], { page: 2, limit: 10, total: 47 });
    expect(env.meta).toEqual({ page: 2, limit: 10, total: 47, totalPages: 5 });
    expect(env.links.self).toContain('page=2');
    expect(env.links.first).toContain('page=1');
    expect(env.links.last).toContain('page=5');
    expect(env.links.prev).toContain('page=1');
    expect(env.links.next).toContain('page=3');
  });

  it('omits prev on the first page and next on the last page', () => {
    const first = paginated(fakeReq, [], { page: 1, limit: 10, total: 5 });
    expect(first.links.prev).toBeNull();
    expect(first.links.next).toBeNull();
  });

  it('setLinkHeader emits RFC 8288 format', () => {
    const headers = {};
    const res = { setHeader: (k, v) => (headers[k] = v) };
    setLinkHeader(res, { self: '/a', next: '/b', prev: null });
    expect(headers.Link).toBe('</a>; rel="self", </b>; rel="next"');
  });
});

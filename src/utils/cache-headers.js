/**
 * Sets Last-Modified from a Date and short-circuits with 304 if the client
 * sent a fresh If-Modified-Since. Returns true when 304 was sent so callers
 * can `return` early.
 */
export function honorLastModified(req, res, lastModifiedDate) {
  if (!(lastModifiedDate instanceof Date) || Number.isNaN(lastModifiedDate.getTime())) {
    return false;
  }

  // HTTP dates have second precision, so floor to seconds for comparison.
  const lastSec = Math.floor(lastModifiedDate.getTime() / 1000);
  res.setHeader('Last-Modified', new Date(lastSec * 1000).toUTCString());

  const ims = req.header('if-modified-since');
  if (ims) {
    const sinceSec = Math.floor(new Date(ims).getTime() / 1000);
    if (Number.isFinite(sinceSec) && lastSec <= sinceSec) {
      res.status(304).end();
      return true;
    }
  }
  return false;
}

export function publicCache(maxAgeSeconds) {
  return (_req, res, next) => {
    res.setHeader('Cache-Control', `public, max-age=${maxAgeSeconds}, must-revalidate`);
    next();
  };
}

export function privateNoStore(_req, res, next) {
  res.setHeader('Cache-Control', 'no-store, private');
  next();
}

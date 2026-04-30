import createError from 'http-errors';
import { ZodError } from 'zod';
import { logger } from '../utils/logger.js';
import { isProd } from '../config/env.js';

export function notFound(req, _res, next) {
  next(createError(404, `Route not found: ${req.method} ${req.originalUrl}`));
}

export function errorHandler(err, req, res, _next) {
  if (err instanceof ZodError) {
    return res.status(422).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details: err.flatten(),
        requestId: req.id,
      },
    });
  }

  const status = err.status || err.statusCode || 500;
  const expose = status < 500;

  if (status >= 500) {
    logger.error({ err, requestId: req.id }, 'Unhandled error');
  } else {
    logger.warn({ msg: err.message, status, requestId: req.id }, 'Client error');
  }

  res.status(status).json({
    error: {
      code: err.code || (expose ? 'CLIENT_ERROR' : 'INTERNAL_ERROR'),
      message: expose ? err.message : 'Internal server error',
      ...(!isProd && status >= 500 ? { stack: err.stack } : {}),
      requestId: req.id,
    },
  });
}

import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import pinoHttp from 'pino-http';
import rateLimit from 'express-rate-limit';
import swaggerUi from 'swagger-ui-express';

import { env } from './config/env.js';
import { logger } from './utils/logger.js';
import { requestId } from './middleware/requestId.js';
import { notFound, errorHandler } from './middleware/errorHandler.js';
import { swaggerSpec } from './docs/swagger.js';
import authRoutes from './modules/auth/auth.routes.js';
import masterRoutes from './modules/master/master.routes.js';
import vehicleRoutes from './modules/vehicles/vehicles.routes.js';
import {
  deviceRouter as trackingDeviceRouter,
  userRouter,
} from './modules/tracking/tracking.routes.js';
import deviceAdminRoutes from './modules/devices/devices.routes.js';
import userAdminRoutes from './modules/users/users.routes.js';

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  // Strong ETags so conditional GETs (If-None-Match) yield byte-accurate 304s.
  app.set('etag', 'strong');

  app.use(requestId);
  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGIN === '*' ? true : env.CORS_ORIGIN.split(',') }));
  app.use(compression());
  app.use(
    express.json({
      limit: '256kb',
      // Capture the raw request body so HMAC verification (device auth)
      // can hash exactly the bytes the client signed.
      verify: (req, _res, buf) => {
        req.rawBody = buf.toString('utf8');
      },
    }),
  );
  app.use(pinoHttp({ logger, customProps: (req) => ({ requestId: req.id }) }));

  app.use(
    rateLimit({
      windowMs: env.RATE_LIMIT_WINDOW_MS,
      max: env.RATE_LIMIT_MAX,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
    }),
  );

  /**
   * @openapi
   * /health:
   *   get:
   *     tags: [Health]
   *     summary: Liveness probe
   *     responses:
   *       200:
   *         description: Service is up
   */
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', uptime: process.uptime(), timestamp: new Date().toISOString() });
  });

  app.get('/', (_req, res) => {
    res.json({
      name: 'tuk-track-api',
      docs: '/docs',
      health: '/health',
    });
  });

  app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, { explorer: true }));
  app.get('/openapi.json', (_req, res) => res.json(swaggerSpec));

  app.use('/api/v1/auth', authRoutes);
  app.use('/api/v1', masterRoutes);
  app.use('/api/v1/vehicles', vehicleRoutes);
  // /devices/pings (HMAC ingest) must be mounted BEFORE the admin router so
  // its specific path is matched first; the admin router otherwise treats
  // "pings" as a UUID parameter on /:id and returns 400.
  app.use('/api/v1/devices', trackingDeviceRouter);
  app.use('/api/v1/devices', deviceAdminRoutes);
  app.use('/api/v1/users', userAdminRoutes);
  app.use('/api/v1', userRouter);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}

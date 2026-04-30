import pino from 'pino';
import { env, isProd } from '../config/env.js';

export const logger = pino({
  level: env.LOG_LEVEL,
  ...(isProd
    ? {}
    : {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'SYS:HH:MM:ss.l', ignore: 'pid,hostname' },
        },
      }),
  redact: {
    paths: ['req.headers.authorization', 'req.headers.cookie', '*.password', '*.token'],
    censor: '[REDACTED]',
  },
});

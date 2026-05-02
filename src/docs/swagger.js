import swaggerJSDoc from 'swagger-jsdoc';
import { publicUrl, isProd } from '../config/env.js';

export const swaggerSpec = swaggerJSDoc({
  definition: {
    openapi: '3.0.3',
    info: {
      title: 'Tuk-Tuk Tracking API',
      version: '0.1.0',
      description:
        'RESTful API for real-time three-wheeler tracking & movement logging — Sri Lanka Police law-enforcement platform.',
      contact: { name: 'NB6007CEM Coursework' },
      license: { name: 'Academic use only' },
    },
    servers: [{ url: publicUrl, description: isProd ? 'Production' : 'Local' }],
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        deviceKey: { type: 'apiKey', in: 'header', name: 'x-device-key' },
      },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            error: {
              type: 'object',
              properties: {
                code: { type: 'string' },
                message: { type: 'string' },
                requestId: { type: 'string' },
              },
            },
          },
        },
      },
    },
    tags: [
      { name: 'Health' },
      { name: 'Auth' },
      { name: 'Master Data' },
      { name: 'Vehicles' },
      { name: 'Locations' },
      { name: 'Devices' },
    ],
  },
  apis: ['./src/modules/**/*.js', './src/app.js'],
});

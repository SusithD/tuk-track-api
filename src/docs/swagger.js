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
    security: [{ bearerAuth: [] }],
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        deviceHmac: {
          type: 'apiKey',
          in: 'header',
          name: 'x-signature',
          description:
            'HMAC-SHA256 signature. Also requires x-key-id, x-timestamp, x-nonce headers. See `POST /api/v1/devices/pings`.',
        },
      },
      schemas: {
        Error: {
          type: 'object',
          required: ['error'],
          properties: {
            error: {
              type: 'object',
              required: ['code', 'message'],
              properties: {
                code: { type: 'string', example: 'NOT_FOUND' },
                message: { type: 'string', example: 'Vehicle not found' },
                requestId: { type: 'string', format: 'uuid' },
                details: { type: 'object', additionalProperties: true },
              },
            },
          },
        },
        PaginationMeta: {
          type: 'object',
          properties: {
            page: { type: 'integer', example: 1 },
            limit: { type: 'integer', example: 50 },
            total: { type: 'integer', example: 200 },
            totalPages: { type: 'integer', example: 4 },
          },
        },
        PaginationLinks: {
          type: 'object',
          properties: {
            self: { type: 'string', format: 'uri' },
            first: { type: 'string', format: 'uri' },
            last: { type: 'string', format: 'uri' },
            prev: { type: 'string', format: 'uri', nullable: true },
            next: { type: 'string', format: 'uri', nullable: true },
          },
        },

        Province: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            code: { type: 'string', example: 'WP' },
            name: { type: 'string', example: 'Western Province' },
            created_at: { type: 'string', format: 'date-time' },
          },
        },
        District: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            province_id: { type: 'string', format: 'uuid' },
            code: { type: 'string', example: 'COL' },
            name: { type: 'string', example: 'Colombo' },
            created_at: { type: 'string', format: 'date-time' },
          },
        },
        Station: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            district_id: { type: 'string', format: 'uuid' },
            code: { type: 'string', example: 'COL-CENTRAL' },
            name: { type: 'string', example: 'Colombo Central Police' },
            address: { type: 'string', nullable: true },
            contact_phone: { type: 'string', nullable: true },
            created_at: { type: 'string', format: 'date-time' },
            updated_at: { type: 'string', format: 'date-time' },
          },
        },

        User: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            email: { type: 'string', format: 'email' },
            full_name: { type: 'string' },
            role: { type: 'string', enum: ['hq', 'province', 'station'] },
            province_id: { type: 'string', format: 'uuid', nullable: true },
            station_id: { type: 'string', format: 'uuid', nullable: true },
            status: { type: 'string', enum: ['active', 'disabled'] },
            last_login_at: { type: 'string', format: 'date-time', nullable: true },
            created_at: { type: 'string', format: 'date-time' },
          },
        },
        TokenPair: {
          type: 'object',
          properties: {
            accessToken: { type: 'string', description: 'JWT, default 15-min TTL' },
            refreshToken: { type: 'string', description: 'Opaque, 7-day TTL, rotated on use' },
            tokenType: { type: 'string', example: 'Bearer' },
            expiresIn: {
              type: 'integer',
              example: 900,
              description: 'Seconds until accessToken expires',
            },
            user: { $ref: '#/components/schemas/User' },
          },
        },

        Vehicle: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            plate_no: { type: 'string', example: 'ABC-1234' },
            owner_name: { type: 'string' },
            owner_nic: { type: 'string', nullable: true },
            owner_phone: { type: 'string', nullable: true },
            station_id: { type: 'string', format: 'uuid' },
            status: { type: 'string', enum: ['active', 'inactive', 'impounded'] },
            registered_at: { type: 'string', format: 'date-time' },
            created_at: { type: 'string', format: 'date-time' },
            updated_at: { type: 'string', format: 'date-time' },
          },
        },
        VehicleCreate: {
          type: 'object',
          required: ['plate_no', 'owner_name', 'station_id'],
          properties: {
            plate_no: { type: 'string', example: 'ABC-1234' },
            owner_name: { type: 'string', minLength: 2, maxLength: 120 },
            owner_nic: { type: 'string', maxLength: 16 },
            owner_phone: { type: 'string', maxLength: 24 },
            station_id: { type: 'string', format: 'uuid' },
            status: {
              type: 'string',
              enum: ['active', 'inactive', 'impounded'],
              default: 'active',
            },
          },
        },
        VehicleUpdate: {
          type: 'object',
          minProperties: 1,
          properties: {
            owner_name: { type: 'string', minLength: 2, maxLength: 120 },
            owner_nic: { type: 'string', maxLength: 16 },
            owner_phone: { type: 'string', maxLength: 24 },
            station_id: { type: 'string', format: 'uuid' },
            status: { type: 'string', enum: ['active', 'inactive', 'impounded'] },
          },
        },

        Driver: {
          type: 'object',
          properties: {
            nic: { type: 'string', example: '882233456V' },
            name: { type: 'string' },
            phone: { type: 'string', nullable: true },
            vehicle_count: { type: 'integer', example: 1 },
          },
        },
        DriverDetail: {
          type: 'object',
          properties: {
            nic: { type: 'string', example: '882233456V' },
            name: { type: 'string' },
            phone: { type: 'string', nullable: true },
            vehicle_count: { type: 'integer', example: 2 },
            vehicles: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string', format: 'uuid' },
                  plate_no: { type: 'string' },
                  status: { type: 'string', enum: ['active', 'inactive', 'impounded'] },
                  station_id: { type: 'string', format: 'uuid' },
                },
              },
            },
          },
        },

        Device: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            vehicle_id: { type: 'string', format: 'uuid' },
            key_id: { type: 'string', example: 'dev_a1b2c3d4e5f6' },
            status: { type: 'string', enum: ['active', 'revoked'] },
            last_seen_at: { type: 'string', format: 'date-time', nullable: true },
            issued_at: { type: 'string', format: 'date-time' },
            revoked_at: { type: 'string', format: 'date-time', nullable: true },
          },
        },

        LocationPing: {
          type: 'object',
          properties: {
            lat: { type: 'number', format: 'double', example: 6.9271 },
            lng: { type: 'number', format: 'double', example: 79.8612 },
            speed_kmh: { type: 'number', nullable: true, example: 25.5 },
            heading_deg: { type: 'number', nullable: true, example: 180 },
            recorded_at: { type: 'string', format: 'date-time' },
            received_at: { type: 'string', format: 'date-time' },
            age_seconds: { type: 'integer', example: 42 },
            stale: {
              type: 'boolean',
              description: 'True when recorded_at is older than 24 hours',
            },
          },
        },
        PingIngest: {
          type: 'object',
          required: ['lat', 'lng', 'recorded_at'],
          properties: {
            lat: { type: 'number', format: 'double', minimum: -90, maximum: 90 },
            lng: { type: 'number', format: 'double', minimum: -180, maximum: 180 },
            speed_kmh: { type: 'number', minimum: 0, maximum: 220, nullable: true },
            heading_deg: { type: 'number', minimum: 0, maximum: 360, nullable: true },
            recorded_at: { type: 'string', format: 'date-time' },
          },
        },
        PingBatch: {
          type: 'object',
          required: ['pings'],
          properties: {
            pings: {
              type: 'array',
              minItems: 1,
              maxItems: 100,
              items: { $ref: '#/components/schemas/PingIngest' },
            },
          },
        },
        FleetLocationRow: {
          type: 'object',
          properties: {
            vehicle_id: { type: 'string', format: 'uuid' },
            plate_no: { type: 'string' },
            station_id: { type: 'string', format: 'uuid' },
            lat: { type: 'number', format: 'double' },
            lng: { type: 'number', format: 'double' },
            speed_kmh: { type: 'number', nullable: true },
            heading_deg: { type: 'number', nullable: true },
            recorded_at: { type: 'string', format: 'date-time' },
            received_at: { type: 'string', format: 'date-time' },
            age_seconds: { type: 'integer' },
            stale: { type: 'boolean' },
          },
        },
      },

      responses: {
        Unauthorized: {
          description: 'Bearer token missing, malformed, or expired',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
        },
        Forbidden: {
          description: 'Authenticated but role does not permit this action',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
        },
        NotFound: {
          description: 'Resource does not exist OR caller lacks scope to see it',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
        },
        ValidationError: {
          description: 'Request body or query parameters failed validation',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
        },
      },
    },
    tags: [
      { name: 'Health', description: 'Liveness / readiness probes' },
      { name: 'Auth', description: 'Login, refresh, logout, current user' },
      {
        name: 'Master Data',
        description: 'Provinces, districts, stations (administrative reference data)',
      },
      { name: 'Vehicles', description: 'Tuk-tuk fleet CRUD with role-scoped reads and writes' },
      {
        name: 'Drivers',
        description: 'Registered tuk-tuk drivers (virtual resource over vehicles, scope-aware)',
      },
      {
        name: 'Locations',
        description: 'Live position, time-window history, cross-fleet ops view',
      },
      { name: 'Devices', description: 'Tracking-device ingestion (HMAC-authenticated)' },
    ],
  },
  apis: ['./src/modules/**/*.js', './src/app.js'],
});

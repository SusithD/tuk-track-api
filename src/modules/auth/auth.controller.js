import createError from 'http-errors';
import { loginSchema, refreshSchema, logoutSchema } from './auth.schemas.js';
import * as authService from './auth.service.js';

/**
 * @openapi
 * /api/v1/auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Authenticate a user and issue an access + refresh token pair
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email: { type: string, format: email }
 *               password: { type: string, format: password }
 *     responses:
 *       200:
 *         description: Token pair issued
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/TokenPair' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       422: { $ref: '#/components/responses/ValidationError' }
 */
export async function login(req, res, next) {
  try {
    const body = loginSchema.parse(req.body);
    const tokens = await authService.loginUser({
      email: body.email,
      password: body.password,
      userAgent: req.header('user-agent'),
      ip: req.ip,
    });
    res.status(200).json(tokens);
  } catch (err) {
    next(err);
  }
}

/**
 * @openapi
 * /api/v1/auth/refresh:
 *   post:
 *     tags: [Auth]
 *     summary: Exchange a refresh token for a new access + refresh pair
 *     description: Refresh tokens rotate on every use; the old token is revoked atomically. Reuse of a revoked token revokes the entire chain.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [refreshToken]
 *             properties:
 *               refreshToken: { type: string }
 *     responses:
 *       200:
 *         description: New token pair issued
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/TokenPair' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
export async function refresh(req, res, next) {
  try {
    const body = refreshSchema.parse(req.body);
    const tokens = await authService.rotateRefreshToken({
      rawToken: body.refreshToken,
      userAgent: req.header('user-agent'),
      ip: req.ip,
    });
    res.status(200).json(tokens);
  } catch (err) {
    next(err);
  }
}

/**
 * @openapi
 * /api/v1/auth/logout:
 *   post:
 *     tags: [Auth]
 *     summary: Revoke a refresh token
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [refreshToken]
 *             properties:
 *               refreshToken: { type: string }
 *     responses:
 *       204: { description: Refresh token revoked (idempotent) }
 */
export async function logout(req, res, next) {
  try {
    const body = logoutSchema.parse(req.body);
    await authService.revokeRefreshToken(body.refreshToken);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

/**
 * @openapi
 * /api/v1/auth/me:
 *   get:
 *     tags: [Auth]
 *     summary: Return the current authenticated user
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Current user profile
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 user: { $ref: '#/components/schemas/User' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
export async function me(req, res, next) {
  try {
    const user = await authService.getUserById(req.user.id);
    if (!user) throw createError(404, 'User no longer exists', { code: 'USER_NOT_FOUND' });
    res.status(200).json({ user });
  } catch (err) {
    next(err);
  }
}

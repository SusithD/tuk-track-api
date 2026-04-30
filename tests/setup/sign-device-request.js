import crypto from 'node:crypto';
import { bodySha256Hex, buildSigningString, computeSignature } from '../../src/utils/hmac.js';

/**
 * Build the four x-* headers a tracking device must send. Used by tests and
 * also documented in the README so a CLI demo (curl) can reproduce them.
 */
export function signDeviceRequest({
  keyId,
  hmacSecret,
  method = 'POST',
  path,
  body = '',
  timestamp = Math.floor(Date.now() / 1000),
  nonce = crypto.randomBytes(8).toString('hex'),
}) {
  const bodyHash = bodySha256Hex(body);
  const signingString = buildSigningString({ timestamp, nonce, method, path, bodyHash });
  const signature = computeSignature(hmacSecret, signingString);

  return {
    'x-key-id': keyId,
    'x-timestamp': String(timestamp),
    'x-nonce': nonce,
    'x-signature': signature,
  };
}

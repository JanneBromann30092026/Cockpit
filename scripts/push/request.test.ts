/**
 * The push request as a push service and the iPad see it: VAPID token signed with the key
 * pair Cockpit creates in the browser (same Web Crypto calls as src/services/crypto/vapid.ts)
 * and a payload only the subscription's keys can decrypt (RFC 8291, aes128gcm).
 */
import {
  createDecipheriv,
  createECDH,
  createHmac,
  createPublicKey,
  randomBytes,
  verify,
} from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { parsePushConfig, type PushConfig } from '../../src/core/push/config.ts';
import { parsePushPayload } from '../../src/core/push/reminders.ts';
import { PUSH_TTL_SECONDS, VAPID_SUBJECT, buildPushRequest } from './request.ts';

const ENDPOINT = 'https://web.push.apple.com/QFake-Subscription-Token';

const b64url = (data: Uint8Array) => Buffer.from(data).toString('base64url');

/** Same calls as createVapidKeys() in the app. */
async function browserVapidKeys() {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
    'sign',
    'verify',
  ]);
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
  const { d } = await crypto.subtle.exportKey('jwk', pair.privateKey);
  return { publicKey: b64url(raw), privateKey: d ?? '' };
}

/** A device subscription: ECDH key pair and auth secret, as the browser creates them. */
function deviceSubscription() {
  const ecdh = createECDH('prime256v1');
  ecdh.generateKeys();
  const auth = randomBytes(16);
  return { ecdh, auth, keys: { p256dh: b64url(ecdh.getPublicKey()), auth: b64url(auth) } };
}

const hmac = (key: Uint8Array, data: Uint8Array) => createHmac('sha256', key).update(data).digest();

/** RFC 8291 / RFC 8188 decryption, as the device does it. */
function decrypt(body: Buffer, device: ReturnType<typeof deviceSubscription>): string {
  const salt = body.subarray(0, 16);
  const idLength = body.readUInt8(20);
  const serverPublic = body.subarray(21, 21 + idLength);
  const ciphertext = body.subarray(21 + idLength);
  const secret = device.ecdh.computeSecret(serverPublic);
  const info = Buffer.concat([
    Buffer.from('WebPush: info\0'),
    device.ecdh.getPublicKey(),
    serverPublic,
  ]);
  const ikm = hmac(hmac(device.auth, secret), Buffer.concat([info, Buffer.from([1])]));
  const prk = hmac(salt, ikm);
  const cek = hmac(prk, Buffer.from('Content-Encoding: aes128gcm\0\x01')).subarray(0, 16);
  const nonce = hmac(prk, Buffer.from('Content-Encoding: nonce\0\x01')).subarray(0, 12);
  const decipher = createDecipheriv('aes-128-gcm', cek, nonce);
  decipher.setAuthTag(ciphertext.subarray(-16));
  const plain = Buffer.concat([decipher.update(ciphertext.subarray(0, -16)), decipher.final()]);
  // Last record: data, delimiter 0x02, zero padding.
  const end = plain.lastIndexOf(2);
  return plain.subarray(0, end).toString('utf8');
}

async function setup() {
  const device = deviceSubscription();
  const keys = await browserVapidKeys();
  const parsed = parsePushConfig(
    JSON.stringify({ v: 1, ...keys, subscription: { endpoint: ENDPOINT, keys: device.keys } }),
  );
  if (!parsed.ok) throw new Error(parsed.problem);
  return { device, config: parsed.config };
}

function vapidToken(config: PushConfig, authorization: string) {
  const match = /^vapid t=([^,]+), k=(.+)$/.exec(authorization);
  if (!match?.[1] || !match[2]) throw new Error('no VAPID header');
  expect(match[2]).toBe(config.publicKey);
  const [header, payload, signature] = match[1].split('.') as [string, string, string];
  const raw = Buffer.from(config.publicKey, 'base64url');
  const key = createPublicKey({
    key: {
      kty: 'EC',
      crv: 'P-256',
      x: b64url(raw.subarray(1, 33)),
      y: b64url(raw.subarray(33, 65)),
    },
    format: 'jwk',
  });
  const valid = verify(
    'sha256',
    Buffer.from(`${header}.${payload}`),
    { key, dsaEncoding: 'ieee-p1363' },
    Buffer.from(signature, 'base64url'),
  );
  return {
    valid,
    header: JSON.parse(Buffer.from(header, 'base64url').toString()) as Record<string, unknown>,
    claims: JSON.parse(Buffer.from(payload, 'base64url').toString()) as Record<string, unknown>,
  };
}

describe('push request', () => {
  it('signs a VAPID token Apple accepts with the key pair from the browser', async () => {
    const { config } = await setup();
    const request = buildPushRequest(config, 'dayReview');
    expect(request.endpoint).toBe(ENDPOINT);
    const token = vapidToken(config, String(request.headers.Authorization));
    expect(token.valid).toBe(true);
    expect(token.header).toMatchObject({ typ: 'JWT', alg: 'ES256' });
    expect(token.claims.aud).toBe('https://web.push.apple.com');
    expect(token.claims.sub).toBe(VAPID_SUBJECT);
    const expiresIn = Number(token.claims.exp) - Date.now() / 1000;
    expect(expiresIn).toBeGreaterThan(0);
    expect(expiresIn).toBeLessThanOrEqual(24 * 60 * 60);
    expect(request.headers.TTL).toBe(PUSH_TTL_SECONDS);
    expect(request.headers.Urgency).toBe('normal');
  });

  it('encrypts a payload that only names the reminder', async () => {
    const { config, device } = await setup();
    const request = buildPushRequest(config, 'weekReview');
    expect(request.headers['Content-Encoding']).toBe('aes128gcm');
    const text = decrypt(Buffer.from(request.body as Buffer), device);
    expect(JSON.parse(text)).toEqual({ v: 1, reminder: 'weekReview' });
    expect(parsePushPayload(text)).toBe('weekReview');
    // Without the device's keys the content stays unreadable.
    expect(Buffer.from(request.body as Buffer).toString('latin1')).not.toContain('weekReview');
  });
});

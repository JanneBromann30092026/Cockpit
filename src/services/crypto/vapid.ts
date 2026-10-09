/**
 * VAPID key pair for Web Push (ECDSA P-256), created on the device with Web Crypto. The
 * formats match what push senders (e.g. the web-push library) and pushManager.subscribe
 * expect: public key as uncompressed point, private key as the scalar "d", both base64url.
 */
import { base64ToBytes, bytesToBase64 } from './webCrypto';

export function toBase64Url(data: Uint8Array): string {
  return bytesToBase64(data).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '');
  return base64ToBytes(base64 + '='.repeat((4 - (base64.length % 4)) % 4));
}

export interface VapidKeys {
  /** Uncompressed P-256 point (65 bytes), base64url. */
  publicKey: string;
  /** Private scalar d (32 bytes), base64url. */
  privateKey: string;
}

export async function createVapidKeys(): Promise<VapidKeys> {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
    'sign',
    'verify',
  ]);
  const publicKey = toBase64Url(
    new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey)),
  );
  const { d } = await crypto.subtle.exportKey('jwk', pair.privateKey);
  if (!d) throw new Error('VAPID private key could not be exported');
  return { publicKey, privateKey: d.replace(/=+$/, '') };
}

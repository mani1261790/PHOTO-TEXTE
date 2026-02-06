import crypto from 'node:crypto';

import { getEnv } from '@/lib/env';

interface CipherPayload {
  iv: string;
  tag: string;
  ciphertext: string;
}

function toB64(input: Buffer): string {
  return input.toString('base64');
}

function fromB64(input: string): Buffer {
  return Buffer.from(input, 'base64');
}

function getMasterKey(): Buffer {
  const b64 = getEnv('APP_MASTER_KEY_B64');
  const key = fromB64(b64);
  if (key.byteLength !== 32) {
    throw new Error('APP_MASTER_KEY_B64 must decode to 32 bytes');
  }
  return key;
}

function seal(key: Buffer, value: string): CipherPayload {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);

  return {
    iv: toB64(iv),
    tag: toB64(cipher.getAuthTag()),
    ciphertext: toB64(ciphertext)
  };
}

function open(key: Buffer, payload: CipherPayload): string {
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, fromB64(payload.iv));
  decipher.setAuthTag(fromB64(payload.tag));
  const plaintext = Buffer.concat([
    decipher.update(fromB64(payload.ciphertext)),
    decipher.final()
  ]);
  return plaintext.toString('utf8');
}

function serialize(payload: CipherPayload): string {
  return `${payload.iv}.${payload.tag}.${payload.ciphertext}`;
}

function deserialize(packed: string): CipherPayload {
  const [iv, tag, ciphertext] = packed.split('.');
  if (!iv || !tag || !ciphertext) {
    throw new Error('Invalid encrypted payload');
  }
  return { iv, tag, ciphertext };
}

export function generateDataKey(): Buffer {
  return crypto.randomBytes(32);
}

export function wrapDataKey(dataKey: Buffer): string {
  const master = getMasterKey();
  return serialize(seal(master, toB64(dataKey)));
}

export function unwrapDataKey(wrapped: string): Buffer {
  const master = getMasterKey();
  const value = open(master, deserialize(wrapped));
  return fromB64(value);
}

export function encryptField(dataKey: Buffer, value: string): string {
  return serialize(seal(dataKey, value));
}

export function decryptField(dataKey: Buffer, encrypted: string): string {
  return open(dataKey, deserialize(encrypted));
}

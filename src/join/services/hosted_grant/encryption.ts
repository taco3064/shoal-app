import { bindingKey, type GrantBinding, type GrantTokens } from './types';

const encoder = new TextEncoder();

function buffer(value: string): ArrayBuffer {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0)).buffer;
}

async function key(secret: string): Promise<CryptoKey> {
  if (secret.length < 32) {
    throw new Error('Dedicated Hosted grant encryption key is required.');
  }

  const material = await crypto.subtle.digest('SHA-256',
    encoder.encode(`shoal-hosted-grant:v1:${secret}`));

  return crypto.subtle.importKey('raw', material, 'AES-GCM', false, [
    'encrypt', 'decrypt',
  ]);
}

export async function sealGrant(secret: string, binding: GrantBinding,
  tokens: GrantTokens) {
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv,
    additionalData: encoder.encode(bindingKey(binding)) }, await key(secret),
  encoder.encode(JSON.stringify(tokens)));

  return {
    iv: btoa(String.fromCharCode(...iv)),
    ciphertext: btoa(String.fromCharCode(...new Uint8Array(ciphertext))),
  };
}

export async function openGrant(secret: string, binding: GrantBinding,
  sealed: { iv: string; ciphertext: string }): Promise<GrantTokens> {
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM',
    iv: buffer(sealed.iv), additionalData: encoder.encode(bindingKey(binding)) },
  await key(secret), buffer(sealed.ciphertext));

  return JSON.parse(new TextDecoder().decode(plaintext)) as GrantTokens;
}

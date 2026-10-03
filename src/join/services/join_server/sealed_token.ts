export interface SealedToken {
  iv: string;
  ciphertext: string;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function base64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

function bytes(value: string): ArrayBuffer {
  const decoded = Uint8Array.from(atob(value), (char) => char.charCodeAt(0));

  return decoded.buffer.slice(
    decoded.byteOffset,
    decoded.byteOffset + decoded.byteLength,
  );
}

async function key(secret: string): Promise<CryptoKey> {
  const material = await crypto.subtle.digest(
    'SHA-256',
    encoder.encode(`shoal-join-user-token:${secret}`),
  );

  return crypto.subtle.importKey('raw', material, 'AES-GCM', false, [
    'decrypt',
    'encrypt',
  ]);
}

export async function sealToken(
  secret: string,
  sessionId: string,
  token: string,
): Promise<SealedToken> {
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: encoder.encode(sessionId) },
    await key(secret),
    encoder.encode(token),
  );

  return {
    iv: base64(iv),
    ciphertext: base64(new Uint8Array(ciphertext)),
  };
}

export async function openToken(
  secret: string,
  sessionId: string,
  sealed: SealedToken,
): Promise<string> {
  const plaintext = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: bytes(sealed.iv),
      additionalData: encoder.encode(sessionId),
    },
    await key(secret),
    bytes(sealed.ciphertext),
  );

  return decoder.decode(plaintext);
}

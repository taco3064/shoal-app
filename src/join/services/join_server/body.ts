export async function readBytes(request: Request): Promise<Uint8Array> {
  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;

  if (reader) {
    while (true) {
      const next = await reader.read();

      if (next.done) {
        break;
      }

      size += next.value.byteLength;

      if (size > 262_144) {
        await reader.cancel();

        throw new Error('Request body is too large');
      }

      chunks.push(next.value);
    }
  }

  const bytes = new Uint8Array(size);
  let offset = 0;

  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return bytes;
}

export async function readBody(
  request: Request,
): Promise<Record<string, unknown>> {
  const bytes = await readBytes(request);
  const value: unknown = JSON.parse(new TextDecoder().decode(bytes) || '{}');

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid request body');
  }

  return value as Record<string, unknown>;
}

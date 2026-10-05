// Bound external inputs before buffering them.
export async function boundedJson(
  body: ReadableStream<Uint8Array> | null,
  limit: number,
): Promise<unknown> {
  if (!body) {
    throw new Error('INPUT_REFUSED');
  }

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  let deadline: ReturnType<typeof setTimeout> | undefined;

  const timeout = new Promise<never>((_resolve, reject) => {
    deadline = setTimeout(() => {
      void reader.cancel().catch(() => undefined);
      reject(new Error('INPUT_TIMEOUT'));
    }, 10000);
  });

  try {
    for (;;) {
      const { done, value } = await Promise.race([reader.read(), timeout]);

      if (done) {
        break;
      }

      length += value.length;

      if (length > limit) {
        await reader.cancel();

        throw new Error('REQUEST_REFUSED');
      }

      chunks.push(value);
    }
  } finally {
    clearTimeout(deadline);
    reader.releaseLock();
  }

  const bytes = new Uint8Array(length);
  let offset = 0;

  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }

  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
}

export async function policyContent(
  repository: string,
  policyUrl: string,
  fetcher: typeof fetch = fetch,
): Promise<string | null> {
  const url = new URL(policyUrl);
  const match = /^\/([^/]+)\/([^/]+)\/blob\/([a-f0-9]{40})\/README\.md$/.exec(url.pathname);

  if (
    url.protocol !== 'https:'
    || url.hostname !== 'github.com'
    || url.search
    || url.hash
    || !match
    || `${match[1]}/${match[2]}` !== repository
  ) {
    throw new Error('Invalid pinned Review Policy URL.');
  }

  const rawUrl = `https://raw.githubusercontent.com/${repository}/${match[3]}/README.md`;
  const response = await fetcher(rawUrl, { signal: AbortSignal.timeout(10000) });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`Review Policy fetch failed: ${response.status}`);
  }

  const markdown = await response.text();

  if (markdown.length > 400_000) {
    throw new Error('Review Policy exceeds display limit.');
  }

  return markdown;
}

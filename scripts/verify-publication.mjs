// Read-only post-deployment verification. Never deploys or changes GitHub state.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { htmlAssetUrls, moduleAssetUrls } from './public-assets.mjs';

const site = 'https://taco3064.github.io/shoal-app/';
const deployedCommit = process.argv[2];
const reportPath = process.argv[3];

assert.match(deployedCommit ?? '', /^[a-f0-9]{40}$/, 'Supply verified deployed main SHA');
assert.ok(reportPath, 'Supply the evidence report path');
const temporary = await mkdtemp(resolve(tmpdir(), 'shoal-publication-'));
const responses = [];

async function retrieve(path, expectedType) {
  const url = `${site}${path}`;
  const response = await fetch(url, {
    cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(30000),
  });

  assert.equal(response.status, 200, `HTTP availability: ${url}`);
  const contentType = response.headers.get('content-type') ?? '';

  assert.match(contentType, expectedType, `Content-Type: ${url}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const relativePath = new URL(url).pathname.slice(new URL(site).pathname.length);
  const localPath = resolve(temporary,
    relativePath.endsWith('/') || relativePath === ''
      ? `${relativePath}index.html` : relativePath);

  await mkdir(dirname(localPath), { recursive: true });
  await writeFile(localPath, bytes);
  responses.push({ url, status: response.status, contentType,
    sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length });

  return bytes.toString('utf8');
}

try {
  const projection = JSON.parse(await retrieve('data/network.json', /application\/json/i));
  const routes = ['', 'how-it-works/', 'join/', 'reviewers/',
    ...projection.reviewers.map(({ username }) => `reviewers/${username}/`)];
  const html = await Promise.all(routes.map((route) => retrieve(route, /text\/html/i)));

  await Promise.all([
    retrieve('robots.txt', /text\/plain/i),
    retrieve('llms.txt', /text\/plain/i),
    retrieve('content/how-it-works.md', /text\/(plain|markdown)/i),
    retrieve('content/public-pages.md', /text\/(plain|markdown)/i),
    ...projection.reviewers.map(({ username }) =>
      retrieve(`reviewers/${username}/snapshot.txt`, /text\/plain/i)),
    ...['shoal-logo.webp', 'og-shoal.webp'].map((path) => retrieve(path, /image\/webp/i)),
    ...['favicon.png', 'apple-touch-icon.png'].map((path) => retrieve(path, /image\/png/i)),
  ]);
  const index = await retrieve('sitemap-index.xml', /(?:application|text)\/xml/i);

  for (const [, url] of index.matchAll(/<loc>([^<]+)<\/loc>/g)) {
    assert.ok(url.startsWith(site), 'Canonical sitemap locator');
    await retrieve(url.slice(site.length), /(?:application|text)\/xml/i);
  }

  const pendingAssets = new Set(html.flatMap((page) => htmlAssetUrls(page, site)));
  const retrievedAssets = new Set();

  for (const url of pendingAssets) {
    if (retrievedAssets.has(url)) {
      continue;
    }

    retrievedAssets.add(url);
    const pathname = new URL(url).pathname;
    const expectedType = pathname.endsWith('.js') || pathname.endsWith('.mjs')
      ? /(?:application|text)\/(?:javascript|ecmascript)/i
      : pathname.endsWith('.css') ? /text\/css/i
        : /(?:image\/|font\/|application\/(?:octet-stream|font|wasm))/i;
    const source = await retrieve(url.slice(site.length), expectedType);

    if (/\.(?:m?js|css)$/.test(pathname)) {
      for (const dependency of await moduleAssetUrls(source, url, site)) {
        pendingAssets.add(dependency);
      }
    }
  }

  const checked = spawnSync(process.execPath, ['scripts/validate-seo.mjs', temporary], {
    encoding: 'utf8', maxBuffer: 4 * 1024 * 1024,
  });

  assert.equal(checked.status, 0, checked.stdout + checked.stderr);
  // Reject mixed generations published while the verification was in flight.
  const latest = await fetch(`${site}data/network.json`, {
    cache: 'no-store', signal: AbortSignal.timeout(30000),
  });

  assert.equal(latest.status, 200);
  assert.equal(await latest.text(), await readFile(resolve(temporary, 'data/network.json'), 'utf8'));
  await writeFile(reportPath, JSON.stringify({
    verifiedAt: new Date().toISOString(), deployedMainCommit: deployedCommit,
    deploymentUrl: site,
    commitAuthority: 'Caller must prove this SHA through the successful main deployment run; HTTP content alone does not prove commit identity.',
    generatedAt: projection.generatedAt, routes: routes.length,
    artifactGate: checked.stdout.trim(), responses,
  }, null, 2) + '\n');
  console.log(`Publication verified: ${routes.length} HTML routes, ${responses.length} HTTP resources; ${deployedCommit}`);
} finally {
  await rm(temporary, { recursive: true, force: true });
}

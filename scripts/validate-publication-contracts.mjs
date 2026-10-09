// Local HTTP fixtures for the read-only verifier. No deployment or remote GitHub access.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { moduleAssetUrls } from './public-assets.mjs';

const output = resolve(process.argv[2]);
const site = 'https://taco3064.github.io/shoal-app/';
const temporary = await mkdtemp(resolve(tmpdir(), 'shoal-http-fixtures-'));
const types = { '.html': 'text/html', '.json': 'application/json', '.txt': 'text/plain',
  '.md': 'text/markdown', '.xml': 'application/xml', '.webp': 'image/webp',
  '.png': 'image/png', '.css': 'text/css', '.js': 'text/javascript',
  '.mjs': 'text/javascript', '.woff2': 'font/woff2', '.woff': 'font/woff', '.wasm': 'application/wasm' };
let projectionRequests = 0;
let changeGeneration = false;
const server = createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url, 'http://fixture.local').pathname;
    assert.ok(pathname.startsWith('/shoal-app/'));
    const relative = pathname.slice('/shoal-app/'.length);
    const path = relative.endsWith('/') || !relative ? `${relative}index.html` : relative;
    let bytes = await readFile(resolve(output, path));

    if (path === 'data/network.json' && ++projectionRequests > 1 && changeGeneration) {
      const projection = JSON.parse(bytes);

      projection.generatedAt = '2027-01-01T00:00:00Z';
      bytes = Buffer.from(JSON.stringify(projection));
    }

    response.writeHead(200, { 'Content-Type': types[extname(path)] ?? 'application/octet-stream' });
    response.end(bytes);
  } catch {
    response.writeHead(404, { 'Content-Type': 'text/plain' });
    response.end('Missing fixture artifact');
  }
});

function verify() {
  projectionRequests = 0;

  return new Promise((accept, reject) => {
    const child = spawn(process.execPath,
      ['scripts/verify-publication.mjs', 'b77ef866fd8499525984ba40352373013b3ce7b5', resolve(temporary, 'fixture-only-report.json')],
      { cwd: process.cwd(), env: { ...process.env,
        NODE_OPTIONS: `--import=${pathToFileURL(resolve(temporary, 'fetch-local.mjs')).href}` }, stdio: ['ignore', 'pipe', 'pipe'] });
    let text = '';

    child.stdout.on('data', (chunk) => { text += chunk; });
    child.stderr.on('data', (chunk) => { text += chunk; });
    child.on('error', reject);
    child.on('close', (status) => accept({ status, text }));
  });
}

async function missingAsset(path, name) {
  const absolute = resolve(output, path);
  const bytes = await readFile(absolute);

  await rm(absolute);

  try {
    const result = await verify();

    assert.notEqual(result.status, 0, `${name} HTTP verifier must reject`);
    assert.match(result.text, /HTTP availability:/, `${name} fails at missing HTTP asset`);
  } finally {
    await writeFile(absolute, bytes);
  }
}

try {
  await new Promise((accept, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', accept);
  });
  const port = server.address().port;

  await writeFile(resolve(temporary, 'fetch-local.mjs'), `
const native = globalThis.fetch;
globalThis.fetch = (input, options) => {
  const url = new URL(typeof input === 'string' ? input : input.url);
  if (url.origin !== 'https://taco3064.github.io') throw new Error('Unexpected fixture network origin');
  return native('http://127.0.0.1:${port}' + url.pathname + url.search, options);
};
`);
  const positive = await verify();

  assert.equal(positive.status, 0, positive.text);
  const report = JSON.parse(await readFile(resolve(temporary, 'fixture-only-report.json'), 'utf8'));

  assert.ok(report.responses.some(({ url }) => url.includes('/_astro/')), 'HTTP report includes hydration assets');
  const html = await readFile(resolve(output, 'reviewers/index.html'), 'utf8');
  const islandPath = html.match(/component-url="([^"]+)"/)[1].slice('/shoal-app/'.length);
  const imports = await moduleAssetUrls(await readFile(resolve(output, islandPath), 'utf8'), `${site}${islandPath}`, site);
  const shared = imports.find((url) => url.endsWith('.js'));

  assert.ok(shared, 'HTTP shared-import negative fixture is non-vacuous');
  await missingAsset(islandPath, 'Missing island component');
  await missingAsset(shared.slice(site.length), 'Missing shared module import');
  changeGeneration = true;
  const mixed = await verify();

  assert.notEqual(mixed.status, 0, 'Mixed-generation HTTP verifier must reject');
  assert.match(mixed.text, /Expected values to be strictly equal/, 'Mixed-generation failure at final projection equality');
  console.log('Publication HTTP contract fixtures PASS: 4 controls; complete assets, missing island, missing shared import, mixed generation. Fixture SHA is not deployment evidence.');
} finally {
  server.closeAllConnections();
  await new Promise((accept) => server.close(accept));
  await rm(temporary, { recursive: true, force: true });
}

// Read-only HTTP verification after the accepted main deployment (or a candidate server).
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { parse } from 'parse5';
import { site, routeInventory, readingFile, nodes, attribute } from './public-reading.mjs';
import { validateSeo } from './validate-seo.mjs';

const base = new URL(process.argv[2] ?? site);
assert.ok(base.pathname.endsWith('/shoal-app/'), 'Exact published base required');
const temporary = await mkdtemp(join(tmpdir(), 'shoal-http-'));
const receipts = [];
const fetched = new Set();
async function retrieve(path, type) {
  const url = new URL(path, base);
  const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
  assert.equal(response.status, 200, `HTTP availability: ${url}`);
  const contentType = response.headers.get('content-type') ?? '';
  if (type) assert.ok((Array.isArray(type) ? type : [type]).some((value) => contentType.toLowerCase().startsWith(value)), `Content type: ${url}: ${contentType}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  receipts.push({ url: url.href, status: response.status, contentType, bytes: bytes.length });
  fetched.add(url.href);
  return bytes;
}
async function save(path, bytes) {
  const destination = join(temporary, path);
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, bytes);
}
try {
  const projectionBytes = await retrieve('data/network.json', 'application/json');
  const projection = JSON.parse(projectionBytes.toString());
  await save('data/network.json', projectionBytes);
  const links = new Set();
  for (const route of routeInventory(projection)) {
    const html = await retrieve(route, 'text/html');
    await save(`${route}index.html`, html);
    await save(readingFile(route), await retrieve(readingFile(route), 'text/plain'));
    const document = parse(html.toString());
    for (const node of nodes(document, (node) => ['a', 'link', 'img', 'script'].includes(node.tagName))) {
      const href = attribute(node, 'href') ?? attribute(node, 'src');
      if (!href) continue;
      const url = new URL(href, `${site}${route}`);
      if (url.origin !== new URL(site).origin || !url.pathname.startsWith(new URL(site).pathname)) continue;
      if (url.hash && url.pathname === new URL(`${site}${route}`).pathname) {
        const id = decodeURIComponent(url.hash.slice(1));
        assert.ok(nodes(document, (element) => attribute(element, 'id') === id).length, `Static fragment: ${url}`);
      }
      url.hash = ''; url.search = ''; links.add(url.pathname.slice(new URL(site).pathname.length));
    }
  }
  for (const [path, type] of [
    ['llms.txt', 'text/plain'], ['robots.txt', 'text/plain'], ['sitemap-index.xml', ['application/xml', 'text/xml']],
    ['favicon.png', 'image/png'], ['apple-touch-icon.png', 'image/png'],
    ['shoal-logo.webp', 'image/webp'], ['og-shoal.webp', 'image/webp'],
  ]) await save(path, await retrieve(path, type));
  const sitemapIndex = await fetch(new URL('sitemap-index.xml', base)).then((response) => response.text());
  for (const [, location] of sitemapIndex.matchAll(/<loc>([^<]+)<\/loc>/g)) {
    assert.ok(location.startsWith(site));
    const path = location.slice(site.length);
    await save(path, await retrieve(path, ['application/xml', 'text/xml']));
  }
  for (const path of links) if (!fetched.has(new URL(path, base).href)) await retrieve(path);
  console.log(JSON.stringify({ base: base.href, projectionGeneratedAt: projection.generatedAt,
    checks: await validateSeo(temporary), receipts }, null, 2));
} finally { await rm(temporary, { recursive: true, force: true }); }

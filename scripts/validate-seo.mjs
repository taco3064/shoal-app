// Deterministic checks of the production HTML and its reading derivatives.
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parse } from 'parse5';
import { site, attribute, nodes, routeInventory, readingFile, readingText, discoveryText } from './public-reading.mjs';

const socialImage = `${site}og-shoal.webp`;
const text = (node) => node.nodeName === '#text' ? node.value : (node.childNodes ?? []).map(text).join('');
const find = (root, tag) => nodes(root, (node) => node.tagName === tag);
const withAttribute = (root, tag, key, value) => find(root, tag).filter((node) => attribute(node, key) === value);
const unique = (list, message) => { assert.equal(list.length, 1, message); return list[0]; };
const meta = (head, name) => {
  const node = unique(find(head, 'meta').filter((node) => [attribute(node, 'name'), attribute(node, 'property')].includes(name)), `One ${name}`);
  const value = attribute(node, 'content');
  assert.ok(value?.trim(), `Useful ${name}`);
  return value;
};

export function validatePage(html, route, projection) {
  const document = parse(html);
  const head = unique(find(document, 'head'), 'One head');
  const title = text(unique(find(head, 'title'), 'One title'));
  const description = meta(head, 'description');
  assert.ok(title.trim());
  assert.ok(description.length >= 45 && description.length <= 300, 'Bounded useful description');
  const canonical = attribute(unique(withAttribute(head, 'link', 'rel', 'canonical'), 'One canonical'), 'href');
  assert.equal(canonical, `${site}${route}`, `Canonical base: ${route}`);
  assert.equal(meta(head, 'google-site-verification'), 'uiJV6ksrGNcp_HmciZUGQLmPKQYO4Ka2XSXFRy1IS0g');
  for (const [name, expected] of Object.entries({
    'og:type': 'website', 'og:site_name': 'Shoal', 'og:title': title,
    'og:description': description, 'og:url': canonical, 'og:image': socialImage,
    'twitter:card': 'summary_large_image', 'twitter:title': title,
    'twitter:description': description, 'twitter:image': socialImage,
  })) assert.equal(meta(head, name), expected);
  assert.equal(meta(head, 'og:image:alt'), meta(head, 'twitter:image:alt'));
  const main = unique(find(document, 'main'), 'One static main');
  unique(find(main, 'h1'), 'One H1');
  assert.ok(text(main).trim().length > 400, 'Meaningful static explanation');
  const links = find(document, 'a').map((node) => attribute(node, 'href'));
  for (const destination of [site, `${site}how-it-works/`, `${site}join/`, `${site}reviewers/`]) {
    assert.ok(links.some((href) => new URL(href, canonical).href === destination), `Static navigation: ${destination}`);
  }
  const rawSchema = text(unique(withAttribute(head, 'script', 'type', 'application/ld+json'), 'One schema owner'));
  const schema = JSON.parse(rawSchema);
  assert.equal(schema['@context'], 'https://schema.org');
  const graph = schema['@graph'];
  assert.deepEqual(graph.map((node) => node['@type']).sort(), ['Brand', 'BreadcrumbList', 'WebPage', 'WebSite'].sort());
  const page = graph.find((node) => node['@type'] === 'WebPage');
  assert.equal(page.name, title); assert.equal(page.description, description); assert.equal(page.url, canonical);
  const brand = graph.find((node) => node['@type'] === 'Brand');
  assert.equal(brand.name, 'Shoal'); assert.equal(brand.url, site);
  assert.deepEqual(brand.logo, { '@type': 'ImageObject', url: `${site}shoal-logo.webp`, width: 1200, height: 403 });
  const website = graph.find((node) => node['@type'] === 'WebSite');
  assert.equal(website.url, site); assert.equal(website.name, 'Shoal');
  assert.equal(website.about['@id'], brand['@id']);
  assert.equal(page.isPartOf['@id'], website['@id']);
  assert.equal(page.about['@id'], brand['@id']);
  const crumbs = graph.find((node) => node['@type'] === 'BreadcrumbList').itemListElement;
  assert.equal(crumbs[0].item, site); assert.equal(crumbs.at(-1).item, canonical);
  assert.ok(crumbs.every((crumb, i) => crumb.position === i + 1));
  const alternate = unique(withAttribute(head, 'link', 'rel', 'alternate'), 'Text alternate');
  assert.equal(attribute(alternate, 'type'), 'text/plain');
  assert.equal(new URL(attribute(alternate, 'href'), canonical).href, `${site}${readingFile(route)}`);
  const visible = text(main);
  if (!route) assert.match(visible, /Make a GitHub Star explainable/);
  if (route === 'how-it-works/') {
    for (const pattern of [/Requester/, /Reviewer/, /Review Policy/, /Re-review/, /PASS/, /FAIL/, /actual GitHub Star/, /Hosted/, /best-effort/, /none/]) assert.match(visible, pattern);
    assert.doesNotMatch(visible, /Shoal does not start background AI judgment/);
  }
  if (route === 'join/') {
    const stages = withAttribute(main, 'ol', 'aria-label', 'Join progress');
    assert.equal(stages.length, 1, 'One canonical Join journey');
    const details = withAttribute(stages[0], 'details', 'class', 'quick-local-note');
    assert.equal(details.length, 6, 'All six stages readable without JS');
    for (const pattern of [/gh auth status/, /gh extension install/, /gh shoal init/, /README.md/, /Network Root/, /publication/]) assert.match(visible, pattern);
  }
  if (route === 'reviewers/') {
    for (const reviewer of projection.reviewers) assert.ok(links.includes(`/shoal-app/reviewers/${encodeURIComponent(reviewer.username)}/`), `All Reviewer links: ${reviewer.username}`);
  }
  if (route.startsWith('reviewers/') && route !== 'reviewers/') {
    const reviewer = projection.reviewers.find(({ username }) => route === `reviewers/${username}/`);
    assert.equal(title, `${reviewer.username} — Shoal Reviewer`);
    assert.ok(visible.includes(String(reviewer.repositoryId)), 'Projected stable identity');
    assert.ok(links.includes(reviewer.policyUrl), 'Pinned Policy source even when unavailable');
    assert.ok(links.includes(reviewer.repositoryUrl));
    assert.ok(visible.includes(projection.generatedAt));
    assert.match(visible, reviewer.stationStatus === 'ready' ? /Station ready/ : /Station setup required/);
    assert.equal(links.includes(`${reviewer.repositoryUrl}/issues/new/choose`), reviewer.stationStatus === 'ready');
    assert.ok(description.includes(reviewer.summary.status === 'current' ? 'latest accepted Summary' : reviewer.summary.status === 'fallback' ? 'stale prior accepted' : 'no accepted Summary'));
    if (reviewer.summary.status === 'unavailable') {
      assert.match(visible, /No accepted Summary snapshot/);
      assert.equal(withAttribute(main, 'section', 'aria-labelledby', 'workload-title').length, 0);
    } else {
      assert.ok(links.includes(reviewer.summary.source.transportUrl));
      assert.ok(links.includes(reviewer.summary.source.runUrl));
      assert.ok(visible.includes(reviewer.summary.source.summaryDigest));
      if (reviewer.summary.status === 'fallback') assert.match(visible, /stale.*fallback|stale\s+fallback/);
    }
  }
  return { title, description };
}

function dimensions(bytes, name) {
  if (name.endsWith('.png')) {
    assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
  }
  assert.equal(bytes.toString('ascii', 0, 4), 'RIFF');
  assert.equal(bytes.toString('ascii', 8, 12), 'WEBP');
  assert.equal(bytes.readUInt32LE(4) + 8, bytes.length);
  const kind = bytes.toString('ascii', 12, 16);
  if (kind === 'VP8L') {
    assert.equal(bytes[20], 0x2f);
    const bits = bytes.readUInt32LE(21);
    return [(bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1];
  }
  if (kind === 'VP8X') return [bytes.readUIntLE(24, 3) + 1, bytes.readUIntLE(27, 3) + 1];
  throw new Error(`Unsupported branding encoding: ${name}`);
}

export async function validateSeo(output) {
  const projection = JSON.parse(await readFile(join(output, 'data/network.json'), 'utf8'));
  const routes = routeInventory(projection);
  const titles = new Set(); const descriptions = new Set();
  for (const route of routes) {
    const html = await readFile(join(output, route, 'index.html'), 'utf8');
    const result = validatePage(html, route, projection);
    assert.ok(!titles.has(result.title), `Unique title: ${route}`); titles.add(result.title);
    assert.ok(!descriptions.has(result.description), `Unique factual description: ${route}`); descriptions.add(result.description);
    assert.equal(await readFile(join(output, readingFile(route)), 'utf8'), readingText(html, `${site}${route}`), `No reading drift: ${route}`);
  }
  const folders = await readdir(join(output, 'reviewers'), { withFileTypes: true });
  assert.deepEqual(folders.filter((entry) => entry.isDirectory()).map(({ name }) => name).sort(), projection.reviewers.map(({ username }) => username).sort(), 'No deleted / stale Reviewer routes');
  const readingFiles = (await readdir(join(output, 'read'), { recursive: true }))
    .map((file) => file.replaceAll('\\', '/'));
  assert.deepEqual(readingFiles.filter((file) => file.endsWith('.txt')).sort(), routes.map((route) => readingFile(route).slice(5)).sort(), 'Exact reading membership');
  assert.equal(await readFile(join(output, 'llms.txt'), 'utf8'), discoveryText(projection));
  for (const [asset, expected] of Object.entries({ 'favicon.png': [256, 256], 'apple-touch-icon.png': [180, 180], 'shoal-logo.webp': [1200, 403], 'og-shoal.webp': [1200, 630] })) {
    assert.deepEqual(dimensions(await readFile(join(output, asset)), asset), expected, `Published brand representation: ${asset}`);
  }
  assert.equal(await readFile(join(output, 'robots.txt'), 'utf8'), `User-agent: *\nAllow: /shoal-app/\nSitemap: ${site}sitemap-index.xml\n`);
  const locations = (xml) => [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(([, value]) => value.replaceAll('&amp;', '&'));
  const index = await readFile(join(output, 'sitemap-index.xml'), 'utf8');
  assert.match(index, /<sitemapindex\b/);
  const sitemaps = locations(index); assert.ok(sitemaps.length);
  const pages = [];
  for (const url of sitemaps) {
    assert.ok(url.startsWith(site));
    const xml = await readFile(join(output, url.slice(site.length)), 'utf8');
    assert.match(xml, /<urlset\b/); pages.push(...locations(xml));
  }
  assert.deepEqual(pages.sort(), routes.map((route) => `${site}${route}`).sort(), 'Exact HTML sitemap membership, no data / text / error routes');
  return { pages: routes.length, reviewers: projection.reviewers.length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  console.log('SEO artifacts PASS:', await validateSeo(resolve(process.argv[2] ?? 'dist')));
}

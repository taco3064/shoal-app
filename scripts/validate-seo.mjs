// Inspect Astro's production artifacts without executing browser JavaScript.
// Run after build; the same check supports CI fixtures and published projections.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import sharp from 'sharp';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { htmlAssetUrls, moduleAssetUrls } from './public-assets.mjs';

const output = resolve(process.argv[2] ?? 'dist');
const site = 'https://taco3064.github.io/shoal-app/';
const verification = 'uiJV6ksrGNcp_HmciZUGQLmPKQYO4Ka2XSXFRy1IS0g';
const socialImage = `${site}og-shoal.webp`;
const projection = JSON.parse(await readFile(resolve(output, 'data/network.json'), 'utf8'));
const routes = ['', 'how-it-works/', 'join/', 'reviewers/',
  ...projection.reviewers.map(({ username }) => `reviewers/${username}/`)];

function decode(value) {
  return value.replace(/&#(x[\da-f]+|\d+);|&(amp|quot|apos|lt|gt);/gi, (_, number, named) =>
    number
      ? String.fromCodePoint(number.startsWith('x')
        ? Number.parseInt(number.slice(1), 16) : Number(number))
      : ({ amp: '&', quot: '"', apos: "'", lt: '<', gt: '>' })[named]);
}

function tags(head, tag) {
  return [...head.matchAll(new RegExp(`<${tag}\\b([^>]*)>`, 'g'))].map((match) =>
    Object.fromEntries([...match[1].matchAll(/([\w:-]+)="([^"]*)"/g)]
      .map(([, key, value]) => [key, decode(value)])));
}

function meta(head, key) {
  const values = tags(head, 'meta').filter((tag) => (tag.name ?? tag.property) === key);
  assert.equal(values.length, 1, `Exactly one static ${key} tag`);
  assert.ok(values[0].content?.trim(), `Non-empty ${key}`);
  return values[0].content;
}

const verifiedAssets = new Set();

async function verifyAssetClosure(assets) {
  const pending = [...assets];

  while (pending.length > 0) {
    const url = pending.pop();

    if (verifiedAssets.has(url)) {
      continue;
    }

    verifiedAssets.add(url);
    const path = decodeURIComponent(new URL(url).pathname.slice(new URL(site).pathname.length));
    let bytes;

    try {
      bytes = await readFile(resolve(output, path));
    } catch (error) {
      throw new Error(`Missing public asset dependency: ${url}`, { cause: error });
    }

    assert.ok(bytes.length > 0, `Nonempty public asset: ${url}`);
    pending.push(...await moduleAssetUrls(bytes.toString('utf8'), url, site));
  }
}

const titles = new Set();
const descriptions = new Set();
let homepageDescription;

for (const route of routes) {
  const html = await readFile(resolve(output, route, 'index.html'), 'utf8');
  await verifyAssetClosure(htmlAssetUrls(html, site));
  const head = html.match(/<head\b[^>]*>([\s\S]*?)<\/head>/)?.[1];
  assert.ok(head, `Static head: ${route}`);
  const title = decode(head.match(/<title>([^<]+)<\/title>/)?.[1] ?? '');
  const description = meta(head, 'description');
  assert.ok(title.trim(), `Non-empty title: ${route}`);
  assert.ok(!descriptions.has(description), `Page-specific description: ${route}`);
  descriptions.add(description);
  assert.ok(!tags(head, 'meta').some((tag) => tag.name === 'robots' && /noindex|nofollow/i.test(tag.content ?? '')), `Indexable public page: ${route}`);
  assert.equal([...head.matchAll(/<title>/g)].length, 1, `Exactly one title: ${route}`);
  assert.ok(!titles.has(title), `Page-specific title: ${route}`);
  titles.add(title);
  assert.equal(meta(head, 'google-site-verification'), verification);
  const canonicals = tags(head, 'link').filter((tag) => tag.rel === 'canonical');
  assert.equal(canonicals.length, 1);
  assert.equal(canonicals[0].href, `${site}${route}`, `Canonical: ${route}`);
  assert.equal(meta(head, 'og:type'), 'website');
  assert.equal(meta(head, 'og:site_name'), 'Shoal');
  assert.equal(meta(head, 'og:title'), title);
  assert.equal(meta(head, 'og:description'), description);
  assert.equal(meta(head, 'og:url'), `${site}${route}`);
  assert.equal(meta(head, 'og:image'), socialImage);
  assert.equal(meta(head, 'twitter:card'), 'summary_large_image');
  assert.equal(meta(head, 'twitter:title'), title);
  assert.equal(meta(head, 'twitter:description'), description);
  assert.equal(meta(head, 'twitter:image'), socialImage);
  assert.equal(meta(head, 'twitter:image:alt'), meta(head, 'og:image:alt'));
  assert.equal([...html.matchAll(/<main\b/g)].length, 1, `One static primary content: ${route}`);
  assert.equal([...html.matchAll(/<h1\b/g)].length, 1, `One static page heading: ${route}`);

  for (const [relation, path] of [['icon', 'favicon.png'], ['apple-touch-icon', 'apple-touch-icon.png']]) {
    const links = tags(head, 'link').filter((tag) => tag.rel === relation);

    assert.equal(links.length, 1, `Exactly one ${relation} asset`);
    assert.equal(links[0].href, `/shoal-app/${path}`);
  }

  const logos = tags(html, 'img').filter((tag) => tag.src === '/shoal-app/shoal-logo.webp');

  assert.ok(logos.length > 0, 'Visible public brand logo');
  assert.ok(logos.every((logo) => logo.alt?.trim() && logo.width === '1200' && logo.height === '403'), 'Brand logo truthful dimensions and text alternative');

  for (const link of tags(html, 'link').filter((tag) => ['icon', 'apple-touch-icon'].includes(tag.rel))) {
    assert.ok(link.href.startsWith('/shoal-app/'), 'Icon uses production base path');
    await readFile(resolve(output, link.href.slice('/shoal-app/'.length)));
  }
  const { publicExplanation } = await import(pathToFileURL(resolve('src/guide/services/public_content/index.ts')).href);

  for (const paragraph of publicExplanation.paragraphs) {
    assert.ok(decode(html).includes(paragraph), `Governed explanation visible without JS: ${route}`);
  }
  const platformHtml = html.replace(/<div class="review-policy-content">[\s\S]*?<\/div>/g, '');

  for (const link of tags(platformHtml, 'a').map((tag) => tag.href).filter(Boolean)) {
    const local = link.startsWith('/shoal-app/') ? link.slice('/shoal-app/'.length)
      : link.startsWith(site) ? link.slice(site.length) : null;

    if (local !== null) {
      const path = local.split(/[?#]/)[0];

      await readFile(resolve(output, path.endsWith('/') || !path ? `${path}index.html` : path));
    }
  }

  const jsonLd = [...head.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];

  assert.equal(jsonLd.length, 1, `Exactly one static JSON-LD graph: ${route}`);
  const structured = JSON.parse(jsonLd[0][1]);
  assert.equal(structured['@context'], 'https://schema.org');
  assert.ok(Array.isArray(structured['@graph']), `Static graph: ${route}`);
  const graph = structured['@graph'];
  const types = graph.map((node) => node['@type']);

  assert.deepEqual([...types].sort(),
    ['WebSite', 'Brand', 'WebPage', ...(route ? ['BreadcrumbList'] : [])].sort(),
    `Only truthful product/page/breadcrumb nodes: ${route}`);
  assert.equal(new Set(graph.map((node) => node['@id'])).size, graph.length);
  const website = graph.find((node) => node['@type'] === 'WebSite');
  const brand = graph.find((node) => node['@type'] === 'Brand');
  const page = graph.find((node) => node['@type'] === 'WebPage');

  assert.equal(website['@id'], `${site}#website`);
  assert.equal(website.url, site);
  assert.equal(website.name, 'Shoal');
  assert.equal(brand['@id'], `${site}#brand`);
  assert.equal(brand.name, 'Shoal');
  assert.deepEqual(website.about, { '@id': brand['@id'] });
  assert.equal(page['@id'], `${site}${route}#page`);
  assert.equal(page.url, `${site}${route}`);
  assert.equal(page.name, title);
  assert.equal(page.description, description);
  assert.deepEqual(page.isPartOf, { '@id': website['@id'] });
  assert.equal(brand.logo['@type'], 'ImageObject');
  assert.equal(brand.logo.width, 1200);
  assert.equal(brand.logo.height, 403);
  assert.ok(brand.logo.url.startsWith(site));
  await readFile(resolve(output, brand.logo.url.slice(site.length)));

  if (route === '') {
    homepageDescription = description;
    assert.match(html, /Make a GitHub Star explainable/);
  } else {
    const breadcrumb = graph.find((node) => node['@type'] === 'BreadcrumbList');
    const items = breadcrumb.itemListElement;
    const expectedUrls = [site,
      ...(route.startsWith('reviewers/') && route !== 'reviewers/' ? [`${site}reviewers/`] : []),
      `${site}${route}`];

    assert.deepEqual(items.map((item) => item.item), expectedUrls);
    assert.deepEqual(items.map((item) => item.position), items.map((_, i) => i + 1));
    assert.ok(items.every((item) => item['@type'] === 'ListItem' && item.name?.trim()));
    assert.deepEqual(page.breadcrumb, { '@id': breadcrumb['@id'] });
  }

  if (route.startsWith('reviewers/') && route !== 'reviewers/') {
    const reviewer = projection.reviewers.find(({ username }) => route === `reviewers/${username}/`);
    assert.equal(title, `${reviewer.username} — Shoal Reviewer`);
    assert.ok(html.includes(String(reviewer.repositoryId)), 'Static projected Node identity');
    assert.match(html, /id="policy-title"/, 'Static Review Policy section');
    assert.ok(html.includes(reviewer.repositoryUrl), 'Static projected Node link');
  }
}

async function htmlRoutes(folder, prefix = '') {
  const found = [];

  for (const entry of await readdir(folder, { withFileTypes: true })) {
    const path = `${prefix}${entry.name}`;

    if (entry.isDirectory()) {
      found.push(...await htmlRoutes(resolve(folder, entry.name), `${path}/`));
    } else if (entry.name.endsWith('.html')) {
      found.push(path);
    }
  }

  return found;
}

assert.deepEqual((await htmlRoutes(output)).filter((path) => path !== '404.html').sort(), routes.map((route) => `${route}index.html`).sort(),
  'Generated HTML routes exactly match public pages and projected participants');
assert.match(homepageDescription, /public review network/i);
const detailFolders = await readdir(resolve(output, 'reviewers'), { withFileTypes: true });
assert.deepEqual(detailFolders.filter((entry) => entry.isDirectory()).map(({ name }) => name).sort(),
  projection.reviewers.map(({ username }) => username).sort(),
  'Reviewer routes are exactly the published projection participants');

const image = await readFile(resolve(output, 'og-shoal.webp'));
assert.equal(image.toString('ascii', 0, 4), 'RIFF');
assert.equal(image.toString('ascii', 8, 12), 'WEBP');
assert.ok(image.length > 12, 'Public social image');

for (const [path, width, height] of [['og-shoal.webp', 1200, 630], ['shoal-logo.webp', 1200, 403],
  ['favicon.png', 256, 256], ['apple-touch-icon.png', 180, 180]]) {
  // Astro's locked image dependency fully decodes artifacts, including truncated pixels.
  const decoded = await sharp(await readFile(resolve(output, path))).raw().toBuffer({ resolveWithObject: true });

  assert.equal(decoded.info.width, width, `Image decoded width: ${path}`);
  assert.equal(decoded.info.height, height, `Image decoded height: ${path}`);
  assert.equal(decoded.data.length, width * height * decoded.info.channels, `Complete image pixel data: ${path}`);
}

const robots = await readFile(resolve(output, 'robots.txt'), 'utf8');
assert.equal(robots, `User-agent: *\nAllow: /shoal-app/\nSitemap: ${site}sitemap-index.xml\n`);

function locations(xml) {
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(([, value]) => decode(value));
}

const index = await readFile(resolve(output, 'sitemap-index.xml'), 'utf8');
assert.match(index, /<sitemapindex\b/);
const sitemaps = locations(index);
assert.ok(sitemaps.length > 0, 'At least one generated sitemap');
const pageUrls = [];

for (const url of sitemaps) {
  assert.ok(url.startsWith(site), `Production sitemap locator: ${url}`);
  const sitemap = await readFile(resolve(output, url.slice(site.length)), 'utf8');
  assert.match(sitemap, /<urlset\b/);
  pageUrls.push(...locations(sitemap));
}

assert.equal(new Set(pageUrls).size, pageUrls.length, 'No duplicate sitemap URLs');
assert.deepEqual([...pageUrls].sort(), routes.map((route) => `${site}${route}`).sort(),
  'Sitemap includes every public HTML route and no data / error endpoints');
const directory = await readFile(resolve(output, 'reviewers/index.html'), 'utf8');
const directoryLinks = tags(directory, 'a').map((tag) => tag.href);

for (const { username } of projection.reviewers) {
  assert.ok(directoryLinks.includes(`/shoal-app/reviewers/${username}/`),
    `Every projected detail has an SSR Directory anchor: ${username}`);
}

const llms = await readFile(resolve(output, 'llms.txt'), 'utf8');
const generated = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e',
  'import {agentEntryPoint,publicPagesMarkdown} from "./src/guide/services/agent_reading/index.ts";'
  + `console.log(JSON.stringify([agentEntryPoint(${JSON.stringify(site)}),publicPagesMarkdown(${JSON.stringify(site)})]));`],
{ cwd: process.cwd(), encoding: 'utf8' });

assert.equal(generated.status, 0, `Governed text generation: ${generated.stderr}`);
const [expectedLlms, expectedPublicPages] = JSON.parse(generated.stdout);
assert.equal(llms, expectedLlms, 'LLM entry exactly matches governed source');
assert.match(llms, /^# Shoal\b/);
const entryLinks = [...llms.matchAll(/\[[^\]]+\]\((https:\/\/[^)]+)\)/g)].map(([, url]) => url);

for (const route of ['', 'how-it-works/', 'join/', 'reviewers/',
  'data/network.json', 'content/how-it-works.md', 'content/public-pages.md']) {
  assert.ok(entryLinks.includes(`${site}${route}`), `LLM entry links ${route}`);
}

for (const url of entryLinks.filter((url) => url.startsWith(site))) {
  const path = url.slice(site.length);
  const content = await readFile(resolve(output, path.endsWith('/') || !path ? `${path}index.html` : path), 'utf8');

  assert.ok(content.trim(), `LLM linked artifact exists: ${url}`);
}

const lifecycle = await readFile(resolve('src/guide/lifecycle.md'), 'utf8');
const markdown = await readFile(resolve(output, 'content/how-it-works.md'), 'utf8');
assert.equal(markdown, lifecycle, 'Machine guide exactly matches governed visible lifecycle source');
const publicPages = await readFile(resolve(output, 'content/public-pages.md'), 'utf8');
assert.equal(publicPages, expectedPublicPages, 'Machine public facts exactly match governed source');
const { publicExplanation } = await import(pathToFileURL(resolve('src/guide/services/public_content/index.ts')).href);
const { canonicalJoinGuidance } = await import(pathToFileURL(resolve('src/join/services/join_guidance/index.ts')).href);

for (const paragraph of publicExplanation.paragraphs) {
  assert.ok(publicPages.includes(paragraph), 'Machine public explanation follows governed visible source');
}

const joinHtml = decode(await readFile(resolve(output, 'join/index.html'), 'utf8'));

for (const stage of canonicalJoinGuidance) {
  for (const text of [stage.label, stage.description, stage.localDescription, ...(stage.commands ?? [])]) {
    assert.ok(publicPages.includes(text), `Machine Join guidance follows governed source: ${stage.id}`);
    assert.ok(joinHtml.includes(text), `Canonical Join guidance visible without JS: ${stage.id}`);
  }
}

for (const reviewer of projection.reviewers) {
  const snapshot = await readFile(resolve(output, `reviewers/${reviewer.username}/snapshot.txt`), 'utf8');
  const detail = await readFile(resolve(output, `reviewers/${reviewer.username}/index.html`), 'utf8');
  const { reviewerSnapshot } = await import(pathToFileURL(resolve('src/guide/services/public_content/index.ts')).href);

  assert.equal(snapshot, reviewerSnapshot(reviewer, projection.generatedAt, `${site}reviewers/${reviewer.username}/`),
    'Reviewer text exactly matches governed projection derivation');

  assert.ok(snapshot.includes(projection.generatedAt), 'Snapshot projection freshness');
  assert.ok(snapshot.includes(String(reviewer.repositoryId)), 'Snapshot projected stable identity');
  assert.ok(snapshot.includes(reviewer.stationStatus), 'Snapshot exact station readiness');
  assert.ok(snapshot.includes(`Accepted Summary selection: ${reviewer.summary.status}`), 'Snapshot exact Summary status');
  assert.ok(snapshot.includes(`Stale fallback: ${reviewer.summary.stale}`), 'Snapshot exact stale state');
  assert.ok(snapshot.includes(`Readiness reasons: ${reviewer.stationReadinessReasons.join(', ') || 'none'}`), 'Snapshot exact readiness reasons');
  assert.ok(!snapshot.includes('undefined'), 'Missing snapshot facts remain absent');
  assert.equal(snapshot.includes(`Request Review: ${reviewer.repositoryUrl}/issues/new/choose`), reviewer.stationStatus === 'ready');

  if (reviewer.summary.status === 'unavailable') {
    assert.ok(!snapshot.includes('## Selected accepted snapshot'), 'Unavailable metrics stay absent');
    assert.ok(!snapshot.includes('## Accepted source provenance'), 'Unavailable provenance stays absent');
  } else {
    for (const [key, value] of Object.entries(reviewer.summary.summary.metrics)) {
      assert.ok(snapshot.includes(`${key}: ${value}\n`), `Exact selected snapshot metric ${key}`);
    }

    for (const [key, value] of Object.entries(reviewer.summary.source)) {
      assert.ok(snapshot.includes(`${key}: ${value}\n`), `Exact selected snapshot provenance ${key}`);
    }

    if (reviewer.summary.summary.generatedAt) {
      assert.ok(snapshot.includes(`Summary generatedAt: ${reviewer.summary.summary.generatedAt}`));
    }
  }
  assert.ok(tags(detail, 'a').some((tag) => tag.href === `/shoal-app/reviewers/${reviewer.username}/snapshot.txt`));
  assert.ok(tags(detail, 'a').some((tag) => tag.href === '/shoal-app/data/network.json'));
  assert.equal(tags(detail, 'a').some((tag) => tag.href === `${reviewer.repositoryUrl}/issues/new/choose`), reviewer.stationStatus === 'ready', 'Request link follows projected readiness');
}

assert.ok(directoryLinks.includes('/shoal-app/data/network.json'));
console.log(`SEO artifacts PASS: ${routes.length} public pages, ${projection.reviewers.length} Reviewer details; static metadata, JSON-LD, social image, robots, sitemap and ${verifiedAssets.size} hydration/CSS dependency assets.`);

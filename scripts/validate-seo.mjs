// Inspect Astro's production artifacts without executing browser JavaScript.
// Run after build; the same check supports CI fixtures and published projections.
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';

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

const titles = new Set();
let homepageDescription;

for (const route of routes) {
  const html = await readFile(resolve(output, route, 'index.html'), 'utf8');
  const head = html.match(/<head\b[^>]*>([\s\S]*?)<\/head>/)?.[1];
  assert.ok(head, `Static head: ${route}`);
  const title = decode(head.match(/<title>([^<]+)<\/title>/)?.[1] ?? '');
  const description = meta(head, 'description');
  assert.ok(title.trim(), `Non-empty title: ${route}`);
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
  assert.match(html, /<main\b/, `Static primary content: ${route}`);
  assert.match(html, /<h1\b/, `Static page heading: ${route}`);
  const jsonLd = [...head.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];

  if (route === '') {
    homepageDescription = description;
    assert.equal(jsonLd.length, 1, 'Homepage static JSON-LD');
    assert.deepEqual(JSON.parse(jsonLd[0][1]), {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: 'Shoal',
      url: site,
      description,
    });
    assert.match(html, /Make a GitHub Star explainable/);
  } else {
    assert.equal(jsonLd.length, 0, 'No synthetic Reviewer structured data');
  }

  if (route.startsWith('reviewers/') && route !== 'reviewers/') {
    const reviewer = projection.reviewers.find(({ username }) => route === `reviewers/${username}/`);
    assert.equal(title, `${reviewer.username} — Shoal Reviewer`);
    assert.ok(html.includes(String(reviewer.repositoryId)), 'Static projected Node identity');
    assert.match(html, /id="policy-title"/, 'Static Review Policy section');
    assert.ok(html.includes(reviewer.repositoryUrl), 'Static projected Node link');
  }
}

assert.match(homepageDescription, /public review network/i);
const detailFolders = await readdir(resolve(output, 'reviewers'), { withFileTypes: true });
assert.deepEqual(detailFolders.filter((entry) => entry.isDirectory()).map(({ name }) => name).sort(),
  projection.reviewers.map(({ username }) => username).sort(),
  'Reviewer routes are exactly the published projection participants');

const image = await readFile(resolve(output, 'og-shoal.webp'));
assert.equal(image.toString('ascii', 0, 4), 'RIFF');
assert.equal(image.toString('ascii', 8, 12), 'WEBP');
assert.ok(image.length > 12, 'Public social image');

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
console.log(`SEO artifacts PASS: ${routes.length} public pages, ${projection.reviewers.length} Reviewer details; static metadata, JSON-LD, social image, robots and sitemap.`);

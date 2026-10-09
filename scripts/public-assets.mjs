// Targeted adoption of PR #81's asset-closure checks; no content-generation owner.
import assert from 'node:assert/strict';
import { init, parse as parseModule } from 'es-module-lexer';
import { parse } from 'parse5';
import { attribute, nodes } from './public-reading.mjs';

function localUrl(reference, parent, site) {
  const base = new URL(site);
  const url = new URL(reference, parent);
  if (url.origin !== base.origin) return null;
  assert.ok(url.pathname.startsWith(base.pathname), `Public asset reference outside production base: ${reference} from ${parent}`);
  url.hash = '';
  return url.href;
}

export function assetPath(url, site) {
  const base = new URL(site);
  const parsed = new URL(url);
  assert.equal(parsed.origin, base.origin);
  assert.ok(parsed.pathname.startsWith(base.pathname));
  const path = decodeURIComponent(parsed.pathname.slice(base.pathname.length));
  assert.ok(path && !/[\\\0]/.test(path) && !path.split('/').includes('..'), `Safe public asset path: ${url}`);
  return path;
}

export async function moduleAssetUrls(source, assetUrl, site, kind = new URL(assetUrl).pathname) {
  const references = [];
  if (/\.(?:m?js)$/i.test(kind)) {
    await init;
    const [imports] = parseModule(source, assetUrl);
    for (const imported of imports) {
      // import.meta and runtime expressions are not statically resolvable URLs.
      if (imported.n === undefined) continue;
      assert.ok(/^(?:\.{1,2}\/|\/|[a-z][a-z\d+.-]*:)/i.test(imported.n), `Unresolved bare public module import: ${imported.n} from ${assetUrl}`);
      references.push(imported.n);
    }
  } else if (/\.css$/i.test(kind)) {
    const css = source.replace(/\/\*[\s\S]*?\*\//g, '');
    for (const match of css.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^\s)]*))\s*\)|@import\s+(?:"([^"]*)"|'([^']*)')/gi)) {
      const reference = match.slice(1).find((value) => value !== undefined);
      if (reference && !reference.startsWith('#')) references.push(reference);
    }
  }
  return [...new Set(references.map((reference) => localUrl(reference, assetUrl, site)).filter(Boolean))];
}

export async function htmlAssetUrls(html, pageUrl, site) {
  const urls = new Set();
  for (const node of nodes(parse(html), (element) => Boolean(element.tagName))) {
    const references = [];
    if (['img', 'script', 'source', 'video', 'audio'].includes(node.tagName)) references.push(attribute(node, 'src'));
    if (node.tagName === 'video') references.push(attribute(node, 'poster'));
    if (node.tagName === 'link' && /^(?:stylesheet|modulepreload|preload|icon|apple-touch-icon)$/.test(attribute(node, 'rel') ?? '')) references.push(attribute(node, 'href'));
    if (node.tagName === 'astro-island') references.push(attribute(node, 'component-url'), attribute(node, 'renderer-url'));
    const srcset = attribute(node, 'srcset');
    // Astro's emitted image candidates use ordinary URLs; data URLs are excluded.
    if (srcset) references.push(...srcset.split(',').map((candidate) => candidate.trim().split(/\s+/)[0]).filter((reference) => /\/_astro\//.test(reference)));
    for (const reference of references.filter(Boolean)) {
      const url = localUrl(reference, pageUrl, site);
      if (url) urls.add(url);
    }
    if (node.tagName === 'script' && attribute(node, 'type') === 'module' && !attribute(node, 'src')) {
      const source = (node.childNodes ?? []).map((child) => child.value ?? '').join('');
      for (const url of await moduleAssetUrls(source, pageUrl, site, '.js')) urls.add(url);
    }
  }
  return [...urls];
}

export async function verifyAssetClosure(roots, site, retrieve) {
  const pending = [...roots];
  const checked = new Set();
  while (pending.length) {
    const url = pending.pop();
    if (checked.has(url)) continue;
    checked.add(url);
    const bytes = await retrieve(url, assetPath(url, site));
    assert.ok(bytes.length, `Nonempty public asset: ${url}`);
    pending.push(...await moduleAssetUrls(bytes.toString('utf8'), url, site));
  }
  return checked;
}

export function assetContentType(url) {
  const path = new URL(url).pathname;
  if (/\.(?:m?js)$/i.test(path)) return /^(?:application|text)\/(?:javascript|ecmascript)(?:;|$)/i;
  if (/\.css$/i.test(path)) return /^text\/css(?:;|$)/i;
  if (/\.wasm$/i.test(path)) return /^application\/wasm(?:;|$)/i;
  if (/\.woff2?$/i.test(path)) return /^(?:font\/|application\/(?:font|octet-stream))/i;
  return /^(?:image\/|font\/|application\/octet-stream)/i;
}

// Shared artifact/publication closure checks; no browser execution or external fetches.
import assert from 'node:assert/strict';
import { init, parse } from 'es-module-lexer';

function htmlDecode(value) {
  return value.replace(/&#(x[\da-f]+|\d+);|&(amp|quot|apos|lt|gt);/gi,
    (_, number, named) => number
      ? String.fromCodePoint(number.toLowerCase().startsWith('x')
        ? Number.parseInt(number.slice(1), 16) : Number(number))
      : ({ amp: '&', quot: '"', apos: "'", lt: '<', gt: '>' })[named.toLowerCase()]);
}

function localUrl(reference, assetUrl, site) {
  const base = new URL(site);
  const url = new URL(reference, assetUrl);

  if (url.origin !== base.origin) {
    return null;
  }

  assert.ok(url.pathname.startsWith(base.pathname),
    `Public asset reference outside production base: ${reference} from ${assetUrl}`);
  url.hash = '';

  return url.href;
}

export function htmlAssetUrls(html, site) {
  const urls = new Set();

  for (const tag of html.matchAll(/<[a-z][\w:-]*\b([^>]*)>/gi)) {
    for (const match of tag[1].matchAll(/(?:^|\s)(src|href|component-url|renderer-url|srcset)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi)) {
      const value = htmlDecode(match[2] ?? match[3] ?? match[4]);
      const references = match[1].toLowerCase() === 'srcset'
        ? value.split(',').map((candidate) => candidate.trim().split(/\s+/)[0])
        : [value];

      for (const reference of references.filter(Boolean)) {
        const url = new URL(reference, site);

        if (url.origin === new URL(site).origin && /\/_astro\//.test(url.pathname)) {
          urls.add(localUrl(reference, site, site));
        }
      }
    }
  }

  return [...urls];
}

export async function moduleAssetUrls(source, assetUrl, site) {
  const references = [];
  const path = new URL(assetUrl).pathname;

  if (/\.(?:m?js)$/i.test(path)) {
    await init;
    const [imports] = parse(source, assetUrl);

    for (const imported of imports) {
      // import.meta and runtime expressions have no literal URL to verify here.
      if (imported.n === undefined) {
        continue;
      }

      assert.ok(/^(?:\.{1,2}\/|\/|[a-z][a-z\d+.-]*:)/i.test(imported.n),
        `Unresolved bare public module import: ${imported.n} from ${assetUrl}`);
      references.push(imported.n);
    }
  } else if (/\.css$/i.test(path)) {
    const css = source.replace(/\/\*[\s\S]*?\*\//g, '');

    for (const match of css.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^\s)]*))\s*\)|@import\s+(?:"([^"]*)"|'([^']*)')/gi)) {
      const reference = match.slice(1).find((value) => value !== undefined);

      if (reference && !reference.startsWith('#')) {
        references.push(reference);
      }
    }
  }

  return [...new Set(references.map((reference) => localUrl(reference, assetUrl, site)).filter(Boolean))];
}

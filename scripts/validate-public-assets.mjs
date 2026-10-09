// Real artifact corruption and anonymous HTTP controls for dependency closure.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { assetPath, htmlAssetUrls, moduleAssetUrls } from './public-assets.mjs';
import { site, attribute, nodes } from './public-reading.mjs';
import { parse } from 'parse5';
import { validateSeo } from './validate-seo.mjs';

export async function validatePublicAssets(output) {
  const temporary = await mkdtemp(join(tmpdir(), 'shoal-assets-'));
  const copy = join(temporary, 'publication');
  await cp(output, copy, { recursive: true });
  let missing = null; let wrongType = null; let mixed = false; let projectionReads = 0;
  const types = { '.html': 'text/html', '.json': 'application/json', '.txt': 'text/plain', '.xml': 'application/xml', '.webp': 'image/webp', '.png': 'image/png', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript', '.woff': 'font/woff', '.woff2': 'font/woff2', '.wasm': 'application/wasm' };
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://fixture.local');
      assert.ok(url.pathname.startsWith('/shoal-app/'));
      const path = decodeURIComponent(url.pathname.slice('/shoal-app/'.length));
      const file = !path || path.endsWith('/') ? `${path}index.html` : path;
      if (file === missing) throw new Error('Intentional missing dependency');
      let bytes = await readFile(join(copy, file));
      if (file === 'data/network.json' && ++projectionReads > 1 && mixed) {
        const projection = JSON.parse(bytes); projection.generatedAt = '2027-01-01T00:00:00.000Z'; bytes = Buffer.from(JSON.stringify(projection));
      }
      response.writeHead(200, { 'Content-Type': file === wrongType ? 'text/html' : types[extname(file)] ?? 'application/octet-stream' }); response.end(bytes);
    } catch { response.writeHead(404, { 'Content-Type': 'text/plain' }); response.end('Missing fixture artifact'); }
  });
  async function httpCheck() {
    projectionReads = 0;
    return await new Promise((accept, reject) => {
      const child = spawn(process.execPath, ['scripts/validate-seo-http.mjs', `http://127.0.0.1:${server.address().port}/shoal-app/`], { stdio: ['ignore', 'pipe', 'pipe'] });
      let text = '';
      child.stdout.on('data', (bytes) => { text += bytes; }); child.stderr.on('data', (bytes) => { text += bytes; });
      child.on('error', reject); child.on('close', (status) => accept({ status, text }));
    });
  }
  async function rejectMissing(url) {
    const path = join(copy, assetPath(url, site)); const bytes = await readFile(path); await rm(path);
    try { await assert.rejects(validateSeo(copy), /Missing public asset dependency:/); }
    finally { await writeFile(path, bytes); }
  }
  try {
    assert.deepEqual(await htmlAssetUrls('<astro-island component-url="/shoal-app/_astro/component.js" renderer-url="/shoal-app/_astro/renderer.js"></astro-island><img srcset="/shoal-app/_astro/a.webp 1x, /shoal-app/_astro/b.webp 2x">', site, site), ['component.js', 'renderer.js', 'a.webp', 'b.webp'].map((name) => `${site}_astro/${name}`));
    assert.deepEqual(await moduleAssetUrls('import x from "./static.js"; export {x} from "./export.js"; import("./dynamic.js"); import(`./literal.js`); import(`./runtime${x}.js`); // import("./comment.js")', `${site}_astro/entry.js`, site), ['static.js', 'export.js', 'dynamic.js', 'literal.js'].map((name) => `${site}_astro/${name}`));
    assert.deepEqual(await moduleAssetUrls('@import "./theme.css"; a{background:url(./image.webp)} @font-face{src:url("./font.woff2")} b{background:url(data:image/png;base64,abc)} /* url(./comment.webp) */', `${site}_astro/entry.css`, site), ['theme.css', 'image.webp', 'font.woff2'].map((name) => `${site}_astro/${name}`));
    await assert.rejects(htmlAssetUrls('<astro-island component-url="/_astro/outside.js"></astro-island>', site, site), /outside production base/);
    await assert.rejects(moduleAssetUrls('import "../../outside.js";', `${site}_astro/entry.js`, site), /outside production base/);
    await assert.rejects(moduleAssetUrls('import "unbundled-package";', `${site}_astro/entry.js`, site), /Unresolved bare/);
    const html = await readFile(join(copy, 'join/index.html'), 'utf8');
    const islands = nodes(parse(html), (node) => node.tagName === 'astro-island');
    const island = islands.find((node) => nodes(node, (child) => attribute(child, 'aria-label') === 'Join progress').length);
    assert.ok(island, 'Actual Join island is present');
    const component = new URL(attribute(island, 'component-url'), site).href;
    const renderer = new URL(attribute(island, 'renderer-url'), site).href;
    const dependencies = await moduleAssetUrls(await readFile(join(copy, assetPath(component, site)), 'utf8'), component, site);
    const shared = dependencies.find((url) => /\.js$/.test(url));
    assert.ok(shared, 'Real Join island imports a shared module');
    for (const url of [component, renderer, shared]) await rejectMissing(url);
    // Add a CSS graph reachable from real HTML. Each independent deletion must fail.
    const head = html.replace('</head>', '<link rel="stylesheet" href="/shoal-app/_astro/closure.css"></head>');
    await writeFile(join(copy, 'join/index.html'), head);
    await writeFile(join(copy, '_astro/closure.css'), '@import "./theme.css"; @font-face{src:url("./fixture.woff2")} a{background:url("./fixture.webp")}');
    await writeFile(join(copy, '_astro/theme.css'), '@import "./closure.css";');
    await writeFile(join(copy, '_astro/fixture.woff2'), 'Nonempty dependency fixture; not a font-validity assertion');
    await cp(join(copy, 'og-shoal.webp'), join(copy, '_astro/fixture.webp'));
    await validateSeo(copy); // Includes a dependency cycle: terminates without weakening checks.
    for (const name of ['closure.css', 'theme.css', 'fixture.woff2', 'fixture.webp']) await rejectMissing(`${site}_astro/${name}`);
    await new Promise((accept, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', accept); });
    const positive = await httpCheck(); assert.equal(positive.status, 0, positive.text);
    const report = JSON.parse(positive.text);
    for (const url of [component, renderer, shared, `${site}_astro/fixture.woff2`]) assert.ok(report.receipts.some((receipt) => new URL(receipt.url).pathname === new URL(url).pathname), `HTTP closure includes ${url}`);
    for (const url of [component, renderer, shared, `${site}_astro/theme.css`, `${site}_astro/fixture.woff2`]) {
      missing = assetPath(url, site); const result = await httpCheck();
      assert.notEqual(result.status, 0); assert.match(result.text, /HTTP availability:/); missing = null;
    }
    wrongType = assetPath(shared, site); const mime = await httpCheck();
    assert.notEqual(mime.status, 0); assert.match(mime.text, /Content type:/); wrongType = null;
    mixed = true; const generation = await httpCheck();
    assert.notEqual(generation.status, 0); assert.match(generation.text, /One projection generation/);
    console.log(`Asset/publication controls PASS: real Join component, renderer and shared import; CSS/import/font/image closure and cycle; missing HTTP dependencies, JavaScript MIME and mixed generation. ${report.dependencyAssets} fixture dependency assets.`);
  } finally {
    server.closeAllConnections();
    if (server.listening) await new Promise((accept) => server.close(accept));
    await rm(temporary, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await validatePublicAssets(resolve(process.argv[2] ?? 'dist'));

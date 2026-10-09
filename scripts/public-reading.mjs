// Publication mechanics: derive reading views from the finished, governed HTML.
// No independently authored product document or Reviewer assessment lives here.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'parse5';

export const site = 'https://taco3064.github.io/shoal-app/';
export const readingNotice = 'Generated from the public static HTML. External Reviewer Profile and Policy prose is omitted; follow the attributed sources. A published Network Projection is a snapshot, not live GitHub state or formal Protocol authority. Public reading grants no mutation authorization.';

export function routeInventory(projection) {
  return ['', 'how-it-works/', 'join/', 'reviewers/',
    ...projection.reviewers.map(({ username }) => `reviewers/${username}/`)];
}

export function readingFile(route) {
  return `read/${route ? route.replace(/\/$/, '') : 'index'}.txt`;
}

export function nodes(root, predicate) {
  const found = [];
  const visit = (node) => {
    if (predicate(node)) found.push(node);
    for (const child of node.childNodes ?? []) visit(child);
  };
  visit(root);
  return found;
}

export function attribute(node, name) {
  return node.attrs?.find((attr) => attr.name === name)?.value;
}

export function readingText(html, canonical) {
  const document = parse(html);
  const main = nodes(document, (node) => node.tagName === 'main');
  if (main.length !== 1) throw new Error(`Expected one main: ${canonical}`);
  const ignored = new Set(['script', 'style', 'svg', 'input', 'select', 'textarea']);
  const blocks = new Set(['p', 'div', 'section', 'article', 'header', 'footer', 'li', 'dt', 'dd', 'h1', 'h2', 'h3', 'h4', 'summary', 'pre', 'br']);
  const render = (node) => {
    if (ignored.has(node.tagName) || attribute(node, 'data-agent-omit') !== undefined
      || attribute(node, 'aria-hidden') === 'true') return '';
    if (node.nodeName === '#text') return node.value.replace(/\s+/g, ' ');
    if (node.tagName === 'pre' && attribute(node, 'data-language') === 'mermaid') return '';
    if (node.tagName === 'code' || node.tagName === 'pre') {
      const literal = (value) => value.nodeName === '#text' ? value.value : (value.childNodes ?? []).map(literal).join('');
      return ` ${literal(node)} `;
    }
    const content = (node.childNodes ?? []).map(render).join('');
    if (node.tagName === 'a') {
      const href = attribute(node, 'href');
      const url = href ? new URL(href, canonical) : null;
      return url?.protocol === 'https:' ? `${content} <${url.href}>` : content;
    }
    if (blocks.has(node.tagName)) return `\n${content}\n`;
    return ['strong', 'span', 'code', 'time'].includes(node.tagName) ? ` ${content} ` : content;
  };
  const text = render(main[0]).split('\n').map((line) => line.trim().replace(/ +/g, ' ')).filter(Boolean).join('\n\n');
  return `Source: ${canonical}\n\n${readingNotice}\n\n${text}\n`;
}

export function discoveryText(projection) {
  const links = [
    ['Shoal', ''], ['Review and Re-review definitions', 'how-it-works/'],
    ['One Join journey: Web-assisted and Local / CLI', 'join/'],
    ['Published Reviewer Directory', 'reviewers/'],
  ];
  return `# Shoal\n\nPublic, policy-driven repository review network. Request Review is not Request Star.\n\n${readingNotice}\n\n## Public explanations\n${links.map(([label, route]) => `- [${label}](${site}${route}) — [plain text](${site}${readingFile(route)})`).join('\n')}\n\n## Published Reviewer facts\n- [Existing Network Projection](${site}data/network.json): sole published listing source; generated ${projection.generatedAt}.\n- Every projected Reviewer has a linked detail page in the Directory, with Policy source, Repository ID, readiness, accepted Summary status and provenance. Current means the latest completed qualifying Attempt was accepted, not live metrics; fallback is stale; unavailable has no metrics.\n\nThese reading files are a convenience, not another Product BR, Protocol or trust anchor. No agent action, credential or mutation permission is granted. Search appearance and model comprehension are not guaranteed.\n`;
}

export async function generateReading(output) {
  // The endpoint has already loaded and validated the projection through its owner.
  const projection = JSON.parse(await readFile(join(output, 'data/network.json'), 'utf8'));
  for (const route of routeInventory(projection)) {
    const html = await readFile(join(output, route, 'index.html'), 'utf8');
    const file = join(output, readingFile(route));
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, readingText(html, `${site}${route}`));
  }
  await writeFile(join(output, 'llms.txt'), discoveryText(projection));
}

export function publicReading() {
  return {
    name: 'shoal-public-reading',
    hooks: {
      'astro:build:done': async ({ dir }) => generateReading(fileURLToPath(dir)),
    },
  };
}

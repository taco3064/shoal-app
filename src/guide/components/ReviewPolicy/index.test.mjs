// Component regression: emit checked markup for the publication validator.
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { parse } from 'parse5';
import ReviewPolicy from './index.tsx';

const policyUrl = process.argv[2];
assert.ok(policyUrl, 'Pinned Policy URL is required');
const attribute = (node, name) => node.attrs?.find((attr) => attr.name === name)?.value;
function nodes(root, predicate) {
  return [ ...(predicate(root) ? [root] : []), ...(root.childNodes ?? []).flatMap((node) => nodes(node, predicate)) ];
}
const markdown = [
  '# External **Policy**', '## Criteria *two*', '### Third', '#### Fourth',
  '##### Fifth', '###### Sixth', '# Another top heading',
  'Reviewer prose must stay out of the platform reading derivative.',
  '[Pinned relative](docs/criteria.md) [Source fragment](#criteria)',
  '[Unsafe](javascript:alert%281%29)', '![Policy diagram](diagram.png)',
  '<script>alert("external")</script>',
].join('\n\n');
const rendered = renderToStaticMarkup(createElement(ReviewPolicy, { markdown, policyUrl: policyUrl }));
const document = parse(rendered);
const headings = nodes(document, (node) => /^h[1-6]$/.test(node.tagName ?? ''));
assert.deepEqual(headings.map((node) => node.tagName), ['h3', 'h4', 'h5', 'h6', 'h6', 'h6', 'h3']);
const text = (node) => node.nodeName === '#text' ? node.value : (node.childNodes ?? []).map(text).join('');
assert.deepEqual(headings.map(text), ['External Policy', 'Criteria two', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Another top heading']);
assert.match(rendered, /<strong>Policy<\/strong>/);
assert.match(rendered, /<em>two<\/em>/);
const anchors = nodes(document, (node) => node.tagName === 'a');
const directory = policyUrl.slice(0, -'README.md'.length);
assert.equal(attribute(anchors[0], 'href'), new URL('docs/criteria.md', directory).href);
assert.equal(attribute(anchors[1], 'href'), `${policyUrl}#criteria`);
assert.ok(!attribute(anchors[2], 'href'));
assert.equal(attribute(nodes(document, (node) => node.tagName === 'img')[0], 'src'),
  new URL('diagram.png', directory).href.replace(/^https:\/\/github\.com\/([^/]+\/[^/]+)\/blob\//, 'https://raw.githubusercontent.com/$1/'));
assert.equal(nodes(document, (node) => node.tagName === 'script').length, 0);
assert.ok(markdown.startsWith('# External **Policy**'), 'Source Markdown remains intact');
console.log(JSON.stringify({ rendered }));

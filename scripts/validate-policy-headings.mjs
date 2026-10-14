// Consume actual component output without creating a tooling/source import edge.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { validatePage, validateReadingSemantics } from './validate-seo.mjs';
import { readingText, site } from './public-reading.mjs';

const output = resolve(process.argv[2] ?? 'dist');
const projection = JSON.parse(await readFile(join(output, 'data/network.json'), 'utf8'));
assert.ok(projection.reviewers.length, 'Regression requires a built Reviewer page');
const reviewer = projection.reviewers[0];
const route = `reviewers/${reviewer.username}/`;
const original = await readFile(join(output, route, 'index.html'), 'utf8');
const placeholder = '<p>Policy content is unavailable in this build; inspect the pinned source.</p>';
assert.equal(original.split(placeholder).length, 2, 'Exactly one Policy insertion surface');
const { rendered } = JSON.parse(execFileSync(process.execPath,
  ['--import', 'tsx', 'src/guide/components/ReviewPolicy/index.test.mjs', reviewer.policyUrl],
  { encoding: 'utf8', timeout: 30000 }));
const html = original.replace(placeholder, rendered);
validatePage(html, route, projection);
const reading = readingText(html, `${site}${route}`);
validateReadingSemantics(html, reading, route, projection);
assert.equal(reading, readingText(original, `${site}${route}`), 'External Policy never becomes platform reading prose');
assert.throws(() => validatePage(original.replace(placeholder, '<h1>Raw external heading</h1>'), route, projection),
  (error) => error.code === 'ERR_ASSERTION' && error.message.includes(`One H1: ${route}`));
console.log('Policy heading regression PASS: rendered hierarchy, page SEO, reading boundary, links, escaping, extra-H1 negative control.');

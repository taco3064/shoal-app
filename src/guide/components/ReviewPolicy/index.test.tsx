import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ReviewPolicy from './index';

test('renders policy Markdown without executing embedded HTML or unsafe links', () => {
  const html = renderToStaticMarkup(createElement(ReviewPolicy, {
    policyUrl: `https://github.com/reviewer/station/blob/${'a'.repeat(40)}/README.md`,
    markdown: '# My standards\n\n<script>alert(1)</script>\n\n[bad](javascript:alert(1))',
  }));

  assert.match(html, /My standards/);
  assert.doesNotMatch(html, /<script|href="javascript:/);
});

test('keeps Policy destinations while isolating external navigation', () => {
  const policyUrl = `https://github.com/reviewer/station/blob/${'a'.repeat(40)}/README.md`;

  const html = renderToStaticMarkup(createElement(ReviewPolicy, {
    policyUrl,
    markdown: '[source](./src) [section](#criteria) [website](https://example.com)',
  }));

  assert.match(html, new RegExp(`href="${policyUrl.replace('README.md', 'src')}"`));
  assert.ok(html.includes(`href="${policyUrl}#criteria"`));
  assert.match(html, /href="https:\/\/example.com"/);
  assert.equal((html.match(/target="_blank" rel="noopener noreferrer"/g) ?? []).length, 3);
  assert.equal((html.match(/class="button external"/g) ?? []).length, 3);
});

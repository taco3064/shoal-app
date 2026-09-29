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

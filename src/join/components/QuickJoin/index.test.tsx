import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type useQuickJoin from '~app/join/hooks/useQuickJoin';
import QuickJoin from './index';

function state(): ReturnType<typeof useQuickJoin> {
  return {
    session: undefined,
    inspection: undefined,
    executionStages: undefined,
    job: undefined,
    policyPlan: undefined,
    policyChoice: 'keep',
    content: '',
    error: '',
    busy: false,
    authenticating: false,
    stale: false,
    enabled: true,
    configured: true,
    authenticate: () => {},
    refresh: async () => {},
    previewPolicy: async () => {},
    logout: async () => {},
    openExternal: () => {},
    execute: () => {},
    confirmPolicy: () => {},
    cancelAuth: () => {},
    choosePolicy: () => {},
    editPolicy: () => {},
  };
}

test('public Join does not require authentication or replace the local path', () => {
  const html = renderToStaticMarkup(
    createElement(QuickJoin, { join: state() }),
  );

  assert.match(html, /Sign in with GitHub/);
  assert.match(html, /Public browsing stays open/);
  assert.match(html, /Local \/ CLI Join/);
  assert.doesNotMatch(html, /<dialog|Station status/);
});

test('partial failure shows frozen verified progress rather than success', () => {
  const join = state();

  join.job = {
    status: 'failed',
    progress: { completed: 1, total: 3, verifiedOperations: ['enable_issues'] },
  };

  join.session = {
    session: 'opaque',
    csrfToken: 'csrf',
    identity: { id: 1, login: 'reviewer' },
  };

  const html = renderToStaticMarkup(createElement(QuickJoin, { join }));

  assert.match(html, /<progress value="1" max="3"/);
  assert.match(html, /Progress is frozen at the last verified operation/);
  assert.match(html, /Refresh and retry remaining work/);
  assert.doesNotMatch(html, /Your station is ready/);
});

test('readiness publication lag and Policy confirmation remain separate', () => {
  const join = state();

  join.inspection = {
    planId: 'plan',
    identity: { id: 1, login: 'reviewer' },
    node: {
      id: 2,
      fullName: 'reviewer/station',
      head: 'head',
      url: 'https://github.com/reviewer/station',
    },
    rootHead: 'root',
    rootOwner: false,
    stages: [],
    operations: [],
    ready: true,
    policy: { current: '# Mine', default: '# Default', isDefault: false },
  };

  join.policyChoice = 'custom';
  join.content = '<script>bad()</script>\n\n[bad](javascript:bad())';

  join.policyPlan = {
    planId: 'policy',
    content: join.content,
    changes: true,
    head: 'head',
  };

  const html = renderToStaticMarkup(createElement(QuickJoin, { join }));

  assert.match(html, /Your station is ready/);
  assert.match(html, /Directory publication is waiting/);
  assert.match(html, /Confirm Policy choice/);
  assert.match(html, /Exact confirmed Markdown/);
  assert.doesNotMatch(html, /<script|href="javascript:/);
});

test('ready station still shows pending Web activation setup', () => {
  const join = state();

  join.inspection = {
    planId: 'plan',
    identity: { id: 1, login: 'reviewer' },
    rootHead: 'root',
    rootOwner: false,
    stages: [],
    operations: [
      { id: 'enable_actions', label: 'Enable repository Actions' },
      { id: 'enable_workflow', label: 'Activate canonical Reviewer Summary Workflow' },
    ],
    ready: true,
  };

  const html = renderToStaticMarkup(createElement(QuickJoin, { join }));

  assert.match(html, /Your station is ready/);
  assert.match(html, /Quick Web Join setup is still pending/);
  assert.match(html, /Complete remaining setup automatically/);
  assert.match(html, /does not prove Workflow executability/);
  assert.doesNotMatch(html, /No setup commit or settings mutation is needed/);
});

test('Root owner receives inline short-circuit without fork action', () => {
  const join = state();

  join.session = {
    session: 'opaque',
    csrfToken: 'csrf',
    identity: { id: 1, login: 'taco3064' },
  };

  join.inspection = {
    planId: 'plan',
    identity: { id: 1, login: 'taco3064' },
    rootOwner: true,
    rootHead: 'root',
    stages: [],
    operations: [],
    ready: false,
  };

  const html = renderToStaticMarkup(createElement(QuickJoin, { join }));

  assert.match(html, /Signed in as/);
  assert.match(html, /Network Root owner/);
  assert.match(html, /Quick Web Join is not required/);
  assert.doesNotMatch(html, /Create your direct fork/);
  assert.doesNotMatch(html, /Complete remaining setup automatically/);
});

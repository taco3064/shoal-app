import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type useQuickJoin from '~app/join/hooks/useQuickJoin';
import { resolveJoinServiceUrl } from '~app/join/services/join_client';
import type { Stage } from '~app/join/services/join_client';
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

function stages(overrides: Partial<Record<string, Partial<Stage>>> = {}): Stage[] {
  const base: Stage[] = [
    {
      id: 'identity',
      label: 'GitHub identity',
      state: 'complete',
      detail: 'reviewer',
    },
    {
      id: 'node',
      label: 'Reviewer Node / direct fork',
      state: 'complete',
      detail: 'reviewer/station',
    },
    {
      id: 'access',
      label: 'GitHub App repository access',
      state: 'complete',
      detail: 'Installed',
    },
    {
      id: 'station',
      label: 'Station setup',
      state: 'complete',
      detail: 'Station facts are verified.',
    },
    {
      id: 'policy',
      label: 'Review Policy',
      state: 'available',
      detail: 'Review your Policy.',
      action: 'policy',
    },
    {
      id: 'ready',
      label: 'Station ready / publication waiting',
      state: 'complete',
      detail: 'Station readiness is verified.',
    },
  ];

  return base.map((stage) => ({ ...stage, ...overrides[stage.id] }));
}

test('public Join shows one staged journey with colocated local guidance', () => {
  const html = renderToStaticMarkup(
    createElement(QuickJoin, { join: state() }),
  );

  assert.match(html, /Sign in with GitHub/);
  assert.match(html, /Public browsing stays open/);
  assert.match(html, /Local \/ CLI setup remains available inside the same stages/);
  assert.match(html, /Local \/ CLI mode/);
  assert.match(html, /Website auth optional/);
  assert.match(html, /Local path: gh shoal init/);
  assert.match(html, /GitHub identity/);
  assert.match(html, /Reviewer Node \/ direct fork/);
  assert.match(html, /GitHub App repository access/);
  assert.match(html, /Station setup/);
  assert.match(html, /Review Policy/);
  assert.match(html, /Station ready \/ publication waiting/);
  assert.doesNotMatch(html, /Verified/);
  assert.doesNotMatch(html, /<dialog|Station status/);
  assert.doesNotMatch(html, /Prefer local setup|Local \/ CLI Join/);
});

test('localhost without public env still enables the default local Worker', () => {
  assert.equal(
    resolveJoinServiceUrl('', { protocol: 'http:', hostname: 'localhost' }),
    'http://127.0.0.1:8787',
  );

  assert.equal(
    resolveJoinServiceUrl('', { protocol: 'http:', hostname: '127.0.0.1' }),
    'http://127.0.0.1:8787',
  );

  assert.equal(
    resolveJoinServiceUrl('', {
      protocol: 'https:',
      hostname: 'taco3064.github.io',
    }),
    '',
  );

  assert.equal(
    resolveJoinServiceUrl('https://join.example.test', {
      protocol: 'https:',
      hostname: 'taco3064.github.io',
    }),
    'https://join.example.test',
  );
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
    stages: stages(),
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

  assert.match(html, /Station ready \/ publication waiting/);
  assert.match(html, /Directory publication waits/);
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
    stages: stages({
      station: {
        state: 'current',
        action: 'execute',
        detail: 'Shoal can complete the remaining station setup.',
      },
      policy: { state: 'waiting', action: undefined },
      ready: { state: 'waiting' },
    }),
    operations: [
      { id: 'enable_actions', label: 'Enable repository Actions' },
      { id: 'enable_workflow', label: 'Activate canonical Reviewer Summary Workflow' },
    ],
    ready: true,
  };

  const html = renderToStaticMarkup(createElement(QuickJoin, { join }));

  assert.match(html, /Station setup/);
  assert.match(html, /Complete setup automatically/);
  assert.match(html, /Technical readback for this setup plan/);
  assert.doesNotMatch(html, /Confirm Policy choice/);
  assert.match(html, /Station ready \/ publication waiting/);
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

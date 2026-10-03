import { test, expect } from '@playwright/test';

const headers = {
  'Access-Control-Allow-Origin': 'http://127.0.0.1:4322',
  'Access-Control-Allow-Headers': 'Authorization,Content-Type,X-CSRF-Token',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
};

test('Quick Web Join renders one inline journey and verifies recovery and Policy intent', async ({ page, context }, testInfo) => {
  let phase = 'fork';
  let cancel = true;
  let executes = 0;
  let poll = 0;
  let jobKind = 'station';
  let policyWrites = 0;
  let policyJobs = 0;
  let policyContent = '# Existing Policy';
  let proposedPolicy = '';
  let policyNoop = false;
  let stalePolicy = false;
  let policyBlocked = false;
  const errors = [];
  const plansExecuted = [];
  const policyInputs = [];

  page.on('pageerror', (error) => errors.push(error.message));

  async function expectNoHorizontalOverflow() {
    expect(await page.locator('.quick-join').evaluate((element) =>
      element.scrollWidth <= element.clientWidth,
    )).toBe(true);
    expect(await page.evaluate(() =>
      document.documentElement.scrollWidth <= window.innerWidth,
    )).toBe(true);
  }

  async function attachViewport(name, width, height = 900) {
    await page.setViewportSize({ width, height });
    await expect(page.getByRole('heading', { name: 'Current onboarding journey' })).toBeVisible();
    await expectNoHorizontalOverflow();
    await testInfo.attach(`${name}-${width}`, {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    });
  }

  const snapshot = () => ({
    planId: `fresh-${phase}`,
    identity: { id: 1, login: 'reviewer' },
    repository: phase === 'fork'
      ? null
      : { id: 2, fullName: 'reviewer/station', defaultBranch: 'main' },
    rootOwner: false,
    rootHead: 'a'.repeat(40),
    nodeHead: 'b'.repeat(40),
    waiting: phase === 'fork' ? 'fork' : phase === 'access' ? 'app_access' : null,
    ...(phase === 'access'
      ? { installationUrl: 'https://github.com/apps/shoal/installations/new' }
      : {}),
    appAccess: phase !== 'fork' && phase !== 'access',
    issuesEnabled: phase === 'ready' || phase === 'failed',
    actionsEnabled: phase === 'ready',
    managedFilesMatch: true,
    workflowActive: true,
    workflowSupported: true,
    platformBlocked: false,
    policy: {
      content: policyContent,
      defaultContent: '# Default Policy',
      matchesDefault: policyContent === '# Default Policy',
    },
    operations: phase === 'setup'
      ? ['enable_issues', 'enable_actions']
      : phase === 'failed' ? ['enable_actions'] : [],
    ready: phase === 'ready',
    publication: 'waiting_for_projection',
  });

  await context.route('https://github.com/**', async (route) => {
    await route.fulfill({
      contentType: 'text/html',
      body: '<title>GitHub external step</title><main>External GitHub step</main>',
    });
  });

  await context.route('https://join.example/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers });
      return;
    }

    if (url.pathname === '/auth/start') {
      const message = cancel
        ? { type: 'shoal-auth-cancelled' }
        : { type: 'shoal-auth', code: 'single-use-handoff' };

      await route.fulfill({
        contentType: 'text/html',
        body: `<script>window.opener.postMessage(${JSON.stringify(message)},'http://127.0.0.1:4322')</script>`,
      });
      return;
    }

    let value;

    if (url.pathname === '/api/session') {
      value = { session: 'opaque', csrfToken: 'csrf', identity: { id: 1, login: 'reviewer' } };
    } else if (url.pathname === '/api/inspect') {
      value = snapshot();
    } else if (url.pathname === '/api/execute') {
      const input = request.postDataJSON();
      expect(input).toEqual({ planId: `fresh-${phase}` });
      plansExecuted.push(input.planId);
      executes += 1;
      poll = 0;
      jobKind = 'station';
      value = { jobId: `station-${executes}` };
    } else if (url.pathname === '/api/status') {
      value = statusResponse();
    } else if (url.pathname === '/api/policy/plan') {
      const input = request.postDataJSON();
      expect(input.planId).toBe('fresh-ready');
      policyInputs.push(input);
      proposedPolicy = input.choice === 'keep'
        ? policyContent
        : input.choice === 'default' ? '# Default Policy' : input.content;
      policyNoop = proposedPolicy === policyContent;
      value = {
        planId: 'policy', content: proposedPolicy, noop: policyNoop,
        nodeHead: 'b'.repeat(40), rootHead: 'a'.repeat(40),
      };
    } else if (url.pathname === '/api/policy/confirm') {
      expect(request.postDataJSON()).toEqual({ planId: 'policy' });
      policyBlocked = stalePolicy;
      stalePolicy = false;
      if (!policyBlocked) {
        if (!policyNoop) policyWrites += 1;
        policyContent = proposedPolicy;
      }
      jobKind = 'policy';
      policyJobs += 1;
      value = { jobId: `policy-${policyJobs}` };
    } else {
      value = {};
    }

    await route.fulfill({
      headers,
      contentType: 'application/json',
      body: JSON.stringify(value),
    });
  });

  function statusResponse() {
    poll += 1;

    if (jobKind === 'policy') {
      if (policyBlocked) {
        return {
          status: 'blocked',
          progress: { completed: 0, total: 1, verifiedOperations: [] },
          error: {
            code: 'STALE_PLAN',
            message: 'Concurrent README change: review refreshed Policy',
          },
        };
      }

      return {
        status: 'complete',
        progress: {
          completed: policyNoop ? 0 : 1,
          total: policyNoop ? 0 : 1,
          verifiedOperations: policyNoop ? [] : ['write_policy'],
        },
        result: { inspection: snapshot() },
      };
    }

    if (executes === 1) {
      return {
        status: 'blocked',
        progress: { completed: 0, total: 2, verifiedOperations: [] },
        error: { code: 'STALE_PLAN', message: 'Concurrent branch change: refresh first' },
      };
    }

    if (executes === 2 && poll === 1) {
      return {
        status: 'running',
        progress: {
          completed: 0,
          total: 2,
          verifiedOperations: [],
          currentOperation: 'enable_issues',
          operations: [
            { name: 'enable_issues', state: 'executing' },
            { name: 'enable_actions', state: 'queued' },
          ],
        },
      };
    }

    if (executes === 2) {
      phase = 'failed';

      return {
        status: 'failed',
        progress: { completed: 1, total: 2, verifiedOperations: ['enable_issues'] },
        error: { code: 'EXECUTION_STOPPED', message: 'Controlled failure' },
      };
    }

    phase = 'ready';

    return {
      status: 'complete',
      progress: { completed: 1, total: 1, verifiedOperations: ['enable_actions'] },
      result: { inspection: snapshot() },
    };
  }

  await page.goto('join/');
  await testInfo.attach('unauthenticated-desktop-journey', {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  });
  await expect(page.locator('summary', { hasText: 'Prefer local setup? Use Local / CLI Join' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Local / CLI Join', exact: true })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Join Shoal', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Current onboarding journey' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign in with GitHub', exact: true })).toBeEnabled();
  await expect(page.getByText('Reviewer Node / direct fork')).toBeVisible();
  await expect(page.locator('.quick-map-local')).toHaveCount(6);
  await page
    .getByRole('button', {
      name: 'Show Local / CLI instructions for Reviewer Node / direct fork',
    })
    .click();
  await expect(
    page.locator('.quick-current-step[data-local="true"]'),
  ).toBeVisible();
  await expect(page.getByRole('heading', {
    name: 'Reviewer Node / direct fork',
  })).toBeVisible();
  await expect(page.locator('.quick-current-step').getByText('Directly fork')).toBeVisible();
  await expect(page.locator('.quick-current-step').getByText('not qualify')).toBeVisible();
  await page
    .getByRole('button', {
      name: 'Show Local / CLI instructions for Station setup',
    })
    .click();
  await expect(page).toHaveURL(/localStage=station/);
  await expect(page.getByRole('heading', { name: 'Station setup' })).toBeVisible();
  await expect(page.getByText('gh shoal init')).toBeVisible();
  await page.goto('how-it-works/');
  await expect(page.locator('main h1')).toBeVisible();
  await page.goto('join/?localStage=station');
  await expect(page.locator('.quick-current-step[data-local="true"]')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Station setup' })).toBeVisible();
  await expect(page.getByText('Station ready / publication waiting')).toBeVisible();
  await expect(page.getByText('Verified')).toHaveCount(0);
  await attachViewport('unauthenticated-journey', 1024);
  await attachViewport('unauthenticated-journey', 768);
  await attachViewport('unauthenticated-journey', 390, 844);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page
    .getByRole('button', {
      name: 'Show Local / CLI instructions for Station setup',
    })
    .click();
  await expect(page).not.toHaveURL(/localStage=station/);
  await page.getByRole('button', { name: 'Sign in with GitHub', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('cancelled');
  await expect(page.getByRole('dialog', { name: 'Station status' })).toHaveCount(0);
  await page.goto('how-it-works/');
  await expect(page.locator('main h1')).toBeVisible();
  await page.goto('join/');

  cancel = false;
  await page.getByRole('button', { name: 'Sign in with GitHub', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Create direct fork' })).toBeVisible();
  await testInfo.attach('waiting-for-fork-desktop', {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('button', { name: 'Create direct fork' })).toBeVisible();
  await testInfo.attach('waiting-for-fork-mobile', {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  });
  await page.setViewportSize({ width: 1280, height: 900 });

  phase = 'access';
  const forkPopup = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Create direct fork' }).click();
  await (await forkPopup).close();
  await expect(page.getByRole('button', { name: 'Grant App access' })).toBeVisible();
  await testInfo.attach('app-access-current-step', {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  });

  phase = 'setup';
  await page.getByRole('button', { name: 'Refresh status', exact: true }).click();
  await expect(page.getByText('gh shoal init')).toBeVisible();
  await testInfo.attach('station-setup-mixed-diagnostics', {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  });
  await page.getByRole('button', { name: 'Complete setup automatically' }).click();
  await expect(page.getByRole('alert')).toContainText('Concurrent branch change');
  await expect(page.getByText('The confirmed plan is stale.', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Complete setup automatically' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Refresh and retry remaining work' }).click();
  await page.getByRole('button', { name: 'Complete setup automatically' }).click();
  await expect(page.locator('progress')).toHaveAttribute('value', '0');
  await expect(page.locator('progress')).toHaveAttribute('max', '2');
  await testInfo.attach('automatic-execution-in-progress', {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  });
  await expect(page.getByRole('alert')).toHaveText('Controlled failure');
  await expect(page.locator('progress')).toHaveAttribute('value', '1');
  await expect(page.locator('progress')).toHaveAttribute('max', '2');
  await testInfo.attach('controlled-failure-retry', {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  });

  await page.getByRole('button', { name: 'Refresh and retry remaining work' }).click();
  await page.getByRole('button', { name: 'Complete setup automatically' }).click();
  await expect(page.getByText('Station ready / publication waiting')).toBeVisible();
  await expect(page.locator('progress')).toHaveAttribute('max', '1');
  await expect(page.getByText('Directory publication waits', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Refresh status', exact: true })).toBeEnabled();
  await testInfo.attach('policy-step', {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  });

  await page.getByRole('button', { name: 'Review Policy choice' }).click();
  await expect(page.getByRole('button', { name: 'Confirm Policy choice' })).toBeVisible();
  await page.getByRole('button', { name: 'Confirm Policy choice' }).click();
  await expect(page.locator('progress')).toHaveAttribute('value', '0');
  await expect(page.getByRole('button', { name: 'Refresh status', exact: true })).toBeEnabled();
  expect(policyWrites).toBe(0);

  await page.getByRole('radio', { name: 'Customize Policy' }).check();
  await page.getByRole('textbox', { name: 'Policy Markdown' }).fill('# My confirmed standard\n\nOnly testable work.');
  await page.getByRole('button', { name: 'Review Policy choice' }).click();
  await expect(page.getByRole('heading', { name: 'My confirmed standard' })).toBeVisible();
  stalePolicy = true;
  await page.getByRole('button', { name: 'Confirm Policy choice' }).click();
  await expect(page.getByRole('alert')).toContainText('Concurrent README change');
  await expect(page.getByRole('button', { name: 'Confirm Policy choice' })).toHaveCount(0);
  expect(policyWrites).toBe(0);

  await page.getByRole('button', { name: 'Refresh and retry remaining work' }).click();
  await page.getByRole('radio', { name: 'Customize Policy' }).check();
  await page.getByRole('textbox', { name: 'Policy Markdown' }).fill('# My confirmed standard\n\nOnly testable work.');
  await page.getByRole('button', { name: 'Review Policy choice' }).click();
  await page.getByRole('button', { name: 'Confirm Policy choice' }).click();
  await expect(page.locator('progress')).toHaveAttribute('value', '1');
  expect(policyWrites).toBe(1);
  expect(policyInputs.at(-1)).toEqual({
    planId: 'fresh-ready',
    choice: 'custom',
    content: '# My confirmed standard\n\nOnly testable work.',
  });

  policyContent = '# Default Policy';
  await page.getByRole('button', { name: 'Refresh status', exact: true }).click();
  await page.getByRole('button', { name: 'Review Policy choice' }).click();
  await page.getByRole('button', { name: 'Confirm Policy choice' }).click();
  await expect(page.getByRole('button', { name: 'Refresh status', exact: true })).toBeEnabled();
  expect(policyWrites).toBe(1);
  expect(policyInputs.at(-1).choice).toBe('default');

  await page.getByRole('button', { name: 'Refresh status', exact: true }).click();
  await expect(page.getByText('Station ready / publication waiting')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Complete setup automatically' })).toHaveCount(0);
  expect(executes).toBe(3);
  expect(plansExecuted).toEqual(['fresh-setup', 'fresh-setup', 'fresh-failed']);
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => ({
    local: localStorage.length,
    session: sessionStorage.length,
  }))).toEqual({ local: 0, session: 0 });
  await testInfo.attach('final-completed-publication-waiting', {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  });
  await attachViewport('final-completed', 1024);
  await attachViewport('final-completed', 768);
  await attachViewport('final-completed', 390, 844);
});

test('Quick Web Join short-circuits the Network Root owner inline', async ({ page, context }, testInfo) => {
  await context.route('https://join.example/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers });
    } else if (url.pathname === '/auth/start') {
      await route.fulfill({
        contentType: 'text/html',
        body: '<script>window.opener.postMessage({type:"shoal-auth",code:"handoff"},"http://127.0.0.1:4322")</script>',
      });
    } else if (url.pathname === '/api/session') {
      await route.fulfill({
        headers,
        contentType: 'application/json',
        body: JSON.stringify({
          session: 'opaque',
          csrfToken: 'csrf',
          identity: { id: 1, login: 'taco3064' },
        }),
      });
    } else if (url.pathname === '/api/inspect') {
      await route.fulfill({
        headers,
        contentType: 'application/json',
        body: JSON.stringify({
          planId: 'root',
          identity: { id: 1, login: 'taco3064' },
          repository: null,
          rootOwner: true,
          rootHead: 'a'.repeat(40),
          nodeHead: null,
          waiting: null,
          appAccess: false,
          issuesEnabled: false,
          actionsEnabled: false,
          managedFilesMatch: false,
          workflowActive: false,
          workflowSupported: false,
          platformBlocked: false,
          policy: { content: '', defaultContent: '# Default', matchesDefault: false },
          operations: [],
          ready: false,
          publication: 'waiting_for_projection',
        }),
      });
    } else {
      await route.fulfill({
        headers,
        contentType: 'application/json',
        body: '{}',
      });
    }
  });

  await page.goto('join/');
  await expect(page.getByRole('button', { name: 'Sign in with GitHub' })).toBeEnabled();
  await page.getByRole('button', { name: 'Sign in with GitHub' }).click();
  await expect(page.getByRole('heading', { name: 'Network Root owner' })).toBeVisible();
  await expect(page.getByText('Quick Web Join is not required')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create direct fork' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Complete setup automatically' })).toHaveCount(0);
  await testInfo.attach('root-owner-short-circuit', {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  });
});

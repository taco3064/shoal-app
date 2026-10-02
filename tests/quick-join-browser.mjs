import { test, expect } from '@playwright/test';

// This exercises the actual hydrated Website with an explicit service mock.
// It proves browser behavior, never live GitHub mutation or deployment readiness.
test('Quick Web Join keeps public access and verifies recovery and Policy intent', async ({ page, context }, testInfo) => {
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

  const snapshot = () => ({
    planId: `fresh-${phase}`,
    identity: { id: 1, login: 'reviewer' },
    repository: phase === 'fork'
      ? null
      : { id: 2, fullName: 'reviewer/station', defaultBranch: 'main' },
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

  await context.route('https://join.example/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const headers = {
      'Access-Control-Allow-Origin': 'http://127.0.0.1:4322',
      'Access-Control-Allow-Headers': 'Authorization,Content-Type,X-CSRF-Token',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    };

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
      poll += 1;

      if (jobKind === 'policy') {
        if (policyBlocked) {
          value = {
            status: 'blocked',
            progress: { completed: 0, total: 1, verifiedOperations: [] },
            error: { code: 'STALE_PLAN', message: 'Concurrent README change: review refreshed Policy' },
          };
          await route.fulfill({ headers, contentType: 'application/json', body: JSON.stringify(value) });
          return;
        }
        value = {
          status: 'complete',
          progress: {
            completed: policyNoop ? 0 : 1,
            total: policyNoop ? 0 : 1,
            verifiedOperations: policyNoop ? [] : ['write_policy'],
          },
          result: { inspection: snapshot() },
        };
      } else if (executes === 1) {
        value = {
          status: 'blocked',
          progress: { completed: 0, total: 2, verifiedOperations: [] },
          error: { code: 'STALE_PLAN', message: 'Concurrent branch change: refresh first' },
        };
      } else if (executes === 2 && poll === 1) {
        value = {
          status: 'running',
          progress: {
            completed: 0, total: 2, verifiedOperations: [],
            currentOperation: 'enable_issues',
            operations: [
              { name: 'enable_issues', state: 'executing' },
              { name: 'enable_actions', state: 'queued' },
            ],
          },
        };
      } else if (executes === 2) {
        phase = 'failed';
        value = {
          status: 'failed',
          progress: { completed: 1, total: 2, verifiedOperations: ['enable_issues'] },
          error: { code: 'EXECUTION_STOPPED', message: 'Controlled failure' },
        };
      } else {
        phase = 'ready';
        value = {
          status: 'complete',
          progress: { completed: 1, total: 1, verifiedOperations: ['enable_actions'] },
          result: { inspection: snapshot() },
        };
      }
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

    await route.fulfill({ headers, contentType: 'application/json', body: JSON.stringify(value) });
  });

  await page.goto('join/');
  await expect(page.getByRole('heading', { name: 'Local / CLI Join', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Join Shoal', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Continue with GitHub', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('cancelled');
  await expect(page.getByRole('dialog', { name: 'Station status' })).toHaveJSProperty('open', true);
  await page.getByRole('button', { name: 'Close station status', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Local / CLI Join', exact: true })).toBeVisible();
  await page.goto('how-it-works/');
  await expect(page.locator('main h1')).toBeVisible();
  await page.goto('join/');

  cancel = false;
  await page.getByRole('button', { name: 'Continue with GitHub', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Create your direct fork on GitHub' })).toBeVisible();
  phase = 'access';
  await page.getByRole('button', { name: 'Refresh GitHub state', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Grant App access to this Reviewer Node' })).toBeVisible();
  phase = 'setup';
  await page.getByRole('button', { name: 'Refresh GitHub state', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm these setup operations' }).click();
  await expect(page.getByRole('alert')).toContainText('Concurrent branch change');
  await expect(page.getByText('The confirmed plan is stale.', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Confirm these setup operations' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Refresh and retry remaining work' }).click();
  await page.getByRole('button', { name: 'Confirm these setup operations' }).click();
  await expect(page.locator('progress')).toHaveAttribute('value', '0');
  await expect(page.locator('progress')).toHaveAttribute('max', '2');
  await expect(page.getByRole('alert')).toHaveText('Controlled failure');
  await expect(page.locator('progress')).toHaveAttribute('value', '1');
  await expect(page.locator('progress')).toHaveAttribute('max', '2');
  await testInfo.attach('partial-failure', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });

  await page.getByRole('button', { name: 'Refresh and retry remaining work' }).click();
  await page.getByRole('button', { name: 'Confirm these setup operations' }).click();
  await expect(page.getByRole('heading', { name: 'Your station is ready' })).toBeVisible();
  await expect(page.locator('progress')).toHaveAttribute('max', '1');
  await expect(page.getByText('Directory publication is waiting', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Refresh GitHub state', exact: true })).toBeEnabled();

  // Keeping an existing Policy explicitly confirms a no-op, not a fake write.
  await page.getByRole('button', { name: 'Review Policy choice' }).click();
  await expect(page.getByRole('button', { name: 'Confirm Policy choice' })).toBeVisible();
  await page.getByRole('button', { name: 'Confirm Policy choice' }).click();
  await expect(page.locator('progress')).toHaveAttribute('value', '0');
  await expect(page.getByRole('button', { name: 'Refresh GitHub state', exact: true })).toBeEnabled();
  expect(policyWrites).toBe(0);

  await page.getByRole('radio', { name: 'Customize Policy' }).check();
  await page.getByRole('textbox', { name: 'Policy Markdown' }).fill('# My confirmed standard\n\nOnly testable work.');
  await page.getByRole('button', { name: 'Review Policy choice' }).click();
  await expect(page.getByRole('button', { name: 'Confirm Policy choice' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'My confirmed standard' })).toBeVisible();
  expect(policyWrites).toBe(0);
  stalePolicy = true;
  await page.getByRole('button', { name: 'Confirm Policy choice' }).click();
  await expect(page.getByRole('alert')).toContainText('Concurrent README change');
  await expect(page.locator('progress')).toHaveAttribute('value', '0');
  await expect(page.getByRole('button', { name: 'Confirm Policy choice' })).toHaveCount(0);
  expect(policyWrites).toBe(0);
  await page.getByRole('button', { name: 'Refresh and retry remaining work' }).click();
  await page.getByRole('radio', { name: 'Customize Policy' }).check();
  await page.getByRole('textbox', { name: 'Policy Markdown' }).fill('# My confirmed standard\n\nOnly testable work.');
  await page.getByRole('button', { name: 'Review Policy choice' }).click();
  await page.getByRole('button', { name: 'Confirm Policy choice' }).click();
  await expect(page.locator('progress')).toHaveAttribute('value', '1');
  await expect(page.getByRole('button', { name: 'Refresh GitHub state', exact: true })).toBeEnabled();
  expect(policyWrites).toBe(1);
  expect(policyInputs.at(-1)).toEqual({ planId: 'fresh-ready', choice: 'custom', content: '# My confirmed standard\n\nOnly testable work.' });

  // Default adoption also remains a no-op when exact current bytes agree.
  policyContent = '# Default Policy';
  await page.getByRole('button', { name: 'Refresh GitHub state', exact: true }).click();
  await page.getByRole('button', { name: 'Review Policy choice' }).click();
  await page.getByRole('button', { name: 'Confirm Policy choice' }).click();
  await expect(page.getByRole('button', { name: 'Refresh GitHub state', exact: true })).toBeEnabled();
  expect(policyWrites).toBe(1);
  expect(policyInputs.at(-1).choice).toBe('default');

  await page.getByRole('button', { name: 'Refresh GitHub state', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your station is ready' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Confirm these setup operations' })).toHaveCount(0);
  expect(executes).toBe(3);
  expect(plansExecuted).toEqual(['fresh-setup', 'fresh-setup', 'fresh-failed']);
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length }))).toEqual({ local: 0, session: 0 });
  await testInfo.attach('ready', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('dialog', { name: 'Station status' })).toBeVisible();
  expect(await page.getByRole('dialog', { name: 'Station status' }).evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await testInfo.attach('ready-mobile', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
});

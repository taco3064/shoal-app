import { createHash, generateKeyPairSync } from 'node:crypto';
import { readFileSync } from 'node:fs';

import {
  networkRoot,
  requestFormPath,
  summaryWorkflowPath,
} from '~app/protocol/services/network_compatibility';

import { createGitHubJoinClient } from '../github_join';
import type { Repository } from '../github_join';

export function githubFixture() {
  const user = { id: 42, login: 'reviewer', type: 'User' };

  const root: Repository = {
    id: networkRoot.repositoryId,
    full_name: networkRoot.fullName,
    default_branch: 'main',
    fork: false,
    owner: { id: 1, login: 'taco3064', type: 'User' },
    has_issues: true,
    private: false,
  };

  const node: Repository = {
    id: 100,
    full_name: 'reviewer/renamed-station',
    default_branch: 'main',
    fork: true,
    parent: { id: root.id },
    owner: user,
    has_issues: false,
    private: false,
    permissions: { admin: true },
  };

  const rootFiles: Record<string, string> = {
    [requestFormPath]: readFileSync(
      new URL('./fixtures/review-request.yml', import.meta.url),
      'utf8',
    ),
    [summaryWorkflowPath]: readFileSync(
      new URL('./fixtures/reviewer-summary.yml', import.meta.url),
      'utf8',
    ),
    'README.md': '# Canonical default\n',
  };

  const state = {
    root,
    node,
    user,
    rootFiles,
    files: {
      ...rootFiles,
      [requestFormPath]: 'drifted form',
      [summaryWorkflowPath]: 'drifted workflow',
      'README.md': '# My existing policy\n',
      'notes.txt': 'untouched',
    } as Record<string, string>,
    head: 'node-parent',
    rootHead: 'root-generation',
    actions: {
      enabled: false,
      allowed_actions: 'selected',
      sha_pinning_required: true,
    },
    workflow: { id: 901, path: summaryWorkflowPath, state: 'disabled_fork' },
    installed: true,
    replaceWorkflowAfterEnable: false,
    changeActionsPolicyOnEnable: false,
    changeRootDuringTree: false,
    failIssuesReadback: false,
    failActions: false,
    concurrentCommit: false,
    repoGone: false,
    requests: [] as {
      path: string;
      method: string;
      body: Record<string, unknown> | undefined;
      token: string;
    }[],
    pendingTree: [] as { path: string; content: string }[],
    parent: '',
    extraRootForks: [] as Repository[],
    unrelatedOwnedForks: [] as Repository[],
  };

  const privateKey = generateKeyPairSync('rsa', { modulusLength: 2048 })
    .privateKey.export({ type: 'pkcs1', format: 'pem' })
    .toString();

  const fetcher: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    const path = url.pathname;
    const method = init?.method ?? 'GET';

    const body = init?.body
      ? (JSON.parse(String(init.body)) as Record<string, unknown>)
      : undefined;

    const token = new Headers(init?.headers).get('Authorization') ?? '';

    state.requests.push({ path, method, body, token });

    let data: unknown = {};
    let status = 200;
    const isRoot = path.includes(networkRoot.fullName);
    const repository = isRoot ? state.root : state.node;
    const files = isRoot ? state.rootFiles : state.files;

    if (path === '/user' || path === '/user/42') {
      data = state.user;
    } else if (path === '/user/repos') {
      data = state.repoGone ? [] : [state.node, ...state.unrelatedOwnedForks];
    } else if (path === `/repositories/${state.node.id}`) {
      data = { ...state.node };
      status = state.repoGone ? 404 : 200;
    } else if (path === `/repos/${networkRoot.fullName}/forks`) {
      data = state.repoGone ? [] : [state.node, ...state.extraRootForks];
    } else if (path.endsWith('/installation')) {
      data = {
        id: 77,
        repository_selection: 'all',
        account: state.node.owner,
        permissions: {
          contents: 'write',
          actions: 'write',
          workflows: 'write',
          administration: 'write',
        },
      };

      status = state.installed ? 200 : 404;
    } else if (path.endsWith('/access_tokens')) {
      data = { token: `installation-${state.requests.length}` };
    } else if (path.endsWith('/git/ref/heads/main')) {
      data = { object: { sha: isRoot ? state.rootHead : state.head } };
    } else if (path.includes('/contents/')) {
      const name = decodeURIComponent(path.split('/contents/')[1]);
      const content = files[name];

      status = content === undefined ? 404 : 200;

      data = {
        type: 'file',
        encoding: 'base64',
        sha: createHash('sha1')
          .update(content ?? '')
          .digest('hex'),
        content: Buffer.from(content ?? '').toString('base64'),
      };
    } else if (path.endsWith('/actions/permissions')) {
      if (method === 'PUT') {
        if (state.failActions) {
          status = 403;
        } else {
          state.actions = body as typeof state.actions;

          if (state.changeActionsPolicyOnEnable) {
            state.actions.allowed_actions = 'all';
            state.actions.sha_pinning_required = false;
          }
        }
      }

      data = state.actions;
    } else if (path.endsWith('/actions/workflows/reviewer-summary.yml')) {
      data = state.workflow;
    } else if (path.endsWith('/actions/workflows/901/enable')) {
      state.workflow.state = 'active';

      if (state.replaceWorkflowAfterEnable) {
        state.workflow.id = 902;
      }

      status = 204;
    } else if (path.endsWith('/git/trees')) {
      state.pendingTree = body?.tree as typeof state.pendingTree;

      if (state.changeRootDuringTree) {
        state.rootHead = 'root-updated-during-tree';
      }

      data = { sha: 'new-tree' };
    } else if (path.endsWith('/git/commits') && method === 'POST') {
      state.parent = (body?.parents as string[])[0];
      data = { sha: 'new-commit' };

      if (state.concurrentCommit) {
        state.head = 'concurrent-reviewer-commit';
      }
    } else if (path.includes('/git/commits/')) {
      data = { tree: { sha: 'parent-tree' } };
    } else if (path.endsWith('/git/refs/heads/main')) {
      if (state.head !== state.parent || body?.force !== false) {
        status = 422;
      } else {
        state.head = String(body.sha);

        for (const change of state.pendingTree) {
          state.files[change.path] = change.content;
        }
      }

      data = { object: { sha: state.head } };
    } else if (path === `/repos/${repository.full_name}`) {
      if (method === 'PATCH' && !state.failIssuesReadback) {
        state.node.has_issues = body?.has_issues === true;
      }

      data = { ...repository };
    } else {
      throw new Error(`Unexpected GitHub request: ${method} ${path}`);
    }

    return new Response(status === 204 ? null : JSON.stringify(data), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  return {
    state,
    fetcher,
    privateKey,
    client: createGitHubJoinClient({ appId: '123', privateKey }, fetcher),
  };
}

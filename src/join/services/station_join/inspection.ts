import { createHash } from 'node:crypto';

import {
  allowedCanonicalReviewRequestFormDigests,
  allowedSummaryWorkflows,
  networkRoot,
  requestFormPath,
  summaryWorkflowPath,
} from '~app/protocol/services/network_compatibility';

import { stationReadiness } from '~app/protocol/services/station_readiness';

import { GitHubJoinClient, GitHubError } from '../github_join';
import type { GitFile, GitHubUser, GitHubAuthContext, Repository } from '../github_join';
import type { Inspection, OperationName, PublicInspection } from './types';

export function digest(file: GitFile | null): string {
  return createHash('sha256')
    .update(file?.content ?? '')
    .digest('hex');
}

export function validNode(
  repository: Repository,
  identity: GitHubUser,
): boolean {
  return (
    repository.id !== networkRoot.repositoryId
    && !repository.private
    && repository.fork
    && repository.parent?.id === networkRoot.repositoryId
    && repository.owner.type === 'User'
    && repository.owner.id === identity.id
    && identity.type === 'User'
  );
}

function rootOwner(root: Repository, identity: GitHubUser): boolean {
  return (
    identity.type === 'User'
    && root.owner.type === 'User'
    && root.owner.id === identity.id
  );
}

async function repositoryOrNull(
  client: GitHubJoinClient,
  token: string,
  locator: string,
): Promise<Repository | null> {
  try {
    return await client.repository(token, locator);
  } catch (error) {
    if (error instanceof GitHubError && error.status === 404) {
      return null;
    }

    throw error;
  }
}

function repositoryName(repository: Repository): string {
  const name = repository.full_name.split('/')[1];

  if (!name) {
    throw new Error('Canonical Network Root repository name is unavailable.');
  }

  return name;
}

async function discoverReviewerNodeCandidates(
  client: GitHubJoinClient,
  token: string,
  root: Repository,
  identity: GitHubUser,
): Promise<Repository[]> {
  const candidates: Repository[] = [];
  const byId = new Set<number>();

  const add = (repository: Repository | null) => {
    if (!repository || byId.has(repository.id)) {
      return;
    }

    byId.add(repository.id);
    candidates.push(repository);
  };

  add(await repositoryOrNull(
    client,
    token,
    `${identity.login}/${repositoryName(root)}`,
  ));

  for (const repository of await client.rootForks(token, root)) {
    add(repository);
  }

  return candidates;
}

export async function inspectStation(
  client: GitHubJoinClient,
  context: GitHubAuthContext,
  previous?: Inspection,
): Promise<Inspection> {
  const identity = await client.identity(context);

  const userToken = authToken(context);

  const root = await client.repository(userToken, networkRoot.fullName);

  if (root.id !== networkRoot.repositoryId) {
    throw new Error('Canonical Network Root identity mismatch.');
  }

  const rootHead = await client.head(userToken, root);

  const sameGeneration = previous?.root.id === root.id
    && previous.rootHead === rootHead;

  const [form, workflow, policy] = sameGeneration
    ? [previous.rootFiles.form, previous.rootFiles.workflow, previous.rootFiles.policy]
    : await Promise.all([
        client.file(userToken, root, requestFormPath, rootHead),
        client.file(userToken, root, summaryWorkflowPath, rootHead),
        client.file(userToken, root, 'README.md', rootHead),
      ]);

  if (!form || !workflow || !policy) {
    throw new Error('Canonical Network Root surfaces are unavailable.');
  }

  const rootFiles = { form, workflow, policy };
  const ownsRoot = rootOwner(root, identity);

  const platformBlocked
    = !allowedSummaryWorkflows.has(digest(workflow))
      || !allowedCanonicalReviewRequestFormDigests.has(digest(form));

  const candidates: Repository[] = [];

  if (ownsRoot) {
    candidates.length = 0;
  } else if (previous?.repository) {
    try {
      const current = await client.repositoryById(userToken, previous.repository.id);

      if (current.id !== previous.repository.id) {
        throw new Error('Reviewer Node repository identity mismatch.');
      }

      candidates.push(current);
    } catch (error) {
      if (!(error instanceof GitHubError && error.status === 404)) {
        throw error;
      }
    }
  }

  if (!ownsRoot && !candidates.some((candidate) => validNode(candidate, identity))) {
    candidates.push(...await discoverReviewerNodeCandidates(
      client,
      userToken,
      root,
      identity,
    ));
  }

  let repository: Repository | null = null;

  for (const candidate of candidates) {
    if (
      !candidate.fork
      || candidate.owner.id !== identity.id
      || candidate.owner.type !== 'User'
    ) {
      continue;
    }

    const detail = previous?.repository?.id === candidate.id
      ? candidate
      : await client.repository(userToken, candidate.full_name);

    if (validNode(detail, identity)) {
      if (repository) {
        throw new Error(
          'Multiple qualifying Reviewer Nodes require explicit resolution.',
        );
      }

      repository = detail;
    }
  }

  const base: Inspection = {
    identity,
    repository,
    rootOwner: ownsRoot,
    root,
    rootHead,
    rootFiles,
    platformBlocked,
    nodeHead: null,
    binding: null,
    actions: null,
    workflow: null,
    files: { form: null, workflow: null, policy: null },
    operations: [],
    waiting: ownsRoot ? null : repository ? 'app_access' : 'fork',
    ready: false,
  };

  if (!repository || ownsRoot) {
    return base;
  }

  const binding = await client.binding(userToken, repository);

  if (
    !binding
    || (typeof context === 'string' && repository.permissions?.admin !== true)
  ) {
    return base;
  }

  const token = await client.inspectionToken(binding);
  const nodeHead = await client.head(token, repository);

  const [nodeForm, nodeWorkflow, nodePolicy, actions, workflowState]
    = await Promise.all([
      client.file(token, repository, requestFormPath, nodeHead),
      client.file(token, repository, summaryWorkflowPath, nodeHead),
      client.file(token, repository, 'README.md', nodeHead),
      client.actions(token, repository),
      client.workflow(token, repository),
    ]);

  const result: Inspection = {
    ...base,
    binding,
    nodeHead,
    waiting: null,
    actions,
    workflow: workflowState,
    files: { form: nodeForm, workflow: nodeWorkflow, policy: nodePolicy },
  };

  result.operations = remainingOperations(result);
  result.ready = stationReady(result);

  return result;
}

export function authToken(context: GitHubAuthContext): string {
  if (typeof context === 'string') {
    return context;
  }

  return 'userToken' in context ? context.userToken : '';
}

export function managedMatch(inspection: Inspection): boolean {
  return (
    inspection.files.form?.content === inspection.rootFiles.form.content
    && inspection.files.workflow?.content === inspection.rootFiles.workflow.content
  );
}

export function stationReady(inspection: Inspection): boolean {
  return stationReadiness({
    hasIssues: !!inspection.repository?.has_issues,
    formDigest: inspection.files.form ? digest(inspection.files.form) : null,
    workflowDigest: inspection.files.workflow
      ? digest(inspection.files.workflow)
      : null,
  }).ready;
}

function remainingOperations(inspection: Inspection): OperationName[] {
  const operations: OperationName[] = [];

  if (!inspection.repository?.has_issues) {
    operations.push('enable_issues');
  }

  if (!inspection.actions?.enabled) {
    operations.push('enable_actions');
  }

  const synchronize = !managedMatch(inspection) && !inspection.platformBlocked;

  if (synchronize) {
    operations.push('sync_managed_files');
  }

  // A missing workflow becomes resolvable after the confirmed governed-file sync.
  if (
    (inspection.workflow?.state !== 'active'
      || inspection.workflow.path !== summaryWorkflowPath)
    && !inspection.platformBlocked
    && (synchronize
      || inspection.files.workflow?.content
      === inspection.rootFiles.workflow.content)
  ) {
    operations.push('enable_workflow');
  }

  return operations;
}

export function publicInspection(inspection: Inspection): PublicInspection {
  const repository = inspection.repository;

  return {
    identity: { id: inspection.identity.id, login: inspection.identity.login },
    repository: repository
      ? {
          id: repository.id,
          fullName: repository.full_name,
          defaultBranch: repository.default_branch,
        }
      : null,
    rootOwner: inspection.rootOwner,
    rootHead: inspection.rootHead,
    nodeHead: inspection.nodeHead,
    waiting: inspection.waiting,
    appAccess: !!inspection.binding,
    issuesEnabled: !!repository?.has_issues,
    actionsEnabled: !!inspection.actions?.enabled,
    managedFilesMatch: managedMatch(inspection),
    workflowActive:
      inspection.workflow?.state === 'active'
      && inspection.workflow.path === summaryWorkflowPath,
    workflowSupported: allowedSummaryWorkflows.has(
      digest(inspection.files.workflow),
    ),
    platformBlocked: inspection.platformBlocked,
    policy: {
      content: inspection.files.policy?.content ?? '',
      defaultContent: inspection.rootFiles.policy.content,
      matchesDefault:
        inspection.files.policy?.content
        === inspection.rootFiles.policy.content,
    },
    policyComplete: false,
    operations: [...inspection.operations],
    ready: inspection.ready,
    publication: 'waiting_for_projection',
  };
}

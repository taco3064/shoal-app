import { createHash } from 'node:crypto';

import {
  allowedCanonicalReviewRequestFormDigests,
  allowedSummaryWorkflows,
  networkRoot,
  requestFormPath,
  summaryWorkflowPath,
} from '~app/protocol/services/network_compatibility';

import { stationReadiness } from '~app/protocol/services/station_readiness';

import { GitHubJoinClient } from '../github_join';
import type { GitFile, GitHubUser, GitHubAuthContext, Repository } from '../github_join';
import { discoverReviewerNode } from './discovery';
import { InspectionFailure, type InspectionStage } from './inspection_failure';
import type { Inspection, OperationName, PublicInspection } from './types';

export function digest(file: GitFile | null): string {
  return createHash('sha256')
    .update(file?.content ?? '')
    .digest('hex');
}

function rootOwner(root: Repository, identity: GitHubUser): boolean {
  return (
    identity.type === 'User'
    && root.owner.type === 'User'
    && root.owner.id === identity.id
  );
}

export async function inspectStation(
  client: GitHubJoinClient,
  context: GitHubAuthContext,
  previous?: Inspection,
): Promise<Inspection> {
  let stage: InspectionStage = 'github_identity';
  let base: Inspection | undefined;
  let evidence: PublicInspection | undefined;

  try {
    const identity = await client.identity(context);

    if (
      !Number.isSafeInteger(identity.id) || identity.id <= 0
      || identity.type !== 'User' || !identity.login?.trim()
    ) {
      throw new Error('Authenticated Personal Account identity is unavailable.');
    }

    evidence = {
      identity: { id: identity.id, login: identity.login },
      repository: null,
      rootOwner: false,
      rootHead: '',
      nodeHead: null,
      waiting: 'fork',
      appAccess: false,
      issuesEnabled: false,
      actionsEnabled: false,
      actionsPolicyEnabled: false,
      workflowRegistryAvailable: false,
      workflowIdentityAvailable: false,
      managedFilesMatch: false,
      workflowActive: false,
      workflowSupported: false,
      platformBlocked: false,
      policy: { content: '', defaultContent: '', matchesDefault: false },
      policyComplete: false,
      operations: [],
      ready: false,
      publication: 'waiting_for_projection',
    };

    const userToken = authToken(context);

    stage = 'reviewer_node';
    const root = await client.repository(userToken, networkRoot.fullName);

    if (
      root.id !== networkRoot.repositoryId
      || root.owner.type !== 'User'
      || !Number.isSafeInteger(root.owner.id) || root.owner.id <= 0
    ) {
      throw new Error('Canonical Network Root identity mismatch.');
    }

    const ownsRoot = rootOwner(root, identity);

    base = {
      identity,
      repository: null,
      rootOwner: ownsRoot,
      root,
      rootHead: '',
      rootFiles: null,
      platformBlocked: false,
      nodeHead: null,
      binding: null,
      actions: null,
      workflowRegistryAvailable: false,
      workflow: null,
      files: { form: null, workflow: null, policy: null },
      operations: [],
      waiting: ownsRoot ? null : 'fork',
      ready: false,
    };

    if (ownsRoot) {
      return base;
    }

    const repository = await discoverReviewerNode(client, {
      token: userToken, root, identity, previous: previous?.repository,
    });

    base.repository = repository;
    base.waiting = repository ? 'app_access' : 'fork';

    if (!repository) {
      return base;
    }

    stage = 'app_access';
    const binding = await client.binding(userToken, repository);

    if (
      !binding
      || (typeof context === 'string' && repository.permissions?.admin !== true)
    ) {
      return base;
    }

    base.binding = binding;
    const token = await client.inspectionToken(binding);

    base.waiting = null;

    stage = 'station_setup';
    const rootHead = await client.head(userToken, root);

    base.rootHead = rootHead;

    const sameGeneration = previous?.root.id === root.id
      && previous.rootHead === rootHead;

    const [form, workflow] = sameGeneration
      && previous.rootFiles?.form && previous.rootFiles.workflow
      ? [previous.rootFiles.form, previous.rootFiles.workflow]
      : await Promise.all([
          client.file(userToken, root, requestFormPath, rootHead),
          client.file(userToken, root, summaryWorkflowPath, rootHead),
        ]);

    if (!form || !workflow) {
      throw new Error('Canonical Network Root surfaces are unavailable.');
    }

    base.rootFiles = { form, workflow, policy: null };

    base.platformBlocked = !allowedSummaryWorkflows.has(digest(workflow))
      || !allowedCanonicalReviewRequestFormDigests.has(digest(form));

    base.nodeHead = await client.head(token, repository);

    const [nodeForm, nodeWorkflow, actions, workflowState, registryAvailable]
      = await Promise.all([
        client.file(token, repository, requestFormPath, base.nodeHead),
        client.file(token, repository, summaryWorkflowPath, base.nodeHead),
        client.actions(token, repository),
        client.workflow(token, repository),
        client.workflowRegistryAvailable(token, repository),
      ]);

    base.files.form = nodeForm;
    base.files.workflow = nodeWorkflow;
    base.actions = actions;
    base.workflow = workflowState;
    base.workflowRegistryAvailable = registryAvailable;
    base.operations = remainingOperations(base);
    base.ready = stationReady(base);

    // Policy authority is reachable only after Station setup has converged.
    if (base.operations.length || !base.ready || base.platformBlocked
      || !actionsAvailable(base) || !workflowActive(base)) {
      return base;
    }

    stage = 'review_policy';

    const policy = sameGeneration && previous.rootFiles?.policy
      ? previous.rootFiles.policy
      : await client.file(userToken, root, 'README.md', rootHead);

    if (!policy) {
      throw new Error('Canonical Network Root surfaces are unavailable.');
    }

    base.rootFiles.policy = policy;
    base.files.policy = await client.file(token, repository, 'README.md', base.nodeHead);

    return base;
  } catch (cause) {
    throw new InspectionFailure(stage, cause, base ? publicInspection(base) : evidence);
  }
}

export function authToken(context: GitHubAuthContext): string {
  if (typeof context === 'string') {
    return context;
  }

  return 'userToken' in context ? context.userToken : '';
}

export function managedMatch(inspection: Inspection): boolean {
  return (
    !!inspection.rootFiles?.form
    && !!inspection.rootFiles.workflow
    && inspection.files.form?.content === inspection.rootFiles.form.content
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

  const synchronize = !managedMatch(inspection) && !inspection.platformBlocked;

  // An empty registry cannot prove fork execution authority. If no governed
  // workflow file exists yet, create it before attempting registry convergence.
  if (!inspection.files.workflow && !inspection.workflowRegistryAvailable
    && synchronize) {
    operations.push('sync_managed_files');

    return operations;
  }

  if (!actionsAvailable(inspection)) {
    operations.push('enable_actions');

    // The supported canonical bytes and filename already fix the dependent
    // target. Confirm it now; execution still requires verified Actions and
    // canonical registry identity before activation can run.
    if (!inspection.platformBlocked && managedMatch(inspection)
      && !workflowActive(inspection)) {
      operations.push('enable_workflow');
    }

    return operations;
  }

  if (synchronize) {
    operations.push('sync_managed_files');

    return operations;
  }

  // Activation is confirmed only for an already discovered canonical identity.
  if (
    inspection.workflow?.path === summaryWorkflowPath
    && inspection.workflow.state !== 'active'
    && !inspection.platformBlocked
    && managedMatch(inspection)
  ) {
    operations.push('enable_workflow');
  }

  return operations;
}

export function actionsAvailable(inspection: Inspection): boolean {
  return !!inspection.actions?.enabled && inspection.workflowRegistryAvailable;
}

function workflowActive(inspection: Inspection): boolean {
  return inspection.workflow?.path === summaryWorkflowPath
    && inspection.workflow.state === 'active';
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
    actionsEnabled: actionsAvailable(inspection),
    actionsPolicyEnabled: !!inspection.actions?.enabled,
    workflowRegistryAvailable: inspection.workflowRegistryAvailable,
    workflowIdentityAvailable: inspection.workflow?.path === summaryWorkflowPath,
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
      defaultContent: inspection.rootFiles?.policy?.content ?? '',
      matchesDefault:
        !!inspection.rootFiles?.policy
        && inspection.files.policy?.content
        === inspection.rootFiles.policy.content,
    },
    policyComplete: false,
    operations: [...inspection.operations],
    ready: inspection.ready,
    publication: 'waiting_for_projection',
  };
}

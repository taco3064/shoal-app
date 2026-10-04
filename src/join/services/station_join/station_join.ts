import { verified } from './verification';
import { InspectionFailure } from './inspection_failure';
import { executeStep, fingerprint } from './execute_step';
import {
  requestFormPath,
  summaryWorkflowPath,
} from '~app/protocol/services/network_compatibility';

import { GitHubJoinClient, type GitHubAuthContext } from '../github_join';
import { authToken, inspectStation, publicInspection } from './inspection';
import type {
  ExecutionResult,
  ExecutionCheckpoint,
  ExecutionStep,
  Inspection,
  OperationName,
  OperationStatus,
  PolicyChoice,
  PolicyPlan,
  ProgressObserver,
} from './types';

export class StationJoinService {
  constructor(private readonly client: GitHubJoinClient) {}

  inspect(userToken: GitHubAuthContext, previous?: Inspection): Promise<Inspection> {
    return inspectStation(this.client, userToken, previous);
  }

  executeStep(
    context: GitHubAuthContext,
    checkpoint: ExecutionCheckpoint,
    progress?: ProgressObserver,
  ): Promise<ExecutionStep> {
    return executeStep(checkpoint, {
      inspect: (previous) => this.inspect(context, previous),
      perform: (inspection, name) => this.perform(context, inspection, name, true),
      progress,
    });
  }

  async execute(
    userToken: GitHubAuthContext,
    plan: Inspection,
    progress?: ProgressObserver,
  ): Promise<ExecutionResult> {
    let inspection = await this.inspect(userToken, plan);

    const operations: OperationStatus[] = plan.operations.map((name) => ({
      name,
      state: 'queued',
    }));

    const notify = async () =>
      await progress?.({
        operations: operations.map((operation) => ({ ...operation })),
        completed: operations.filter(
          (operation) => operation.state === 'verified',
        ).length,
        total: operations.length,
        ready: inspection.ready,
      });

    if (
      !plan.binding
      || plan.waiting
      || fingerprint(inspection) !== fingerprint(plan)
    ) {
      throw new Error('STALE_PLAN');
    }

    await notify();

    for (const operation of operations) {
      operation.state = 'executing';
      await notify();

      try {
        const workflowId = await this.perform(
          userToken,
          inspection,
          operation.name as OperationName,
        );

        const next = await this.inspect(userToken, inspection);

        if (
          !verified(operation.name, next, plan, workflowId)
          || next.rootHead !== plan.rootHead
          || (operation.name !== 'sync_managed_files'
            && next.nodeHead !== inspection.nodeHead)
        ) {
          throw new Error(
            'Authoritative read-back did not verify the operation.',
          );
        }

        inspection = next;
        operation.state = 'verified';
      } catch (error) {
        operation.state
          = error instanceof Error && error.message === 'STALE_PLAN'
            ? 'blocked'
            : 'failed';

        operation.error
          = error instanceof Error ? error.message : 'Operation failed.';

        if (error instanceof InspectionFailure) {
          await notify();

          throw error;
        }

        // Preserve prior verified state. Refresh for retry without replaying mutations.
        try {
          inspection = await this.inspect(userToken, inspection);
        } catch {
          // Progress remains truthful even when GitHub read-back is unavailable.
        }

        await notify();

        break;
      }

      await notify();
    }

    return {
      inspection,
      operations,
      completed: operations.filter(
        (operation) => operation.state === 'verified',
      ).length,
      total: operations.length,
      ready: inspection.ready,
    };
  }

  private async perform(
    userToken: GitHubAuthContext,
    inspection: Inspection,
    name: OperationName,
    freshlyInspected = false,
  ): Promise<number | undefined> {
    const binding = inspection.binding;

    if (
      !binding || !inspection.nodeHead
      || !inspection.rootFiles?.form || !inspection.rootFiles.workflow
    ) {
      throw new Error('Reviewer Node authorization unavailable.');
    }

    const current = freshlyInspected
      ? inspection
      : await this.inspect(userToken, inspection);

    if (fingerprint(current) !== fingerprint(inspection)) {
      throw new Error('STALE_PLAN');
    }

    switch (name) {
      case 'enable_issues':
        await this.client.enableIssues(binding);

        break;
      case 'enable_actions':
        if (!inspection.actions) {
          throw new Error('Repository Actions policy unavailable.');
        }

        await this.client.enableActions(binding, inspection.actions);

        break;
      case 'enable_workflow':
        if (!inspection.actions?.enabled || !inspection.workflowRegistryAvailable) {
          throw new Error('Verified repository Actions availability is required.');
        }

        if (
          inspection.platformBlocked
          || inspection.files.workflow?.content
          !== inspection.rootFiles.workflow.content
        ) {
          throw new Error(
            'Canonical supported workflow convergence is required.',
          );
        }

        if (
          inspection.workflow?.path === summaryWorkflowPath
          && inspection.workflow.state === 'active'
        ) {
          return inspection.workflow.id;
        }

        return this.client.enableWorkflow(binding);

      case 'sync_managed_files': {
        if (inspection.platformBlocked) {
          throw new Error(
            'Canonical generation is waiting for Platform support.',
          );
        }

        const changes = [
          {
            path: requestFormPath,
            content: inspection.rootFiles.form.content,
            current: inspection.files.form?.content,
          },
          {
            path: summaryWorkflowPath,
            content: inspection.rootFiles.workflow.content,
            current: inspection.files.workflow?.content,
          },
        ]
          .filter((file) => file.content !== file.current)
          .map(({ path, content }) => ({ path, content }));

        const head = await this.client.commitFiles(
          binding,
          inspection.nodeHead,
          changes,
          'managed',
          () => this.verifyRoot(userToken, inspection),
        );

        const token = await this.client.inspectionToken(binding);

        if ((await this.client.head(token, binding.repository)) !== head) {
          throw new Error('Convergence commit head read-back mismatch.');
        }

        break;
      }
    }
  }

  private async verifyRoot(
    userToken: GitHubAuthContext,
    inspection: Inspection,
  ): Promise<void> {
    const readToken = authToken(userToken);

    const root = await this.client.repository(
      readToken,
      inspection.root.full_name,
    );

    if (
      root.id !== inspection.root.id
      || root.default_branch !== inspection.root.default_branch
      || (await this.client.head(readToken, root)) !== inspection.rootHead
    ) {
      throw new Error('STALE_PLAN');
    }
  }

  async preparePolicy(
    userToken: GitHubAuthContext,
    displayed: Inspection,
    choice: PolicyChoice,
  ): Promise<PolicyPlan> {
    const inspection = await this.inspect(userToken, displayed);

    if (
      !inspection.binding
      || !inspection.nodeHead
      || !inspection.rootFiles?.policy
      || fingerprint(displayed) !== fingerprint(inspection)
    ) {
      throw new Error('STALE_PLAN');
    }

    const content
      = choice.kind === 'default'
        ? inspection.rootFiles.policy.content
        : choice.kind === 'keep'
          ? (inspection.files.policy?.content ?? '')
          : choice.content;

    if (
      typeof content !== 'string'
      || Buffer.byteLength(content, 'utf8') > 512000
    ) {
      throw new Error('Policy content is missing or too large.');
    }

    return {
      inspection,
      content,
      expectedBlob: inspection.files.policy?.sha ?? null,
      noop:
        choice.kind === 'keep' || inspection.files.policy?.content === content,
    };
  }

  async executePolicy(
    userToken: GitHubAuthContext,
    plan: PolicyPlan,
    progress?: ProgressObserver,
  ): Promise<ExecutionResult> {
    let inspection = await this.inspect(userToken, plan.inspection);

    if (
      !inspection.binding
      || !inspection.nodeHead
      || fingerprint(inspection) !== fingerprint(plan.inspection)
      || (inspection.files.policy?.sha ?? null) !== plan.expectedBlob
      || inspection.files.policy?.content !== plan.inspection.files.policy?.content
    ) {
      throw new Error('STALE_PLAN');
    }

    if (plan.noop) {
      return {
        inspection,
        operations: [],
        completed: 0,
        total: 0,
        ready: inspection.ready,
      };
    }

    const operations: OperationStatus[] = [
      { name: 'write_policy', state: 'executing' },
    ];

    await progress?.({ operations, completed: 0, total: 1, ready: inspection.ready });

    try {
      const head = await this.client.commitFiles(
        inspection.binding,
        inspection.nodeHead,
        [{ path: 'README.md', content: plan.content }],
        'policy',
        () => this.verifyRoot(userToken, plan.inspection),
      );

      inspection = await this.inspect(userToken, inspection);

      if (
        inspection.nodeHead !== head
        || inspection.files.policy?.content !== plan.content
      ) {
        throw new Error('Policy read-back does not match confirmed bytes.');
      }

      operations[0].state = 'verified';
    } catch (error) {
      operations[0].state
        = error instanceof Error && error.message === 'STALE_PLAN'
          ? 'blocked'
          : 'failed';

      operations[0].error
        = error instanceof Error ? error.message : 'Policy write failed.';

      if (error instanceof InspectionFailure) {
        await progress?.({
          operations, completed: 0, total: 1, ready: false,
        });

        throw error;
      }
    }

    const result = {
      inspection,
      operations,
      completed: operations[0].state === 'verified' ? 1 : 0,
      total: 1,
      ready: inspection.ready,
    };

    await progress?.(result);

    return result;
  }
}

export function createStationJoinService(
  client: GitHubJoinClient,
): StationJoinService {
  return new StationJoinService(client);
}

export { publicInspection };

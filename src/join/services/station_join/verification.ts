import { summaryWorkflowPath } from '~app/protocol/services/network_compatibility';

import type { ActionsPolicy } from '../github_join';
import type { Inspection, OperationStatus } from './types';

export function verified(
  name: OperationStatus['name'],
  next: Inspection,
  plan: Inspection,
  workflowId?: number,
): boolean {
  if (
    next.repository?.id !== plan.repository?.id
    || next.binding?.installationId !== plan.binding?.installationId
    || next.identity.id !== plan.identity.id
  ) {
    return false;
  }

  switch (name) {
    case 'enable_issues':
      return !!next.repository?.has_issues;
    case 'enable_actions':
      return (
        !!next.actions?.enabled
        && next.workflowRegistryAvailable
        && policyFields(next.actions) === policyFields(plan.actions)
      );
    case 'enable_workflow':
      return (
        next.workflow?.path === summaryWorkflowPath
        && next.actions?.enabled === true
        && next.workflowRegistryAvailable
        && next.workflow.id === workflowId
        && next.workflow.state === 'active'
      );
    case 'sync_managed_files':
      return (
        !!plan.rootFiles?.form && !!plan.rootFiles.workflow
        && next.files.form?.content === plan.rootFiles.form.content
        && next.files.workflow?.content === plan.rootFiles.workflow.content
      );
    default:
      return false;
  }
}

function policyFields(policy: ActionsPolicy | null): string {
  return JSON.stringify(
    Object.entries(policy ?? {})
      .filter(([key]) => key !== 'enabled')
      .sort(([left], [right]) => left.localeCompare(right)),
  );
}

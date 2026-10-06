import { allowedSummaryWorkflows } from '../network_compatibility';

export const hostedWorkflowPath = '.github/workflows/hosted-review.yml';

export type HostedCapabilityTrust = {
  callerDigest: string;
  auxiliaryDigest: string;
  actionCommit: string;
  actionPath: 'hosted-review/';
  runtimeSourceCommit: string;
  runtimeSourceTree: string;
  brokerFormatVersion: 1;
};

// Exact verified Action commit and Station workflow bytes. This binding never
// follows main or a release tag. Production broker and Reviewer authorization
// remain separate evidence gates.
export const hostedCapabilities: readonly HostedCapabilityTrust[] = [{
  callerDigest: 'b9162cae864bbd6e00745346f37f701fe5c003d3367cc3dc37c6fb394f9d8105',
  auxiliaryDigest: 'c2187c122a151075c35f75461bfe1f29b824d858949ec465bf7080dc9d20d326',
  actionCommit: 'c39a313795b9a9d941e6e737bd03687d8292d64c',
  actionPath: 'hosted-review/',
  runtimeSourceCommit: '230a97af21c45b8d8f0cdcd4a02d13dddd2c4730',
  runtimeSourceTree: 'db8cfb7ed4cb54c4bc60569b5e55ed36fa68452c',
  brokerFormatVersion: 1,
}];

export function resolveHostedCapability(
  callerDigest: string | null,
  auxiliaryDigest: string | null,
): HostedCapabilityTrust | null {
  if (!callerDigest || !allowedSummaryWorkflows.has(callerDigest)) {
    return null;
  }

  return hostedCapabilities.find((binding) =>
    binding.callerDigest === callerDigest
    && binding.auxiliaryDigest === auxiliaryDigest,
  ) ?? null;
}

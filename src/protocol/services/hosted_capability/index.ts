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

// Exact published Action v0.2.1 and Station workflow bytes. This binding never
// follows main or a release tag. Production broker and Reviewer authorization
// remain separate evidence gates.
export const hostedCapabilities: readonly HostedCapabilityTrust[] = [{
  callerDigest: 'b9162cae864bbd6e00745346f37f701fe5c003d3367cc3dc37c6fb394f9d8105',
  auxiliaryDigest: 'eabb769e5810789e2c83232a8dc86bef23e87cc3b268ea788007f0e699a49537',
  actionCommit: '85dde9b9760be9a640b29b1f4c2a6aa911b2cb37',
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

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

// Exact independently accepted Action candidate, verified by Hosted/distribution
// CI. This binding never follows main or a release tag. Production convergence
// and owner-controlled publication remain separate evidence gates.
export const hostedCapabilities: readonly HostedCapabilityTrust[] = [{
  callerDigest: 'b9162cae864bbd6e00745346f37f701fe5c003d3367cc3dc37c6fb394f9d8105',
  auxiliaryDigest: '4bf2bb64b42f14aac53eee395482717c5f10ebdb416ba053240c01ffb85c2388',
  actionCommit: '13ab1fd2a6a927e22dc37851cbfc0a28b177aebb',
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

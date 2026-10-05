import { hostedGrantStub } from '../hosted_grant';
import type { GrantBinding, GrantView } from '../hosted_grant';
import type { HostedGrantState } from '../hosted_settings';
import { grantEnvironment } from './config';
import type { HostedEnvironment } from './config';

export async function grantOperation<T>(
  env: HostedEnvironment,
  binding: GrantBinding,
  operation: string,
  input: object = {},
): Promise<T> {
  const response = await hostedGrantStub(grantEnvironment(env), binding).fetch(
    'https://hosted-grant.internal/',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...input, operation, binding }),
    },
  );

  if (!response.ok) {
    throw new Error('Recurring Reviewer authority is unavailable. Reconnect explicitly.');
  }

  return await response.json() as T;
}

export async function grantState(
  env: HostedEnvironment, repositoryId: number, reviewerId: number,
): Promise<HostedGrantState> {
  try {
    const result = await grantOperation<GrantView>(
      env,
      { repositoryId: String(repositoryId), reviewerId: String(reviewerId) },
      'status',
    );

    return result.status;
  } catch {
    return 'unavailable';
  }
}

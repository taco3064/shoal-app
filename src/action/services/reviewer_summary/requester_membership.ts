import type { GitHubUser, RequesterNode } from './types';

export function isValidRequesterNode(
  requesterNode: RequesterNode | null,
  author: GitHubUser,
  networkRootRepositoryId: number,
): requesterNode is RequesterNode {
  return Boolean(
    requesterNode
    && requesterNode.owner.type === 'User'
    && requesterNode.owner.id === author.id
    && (
      requesterNode.id === networkRootRepositoryId
      || (
        requesterNode.isFork
        && requesterNode.parentRepositoryId === networkRootRepositoryId
      )
    ),
  );
}

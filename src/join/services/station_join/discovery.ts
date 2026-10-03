import { networkRoot } from '~app/protocol/services/network_compatibility';

import {
  GitHubError, githubFailure,
  type GitHubJoinClient, type GitHubUser, type Repository,
} from '../github_join';

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

type Discovery = {
  token: string;
  root: Repository;
  identity: GitHubUser;
  previous?: Repository | null;
};

// Listings provide candidate IDs, never membership authority. Every candidate
// considered for binding (or ambiguity) is independently verified by ID.
export async function discoverReviewerNode(
  client: GitHubJoinClient,
  context: Discovery,
): Promise<Repository | null> {
  const { token, root, identity, previous } = context;
  const verified = new Set<number>();
  const valid = new Map<number, Repository>();
  const failures: unknown[] = [];

  const verify = async (candidate: Repository, bound = false) => {
    if (verified.has(candidate.id)) {
      return;
    }

    if (!bound && (!candidate.fork || candidate.private
      || candidate.owner.type !== 'User' || candidate.owner.id !== identity.id)) {
      return;
    }

    let detail: Repository;

    try {
      detail = await client.repositoryById(token, candidate.id);
    } catch (error) {
      if (error instanceof GitHubError && error.status === 404) {
        verified.add(candidate.id);

        return;
      }

      // A known candidate whose identity cannot be verified may hide ambiguity.
      // Unlike a redundant listing failure, it must not be ignored.
      throw error;
    }

    if (detail.id !== candidate.id) {
      throw new Error('Reviewer Node repository identity mismatch.');
    }

    verified.add(candidate.id);

    if (validNode(detail, identity)) {
      valid.set(detail.id, detail);
    }

    if (valid.size > 1) {
      throw new Error('Multiple qualifying Reviewer Nodes require explicit resolution.');
    }
  };

  const discover = async (source: AsyncGenerator<Repository[]>) => {
    while (true) {
      let page: IteratorResult<Repository[]>;

      try {
        page = await source.next();
      } catch (error) {
        failures.push(error);

        console.warn('Reviewer Node discovery source unavailable',
          githubFailure(error)?.error ?? { code: 'DISCOVERY_UNAVAILABLE' });

        return false;
      }

      if (page.done) {
        return true;
      }

      for (const candidate of page.value) {
        await verify(candidate);
      }
    }
  };

  if (previous) {
    await verify(previous, true);
  }

  await discover((async function* () {
    try {
      const locator = `${identity.login}/${root.full_name.split('/')[1]}`;

      yield [await client.repository(token, locator)];
    } catch (error) {
      if (error instanceof GitHubError && error.status === 404) {
        return;
      }

      throw error;
    }
  })());

  // Complete owner enumeration detects custom names and multiple qualifying
  // nodes. Its unavailability cannot erase an independently proven valid node.
  const ownerComplete = await discover(client.ownerRepositories(token, identity));

  if (valid.size === 0) {
    await discover(client.rootForks(token, root));
  }

  if (valid.size === 1) {
    return [...valid.values()][0];
  }

  // Root fork lists may omit a fork; an empty fallback is not proof of absence
  // when the exhaustive owner-scoped source was unavailable.
  if (!ownerComplete) {
    throw failures[0];
  }

  return null;
}

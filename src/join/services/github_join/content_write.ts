import { encodeLocator } from './locators';
import type { ContentChange, Repository } from './types';

export type GitRequest = <T>(
  path: string,
  method?: string,
  body?: unknown,
) => Promise<T>;

type ContentWrite = {
  repository: Repository;
  expectedHead: string;
  changes: ContentChange[];
  kind: 'managed' | 'policy';
  verifyRoot: () => Promise<void>;
};

export function validateContentMutation(
  changes: ContentChange[],
  kind: 'managed' | 'policy',
): void {
  if (kind !== 'managed' && kind !== 'policy') {
    throw new Error('Unknown privileged content operation.');
  }

  const allowed
    = kind === 'managed'
      ? [
          '.github/ISSUE_TEMPLATE/review-request.yml',
          '.github/workflows/reviewer-summary.yml',
        ]
      : ['README.md'];

  if (
    !changes.length
    || changes.some((change) => !allowed.includes(change.path))
    || new Set(changes.map((change) => change.path)).size !== changes.length
  ) {
    throw new Error('Content mutation is outside the operation allowlist.');
  }
}

export async function commitContent(
  request: GitRequest,
  write: ContentWrite,
): Promise<string> {
  const { repository, expectedHead, changes, kind, verifyRoot } = write;
  const prefix = `/repos/${encodeLocator(repository.full_name)}`;
  const refPath = `${prefix}/git/ref/heads/${encodeURIComponent(repository.default_branch)}`;
  const before = await request<{ object: { sha: string } }>(refPath);

  if (before.object.sha !== expectedHead) {
    throw new Error('STALE_PLAN');
  }

  const parent = await request<{ tree: { sha: string } }>(
    `${prefix}/git/commits/${expectedHead}`,
  );

  const tree = await request<{ sha: string }>(`${prefix}/git/trees`, 'POST', {
    base_tree: parent.tree.sha,
    tree: changes.map(({ path, content }) => ({
      path,
      content,
      mode: '100644',
      type: 'blob',
    })),
  });

  const commit = await request<{ sha: string }>(
    `${prefix}/git/commits`,
    'POST',
    {
      message:
        kind === 'managed'
          ? 'Converge Shoal-managed station surfaces'
          : 'Update Reviewer-owned Review Policy',
      tree: tree.sha,
      parents: [expectedHead],
    },
  );

  const current = await request<{ object: { sha: string } }>(refPath);

  if (current.object.sha !== expectedHead) {
    throw new Error('STALE_PLAN');
  }

  // Git objects are immutable until published. The Root guard is the final
  // authoritative read before advancing the ref under the confirmed generation.
  await verifyRoot();

  // No force: a concurrent divergent Reviewer commit makes this update fail.
  await request(
    `${prefix}/git/refs/heads/${encodeURIComponent(repository.default_branch)}`,
    'PATCH',
    { sha: commit.sha, force: false },
  );

  return commit.sha;
}

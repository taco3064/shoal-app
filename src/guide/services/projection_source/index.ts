import { readFile } from 'node:fs/promises';
import { validateProjection } from '~app/network/services/network_projection';
import type { NetworkProjection } from '~app/network/services/network_projection';

export async function publishedProjection(): Promise<NetworkProjection> {
  const path = process.env.SHOAL_PROJECTION_FILE;

  if (!path) {
    throw new Error('SHOAL_PROJECTION_FILE is required for the website build.');
  }

  const projection = JSON.parse(await readFile(path, 'utf8')) as NetworkProjection;

  validateProjection(projection);

  if (
    !Array.isArray(projection.reviewers)
    || projection.networkRoot.repositoryId !== 1379044983
  ) {
    throw new Error('Invalid Network Projection root or participants.');
  }

  const usernames = new Set<string>();

  for (const reviewer of projection.reviewers) {
    const key = reviewer.username.toLowerCase();

    if (!/^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i.test(key) || usernames.has(key)) {
      throw new Error('Invalid or duplicate Reviewer username.');
    }

    usernames.add(key);

    for (const url of [reviewer.repositoryUrl, reviewer.profileUrl, reviewer.policyUrl]) {
      requireGitHubUrl(url);
    }

    const avatar = new URL(reviewer.avatarUrl);

    if (
      avatar.protocol !== 'https:'
      || avatar.hostname !== 'avatars.githubusercontent.com'
    ) {
      throw new Error('Invalid Reviewer avatar URL.');
    }

    if (
      reviewer.summary.status !== 'unavailable'
      && reviewer.summary.status !== 'current'
      && reviewer.summary.status !== 'fallback'
    ) {
      throw new Error('Invalid Summary selection state.');
    }

    if (reviewer.summary.status !== 'unavailable') {
      const { summary, source } = reviewer.summary;

      if (
        summary.reviewerNode.repositoryId !== reviewer.repositoryId
        || !source.transportUrl
        || !source.runUrl
      ) {
        throw new Error('Invalid selected Summary provenance.');
      }

      requireGitHubUrl(source.transportUrl);
      requireGitHubUrl(source.runUrl);
    }
  }

  return projection;
}

function requireGitHubUrl(value: string): void {
  const url = new URL(value);

  if (
    url.protocol !== 'https:'
    || url.hostname !== 'github.com'
    || url.username
    || url.password
  ) {
    throw new Error('Invalid Reviewer GitHub URL.');
  }
}

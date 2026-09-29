import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { GitHubApi } from '~app/network/services/github_api';
import { buildNetworkProjection } from '~app/network/services/network_projection';

const token = process.env.GITHUB_TOKEN;

if (!token) {
  throw new Error('GITHUB_TOKEN is required for the Network Scan.');
}

const projection = await buildNetworkProjection(new GitHubApi(token));
const directory = 'dist/network-projection';

await mkdir(directory, { recursive: true });
const temporary = join(directory, 'network.json.tmp');

try {
  await writeFile(temporary, `${JSON.stringify(projection, null, 2)}\n`, {
    flag: 'wx',
  });

  await rename(temporary, join(directory, 'network.json'));
} catch (error) {
  await rm(temporary, { force: true });

  throw error;
}

console.log(
  `Validated Network Projection candidate: ${projection.reviewers.length} Reviewers.`,
);

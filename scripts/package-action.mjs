import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const buildRoot = join(repositoryRoot, 'dist', 'action');
const packageRoot = join(repositoryRoot, 'dist', 'action-package');

const loaderSource = `import { existsSync } from 'node:fs';
import { dirname, extname, resolve as resolvePath } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const packageRoot = dirname(fileURLToPath(import.meta.url));

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('~app/')) {
    const resolved = resolvePackageFile(
      resolvePath(packageRoot, 'src', specifier.slice('~app/'.length)),
    );
    if (resolved) return { shortCircuit: true, url: resolved };
  }

  if (specifier.startsWith('~protocol/')) {
    const resolved = resolvePackageFile(
      resolvePath(packageRoot, 'protocol', specifier.slice('~protocol/'.length)),
    );
    if (resolved) return { shortCircuit: true, url: resolved };
  }

  if (
    (specifier.startsWith('./') || specifier.startsWith('../'))
    && context.parentURL?.startsWith('file:')
  ) {
    const resolved = resolvePackageFile(
      fileURLToPath(new URL(specifier, context.parentURL)),
    );
    if (resolved) return { shortCircuit: true, url: resolved };
  }

  return nextResolve(specifier, context);
}

function resolvePackageFile(basePath) {
  const candidates = extname(basePath)
    ? [basePath]
    : [`${basePath}.js`, resolvePath(basePath, 'index.js')];

  for (const candidate of candidates) {
    if (existsSync(candidate)) return pathToFileURL(candidate).href;
  }

  return null;
}
`;

const mainSource = `import { register } from 'node:module';
import { resolve } from 'node:path';
import { writeFile } from 'node:fs/promises';

register('./loader.mjs', import.meta.url);

const { runReviewerSummaryAction } = await import('./src/action/reviewer_summary_action.js');

try {
  const networkRootRepositoryId = parsePositiveInteger(
    requiredInput('network_root_repository_id'),
    'network_root_repository_id',
  );
  const networkRootRepositoryName = requiredInput('network_root_repository_name');
  const reviewerNodeRepository = input('reviewer_node_repository')
    || process.env.GITHUB_REPOSITORY
    || '';

  if (!reviewerNodeRepository) {
    throw new Error(
      'Reviewer Node repository is required through reviewer_node_repository or GITHUB_REPOSITORY.',
    );
  }

  const result = await runReviewerSummaryAction({
    baseUrl: process.env.GITHUB_API_URL || undefined,
    networkRootRepositoryId,
    networkRootRepositoryName,
    reviewerNodeRepository,
    token: input('github_token') || process.env.GITHUB_TOKEN || null,
  });

  const workspace = process.env.GITHUB_WORKSPACE || process.cwd();
  const outputPath = resolve(workspace, result.filename);
  await writeFile(outputPath, result.text, 'utf8');
  console.log(`Reviewer Summary written to ${outputPath}.`);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Shoal Reviewer Summary failed: ${message}`);
  process.exitCode = 1;
}

function input(name) {
  return (process.env[`INPUT_${name.toUpperCase()}`] || '').trim();
}

function requiredInput(name) {
  const value = input(name);
  if (!value) throw new Error(`Missing required Action input: ${name}.`);
  return value;
}

function parsePositiveInteger(value, name) {
  if (!/^[1-9]\\d*$/u.test(value)) {
    throw new Error(`Action input ${name} must be a positive integer.`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new Error(`Action input ${name} exceeds the safe integer range.`);
  }
  return parsed;
}
`;

await rm(buildRoot, { force: true, recursive: true });
await rm(packageRoot, { force: true, recursive: true });

const tscPath = join(repositoryRoot, 'node_modules', 'typescript', 'bin', 'tsc');
const compile = spawnSync(process.execPath, [tscPath, '-p', 'tsconfig.action.json'], {
  cwd: repositoryRoot,
  encoding: 'utf8',
  stdio: 'inherit',
});

if (compile.error) {
  throw compile.error;
}

if (compile.status !== 0) {
  process.exit(compile.status ?? 1);
}

await mkdir(packageRoot, { recursive: true });

const generatedFiles = await listFiles(buildRoot);
for (const sourcePath of generatedFiles) {
  const pathFromBuildRoot = relative(buildRoot, sourcePath);
  const normalized = pathFromBuildRoot.split(sep).join('/');

  if (!isRuntimeFile(normalized)) {
    continue;
  }

  const destinationPath = join(packageRoot, pathFromBuildRoot);
  await mkdir(dirname(destinationPath), { recursive: true });
  await cp(sourcePath, destinationPath);
}

await writeFile(join(packageRoot, 'loader.mjs'), loaderSource, 'utf8');
await writeFile(join(packageRoot, 'main.mjs'), mainSource, 'utf8');

const payloadFiles = (await listFiles(packageRoot))
  .map((path) => relative(packageRoot, path).split(sep).join('/'))
  .sort();

const files = [];
for (const path of payloadFiles) {
  const bytes = await readFile(join(packageRoot, path));
  files.push({
    path,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    size: bytes.byteLength,
  });
}

const manifest = `${JSON.stringify({ formatVersion: 1, files }, null, 2)}\n`;
await writeFile(join(packageRoot, 'package-manifest.json'), manifest, 'utf8');

const finalFiles = await listFiles(packageRoot);
if (finalFiles.length !== files.length + 1) {
  throw new Error('Action package changed while its manifest was being generated.');
}

console.log(`Packaged ${finalFiles.length} files in ${relative(repositoryRoot, packageRoot)}.`);

function isRuntimeFile(path) {
  return (
    (path.startsWith('src/action/') && path.endsWith('.js'))
    || (path.startsWith('src/protocol/') && path.endsWith('.js'))
    || path === 'protocol/review-v1.json'
  );
}

async function listFiles(root) {
  if (!existsSync(root)) {
    return [];
  }

  const results = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      results.push(...await listFiles(path));
      continue;
    }
    if (entry.isFile()) {
      results.push(path);
    }
  }
  return results.sort();
}

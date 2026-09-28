import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const buildRoot = join(repositoryRoot, 'dist', 'action');
const packageRoot = join(repositoryRoot, 'dist', 'action-package');
const runtimeTemplateRoot = join(repositoryRoot, 'scripts', 'action-runtime');

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

for (const runtimeFile of ['loader.mjs', 'main.mjs']) {
  await cp(
    join(runtimeTemplateRoot, runtimeFile),
    join(packageRoot, runtimeFile),
  );
}

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

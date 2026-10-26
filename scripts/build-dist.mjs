// Copy the Worker's ES modules into dist/ for a Workers / Sites deploy.
//
// deploy.manifest.json points at dist/, not at worker/, so what gets uploaded is
// always the output of this step rather than whatever happens to be sitting in
// worker/ at deploy time. Nothing is bundled or minified: the worker is
// dependency-free ES modules using only Web APIs, which is exactly the shape the
// runtime wants, so a copy is the whole build.
//
// Run it with `npm run build:dist` after any change under worker/, then deploy
// with the manifest.
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
// Keep this list in step with the "modules" array in deploy.manifest.json.
const MODULES = ['index.js', 'store.js', 'domain.js', 'email.js', 'ai.js', 'oasis.js'];

const OUT = join(ROOT, 'dist');
await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });

let bytes = 0;
for (const name of MODULES) {
  const source = await readFile(join(ROOT, 'worker', name), 'utf8');
  await writeFile(join(OUT, name), source);
  bytes += Buffer.byteLength(source);
}

console.log(`dist: ${MODULES.length} modules, ${bytes} bytes`);

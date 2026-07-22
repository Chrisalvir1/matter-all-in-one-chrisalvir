import { rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const addonRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(addonRoot, 'dist');

if (path.dirname(dist) !== addonRoot || path.basename(dist) !== 'dist') {
  throw new Error(`Refusing to clean unexpected path: ${dist}`);
}

await rm(dist, { recursive: true, force: true });

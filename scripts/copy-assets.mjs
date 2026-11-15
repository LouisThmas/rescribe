import { cpSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

// tsc only emits JavaScript, so non-code assets are copied by hand.
const assets = [['src/prompts', 'dist/prompts']];

for (const [from, to] of assets) {
  mkdirSync(join(root, to), { recursive: true });
  cpSync(join(root, from), join(root, to), { recursive: true });
}

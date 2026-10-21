// Syntax-checks every .js file under apps/ (the fixture has no TypeScript toolchain).
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const files = [];
const walk = (dir) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path);
    else if (entry.name.endsWith('.js')) files.push(path);
  }
};
walk('apps');
for (const file of files) execFileSync(process.execPath, ['--check', file], { stdio: 'inherit' });
console.log(`typecheck: ${files.length} files clean`);

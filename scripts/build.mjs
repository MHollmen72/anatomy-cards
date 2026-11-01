// Build: validate + compile data, compile TypeScript, assemble the static site in dist/.
// Usage: node scripts/build.mjs            full build
//        node scripts/build.mjs --app-only compile TypeScript only (used by unit tests)
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';

const appOnly = process.argv.includes('--app-only');

function run(cmd, args) {
  const r = spawnSync(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32' });
  if (r.status !== 0) {
    console.error(`\nBuild stopped: "${cmd} ${args.join(' ')}" failed.`);
    process.exit(r.status ?? 1);
  }
}

// 1. TypeScript -> build/app
rmSync('build/app', { recursive: true, force: true });
run('tsc', ['-p', 'tsconfig.json']);
mkdirSync('build/app/vendor/ts-fsrs', { recursive: true });
cpSync('src/vendor/ts-fsrs/index.js', 'build/app/vendor/ts-fsrs/index.js');
if (appOnly) process.exit(0);

// 2. Data: validate every file and compile the deck (fails the build on any error)
run('python3', ['scripts/build_data.py', '--out', 'build/data']);

// 3. Assemble dist/
rmSync('dist', { recursive: true, force: true });
cpSync('public', 'dist', { recursive: true });
cpSync('build/app', 'dist/js', { recursive: true });
mkdirSync('dist/data', { recursive: true });
cpSync('build/data/deck.json', 'dist/data/deck.json');
if (existsSync('images')) cpSync('images', 'dist/images', { recursive: true });
writeFileSync('dist/.nojekyll', '');
console.log('Build complete: dist/');

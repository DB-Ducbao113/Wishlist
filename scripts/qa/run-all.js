// Unified runner for the Dream Vault QA harnesses.
// Usage: node scripts/qa/run-all.js [repoRoot]
//
// F6.6: one command, all suites. The F4 suite's listener A/B needs the pre-F4
// (F3, 93ef2c1) tree; if it is missing it is generated here from git so the
// run is fully self-contained. The tree lands in qa-out/f3-baseline (gitignored).
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

const ROOT = process.argv[2] || path.join(__dirname, '..', '..');
const QA = __dirname;
const QA_OUT = path.join(ROOT, 'qa-out');
const BASELINE = path.join(QA_OUT, 'f3-baseline');

function ensureBaseline() {
  if (fs.existsSync(path.join(BASELINE, 'wishlist.html'))) return;
  fs.mkdirSync(QA_OUT, { recursive: true });
  const tar = path.join(QA_OUT, 'f3-baseline.tar');
  const r = spawnSync('git', ['-c', 'core.autocrlf=false', 'archive', '--format=tar', '-o', tar, '93ef2c1'], { cwd: ROOT, stdio: 'pipe' });
  if (r.status !== 0) { console.error('could not archive 93ef2c1: ' + (r.stderr || '').toString()); return; }
  fs.mkdirSync(BASELINE, { recursive: true });
  const x = spawnSync('tar', ['-xf', tar, '-C', BASELINE], { stdio: 'pipe' });
  fs.rmSync(tar, { force: true });
  if (x.status !== 0) console.error('could not extract baseline: ' + (x.stderr || '').toString());
}

const suites = [
  'syntax.js', 'f1-check.js', 'f2-check.js', 'f3-check.js', 'f4-check.js',
  'f5-check.js', 'f6-check.js', 'v16-qa.js', 'm1-check.js', 'm2-check.js',
  'm3-check.js', 'm4-check.js'
];

ensureBaseline();
const baselineArg = fs.existsSync(path.join(BASELINE, 'wishlist.html')) ? ['--baseline=' + BASELINE] : [];

let failed = 0;
for (const s of suites) {
  console.log('\n================ ' + s + ' ================');
  const args = [path.join(QA, s), ROOT];
  if (s === 'f4-check.js') args.push(...baselineArg);
  const r = spawnSync(process.execPath, args, { stdio: 'inherit' });
  if (r.status !== 0) { failed++; console.log('  -> ' + s + ' FAILED'); }
}
console.log('\n================ SUMMARY ================');
console.log(failed === 0 ? 'ALL SUITES GREEN' : failed + ' SUITE(S) FAILED');
process.exit(failed === 0 ? 0 : 1);

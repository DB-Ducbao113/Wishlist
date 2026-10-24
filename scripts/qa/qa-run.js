// =====================================================================
// UX-05 — QA runner + machine-readable report.
// ---------------------------------------------------------------------
// Runs every suite in the repository, captures each suite's own output,
// and folds the counts into ONE machine-readable report.
//
//   node scripts/qa/qa-run.js            run everything, write the report
//   node scripts/qa/qa-run.js --only f1,f2   run a subset
//   node scripts/qa/qa-run.js --no-run        re-aggregate the JSON on disk
//
// Suites that already write a JSON result file are read from it (exact
// per-check detail). The suites that only print a summary (M1-M4, V16)
// are parsed out of their captured output. Nothing is inferred: every
// number in the report comes from the suite's own output.
// =====================================================================
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const QA = __dirname;
const OUT = path.join(ROOT, 'qa-out');
const BASELINE = path.join(OUT, 'f3-baseline');

const SUITES = [
  { id: 'F1',        file: 'f1-check.js',        json: 'f1-audit-results.json' },
  { id: 'F2',        file: 'f2-check.js',        json: 'f2-results.json' },
  { id: 'F3',        file: 'f3-check.js',        json: 'f3-results.json' },
  { id: 'F4',        file: 'f4-check.js',        json: 'f4-suite.json' },
  { id: 'F5',        file: 'f5-check.js',        json: 'f5-suite.json' },
  { id: 'F6',        file: 'f6-check.js',        json: 'f6-suite.json' },
  { id: 'MOTION-02', file: 'motion-02-check.js', json: 'motion-02-suite.json' },
  { id: 'MOTION-03', file: 'motion-03-check.js', json: 'motion-03-suite.json' },
  { id: 'MOTION-04', file: 'motion-04-check.js', json: 'motion-04-suite.json' },
  { id: 'MOTION-05', file: 'motion-05-check.js', json: 'motion-05-suite.json' },
  { id: 'MOTION-06', file: 'motion-06-check.js', json: 'motion-06-suite.json' },
  { id: 'FUSION-01', file: 'fusion-01-check.js', json: 'fusion-01-suite.json' },
  { id: 'FUSION-02', file: 'fusion-02-check.js', json: 'fusion-02-suite.json' },
  { id: 'FUSION-03', file: 'fusion-03-check.js', json: 'fusion-03-suite.json' },
  { id: 'FUSION-04', file: 'fusion-04-check.js', json: 'fusion-04-suite.json' },
  { id: 'V16',       file: 'v16-qa.js' },
  { id: 'M1',        file: 'm1-check.js' },
  { id: 'M2',        file: 'm2-check.js' },
  { id: 'M3',        file: 'm3-check.js' },
  { id: 'M4',        file: 'm4-check.js' }
];

// A failure whose contract is a wall-clock number is a MEASUREMENT of the
// machine, not a behaviour of the app. It is reported, never hidden, and
// never counted as a functional regression.
const TIMING_IDS = new Set([
  'F4-6-04', 'F4-6-05', 'F6-6-01', 'M3-16', 'M1-16', 'M2-16', 'M4-16'
]);
const TIMING_WORDS = /\b(ms|milliseconds|budget|frame|perf|cheap|cost|cls|layout shift|per second|fps)\b/i;

const isTiming = (id, entry) =>
  TIMING_IDS.has(id) || TIMING_WORDS.test(entry || '');

function ensureBaseline() {
  if (fs.existsSync(path.join(BASELINE, 'wishlist.html'))) return;
  fs.mkdirSync(BASELINE, { recursive: true });
  const tar = path.join(OUT, 'f3-baseline.tar');
  spawnSync('git', ['-c', 'core.autocrlf=false', 'archive', '--format=tar', '-o', tar, '93ef2c1'],
    { cwd: ROOT, stdio: 'pipe' });
  spawnSync('tar', ['-xf', tar, '-C', BASELINE], { stdio: 'pipe' });
  fs.rmSync(tar, { force: true });
}

function parseSummary(text, id) {
  // "F1 AUDIT: 107 PASS / 0 FAIL  (gated total 107)"
  // "==== F4 SUITE: 65 PASS / 0 FAIL (total 65) ===="
  // "FUSION-04 SUITE: 2 FAILED of 111"
  // "M1 RESULT: 28 PASS / 0 FAIL  (total 28)"
  // "QA RESULT: 36 PASS / 0 FAIL  (total 36)"
  let m = text.match(/(\d+)\s+PASS\s*\/\s*(\d+)\s+FAIL[^\d]*\(?(?:gated\s+)?total\s+(\d+)\)?/i);
  if (m) return { pass: +m[1], fail: +m[2], total: +m[3] };
  m = text.match(/(\d+)\s+FAILED\s+of\s+(\d+)/i);
  if (m) return { pass: +m[2] - (+m[1]), fail: +m[1], total: +m[2] };
  return null;
}

function readJsonSuite(s) {
  if (!s.json) return null;
  const p = path.join(OUT, s.json);
  if (!fs.existsSync(p)) return null;
  let j;
  try { j = JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return null; }
  if (!Array.isArray(j.results)) return null;
  // Suites are not uniform: most write `pass`/`entry`, FUSION-04 writes
  // `ok`/`title`. Both are read, and the report always uses one shape.
  const ok = (r) => (r.pass !== undefined ? !!r.pass : !!r.ok);
  const title = (r) => r.entry || r.title || r.name || '';
  return {
    id: s.id,
    source: 'json:' + s.json,
    total: j.results.length,
    pass: j.results.filter(ok).length,
    fail: j.results.filter(r => !ok(r)).length,
    failures: j.results.filter(r => !ok(r)).map(r => ({
      id: r.id,
      section: r.section || r.area || '',
      area: r.area || '',
      entry: title(r),
      expected: r.expected || r.expect || '',
      actual: typeof r.actual === 'string' ? r.actual : JSON.stringify(r.actual || r.detail || ''),
      kind: isTiming(r.id, title(r)) ? 'timing' : 'deterministic'
    }))
  };
}

function main() {
  const argv = process.argv.slice(2);
  const onlyIdx = argv.indexOf('--only');
  const only = onlyIdx > -1 && argv[onlyIdx + 1]
    ? argv[onlyIdx + 1].split(',').map(s => s.trim().toLowerCase())
    : null;
  const noRun = argv.includes('--no-run');
  const outIdx = argv.indexOf('--out');
  const outFile = outIdx > -1 && argv[outIdx + 1]
    ? path.resolve(argv[outIdx + 1])
    : path.join(OUT, 'qa-report.json');

  const list = only
    ? SUITES.filter(s => only.includes(s.id.toLowerCase()) || only.includes(s.file.replace('-check.js', '').replace('.js', '').toLowerCase()))
    : SUITES;

  const logLines = [];
  const summaries = new Map();

  if (!noRun) {
    ensureBaseline();
    for (const s of list) {
      console.log('\n================ ' + s.id + ' (' + s.file + ') ================');
      const args = [path.join(QA, s.file), ROOT];
      if (s.id === 'F4') args.push('--baseline=' + BASELINE);
      const r = spawnSync(process.execPath, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
      const out = (r.stdout || '') + (r.stderr || '');
      process.stdout.write(out);
      logLines.push('@@@SUITE ' + s.id, out);
      const sum = parseSummary(out, s.id);
      if (sum) summaries.set(s.id, sum);
      else summaries.set(s.id, { pass: -1, fail: -1, total: -1 });
    }
    fs.mkdirSync(OUT, { recursive: true });
    fs.writeFileSync(path.join(OUT, 'qa-run.log'), logLines.join('\n'));
  }

  // ---- fold
  const suites = [];
  for (const s of list) {
    const fromJson = readJsonSuite(s);
    if (fromJson) { suites.push(fromJson); continue; }
    const sum = summaries.get(s.id);
    if (!sum) continue;
    suites.push({
      id: s.id,
      source: 'stdout',
      total: sum.total,
      pass: sum.pass,
      fail: sum.fail,
      failures: []
    });
  }

  // Suites that only print a summary cannot name their failing checks, but
  // the COUNT is still exact — read it back from the captured log so a
  // later --no-run re-aggregation keeps them.
  if (!noRun) {
    const parsed = {};
    for (const s of list) {
      const sum = summaries.get(s.id);
      if (sum) parsed[s.id] = sum;
    }
    fs.writeFileSync(path.join(OUT, 'qa-summaries.json'), JSON.stringify(parsed, null, 2));
  } else {
    let parsed = {};
    const p = path.join(OUT, 'qa-summaries.json');
    if (fs.existsSync(p)) parsed = JSON.parse(fs.readFileSync(p, 'utf8'));
    // Fall back to the captured log so a re-aggregation still has the
    // suites that only print a summary.
    const logPath = path.join(OUT, 'qa-run.log');
    if (fs.existsSync(logPath)) {
      const log = fs.readFileSync(logPath, 'utf8');
      const parts = log.split('@@@SUITE ');
      for (const part of parts.slice(1)) {
        const nl = part.indexOf('\n');
        const id = part.slice(0, nl).trim();
        const body = part.slice(nl + 1);
        if (!parsed[id]) {
          const sum = parseSummary(body, id);
          if (sum) parsed[id] = sum;
        }
      }
      fs.writeFileSync(p, JSON.stringify(parsed, null, 2));
    }
    for (const s of list) {
      if (parsed[s.id] && !suites.some(x => x.id === s.id)) {
        suites.push({
          id: s.id, source: 'stdout',
          total: parsed[s.id].total, pass: parsed[s.id].pass, fail: parsed[s.id].fail, failures: []
        });
      }
    }
  }

  const all = suites.flatMap(s => s.failures.map(f => ({ ...f, suite: s.id })));
  const deterministic = all.filter(f => f.kind === 'deterministic');
  const timing = all.filter(f => f.kind === 'timing');

  const report = {
    generatedAt: new Date().toISOString(),
    repo: ROOT,
    head: spawnSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).stdout.trim(),
    totals: {
      suites: suites.length,
      checks: suites.reduce((n, s) => n + s.total, 0),
      pass: suites.reduce((n, s) => n + s.pass, 0),
      fail: all.length,
      deterministicFail: deterministic.length,
      timingFail: timing.length
    },
    suites: suites.map(s => ({ id: s.id, total: s.total, pass: s.pass, fail: s.fail, source: s.source })),
    failures: { deterministic, timing },
    // suites that only print a summary cannot name their failing checks
    summaryOnlySuites: suites.filter(s => s.source === 'stdout' && s.fail > 0).map(s => s.id)
  };

  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify(report, null, 2));

  console.log('\n================ UX-05 QA REPORT ================');
  console.log('head      : ' + report.head);
  console.log('suites    : ' + report.totals.suites);
  console.log('checks    : ' + report.totals.checks);
  console.log('PASS      : ' + report.totals.pass);
  console.log('FAIL      : ' + report.totals.fail +
    '  (deterministic ' + report.totals.deterministicFail +
    ' | timing ' + report.totals.timingFail + ')');
  console.log('');
  suites.forEach(s => console.log(
    '  ' + s.id.padEnd(11) + String(s.pass).padStart(4) + ' / ' + String(s.total).padEnd(5) + ' fail=' + s.fail));
  if (deterministic.length) {
    console.log('\n--- deterministic failures ---');
    deterministic.forEach(f => console.log('  [' + f.suite + '] ' + f.id + '  ' + f.entry));
  }
  if (timing.length) {
    console.log('\n--- timing-sensitive failures (measurements, not behaviours) ---');
    timing.forEach(f => console.log('  [' + f.suite + '] ' + f.id + '  ' + f.entry));
  }
  console.log('\nreport: ' + outFile);
}

main();

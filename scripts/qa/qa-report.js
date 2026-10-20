// =====================================================================
// UX-05 — machine-readable QA aggregator.
// ---------------------------------------------------------------------
// Reads every suite's own JSON result file (the suites already write
// one each) and folds them into ONE report with exact pass/fail counts.
//
// It also classifies every failure:
//   deterministic  — a behaviour that fails the same way every run
//   timing         — a wall-clock / frame-budget measurement, which is
//                    sensitive to machine load and therefore reported
//                    separately instead of being counted as a defect
//
// usage: node scripts/qa/qa-report.js [--out qa-out/qa-report.json]
// =====================================================================
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const OUT = path.join(ROOT, 'qa-out');

// suite id -> the JSON file the suite writes
const SUITES = [
  { id: 'F1',        file: 'f1-audit-results.json' },
  { id: 'F2',        file: 'f2-results.json' },
  { id: 'F3',        file: 'f3-results.json' },
  { id: 'F4',        file: 'f4-suite.json' },
  { id: 'F5',        file: 'f5-suite.json' },
  { id: 'F6',        file: 'f6-suite.json' },
  { id: 'MOTION-02', file: 'motion-02-suite.json' },
  { id: 'MOTION-03', file: 'motion-03-suite.json' },
  { id: 'MOTION-04', file: 'motion-04-suite.json' },
  { id: 'MOTION-05', file: 'motion-05-suite.json' },
  { id: 'MOTION-06', file: 'motion-06-suite.json' },
  { id: 'FUSION-01', file: 'fusion-01-suite.json' },
  { id: 'FUSION-02', file: 'fusion-02-suite.json' },
  { id: 'FUSION-03', file: 'fusion-03-suite.json' },
  { id: 'FUSION-04', file: 'fusion-04-suite.json' },
  { id: 'M1',        file: 'm1-suite.json' },
  { id: 'M2',        file: 'm2-suite.json' },
  { id: 'M3',        file: 'm3-suite.json' },
  { id: 'M4',        file: 'm4-suite.json' },
  { id: 'V16',       file: 'v16-suite.json' }
];

// A failure whose contract is a wall-clock number is a MEASUREMENT, not a
// behaviour. They are reported, never hidden, and never counted as a
// functional regression.
const TIMING_IDS = new Set([
  'F4-6-04', 'F4-6-05', 'F6-6-01', 'M3-16', 'M1-16', 'M2-16'
]);

const isTiming = (id, entry) =>
  TIMING_IDS.has(id) || /\b(ms|budget|frame|perf|cheap|cost|cls|layout shift)\b/i.test(entry || '');

function readSuite(s) {
  const p = path.join(OUT, s.file);
  if (!fs.existsSync(p)) return null;
  let j;
  try { j = JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return null; }
  const results = Array.isArray(j.results) ? j.results : [];
  const pass = results.filter(r => r.pass).length;
  const fail = results.filter(r => !r.pass).length;
  return {
    id: s.id,
    file: s.file,
    total: results.length,
    pass,
    fail,
    failures: results.filter(r => !r.pass).map(r => ({
      id: r.id,
      section: r.section || r.suite || '',
      area: r.area || '',
      entry: r.entry || r.name || '',
      expected: r.expected || '',
      actual: r.actual || '',
      kind: isTiming(r.id, r.entry || r.name) ? 'timing' : 'deterministic'
    }))
  };
}

function main() {
  const argv = process.argv.slice(2);
  const outIdx = argv.indexOf('--out');
  const outFile = outIdx > -1 && argv[outIdx + 1]
    ? path.resolve(argv[outIdx + 1])
    : path.join(OUT, 'qa-report.json');

  const suites = [];
  const missing = [];
  for (const s of SUITES) {
    const r = readSuite(s);
    if (r) suites.push(r); else missing.push(s.id);
  }

  const all = suites.flatMap(s => s.failures.map(f => ({ ...f, suite: s.id })));
  const deterministic = all.filter(f => f.kind === 'deterministic');
  const timing = all.filter(f => f.kind === 'timing');

  const report = {
    generatedAt: new Date().toISOString(),
    repo: ROOT,
    totals: {
      suites: suites.length,
      checks: suites.reduce((n, s) => n + s.total, 0),
      pass: suites.reduce((n, s) => n + s.pass, 0),
      fail: all.length,
      deterministicFail: deterministic.length,
      timingFail: timing.length
    },
    suites: suites.map(s => ({
      id: s.id, total: s.total, pass: s.pass, fail: s.fail, file: s.file
    })),
    failures: { deterministic, timing },
    missingSuites: missing
  };

  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify(report, null, 2));

  // ---- console summary
  const line = (s) => console.log(s);
  line('');
  line('================ UX-05 QA REPORT ================');
  line(`generated : ${report.generatedAt}`);
  line(`suites    : ${report.totals.suites}${missing.length ? ' (missing: ' + missing.join(', ') + ')' : ''}`);
  line(`checks    : ${report.totals.checks}`);
  line(`PASS      : ${report.totals.pass}`);
  line(`FAIL      : ${report.totals.fail}  (deterministic ${report.totals.deterministicFail} | timing ${report.totals.timingFail})`);
  line('');
  line('--- per suite ---');
  suites.forEach(s => line(
    `  ${s.id.padEnd(11)} ${String(s.pass).padStart(4)} / ${String(s.total).padEnd(4)}  fail=${s.fail}`
  ));
  if (deterministic.length) {
    line('');
    line('--- deterministic failures ---');
    deterministic.forEach(f => line(`  [${f.suite}] ${f.id}  ${f.entry}`));
  }
  if (timing.length) {
    line('');
    line('--- timing-sensitive failures (measurements, not behaviours) ---');
    timing.forEach(f => line(`  [${f.suite}] ${f.id}  ${f.entry}`));
  }
  line('');
  line('report: ' + outFile);
}

main();

/** Regenerate reports from executed tests and benchmarks; never edit result JSON manually. */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DT } from '../src/physics/constants';
const dir = mkdtempSync(join(tmpdir(), 'copter-reliability-'));
const testPath = join(dir, 'tests.json');
execFileSync('npm', ['test', '--', '--reporter=json', `--outputFile=${testPath}`], { stdio: ['ignore', 'pipe', 'inherit'] });
const tests = JSON.parse(readFileSync(testPath, 'utf8'));
if (!tests.success || tests.numFailedTests) throw new Error('Tests failed; refusing report generation');
function run(script: string) {
  return execFileSync(process.execPath, ['--import', 'tsx', script], { encoding: 'utf8', maxBuffer: 10_000_000 })
    .split('\n').filter(line => line.startsWith('{')).map(line => JSON.parse(line));
}
const catalog = run('scripts/reliability-benchmark.ts'), additional = run('scripts/adversarial-benchmark.ts');
const date = process.argv.find(x => x.startsWith('--date='))?.slice(7) ?? new Date().toISOString().slice(0, 10);
if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Invalid report date');
const provenance = { command: `node --import tsx scripts/audit-reliability.ts --date=${date}`,
  sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  note: 'Regenerated current-checkout software regression. Previous dated reports remain in git history; historical test counts are not asserted for this checkout.' };
const common = { date, scope: 'Current-checkout headless software regression; simulation only; no physical validation',
  physicalValidation: false, unitTestsPassed: tests.numPassedTests, provenance };
const v2 = { simulatorVersion: 'reliability-v2', ...common,
  protocol: { episodesPerCatalogBatch: 50, maxSteps: 1000, dtSeconds: DT, initialAltitudeM: [.5, 1.5],
    initialRollPitchRad: [-.2, .2], seeds: [42, 2026, 8675309], faults: false, domainRandomization: false },
  hoverCatalog: catalog, adversarialAndLongerMissions: additional };
const v3 = { simulatorVersion: 'reliability-v3', ...common, catalogEpisodes: catalog.length * 50,
  additionalEpisodes: additional.reduce((n, r) => n + r.episodes, 0), catalog, additional };
for (const [file, value] of [['reports/reliability-v2.json', v2], ['reports/reliability-v3.json', v3]] as const)
  writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
console.log(JSON.stringify({ testsPassed: tests.numPassedTests, catalogEpisodes: v3.catalogEpisodes, additionalEpisodes: v3.additionalEpisodes }));

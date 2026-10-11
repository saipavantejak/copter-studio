"""Generate status/claim tables from retained evidence; no simulator execution."""
import csv,io,json,math,re,sys
from pathlib import Path
root=Path(__file__).resolve().parents[2]
load=lambda p:json.loads((root/p).read_text())
checks=[]
def add(claim,source,value,status='PASS',note=''):
 checks.append({'claim':claim,'source':source,'value':str(value),'status':status,'note':note})
for path in ['reports/integrity/independent-verifier.json','reports/physics/independent-verifier.json']:
 p=load(path)
 if p['failed']:raise SystemExit('Real metric discrepancy: '+path)
 add('Independent recomputations passed',path,p['passed'])
 add('Independent recomputations failed',path,p['failed'])
 for c in p['checks']:
  add(c.get('claim',c.get('metric','metric')),c.get('source',path),json.dumps(c.get('recomputed',c.get('computed'))),c['status'],'Independent raw-record recomputation')
for path in ['reports/quality/coverage-before.json','reports/quality/coverage-after.json','reports/quality/coverage-current.json']:
 p=load(path)
 for metric,m in p['total'].items():
  expected=math.floor((100*m['covered']/m['total'] if m['total'] else 100)*100)/100
  if abs(expected-m['pct'])>1e-8:raise SystemExit('Coverage percentage mismatch: '+path+metric)
  add('Global coverage '+metric,path,m['pct'],note='Independently computed from covered/total native counters, not line-by-line test adequacy')
flags=load('tsconfig.json')['compilerOptions'];server=load('server/tsconfig.server.json')['compilerOptions']
assert flags['strict'] is True and server['strict'] is True
add('Strict compiler configuration','tsconfig.json; server/tsconfig.server.json',True)
r=load('reports/reliability-v3.json');add('Recorded passing software tests','reports/reliability-v3.json',r['unitTestsPassed'])
for stage in ['before','after']:
 p=load('reports/product/browser-'+stage+'.json')
 for x in p['records']:
  status='PASS' # Numbers are grounded in raw observations; baseline behavior failed.
  add(x['name']+' document/viewport width','reports/product/browser-'+stage+'.json',f"{x['state']['documentWidth']}/{x['state']['viewportWidth']}",status,'Verified raw number; baseline defects retained, not performance measurements')
  add(x['name']+' uncaught exceptions','reports/product/browser-'+stage+'.json',len(x['uncaught']),status)
  if stage=='after':
   if x['uncaught'] or x['errors'] or x['state']['documentWidth']>x['state']['viewportWidth'] or not x['hiddenWorkspace']['inert']:raise SystemExit('Browser evidence does not pass')
h=load('reports/security/history-key-scan.json');b=load('reports/security/client-bundle.json')
for key in ['reachableCommits','textBlobsScanned','binaryBlobsExcluded']:add(key,'reports/security/history-key-scan.json',h[key],note='Historical signature scan; excluded binary data are not inspected')
add('Observed key-shaped findings','reports/security/history-key-scan.json',len(h['findings']))
add('Synthetic bundle files scanned','reports/security/client-bundle.json',b['filesScanned'])
add('Synthetic key leaks','reports/security/client-bundle.json',len(b['leaks']))
add('Real deployed key/history exhaustiveness','docs/SECURITY.md','Not established','UNVERIFIED','No observed exposure; unknown formats and external deployments not certified')
add('Hosted analytics deployment','docs/PRIVACY.md','Not deployed/tested','BLOCKED','Default off; no hosted schema or environment change')
add('Lighthouse scores','reports/product/before/lighthouse-desktop-1.json','Null; not measured','BLOCKED','Skipped by user instruction in this continuation')
add('Ablation / PPO comparison','User-authorized scope','Not run','BLOCKED','Explicitly excluded this round')
# Numeric-bearing lines in maintained generated documents are checked by their
# whole-file renderers in CI. Authored legacy lines remain explicitly unverified.
verified={'README.md':'scripts/docs/render-project.py; reports/study/final.json; reports/reliability-v3.json',
 'docs/INTERVIEW.md':'scripts/docs/render-project.py; src/physics/core.ts; src/physics/constants.ts; scripts/learning/study/experiment.ts',
 'docs/RESUME.md':'scripts/docs/render-project.py; reports/study/final.json',
 'docs/PRIVACY.md':'scripts/docs/render-privacy.py; supabase/analytics-schema.sql',
 'docs/SECURITY.md':'scripts/security/render-report.py; reports/security/*.json; server/geminiGateway.ts'}
for file in [root/'README.md',*sorted((root/'docs').glob('*.md')),root/'scripts/learning/README.md']:
 path=str(file.relative_to(root))
 for line,text in enumerate(file.read_text().splitlines(),1):
  if re.search(r'\d',text):add(text,path+':'+str(line),verified.get(path,'No complete line extractor'), 'PASS' if path in verified else 'UNVERIFIED','Generated whole-file check' if path in verified else 'Historical prose/metadata; not an independent numeric certification')
text='''# Continuation status

Local quality work completed within the requested scope; no deployment or push.
This is scoped evidence, not a claim that every historical document or physical
model is fully validated. Policy results are unchanged; physicalValidation=false
and promoted=false. No ablation or PPO training occurred.

| Check | Result | Evidence |
|---|---|---|
'''
for path in ['reports/integrity/independent-verifier.json','reports/physics/independent-verifier.json']:
 p=load(path);text+=f"| Independent recomputation | {p['passed']} PASS, {p['failed']} FAIL | {path} |\n"
text+=f"| Software tests | {r['unitTestsPassed']} passed | reports/reliability-v3.json |\n"
text+='''| Strict types | Enabled in browser/root and server; checks pass | tsconfig.json; server/tsconfig.server.json |
| Coverage thresholds | Enabled; modest global floors and stronger rigid-body core floor | vite.config.ts |
| Final-stage determinism | Existing frozen replay proof retained; two identical clean-worktree replays | reports/integrity/final-determinism.json |
| Key exposure | No observed client or reachable text-history key exposure; not exhaustive proof | docs/SECURITY.md |
| Browser regressions | Local desktop, mobile and forced-unavailable WebGL pass | reports/product/browser-after.json |
| Hosted analytics | BLOCKED: not deployed; collection defaults off | docs/PRIVACY.md |
| Lighthouse | BLOCKED/skipped; no performance claim | Retained invalid raw report |
| Historical authored claim lines | UNVERIFIED where no extractor exists | reports/quality/number-to-source.csv |

## Maintainability before/after

Compiler strict mode was absent/disabled at the starting commit and is now enabled.
The first strict diagnostic is retained as strict-before.txt; it included newly
added analytics typing gaps during implementation, not just original defects.
Coverage was not enforced before. The before measurement is the first instrumented
run, not a measurement of the starting checkout. After/current are native test
outputs; their small differences do not establish improved test effectiveness.
Uncovered UI, bridge and worker code remains included and visible.

| Metric | First measured coverage | After maintainability | Current product coverage |
|---|---:|---:|---:|
'''
for k in ['statements','branches','functions','lines']:
 vals=[load('reports/quality/coverage-'+p+'.json')['total'][k]['pct'] for p in ['before','after','current']]
 text+='| '+k+' | '+' | '.join(str(v)+'%' for v in vals)+' |\n'
text+='''
The complete number/status/source table is number-to-source.csv. Study and
physics rows include independent raw-record recomputation; document rows cite
their checkable generators. UNVERIFIED historical prose is not silently upgraded
to PASS. Generated document checks, independent verifiers, inventory drift
checking, strict types, coverage tests, build and key canaries run in CI.

## Product evidence and environment

Preview and browser share one command network. The baseline's remote HDR crash,
mobile overflow and missing keyboard/WebGL boundaries are retained. Repairs do
not modify physics or controller decisions. Fonts and lighting now work without
remote asset downloads. Startup checks read configuration metadata, not a paid
AI ping. Configuration is explicitly not provider-health verification.

Browser results are local observations, not Lighthouse metrics or universal
accessibility certification. The forced-unavailable WebGL case shows a clear
fallback and disables interactive simulation; Benchmark navigation remains
usable. The demo deliverable is a script, not claimed recorded footage.

## Reproduce

```sh
npm ci
npm run lint
npm run type-check:server
npm run test:coverage
npm run build
node scripts/learning/verify-study-independent.mjs
python scripts/physics/verify-flight.py
python scripts/learning/check-inventory.py
python scripts/docs/render-project.py --check
python scripts/docs/render-privacy.py --check
python scripts/security/render-report.py --check
python scripts/quality/render-status.py --check
python scripts/security/check-client-bundle.py --check
# User machine, after installing the Playwright browser:
npx playwright-core install chromium
node scripts/product/check-browser.mjs after
node scripts/product/capture-demo.mjs
```

Do not retrain or rerun final-stage evaluation in this consumed checkout.
See docs/RESUME.md for the absolute-value supported resume statement and
reports/physics/comparison.md for the negative physical diagnostic, all flight
metrics, descriptive intervals and independent flight units.
'''
buffer=io.StringIO();writer=csv.DictWriter(buffer,fieldnames=['claim','source','value','status','note'],lineterminator='\n');writer.writeheader();writer.writerows(checks)
for path,data in [('reports/quality/STATUS.md',text),('reports/quality/number-to-source.csv',buffer.getvalue())]:
 file=root/path
 if '--check' in sys.argv:
  if not file.exists() or file.read_text()!=data:raise SystemExit('Status/number table drift: '+path)
 else:file.write_text(data)
print('Quality status and numeric sources: PASS; unverified and blocked items retained')

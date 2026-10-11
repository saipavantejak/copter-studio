"""CI connects the recorded test count to the actual fresh Vitest run."""
import json,sys
from pathlib import Path
root=Path(__file__).resolve().parents[2]
run=json.loads(Path(sys.argv[1]).read_text())
expected=json.loads((root/'reports/reliability-v3.json').read_text())['unitTestsPassed']
if run['numPassedTests']!=expected or run['numFailedTests'] or not run['success']:
 raise SystemExit('Fresh tests disagree with recorded software count; regenerate with audit-reliability.ts')
print('Fresh test count agrees with recorded artifact:',expected)

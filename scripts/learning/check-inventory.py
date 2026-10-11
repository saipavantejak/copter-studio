"""Fail CI if the recorded inventory differs from generator output."""
from pathlib import Path
import subprocess
root=Path(__file__).resolve().parents[2]
paths=[root/'reports/numeric-claims-original.csv',root/'reports/numeric-claims-final.csv.gz']
expected={p:p.read_bytes() for p in paths}
try:
 subprocess.run(['python','scripts/learning/audit-claims.py'],cwd=root,check=True)
 changed=[str(p.relative_to(root)) for p in paths if p.read_bytes()!=expected[p]]
 if changed: raise SystemExit('Inventory drift: '+', '.join(changed))
 print('Artifact-derived inventory: PASS (unparsed authored lines remain UNVERIFIED)')
finally:
 for p,data in expected.items():p.write_bytes(data)

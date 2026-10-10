"""Negative control: mutate a copied resume claim, expect verifier rejection.

No controller is executed. The real docs and result artifacts are untouched.
"""
import json,pathlib,subprocess,tempfile
ROOT=pathlib.Path(__file__).resolve().parents[2]
with tempfile.TemporaryDirectory(prefix='copter-claim-negative-control-') as tmp:
 folder=pathlib.Path(tmp)/'worktree'
 subprocess.run(['git','worktree','add','--detach',str(folder),'HEAD'],cwd=ROOT,check=True,capture_output=True)
 try:
  path=folder/'reports/ml-evaluation-audit.md'
  text=path.read_text();marker='## Supported resume statement\n\n'
  before,resume=text.split(marker,1)
  import re
  def corrupt(match):return str(float(match[1])+1)+'%'
  changed=re.sub(r'(\d+\.\d+)%',corrupt,resume,count=1)
  if changed==resume:raise RuntimeError('No numeric resume claim found to test')
  path.write_text(before+marker+changed)
  result=subprocess.run(['node','scripts/learning/verify-study-independent.mjs'],cwd=folder,capture_output=True,text=True)
  evidence=json.loads((folder/'reports/integrity/independent-verifier.json').read_text())
  failed=[c for c in evidence['checks'] if c['status']=='FAIL']
  if result.returncode!=1 or not any(c['claim']=='actual resume altitude reduction (%)' for c in failed):
   raise RuntimeError('Claim drift escaped verifier: '+result.stdout+result.stderr)
  report={'status':'PASS','scope':'Deliberately corrupted copied resume claim rejected; no real claim or result changed.',
    'command':'node scripts/learning/verify-study-independent.mjs','sourceCommit':subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip(),
    'expectedExitCode':1,'actualExitCode':result.returncode,'detectedFailures':failed}
  (ROOT/'reports/integrity/claim-drift-negative-control.json').write_text(json.dumps(report,indent=2)+'\n')
  print('PASS: deliberate copied resume drift causes verifier exit 1.')
 finally:subprocess.run(['git','worktree','remove','--force',str(folder)],cwd=ROOT,check=True,capture_output=True)

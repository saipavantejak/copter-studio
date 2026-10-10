"""Replay only the frozen final stage twice; never train, select, or tune.

The historical source/selection commit is taken from the final artifact.
Tracked files must be clean before both executions. Results are compared as
bytes, including provenance, with no normalization or timestamp stripping.
Run with the exact recorded Node version. --reuse-dependencies shares the
installed dependencies from the same unchanged lockfile; otherwise npm ci.
"""
import argparse,hashlib,json,pathlib,subprocess,tempfile

ROOT=pathlib.Path(__file__).resolve().parents[2]
parser=argparse.ArgumentParser()
parser.add_argument('--reuse-dependencies',action='store_true')
args=parser.parse_args()
run=lambda cmd,cwd=ROOT:subprocess.check_output(cmd,cwd=cwd,stderr=subprocess.STDOUT)
sha=lambda b:hashlib.sha256(b).hexdigest()
artifact=json.loads((ROOT/'reports/study/final.json').read_text())
commit=artifact['provenance']['sourceCommit']
command=['node','--import','tsx','scripts/learning/study/run-study.ts','--stage=final']
files=['reports/study/final-attempt.json','reports/study/final.json',
       'public/learning/residual-policy.json','src/learning/rl-summary.json']
if run(['node','--version']).decode().strip()!=artifact['provenance']['node']:
 raise SystemExit('Use recorded Node runtime '+artifact['provenance']['node']+'; no replay attempted')
if args.reuse_dependencies:
 if sha(run(['git','show',commit+':package-lock.json']))!=sha((ROOT/'package-lock.json').read_bytes()):
  raise SystemExit('Dependency lock differs from frozen source; omit --reuse-dependencies')
outputs=[];worktrees=[]
try:
 with tempfile.TemporaryDirectory(prefix='copter-final-replay-') as temporary:
  for index in range(2):
   folder=pathlib.Path(temporary)/str(index)
   run(['git','worktree','add','--detach',str(folder),commit]);worktrees.append(folder)
   if run(['git','status','--porcelain'],folder):raise RuntimeError('Worktree not clean before replay')
   if args.reuse_dependencies:
    # Keep node_modules itself a directory: git's node_modules/ ignore rule
    # does not ignore a symlink named node_modules.
    dependencies=folder/'node_modules';dependencies.mkdir()
    for entry in (ROOT/'node_modules').iterdir():
     (dependencies/entry.name).symlink_to(entry,target_is_directory=entry.is_dir())
   else:run(['npm','ci'],folder)
   if run(['git','status','--porcelain'],folder):raise RuntimeError('Dependency install changed tracked source')
   print('Executing frozen final-stage replay '+str(index+1),flush=True)
   stdout=run(command,folder)
   outputs.append({**{p:(folder/p).read_bytes() for p in files},'stdout':stdout})
   if index==1:
    for name in outputs[0]:
     if outputs[0][name]!=outputs[1][name]:raise RuntimeError('Bit-for-bit replay mismatch: '+name)
   for name in files:
    if outputs[index][name]!=(ROOT/name).read_bytes():raise RuntimeError('Replay differs from committed artifact: '+name)
  report={'status':'PASS','sourceCommit':commit,'node':artifact['provenance']['node'],
   'command':' '.join(command),'replayCount':2,'trackedSourceCleanBeforeEachRun':True,
   'dependencyMode':'shared installed dependency tree, identical lockfile' if args.reuse_dependencies else 'npm ci per worktree',
   'packageLockSha256':sha(run(['git','show',commit+':package-lock.json'])),
   'comparisons':[{'file':name,'replay1Sha256':sha(outputs[0][name]),'replay2Sha256':sha(outputs[1][name]),
      'matchesCommittedArtifact':True if name!='stdout' else None,'status':'PASS'} for name in outputs[0]],
   'scope':'Exact frozen final-stage evaluation replay only. Not a new test, not retraining, not proof of determinism for every other experiment.'}
  (ROOT/'reports/integrity/final-determinism.json').write_text(json.dumps(report,indent=2)+'\n')
  print('PASS: both clean-worktree replays match byte-for-byte and all four committed artifacts.',flush=True)
finally:
 for folder in worktrees:subprocess.run(['git','worktree','remove','--force',str(folder)],cwd=ROOT,check=True)

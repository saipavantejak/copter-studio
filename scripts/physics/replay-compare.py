"""Execute the preregistered diagnostic twice in clean committed worktrees."""
import hashlib,json,pathlib,subprocess,sys,tempfile
ROOT=pathlib.Path(__file__).resolve().parents[2]
dataset=str(pathlib.Path(sys.argv[1]).resolve())
revision=subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip()
artifacts=[]
with tempfile.TemporaryDirectory(prefix='copter-physics-replay-') as tmp:
 for i in range(2):
  folder=pathlib.Path(tmp)/str(i)
  subprocess.run(['git','worktree','add','--detach',str(folder),revision],cwd=ROOT,check=True,capture_output=True)
  try:
   dependencies=folder/'node_modules';dependencies.mkdir()
   for p in (ROOT/'node_modules').iterdir():(dependencies/p.name).symlink_to(p,target_is_directory=p.is_dir())
   if subprocess.check_output(['git','status','--porcelain'],cwd=folder):raise RuntimeError('Source not clean')
   print('Physical diagnostic replay '+str(i+1),flush=True)
   subprocess.run(['node','--import','tsx','scripts/physics/compare-flight.ts',dataset],cwd=folder,check=True,stdout=subprocess.DEVNULL)
   subprocess.run(['python','scripts/physics/verify-flight.py'],cwd=folder,check=True)
   artifacts.append({name:(folder/name).read_bytes() for name in ['reports/physics/flight-comparison.json','reports/physics/independent-verifier.json']})
  finally:subprocess.run(['git','worktree','remove','--force',str(folder)],cwd=ROOT,check=True,capture_output=True)
 for name in artifacts[0]:
  if artifacts[0][name]!=artifacts[1][name]:raise RuntimeError('Physical diagnostic byte mismatch: '+name)
  (ROOT/name).write_bytes(artifacts[0][name])
 report={'status':'PASS','sourceCommit':revision,'command':'node --import tsx scripts/physics/compare-flight.ts DATASET_CHECKOUT','datasetCommit':'2d921b57d166fe2debe08a5d39bd07297c5abc39','replayCount':2,'comparisons':[{'file':name,'sha256':hashlib.sha256(artifacts[0][name]).hexdigest(),'status':'PASS'} for name in artifacts[0]]}
 (ROOT/'reports/physics/determinism.json').write_text(json.dumps(report,indent=2)+'\n')
 print('PASS: physical diagnostic outputs and independent metric checks agree bit-for-bit.')

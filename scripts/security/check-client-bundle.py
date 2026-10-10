"""Build with synthetic keys; fail if any canary enters any client output."""
import argparse,hashlib,json,os,pathlib,subprocess,tempfile
parser=argparse.ArgumentParser();parser.add_argument('--check',action='store_true',help='Check fresh build without replacing recorded evidence');args=parser.parse_args()
ROOT=pathlib.Path(__file__).resolve().parents[2]
canaries={name:'COPTER_SYNTHETIC_SECRET_'+name+'_NEVER_SHIP' for name in ['GEMINI_API_KEY','VITE_GEMINI_API_KEY','VITE_GOOGLE_API_KEY']}
sourceCommit=subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip()
sourceHashes={}
for name in ['scripts/security/check-client-bundle.py','vite.config.ts','src/geminiClient.ts','server/geminiGateway.ts','api/gemini.ts','package-lock.json']:
 data=(ROOT/name).read_bytes();committed=subprocess.check_output(['git','show',sourceCommit+':'+name],cwd=ROOT)
 if data!=committed:raise SystemExit('Commit security source before checking: '+name)
 sourceHashes[name]=hashlib.sha256(data).hexdigest()
with tempfile.TemporaryDirectory(prefix='copter-bundle-key-check-') as folder:
 subprocess.run(['node','node_modules/vite/bin/vite.js','build','--outDir',folder],cwd=ROOT,env={**os.environ,**canaries},check=True)
 paths=[p for p in pathlib.Path(folder).rglob('*') if p.is_file()];leaks=[]
 for p in paths:
  data=p.read_bytes()
  for name,value in canaries.items():
   if value.encode() in data:leaks.append({'file':str(p.relative_to(folder)),'syntheticCanary':name})
 report={'status':'FAIL' if leaks else 'PASS','command':'python scripts/security/check-client-bundle.py','sourceCommit':sourceCommit,'sourceHashes':sourceHashes,'filesScanned':len(paths),'syntheticKeyNames':list(canaries),'leaks':leaks,'scope':'Actual Vite build canary test, including accidentally VITE-prefixed Gemini/Google keys. No real key is printed or embedded by the test.'}
 if not args.check:(ROOT/'reports/security/client-bundle.json').write_text(json.dumps(report,indent=2)+'\n')
 if leaks:raise SystemExit('Synthetic API key leaked into client bundle: '+json.dumps(leaks))
 print('PASS: no synthetic server or VITE-prefixed API key appears in any client output.')

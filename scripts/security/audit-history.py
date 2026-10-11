"""Scan reachable git text blobs without printing candidate secrets."""
import hashlib,json,re,subprocess
from pathlib import Path
root=Path(__file__).resolve().parents[2]
def git(*args):return subprocess.check_output(['git',*args],cwd=root)
objects=git('rev-list','--objects','--all').decode().splitlines()
process=subprocess.Popen(['git','cat-file','--batch'],cwd=root,stdin=subprocess.PIPE,stdout=subprocess.PIPE)
text_count=binary_count=0;findings=[]
for obj in objects:
 oid,_,path=obj.partition(' ')
 process.stdin.write((oid+'\n').encode());process.stdin.flush()
 header=process.stdout.readline().decode().split()
 if len(header)!=3:raise RuntimeError('git object unavailable')
 data=process.stdout.read(int(header[2]));assert process.stdout.read(1)==b'\n'
 if header[1]!='blob':continue
 try:text=data.decode('utf8')
 except UnicodeDecodeError:binary_count+=1;continue
 if '\x00' in text:binary_count+=1;continue
 text_count+=1
 for match in re.finditer(r'AIza[0-9A-Za-z_-]{35}',text):
  findings.append({'blob':oid,'path':path,'candidateSha256':hashlib.sha256(match[0].encode()).hexdigest(),'classification':'GOOGLE_KEY_SHAPED_LITERAL; validity not tested'})
process.stdin.close();process.wait()
report={'sourceCommit':git('rev-parse','HEAD').decode().strip(),'command':'python scripts/security/audit-history.py','reachableCommits':len(git('rev-list','--all').splitlines()),'textBlobsScanned':text_count,'binaryBlobsExcluded':binary_count,'signature':'AIza followed by 35 Google-key characters','findings':findings,'status':'REVIEW REQUIRED' if findings else 'PASS','limitations':['Pattern scan, not proof no secret of any possible format ever existed.','Only locally reachable git history; unreferenced objects, external clones, deployed environment and provider key validity were not inspected.','Binary blobs excluded; no secret values emitted.']}
(root/'reports/security/history-key-scan.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({k:report[k] for k in ['status','reachableCommits','textBlobsScanned','binaryBlobsExcluded']}))
if findings:raise SystemExit('Potential key found; see redacted record, do not publish a no-exposure claim')

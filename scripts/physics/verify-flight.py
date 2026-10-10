"""Independently recompute diagnostic metrics/CIs from raw saved states.
Standard library only; no production simulator/analysis imports.
"""
import json,math,pathlib
ROOT=pathlib.Path(__file__).resolve().parents[2]
report=json.loads((ROOT/'reports/physics/flight-comparison.json').read_text())
checks=[]
def check(path,actual,claimed):
 equal=(len(actual)==len(claimed) and all(math.isclose(a,b,rel_tol=1e-8,abs_tol=1e-8) for a,b in zip(actual,claimed))) if isinstance(actual,list) else math.isclose(actual,claimed,rel_tol=1e-8,abs_tol=1e-8)
 checks.append({'source':'reports/physics/flight-comparison.json#'+path,'recomputed':actual,'reported':claimed,'status':'PASS' if equal else 'FAIL'})
def errors(a,b):
 norm=lambda x:math.sqrt(sum(v*v for v in x))
 delta=lambda offset:norm([a[i]-b[i] for i in range(offset,offset+3)])
 aq,bq=a[6:10],b[6:10];an,bn=norm(aq),norm(bq)
 dot=sum(x/an*y/bn for x,y in zip(aq,bq))
 return [delta(0),delta(3),2*math.acos(min(1,abs(dot))),delta(10)]
def mulberry(seed):
 state=seed or 1;mask=0xffffffff
 while True:
  state=(state+0x6d2b79f5)&mask
  z=((state^(state>>15))*(state|1))&mask
  z=(z^((z+((z^(z>>7))*(z|61)&mask))&mask))&mask
  yield ((z^(z>>14))&mask)/4294967296
computed=[]
for f in report['flights']:
 perflight=[]
 for horizon in [1,50]:
  rows=[r for r in f['records'] if r['horizonSteps']==horizon]
  metrics=[]
  for r in rows:check(f['filename']+'/'+str(r['startRow'])+'/'+str(horizon)+'/errors',errors(r['predicted'],r['reference']),r['errors'])
  for i in range(4):metrics.append(math.sqrt(sum(errors(r['predicted'],r['reference'])[i]**2 for r in rows)/len(rows)))
  registered=f['metrics'][len(perflight)]
  check(f['filename']+'/'+str(horizon)+'/windows',len(rows),registered['windows'])
  check(f['filename']+'/'+str(horizon)+'/rmse',metrics,registered['rmse'])
  perflight.append(metrics)
 computed.append(perflight)
for h,summary in enumerate(report['summary']):
 check('summary/'+str(h)+'/units',len(computed),summary['independentFlightUnits'])
 for m,metric in enumerate(summary['metrics']):
  values=[flight[h][m] for flight in computed];estimate=sum(values)/len(values)
  check('summary/'+str(h)+'/'+str(m)+'/estimate',estimate,metric['estimate'])
  random=mulberry(940001+h*10+m);draws=[]
  check('bootstrap seed',940001+h*10+m,metric['bootstrapSeed']);check('bootstrap count',10000,metric['bootstrapReplicates'])
  for _ in range(10000):draws.append(sum(values[int(next(random)*3)] for _ in range(3))/3)
  draws.sort()
  def q(p):
   x=(len(draws)-1)*p;i=int(x);t=x-i
   return draws[i]*(1-t)+draws[min(i+1,len(draws)-1)]*t
  check('summary/'+str(h)+'/'+str(m)+'/ci95',[q(.025),q(.975)],metric['ci95'])
failed=[c for c in checks if c['status']=='FAIL']
(ROOT/'reports/physics/independent-verifier.json').write_text(json.dumps({'checks':checks,'passed':len(checks)-len(failed),'failed':len(failed)},indent=2)+'\n')
print(f"Independent physical diagnostic: {len(checks)-len(failed)} PASS; {len(failed)} FAIL")
if failed:
 print(json.dumps(failed,indent=2));raise SystemExit(1)

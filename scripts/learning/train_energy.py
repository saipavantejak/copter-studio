"""Measured cruise-performance experiment; explicit forward/backward passes and Adam.
Downloads one immutable author-provided CSV to a caller-selected cache; never executes source code.
"""
import argparse,collections,csv,hashlib,json,math,pathlib,urllib.request
import numpy as np
from sklearn.linear_model import Ridge
from sklearn.cluster import KMeans

ROOT=pathlib.Path(__file__).resolve().parents[2]
URL='https://raw.githubusercontent.com/thiago-a-rod/energy_consumption/3058a25a7092633e05a3fe169c6ae3b967636b9d/MLModel/data/data_clean_cruise.csv'
SHA='9e480aa860f701ad2c6769948fc3c1be20ac1c591122ca73afc3ca6b5587a21a'
FEATURES=['payloadKg','meanGroundSpeedMps','meanAbsVerticalSpeedMps','meanOnboardAirflowMps','stdOnboardAirflowMps','meanAltitudeM']

def forward(x,p):
 h=np.tanh(x@p['w1']+p['b1']);return h@p['w2']+p['b2'],h

def loss_grad(x,y,p,l2=.001):
 pred,h=forward(x,p);err=pred-y;loss=np.mean(err**2)+l2*(np.sum(p['w1']**2)+np.sum(p['w2']**2))
 out=2*err/len(x);hidden=(out@p['w2'].T)*(1-h*h)
 return float(loss),{'w1':x.T@hidden+2*l2*p['w1'],'b1':hidden.sum(axis=0),'w2':h.T@out+2*l2*p['w2'],'b2':out.sum(axis=0)}

def gradient_check():
 rng=np.random.default_rng(7);x=rng.normal(size=(4,6));y=rng.normal(size=(4,1));p=init(rng)
 _,grad=loss_grad(x,y,p);worst=0
 for key in p:
  for flat in range(min(p[key].size,6)):
   ix=np.unravel_index(flat,p[key].shape);v=p[key][ix];p[key][ix]=v+1e-5;hi=loss_grad(x,y,p)[0];p[key][ix]=v-1e-5;lo=loss_grad(x,y,p)[0];p[key][ix]=v
   worst=max(worst,abs((hi-lo)/2e-5-grad[key][ix]))
 assert worst<1e-6,('Backpropagation gradient mismatch',worst)
 return worst

def init(rng):return {'w1':rng.normal(0,1/np.sqrt(6),(6,12)),'b1':np.zeros(12),'w2':rng.normal(0,1/np.sqrt(12),(12,1)),'b2':np.zeros(1)}
def score(y,p):
 e=p-y;return {'maeW':float(np.abs(e).mean()),'rmseW':float(np.sqrt((e*e).mean())),'meanAbsolutePercentError':float(100*np.abs(e/y).mean()),'maxAbsoluteErrorW':float(np.abs(e).max())}

def run(cache):
 path=pathlib.Path(cache)/'data_clean_cruise.csv';path.parent.mkdir(parents=True,exist_ok=True)
 if not path.exists():
  with urllib.request.urlopen(URL,timeout=40) as r:raw=r.read(40_000_000)
  if hashlib.sha256(raw).hexdigest()!=SHA:raise ValueError('Source checksum mismatch; refusing training')
  path.write_bytes(raw)
 raw=path.read_bytes()
 if hashlib.sha256(raw).hexdigest()!=SHA:raise ValueError('Cached source checksum mismatch')
 grouped=collections.defaultdict(list)
 for r in csv.DictReader(raw.decode().splitlines()):
  grouped[int(r['flight'])].append([float(r[k]) for k in ['time','wind_speed','twist_linear_x','twist_linear_y','twist_linear_z','payload','y','position_z']])
 records=[]
 for flight,rows in sorted(grouped.items()):
  a=np.array(rows);t=a[:,0];duration=t[-1]-t[0]
  if not np.isfinite(a).all() or (np.diff(t)<=0).any() or duration<=0:raise ValueError('Invalid flight samples')
  if len(np.unique(a[:,5]))!=1:raise ValueError('Payload changes within flight')
  mean=lambda v:float(np.trapezoid(v,t)/duration)
  airflow=mean(a[:,1]);features=[float(a[0,5]/1000),mean(np.hypot(a[:,2],a[:,3])),mean(np.abs(a[:,4])),airflow,float(np.sqrt(mean((a[:,1]-airflow)**2))),mean(a[:,7])]
  records.append({'flightId':flight,'samples':len(rows),'features':features,'meanPowerW':mean(a[:,6]),'observedCruiseDurationSeconds':float(duration),'integratedCruiseEnergyJ':float(np.trapezoid(a[:,6],t)),'largestSamplingGapSeconds':float(np.diff(t).max())})
 x=np.array([r['features'] for r in records]);y=np.array([r['meanPowerW'] for r in records])[:,None]
 rng=np.random.default_rng(42);order=rng.permutation(len(records));n=len(order)
 a,b,c=int(n*.55),int(n*.70),int(n*.85)
 train,val,cal,test=order[:a],order[a:b],order[b:c],order[c:]
 mean=x[train].mean(axis=0);scale=x[train].std(axis=0);scale[scale==0]=1;z=(x-mean)/scale
 ym=y[train].mean();ys=y[train].std();target=(y-ym)/ys
 p=init(np.random.default_rng(314159));initial={k:v.copy() for k,v in p.items()};m={k:np.zeros_like(v) for k,v in p.items()};v={k:np.zeros_like(v) for k,v in p.items()}
 best=float('inf');best_epoch=0;best_params=None;history=[]
 for epoch in range(1,4001):
  loss,grad=loss_grad(z[train],target[train],p)
  for key in p:
   m[key]=.9*m[key]+.1*grad[key];v[key]=.999*v[key]+.001*grad[key]**2
   p[key]-=.005*(m[key]/(1-.9**epoch))/(np.sqrt(v[key]/(1-.999**epoch))+1e-8)
  vl=float(np.mean((forward(z[val],p)[0]-target[val])**2))
  if not np.isfinite(vl):raise ValueError('Training diverged')
  if vl<best-1e-6:best=vl;best_epoch=epoch;best_params={k:v.copy() for k,v in p.items()}
  if epoch==1 or epoch%50==0:history.append({'epoch':epoch,'trainRegularizedLoss':loss,'validationMSE':vl})
  if epoch>=200 and epoch-best_epoch>=250:break
 p=best_params;pred=forward(z,p)[0]*ys+ym
 ridge=Ridge(alpha=10).fit(z[train],y[train,0]);base=ridge.predict(z)[:,None]
 # Separate calibration flights: unused in fitting and early stopping.
 residual=np.sort(np.abs(y[cal,0]-pred[cal,0]));rank=min(len(cal),math.ceil((len(cal)+1)*.9));radius=float(residual[rank-1])
 clusters=KMeans(n_clusters=3,random_state=42,n_init=10).fit(z[train]);dist=clusters.transform(z).min(axis=1)
 threshold=float(np.quantile(dist[train],.95));test_score=score(y[test],pred[test]);baseline_score=score(y[test],base[test])
 summary={'schemaVersion':1,'source':URL,'sourceSha256':SHA,'attribution':'Thiago A. Rodrigues and collaborators, energy_consumption author repository; processed cruise dataset associated with Matrice 100 energy studies.','dataKind':'Author-processed measured performance; y used as author-provided power target in W. Not independently reconstructed from raw current/voltage.','sourceSamples':len(list(csv.DictReader(raw.decode().splitlines()))),'flightRecords':len(records),'features':FEATURES,'splitFlightIds':{k:[records[int(i)]['flightId'] for i in idx] for k,idx in [('train',train),('validation',val),('calibration',cal),('test',test)]},'splitSeed':42,'method':'6-input, 12-tanh-hidden, 1-linear-output neural network; analytic backpropagation + Adam','gradientCheckMaxAbsoluteError':gradient_check(),'epochsRun':epoch,'bestValidationEpoch':best_epoch,'optimizer':{'learningRate':.005,'beta1':.9,'beta2':.999,'weightDecayL2':.001,'patience':250,'maxEpochs':4000},'history':history,'featureMean':mean.tolist(),'featureScale':scale.tolist(),'targetMeanW':float(ym),'targetScaleW':float(ys),'weights':{k:v.tolist() for k,v in p.items()},'weightChangeL2':float(np.sqrt(sum(np.sum((p[k]-initial[k])**2) for k in p))),'trainingFeatureRanges':np.column_stack([x[train].min(axis=0),x[train].max(axis=0)]).tolist(),'test':test_score,'initialUntrainedTest':score(y[test],forward(z[test],initial)[0]*ys+ym),'ridgeBaseline':baseline_score,'ridgeModel':{'coefficients':ridge.coef_.tolist(),'interceptW':float(ridge.intercept_)},'testErrorByPayload':[{'payloadKg':float(payload),'flights':int((x[test,0]==payload).sum()),'maeW':float(np.abs(pred[test][x[test,0]==payload]-y[test][x[test,0]==payload]).mean())} for payload in np.unique(x[test,0])],'uncertainty':{'nominalCoverage':.9,'absoluteRadiusW':radius,'calibrationFlights':len(cal),'testCoverage':float(np.mean(np.abs(y[test,0]-pred[test,0])<=radius)),'limitations':'Marginal interval assumes exchangeable flights; no cross-aircraft or weather-shift guarantee.'},'unsupervised':{'method':'K-means 3 operating regimes, training flights only','centers':clusters.cluster_centers_.tolist(),'supportDistance95thPercentile':threshold,'testFlightsOutsideSupport':int((dist[test]>threshold).sum())},'testPredictions':[{'flightId':records[int(i)]['flightId'],'observedW':float(y[i,0]),'predictedW':float(pred[i,0]),'baselineW':float(base[i,0]),'payloadKg':float(x[i,0]),'onboardAirflowMps':float(x[i,3]),'outsideTrainingSupport':bool(dist[i]>threshold)} for i in test],'passesBaselineMAEGate':test_score['maeW']<baseline_score['maeW'],'promoted':False,'limitations':['One aircraft and author-processed dataset; no independent airframe or date-held-out validation.','Onboard airflow is not ambient gust speed. No standardized gust-duration label.','Observed cruise segment duration is not maximum endurance.','Input features are measured segment summaries; no prospective performance guarantee.','No raw dataset redistribution; source terms require verification before wider commercial model use.','Active flight physics and controller are unchanged.']}
 (ROOT/'data/training/energy-flight-summaries.json').write_text(json.dumps({'source':URL,'sha256':SHA,'features':FEATURES,'records':records},indent=2)+'\n')
 (ROOT/'src/learning/energy-model.json').write_text(json.dumps(summary,indent=2,allow_nan=False)+'\n')
 (ROOT/'public/learning/energy-model.json').write_text(json.dumps(summary,indent=2,allow_nan=False)+'\n')
 print(json.dumps({k:summary[k] for k in ['sourceSamples','flightRecords','epochsRun','bestValidationEpoch','gradientCheckMaxAbsoluteError','weightChangeL2','test','initialUntrainedTest','ridgeBaseline','uncertainty','passesBaselineMAEGate']},indent=2))

if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('--cache',default='/tmp/copter-energy-data');parser.add_argument('--check-gradients',action='store_true');args=parser.parse_args()
 if args.check_gradients:print(gradient_check())
 else:run(args.cache)

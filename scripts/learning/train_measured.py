"""Offline measured-data training. No network, no test-set model selection."""
import hashlib,json,pathlib,platform
import numpy as np
import scipy,sklearn
from scipy.optimize import nnls
from sklearn.cluster import KMeans
from sklearn.preprocessing import StandardScaler

ROOT=pathlib.Path(__file__).resolve().parents[2]
raw=(ROOT/'data/training/reference-measurements.json').read_bytes()
data=json.loads(raw)
# Predeclared interior row holdout. Endpoints retained for in-range prediction.
TEST=[2,6,10,14]
TRAIN=[i for i in range(16) if i not in TEST]

def metrics(actual,pred):
    e=np.asarray(pred)-actual
    return {'mae':float(np.abs(e).mean()),'rmse':float(np.sqrt((e*e).mean())),'maxAbsoluteError':float(np.abs(e).max())}

def fit_rows(x,y,nonnegative=False):
    a=np.column_stack([np.ones(len(x)),x,x*x])
    c=nnls(a[TRAIN],y[TRAIN])[0] if nonnegative else np.linalg.lstsq(a[TRAIN],y[TRAIN],rcond=None)[0]
    return {'coefficients':c.tolist(),'heldOut':metrics(y[TEST],a[TEST]@c),'meanBaseline':metrics(y[TEST],np.repeat(y[TRAIN].mean(),len(TEST)))}

cf=np.array(data['bitcraze']['rows'])
models=[]
models.append({'id':data['bitcraze']['id'],'input':'pwmPercent','inputScale':100,'range':[0,93.75],'source':data['bitcraze']['source'],'targets':{'thrustN':fit_rows(cf[:,3]/100,cf[:,1]*.00981,True),'electricalPowerW':fit_rows(cf[:,3]/100,cf[:,0]*cf[:,2],True)},'scope':'2015 whole-aircraft bench sweep; supply voltage covaries with PWM. No voltage-independent prediction.'})
features=[]
for p in data['propellers']:
    a=np.array(p['rows'])
    assert a.shape==(16,3) and np.isfinite(a).all() and (a>0).all()
    models.append({'id':p['id'],'input':'rpm','inputScale':10000,'range':[float(a[0,0]),float(a[-1,0])],'diameterIn':p['diameterIn'],'source':p['source'],'targets':{name:fit_rows(a[:,0]/10000,a[:,i]) for i,name in [(1,'Ct'),(2,'Cp')]},'scope':'Static isolated propeller. Cp represents shaft power, not electrical power. No wind/endurance prediction.'})
    features.extend([[p['diameterIn'],p['pitchIn']/p['diameterIn'],rpm/10000] for rpm in a[TRAIN,0]])
x=np.array(features); scaler=StandardScaler().fit(x);z=scaler.transform(x)
k=KMeans(n_clusters=3,random_state=42,n_init=10).fit(z)
distance=k.transform(z).min(axis=1)
report={'schemaVersion':1,'datasetSha256':hashlib.sha256(raw).hexdigest(),'measuredRows':80,'testSessions':5,'trainRows':60,'heldOutRows':20,'trainIndices':TRAIN,'testIndices':TEST,'evaluation':'Within-sweep interpolation only. No independent session or aircraft validation. Models are NOT refitted on held-out rows.','independentValidation':False,'gustEnduranceSamples':0,'versions':{'python':platform.python_version(),'numpy':np.__version__,'scipy':scipy.__version__,'sklearn':sklearn.__version__},'supervised':models,'unsupervised':{'method':'K-means (3 clusters), measured propeller operating points; no target labels','features':['diameterIn','pitch/diameter','rpm/10000'],'trainingRows':48,'mean':scaler.mean_.tolist(),'scale':scaler.scale_.tolist(),'centers':k.cluster_centers_.tolist(),'distanceThreshold':float(distance.max()),'clusterCounts':np.bincount(k.labels_,minlength=3).tolist(),'limitations':'Distance is a training-support heuristic, not calibrated confidence or proof of physical validity.'},'promotion':{'defaultPhysicsChanged':False,'reason':'Independent measured validation and gust/endurance data missing.'}}
(ROOT/'src/learning/measured-models.json').write_text(json.dumps(report,indent=2,allow_nan=False)+'\n')
print(json.dumps({'rows':80,'heldOutRows':20,'bitcraze':models[0]['targets'],'clusters':report['unsupervised']['clusterCounts']},indent=2))

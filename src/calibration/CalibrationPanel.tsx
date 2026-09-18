import { useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { parseCalibration,applyCalibration } from './PropulsionCalibration';
import { compareTrial } from './TrialValidation';

export function CalibrationPanel(){
 const {setConfig,config,epRunning}=useAppContext();
 const [raw,setRaw]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [review,setReview]=useState<ReturnType<typeof parseCalibration>|null>(null);
 const [trial,setTrial]=useState<ReturnType<typeof compareTrial>|null>(null);
 const inspect=(text:string)=>{
  setRaw(text);setReview(null);setTrial(null);setError('');setNotice('');
  try{
   if(new TextEncoder().encode(text).length>256000)throw new Error('Maximum file size is 256 kB');
   const packet=JSON.parse(text);
   if(packet.kind)setTrial(compareTrial(packet));else setReview(parseCalibration(text));
  }catch(e){setError((e as Error).message);}
 };
 return <details className="rounded-xl border border-zinc-700 bg-zinc-900 p-4">
  <summary className="cursor-pointer font-semibold">Aircraft calibration workbench</summary>
  <p className="text-sm mt-3">Start with Crazyflie 2.1 stock brushed, exact hardware revision. Import measured per-motor electrical power and thrust at constant voltage, with separate fitting and validation sessions.</p>
  <p className="text-xs text-amber-400 mt-2">The historical Bitcraze sweep uses varying supply voltage and whole-aircraft power. It cannot be applied as a constant-voltage per-motor calibration. No aircraft currently has verified battery or gust-endurance calibration here.</p>
  <div className="flex flex-wrap gap-4 text-sm mt-3">
   <a className="underline" href="/calibration/crazyflie-bench-template.json" download>Download bench template</a>
   <a className="underline" href="/calibration/battery-trial-template.json" download>Download battery test template</a>
   <a className="underline" href="/calibration/gust-trial-template.json" download>Download gust test template</a>
  </div>
  <p className="text-xs text-zinc-400 mt-2">Templates contain missing values deliberately. Supply real measurements before review. Files stay in this browser until you explicitly save a configuration through cloud history.</p>
  <label className="block text-sm mt-3">Import calibration or comparison JSON<input aria-label="Import calibration JSON" type="file" accept=".json,application/json" className="block mt-1" onChange={async e=>{
   const f=e.target.files?.[0];if(!f)return;
   if(f.size>256000){setReview(null);setTrial(null);setError('Maximum file size is 256 kB');return;}
   try{inspect(await f.text());}catch(err){setError((err as Error).message);}
  }} /></label>
  <label className="block text-sm mt-3">Calibration JSON<textarea aria-label="Calibration JSON" value={raw} rows={5} onChange={e=>{setRaw(e.target.value);setReview(null);setTrial(null);setNotice('');}} className="block w-full bg-zinc-950 border border-zinc-700 rounded p-2 text-xs font-mono" /></label>
  <button type="button" onClick={()=>inspect(raw)} className="mt-2 px-3 py-2 rounded bg-zinc-700 text-sm">Review measurements</button>
  {error&&<p role="alert" className="text-sm text-red-400 mt-2">{error}</p>}
  {review&&<div className="text-sm mt-3 space-y-2">
   <p>{review.record.aircraftId} · {review.record.hardwareRevision}</p>
   <p>Separate sessions: {review.record.fittingSessions.length} fitting / {review.record.validationSessions.length} validation. Source remains unverified.</p>
   <p>Normalized mean absolute error: thrust {(review.record.thrustNormalizedMAE*100).toFixed(2)}% / power {(review.record.powerNormalizedMAE*100).toFixed(2)}%. Targets: 5% / 10%.</p>
   <p>{review.passes?'Bench targets passed. Only static propulsion is covered.':'Bench targets failed; applying this calibration is blocked.'}</p>
   <p>Replaces aircraft configuration: {config.droneType}, {config.mass} kg → {review.config.droneType}, {review.config.mass} kg. Electronics: {review.config.electronicsPowerW} W, counted once.</p>
   <button type="button" disabled={!review.passes||epRunning} onClick={()=>{try{setConfig(applyCalibration(review));setNotice('Imported bench calibration applied. Battery, wind and flight dynamics remain unvalidated.');}catch(e){setError((e as Error).message);}}} className="px-3 py-2 rounded bg-emerald-700 disabled:opacity-40">Apply reviewed bench calibration</button>
  </div>}
  {trial&&<div className="text-sm mt-3"><p>{trial.comparable?(trial.passes?'Comparison targets passed':'Comparison targets failed'):'Tests are not comparable'}</p><p>{trial.reasons.join('; ')}</p>{trial.comparable&&<p>Energy error: {(trial.energyRelativeError!*100).toFixed(2)}%; duration error: {(trial.durationRelativeError!*100).toFixed(2)}%; gust recovery error: {trial.recoveryAbsoluteErrorSeconds??'N/A'} s.</p>}<p>{trial.criteria}</p><p>{trial.provenance}. This does not grant full-aircraft validation.</p></div>}
  <p role="status" className="text-sm mt-2">{notice}</p>
 </details>;
}

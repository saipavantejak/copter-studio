/** Compare like-for-like physical tests. Imported provenance remains user-declared. */
export interface TrialObservation {
 configurationKey:string;
 protocolId:string;
 sessionId:string;
 sourceUrl:string;
 durationSeconds:number;
 energyJ:number;
 termination:'completed-mission'|'battery-cutoff'|'crash';
 ambientTemperatureC:number;
 payloadKg:number;
 wind?:{referenceFrame:'ambient-world';traceId:string;gustWindowSeconds:number;peakMps:number;recoverySeconds:number};
}
export interface TrialPair {
 schemaVersion:1; kind:'mission-energy'|'battery-endurance'|'gust-recovery';
 measured:TrialObservation;
 simulated:Omit<TrialObservation,'sourceUrl'|'sessionId'> & {engineCommit:string;seed:number};
}
export function compareTrial(value:unknown){
 const reasons:string[]=[];
 if(!value||typeof value!=='object')throw new Error('Trial comparison must be an object');
 const p=value as TrialPair;
 if(p.schemaVersion!==1||!['mission-energy','battery-endurance','gust-recovery'].includes(p.kind))throw new Error('Unknown comparison kind or schema');
 const m=p.measured,s=p.simulated;
 if(!m||!s)throw new Error('Measured and simulated records required');
 for(const row of [m,s]){
  if(typeof row.configurationKey!=='string'||!row.configurationKey.trim()||typeof row.protocolId!=='string'||!row.protocolId.trim())throw new Error('Configuration and protocol identities required');
  if(![row.durationSeconds,row.energyJ,row.ambientTemperatureC,row.payloadKg].every(Number.isFinite)||row.durationSeconds<=0||row.energyJ<=0||row.payloadKg<0)throw new Error('Finite measured durations, positive energy, temperature and payload required');
  if(!['completed-mission','battery-cutoff','crash'].includes(row.termination))throw new Error('Explicit termination reason required');
 }
 if(typeof m.sessionId!=='string'||!m.sessionId.trim())throw new Error('Measurement session required');
 try{if(new URL(m.sourceUrl).protocol!=='https:')throw new Error();}catch{throw new Error('HTTPS measurement source required');}
 if(typeof s.engineCommit!=='string'||!/^[a-f0-9]{40}$/i.test(s.engineCommit)||!Number.isSafeInteger(s.seed)||s.seed<0||s.seed>4294967295)throw new Error('Simulation commit and seed required');
 if(m.configurationKey!==s.configurationKey||m.protocolId!==s.protocolId)reasons.push('Different configuration or test protocol');
 if(m.payloadKg!==s.payloadKg||m.ambientTemperatureC!==s.ambientTemperatureC)reasons.push('Payload or temperature differs');
 if(m.termination==='crash'||s.termination==='crash')reasons.push('Crashed trials cannot pass performance validation');
 if(m.termination!==s.termination)reasons.push('Termination reasons differ');
 if(p.kind==='battery-endurance'&&(m.termination!=='battery-cutoff'||s.termination!=='battery-cutoff'))reasons.push('Endurance requires battery-cutoff tests on both sides');
 if(p.kind!=='battery-endurance'&&Math.abs(m.durationSeconds-s.durationSeconds)>Math.max(.1,m.durationSeconds*.01))reasons.push('Mission durations differ by over 1% or 0.1 s');
 if(p.kind==='gust-recovery'||m.wind||s.wind){
  const a=m.wind,b=s.wind;
  if(!a||!b||a.referenceFrame!=='ambient-world'||b.referenceFrame!=='ambient-world')reasons.push('Matching ambient-world wind evidence required; onboard airflow is insufficient');
  else {
   if(!a.traceId||a.traceId!==b.traceId||a.gustWindowSeconds!==b.gustWindowSeconds||a.peakMps!==b.peakMps)reasons.push('Wind trace or gust definition differs');
   for(const w of [a,b])if(![w.gustWindowSeconds,w.peakMps,w.recoverySeconds].every(Number.isFinite)||w.gustWindowSeconds<=0||w.peakMps<=0||w.recoverySeconds<0)reasons.push('Invalid gust measurements');
  }
 }
 const relative=(actual:number,predicted:number)=>Math.abs(predicted-actual)/actual;
 const energyError=relative(m.energyJ,s.energyJ),durationError=relative(m.durationSeconds,s.durationSeconds);
 const recoveryError=p.kind==='gust-recovery'&&m.wind&&s.wind?Math.abs(m.wind.recoverySeconds-s.wind.recoverySeconds):null;
 const comparable=reasons.length===0;
 return {comparable,reasons,energyRelativeError:comparable?energyError:null,durationRelativeError:comparable?durationError:null,recoveryAbsoluteErrorSeconds:comparable?recoveryError:null,
  passes:comparable&&energyError<=.10&&(p.kind!=='battery-endurance'||durationError<=.10)&&(recoveryError===null||recoveryError<=.5),
  criteria:'Provisional engineering targets: energy ≤10%; battery endurance ≤10%; gust recovery ≤0.5 s. Not industry standards.',
  provenance:'User-declared comparison, not an independently verified physical test',aircraftValidated:false};
}

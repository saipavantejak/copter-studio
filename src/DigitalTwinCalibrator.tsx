// DigitalTwinCalibrator.tsx
// v9 fix 1: calibrationCost() now takes explicit armLength parameter,
//           eliminating the ReferenceError: currentConfig is not defined
//           that crashed calibration in v8.

import React, { useState, useRef, useCallback } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Upload, Settings, CheckCircle, AlertCircle, TrendingDown } from 'lucide-react';
import { PhysicsConfig } from './PhysicsEngine';

interface CalibrationResult {
  mass:           number;
  propDiameter:   number;
  batteryVoltage: number;
  motorTau:       number;
  dragCoeff:      number;
  accuracy:       number;
  rmseAlt:        number;
  rmseRoll:       number;
  iterations:     number;
}

interface TrajectoryPoint {
  t: number; z: number; phi: number; theta: number;
}

// ── Nelder-Mead Simplex ────────────────────────────────────────────────────

type Vec = number[];
function vAdd(a: Vec, b: Vec): Vec { return a.map((v,i)=>v+b[i]); }
function vSub(a: Vec, b: Vec): Vec { return a.map((v,i)=>v-b[i]); }
function vScale(a: Vec, s: number): Vec { return a.map(v=>v*s); }
function vMean(vecs: Vec[]): Vec {
  const n=vecs.length,dim=vecs[0].length;
  return Array.from({length:dim},(_,i)=>vecs.reduce((s,v)=>s+v[i],0)/n);
}

function nelderMead(
  fn: (x: Vec) => number,
  x0: Vec,
  bounds: [number,number][],
  maxIter=200,
  tol=1e-4
): { x: Vec; fval: number; iters: number } {
  const n = x0.length;
  const alpha=1, gamma=2, rho=0.5, sigma=0.5;
  const clamp = (x: Vec) => x.map((v,i)=>Math.max(bounds[i][0],Math.min(bounds[i][1],v)));

  let simplex: Vec[] = [clamp(x0)];
  for (let i=0;i<n;i++) {
    const v = [...x0];
    v[i] *= 1.1;
    simplex.push(clamp(v));
  }
  let fvals = simplex.map(fn);
  let iters = 0;

  while (iters < maxIter) {
    const order = fvals.map((_,i)=>i).sort((a,b)=>fvals[a]-fvals[b]);
    simplex = order.map(i=>simplex[i]);
    fvals   = order.map(i=>fvals[i]);

    if (Math.max(...fvals) - Math.min(...fvals) < tol) break;

    const centroid = vMean(simplex.slice(0,n));

    const xr = clamp(vAdd(centroid, vScale(vSub(centroid,simplex[n]),alpha)));
    const fr = fn(xr);
    if (fr < fvals[0]) {
      const xe = clamp(vAdd(centroid, vScale(vSub(xr,centroid),gamma)));
      const fe = fn(xe);
      if (fe < fr) { simplex[n]=xe; fvals[n]=fe; }
      else         { simplex[n]=xr; fvals[n]=fr; }
    } else if (fr < fvals[n-1]) {
      simplex[n]=xr; fvals[n]=fr;
    } else {
      const xc = clamp(vAdd(centroid, vScale(vSub(simplex[n],centroid),rho)));
      const fc = fn(xc);
      if (fc < fvals[n]) { simplex[n]=xc; fvals[n]=fc; }
      else {
        for (let i=1;i<=n;i++) {
          simplex[i] = clamp(vAdd(simplex[0], vScale(vSub(simplex[i],simplex[0]),sigma)));
          fvals[i] = fn(simplex[i]);
        }
      }
    }
    iters++;
  }

  return { x: simplex[0], fval: fvals[0], iters };
}

// ── Headless trajectory simulation ─────────────────────────────────────────

function simulateTrajectory(
  params: { mass:number; propDiam:number; voltage:number; motorTau:number; drag:number; armLength:number },
  steps: number
): TrajectoryPoint[] {
  const G=9.81, DT=0.016;
  const OMEGA_IDLE=100, OMEGA_MAX=1200;

  let x=0,y=0,z=0,xd=0,yd=0,zd=0,phi=0,theta=0,psi=0,p=0,q=0,r=0;
  let omL=OMEGA_IDLE, omR=OMEGA_IDLE;
  const traj: TrajectoryPoint[] = [];

  for (let i=0;i<steps;i++) {
    const tc=Math.max(-1,Math.min(1,(1-z)*0.5+(-zd)*0.2));
    const rc=Math.max(-1,Math.min(1,(0-y-phi)*0.1-p*0.05));
    const pc=Math.max(-1,Math.min(1,(0-x-theta)*0.1-q*0.05));
    const yc=Math.max(-1,Math.min(1,(-psi)*0.1-r*0.05));
    const actL=tc+yc, actR=tc-yc;

    const tgtL=OMEGA_IDLE+Math.max(0,(actL+1)/2)*(OMEGA_MAX-OMEGA_IDLE);
    const tgtR=OMEGA_IDLE+Math.max(0,(actR+1)/2)*(OMEGA_MAX-OMEGA_IDLE);
    omL+=((tgtL-omL)/params.motorTau)*DT;
    omR+=((tgtR-omR)/params.motorTau)*DT;

    const R=(params.propDiam*0.0254)/2, A=Math.PI*R*R;
    const tL=((actL+1)/2)*23-5, tR=((actR+1)/2)*23-5;
    const ctL=Math.max(0,(2*0.025*5.7*(tL*Math.PI/180)*R)/(4*A));
    const ctR=Math.max(0,(2*0.025*5.7*(tR*Math.PI/180)*R)/(4*A));
    const vf=params.voltage/22.2;
    const TL=ctL*1.225*A*(omL*R)**2*vf;
    const TR=ctR*1.225*A*(omR*R)**2*vf;
    const Fz=TL+TR;

    const d=0.5, mc=5;
    const L=(TL-TR)*d+(rc+rc)*mc;
    const M=(pc+pc)*mc;

    const sf=Math.pow(params.propDiam/15,2)*(params.mass/5);
    const arm=params.armLength;
    const Ix=0.1*sf*(arm/0.5)**2,Iy=0.1*sf*(arm/0.5)**2,Iz=0.2*sf*(arm/0.5)**2;
    const m=params.mass;
    const cp=Math.cos(phi),sp=Math.sin(phi);
    const ct=Math.cos(theta),st=Math.sin(theta);
    const cy=Math.cos(psi),sy=Math.sin(psi);

    const ax=(Fz/m)*(sp*sy+cp*cy*st);
    const ay=(Fz/m)*(cp*sy*st-cy*sp);
    const az=(Fz/m)*(cp*ct)-G;

    const v2=xd**2+yd**2+zd**2;
    const drag=0.5*1.225*params.drag*0.05*v2;

    xd+=ax*DT-Math.sign(xd)*Math.min(Math.abs(ax*DT),drag/m*DT);
    yd+=ay*DT;
    zd+=az*DT;
    x+=xd*DT; y+=yd*DT; z+=zd*DT;
    if(z<0){z=0;zd=0;xd*=0.9;yd*=0.9;p=q=r=phi=theta=0;}

    const pd=(L+(Iy-Iz)*q*r)/Ix;
    const qd2=(M+(Iz-Ix)*p*r)/Iy;
    const rd2=(0+(Ix-Iy)*p*q)/Iz;
    p+=pd*DT; q+=qd2*DT; r+=rd2*DT;
    const phid=p+Math.tan(theta)*(q*sp+r*cp);
    const thd=q*cp-r*sp;
    const cct=Math.abs(ct)<0.001?(ct<0?-0.001:0.001):ct;
    phi+=phid*DT; theta+=thd*DT; psi+=(q*sp+r*cp)/cct*DT;

    traj.push({ t:i*DT, z, phi, theta });
  }
  return traj;
}

// ── Calibration cost function ───────────────────────────────────────────────
// Fix 1: armLength is now an explicit parameter instead of a closure over
// the module-scope variable `currentConfig` (which doesn't exist at module scope).

function calibrationCost(params: Vec, realTraj: TrajectoryPoint[], armLength: number): number {
  const [mass,propD,voltage,motorTau,drag]=params;
  const sim = simulateTrajectory({ mass,propDiam:propD,voltage,motorTau,drag,armLength }, realTraj.length);
  let cost = 0;
  const n = Math.min(sim.length, realTraj.length);
  for (let i=0;i<n;i++) {
    cost += (sim[i].z   - realTraj[i].z)**2;
    cost += (sim[i].phi - realTraj[i].phi)**2 * 0.5;
    cost += (sim[i].theta - realTraj[i].theta)**2 * 0.5;
  }
  return cost / n;
}

// ── CSV parser ─────────────────────────────────────────────────────────────

function parseFlightCSV(text: string): TrajectoryPoint[] {
  const lines = text.trim().split('\n');
  const header = lines[0].split(',');
  const tIdx=header.indexOf('time_s'), zIdx=header.indexOf('z_m'),
        phiIdx=header.indexOf('roll_rad'), thetaIdx=header.indexOf('pitch_rad');

  if (tIdx<0||zIdx<0||phiIdx<0||thetaIdx<0)
    throw new Error('CSV missing required columns: time_s, z_m, roll_rad, pitch_rad');

  return lines.slice(1).map(line=>{
    const cols=line.split(',');
    return { t:parseFloat(cols[tIdx]), z:parseFloat(cols[zIdx]),
             phi:parseFloat(cols[phiIdx]), theta:parseFloat(cols[thetaIdx]) };
  }).filter(p=>!isNaN(p.t)&&!isNaN(p.z));
}

// ── Component ──────────────────────────────────────────────────────────────

interface DigitalTwinCalibratorProps {
  currentConfig: PhysicsConfig;
  onCalibrated: (config: PhysicsConfig) => void;
}

export const DigitalTwinCalibrator: React.FC<DigitalTwinCalibratorProps> = ({
  currentConfig, onCalibrated
}) => {
  const [status, setStatus] = useState<'idle'|'loading'|'fitting'|'done'|'error'>('idle');
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<CalibrationResult|null>(null);
  const [chartData, setChartData] = useState<any[]>([]);
  const [errorMsg, setErrorMsg] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(async (file: File) => {
    setStatus('loading'); setErrorMsg('');
    try {
      const text = await file.text();
      const realTraj = parseFlightCSV(text);
      if (realTraj.length < 20) throw new Error('Need at least 20 data points in CSV.');

      setStatus('fitting');

      const x0 = [
        currentConfig.mass,
        currentConfig.propDiameter,
        currentConfig.batteryVoltage,
        0.05,
        0.47,
      ];
      const bounds: [number,number][] = [
        [0.5,  25],
        [5,    30],
        [10,   50],
        [0.01, 0.2],
        [0.1,  1.5],
      ];

      // Fix 1: extract armLength from component scope and pass it explicitly
      const armLen = currentConfig.armLength ?? 0.5;

      let iters = 0;
      const wrappedFn = (x: Vec) => {
        iters++;
        if (iters % 20 === 0) setProgress(Math.min(95, iters / 200 * 100));
        return calibrationCost(x, realTraj, armLen);
      };

      await new Promise(r => setTimeout(r, 50));
      const opt = nelderMead(wrappedFn, x0, bounds, 200, 1e-5);

      const [mass,propDiam,batteryVoltage,motorTau,drag] = opt.x;

      const simFinal = simulateTrajectory({ mass,propDiam,voltage:batteryVoltage,motorTau,drag,armLength:armLen }, realTraj.length);
      let rmseAlt=0, rmseRoll=0;
      const n=Math.min(simFinal.length,realTraj.length);
      for(let i=0;i<n;i++){
        rmseAlt  += (simFinal[i].z   - realTraj[i].z)**2;
        rmseRoll += (simFinal[i].phi - realTraj[i].phi)**2;
      }
      rmseAlt  = Math.sqrt(rmseAlt/n);
      rmseRoll = Math.sqrt(rmseRoll/n);
      const accuracy = Math.max(0, 100 - rmseAlt*50 - rmseRoll*30);

      const every = Math.max(1, Math.floor(realTraj.length/80));
      const cData = realTraj.filter((_,i)=>i%every===0).map((r,i)=>({
        t: r.t.toFixed(1),
        real_z: +r.z.toFixed(3),
        sim_z:  +(simFinal[i*every]?.z??0).toFixed(3),
        real_phi: +(r.phi*180/Math.PI).toFixed(2),
        sim_phi: +((simFinal[i*every]?.phi ?? 0)*180/Math.PI).toFixed(2),
      }));
      setChartData(cData);

      const res: CalibrationResult = {
        mass, propDiameter:propDiam, batteryVoltage, motorTau, dragCoeff:drag,
        accuracy, rmseAlt, rmseRoll, iterations: opt.iters,
      };
      setResult(res);
      setStatus('done');
      setProgress(100);

    } catch(e: any) {
      setErrorMsg(e.message||'Calibration failed.');
      setStatus('error');
    }
  }, [currentConfig]);

  const applyCalibration = () => {
    if (!result) return;
    onCalibrated({
      droneType: currentConfig.droneType,
      mass: result.mass,
      propDiameter: result.propDiameter,
      batteryVoltage: result.batteryVoltage,
      armLength: currentConfig.armLength ?? 0.5,
    });
  };

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden flex flex-col">
      <div className="px-5 py-4 border-b border-zinc-800 bg-zinc-950 flex items-center gap-3">
        <Settings className="w-5 h-5 text-teal-400" />
        <div>
          <h2 className="text-sm font-bold text-zinc-100">Digital Twin Calibrator</h2>
          <p className="text-xs text-zinc-500">Upload real flight CSV → auto-fit physics parameters</p>
        </div>
      </div>

      <div className="p-5 space-y-5">
        <div
          onClick={()=>fileInputRef.current?.click()}
          className="border-2 border-dashed border-zinc-700 hover:border-teal-500 rounded-xl p-6 flex flex-col items-center gap-3 cursor-pointer transition-colors"
        >
          <Upload className="w-8 h-8 text-zinc-500" />
          <div className="text-center">
            <p className="text-sm text-zinc-300">Drop real flight CSV here</p>
            <p className="text-xs text-zinc-600 mt-1">Requires columns: time_s, z_m, roll_rad, pitch_rad</p>
            <p className="text-xs text-zinc-600">Use the "Export CSV" button to get the format from a sim flight</p>
          </div>
          <input ref={fileInputRef} type="file" accept=".csv" className="hidden"
            onChange={e=>{ if(e.target.files?.[0]) handleFile(e.target.files[0]); }} />
        </div>

        {(status==='loading'||status==='fitting') && (
          <div>
            <div className="flex justify-between text-xs text-zinc-500 mb-1">
              <span>{status==='loading'?'Parsing CSV...':'Running Nelder-Mead optimizer...'}</span>
              <span>{progress.toFixed(0)}%</span>
            </div>
            <div className="w-full bg-zinc-800 rounded-full h-2">
              <div className="bg-teal-500 h-2 rounded-full transition-all" style={{width:`${progress}%`}} />
            </div>
          </div>
        )}

        {status==='error' && (
          <div className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <p className="text-xs text-red-200">{errorMsg}</p>
          </div>
        )}

        {status==='done' && result && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 p-3 bg-teal-500/10 border border-teal-500/20 rounded-lg">
              <CheckCircle className="w-4 h-4 text-teal-400" />
              <div className="flex-1">
                <div className="text-sm font-bold text-teal-300">Calibration complete</div>
                <div className="text-xs text-zinc-500">
                  Digital Twin Accuracy: <span className="text-teal-300 font-bold">{result.accuracy.toFixed(1)}%</span>
                  &nbsp;·&nbsp;Alt RMSE: {result.rmseAlt.toFixed(3)}m
                  &nbsp;·&nbsp;Roll RMSE: {(result.rmseRoll*180/Math.PI).toFixed(2)}°
                  &nbsp;·&nbsp;{result.iterations} iterations
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {[
                ['Mass',         result.mass.toFixed(3),          'kg'],
                ['Prop Ø',       result.propDiameter.toFixed(2),  'in'],
                ['Battery',      result.batteryVoltage.toFixed(1),'V'],
                ['Motor τ',      (result.motorTau*1000).toFixed(1),'ms'],
                ['Drag Cd',      result.dragCoeff.toFixed(3),     ''],
                ['Accuracy',     result.accuracy.toFixed(1),      '%'],
              ].map(([l,v,u])=>(
                <div key={l as string} className="bg-zinc-950 border border-zinc-800 rounded-lg p-3">
                  <div className="text-[10px] text-zinc-500 mb-1">{l as string}</div>
                  <div className="text-lg font-mono font-bold text-teal-300">
                    {v as string}<span className="text-xs text-zinc-500 ml-0.5">{u as string}</span>
                  </div>
                </div>
              ))}
            </div>

            {chartData.length > 0 && (
              <div>
                <div className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                  <TrendingDown className="w-3 h-3" /> Altitude comparison: real vs calibrated sim
                </div>
                <div style={{height:180}}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="2 2" stroke="#27272a" />
                      <XAxis dataKey="t" fontSize={10} stroke="#52525b" />
                      <YAxis fontSize={10} stroke="#71717a" width={35}/>
                      <Tooltip contentStyle={{background:'#18181b',border:'1px solid #27272a',fontSize:11,fontFamily:'monospace'}} />
                      <Legend wrapperStyle={{fontSize:11}} />
                      <Line dataKey="real_z" stroke="#34a840" strokeWidth={2} dot={false} name="Real alt (m)" />
                      <Line dataKey="sim_z"  stroke="#60a5fa" strokeWidth={2} dot={false} name="Sim alt (m)" strokeDasharray="4 2" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            <button onClick={applyCalibration}
              className="w-full py-2.5 bg-teal-600 hover:bg-teal-500 text-white rounded-lg text-sm font-bold transition-colors">
              Apply Calibrated Parameters to Simulator
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

import React, { useState, useEffect } from 'react';
import { Settings, Wind, Battery, AlertTriangle, Box, Activity, Wifi } from 'lucide-react';
import { PhysicsConfig, TestModules } from './PhysicsEngine';
import { DroneType } from './UniversalMixer';
import { SensorConfig } from './SensorNoise';
import { assertValidConfig } from './configValidation';
import { AIRCRAFT_PROFILES, propulsionEvidence, editHardware } from './AircraftProfiles';

interface TestDashboardProps {
  config: PhysicsConfig;
  setConfig: React.Dispatch<React.SetStateAction<PhysicsConfig>>;
  tests: TestModules;
  setTests: React.Dispatch<React.SetStateAction<TestModules>>;
  sensorCfg: SensorConfig;
  setSensorCfg: React.Dispatch<React.SetStateAction<SensorConfig>>;
  telemetry: any;
}

export const TestDashboard = ({ config, setConfig, tests, setTests, sensorCfg, setSensorCfg, telemetry }: TestDashboardProps) => {
  const [configDraft, setConfigDraft] = useState('');
  const [configError, setConfigError] = useState('');
  const [hoverMetrics, setHoverMetrics] = useState({ gpsDrift: 0, angularJitter: 0, samples: 0 });

  useEffect(() => {
    if (telemetry) {
      setHoverMetrics(prev => {
        const dz = telemetry.z - (tests.mission?.targetAltitudeM ?? 1);
        const drift = Math.sqrt(telemetry.x**2 + telemetry.y**2 + dz**2);
        const jitter = Math.sqrt(telemetry.phi**2 + telemetry.theta**2);
        const n2 = prev.samples + 1;
        return {
          gpsDrift: prev.gpsDrift + (drift - prev.gpsDrift) / Math.min(n2, 100),
          angularJitter: prev.angularJitter + (jitter - prev.angularJitter) / Math.min(n2, 100),
          samples: n2
        };
      });
    }
  }, [telemetry]);

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex flex-col h-full overflow-y-auto gap-5 text-sm">
      <div>
        <h2 className="text-base font-bold text-zinc-100 flex items-center gap-2 mb-3">
          <Settings className="w-4 h-4 text-emerald-400" /> Universal Architect
        </h2>

        <p className="text-xs text-amber-400 mb-3">Experimental model. Hardware inputs and simulated success are not independent flight validation.</p>
        <label className="block text-xs mb-2">Load reference aircraft
          <select aria-label="Load reference aircraft" value="" onChange={e=>{
            const profile=AIRCRAFT_PROFILES.find(p=>p.id===e.target.value);
            if(profile){setConfig({...profile.config});setConfigError('');}
          }} className="w-full bg-zinc-950 p-2">
            <option value="">Choose a reference configuration</option>
            {AIRCRAFT_PROFILES.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <p className="text-xs text-amber-400">Propulsion: {propulsionEvidence(config).status}. Energy and dynamics remain approximate.</p>
        {propulsionEvidence(config).sources.map(url=><a key={url} href={url} target="_blank" rel="noreferrer" className="block text-xs underline">Manufacturer reference: {new URL(url).pathname}</a>)}
        <details className="mb-3 text-xs">
          <summary>Advanced configuration: battery, payload, inertia, measured propulsion</summary>
          <button type="button" onClick={()=>setConfigDraft(JSON.stringify(config,null,2))} className="my-2 underline">Copy current configuration into editor</button>
          <textarea aria-label="Advanced aircraft configuration JSON" rows={8} value={configDraft} onChange={e=>setConfigDraft(e.target.value)}
            placeholder='{"batteryCapacity":350,"payloadMassKg":0,"maxThrustPerMotorN":0.2943}'
            className="w-full bg-zinc-950 text-zinc-200 p-2 font-mono" />
          <p className="text-zinc-500">JSON patch preserves unspecified fields. Units: batteryCapacity mAh, payloadMassKg kg, maxThrustPerMotorN N, inertiaOverride kg·m². propulsionCurve: ordered command/thrustN/powerW points spanning -1 to 1 at nominal voltage. Curves are not automatically validated.</p>
          <button type="button" className="mt-2 underline" onClick={()=>{
            try {
              const patch=JSON.parse(configDraft);
              if(!patch||typeof patch!=='object'||Array.isArray(patch))throw new Error('Expected an object');
              const next=editHardware(config,patch);assertValidConfig(next);setConfig(next);setConfigError('');
            }catch(e){setConfigError(e instanceof Error?e.message:String(e));}
          }}>Validate and apply configuration</button>
          {configError&&<p role="alert" className="text-red-400">{configError}</p>}
        </details>
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-zinc-500 mb-1">Drone Type</label>
            <select value={config.droneType} onChange={e=>setConfig(editHardware(config,{droneType:e.target.value as DroneType}))}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-emerald-500">
              <option value="bicopter">Bi-Copter Swashplate</option>
              <option value="quadcopter">Standard Quadcopter</option>
              <option value="hexacopter">Hexacopter</option>
            </select>
            <div className="mt-1.5 text-[10px] text-zinc-600 leading-relaxed">
              {config.droneType === 'bicopter' && '2 motors with swashplate mixing — lightweight, mechanically complex. Best for: agile research platforms.'}
              {config.droneType === 'quadcopter' && '4 fixed-pitch motors in X config — most common layout. Best for: general-purpose, cargo delivery.'}
              {config.droneType === 'hexacopter' && '6 motors for redundancy — can survive a single motor failure. Best for: heavy-lift, inspection.'}
            </div>
          </div>
          {/* Quick Presets */}
          <div>
            <label className="block text-xs text-zinc-500 mb-1.5">Quick Presets</label>
            <div className="flex flex-wrap gap-1.5">
              {[
                { label: 'Nano (Crazyflie)', cfg: { droneType: 'quadcopter' as DroneType, mass: 0.027, propDiameter: 1.5, batteryVoltage: 3.7, armLength: 0.046 } },
                { label: 'Micro Racer', cfg: { droneType: 'quadcopter' as DroneType, mass: 2.5, propDiameter: 8, batteryVoltage: 14.8, armLength: 0.15 } },
                { label: 'Research Bi', cfg: { droneType: 'bicopter' as DroneType, mass: 5.0, propDiameter: 15, batteryVoltage: 22.2, armLength: 0.5 } },
                { label: 'Cargo Quad', cfg: { droneType: 'quadcopter' as DroneType, mass: 8.0, propDiameter: 18, batteryVoltage: 22.2, armLength: 0.6 } },
                { label: 'Heavy Hex', cfg: { droneType: 'hexacopter' as DroneType, mass: 15.0, propDiameter: 22, batteryVoltage: 44.4, armLength: 0.8 } },
              ].map(p => (
                <button key={p.label} onClick={() => setConfig(c => editHardware(c,p.cfg))}
                  className="px-2 py-1 text-[10px] bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded text-zinc-400 hover:text-zinc-200 transition-colors">
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          {[
            ['mass','Mass (kg)',0.02,100,0.01,3,'Nano 0.02-0.2kg (Crazyflie), 2-5kg (small), 5-10kg (cargo), 10-20kg (heavy-lift)'] as const,
            ['propDiameter','Prop Ø (in)',0.5,60,0.5,1,'Typical: 1.5" (nano), 5" (racing), 10-15" (general), 18-30" (heavy-lift)'] as const,
            ['batteryVoltage','Battery (V)',1,100,0.1,1,'Common: 3.7V (1S nano), 11.1V (3S), 14.8V (4S), 22.2V (6S), 44.4V (12S)'] as const,
            ['armLength','Arm length (m)',0.01,5,0.01,2,'Motor-to-center distance. 0.03-0.1m (nano), 0.15-0.5m (small-med), 0.5-1m (heavy)'] as const,
          ].map(([k,lbl,mn,mx,st,prec,hint])=>(
            <div key={k}>
              <label className="block text-xs text-zinc-500 mb-1">{lbl}: <span className="text-zinc-300">{(config as any)[k].toFixed(prec)}</span></label>
              <input type="range" min={mn} max={mx} step={st} value={(config as any)[k]}
                onChange={e=>setConfig(editHardware(config,{[k]:parseFloat(e.target.value)}))}
                className="w-full accent-emerald-500" />
              <div className="text-[9px] text-zinc-600 mt-0.5">{hint}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Test modules */}
      <div>
        <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">Test Modules</h3>
        <div className="space-y-2">
          {[
            ['windEnabled','Wind & Turbulence','Stochastic gusts 0–40 mph', Wind, false],
            ['payloadShiftEnabled','Payload Dynamics','CoG shift ±10%', Box, false],
            ['batterySagEnabled','Battery Endurance','Voltage sag curve', Battery, false],
            ['motorOutEnabled','Failure Mode','Motor-out / servo jam', AlertTriangle, true],
          ].map(([k,lbl,sub,Icon,danger])=>(
            <label key={k as string} className="flex items-center justify-between p-2.5 bg-zinc-950 rounded-lg border border-zinc-800 cursor-pointer hover:border-zinc-700 transition-colors">
              <div className="flex items-center gap-2">
                {React.createElement(Icon as any, {className:`w-3.5 h-3.5 ${(tests as any)[k as string] ? (danger?'text-red-400':'text-emerald-400') : 'text-zinc-600'}`})}
                <div>
                  <div className="text-xs text-zinc-200">{lbl as string}</div>
                  <div className="text-[10px] text-zinc-600">{sub as string}</div>
                </div>
              </div>
              <input type="checkbox" checked={(tests as any)[k as string]}
                onChange={e=>setTests({...tests,[k as string]:e.target.checked})}
                className={`w-4 h-4 rounded ${danger?'accent-red-500':'accent-emerald-500'}`} />
            </label>
          ))}
        </div>
      </div>

      {/* Sensor noise — Tier 1 */}
      <div>
        <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2 flex items-center gap-1">
          <Wifi className="w-3 h-3" /> Sensor Noise (Sim-to-Real)
        </h3>
        <label className="flex items-center justify-between p-2.5 bg-zinc-950 rounded-lg border border-zinc-800 cursor-pointer hover:border-zinc-700 mb-2">
          <div>
            <div className="text-xs text-zinc-200">Enable Sensor Noise</div>
            <div className="text-[10px] text-zinc-600">IMU bias, baro drift, GPS jitter</div>
          </div>
          <input type="checkbox" checked={sensorCfg.enableNoise}
            onChange={e=>setSensorCfg({...sensorCfg,enableNoise:e.target.checked})}
            className="w-4 h-4 accent-emerald-500" />
        </label>
        {sensorCfg.enableNoise && (
          <div className="space-y-2 pl-1">
            <div>
              <label className="block text-xs text-zinc-500 mb-1">IMU Noise: <span className="text-zinc-300">{(sensorCfg.imuNoiseLevel*100).toFixed(0)}%</span></label>
              <input type="range" min={0} max={1} step={0.05} value={sensorCfg.imuNoiseLevel}
                onChange={e=>setSensorCfg({...sensorCfg,imuNoiseLevel:parseFloat(e.target.value)})}
                className="w-full accent-purple-500" />
            </div>
            <div>
              <label className="block text-xs text-zinc-500 mb-1">GPS Noise: <span className="text-zinc-300">{(sensorCfg.gpsNoiseLevel*100).toFixed(0)}%</span></label>
              <input type="range" min={0} max={1} step={0.05} value={sensorCfg.gpsNoiseLevel}
                onChange={e=>setSensorCfg({...sensorCfg,gpsNoiseLevel:parseFloat(e.target.value)})}
                className="w-full accent-purple-500" />
            </div>
          </div>
        )}
      </div>

      {/* Mission presets */}
      <div>
        <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">Mission Preset</h3>
        <select value={tests.missionPreset} onChange={e=>setTests({...tests,missionPreset:e.target.value as any})}
          className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-emerald-500 mb-3">
          <option value="none">None (Free Flight)</option>
          <option value="long-range">Long-Range Delivery</option>
          <option value="precision-drop">Precision Drop</option>
          <option value="high-speed">High-Speed Intercept</option>
        </select>
      </div>

      {/* Stability stats */}
      <div className="p-3 bg-zinc-950 rounded-lg border border-zinc-800">
        <div className="flex items-center gap-2 mb-2">
          <Activity className="w-3.5 h-3.5 text-emerald-400" />
          <span className="text-xs font-bold text-zinc-300">Hover Precision</span>
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs font-mono">
          <div className="bg-zinc-900 p-2 rounded border border-zinc-800">
            <div className="text-zinc-500 text-[10px] mb-0.5">GPS DRIFT</div>
            <div className={hoverMetrics.gpsDrift>0.5?'text-amber-400':'text-emerald-400'}>{hoverMetrics.gpsDrift.toFixed(3)} m</div>
          </div>
          <div className="bg-zinc-900 p-2 rounded border border-zinc-800">
            <div className="text-zinc-500 text-[10px] mb-0.5">ANG JITTER</div>
            <div className={hoverMetrics.angularJitter>0.1?'text-amber-400':'text-emerald-400'}>{(hoverMetrics.angularJitter*180/Math.PI).toFixed(2)}°</div>
          </div>
        </div>
      </div>
    </div>
  );
};

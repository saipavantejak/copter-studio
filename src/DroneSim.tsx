// DroneSim.tsx — v12
// Fix: 3D mesh now reflects droneType (bicopter / quadcopter / hexacopter).
// Previously the geometry was hardcoded to a bicopter regardless of config.
//
// Changes:
//   • getRotorDefs() computes arm/rotor layout per drone type
//   • DroneMesh renders the correct number of arms and rotors
//   • Rotor spin refs are dynamic (up to 6)
//   • Ghost drone also switches shape with the main drone
//   • DroneModel receives config and reacts to droneType changes via useMemo
//   • All v11 physics/telemetry/crash logic is unchanged

import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Environment, Grid, Box, Cylinder } from '@react-three/drei';
import { useRef, useState, useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { PhysicsEngine, PhysicsConfig, TestModules, DroneState } from './PhysicsEngine';
import { SensorConfig } from './SensorNoise';
import { RLAgent } from './RLAgent';
import { MissionLogic, MissionMetrics, TelemetryHistory } from './MissionLogic';

interface DroneSimProps {
  agentRef: React.MutableRefObject<RLAgent>;
  pdAgentRef: React.MutableRefObject<RLAgent>;
  onTelemetryUpdate: (data: DroneState) => void;
  onCrash: (data: any) => void;
  onMetricsUpdate?: (metrics: MissionMetrics, historyData: { time: number; sec: number; spt: number }[], fullHistory: TelemetryHistory[]) => void;
  onReset?: () => void;
  onActionUpdate?: (action: number[]) => void;
  onNoisyStateUpdate?: (noisy: DroneState) => void;
  config: PhysicsConfig;
  tests: TestModules;
  sensorCfg: SensorConfig;
  comparisonMode: boolean;
  resetTrigger?: number;
  paused?: boolean;
}

// ── Rotor layout helpers ──────────────────────────────────────────────────────

interface RotorDef {
  pos: [number, number, number];
  spinDir: 1 | -1;
}

export function getRotorDefs(droneType: string, armLength: number): RotorDef[] {
  if (droneType === 'quadcopter') {
    const d = armLength * 0.707;
    return [
      { pos: [ d, 0.05,  d], spinDir:  1 },
      { pos: [-d, 0.05,  d], spinDir: -1 },
      { pos: [ d, 0.05, -d], spinDir: -1 },
      { pos: [-d, 0.05, -d], spinDir:  1 },
    ];
  }
  if (droneType === 'hexacopter') {
    return Array.from({ length: 6 }, (_, i) => {
      const ang = (i * Math.PI * 2) / 6 + Math.PI / 6; // align with UniversalMixer angles
      return {
        pos:     [armLength * Math.cos(ang), 0.05, armLength * Math.sin(ang)] as [number,number,number],
        spinDir: (i % 2 === 0 ? 1 : -1) as 1 | -1,
      };
    });
  }
  // bicopter — single lateral arm
  return [
    { pos: [-armLength, 0.05, 0], spinDir:  1 },
    { pos: [ armLength, 0.05, 0], spinDir: -1 },
  ];
}

// ── Arm ───────────────────────────────────────────────────────────────────────

export const Arm = ({ to, isGhost }: { to: [number,number,number]; isGhost: boolean }) => {
  const from: [number,number,number] = [0, 0.03, 0];
  const dx = to[0]-from[0], dy = to[1]-from[1], dz = to[2]-from[2];
  const len = Math.sqrt(dx*dx + dy*dy + dz*dz);
  const mid: [number,number,number] = [(from[0]+to[0])/2, (from[1]+to[1])/2, (from[2]+to[2])/2];
  const quat = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0,1,0),
    new THREE.Vector3(dx,dy,dz).normalize(),
  );
  return (
    <Cylinder args={[0.018, 0.018, len, 8]} position={mid} quaternion={quat}>
      <meshStandardMaterial
        color={isGhost ? '#fbbf24' : '#1a1a1a'}
        transparent={isGhost} opacity={isGhost ? 0.4 : 1}
        wireframe={isGhost}
      />
    </Cylinder>
  );
};

// ── Rotor hub ─────────────────────────────────────────────────────────────────

export const RotorHub = ({
  pos, spinRef, isGhost,
}: {
  pos: [number, number, number];
  spinRef: React.MutableRefObject<THREE.Group | null>;
  isGhost: boolean;
}) => (
  <group position={pos}>
    <Cylinder args={[0.05, 0.05, 0.10, 12]}>
      <meshStandardMaterial
        color={isGhost ? '#fbbf24' : '#2a2a2a'}
        transparent={isGhost} opacity={isGhost ? 0.3 : 1}
        wireframe={isGhost}
      />
    </Cylinder>
    {!isGhost && (
      <Cylinder args={[0.08, 0.08, 0.02, 12]} position={[0, 0.065, 0]}>
        <meshStandardMaterial color="#aaaaaa" metalness={0.9} />
      </Cylinder>
    )}
    <group ref={spinRef} position={[0, 0.09, 0]}>
      <Box args={[0.65, 0.012, 0.05]} castShadow={!isGhost}>
        <meshStandardMaterial
          color={isGhost ? '#f59e0b' : '#080808'}
          roughness={0.3}
          transparent={isGhost} opacity={isGhost ? 0.35 : 1}
          wireframe={isGhost}
        />
      </Box>
    </group>
  </group>
);

// ── Full drone mesh (type-aware) ──────────────────────────────────────────────

export const DroneMesh = ({
  rotorDefs, rotorRefs, isGhost,
}: {
  rotorDefs: RotorDef[];
  rotorRefs: React.MutableRefObject<THREE.Group | null>[];
  isGhost: boolean;
}) => (
  <>
    <Box args={[0.22, 0.09, 0.22]} castShadow={!isGhost}>
      <meshStandardMaterial
        color={isGhost ? '#fbbf24' : '#888888'}
        metalness={isGhost ? 0 : 0.8} roughness={isGhost ? 1 : 0.2}
        transparent={isGhost} opacity={isGhost ? 0.35 : 1}
        wireframe={isGhost}
      />
    </Box>
    <Box args={[0.15, 0.15, 0.15]} position={[0, -0.15, 0]} castShadow={!isGhost}>
      <meshStandardMaterial
        color={isGhost ? '#f59e0b' : '#ffaa00'}
        transparent={isGhost} opacity={isGhost ? 0.3 : 1}
        wireframe={isGhost}
      />
    </Box>
    {rotorDefs.map((r, i) => (
      <Arm key={`arm-${i}`} to={r.pos} isGhost={isGhost} />
    ))}
    {rotorDefs.map((r, i) => (
      <RotorHub key={`hub-${i}`} pos={r.pos} spinRef={rotorRefs[i]} isGhost={isGhost} />
    ))}
  </>
);

// ── DroneModel — physics loop + mesh ─────────────────────────────────────────

const DroneModel = ({
  physicsRef, ghostPhysicsRef, agentRef, pdAgentRef,
  isRunningRef, onTelemetryUpdate, onCrash, tests, sensorCfg,
  onMetricsUpdate, onActionUpdate, onNoisyStateUpdate, comparisonMode, config,
}: {
  physicsRef: React.MutableRefObject<PhysicsEngine>;
  ghostPhysicsRef: React.MutableRefObject<PhysicsEngine>;
  agentRef: React.MutableRefObject<RLAgent>;
  pdAgentRef: React.MutableRefObject<RLAgent>;
  isRunningRef: React.MutableRefObject<boolean>;
  onTelemetryUpdate: (d: DroneState) => void;
  onCrash: (d: any) => void;
  tests: TestModules;
  sensorCfg: SensorConfig;
  onMetricsUpdate?: (m: MissionMetrics, h: { time: number; sec: number; spt: number }[], full: TelemetryHistory[]) => void;
  onActionUpdate?: (a: number[]) => void;
  onNoisyStateUpdate?: (n: DroneState) => void;
  comparisonMode: boolean;
  config: PhysicsConfig;
}) => {
  const groupRef      = useRef<THREE.Group>(null);
  const ghostGroupRef = useRef<THREE.Group>(null);
  const lastUpd       = useRef(0);
  const histRef       = useRef<TelemetryHistory[]>([]);
  const cachedM       = useRef<MissionMetrics | null>(null);
  const frameErrCount = useRef(0);

  // Always allocate 6 rotor refs (max for hexacopter); only first N are used
  // Individual useRef calls to comply with Rules of Hooks (no hooks in loops)
  const r0=useRef<THREE.Group>(null), r1=useRef<THREE.Group>(null), r2=useRef<THREE.Group>(null),
        r3=useRef<THREE.Group>(null), r4=useRef<THREE.Group>(null), r5=useRef<THREE.Group>(null);
  const rotorRefs = [r0,r1,r2,r3,r4,r5];
  const g0=useRef<THREE.Group>(null), g1=useRef<THREE.Group>(null), g2=useRef<THREE.Group>(null),
        g3=useRef<THREE.Group>(null), g4=useRef<THREE.Group>(null), g5=useRef<THREE.Group>(null);
  const ghostRotorRefs = [g0,g1,g2,g3,g4,g5];

  const rotorDefs = useMemo(
    () => getRotorDefs(config.droneType, config.armLength),
    [config.droneType, config.armLength],
  );

  useFrame(() => {
    if (!isRunningRef.current) return;
    try {
      const phys  = physicsRef.current;
      const ghost = ghostPhysicsRef.current;

      if (phys.getState().time < 0.02 && histRef.current.length > 0) histRef.current = [];

      const obs      = phys.getObservation();
      const stateArr = [obs.x,obs.y,obs.z,obs.x_dot,obs.y_dot,obs.z_dot,obs.phi,obs.theta,obs.psi,obs.p,obs.q,obs.r];
      const action   = agentRef.current.predictAction(stateArr, obs.droneType, tests.missionPreset, config.mass);
      const ns       = phys.step(action);

      if (groupRef.current) {
        groupRef.current.position.set(ns.x, Math.max(0, ns.z), -ns.y);
        groupRef.current.rotation.set(ns.phi, ns.psi, ns.theta);
      }

      // Spin all rotors correctly for this drone type
      rotorDefs.forEach((r, i) => {
        const ref = rotorRefs[i]?.current;
        if (!ref) return;
        const cmd = action[i] ?? 0;
        ref.rotation.y += r.spinDir * (0.18 + (cmd + 1) * 0.1);
      });

      if (comparisonMode) {
        const gObs = ghost.getObservation();
        const gArr = [gObs.x,gObs.y,gObs.z,gObs.x_dot,gObs.y_dot,gObs.z_dot,gObs.phi,gObs.theta,gObs.psi,gObs.p,gObs.q,gObs.r];
        const gAct = pdAgentRef.current.heuristicAction(gObs, gObs.droneType, tests.missionPreset);
        const gNs  = ghost.step(gAct as number[]);
        if (ghostGroupRef.current) {
          ghostGroupRef.current.position.set(gNs.x, Math.max(0, gNs.z), -gNs.y);
          ghostGroupRef.current.rotation.set(gNs.phi, gNs.psi, gNs.theta);
        }
        rotorDefs.forEach((r, i) => {
          const ref = ghostRotorRefs[i]?.current;
          if (!ref) return;
          const cmd = (gAct as number[])[i] ?? 0;
          ref.rotation.y += r.spinDir * (0.18 + (cmd + 1) * 0.1);
        });
      }

      const entry: TelemetryHistory = { ...ns, servos: action };
      const now = performance.now();
      if (now - lastUpd.current > 100) {
        const m = MissionLogic.calculateMetrics(phys.config, ns, histRef.current, phys.totalEnergyConsumed, phys.totalDistance);
        cachedM.current = m;
        lastUpd.current = now;
        onTelemetryUpdate(ns);
        onActionUpdate?.(action);
        onNoisyStateUpdate?.(obs);
        if (onMetricsUpdate) {
          const cd = histRef.current.filter((_,i)=>i%10===0).map(h=>({ time:h.time, sec:h.sec||0, spt:h.spt||0 }));
          onMetricsUpdate(m, cd, [...histRef.current]);
        }
      }

      entry.sec = cachedM.current?.sec ?? 0;
      entry.spt = cachedM.current?.spt ?? 0;
      histRef.current.push(entry);
      if (histRef.current.length > 500) histRef.current.shift();

      if (ns.z < 0.1 && (Math.abs(ns.phi) > 0.5 || Math.abs(ns.theta) > 0.5)) {
        isRunningRef.current = false;
        onCrash({ reason: 'Crash: high roll/pitch near ground.', telemetry: entry });
      }
      // Altitude runaway detection
      if (ns.z > 500 && !isCrashed) {
        setIsCrashed(true);
        onCrash?.({ reason: 'Altitude runaway: drone exceeded 500m.', telemetry: entry });
      }
      // Velocity divergence detection
      if ((Math.abs(ns.z_dot) > 45 || Math.abs(ns.x_dot) > 45 || Math.abs(ns.y_dot) > 45) && !isCrashed) {
        setIsCrashed(true);
        onCrash?.({ reason: 'Velocity divergence: speed exceeded 45 m/s.', telemetry: entry });
      }
      // Attitude divergence at altitude (inverted flight)
      if ((Math.abs(ns.phi) > Math.PI / 3 || Math.abs(ns.theta) > Math.PI / 3) && ns.z > 0.5 && !isCrashed) {
        setIsCrashed(true);
        onCrash?.({ reason: `Attitude divergence: roll=${(ns.phi*180/Math.PI).toFixed(1)}° pitch=${(ns.theta*180/Math.PI).toFixed(1)}°`, telemetry: entry });
      }

      frameErrCount.current = 0;
    } catch (err: any) {
      frameErrCount.current += 1;
      console.error(`[DroneSim] useFrame error (${frameErrCount.current}):`, err?.message ?? err);
      if (frameErrCount.current >= 3) {
        isRunningRef.current = false;
        onCrash({
          reason: `Simulation halted: runtime error in physics loop — ${err?.message ?? String(err)}`,
          telemetry: null,
        });
      }
    }
  });

  return (
    <>
      <group ref={groupRef}>
        <DroneMesh
          rotorDefs={rotorDefs}
          rotorRefs={rotorRefs.slice(0, rotorDefs.length)}
          isGhost={false}
        />
      </group>
      {comparisonMode && (
        <group ref={ghostGroupRef}>
          <DroneMesh
            rotorDefs={rotorDefs}
            rotorRefs={ghostRotorRefs.slice(0, rotorDefs.length)}
            isGhost
          />
        </group>
      )}
    </>
  );
};

// ── DroneSim (scene wrapper) ──────────────────────────────────────────────────

export const DroneSim = ({
  agentRef, pdAgentRef, onTelemetryUpdate, onCrash,
  onMetricsUpdate, onReset, onActionUpdate, onNoisyStateUpdate,
  config, tests, sensorCfg, comparisonMode, resetTrigger, paused,
}: DroneSimProps) => {
  const physicsRef      = useRef(new PhysicsEngine());
  const ghostPhysicsRef = useRef(new PhysicsEngine());
  const isRunningRef    = useRef(!paused);
  const [uiState,   setUiState]   = useState(physicsRef.current.getState());
  const [isCrashed, setIsCrashed] = useState(false);

  useEffect(() => {
    physicsRef.current.config         = config;
    physicsRef.current.tests          = tests;
    physicsRef.current.sensorCfg      = sensorCfg;
    ghostPhysicsRef.current.config    = config;
    ghostPhysicsRef.current.tests     = tests;
    ghostPhysicsRef.current.sensorCfg = sensorCfg;
  }, [config, tests, sensorCfg]);

  const handleReset = () => {
    physicsRef.current.config         = config;
    physicsRef.current.tests          = tests;
    physicsRef.current.sensorCfg      = sensorCfg;
    ghostPhysicsRef.current.config    = config;
    ghostPhysicsRef.current.tests     = tests;
    ghostPhysicsRef.current.sensorCfg = sensorCfg;
    physicsRef.current.reset();
    ghostPhysicsRef.current.reset();
    isRunningRef.current = true;
    setIsCrashed(false);
    onReset?.();
  };

  useEffect(() => {
    if (resetTrigger === undefined || resetTrigger === 0) return;
    handleReset();
  }, [resetTrigger]);

  useEffect(() => {
    isRunningRef.current = !paused;
  }, [paused]);

  return (
    <div className="w-full h-full relative bg-zinc-900">
      <Canvas shadows camera={{ position: [2, 2, 3], fov: 50 }}>
        <color attach="background" args={['#18181b']} />
        <ambientLight intensity={0.5} />
        <directionalLight position={[5,10,5]} intensity={1.2} castShadow
          shadow-mapSize-width={1024} shadow-mapSize-height={1024} />
        <pointLight position={[-3,3,-3]} intensity={0.4} color="#237227" />
        <DroneModel
          physicsRef={physicsRef} ghostPhysicsRef={ghostPhysicsRef}
          agentRef={agentRef} pdAgentRef={pdAgentRef}
          isRunningRef={isRunningRef}
          onTelemetryUpdate={s => { setUiState(s); onTelemetryUpdate(s); }}
          onCrash={d => { setIsCrashed(true); onCrash(d); }}
          tests={tests} sensorCfg={sensorCfg}
          onMetricsUpdate={onMetricsUpdate}
          onActionUpdate={onActionUpdate}
          onNoisyStateUpdate={onNoisyStateUpdate}
          comparisonMode={comparisonMode}
          config={config}
        />
        <Grid infiniteGrid fadeDistance={20} sectionColor="#444" cellColor="#222" position={[0,-0.01,0]} />
        <mesh position={[0,1.0,0]} rotation={[Math.PI/2,0,0]}>
          <torusGeometry args={[0.35,0.012,8,40]} />
          <meshStandardMaterial color="#237227" emissive="#237227" emissiveIntensity={0.7} />
        </mesh>
        <mesh position={[0,0.5,0]}>
          <cylinderGeometry args={[0.006,0.006,1,6]} />
          <meshStandardMaterial color="#237227" emissive="#237227" emissiveIntensity={0.3} />
        </mesh>
        <OrbitControls makeDefault />
        <Environment preset="city" />
      </Canvas>

      {/* Telemetry HUD removed — App.tsx glassmorphism overlay replaces it */}
      <div className="absolute top-4 left-4 z-20">
        {comparisonMode && <div className="bg-black/70 backdrop-blur-md px-2.5 py-1.5 rounded-lg border border-white/10 text-amber-400 text-[10px] font-mono mb-1.5">◎ Ghost = Heuristic PD</div>}
        {sensorCfg.enableNoise && <div className="bg-black/70 backdrop-blur-md px-2.5 py-1.5 rounded-lg border border-white/10 text-purple-400 text-[10px] font-mono mb-1.5">⚡ Sensor noise ON</div>}
        {isCrashed && <div className="bg-red-500/20 backdrop-blur-md px-2.5 py-1.5 rounded-lg border border-red-500/30 text-red-400 text-[10px] font-bold font-mono animate-pulse mb-1.5">CRASH DETECTED</div>}
        <button onClick={handleReset}
          className="px-2.5 py-1.5 bg-emerald-600/90 hover:bg-emerald-500 backdrop-blur-md rounded-lg text-white text-[10px] font-mono transition-colors">
          RESET SIM
        </button>
      </div>
    </div>
  );
};

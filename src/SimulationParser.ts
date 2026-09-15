import { configErrors } from './configValidation';
import { DEFAULT_MISSION, missionErrors } from './MissionSpec';
// Converts natural language simulation requests → structured SimulationIntent.
// Two-path design:
//   1. Gemini API (if key present) — full semantic understanding
//   2. Local heuristic parser — deterministic regex fallback, always available
//
// Outputs rich Ambiguity objects so the ApprovalDialog can explain every
// assumption made and request user sign-off before touching the simulator.

import type { PhysicsConfig, TestModules } from './PhysicsEngine';
import type { SensorConfig } from './SensorNoise';

// ── Public types ──────────────────────────────────────────────────────────────

export type AmbiguityLevel = 'info' | 'warning' | 'error';

export interface Ambiguity {
  level: AmbiguityLevel;
  field: string;
  issue: string;
  assumed: string;
  suggestion?: string;
}

export interface SimulationIntent {
  type: 'live' | 'benchmark' | 'autotrain';
  sensorRequested?: boolean;
  domainRandRequested?: boolean;
  config: PhysicsConfig;
  tests: TestModules;
  sensorCfg: SensorConfig;
  numEpisodes: number;
  masterSeed: number;
  domainRandEnabled: boolean;
  ambiguities: Ambiguity[];
  /** Clean, unambiguous re-phrasing shown to user for approval */
  suggestedPrompt: string;
  reasoning: string;
  confidence: 'high' | 'medium' | 'low';
}

// ── Defaults ──────────────────────────────────────────────────────────────────

const DEF_CONFIG: PhysicsConfig = {
  droneType: 'bicopter', mass: 5.0, propDiameter: 15,
  batteryVoltage: 22.2, armLength: 0.5,
};
const DEF_TESTS: TestModules = {
  windEnabled: false, payloadShiftEnabled: false,
  batterySagEnabled: false, motorOutEnabled: false, missionPreset: 'none',
};
const DEF_SENSOR: SensorConfig = { enableNoise: false, imuNoiseLevel: 0.5, gpsNoiseLevel: 0.5 };

// Cloud-response validation remains exported for callers/tests, but execution
// uses the deterministic supported grammar below.
export function hydrateGeminiResponse(r: any): SimulationIntent {
  const cl = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
  const config = {...DEF_CONFIG, ...r.config};
  const problems = configErrors(config).map(issue => ({level:'error' as const,field:'config',issue,assumed:'Input unchanged; execution blocked'}));
  for (const key of ['windEnabled','payloadShiftEnabled','batterySagEnabled','motorOutEnabled']) {
    if (r.tests?.[key] !== undefined && typeof r.tests[key] !== 'boolean') problems.push({level:'error',field:key,issue:'Expected boolean',assumed:'Execution blocked'});
  }
  return {
    type:   r.type === 'benchmark' ? 'benchmark' : (r.type === 'autotrain' ? 'autotrain' : 'live'),
    config,
    tests: {
      windEnabled:          r.tests?.windEnabled          ?? false,
      payloadShiftEnabled:  r.tests?.payloadShiftEnabled  ?? false,
      batterySagEnabled:    r.tests?.batterySagEnabled    ?? false,
      motorOutEnabled:      r.tests?.motorOutEnabled      ?? false,
      missionPreset:        r.tests?.missionPreset        ?? 'none',
    },
    sensorCfg:       { enableNoise: r.enableSensorNoise ?? false, imuNoiseLevel: 0.5, gpsNoiseLevel: 0.5 },
    numEpisodes:     cl(r.numEpisodes ?? 50, 1, 500),
    masterSeed:      r.masterSeed      ?? 42,
    domainRandEnabled: r.domainRandEnabled ?? false,
    ambiguities:     [...problems, ...(Array.isArray(r.ambiguities) ? r.ambiguities : [])].map((a: any) => ({
      level: a.level ?? 'info', field: a.field ?? '?',
      issue: a.issue ?? '', assumed: a.assumed ?? '', suggestion: a.suggestion,
    })),
    suggestedPrompt: r.suggestedPrompt ?? '',
    reasoning:       r.reasoning       ?? '',
    confidence:      r.confidence      ?? 'medium',
  };
}

// ── Local heuristic parser ────────────────────────────────────────────────────

export function localParse(msg: string, currentConfig: PhysicsConfig = DEF_CONFIG, currentTests: TestModules = DEF_TESTS): SimulationIntent {
  const ambiguities: Ambiguity[] = [];
  const cl = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

  // Type
  const isBenchmark = /benchmark|stress[\s-]?test|batch|episodes?|run\s+\d+\s*times?|headless/i.test(msg);
  const isAutoTrain = /train|auto-rl|generate\s+policy\b/i.test(msg);
  const type: 'live' | 'benchmark' | 'autotrain' = isAutoTrain ? 'autotrain' : (isBenchmark ? 'benchmark' : 'live');

  // Drone type
  let droneType: PhysicsConfig['droneType'] = currentConfig.droneType;
  if (/\bquad(copter)?\b/i.test(msg)) droneType = 'quadcopter';
  else if (/\bhex(acopter)?\b/i.test(msg)) droneType = 'hexacopter';
  else if (/\bbicopter\b/i.test(msg)) droneType = 'bicopter';

  // Mass
  let mass = currentConfig.mass;
  const kgMatch = msg.match(/(-?\d+(?:\.\d+)?)\s*(kg|kilograms?|grams?|g)\b/i);
  if (kgMatch) {
    const v = parseFloat(kgMatch[1]) * (/^(g|grams?)$/i.test(kgMatch[2]) ? 0.001 : 1);
    mass = v;
  } else {
    ambiguities.push({level:'info',field:'mass',issue:'Mass not supplied',assumed:'Retain current mass'});
  }

  // Prop diameter
  let propDiameter = currentConfig.propDiameter;
  const propMatch = msg.match(/(-?\d+(?:\.\d+)?)\s*(?:inch(?:es)?|in|")\s*(?:prop|propeller)?/i);
  if (propMatch) propDiameter = parseFloat(propMatch[1]);
  else ambiguities.push({ level: 'info', field: 'propDiameter', issue: 'Prop diameter not specified', assumed: 'Retain current prop diameter' });

  // Battery voltage
  let batteryVoltage = currentConfig.batteryVoltage;
  const voltMatch = msg.match(/(-?\d+(?:\.\d+)?)\s*[Vv](?:\b|olt)/);
  if (voltMatch) {
    const v = parseFloat(voltMatch[1]);
    batteryVoltage = v;
  }

  // Arm length
  let armLength = currentConfig.armLength;
  const armMatch = msg.match(/arm[\s-]?(?:length)?\s*[=:]?\s*(-?\d+(?:\.\d+)?)\s*(mm|cm|m)\b/i);
  if (armMatch) armLength = parseFloat(armMatch[1]) * (armMatch[2].toLowerCase()==='mm' ? 0.001 : armMatch[2].toLowerCase()==='cm' ? 0.01 : 1);

  // Test modules
  let windEnabled          = /\bwind\b|\bgust|\bturbulen|\bstorm\b|\bbreezy\b/i.test(msg);
  let payloadShiftEnabled  = /\bpayload[\s-]?shift|\bcog\b|\bunbalanced|center[\s-]of[\s-]gravity/i.test(msg);
  let batterySagEnabled    = /\bbattery[\s-]?sag|\bendurance\b|\bvoltage[\s-]?drop|\bdrain\b/i.test(msg);
  let motorOutEnabled      = /\bmotor[\s-]?out|\bengine[\s-]?fail|\bone[\s-]motor|\bmotor[\s-]?fail|\bfault\b/i.test(msg);

  // Mission preset
  let missionPreset: TestModules['missionPreset'] = currentTests.missionPreset;
  if (/long[\s-]?range|\bdelivery\b/i.test(msg)) missionPreset = 'long-range';
  else if (/\bprecision\b|\bdrop\b/i.test(msg))  missionPreset = 'precision-drop';
  else if (/high[\s-]?speed|\bintercept\b|\bfast\b/i.test(msg)) missionPreset = 'high-speed';

  // Sensor noise
  const enableNoise = !/no sensor|disable sensor/i.test(msg) && /sensor[\s-]?noise|\bnoisy\b|realistic[\s-]?sensor|real[\s-]?world[\s-]?sensor/i.test(msg);

  // Domain rand
  const domainRandEnabled = !/no domain|disable domain/i.test(msg) && /domain[\s-]?rand|\brobust\b|randomize[\s-]?param|sim[\s-]?to[\s-]?real/i.test(msg);

  // Episodes
  let numEpisodes = 50;
  const epMatch = msg.match(/(-?\d+)[\s-]*episodes?/i);
  if (epMatch) numEpisodes = parseInt(epMatch[1]);
  else if (isBenchmark) ambiguities.push({ level: 'info', field: 'numEpisodes', issue: 'Episode count not specified', assumed: '50 (default)' });

  // Seed
  let masterSeed = 42;
  const seedMatch = msg.match(/\bseed\s*[=:]?\s*(-?\d+)/i);
  if (seedMatch) masterSeed = parseInt(seedMatch[1]);

  if (!Number.isInteger(numEpisodes) || numEpisodes < 1 || numEpisodes > 500) ambiguities.push({level:'error',field:'numEpisodes',issue:'Use 1–500 episodes',assumed:'Not clamped; execution blocked'});
  if (!Number.isSafeInteger(masterSeed) || masterSeed < 0 || masterSeed > 0xffffffff) ambiguities.push({level:'error',field:'seed',issue:'Use a uint32 seed',assumed:'Execution blocked'});
  // Physics sanity check
  if (mass > 15 && propDiameter <= 10 && droneType === 'bicopter') {
    ambiguities.push({
      level: 'warning', field: 'thrust_margin',
      issue: `${mass}kg mass with ${propDiameter}" props on a bicopter likely cannot hover`,
      assumed: 'Config accepted as-is — expect immediate crash',
      suggestion: 'Increase propDiameter to ≥18" or reduce mass below 8kg'
    });
  }

  // Preserve unspecified faults; handle explicit negation and all-fault requests.
  const flag = (term: string, parsed: boolean, previous: boolean) =>
    new RegExp(term, 'i').test(msg) ? !new RegExp('(?:no|without|disable)\\s+'+term+'|'+term+'\\s+(?:off|disabled)','i').test(msg) && parsed : previous;
  windEnabled = flag('wind',windEnabled,currentTests.windEnabled);
  payloadShiftEnabled = flag('payload[ -]?shift',payloadShiftEnabled,currentTests.payloadShiftEnabled);
  batterySagEnabled = flag('battery[ -]?sag',batterySagEnabled,currentTests.batterySagEnabled);
  motorOutEnabled = flag('motor[ -]?(?:out|fail)',motorOutEnabled,currentTests.motorOutEnabled);
  if (/all\s+fault/i.test(msg)) {
    const enabled = !/(?:no|without|disable)\s+all\s+fault/i.test(msg);
    windEnabled = payloadShiftEnabled = batterySagEnabled = motorOutEnabled = enabled;
  }
  let mission = currentTests.mission;
  const altitude = msg.match(/(?:hover(?:\s+at)?|altitude)\s*[=:]?\s*(-?\d+(?:\.\d+)?)\s*(?:meters?|metres?|m)\b/i);
  const speed = msg.match(/(-?\d+(?:\.\d+)?)\s*(?:m\/s|mps)/i);
  const duration = msg.match(/(?:for|duration)\s*[=:]?\s*(-?\d+(?:\.\d+)?)\s*(seconds?|secs?|s|minutes?|mins?)\b/i);
  if (/\bhover\b|fly forward/i.test(msg) || altitude || speed || duration) {
    mission = {...DEFAULT_MISSION,...mission};
    if (/\bhover\b/i.test(msg)) {mission.mode='hover';mission.forwardVelocityMps=0;}
    if (altitude) mission.targetAltitudeM=Number(altitude[1]);
    if (speed) {mission.mode='velocity';mission.forwardVelocityMps=Number(speed[1]);}
    if (duration) mission.durationSeconds=Number(duration[1])*(/^min/i.test(duration[2])?60:1);
    missionPreset='none';
    for (const issue of missionErrors(mission)) ambiguities.push({level:'error',field:'mission',issue,assumed:'Execution blocked'});
  }
  const finalConfig = {...currentConfig,droneType,mass,propDiameter,batteryVoltage,armLength};
  const capacity = msg.match(/(-?\d+(?:\.\d+)?)\s*mAh\b/i);
  if (capacity) finalConfig.batteryCapacity=Number(capacity[1]);
  for (const issue of configErrors(finalConfig)) ambiguities.push({level:'error',field:'config',issue,assumed:'Input preserved; execution blocked'});
  if (/waypoint|heading|orbit|fly left|fly right|backward|return.to.home/i.test(msg))
    ambiguities.push({level:'error',field:'mission',issue:'Unsupported mission feature',assumed:'Execution blocked; no silent substitution'});
  if (/\bpayload\b/i.test(msg) && !/payload[ -]?shift/i.test(msg) && /\d\s*(?:kg|g)\b/i.test(msg))
    ambiguities.push({level:'error',field:'payload',issue:'Specify total mass and payloadMassKg separately in the advanced configuration editor',assumed:'Execution blocked to avoid confusing payload with total mass'});
  ambiguities.push({level:'warning',field:'validation',issue:'Generic dynamics are estimates, not physical validation',assumed:'Experimental simulation'});

  // Suggested prompt
  const mods = [windEnabled&&'wind',payloadShiftEnabled&&'payload shift',
    batterySagEnabled&&'battery sag',motorOutEnabled&&'motor-out'].filter(Boolean).join(' + ') || 'no fault modules';
  const suggestedPrompt =
    `${type==='benchmark'?`Run ${numEpisodes}-episode benchmark`:(type==='autotrain'?'Train Colab Auto-RL policy':'Simulate live flight')} | ` +
    `${droneType} | mass=${mass}kg | ${propDiameter}" props | ${batteryVoltage}V | arm=${armLength}m | ` +
    `Tests: ${mods} | Mission: ${mission ? JSON.stringify(mission) : missionPreset}` +
    (enableNoise ? ' | sensor noise ON' : '') +
    (domainRandEnabled ? ' | domain rand ON' : '');

  const hasError   = ambiguities.some(a => a.level === 'error');
  const hasWarning = ambiguities.some(a => a.level === 'warning');
  const confidence = hasError ? 'low' : hasWarning ? 'medium' : 'high';

  return {
    type, config: finalConfig,
    sensorRequested: /sensor|noisy/i.test(msg),
    domainRandRequested: /domain|robust|randomiz|sim.to.real/i.test(msg),
    tests: { windEnabled, payloadShiftEnabled, batterySagEnabled, motorOutEnabled, missionPreset, mission },
    sensorCfg: { enableNoise, imuNoiseLevel: 0.5, gpsNoiseLevel: 0.5 },
    numEpisodes, masterSeed, domainRandEnabled,
    ambiguities, suggestedPrompt,
    reasoning: `Deterministic execution parser (cloud chat is separate). Parsed from: "${msg.slice(0, 120)}"`,
    confidence,
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Parse a natural language message into a SimulationIntent.
 *  Supported grammar is deterministic; conversational assistance uses Gemini separately. */
export async function parseSimulationIntent(message: string, config: PhysicsConfig = DEF_CONFIG, tests: TestModules = DEF_TESTS): Promise<SimulationIntent> {
  // Execution uses deterministic supported grammar. Cloud chat remains available for
  // explanation, but cannot silently replace numerical configuration or mission fields.
  return localParse(message, config, tests);
}

/** Quick check: does this message look like a simulation command?
 *  Used in AetherInterface before spending time on full parsing. */
export function isSimulationCommand(message: string): boolean {
  const runWords  = /\b(run|simulate|fly|test|launch|execute|start|trigger|benchmark|batch|train|tweak)\b/i;
  const simTokens = /\b(sim|drone|flight|bicopter|quadcopter|hexacopter|wind|benchmark|episode|motor|payload|battery|stress[\s-]?test|long[\s-]?range|precision|high[\s-]?speed|policy|rl)\b/i;
  return /\b(hover|fly|simulate|benchmark)\b/i.test(message) || (runWords.test(message) && simTokens.test(message));
}

export { DEF_CONFIG, DEF_TESTS, DEF_SENSOR };

import { geminiClient } from './geminiClient';
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

// ── Gemini prompt ─────────────────────────────────────────────────────────────

const PARSE_SYSTEM = `You are a precision drone simulator configuration parser for the SWASH-BICOP-V11 digital twin.

Parse natural language into the JSON schema below. Be conservative — only deviate from defaults when the user explicitly requests it.

DEFAULTS: droneType=bicopter, mass=5.0kg, propDiameter=15in, batteryVoltage=22.2V, armLength=0.5m, type=live, numEpisodes=50, masterSeed=42

KEYWORD RULES:
- "benchmark"/"stress test"/"batch"/"N episodes" → type:benchmark
- "train"/"auto-rl"/"generate policy" → type:autotrain
- "quad" → droneType:quadcopter; "hex" → droneType:hexacopter
- "heavy"/"cargo" (no number) → mass≈8kg + warning ambiguity
- "light"/"micro" (no number) → mass≈2.5kg + warning ambiguity
- NUMBER+"kg" → mass=NUMBER
- "wind"/"gust"/"storm" → windEnabled:true
- "motor out"/"engine fail"/"fault" → motorOutEnabled:true
- "payload shift"/"CoG"/"unbalanced" → payloadShiftEnabled:true
- "battery sag"/"endurance"/"drain" → batterySagEnabled:true
- "long range"/"delivery" → missionPreset:long-range
- "precision drop" → missionPreset:precision-drop
- "high speed"/"intercept" → missionPreset:high-speed
- "sensor noise"/"noisy"/"realistic" → enableSensorNoise:true
- "domain rand"/"robust"/"sim-to-real" → domainRandEnabled:true

AMBIGUITY RULES:
- level:"info" → defaulted something minor, non-blocking
- level:"warning" → made a significant assumption (e.g. inferred mass from adjective)
- level:"error" → contradiction or physics-impossible value
- Always output at least one ambiguity noting what was defaulted.

Return ONLY valid JSON, no markdown fences:
{
  "type": "live"|"benchmark"|"autotrain",
  "config": {"droneType":"bicopter"|"quadcopter"|"hexacopter","mass":number,"propDiameter":number,"batteryVoltage":number,"armLength":number},
  "tests": {"windEnabled":bool,"payloadShiftEnabled":bool,"batterySagEnabled":bool,"motorOutEnabled":bool,"missionPreset":"none"|"long-range"|"precision-drop"|"high-speed"},
  "numEpisodes": number,
  "masterSeed": number,
  "enableSensorNoise": bool,
  "domainRandEnabled": bool,
  "ambiguities": [{"level":"info"|"warning"|"error","field":string,"issue":string,"assumed":string,"suggestion":string}],
  "suggestedPrompt": string,
  "reasoning": string,
  "confidence": "high"|"medium"|"low"
}`;

// ── Gemini path ───────────────────────────────────────────────────────────────

async function parseWithGemini(userMsg: string): Promise<SimulationIntent | null> {
  try {
    const text = await geminiClient.chat({
      model:             'gemini-2.0-flash',
      systemInstruction: PARSE_SYSTEM,
      temperature:       0.05,
    }).send(userMsg);
    let raw: any;
    try {
      raw = JSON.parse(text);
    } catch {
      const clean = text.replace(/```json|```/g, '').trim();
      raw = JSON.parse(clean);
    }
    return hydrateGeminiResponse(raw);
  } catch {
    return null;
  }
}

function hydrateGeminiResponse(r: any): SimulationIntent {
  const cl = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
  return {
    type:   r.type === 'benchmark' ? 'benchmark' : (r.type === 'autotrain' ? 'autotrain' : 'live'),
    config: {
      droneType:      r.config?.droneType      ?? 'bicopter',
      mass:           cl(r.config?.mass        ?? 5.0, 0.5, 20),
      propDiameter:   cl(r.config?.propDiameter ?? 15,  5,  30),
      batteryVoltage: cl(r.config?.batteryVoltage ?? 22.2, 11.1, 50),
      armLength:      cl(r.config?.armLength   ?? 0.5, 0.1, 1.5),
    },
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
    ambiguities:     (r.ambiguities ?? []).map((a: any) => ({
      level: a.level ?? 'info', field: a.field ?? '?',
      issue: a.issue ?? '', assumed: a.assumed ?? '', suggestion: a.suggestion,
    })),
    suggestedPrompt: r.suggestedPrompt ?? '',
    reasoning:       r.reasoning       ?? '',
    confidence:      r.confidence      ?? 'medium',
  };
}

// ── Local heuristic parser ────────────────────────────────────────────────────

function localParse(msg: string): SimulationIntent {
  const ambiguities: Ambiguity[] = [];
  const cl = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

  // Type
  const isBenchmark = /benchmark|stress[\s-]?test|batch|episodes?|run\s+\d+\s*times?|headless/i.test(msg);
  const isAutoTrain = /train|auto-rl|generate\s+policy\b/i.test(msg);
  const type: 'live' | 'benchmark' | 'autotrain' = isAutoTrain ? 'autotrain' : (isBenchmark ? 'benchmark' : 'live');

  // Drone type
  let droneType: PhysicsConfig['droneType'] = 'bicopter';
  if (/\bquad(copter)?\b/i.test(msg)) droneType = 'quadcopter';
  else if (/\bhex(acopter)?\b/i.test(msg)) droneType = 'hexacopter';
  else ambiguities.push({ level: 'info', field: 'droneType', issue: 'No drone type mentioned', assumed: 'bicopter (default)' });

  // Mass
  let mass = 5.0;
  const kgMatch = msg.match(/(\d+(?:\.\d+)?)\s*kg/i);
  if (kgMatch) {
    const v = parseFloat(kgMatch[1]);
    if (v < 0.5 || v > 20)
      ambiguities.push({ level: 'error', field: 'mass', issue: `${v}kg is outside range 0.5–20kg`, assumed: `Clamped to ${cl(v,0.5,20)}kg`, suggestion: 'Use a mass between 0.5kg and 20kg' });
    mass = cl(v, 0.5, 20);
  } else if (/\b(heavy|cargo|loaded|high[\s-]mass)\b/i.test(msg)) {
    mass = 8.0;
    ambiguities.push({ level: 'warning', field: 'mass', issue: '"Heavy" used without specifying kg', assumed: '8.0 kg (inferred)', suggestion: 'Specify exact mass, e.g. "9kg bicopter"' });
  } else if (/\b(light|micro|mini|low[\s-]mass)\b/i.test(msg)) {
    mass = 2.5;
    ambiguities.push({ level: 'warning', field: 'mass', issue: '"Light" used without specifying kg', assumed: '2.5 kg (inferred)', suggestion: 'Specify exact mass, e.g. "2.5kg bicopter"' });
  } else {
    ambiguities.push({ level: 'info', field: 'mass', issue: 'Mass not specified', assumed: '5.0 kg (default)' });
  }

  // Prop diameter
  let propDiameter = 15;
  const propMatch = msg.match(/(\d+(?:\.\d+)?)\s*(?:inch(?:es)?|in|")\s*(?:prop|propeller)?/i);
  if (propMatch) propDiameter = cl(parseFloat(propMatch[1]), 5, 30);
  else ambiguities.push({ level: 'info', field: 'propDiameter', issue: 'Prop diameter not specified', assumed: '15" (default)' });

  // Battery voltage
  let batteryVoltage = 22.2;
  const voltMatch = msg.match(/(\d+(?:\.\d+)?)\s*[Vv](?:\b|olt)/);
  if (voltMatch) {
    const v = parseFloat(voltMatch[1]);
    if (v < 11.1 || v > 50)
      ambiguities.push({ level: 'error', field: 'batteryVoltage', issue: `${v}V is outside range 11.1–50V`, assumed: `Clamped to ${cl(v,11.1,50)}V` });
    batteryVoltage = cl(v, 11.1, 50);
  }

  // Arm length
  let armLength = 0.5;
  const armMatch = msg.match(/arm[\s-]?(?:length)?\s*[=:]?\s*(\d+(?:\.\d+)?)\s*m/i);
  if (armMatch) armLength = cl(parseFloat(armMatch[1]), 0.1, 1.5);

  // Test modules
  const windEnabled          = /\bwind\b|\bgust|\bturbulen|\bstorm\b|\bbreezy\b/i.test(msg);
  const payloadShiftEnabled  = /\bpayload[\s-]?shift|\bcog\b|\bunbalanced|center[\s-]of[\s-]gravity/i.test(msg);
  const batterySagEnabled    = /\bbattery[\s-]?sag|\bendurance\b|\bvoltage[\s-]?drop|\bdrain\b/i.test(msg);
  const motorOutEnabled      = /\bmotor[\s-]?out|\bengine[\s-]?fail|\bone[\s-]motor|\bmotor[\s-]?fail|\bfault\b/i.test(msg);

  // Mission preset
  let missionPreset: TestModules['missionPreset'] = 'none';
  if (/long[\s-]?range|\bdelivery\b/i.test(msg)) missionPreset = 'long-range';
  else if (/\bprecision\b|\bdrop\b/i.test(msg))  missionPreset = 'precision-drop';
  else if (/high[\s-]?speed|\bintercept\b|\bfast\b/i.test(msg)) missionPreset = 'high-speed';

  // Sensor noise
  const enableNoise = /sensor[\s-]?noise|\bnoisy\b|realistic[\s-]?sensor|real[\s-]?world[\s-]?sensor/i.test(msg);

  // Domain rand
  const domainRandEnabled = /domain[\s-]?rand|\brobust\b|randomize[\s-]?param|sim[\s-]?to[\s-]?real/i.test(msg);

  // Episodes
  let numEpisodes = 50;
  const epMatch = msg.match(/(\d+)\s*episodes?/i);
  if (epMatch) numEpisodes = cl(parseInt(epMatch[1]), 1, 500);
  else if (isBenchmark) ambiguities.push({ level: 'info', field: 'numEpisodes', issue: 'Episode count not specified', assumed: '50 (default)' });

  // Seed
  let masterSeed = 42;
  const seedMatch = msg.match(/\bseed\s*[=:]?\s*(\d+)/i);
  if (seedMatch) masterSeed = parseInt(seedMatch[1]);

  // Physics sanity check
  if (mass > 15 && propDiameter <= 10 && droneType === 'bicopter') {
    ambiguities.push({
      level: 'warning', field: 'thrust_margin',
      issue: `${mass}kg mass with ${propDiameter}" props on a bicopter likely cannot hover`,
      assumed: 'Config accepted as-is — expect immediate crash',
      suggestion: 'Increase propDiameter to ≥18" or reduce mass below 8kg'
    });
  }

  // Suggested prompt
  const mods = [windEnabled&&'wind',payloadShiftEnabled&&'payload shift',
    batterySagEnabled&&'battery sag',motorOutEnabled&&'motor-out'].filter(Boolean).join(' + ') || 'no fault modules';
  const suggestedPrompt =
    `${type==='benchmark'?`Run ${numEpisodes}-episode benchmark`:(type==='autotrain'?'Train Colab Auto-RL policy':'Simulate live flight')} | ` +
    `${droneType} | mass=${mass}kg | ${propDiameter}" props | ${batteryVoltage}V | arm=${armLength}m | ` +
    `Tests: ${mods} | Mission: ${missionPreset}` +
    (enableNoise ? ' | sensor noise ON' : '') +
    (domainRandEnabled ? ' | domain rand ON' : '');

  const hasError   = ambiguities.some(a => a.level === 'error');
  const hasWarning = ambiguities.some(a => a.level === 'warning');
  const confidence = hasError ? 'low' : hasWarning ? 'medium' : 'high';

  return {
    type, config: { droneType, mass, propDiameter, batteryVoltage, armLength },
    tests: { windEnabled, payloadShiftEnabled, batterySagEnabled, motorOutEnabled, missionPreset },
    sensorCfg: { enableNoise, imuNoiseLevel: 0.5, gpsNoiseLevel: 0.5 },
    numEpisodes, masterSeed, domainRandEnabled,
    ambiguities, suggestedPrompt,
    reasoning: `Local parser — no Gemini key. Parsed from: "${msg.slice(0, 120)}"`,
    confidence,
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Parse a natural language message into a SimulationIntent.
 *  Uses the Gemini proxy (/api/gemini) when available, falls back to local parser. */
export async function parseSimulationIntent(message: string): Promise<SimulationIntent> {
  const geminiResult = await parseWithGemini(message);
  if (geminiResult) return geminiResult;
  return localParse(message);
}

/** Quick check: does this message look like a simulation command?
 *  Used in AetherInterface before spending time on full parsing. */
export function isSimulationCommand(message: string): boolean {
  const runWords  = /\b(run|simulate|fly|test|launch|execute|start|trigger|benchmark|batch|train|tweak)\b/i;
  const simTokens = /\b(sim|drone|flight|bicopter|quadcopter|hexacopter|wind|benchmark|episode|motor|payload|battery|stress[\s-]?test|long[\s-]?range|precision|high[\s-]?speed|policy|rl)\b/i;
  return runWords.test(message) && simTokens.test(message);
}

export { DEF_CONFIG, DEF_TESTS, DEF_SENSOR };

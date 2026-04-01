// test-aether.ts — Test the Aether local parser with 5 representative prompts
import { isSimulationCommand } from '../src/SimulationParser';

// We can't easily call parseSimulationIntent since it depends on geminiClient (browser fetch)
// But we CAN test isSimulationCommand and the local parser regex patterns directly

const prompts = [
  { input: 'Run a 7kg bicopter in heavy wind with motor-out', expectCmd: true },
  { input: 'Benchmark 100 episodes with domain randomization and sensor noise', expectCmd: true },
  { input: 'Simulate a light quadcopter at 14.8V with battery sag', expectCmd: true },
  { input: 'Stress test 9kg hexacopter, all fault modules, 200 episodes seed 99', expectCmd: true },
  { input: 'fly a delivery drone long range with 22V battery and wind', expectCmd: true },
  { input: 'What is a bicopter?', expectCmd: false },
  { input: 'Hello, how are you?', expectCmd: false },
];

let passed = 0;
let failed = 0;

for (const { input, expectCmd } of prompts) {
  const result = isSimulationCommand(input);
  const ok = result === expectCmd;
  if (ok) passed++; else failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'} | isSimCmd=${result} (expected ${expectCmd}) | "${input}"`);
}

console.log(`\n${passed}/${passed + failed} passed`);
if (failed > 0) process.exit(1);

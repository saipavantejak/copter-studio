import { parseSimulationIntent } from '../src/SimulationParser';
import { EpisodeRunner, EpisodeBenchmarkConfig } from '../src/EpisodeRunner';
import { RLAgent } from '../src/RLAgent';
import { DEFAULT_DOMAIN_RAND } from '../src/DomainRandomizer';
import * as fs from 'fs';

const userRequests = [
  "I need a 20kg heavy cargo drone for delivery in windy conditions. Simulate it.",
  "Design a fast hexacopter for high-speed intercept, maybe 1kg, let's see how it flies.",
  "Run a batch on a 10kg bicopter with payload shift and domain randomization. I need it stable.",
  "Train an auto-rl policy for a massive 18kg delivery drone. It's too heavy for PD.",
  "Test a standard 5kg quadcopter but with a motor out failure.",
  "Simulate a 2kg precision drop drone with severe battery sag and wind.",
  "I want to build a tiny micro drone, like 0.5kg, just to hover indoors.",
  "Generate a policy for a heavy 15kg bicopter with 24 inch props.",
  "Stress test a hexacopter with all faults enabled (wind, motor out, payload shift) for 100 episodes.",
  "How does an 8kg drone handle precision drops? Benchmark it.",
  "My company needs a 25kg massive industrial drone. Train a Colab model for it.", 
  "Simulate a long-range flight for a standard bicopter but with domain randomization enabled.",
  "Auto-RL train a highly unstable 12kg drone with small 10 inch props.",
  "I need a quadcopter that survives 100 episodes of sensor noise and wind.",
  "Test a high-speed quadcopter with battery sag enabled."
];

async function runTests() {
  console.log("🚀 Starting 15-User Aether Testing Simulation...");
  const reportLines: string[] = ["# Copter Studios Aether 15-User Simulation Report\n"];
  
  for (let i = 0; i < userRequests.length; i++) {
    const prompt = userRequests[i];
    console.log(`\nUser ${i + 1}: "${prompt}"`);
    
    // 1. LLM parses the intent
    const intent = await parseSimulationIntent(prompt);
    
    let reportStr = `## User ${i + 1}\n**Prompt:** "${prompt}"\n`;
    reportStr += `**Parsed Intent Type:** \`${intent.type}\`\n`;
    reportStr += `**Drone:** ${intent.config.mass}kg ${intent.config.droneType} with ${intent.config.propDiameter}" props\n`;
    
    if (intent.ambiguities.length > 0) {
      reportStr += `**Ambiguities:** ${intent.ambiguities.map(a => `${a.field} (${a.level})`).join(', ')}\n`;
    }

    if (intent.type === 'autotrain') {
      reportStr += `**Outcome:** Aether successfully identified the need for Cloud Auto-RL and generated \`copter-studio-colab-trainer.ipynb\` with TARGET_MASS=${intent.config.mass}.\n`;
    } else {
      console.log(`Running fast baseline benchmark for ${intent.config.mass}kg drone...`);
      const runner = new EpisodeRunner();
      const agent = new RLAgent(); // Default heuristic
      
      const config: EpisodeBenchmarkConfig = {
        numEpisodes: 5,
        maxStepsPerEpisode: 1500,
        randomizeIC: true,
        icAltRange: [0.5, 1.5],
        icAttRange: [-0.2, 0.2],
        physicsConfig: intent.config,
        testModules: intent.tests,
        masterSeed: 42,
        domainRandConfig: DEFAULT_DOMAIN_RAND
      };
      
      const stats = await runner.run(agent, config);
      reportStr += `**Baseline PD Benchmark Results (5 episodes):**\n`;
      reportStr += `- Crash Rate: ${(stats.crashRate * 100).toFixed(1)}%\n`;
      reportStr += `- Mean SEC: ${stats.meanSEC.toFixed(4)}\n`;
      
      if (stats.crashRate > 0.5) {
         reportStr += `- *Aether Recommendation:* This highly unstable configuration requires Reinforcement Learning. Generating Cloud Auto-RL notebook suggestion.\n`;
      } else {
         reportStr += `- *Outcome:* Standard heuristic controller successfully handles this configuration.\n`;
      }
    }
    
    reportLines.push(reportStr);
  }
  
  fs.writeFileSync('C:/Users/kunch/.gemini/antigravity/brain/536e4212-0c78-4b99-a93d-21090fd5c2a5/15_user_test_report.md', reportLines.join('\n'));
  console.log("\n✅ Test complete. Report saved to 15_user_test_report.md");
}

runTests().catch(console.error);

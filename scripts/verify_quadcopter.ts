import { EpisodeRunner, EpisodeBenchmarkConfig } from '../src/EpisodeRunner.ts';
import { RLAgent } from '../src/RLAgent.ts';
import { parseSimulationIntent } from '../src/SimulationParser.ts';
import * as fs from 'fs';
import * as tf from '@tensorflow/tfjs';

async function runBenchmark() {
    console.log("--- QUADCOPTER VERIFICATION BENCHMARK ---");
    
    // 1. Ambiguity Check
    const userPrompt = "load a publicily available quadcopter drone mode which has test results available alreadyl in to the app.";
    console.log(`Prompt: "${userPrompt}"`);
    const intent = await parseSimulationIntent(userPrompt);
    
    console.log("\nAether Intent Parsing:");
    console.log(`- Type: ${intent.type}`);
    console.log(`- Drone Type: ${intent.config.droneType}`);
    console.log(`- Mass: ${intent.config.mass}kg`);
    console.log(`- Confidence: ${intent.confidence}`);
    console.log("\nAmbiguities Found:");
    intent.ambiguities.forEach(a => {
        console.log(`  [${a.level}] ${a.field}: ${a.issue} (Assumed: ${a.assumed})`);
    });

    // 2. Load Demo Model (Baseline 88% Crash Rate)
    // In Node we can't use file:// with fetch, so we read manually
    const modelPath = './public/demo_model/model.json';
    const weightsPath = './public/demo_model/model.weights.bin';
    console.log(`\nReading model from: ${modelPath}`);
    
    const modelJson = JSON.parse(fs.readFileSync(modelPath, 'utf8'));
    const weightsData = fs.readFileSync(weightsPath);
    
    const model = await tf.loadLayersModel({
        load: async () => ({
            modelTopology: modelJson.modelTopology,
            weightsManifest: modelJson.weightsManifest,
            weightSpecs: modelJson.weightsManifest[0].weights,
            weightData: weightsData.buffer.slice(weightsData.byteOffset, weightsData.byteOffset + weightsData.byteLength)
        })
    } as any);
    const agent = new RLAgent();
    
    // Inject the model into RLAgent (bypass browser-only loadUserModel)
    (agent as any).userModel = model;
    (agent as any).isUsingUserModel = true;

    // 3. Execution
    const isCleanRun = process.argv.includes('--clean');
    const domainRandConfig = isCleanRun ? { 
        enabled: false, 
        propEffVariation: 0, massVariationPct: 0, imuNoiseRange: [0, 0] as [number, number], gpsNoiseRange: [0, 0] as [number, number], motorTauRange: [0.05, 0.05] as [number, number], dragRange: [0.47, 0.47] as [number, number], voltageVariation: 0, windProbability: 0, payloadProbability: 0 
    } : { 
        enabled: true, 
        propEffVariation: 0.1, 
        massVariationPct: 0.15, 
        imuNoiseRange: [0.1, 0.8] as [number, number], 
        gpsNoiseRange: [0.1, 0.6] as [number, number],
        motorTauRange: [0.03, 0.09] as [number, number],
        dragRange: [0.25, 0.75] as [number, number],
        voltageVariation: 0.05, 
        windProbability: 0.3, 
        payloadProbability: 0.2 
    };

    const cfg: EpisodeBenchmarkConfig = {
        numEpisodes:         50,
        maxStepsPerEpisode:  1000,
        randomizeIC:         true,
        icAltRange:          [0.5, 1.5],
        icAttRange:          [-0.2, 0.2],
        physicsConfig:       intent.config,
        testModules:         intent.tests,
        masterSeed:          42,
        domainRandConfig,
    };

    const runner = new EpisodeRunner();
    console.log(`\nScenario: ${isCleanRun ? 'CLEAN (No Randomization)' : 'STRESS (Full Randomization)'}`);
    if (!isCleanRun) console.log("Domain Randomization Config:", JSON.stringify(cfg.domainRandConfig, null, 2));
    
    console.log("\nRunning Benchmark (50 episodes)...");
    
    const stats = await runner.run(agent, cfg);
    
    console.log("\n--- RESULTS ---");
    console.log(`Crash Rate: ${(stats.crashRate * 100).toFixed(1)}%`);
    console.log(`Reference Baseline: ${isCleanRun ? '0.0%' : '88.0%'}`);
    console.log(`Mean Survival Time: ${stats.meanSurvivalTime.toFixed(2)}s`);
    
    const baseline = isCleanRun ? 0.0 : 0.88;
    if (Math.abs(stats.crashRate - baseline) > 0.1) {
        console.log("\nDISCREPANCY DETECTED:");
        console.log(`The current app version reports ${(stats.crashRate * 100).toFixed(1)}% which deviates significantly from the ${baseline * 100}% baseline.`);
    } else {
        console.log("\nRESULTS ALIGN WITH EXPECTED BASELINE.");
    }

    const results = {
        scenario: isCleanRun ? 'clean' : 'stress',
        crashRate: stats.crashRate,
        survivalTime: stats.meanSurvivalTime,
        intent
    };
    fs.writeFileSync(`quadcopter_results_${results.scenario}.json`, JSON.stringify(results, null, 2));
}

runBenchmark().catch(console.error);

import { EpisodeRunner, EpisodeBenchmarkConfig } from '../src/EpisodeRunner.ts';
import { RLAgent } from '../src/RLAgent.ts';
import * as fs from 'fs';

async function main() {
    const intentRaw = fs.readFileSync('cargo_intent.json', 'utf-8');
    const intent = JSON.parse(intentRaw);

    const cfg: EpisodeBenchmarkConfig = {
      numEpisodes:         50,
      maxStepsPerEpisode:  1000,
      randomizeIC:         true,
      icAltRange:          [0.5, 1.5],
      icAttRange:          [-0.2, 0.2],
      physicsConfig:       intent.config,
      testModules:         intent.tests,
      masterSeed:          42,
      domainRandConfig:    { enabled: true, propEffVariation: 0.1, massVariationPct: 0.1, imuNoiseRange: [0, 0.5], gpsNoiseRange: [0.1, 0.6], voltageVariation: 0.1, motorTauRange: [0.03, 0.09], dragRange: [0.25, 0.75], windProbability: 1.0, payloadProbability: 1.0 },
    };

    const runner = new EpisodeRunner();
    const agent = new RLAgent(); // using heuristic PD
    console.log("Running Cargo Drone Benchmark...");
    
    // We want to hook into progress, however the progress callback is not exported
    // so we can just wait for it to finish and print stats.
    
    const stats = await runner.run(agent, cfg);
    
    console.log("-----------------------------------------");
    console.log("CARGO BICOPTER BENCHMARK RESULTS:");
    console.log(`Episodes: ${stats.numEpisodes}`);
    console.log(`Crash Rate: ${(stats.crashRate * 100).toFixed(1)}%`);
    console.log(`Mean Survival Time: ${stats.meanSurvivalTime.toFixed(2)}s`);
    console.log(`Average Specific Energy Consumption (SEC): ${stats.meanSEC.toFixed(4)} J/g·km`);
    console.log(`Average Stability-Power Ratio (SPT): ${stats.meanSPT.toFixed(4)}`);
    console.log("-----------------------------------------");
    
    const metricsResult = {
        crashRate: stats.crashRate,
        meanSEC: stats.meanSEC,
        meanSPT: stats.meanSPT,
        survivalTime: stats.meanSurvivalTime,
        config: intent.config
    };
    
    fs.writeFileSync('cargo_metrics.json', JSON.stringify(metricsResult, null, 2));
}

main().catch(console.error);

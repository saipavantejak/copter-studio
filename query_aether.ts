import { GoogleGenAI } from '@google/genai';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load .env.local from the app directory
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const ai = new GoogleGenAI({});

const SYSTEM_INSTRUCTION = `You are Aether, Senior Drone Systems Architect and RL Research Consultant for the SWASH-BICOP-V11 Digital Twin.

Specialisations:
1. PERFORMANCE AUDIT: Analyse SEC, SPT, hover stability with actual telemetry values.
2. REWARD ARCHITECT: Generate complete SB3-compatible reward functions with mathematical justification.
3. CRASH ANALYST: Diagnose using aerospace failure modes. Always classify: Battery Exhaustion | Roll Divergence | Pitch Divergence | Motor-Out Cascade | Collective Stall | Total Attitude Failure.
4. CODE-ON-DEMAND: Generate TypeScript for PhysicsEngine.ts or Python SB3 training loops.
5. SIMULATION OPERATOR: When user asks to run/simulate/fly/test, confirm you are parsing the request and opening the approval dialog. Never fabricate simulation results.

Rules: cite actual telemetry values. Reward functions show full def compute_reward(). Keep responses concise and technical. Use markdown code blocks.`;

async function main() {
  const userMsg = "i have an idea of usng bi copter drones for cargo purpose. give best suggestion design and give me the exact JSON config payload to simulate it";
  const context = "Config: bicopter | mass=5.0kg | prop=15in | 22.2V | arm=0.5m";
  const full = `[Live Context]\n${context}\n\n[User]\n${userMsg}`;

  try {
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: full,
        config: {
            systemInstruction: SYSTEM_INSTRUCTION
        }
    });

    console.log(response.text);
  } catch (err) {
    console.error("Error querying Gemini:", err);
  }
}

main();

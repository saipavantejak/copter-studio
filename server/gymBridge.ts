// server/gymBridge.ts — v11
// WebSocket Gym Bridge + Gemini API proxy server.
//
// Run: npm run gym-bridge          (uses tsx — no compile step needed)
// Type-check only: npm run type-check:server
//
// CHANGES FROM v10:
//   • All physics primitives imported from src/physics/core.ts — no more
//     duplicated quaternion / BET / motor constants.
//   • GymSim now wraps PhysicsEngine directly (full fidelity, not a stripped copy).
//   • HTTP POST /api/gemini proxies Gemini requests with server-side GEMINI_API_KEY
//     so the key is never bundled into the client JS.
//
// Run: npm run gym-bridge
// Env: GEMINI_API_KEY=your_key  (server-side only, no VITE_ prefix needed)

import { createServer, IncomingMessage, ServerResponse } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { PhysicsEngine } from '../src/PhysicsEngine';
import type { PhysicsConfig, TestModules } from '../src/PhysicsEngine';

const PORT = 8765;

// ── Gemini proxy ──────────────────────────────────────────────────────────────

async function handleGeminiProxy(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.writeHead(503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'GEMINI_API_KEY not set on server' }));
    return;
  }

  // Collect request body
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const body = Buffer.concat(chunks).toString();

  let parsed: any;
  try { parsed = JSON.parse(body); } catch {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Invalid JSON body' }));
    return;
  }

  const model   = parsed.model ?? 'gemini-2.0-flash';
  const apiUrl  = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  // Forward to Gemini REST API
  try {
    const upstream = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(parsed.payload ?? parsed),
    });
    const upstreamBody = await upstream.text();
    res.writeHead(upstream.status, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    });
    res.end(upstreamBody);
  } catch (err: any) {
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: `Upstream fetch failed: ${err?.message}` }));
  }
}

// ── GymSim — thin wrapper around PhysicsEngine ───────────────────────────────

class GymSim {
  private engine: PhysicsEngine;

  constructor() {
    this.engine = new PhysicsEngine();
  }

  configure(mass?: number, propD?: number, voltage?: number): void {
    if (mass    !== undefined) this.engine.config.mass            = mass;
    if (propD   !== undefined) this.engine.config.propDiameter    = propD;
    if (voltage !== undefined) this.engine.config.batteryVoltage  = voltage;
  }

  setTests(tests: Partial<TestModules>): void {
    this.engine.tests = { ...this.engine.tests, ...tests };
  }

  reset(seed?: number): number[] {
    if (seed !== undefined) this.engine.rng.setState(seed >>> 0 || 1);
    this.engine.reset();
    // Apply small random IC around hover altitude
    const rng = seed ?? Math.random() * 1000;
    const z0  = 0.8 + Math.sin(rng) * 0.3;
    const phi0   = Math.sin(rng * 1.3) * 0.1;
    const theta0 = Math.sin(rng * 1.7) * 0.1;
    this.engine.setInitialConditions(z0, phi0, theta0);
    return this.getObs();
  }

  step(action: number[]): { obs: number[]; reward: number; done: boolean; info: object } {
    const ns = this.engine.step(action);

    // Reward: altitude hold + attitude stability
    const altErr  = Math.abs(ns.z - 1.0);
    const attErr  = Math.abs(ns.phi) + Math.abs(ns.theta);
    const velPen  = 0.1 * (ns.x_dot**2 + ns.y_dot**2 + ns.z_dot**2);
    const srvPen  = 0.01 * action.reduce((s, a) => s + Math.abs(a), 0);
    let reward = 2.0 * Math.exp(-4 * altErr**2) + 0.5 * Math.exp(-2 * attErr) - velPen - srvPen;
    if (ns.z < 1.0 && ns.z_dot < 0) reward -= 0.5 * Math.abs(ns.z_dot);

    const crashed = ns.z < 0.1 && (Math.abs(ns.phi) > 0.5 || Math.abs(ns.theta) > 0.5);
    const timeout = ns.time >= 16.0;
    if (crashed) reward -= 50;

    return {
      obs:    this.getObs(),
      reward,
      done:   crashed || timeout,
      info:   { time: ns.time, crashed, alt: ns.z, phi: ns.phi, theta: ns.theta },
    };
  }

  getObs(): number[] {
    const s = this.engine.getState();
    return [s.x, s.y, s.z, s.x_dot, s.y_dot, s.z_dot, s.phi, s.theta, s.psi, s.p, s.q, s.r];
  }
}

// ── HTTP + WebSocket server ───────────────────────────────────────────────────

const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' });
    res.end();
    return;
  }
  // Gemini proxy
  if (req.method === 'POST' && req.url === '/api/gemini') {
    await handleGeminiProxy(req, res);
    return;
  }
  // Health check
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', geminiProxy: !!process.env.GEMINI_API_KEY }));
    return;
  }
  res.writeHead(404); res.end();
});

const wss = new WebSocketServer({ server });
const sims = new Map<WebSocket, GymSim>();

wss.on('connection', (ws: WebSocket) => {
  const sim = new GymSim();
  sims.set(ws, sim);
  console.log('[GymBridge] Client connected. Total:', sims.size);

  const send = (obj: object) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
  };

  send({
    type: 'connected', obs_dim: 12, action_dim: 6,
    obs_bounds: {
      low:  [-5,-5,0,-5,-5,-5,-3.14,-3.14,-3.14,-5,-5,-5],
      high: [ 5, 5,5, 5, 5, 5, 3.14, 3.14, 3.14, 5, 5, 5],
    },
    message: 'DroneSimEnv ready. Call reset then step.',
  });

  ws.on('message', (data: Buffer) => {
    try {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'reset') {
        sim.configure(msg.mass, msg.propD, msg.voltage);
        if (msg.tests) sim.setTests(msg.tests);
        const obs = sim.reset(msg.seed);
        send({ type: 'obs', obs, info: {} });
      } else if (msg.type === 'step') {
        const result = sim.step(msg.action ?? [0,0,0,0,0,0]);
        send({ type: 'step_result', ...result });
      } else if (msg.type === 'ping') {
        send({ type: 'pong' });
      }
    } catch (e) {
      console.error('[GymBridge] Message error:', e);
    }
  });

  ws.on('close', () => { sims.delete(ws); console.log('[GymBridge] Client disconnected.'); });
});

server.listen(PORT, () => {
  const geminiStatus = process.env.GEMINI_API_KEY ? '✓ Gemini proxy active' : '✗ No GEMINI_API_KEY';
  console.log(`
╔══════════════════════════════════════════════╗
║  Copter Studio  Gym Bridge                 ║
║  ws://localhost:${PORT}  (WebSocket)             ║
║  http://localhost:${PORT}/api/gemini  (Proxy)    ║
╠══════════════════════════════════════════════╣
║  ${geminiStatus.padEnd(44)}║
╠══════════════════════════════════════════════╣
║  Python: from gym_client import DroneSimEnv  ║
║          env = DroneSimEnv()                 ║
║          obs, _ = env.reset()                ║
╚══════════════════════════════════════════════╝
`);
});

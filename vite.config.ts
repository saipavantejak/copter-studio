// vite.config.ts — v11
// Key security change: GEMINI_API_KEY (no VITE_ prefix) stays server-side only.
// A custom middleware intercepts POST /api/gemini and proxies to the Gemini REST API
// with the key injected server-side. The key never enters the client JS bundle.
//
// To use: add GEMINI_API_KEY=your_key to .env.local (NOT VITE_GEMINI_API_KEY)

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import type { Plugin, Connect } from 'vite';
import type { IncomingMessage, ServerResponse } from 'http';

// ── Simple rate limiter (per-IP, 30 requests per minute) ─────────────────────
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 30;        // max requests per window
const RATE_WINDOW_MS = 60000; // 1 minute

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  let entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + RATE_WINDOW_MS };
    rateLimitMap.set(ip, entry);
  }
  entry.count++;
  return entry.count > RATE_LIMIT;
}

// ── Gemini proxy plugin ───────────────────────────────────────────────────────
// Runs only in the Vite dev server — GEMINI_API_KEY is never sent to the browser.

function geminiProxyPlugin(): Plugin {
  return {
    name: 'gemini-proxy',
    configureServer(server) {
      server.middlewares.use(
        '/api/gemini',
        async (req: IncomingMessage, res: ServerResponse, next: Connect.NextFunction) => {
          if (req.method === 'OPTIONS') {
            res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' });
            res.end();
            return;
          }
          if (req.method !== 'POST') { next(); return; }

          // Rate limiting
          const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
            || req.socket.remoteAddress || 'unknown';
          if (isRateLimited(clientIp)) {
            res.writeHead(429, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Rate limit exceeded. Max 30 requests per minute.' }));
            return;
          }

          const apiKey = process.env.GEMINI_API_KEY;
          if (!apiKey) {
            res.writeHead(503, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'GEMINI_API_KEY not configured in .env.local' }));
            return;
          }

          // Collect body
          const chunks: Buffer[] = [];
          req.on('data', (c: Buffer) => chunks.push(c));
          req.on('end', async () => {
            try {
              const body  = Buffer.concat(chunks).toString();
              const input = JSON.parse(body);
              const model = input.model ?? 'gemini-2.5-flash';
              const url   = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

              const upstream = await fetch(url, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify(input.payload),
              });
              const text = await upstream.text();
              res.writeHead(upstream.status, {
                'Content-Type':                'application/json',
                'Access-Control-Allow-Origin': '*',
              });
              res.end(text);
            } catch (err: any) {
              res.writeHead(502, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: err?.message ?? 'proxy error' }));
            }
          });
        }
      );
    },
  };
}

export default defineConfig(({ mode }) => {
  // Load env — includes non-VITE_ vars for server-side use.
  // Must assign back to process.env; loadEnv() returns the values but does NOT
  // mutate process.env, so the geminiProxyPlugin middleware would never see
  // GEMINI_API_KEY otherwise.
  const env = loadEnv(mode, process.cwd(), '');
  Object.assign(process.env, env);

  return {
    plugins: [react(), tailwindcss(), geminiProxyPlugin()],
    resolve: {
      alias: { '@': path.resolve(__dirname, '.') },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
    },
    // No 'define' block — GEMINI_API_KEY must NOT reach the client bundle.
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            'tfjs': ['@tensorflow/tfjs'],
            'three': ['three', '@react-three/fiber', '@react-three/drei'],
            'recharts': ['recharts'],
          },
        },
      },
    },
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/test-setup.ts'],
      globals: true,
      css: false,
      deps: {
        inline: ['driver.js'],
      },
    },
  };
});

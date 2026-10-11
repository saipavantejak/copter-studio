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
import type { Plugin } from 'vite';

import {handleAnalytics} from './server/aggregateAnalytics';
import {handleGemini} from './server/geminiGateway';

function geminiProxyPlugin(): Plugin {
  return {name:'gemini-proxy',configureServer(server){
    server.middlewares.use('/api/analytics',(req,res)=>{void handleAnalytics(req,res);});
    server.middlewares.use('/api/gemini',(req,res)=>{void handleGemini(req,res);});
  }};
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
    // Only public settings may enter import.meta.env; never VITE_* API keys.
    envPrefix: ['VITE_SUPABASE_URL','VITE_SUPABASE_PUBLISHABLE_KEY','VITE_AGGREGATE_ANALYTICS_ENABLED'],
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
      coverage: {thresholds:{statements:45,branches:45,functions:38,lines:48,'src/physics/core.ts':{statements:90,branches:80,functions:90,lines:90}},provider:'v8', reporter:['text','json-summary'], reportsDirectory:'reports/quality/coverage', include:['src/**/*.{ts,tsx}','server/**/*.ts','api/**/*.ts','scripts/learning/study/**/*.ts'], exclude:['**/*.test.*','src/__tests__/**','src/test-setup.ts','src/vite-env.d.ts']},
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

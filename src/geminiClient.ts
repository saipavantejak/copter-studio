// src/geminiClient.ts — v11
// Thin Gemini client that routes ALL requests through /api/gemini (Vite dev
// middleware or gymBridge HTTP server), so GEMINI_API_KEY is NEVER bundled
// into client-side JavaScript.
//
// API surface mirrors the parts of GoogleGenAI we actually use:
//   client.chat({ model, systemInstruction, history?, temperature? })
//     .send(userMessage) → Promise<string>

export interface ChatMessage {
  role: 'user' | 'model';
  parts: Array<{ text: string }>;
}

export interface ChatOptions {
  model?:              string;
  systemInstruction?:  string;
  history?:            ChatMessage[];
  temperature?:        number;
}

export interface GeminiClient {
  chat(opts: ChatOptions): { send(message: string): Promise<string> };
  isAvailable(): Promise<boolean>;
}

// ── REST payload builder ──────────────────────────────────────────────────────

function buildPayload(opts: ChatOptions, userMessage: string): object {
  const contents: ChatMessage[] = [
    ...(opts.history ?? []),
    { role: 'user', parts: [{ text: userMessage }] },
  ];

  return {
    contents,
    ...(opts.systemInstruction ? {
      system_instruction: { parts: [{ text: opts.systemInstruction }] },
    } : {}),
    generationConfig: {
      temperature: opts.temperature ?? 0.7,
      maxOutputTokens: 2048,
    },
  };
}

// ── Proxy-based client ────────────────────────────────────────────────────────

const PROXY_URL = '/api/gemini';

async function callProxy(model: string, payload: object): Promise<string> {
  const resp = await fetch(PROXY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, payload }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Gemini proxy error ${resp.status}: ${err}`);
  }

  const data = await resp.json();

  // Parse Gemini REST response
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof text !== 'string') {
    throw new Error('Unexpected Gemini response shape: ' + JSON.stringify(data).slice(0, 200));
  }
  return text;
}

// ── Air-gap mode ──────────────────────────────────────────────────────────────
// Set window.__AIRGAP_MODE = true to disable all external API calls.
// Aether falls back to local regex parser only.
// For defense/enterprise deployments that cannot reach external APIs.

function isAirGapped(): boolean {
  if (typeof window !== 'undefined' && (window as any).__AIRGAP_MODE) return true;
  return false;
}

// ── Client factory ────────────────────────────────────────────────────────────

export function createGeminiClient(): GeminiClient {
  return {
    chat(opts: ChatOptions) {
      const model = opts.model ?? 'gemini-2.0-flash';
      return {
        async send(userMessage: string): Promise<string> {
          if (isAirGapped()) throw new Error('Air-gap mode: external API calls disabled');
          const payload = buildPayload(opts, userMessage);
          return callProxy(model, payload);
        },
      };
    },

    async isAvailable(): Promise<boolean> {
      try {
        const resp = await fetch(PROXY_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: 'gemini-2.0-flash', payload: { contents: [{ role: 'user', parts: [{ text: 'ping' }] }] } }),
        });
        // 503 = proxy up but no API key; 200/400 = key present and proxy routing
        return resp.status !== 404;
      } catch {
        return false;
      }
    },
  };
}

// Singleton — one client for the whole app lifetime
export const geminiClient = createGeminiClient();

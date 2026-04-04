// api/gemini.ts — Vercel serverless function
// Mirrors the geminiProxyPlugin from vite.config.ts for production deployment.
// Set GEMINI_API_KEY in your Vercel project environment variables.

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

export default async function handler(req: IncomingMessage & { body?: any; method?: string }, res: ServerResponse & { status: (code: number) => any; json: (data: any) => void; setHeader: (name: string, value: string) => void; send: (body: string) => void; end: () => void }) {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Rate limiting
  const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
    || req.socket.remoteAddress || 'unknown';
  if (isRateLimited(clientIp)) {
    res.setHeader('Content-Type', 'application/json');
    return res.status(429).json({ error: 'Rate limit exceeded. Max 30 requests per minute.' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ error: 'GEMINI_API_KEY not configured in Vercel environment variables' });
  }

  try {
    const { model = 'gemini-2.5-flash', payload } = req.body;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const upstream = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const text = await upstream.text();
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json');
    return res.status(upstream.status).send(text);
  } catch (err: any) {
    return res.status(502).json({ error: err?.message ?? 'proxy error' });
  }
}

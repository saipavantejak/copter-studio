# Gemini and Aether security audit

## Findings reported before repair

The browser client routes requests through the same-origin server proxy and
does not read a Gemini key. Under the documented environment configuration,
the key was already server-side. No actual key exposure was observed.

The hosted endpoint validated requests and limited requests per instance.
The earlier Vite and Gym implementations accepted arbitrary model/payload
values, read unbounded bodies and forwarded upstream errors. The Gym proxy
lacked rate limiting. Independent copies of the proxy had drifted apart.
These are security-boundary defects, not changes to physics or policy results.

## Key exposure and rotation decision

No real API key was observed in the inspected client output. The actual build
regression uses synthetic canaries, not the production secret. The reachable
local git history pattern scan reports **PASS**:
584 text blobs across 82
reachable commits, 0 Google-key-shaped findings;
11 binary blobs were excluded. See
[history-key-scan.json](../reports/security/history-key-scan.json).

No observed exposure indicates rotation is required on this evidence. This is
not proof that a real key never appeared anywhere: the signature scan cannot
certify external clones, unreachable history, binary data, deployed environment
or keys in an unknown format. No provider key validity was tested. If exposure
is independently known, revoke that key. No real key is printed by the scan.

## Physics evidence, separate from security

The separately preregistered diagnostic uses the public IDSIA
nanodrone-sysid-benchmark Crazyflie Brushless Melon flight trajectories.
[The generated comparison](../reports/physics/comparison.md) reports position,
velocity, quaternion-angle and body-rate RMSE for every flight, with descriptive
flight-bootstrap intervals. Longer-horizon errors are large; this does not
validate the simulator. The original brushed reference is different from the
logged aircraft; actuator, drag, battery, sensor and controller dynamics are
bypassed in this comparison. physicalValidation=false remains unchanged.

## Implemented boundaries

All entry points now use `server/geminiGateway.ts`: Vercel `api/gemini.ts`,
Vite's development middleware and the Gym bridge. Input schema admits text
messages, a fixed model and bounded configuration. Provider tools and code
execution are excluded; the key is sent in a server-side request header, not
a URL. Failure responses omit upstream bodies and exception details. Cross-origin
browser requests are rejected and no wildcard CORS is returned. The Gym bridge
binds only loopback; do not publish the unauthenticated training WebSocket.

| Bound | Value | Source |
|---|---:|---|
| Request bytes | 65536 | MAX_BODY_BYTES |
| Requests per identity/window | 30 | createLimiter default |
| Window milliseconds | 60000 | createLimiter default |
| Maximum in-memory limiter identities | 10000 | createLimiter default |
| Maximum generated tokens | 2048 | sanitized generationConfig |
| Upstream timeout milliseconds | 30000 | AbortSignal.timeout |

Forwarded addresses are trusted only in the managed Vercel environment;
local direct requests use the socket peer. The limiter is bounded and
**instance-local**, not a distributed/account-wide paid API quota. It uses
transient network identities for security and does not store prompt bodies.
Infrastructure and provider logging are outside this code's guarantees.
Configure distributed quotas and provider spending caps before offering a
paid public service. This audit is not a penetration-test certification.

Aether proposes bounded local plans, validates them before execution, and
requires user approval in the workspace. Invalid or unavailable cloud plans
fall back to visible local planning. Historical stored plans do not execute
automatically. The model is not permitted arbitrary shell or hardware tools.

## Client-bundle regression

Only public Supabase settings and the aggregate-analytics enable flag may
enter Vite's client environment. The build test supplies fake server and
accidentally VITE-prefixed provider keys, scans every output file and fails
if any canary is present. No real key is emitted by the checker.

Scan: **PASS**, 19 files, 0 canary leaks.
Execution source: `afd3a4784ca2b6de7bc97fd59a76bae452268c85`; relevant SHA-256 hashes are recorded
in [client-bundle.json](../reports/security/client-bundle.json).

```bash
npx vitest run src/__tests__/gemini-gateway.test.ts src/__tests__/agent-api.test.ts
python scripts/security/check-client-bundle.py
python scripts/security/render-report.py --check
npm run type-check:server
```

The checker requires committed security source and uses only synthetic keys.
CI runs it against an actual production build. Deployment remains unchanged;
these protections have been committed locally and were not pushed.

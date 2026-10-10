"""Generate security limits/results from committed gateway source and build scan."""
import argparse,json,pathlib,re
ROOT=pathlib.Path(__file__).resolve().parents[2]
parser=argparse.ArgumentParser();parser.add_argument('--check',action='store_true');args=parser.parse_args()
p=json.loads((ROOT/'reports/security/client-bundle.json').read_text());s=(ROOT/'server/geminiGateway.ts').read_text()
body=int(re.search(r'MAX_BODY_BYTES=(\d+)',s)[1]);limit,window,keys=map(int,re.search(r'createLimiter\(limit=(\d+),windowMs=(\d+),maxKeys=(\d+)',s).groups());tokens=int(re.search(r'maxOutputTokens:(\d+)',s)[1]);timeout=int(re.search(r'AbortSignal.timeout\((\d+)\)',s)[1])
value=f'''# Gemini and Aether security audit

## Findings reported before repair

The browser client routes requests through the same-origin server proxy and
does not read a Gemini key. Under the documented environment configuration,
the key was already server-side. No actual key exposure was observed.

The hosted endpoint validated requests and limited requests per instance.
The earlier Vite and Gym implementations accepted arbitrary model/payload
values, read unbounded bodies and forwarded upstream errors. The Gym proxy
lacked rate limiting. Independent copies of the proxy had drifted apart.
These are security-boundary defects, not changes to physics or policy results.

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
| Request bytes | {body} | MAX_BODY_BYTES |
| Requests per identity/window | {limit} | createLimiter default |
| Window milliseconds | {window} | createLimiter default |
| Maximum in-memory limiter identities | {keys} | createLimiter default |
| Maximum generated tokens | {tokens} | sanitized generationConfig |
| Upstream timeout milliseconds | {timeout} | AbortSignal.timeout |

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

Scan: **{p['status']}**, {p['filesScanned']} files, {len(p['leaks'])} canary leaks.
Execution source: `{p['sourceCommit']}`; relevant SHA-256 hashes are recorded
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
'''
target=ROOT/'docs/SECURITY.md'
if args.check:
 if target.read_text()!=value:raise SystemExit('Security claim drift')
 print('Security claims checked.')
else:target.write_text(value)

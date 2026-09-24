# Aether experiment agent v1

The Aether **Agent workspace** supports AI-assisted planning, validated tool execution,
sequential browser-worker benchmarks, baseline gates, comparison reports and private
Supabase history. It is a bounded experiment agent, not a general autonomous engineer.

## Workflows

- Single experiment: preserve the requested aircraft, mission, faults, seed and episodes.
- Wind comparison: the same configuration and seed with wind off/on.
- Repeatability: two identical runs, including an episode-level equality check.
- Fault isolation: clean baseline, wind only, battery sag only, motor-out only.

A cloud planner describes an allowlisted workflow. Numeric inputs remain bound to the
user request by deterministic parsing and validation. Invalid cloud output degrades
visibly to local planning. The model cannot invoke arbitrary code, URLs, SQL, deployment,
training, policy-promotion or hardware tools. This release retains a limited command
grammar and does not claim general natural-language understanding.

## Approval and execution

Creating a plan never starts a benchmark. Approval applies only to the displayed immutable
snapshot. At most 4 runs, 50 episodes per run, and 12,000 simulated seconds per plan are
allowed. Each worker has a 120-second wall timeout. Repeated clicks do not duplicate jobs.
Cancellation or closing the workspace terminates its worker. A closed/reloaded browser
cannot continue or resume a task; this is not a server-side job queue.

Wind/fault investigations stop if the baseline has any crash, incomplete mission success,
or mean altitude error >=0.10 m. Reported mission success and this stricter acceptance
gate are distinct. Only completed, matching execution evidence enters the comparison.
Outcomes describe simulation behavior, never independent physical validation.

## Persistence

Export JSON includes plan, tool activity, run IDs, seeds, configuration, simulator version,
per-episode outcomes and a deterministic report. Save/load uses `public.aether_tasks` with
owner-only RLS. Saving is explicit and requires authentication. Historical records are
read-only in the agent and cannot trigger tools. These are client-generated records, not
cryptographically attested measurements. No automatic chat-memory execution is supported.

## Known limits

- Agent runs use Heuristic PD, not an uploaded neural controller.
- Numeric gust speeds and increasing-gust sweeps are unsupported.
- No independent gust-endurance dataset or validated universal aircraft model.
- Legacy Colab export remains an external Python workflow. Its SB3 ZIP is incompatible
  with the browser TensorFlow.js loader; the UI now states this explicitly. It transfers
  only mass, propeller diameter and voltage and must not be treated as an exact digital twin.
- Gemini proxy enforces a model allowlist, text-only payloads, input/output size caps and
  timeout. Public demo rate limiting is per instance; paid scale still needs authenticated
  shared quotas. Cloud planning is limited to one request per plan; execution is local.

## Verification

`npm test -- src/__tests__/agent.test.ts src/__tests__/agent-api.test.ts`

Tests include semantic negation, gust-speed ambiguity, conflicting values, model-invented
fields, budgets, snapshot preservation, real EpisodeRunner comparisons, repeatability,
baseline failure, cancellation, mismatched evidence and API limits. Supabase ownership,
cross-user reads/writes, reassignment and anonymous denial were tested transactionally.

## Background jobs and native training (v2)

Supabase `aether-jobs` executes server-owned, checkpointed jobs. The browser may close. The private pg_cron dispatcher polls every 10 seconds (two jobs maximum per tick); execution claims have 90-second leases, compare-and-swap commits, three attempts per checkpoint and a 24-hour deadline. Cancellation invalidates the lease, so late results cannot overwrite it. Submission is authenticated, idempotent, limited to one active job/account, two submissions/account/day and 20 platform submissions/day. Only owner-readable result columns are exposed. No browser can write checkpoints, attestations or promotion timestamps. Worker requests authenticate with a private, per-job token; the function validates Supabase users separately for user actions. Gateway JWT validation is disabled only because these two authentication paths are implemented inside the function.

Cloud benchmark limits: five episodes/run, 1,000 steps/episode (16 seconds), no domain randomization; larger requests are rejected without changing them. Local benchmarks retain their earlier limits. Training supports the current complete **quadcopter** configuration, 1 m / 16 s hover, clean observations, clean and built-in wind scenarios. It uses 120 tabular Q-learning episodes (alpha .1, gamma .97, epsilon .3→.03, five collective residual actions, held for eight physics steps). Each episode's exploration seed is independent so checkpoint resumption is exact. Evaluation freezes Q values and compares 40 paired PD/candidate episodes on disjoint seeds, 20 per scenario. The gate requires no regression in success count, failure count or mean tracking error, and a positive lower paired-reward confidence bound in each scenario (Student critical value 2.093, 19 df; finite-sample/model assumptions still apply). This is one simulation training run, not universal statistical or physical validation.

Passing candidates require a separate user approval. The service recomputes the gate before returning its stored candidate; activation replaces the controller only in that user's current simulator session. The approval timestamp persists, and reactivation after reload is explicit. Native serialization preserves the policy in benchmark workers. A candidate is bound to its exact aircraft and 1 m / 16 s hover; restore PD before changing that scope. **Restore PD** stops the simulation and removes the candidate. No hardware, firmware or global production controller is changed. Failed candidates stay unpromoted. SB3/Colab ZIP conversion remains unsupported; this native Q-learning path does not claim to convert or run PPO artifacts.

Build the deployed function reproducibly:

```sh
node -e "require('esbuild').buildSync({entryPoints:['supabase/functions/aether-jobs/source.ts'],bundle:true,format:'esm',platform:'neutral',outfile:'/tmp/aether-jobs.js'})"
```

Deploy that bundle as `index.ts` to Supabase. The function uses only built-in server-side Supabase credentials; no service key belongs in Vite variables. Apply both background-job and scheduler migrations. Rollback: unschedule `aether-background-pump`, keep jobs/history for inspection, and restore PD in clients. The previous browser executor remains available.

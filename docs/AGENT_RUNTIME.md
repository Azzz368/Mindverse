# Mindverse Agent Runtime

## Current contract

Every Agent request now receives one `runId` and produces an ordered `AgentRunTrace`.
The trace spans server-side understanding and planning as well as optional client-side canvas execution.

Current phases:

`received -> routing -> clarifying -> planning/tooling -> validating -> applying -> executing -> observing -> repairing -> completed`

Conditional terminal states are `awaiting_user`, `blocked`, and `cancelled`.

Each event records a phase, event kind, timestamp, optional duration, node id, attempt number, and small scalar metadata. Media payloads, prompts, API keys, and base64 data must never be stored in trace metadata.

## Tool contract

Agent tools are declared in `shared/agent/agentTools.ts` and executed through `server/agent/toolRegistry.ts`.
Every tool definition includes:

- Stable name and description.
- JSON-style input schema.
- Risk classification.
- Approval requirement.
- One validated executor.

The Router prompt is generated from this registry-facing catalog so tool discovery and execution share the same source of truth.

## Durable checkpoints

Agent runs are persisted through `server/storage/agentRunStorage.ts`. The record contains the trace, execution mode, request summary, latest canvas checkpoint, executed node ids, repair attempt, cancellation state, and an optional worker lease.

Storage modes:

- `AGENT_RUN_STORAGE_PROVIDER=local` writes atomic JSON files below `MINDVERSE_AGENT_RUN_STORAGE_ROOT`. This is intended for local development or a single Render service with a persistent disk.
- `AGENT_RUN_STORAGE_PROVIDER=bunny` stores the same records in Bunny Storage. Use this when the Render web service and Background Worker need shared state.

Large data URIs are removed before persistence and records are bounded to 5 MB. If a sanitized record is still too large, its canvas snapshot is omitted while the trace and plan checkpoint remain available.

Runtime endpoints:

- `GET /api/ai/agent-runs/:runId` restores a run.
- `PATCH /api/ai/agent-runs/:runId` appends events/checkpoints or requests cancel/resume.
- `POST /api/ai/agent-runs/claim` leases the oldest worker-mode run.
- `PATCH /api/ai/agent-runs/:runId/lease` renews a worker lease.

Worker endpoints require `AGENT_WORKER_TOKEN`. A lease expires unless the worker sends heartbeats, allowing another worker to recover an abandoned job.

The browser executor now checkpoints after plan application, every terminal node, storyboard materialization, and repair. The latest run id is restored after a page reload and can be resumed from the Agent panel.

## Migration boundary

The current implementation intentionally keeps the existing workflow planners, deterministic CanvasPatch compilers, and node runners. These are domain components and should become graph tasks instead of being rewritten.

The next server-side state graph should use these nodes:

1. `load_context`
2. `route_intent`
3. `resolve_requirements`
4. `retrieve_skills_and_tools`
5. `plan_canvas`
6. `validate_patch`
7. `await_approval`
8. `execute_nodes`
9. `await_provider_jobs`
10. `observe_media`
11. `repair_or_finish`

The `AgentRunRecord` is the compatibility layer for moving this graph to LangGraph and a Render worker. The storage adapter is deliberately independent of LangGraph so a later checkpointer can map `runId` to graph thread id without changing the UI protocol.

Node execution remains browser-owned for now because it depends on the Zustand canvas store and client polling timers. The worker lease API is the handoff boundary; each node type must be moved behind a server activity before worker mode is enabled in the UI.

## Remaining production work

- Replace Bunny JSON with Postgres when concurrent multi-worker writes become necessary.
- Extract canvas node input/output preparation into shared server activities, then move `runAutonomousAgent` into the worker process.
- Add a Worker process that claims jobs, heartbeats leases, and writes terminal checkpoints.
- Add queue-backed provider polling and idempotent node execution.
- Add approval interrupts for costly and write tools.
- Add Skill retrieval rather than injecting every Skill into context.
- Add multimodal frame and audio verification after deterministic media checks.

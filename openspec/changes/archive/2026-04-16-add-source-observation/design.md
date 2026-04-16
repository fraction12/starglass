## Context

Starglass is intended to be a source-agnostic observation and dispatch chassis for agent systems and CLI tools. The core problem is simple: something important changes in an external system later, and a human has to notice it and manually pull the tool back into the loop.

Starglass should not turn into a connector company or a pile of first-party source packages. It should provide the runtime contract that makes watcher-style systems easy to build, test, resume, and dispatch.

The current repository already has a minimal event and dispatch surface. This design needs to lock in the right boundary: source-agnostic core, user-built adapters, stable event envelopes, reliable checkpointing, and explicit dispatch.

Constraints:
- Starglass must stop at observation, normalization, checkpointing, and dispatch.
- Starglass must not own business logic such as “fix the PR”, “post a comment”, or “notify Slack”.
- Starglass must not commit to shipping a first-party source catalog.
- The first version should be shippable with polling, not dependent on webhook infrastructure.
- The public model should make it fast for users to author their own source adapters.

Stakeholders:
- downstream CLI/tool authors using Starglass as a library
- agent runtimes that want resumable external event input
- operators who need reliable, deduped event delivery

## Goals / Non-Goals

**Goals:**
- Define a source adapter model that lets consumers observe arbitrary external systems.
- Define a normalized Starglass event envelope that downstream consumers can rely on.
- Add an observation runtime that polls sources, detects meaningful changes, and emits normalized events.
- Add checkpoint persistence so already seen updates are not re-dispatched after repeated polls or restarts.
- Add a dispatch abstraction that can hand normalized events to command-oriented consumers first.
- Make the core small and durable enough that users can build their own adapters quickly.

**Non-Goals:**
- Shipping and maintaining a first-party source catalog.
- Webhook ingestion in the first version.
- Full workflow orchestration or action policy engines.
- Owning downstream action logic such as retrying CI, mutating source systems, or choosing agent behavior.
- Multi-tenant cloud service concerns; this is a library-first local/runtime design.

## Decisions

### 1. Starglass is a source-agnostic chassis
Starglass will split into:
- **core runtime**: observation loop, normalized event model, checkpoint coordination, dispatch interface
- **source adapter contract**: the interface adapter authors implement for their own external systems
- **dispatch adapter contract**: target-specific delivery logic

The core package owns the chassis, not the source catalog.

**Why:** this is the actual product. The valuable thing is reliable watcher plumbing, not an ever-growing list of official integrations.

**Alternatives considered:**
- Bake specific sources into the package identity. Rejected because it narrows the product and invites connector sprawl.
- Build a giant plugin framework first. Rejected because it adds ceremony before the chassis is proven.

### 2. Source-specific logic belongs in adapters, not core
Source adapters own:
- target-specific configuration
- fetching current state
- detecting candidate changes
- normalizing source payloads into Starglass events

The core runtime knows only how to call an adapter, dedupe events, checkpoint progress, and dispatch envelopes.

**Why:** this keeps the core honest and reusable. It also lets users build bespoke adapters without fighting baked-in provider assumptions.

**Alternatives considered:**
- Put source polling logic directly in the runtime. Rejected because the runtime would slowly accrete provider-specific sludge.

### 3. Polling first, webhooks later if ever
The first implementation will use a polling observation loop.

A consumer registers an observation target plus a source adapter. The runtime periodically asks the adapter for candidate updates since the last checkpoint, then normalizes and dispatches them.

**Why:** polling is much easier to ship in a library-first package. It avoids webhook hosting, signature verification, callback infrastructure, and miserable local development.

**Alternatives considered:**
- Webhooks first. Rejected because it adds deployment and ingress complexity before the core contract is stable.
- Mixed polling and webhooks in V1. Rejected because it widens scope without improving the core chassis.

### 4. Use a stable normalized event envelope
All dispatched events will use a Starglass-owned envelope, not raw source payloads.

Envelope shape:
- `id`: unique event identity in Starglass
- `source`: canonical source type such as `buildkite.pipeline.run` or `linear.issue.comment`
- `subject`: canonical subject identity such as `buildkite:acme/release` or `linear:TEAM-123`
- `occurredAt`: source event time or detected time
- `payload`: normalized event-specific data
- `sourceRef`: optional reference back to provider objects for debugging

**Why:** downstream tools should not parse arbitrary provider JSON trees just to decide what happened.

**Alternatives considered:**
- Pass raw payloads through. Rejected because it leaks provider complexity everywhere.
- Over-normalize into a pretend universal ontology. Rejected because it becomes vague and strips useful source detail too early.

### 5. Meaningful change policy lives at the target/adapter boundary
Each observation target will include a filter or allowlist of meaningful event kinds. Adapters may observe many raw changes, but Starglass only emits normalized events that match the configured watch policy.

**Why:** not every consumer wants every update. This keeps signal useful and prevents dispatch noise.

**Alternatives considered:**
- Emit everything and let downstream consumers filter. Rejected because it weakens the value of the observation layer.
- Hard-code a single default list for every source. Rejected because different adapters and consumers care about different changes.

### 6. Checkpoint by observation target and provider cursor
Checkpoint state will be stored per observation target, not globally. The checkpoint record should include:
- observation target id
- source identity
- subject identity
- last successful poll time
- provider-specific cursors or high-water marks
- previously emitted event identities or an equivalent bounded dedupe set

**Why:** checkpoint isolation is required so multiple watched subjects do not step on each other.

**Alternatives considered:**
- Global last-seen timestamp. Rejected because it is too coarse.
- Stateless polling with in-memory dedupe only. Rejected because restart replay would be awful.

### 7. Start with a local file-backed checkpoint store
The first checkpoint implementation will be a local file-backed store behind a storage interface.

Suggested pieces:
- `CheckpointStore` interface
- file-backed implementation for local usage
- future room for SQLite or external stores later

**Why:** the package is library-first and local-first. A file store is simple, inspectable, and sufficient for initial adoption.

**Alternatives considered:**
- SQLite first. Reasonable, but heavier than needed for the first wedge.
- In-memory only. Rejected because restart persistence is part of the product value.

### 8. Dispatch through explicit target adapters
Dispatch will be modeled as a target adapter interface. The first targets are command-oriented and in-process handler-oriented delivery.

Possible future targets:
- command target
- in-process handler target
- webhook target
- session/agent runtime target

The runtime delivers the event and records dispatch success before advancing the checkpoint.

**Why:** explicit target adapters keep Starglass decoupled from any single execution environment.

**Alternatives considered:**
- Hard-code subprocess execution as the only dispatch mode. Rejected because it would make embedded and runtime integrations clumsy.
- Support every delivery mode immediately. Rejected because it widens scope too much.

### 9. Advance checkpoints only after successful dispatch
The observation loop will only commit checkpoint progress after a candidate event has either:
- been successfully dispatched, or
- been deterministically suppressed as already emitted

If dispatch fails, the checkpoint must not advance past the failed event.

**Why:** this preserves at-least-once delivery semantics and avoids silently dropping important updates.

**Alternatives considered:**
- Advance checkpoint before dispatch. Rejected because downstream failures would drop events.
- Retry forever inside dispatch with no surfaced failure. Rejected because it hides operational state and can wedge the runtime.

### 10. Starglass does not ship first-party source integrations
The package should stop at the chassis. Users bring their own source adapters, whether those target public SaaS APIs or private internal systems.

**Why:** the durable value is the runtime contract, not ownership of a connector catalog.

## Risks / Trade-offs

- **[Too abstract too early]** → Mitigation: keep tests and documentation grounded in concrete adapter examples without shipping those adapters as part of the package surface.
- **[Polling latency vs simplicity]** → Mitigation: accept polling as the V1 trade-off, keep intervals configurable, and add webhook support only if it proves necessary.
- **[Event identity can be messy across provider objects]** → Mitigation: prefer stable provider ids where available and fall back to deterministic hashes over normalized source fragments.
- **[Too much normalization can erase useful source detail]** → Mitigation: keep a compact normalized envelope but preserve source references for debugging and richer downstream handling.
- **[Dispatch failures can cause repeated retries]** → Mitigation: checkpoint only after successful dispatch, surface failures clearly, and keep retry policy explicit rather than hidden.
- **[Scope creep into workflow orchestration]** → Mitigation: hold the boundary hard; Starglass observes and dispatches only.

## Migration Plan

1. Introduce the core event, source adapter, checkpoint store, and dispatch target interfaces.
2. Implement the file-backed checkpoint store.
3. Prove the chassis with concrete test fixtures and documentation examples rather than shipping built-in source integrations.
4. Implement command-oriented and handler-oriented dispatch targets.
5. Add a thin public runtime API for registering observation targets and running the loop.
6. Add tests around normalization, duplicate suppression, checkpoint resume, and dispatch failure handling.
7. Ship V1 as a source-agnostic library with no built-in source integrations.

Rollback is simple at this stage because Starglass is a new package. If the first implementation shape is wrong, it can be revised without migration burden beyond local checkpoint format compatibility.

## Open Questions

- Should the public runtime expose a long-lived watcher instance, a job-style poll API, or both?
- What exact normalized payload fields are essential while still letting adapter authors keep their sources expressive?
- Should the first command dispatch target invoke subprocesses only, or also support in-process handlers from day one?
- Should Starglass eventually publish adapter authoring guides or helper utilities without crossing into first-party connector ownership?
- Should checkpoint storage include a bounded emitted-event cache in addition to a high-water mark for safer dedupe?

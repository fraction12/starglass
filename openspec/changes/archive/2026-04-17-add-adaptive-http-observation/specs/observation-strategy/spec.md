## ADDED Requirements

### Requirement: Resolve observation strategy from declared capabilities
The system SHALL resolve an observation strategy for a target from declared source and target capabilities instead of assuming a single fixed watch mode.

#### Scenario: Prefer push when the source can subscribe
- **WHEN** a target or adapter declares that push or subscription delivery is available
- **THEN** the runtime selects a push-oriented observation strategy instead of scheduling redundant fetch cycles

#### Scenario: Prefer conditional or incremental fetch before snapshot diff
- **WHEN** a source cannot push but does expose validators, cursors, or other incremental-fetch capabilities
- **THEN** the runtime selects the cheapest credible conditional or incremental strategy before falling back to normalized snapshot comparison

#### Scenario: Fall back safely when only blunt fetch is available
- **WHEN** a source exposes no push, cursor, or conditional capabilities
- **THEN** the runtime falls back to a normalized projection or snapshot-diff strategy rather than refusing to watch the target

### Requirement: Make strategy choice observable
The system SHALL expose which observation strategy is active and when the runtime changes strategy or degrades to a less efficient mode.

#### Scenario: Inspect selected observation plan
- **WHEN** a watcher starts or replans observation for a target
- **THEN** the runtime emits structured visibility about the selected strategy and the reason it was chosen

#### Scenario: Observe degradation or fallback
- **WHEN** the runtime abandons a preferred strategy because of failures, missing validators, or source limitations
- **THEN** the system emits a structured signal describing the fallback behavior

### Requirement: Bound observation cost through adaptive cadence
The system SHALL let callers bound watch cadence while allowing the runtime to adjust intervals within those bounds based on source and runtime conditions.

#### Scenario: Slow down a quiet target
- **WHEN** repeated observation cycles detect no meaningful change for a target
- **THEN** the runtime may increase the interval between checks within caller-defined bounds

#### Scenario: Speed up an active target
- **WHEN** a target is actively changing and the caller's policy allows faster freshness
- **THEN** the runtime may temporarily reduce the interval between checks within caller-defined bounds

#### Scenario: Back off under failure or rate pressure
- **WHEN** a source indicates retry pressure, rate limiting, or repeated transient failure
- **THEN** the runtime increases delay or uses degraded observation behavior without losing resumability
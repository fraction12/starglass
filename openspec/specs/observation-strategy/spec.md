# observation-strategy Specification

## Purpose
Define how Starglass chooses and adapts observation behavior. Observation strategy exists to make plan selection explicit, inspectable, and cost-aware across generic source families while keeping the runtime bounded by caller policy.
## Requirements
### Requirement: Resolve observation strategy from declared capabilities
The system SHALL resolve an observation strategy for a target from declared source and target capabilities instead of assuming a single fixed watch mode.

#### Scenario: Produce an explicit observation plan before execution
- **WHEN** the runtime prepares to observe a target
- **THEN** it resolves a concrete plan with an explicit strategy mode before execution begins

#### Scenario: Distinguish first-fetch fallback from upgraded strategy
- **WHEN** a target can only use a stronger strategy after the runtime learns resumable state such as validators or cursors
- **THEN** the initial observation plan reports the honest fallback mode first and only upgrades on later cycles once that state exists

### Requirement: Make strategy choice observable
The system SHALL expose which observation strategy is active and when the runtime changes strategy or degrades to a less efficient mode.

#### Scenario: Inspect selected observation plan
- **WHEN** a watcher starts or replans observation for a target
- **THEN** the runtime emits structured visibility about the selected plan, chosen strategy, and the reason it was chosen

#### Scenario: Observe strategy upgrade or fallback
- **WHEN** the runtime upgrades to a stronger strategy or degrades to a weaker one because of new state, failures, or source limitations
- **THEN** the system emits a structured signal describing that change in plan behavior

### Requirement: Bound observation cost through adaptive cadence
The system SHALL let callers bound watch cadence while allowing the runtime to adjust intervals within those bounds based on source and runtime conditions.

#### Scenario: Defer the next attempt from HTTP freshness hints
- **WHEN** a watched HTTP resource provides `Retry-After` or cache freshness hints such as `Cache-Control: max-age`
- **THEN** the runtime chooses the next watch delay within caller-defined bounds using those captured hints instead of immediately retrying at the blunt base interval

#### Scenario: Slow down a quiet target
- **WHEN** repeated observation cycles detect no meaningful change for a target
- **THEN** the runtime may increase the interval between checks within caller-defined bounds

#### Scenario: Speed up an active target
- **WHEN** a target is actively changing and the caller's policy allows faster freshness
- **THEN** the runtime may temporarily reduce the interval between checks within caller-defined bounds

#### Scenario: Preserve explicit failure backoff
- **WHEN** transient failures or rate pressure occur during watch execution
- **THEN** the runtime preserves bounded backoff behavior without losing resumability or ignoring stronger caller-supplied cadence limits


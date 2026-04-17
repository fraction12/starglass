## MODIFIED Requirements

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

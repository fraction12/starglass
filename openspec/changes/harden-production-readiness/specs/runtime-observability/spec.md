## ADDED Requirements

### Requirement: Expose watcher lifecycle signals
The system SHALL expose structured lifecycle signals for meaningful runtime transitions during observation and dispatch.

#### Scenario: Observe successful watcher activity
- **WHEN** a watcher loop runs successfully
- **THEN** the system emits lifecycle signals for poll execution, dispatch outcomes, and checkpoint advancement

#### Scenario: Observe failure and suppression behavior
- **WHEN** a watcher suppresses a duplicate event or encounters a poll, dispatch, or checkpoint failure
- **THEN** the system emits lifecycle signals that let callers inspect what happened without patching internal runtime code

### Requirement: Stay backend-agnostic for observability
The system SHALL expose lifecycle information without coupling the runtime to a specific logging or metrics backend.

#### Scenario: Consume lifecycle signals in caller-owned logging
- **WHEN** a caller wants runtime visibility
- **THEN** the caller can consume structured lifecycle signals through Starglass hooks or callbacks and route them into its own logging or telemetry system

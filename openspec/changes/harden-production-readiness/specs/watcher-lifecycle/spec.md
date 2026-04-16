## ADDED Requirements

### Requirement: Support long-lived watcher loops
The system SHALL provide a long-lived watcher runtime that can execute repeated observation cycles for a configured observation target.

#### Scenario: Run repeated poll cycles
- **WHEN** a consumer starts a watcher loop for an observation target
- **THEN** the system repeatedly executes observation cycles using the configured source adapter until the watcher is explicitly stopped or fails terminally

### Requirement: Support controlled shutdown and failure behavior
The system SHALL allow callers to stop a watcher loop explicitly and SHALL surface failures without silently wedging the watcher.

#### Scenario: Stop a watcher loop
- **WHEN** a caller requests watcher shutdown
- **THEN** the system stops scheduling new poll cycles and exits the watcher loop cleanly

#### Scenario: Recover from a failed cycle with bounded policy
- **WHEN** a poll or dispatch cycle fails in a recoverable way
- **THEN** the system surfaces the failure and applies the configured backoff or retry policy before the next cycle

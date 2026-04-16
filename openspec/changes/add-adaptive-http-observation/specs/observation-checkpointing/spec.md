## MODIFIED Requirements

### Requirement: Resume observation from checkpoint state
The system SHALL persist checkpoint state sufficient to resume observation efficiently without re-emitting already processed updates.

#### Scenario: Resume after restart
- **WHEN** the system restarts after previously dispatching events for an observation target
- **THEN** it resumes from stored checkpoint state and avoids replaying already dispatched updates

#### Scenario: Resume a conditional-fetch strategy
- **WHEN** a watched source depends on persisted validators, cursors, or compact fingerprints to avoid redundant work
- **THEN** the system restores that compact state after restart so observation can continue without full re-learning fetch cycles

## ADDED Requirements

### Requirement: Keep observation state compact and inspectable
The system SHALL persist only the compact state needed for efficient resumable observation by default rather than storing full raw source payloads.

#### Scenario: Persist compact strategy metadata
- **WHEN** the runtime needs to remember observation strategy state across cycles
- **THEN** it stores small resumable facts such as cursors, validators, projection fingerprints, and bounded dedupe records

#### Scenario: Avoid default raw-payload retention
- **WHEN** the runtime completes an observation cycle
- **THEN** it does not retain full raw source bodies or snapshots by default unless the consumer explicitly opts into that behavior
## ADDED Requirements

### Requirement: Persist checkpoint state safely
The system SHALL persist checkpoint state using write semantics that avoid leaving partially written checkpoint data as the authoritative state.

#### Scenario: Replace checkpoint state atomically
- **WHEN** the system commits checkpoint progress for an observation target
- **THEN** it writes the updated checkpoint state in a way that does not leave a partially written file as the live checkpoint record

### Requirement: Surface corrupted checkpoint state clearly
The system SHALL fail explicitly when checkpoint state cannot be parsed or trusted.

#### Scenario: Encounter corrupted checkpoint data
- **WHEN** a checkpoint store reads malformed or corrupted state
- **THEN** the system raises a diagnosable error rather than silently ignoring or misinterpreting that state

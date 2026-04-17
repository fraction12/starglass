# observation-checkpointing Specification

## Purpose
Define how Starglass remembers prior observation state so it can resume watching safely. Checkpointing exists to preserve compact resumable state, avoid replaying already-seen updates, and keep separate watched subjects from interfering with one another.
## Requirements
### Requirement: Suppress duplicate observation events
The system SHALL track previously emitted observation updates and MUST NOT dispatch the same logical event more than once for the same observation target.

#### Scenario: Skip duplicate event
- **WHEN** a source poll or delivery cycle encounters an update that has already been emitted for the same observation target
- **THEN** the system suppresses dispatch of the duplicate event

### Requirement: Resume observation from checkpoint state
The system SHALL persist checkpoint state sufficient to resume observation efficiently without re-emitting already processed updates.

#### Scenario: Resume after restart
- **WHEN** the system restarts after previously dispatching events for an observation target
- **THEN** it resumes from stored checkpoint state and avoids replaying already dispatched updates

#### Scenario: Resume a conditional-fetch strategy
- **WHEN** a watched source depends on persisted validators, cursors, or compact fingerprints to avoid redundant work
- **THEN** the system restores that compact state after restart so observation can continue without full re-learning fetch cycles

### Requirement: Isolate checkpoints by observation target
The system SHALL keep checkpoint state scoped to the observation target so updates from one observed subject do not interfere with another.

#### Scenario: Maintain independent checkpoints for separate observed subjects
- **WHEN** two observation targets are active concurrently
- **THEN** checkpoint state for one target does not affect event dispatch decisions for the other

### Requirement: Keep observation state compact and inspectable
The system SHALL persist only the compact state needed for efficient resumable observation by default rather than storing full raw source payloads.

#### Scenario: Persist compact strategy metadata
- **WHEN** the runtime needs to remember observation strategy state across cycles
- **THEN** it stores small resumable facts such as cursors, validators, projection fingerprints, and bounded dedupe records

#### Scenario: Avoid default raw-payload retention
- **WHEN** the runtime completes an observation cycle
- **THEN** it does not retain full raw source bodies or snapshots by default unless the consumer explicitly opts into that behavior

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


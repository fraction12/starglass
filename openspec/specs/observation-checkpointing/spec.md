# observation-checkpointing Specification

## Purpose
TBD - created by archiving change add-source-observation. Update Purpose after archive.
## Requirements
### Requirement: Suppress duplicate observation events
The system SHALL track previously emitted observation updates and MUST NOT dispatch the same logical event more than once for the same observation target.

#### Scenario: Skip duplicate event
- **WHEN** a source poll or delivery cycle encounters an update that has already been emitted for the same observation target
- **THEN** the system suppresses dispatch of the duplicate event

### Requirement: Resume observation from checkpoint state
The system SHALL persist checkpoint state sufficient to resume observation without re-emitting already processed updates.

#### Scenario: Resume after restart
- **WHEN** the system restarts after previously dispatching events for an observation target
- **THEN** it resumes from stored checkpoint state and avoids replaying already dispatched updates

### Requirement: Isolate checkpoints by observation target
The system SHALL keep checkpoint state scoped to the observation target so updates from one observed subject do not interfere with another.

#### Scenario: Maintain independent checkpoints for separate observed subjects
- **WHEN** two observation targets are active concurrently
- **THEN** checkpoint state for one target does not affect event dispatch decisions for the other


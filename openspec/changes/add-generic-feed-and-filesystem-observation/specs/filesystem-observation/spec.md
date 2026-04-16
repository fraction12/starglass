## ADDED Requirements

### Requirement: Support generic filesystem observation targets
The system SHALL support generic file and directory observation targets without turning the runtime into a workflow engine or archival store.

#### Scenario: Watch a file or directory through normalized observed state
- **WHEN** a consumer defines a filesystem target for a file or directory
- **THEN** the runtime observes normalized snapshot or projection state using shared planning, checkpoint, dedupe, and dispatch primitives

#### Scenario: Ignore raw churn that does not change the observed projection
- **WHEN** filesystem metadata or content changes do not alter the normalized observed state configured by the consumer
- **THEN** the runtime suppresses a meaningful-change event rather than treating all raw churn as important

# event-dispatch Specification

## Purpose
Define Starglass's delivery boundary. The system should dispatch normalized observation events to downstream commands or handlers without embedding provider-specific business logic or deciding what action should happen next.
## Requirements
### Requirement: Dispatch normalized observation events
The system SHALL dispatch normalized observation events to a downstream target using a stable event envelope rather than a raw source payload.

#### Scenario: Dispatch event to a downstream target
- **WHEN** a meaningful source update produces an observation event
- **THEN** the system delivers that event to the configured downstream target in the normalized Starglass envelope

#### Scenario: Preserve source context in the event envelope
- **WHEN** an event is dispatched
- **THEN** the envelope includes source identity, event identity, subject identity, occurrence time, and normalized payload data

### Requirement: Keep dispatch transport separate from action logic
The system SHALL stop at delivery and MUST NOT embed downstream business decisions or source-specific action logic in the dispatch layer.

#### Scenario: Deliver without choosing downstream action
- **WHEN** an event reaches the dispatch layer
- **THEN** the system delivers the event without deciding whether the downstream consumer should notify, retry, comment, mutate external state, or perform any other business action

### Requirement: Support command and handler boundaries
The system SHALL support downstream consumers that accept structured event input through command or handler boundaries.

#### Scenario: Deliver event to a command consumer
- **WHEN** a consumer is configured as a command-oriented target
- **THEN** the system provides the normalized event envelope in a machine-readable form that the command can process without parsing provider-specific text

#### Scenario: Deliver event to an in-process handler
- **WHEN** a consumer is configured as a handler-oriented target
- **THEN** the system invokes that handler with the normalized event envelope without adding source-specific business logic in the dispatch layer


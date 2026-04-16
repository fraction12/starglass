# source-observation Specification

## Purpose
TBD - created by archiving change add-source-observation. Update Purpose after archive.
## Requirements
### Requirement: Support user-supplied observation sources
The system SHALL allow consumers to define observation targets and supply source adapters for arbitrary external systems.

#### Scenario: Register a custom observation target
- **WHEN** a consumer defines an observation target for an external system
- **THEN** the system records enough source and subject identity to observe that target on future poll cycles

#### Scenario: Use a bespoke source adapter
- **WHEN** a consumer provides a source adapter for a system such as Linear, RSS, or an internal API
- **THEN** the runtime can poll that adapter without requiring built-in knowledge of that source

### Requirement: Keep the core runtime source-agnostic
The system SHALL provide observation primitives without committing the core runtime to any first-party source catalog.

#### Scenario: Source-specific logic stays outside the core
- **WHEN** the system observes an external source
- **THEN** source-specific fetching, interpretation, and event derivation live in the adapter rather than in the runtime core

### Requirement: Normalize source updates into Starglass events
The system SHALL let adapters convert source-specific changes into normalized Starglass observation events.

#### Scenario: Emit normalized events from a source adapter
- **WHEN** a source adapter detects a meaningful external update
- **THEN** it emits a normalized observation event that the Starglass runtime can checkpoint, dedupe, and dispatch

#### Scenario: Filter to meaningful changes
- **WHEN** a source adapter sees changes that do not match the configured watch policy
- **THEN** the system does not emit an observation event for those changes


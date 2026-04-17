# source-observation Specification

## Purpose
Define Starglass as a source-agnostic observation chassis. The runtime should let consumers watch arbitrary external systems through adapters and normalized events without baking provider-specific logic into the core.
## Requirements
### Requirement: Support user-supplied observation sources
The system SHALL allow consumers to define observation targets and supply source adapters for arbitrary external systems, including adapters that expose observation capabilities and meaningful-change boundaries.

#### Scenario: Register a custom observation target
- **WHEN** a consumer defines an observation target for an external system
- **THEN** the system records enough source and subject identity to observe that target on future observation cycles

#### Scenario: Use a bespoke source adapter
- **WHEN** a consumer provides a source adapter for a system such as Linear, RSS, or an internal API
- **THEN** the runtime can observe that adapter without requiring built-in knowledge of that source

#### Scenario: Declare source observation capabilities
- **WHEN** an adapter can expose push, cursor, conditional-request, probe, or projection-diff capabilities
- **THEN** the runtime can incorporate those declared capabilities into observation planning without embedding provider-specific logic in the core

### Requirement: Keep the core runtime source-agnostic
The system SHALL provide observation primitives without committing the core runtime to any first-party provider catalog.

#### Scenario: Source-specific logic stays outside the core
- **WHEN** the system observes an external source
- **THEN** source-specific fetching, interpretation, and event derivation live in the adapter or generic transport primitive rather than in provider-specific runtime code

#### Scenario: Generic transport families do not become provider catalogs
- **WHEN** the runtime includes reusable transport-level primitives such as generic HTTP observation
- **THEN** those primitives remain source-agnostic building blocks rather than branded provider integrations

### Requirement: Normalize source updates into Starglass events
The system SHALL let adapters convert source-specific changes into normalized Starglass observation events.

#### Scenario: Emit normalized events from a source adapter
- **WHEN** a source adapter detects a meaningful external update
- **THEN** it emits a normalized observation event that the Starglass runtime can checkpoint, dedupe, and dispatch

#### Scenario: Filter to meaningful changes
- **WHEN** a source adapter sees changes that do not match the configured watch policy
- **THEN** the system does not emit an observation event for those changes

### Requirement: Prove the adapter contract externally
The system SHALL provide enough public contract and guidance that an adapter can be authored outside the core runtime package.

#### Scenario: Build an adapter using only the public package surface
- **WHEN** a consumer follows the documented adapter contract
- **THEN** it can implement a source adapter, observation target, event normalization, and meaningful-change filtering without relying on internal Starglass code

### Requirement: Document adapter identity and cursor strategy
The system SHALL document how adapter authors should choose subject identities, stable event ids, provider cursors, and normalized payload boundaries.

#### Scenario: Follow documented adapter guidance
- **WHEN** an adapter author implements a new source
- **THEN** the documentation gives enough guidance to make consistent decisions about event identity, cursor advancement, and payload normalization


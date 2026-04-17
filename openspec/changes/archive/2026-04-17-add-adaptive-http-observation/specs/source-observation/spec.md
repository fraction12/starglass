## MODIFIED Requirements

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
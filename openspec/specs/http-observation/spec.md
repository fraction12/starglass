# http-observation Specification

## Purpose
Define Starglass's generic HTTP source family. HTTP observation should let consumers watch APIs and pages through transport-level validators, stable projections, and compact resumable state without turning Starglass into a provider connector catalog.
## Requirements
### Requirement: Support generic HTTP observation targets
The system SHALL support generic HTTP observation targets for APIs and websites without introducing provider-specific source connectors.

#### Scenario: Watch a JSON API resource
- **WHEN** a consumer defines an HTTP target for a JSON resource
- **THEN** the runtime can observe that resource using HTTP-aware strategy and state primitives rather than a bespoke provider adapter

#### Scenario: Watch an HTML resource
- **WHEN** a consumer defines an HTTP target for an HTML page
- **THEN** the runtime can observe that page using HTML-aware extraction and normalization primitives rather than a provider-specific connector

### Requirement: Use HTTP validators when the source provides them
The system SHALL reuse transport-level HTTP validators and cache metadata to avoid unnecessary full fetch work.

#### Scenario: Reuse ETag or Last-Modified
- **WHEN** a watched HTTP resource returns `ETag` or `Last-Modified` headers
- **THEN** the runtime persists those validators and uses them on later observation cycles to avoid redundant full-body processing when the resource is unchanged

#### Scenario: Respect retry and cache hints
- **WHEN** a watched HTTP resource provides cache or retry hints relevant to observation cadence
- **THEN** the runtime captures those hints as compact observation metadata that callers may use to adapt the next observation attempt within caller-defined cadence bounds

### Requirement: Compare normalized HTTP projections instead of raw noise
The system SHALL support meaningful-change detection over normalized JSON or HTML projections instead of requiring raw-body diffing.

#### Scenario: Author a stable JSON projection with helper support
- **WHEN** a consumer defines the meaningful fields of a JSON resource
- **THEN** the system provides projection and normalization helpers that make equivalent observed values hash and diff deterministically

#### Scenario: Author a minimal HTML extraction cleanly
- **WHEN** a consumer defines the meaningful observed portion of an HTML resource
- **THEN** the system provides a minimal generic extraction contract without forcing provider-specific connectors or a large selector framework

#### Scenario: Preserve the business-policy boundary
- **WHEN** a consumer configures a projection or extraction
- **THEN** the system limits that contract to observed-state definition and leaves alerting, action, and business meaning to downstream consumers


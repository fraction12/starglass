## ADDED Requirements

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

#### Scenario: Ignore irrelevant JSON fields
- **WHEN** a consumer configures a projection over a JSON resource
- **THEN** the runtime computes change over the projected fields rather than treating unrelated field churn as a meaningful update

#### Scenario: Watch selected HTML regions
- **WHEN** a consumer configures selector-based or extraction-based observation for an HTML page
- **THEN** the runtime compares normalized extracted content rather than the full HTML response body

#### Scenario: Suppress noisy layout churn
- **WHEN** a page changes in ways that do not alter the normalized observed projection
- **THEN** the runtime does not emit a meaningful-change event
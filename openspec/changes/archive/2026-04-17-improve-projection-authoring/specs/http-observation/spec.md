## MODIFIED Requirements

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

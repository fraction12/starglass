## ADDED Requirements

### Requirement: Support generic feed observation targets
The system SHALL support generic RSS and Atom observation targets without introducing provider-specific source connectors.

#### Scenario: Watch a feed for meaningful entry changes
- **WHEN** a consumer defines a generic feed target
- **THEN** the runtime can observe that feed using normalized entry-aware projection and shared runtime primitives rather than a bespoke provider adapter

#### Scenario: Suppress quiet feed cycles
- **WHEN** a feed poll returns no new or meaningfully changed observed entries
- **THEN** the runtime does not emit a meaningful-change event and preserves compact resumable state for later cycles

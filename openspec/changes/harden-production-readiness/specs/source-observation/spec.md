## ADDED Requirements

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

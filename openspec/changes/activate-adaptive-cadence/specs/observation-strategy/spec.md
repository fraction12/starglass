## MODIFIED Requirements

### Requirement: Bound observation cost through adaptive cadence
The system SHALL let callers bound watch cadence while allowing the runtime to adjust intervals within those bounds based on source and runtime conditions.

#### Scenario: Defer the next attempt from HTTP freshness hints
- **WHEN** a watched HTTP resource provides `Retry-After` or cache freshness hints such as `Cache-Control: max-age`
- **THEN** the runtime chooses the next watch delay within caller-defined bounds using those captured hints instead of immediately retrying at the blunt base interval

#### Scenario: Slow down a quiet target
- **WHEN** repeated observation cycles detect no meaningful change for a target
- **THEN** the runtime may increase the interval between checks within caller-defined bounds

#### Scenario: Speed up an active target
- **WHEN** a target is actively changing and the caller's policy allows faster freshness
- **THEN** the runtime may temporarily reduce the interval between checks within caller-defined bounds

#### Scenario: Preserve explicit failure backoff
- **WHEN** transient failures or rate pressure occur during watch execution
- **THEN** the runtime preserves bounded backoff behavior without losing resumability or ignoring stronger caller-supplied cadence limits

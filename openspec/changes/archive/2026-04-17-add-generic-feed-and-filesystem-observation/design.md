## Design

Feed and filesystem observation are the next proof that Starglass is a source-family chassis, not an HTTP-only toy and not a branded connector catalog.

The design adds two generic adapters that reuse the same runtime machinery already established elsewhere:

- explicit observation planning
- compact checkpointing
- duplicate suppression
- normalized projection diffing
- deterministic event envelopes

### Feed observation

`FeedObservationAdapter` observes RSS and Atom resources through a bounded parser and compact per-entry state.

Key decisions:

1. **Generic feed family, not provider connectors**
   - Starglass understands RSS/Atom structure, not specific feed brands.

2. **Entry-aware compact state**
   - Persist compact per-entry revision state rather than raw feed payloads.
   - Track meaningful entry revision separately from projected output so narrow consumer projections do not suppress real updates forever.

3. **Bounded parser, honest semantics**
   - Support common Atom/RSS structures and arbitrary attribute ordering without introducing a heavyweight XML framework.
   - Event identity reflects the same meaningful revision signal used for re-emit/change detection.

### Filesystem observation

`FileSystemObservationAdapter` observes files or directories through normalized snapshots.

Key decisions:

1. **Projection-oriented, not archival**
   - The adapter captures the observed state needed for diffing, not a raw archive of filesystem history.

2. **Shared runtime path**
   - Files and directories reuse the same planning, fingerprinting, and dispatch machinery as other source families.

3. **Binary honesty**
   - Directory snapshots with `includeContent: true` expose UTF-8 text when valid, otherwise base64 plus an encoding marker.

### Boundaries

- No workflow automation.
- No provider-brand connectors.
- No full XML ecosystem.
- No raw archive behavior by default.

This keeps the wedge honest: Starglass grows by reusable source families while preserving compact state and clear observation contracts.
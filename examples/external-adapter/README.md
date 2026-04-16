# External adapter example

This example is intentionally structured like code that lives outside Starglass itself.

It demonstrates how an adapter author can:
- define a source-specific observation target
- choose a stable `subject` identity
- derive deterministic event ids
- filter for meaningful changes before emission
- advance a provider cursor without leaking raw provider payloads into the core contract
- emit normalized Starglass events using only the public package surface

Files:
- `adapter.ts`: adapter implementation and target factory
- `fixture.ts`: fake provider responses used by the example and verification test

The example imports only from `starglass` when consumed through the built package tarball in verification.

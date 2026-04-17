## 1. Long-lived watcher lifecycle

- [x] 1.1 Add a long-lived watch-loop API on top of the existing one-shot `poll()` flow.
- [x] 1.2 Support configured poll intervals, explicit stop/shutdown, and bounded failure/backoff behavior.
- [x] 1.3 Add tests covering repeated polling, shutdown behavior, and failure handling inside the watch loop.

## 2. Checkpoint hardening

- [x] 2.1 Make file-backed checkpoint writes atomic.
- [x] 2.2 Surface corrupted or unreadable checkpoint state with explicit, diagnosable errors.
- [x] 2.3 Add tests covering partial-write resistance and bad checkpoint data handling.

## 3. Runtime observability

- [x] 3.1 Add structured lifecycle hooks or callbacks for poll start/completion, suppression, dispatch result, checkpoint advancement, and watch-loop failure.
- [x] 3.2 Ensure observability signals are available without coupling Starglass to a specific logging backend.
- [x] 3.3 Add tests covering emitted lifecycle signals for successful and failing runs.

## 4. Adapter authoring proof and documentation

- [x] 4.1 Expand documentation for adapter authors, including event id, cursor, subject, and normalization guidance.
- [x] 4.2 Add a concrete external-style adapter example that uses only the public Starglass package surface.
- [x] 4.3 Verify the example proves the chassis contract cleanly without introducing a built-in source integration.

## 5. Release discipline

- [x] 5.1 Add CI or equivalent automation for test, check, build, pack, and tarball import verification.
- [x] 5.2 Document the release path and production-readiness checklist for Starglass.
- [x] 5.3 Ensure packaged artifacts remain limited to intended production files as release automation evolves.

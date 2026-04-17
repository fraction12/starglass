## Design

Starglass should adapt watch timing without becoming a scheduler product.

The design keeps cadence policy inside the existing watch loop and reuses compact observation metadata already captured by the runtime. Callers still provide the hard bounds, while the runtime chooses the next delay using a bounded set of generic signals:

- recent meaningful-change activity
- quiet streaks
- transient failure streaks
- generic HTTP defer hints such as `Retry-After` and `Cache-Control: max-age`

### Key decisions

1. **Bounded, not autonomous**
   - Callers provide the base interval and optional cadence bounds.
   - Starglass may move within those bounds, but it does not invent its own scheduling policy outside caller limits.

2. **Hint-aware defer logic**
   - Captured HTTP freshness hints can push the next attempt later when the source explicitly says the data is still fresh.
   - This keeps adaptive cadence honest and cheap for quiet resources.

3. **Activity-driven acceleration and slowdown**
   - Quiet streaks can lengthen the next delay.
   - Repeated meaningful changes can shorten the next delay.
   - Explicit failure backoff still wins when failures happen.

4. **Inspectable cadence planning**
   - Cadence decisions are surfaced through runtime hooks with reasons and next-attempt timing.
   - Starglass stays logger-agnostic by emitting structured signals rather than choosing a logging backend.

### Boundaries

- No provider-specific scheduling rules.
- No cron-like orchestration layer.
- No retention of bulky cadence history beyond compact state needed for bounded recovery.

This keeps adaptive cadence as a runtime efficiency feature, not a workflow system.
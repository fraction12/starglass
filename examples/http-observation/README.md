# Generic HTTP observation example

This example shows the narrow Starglass v1.1 wedge:
- generic HTTP JSON observation
- conditional requests with `ETag` and `Last-Modified` after validators are learned
- normalized projection diffing
- compact checkpoint state with validators, next-poll hints, and fingerprints only

The consumer still decides what the observed change means.

## Sketch

```ts
import {
  FileCheckpointStore,
  HttpObservationAdapter,
  ObservationRuntime,
} from 'starglass'

const runtime = new ObservationRuntime({
  sourceAdapter: new HttpObservationAdapter(),
  checkpointStore: new FileCheckpointStore('./.starglass/http-checkpoints.json'),
  dispatchAdapters: [
    {
      supports(target) {
        return target.kind === 'handler'
      },
      async dispatch(envelope) {
        console.log('meaningful change', envelope.event.payload)
      },
    },
  ],
})

await runtime.poll({
  id: 'http:json:status',
  source: 'http',
  subject: 'http:https://status.example.com/api/summary',
  url: 'https://status.example.com/api/summary',
  format: 'json',
  project: (document) => {
    const payload = document as {
      status: { indicator: string; description: string }
      page: { updated_at: string }
    }

    return {
      indicator: payload.status.indicator,
      description: payload.status.description,
      updatedAt: payload.page.updated_at,
    }
  },
  dispatch: {
    kind: 'handler',
    handler: async (envelope) => {
      console.log('observed projection', envelope.event.payload.projection)
    },
  },
})
```

## Notes

- Starglass will reuse persisted validators on later polls after the first response teaches them.
- Starglass records generic `Retry-After` and `Cache-Control: max-age` hints as compact metadata for callers that want cadence-aware scheduling.
- It compares the projected payload, not the full raw body.
- The checkpoint file stores compact state like fingerprints and validators, not full responses.

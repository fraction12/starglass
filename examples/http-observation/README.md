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
  html,
  projectJson,
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
  project: projectJson.shape({
    indicator: projectJson.path('status', 'indicator'),
    description: projectJson.path('status', 'description'),
    updatedAt: projectJson.path('page', 'updated_at'),
  }),
  // projectJson.pick() and projectJson.path() are small helpers for common cases.
  dispatch: {
    kind: 'handler',
    handler: async (envelope) => {
      console.log('observed projection', envelope.event.payload.projection)
    },
  },
})
```

For HTML, keep the contract equally small:

```ts
await runtime.poll({
  id: 'http:html:headline',
  source: 'http',
  subject: 'http:https://status.example.com/',
  url: 'https://status.example.com/',
  format: 'html',
  extract: html.extract((document) => ({
    headline: document.match(/<h1>(.*?)<\/h1>/)?.[1] ?? null,
  })),
  dispatch: {
    kind: 'handler',
    handler: async (envelope) => {
      console.log('headline', envelope.event.payload.projection)
    },
  },
})
```

## Notes

- Starglass will reuse persisted validators on later polls after the first response teaches them.
- Starglass records generic `Retry-After` and `Cache-Control: max-age` hints as compact metadata for callers that want cadence-aware scheduling.
- It compares the projected payload, not the full raw body.
- The checkpoint file stores compact state like fingerprints and validators, not full responses.

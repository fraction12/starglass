# Generic filesystem observation example

```ts
import {
  FileCheckpointStore,
  FileSystemObservationAdapter,
  ObservationRuntime,
} from 'starglass'

const runtime = new ObservationRuntime({
  sourceAdapter: new FileSystemObservationAdapter(),
  checkpointStore: new FileCheckpointStore('./.starglass/filesystem-checkpoints.json'),
  dispatchAdapters: [
    {
      supports(target) {
        return target.kind === 'handler'
      },
      async dispatch(envelope) {
        console.log('filesystem change', envelope.event.payload.projection)
      },
    },
  ],
})

await runtime.poll({
  id: 'filesystem:file:status',
  source: 'filesystem',
  subject: 'filesystem:./status.json',
  path: './status.json',
  kind: 'file',
  read: 'json',
  project: (document) => ({
    title: document.title,
    state: document.state,
  }),
  dispatch: {
    kind: 'handler',
    handler: async (envelope) => {
      console.log('observed filesystem projection', envelope.event.payload.projection)
    },
  },
})
```

Notes:
- File targets support `read: 'text' | 'json' | 'bytes'`.
- Directory targets can set `includeContent: true`, but content is best-effort: clean UTF-8 files are returned as text and non-text files are surfaced as base64 plus `contentEncoding: 'base64'`.
- Checkpoints store only compact fingerprints, not raw file contents.

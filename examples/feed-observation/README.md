# Generic feed observation example

```ts
import {
  FeedObservationAdapter,
  FileCheckpointStore,
  ObservationRuntime,
} from 'starglass'

const runtime = new ObservationRuntime({
  sourceAdapter: new FeedObservationAdapter(),
  checkpointStore: new FileCheckpointStore('./.starglass/feed-checkpoints.json'),
  dispatchAdapters: [
    {
      supports(target) {
        return target.kind === 'handler'
      },
      async dispatch(envelope) {
        console.log('feed change', envelope.event.payload.projection)
      },
    },
  ],
})

await runtime.poll({
  id: 'feed:rss:status',
  source: 'feed',
  subject: 'feed:https://status.example.com/feed.xml',
  url: 'https://status.example.com/feed.xml',
  projectEntry: (entry) => ({
    id: entry.id,
    title: entry.title,
    link: entry.link,
    updatedAt: entry.updatedAt ?? entry.publishedAt,
  }),
  entryVersion: (entry) => entry.updatedAt ?? entry.publishedAt ?? entry.id,
  dispatch: {
    kind: 'handler',
    handler: async (envelope) => {
      console.log('observed feed entry', envelope.event.payload.entry)
    },
  },
})
```

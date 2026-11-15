---
title: React
---

# React

## Install

```bash
pnpm add @soverius-ai/browser-models @soverius-ai/browser-models-react
```

## Setup

```ts
// agent.ts
import {
  BrowserModelsAgent,
  ModelStore,
} from '@soverius-ai/browser-models/agent';
import { PromptApiEngine } from '@soverius-ai/browser-models/prompt-api';

export const agent = new BrowserModelsAgent({
  models: { nano: new PromptApiEngine() },
  defaultModel: 'nano',
});
export const models = new ModelStore(agent); // module level, not in a component
```

```tsx
// app.tsx
import { CopilotChat, CopilotKitProvider } from '@copilotkit/react-core/v2';
import { agent } from './agent';

export function App() {
  return (
    <CopilotKitProvider agents__unsafe_dev_only={{ default: agent }}>
      <CopilotChat />
    </CopilotKitProvider>
  );
}
```

`selfManagedAgents` also works but logs a CopilotKit license warning.

## Model state

```tsx
import { useModelStore } from '@soverius-ai/browser-models-react';
import { models } from './agent';

export function ModelStatus() {
  const { availability, progress } = useModelStore(models);
  if (availability === 'downloadable')
    return <button onClick={() => models.download()}>Download</button>;
  if (availability === 'downloading') return <progress value={progress ?? 0} />;
  return <span>{availability}</span>;
}
```

`useModelStore(store)` returns the [`ModelStore`](./models.md) state; actions are on the store.

## Devtools

```tsx
import { useDevtools } from '@soverius-ai/browser-models-react';

useDevtools(agent, import.meta.env.DEV); // in a component
```

See [Agent → Devtools](./agent.md#devtools).

## Model loading in the chat

```tsx
import { MODEL_ACTIVITY } from '@soverius-ai/browser-models';

<CopilotKitProvider
  agents__unsafe_dev_only={{ default: agent }}
  renderActivityMessages={[
    {
      activityType: MODEL_ACTIVITY,
      content: modelActivity, // zod schema of the content
      render: ({ content }) => <p>{content.status}</p>,
    },
  ]}
>
  <CopilotChat />
</CopilotKitProvider>;
```

Schema: [Agent → Model loading](./agent.md#model-loading). Example: `apps/react-copilotkit` (`model-activity.tsx`).

## Streaming tool calls

Both kinds of generative UI, including Open Generative UI (the model writes the page): [Generative UI](./generative-ui.md).

`render` runs for every arguments delta. `status`: `inProgress` (partial `args`) → `executing` → `complete`.

```tsx
useFrontendTool(
  {
    name: 'planTrip',
    description: 'Show a trip plan for a city',
    parameters: z.object({ city: z.string(), stops: z.array(z.string()) }),
    handler: async ({ city, stops }) =>
      `Planned ${stops.length} stops in ${city}`,
    render: ({ args, status }) => (
      <div data-status={status}>
        <h3>Trip to {args.city ?? '…'}</h3>
        <ol>
          {(args.stops ?? []).map((stop, index) => (
            <li key={index}>{stop}</li>
          ))}
        </ol>
      </div>
    ),
  },
  [],
);
```

Example: `apps/react-copilotkit` (`trip-plan.tsx`). Try: `Plan a trip to Vienna`.

Try it: [Playground](/playground?platform=react).

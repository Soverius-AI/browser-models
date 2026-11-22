---
title: React
---

# React

## Install

```bash
pnpm add @soverius-ai/browser-models @soverius-ai/browser-models-agui @soverius-ai/browser-models-react
pnpm add @soverius-ai/browser-models-tools  # for CopilotKit's frontend tools and generative UI
```

## Setup

```ts
// agent.ts
import { ModelStore } from '@soverius-ai/browser-models';
import { BrowserModelsAgent } from '@soverius-ai/browser-models-agui';
import { ToolCalling } from '@soverius-ai/browser-models-tools';
import { PromptApiEngine } from '@soverius-ai/browser-models/prompt-api';

export const agent = new BrowserModelsAgent({
  models: { nano: new PromptApiEngine() },
  defaultModel: 'nano',
  tools: new ToolCalling(), // offers the tools CopilotKit registers to the model
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

`useModelStore(store)` returns the [`ModelStore`](../engines/models.md) state; actions are on the store.

## Devtools

```tsx
import { useDevtools } from '@soverius-ai/browser-models-react';

useDevtools(agent, import.meta.env.DEV); // in a component
```

See [Devtools](../agent/devtools.md).

## Model loading in the chat

```tsx
import { MODEL_ACTIVITY } from '@soverius-ai/browser-models-agui';

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

Schema: [Events → Model loading](../agent/events.md#model-loading). Example: `apps/react-copilotkit` (`model-activity.tsx`).

## Streaming tool calls

Both kinds of generative UI, including Open Generative UI (the model writes the page): [Generative UI](../tools/generative-ui.md).

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

API: [browser-models-react](../api/browser-models-react/index.md)

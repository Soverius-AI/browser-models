---
title: Vue
---

# Vue

## Install

```bash
pnpm add @soverius-ai/browser-models @soverius-ai/browser-models-vue
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

```vue
<!-- App.vue -->
<script setup lang="ts">
import { CopilotKitProvider } from '@copilotkit/vue/v2';
import { agent } from './agent';
import ChatPage from './ChatPage.vue';

const agents = { default: agent };
</script>

<template>
  <CopilotKitProvider :agents__unsafe_dev_only="agents">
    <ChatPage />
  </CopilotKitProvider>
</template>
```

`selfManagedAgents` also works but logs a CopilotKit license warning. CopilotKit composables (`useFrontendTool`) must run inside `CopilotKitProvider`, so the chat lives in a child component.

## Model state

```vue
<!-- ChatPage.vue -->
<script setup lang="ts">
import { CopilotChat } from '@copilotkit/vue/v2';
import { useModelStore } from '@soverius-ai/browser-models-vue';
import { models } from './agent';

const state = useModelStore(models);
</script>

<template>
  <button
    v-if="state.availability === 'downloadable'"
    @click="models.download()"
  >
    Download
  </button>
  <CopilotChat v-if="state.availability === 'available'" />
</template>
```

`useModelStore(store)` returns the [`ModelStore`](./models.md) state as a read-only ref; actions are on the store.

## Devtools

```ts
import { useDevtools } from '@soverius-ai/browser-models-vue';

useDevtools(agent, import.meta.env.DEV); // in setup()
```

See [Agent → Devtools](./agent.md#devtools).

## Model loading in the chat

```vue
<!-- App.vue -->
<script setup lang="ts">
import { MODEL_ACTIVITY } from '@soverius-ai/browser-models';

const activityRenderers = [
  {
    activityType: MODEL_ACTIVITY,
    content: modelActivity, // zod schema of the content
    render: ModelActivity, // your component, gets `content`
  },
];
</script>

<template>
  <CopilotKitProvider
    :agents__unsafe_dev_only="agents"
    :render-activity-messages="activityRenderers"
  >
    <ChatPage />
  </CopilotKitProvider>
</template>
```

Schema: [Agent → Model loading](./agent.md#model-loading). Example: `apps/vue-copilotkit` (`ModelActivity.vue`).

## Streaming tool calls

Both kinds of generative UI, including Open Generative UI (the model writes the page): [Generative UI](./generative-ui.md).

The `render` component gets new props for every arguments delta. `status`: `inProgress` (partial `args`) → `executing` → `complete`.

```vue
<!-- TripPlanCard.vue -->
<script setup lang="ts">
import { ToolCallStatus } from '@copilotkit/core';

defineProps<{
  args: { city?: string; stops?: string[] };
  status: ToolCallStatus;
}>();
</script>

<template>
  <div :data-status="status">
    <h3>Trip to {{ args.city ?? '…' }}</h3>
    <ol>
      <li v-for="(stop, index) in args.stops ?? []" :key="index">{{ stop }}</li>
    </ol>
  </div>
</template>
```

```ts
useFrontendTool({
  name: 'planTrip',
  description: 'Show a trip plan for a city',
  parameters: z.object({ city: z.string(), stops: z.array(z.string()) }),
  handler: async ({ city, stops }) =>
    `Planned ${stops.length} stops in ${city}`,
  render: TripPlanCard,
});
```

Example: `apps/vue-copilotkit` (`TripPlan.vue`). Try: `Plan a trip to Vienna`.

Try it: [Playground](/playground?platform=vue).

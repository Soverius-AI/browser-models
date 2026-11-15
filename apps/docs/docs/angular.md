---
title: Angular
---

# Angular

## Install

```bash
pnpm add @soverius-ai/browser-models @soverius-ai/browser-models-angular
```

## Setup

```ts
// app.config.ts
import type { ApplicationConfig } from '@angular/core';
import { provideCopilotKit } from '@copilotkit/angular';
import { BrowserModelsAgent } from '@soverius-ai/browser-models/agent';
import { PromptApiEngine } from '@soverius-ai/browser-models/prompt-api';
import {
  provideBrowserModels,
  withAgent,
} from '@soverius-ai/browser-models-angular';

const agent = new BrowserModelsAgent({
  models: { nano: new PromptApiEngine() },
  defaultModel: 'nano',
});

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserModels(withAgent(agent)),
    provideCopilotKit({ agents: { default: agent } }),
  ],
};
```

```html
<!-- component template; import CopilotChat from @copilotkit/angular -->
<copilot-chat [agentId]="'default'" />
```

## Model state

```ts
// component
import { injectBrowserModels } from '@soverius-ai/browser-models-angular';

protected readonly browserModels = injectBrowserModels();
```

| Member                                                                                           | Kind    |
| ------------------------------------------------------------------------------------------------ | ------- |
| `agent`, `modelIds`                                                                              | fields  |
| `selectedModel()`, `availability()`, `progress()`, `error()`, `models()`, `storage()`, `ready()` | signals |
| `selectModel(id)`, `download()`, `refresh()`, `refreshModels()`, `deleteModel(id)`               | methods |

Signals over [`ModelStore`](./models.md). `ready()` is `availability() === 'available'`.

## Devtools

```ts
import { isDevMode } from '@angular/core';
import { withDevtools } from '@soverius-ai/browser-models-angular';

provideBrowserModels(
  withAgent(agent),
  ...(isDevMode() ? [withDevtools()] : []),
);
```

See [Agent → Devtools](./agent.md#devtools).

## Model loading in the chat

```ts
import { MODEL_ACTIVITY } from '@soverius-ai/browser-models';

provideCopilotKit({
  agents: { default: agent },
  renderActivityMessages: [
    {
      activityType: MODEL_ACTIVITY,
      content: modelActivity, // zod schema of the content
      component: ModelActivityView, // your component
    },
  ],
});
```

Schema: [Agent → Model loading](./agent.md#model-loading). Example: `apps/angular-copilotkit` (`model-activity.ts`).

## Streaming tool calls

Both kinds of generative UI, including Open Generative UI (the model writes the page): [Generative UI](./generative-ui.md).

`toolCall()` changes for every arguments delta. `status`: `in-progress` (partial `args`) → `executing` → `complete`.

`<copilot-chat>` of `@copilotkit/angular` 0.6 reports `executing` with `args: { _raw }` while arguments stream.
`streamingToolCall` (example: `streaming-tool-call.ts`) maps that to `in-progress` with the arguments so far.

```ts
@Component({
  selector: 'app-trip-plan',
  template: `
    @let call = streaming(toolCall());
    <div [attr.data-status]="call.status">
      <h3>Trip to {{ call.args.city ?? '…' }}</h3>
      <ol>
        @for (stop of call.args.stops ?? []; track $index) {
          <li>{{ stop }}</li>
        }
      </ol>
    </div>
  `,
})
export class TripPlan implements ToolRenderer<TripArgs> {
  readonly toolCall = input.required<AngularToolCall<TripArgs>>();
  protected readonly streaming = streamingToolCall;
}

registerFrontendTool({
  name: 'planTrip',
  description: 'Show a trip plan for a city',
  parameters: z.object({ city: z.string(), stops: z.array(z.string()) }),
  component: TripPlan,
  handler: async ({ city, stops }) =>
    `Planned ${stops.length} stops in ${city}`,
});
```

Example: `apps/angular-copilotkit` (`trip-plan.ts`). Try: `Plan a trip to Vienna`.

Try it: [Playground](/playground?platform=angular).

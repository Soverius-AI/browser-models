---
title: Angular
---

# Angular

## Install

```bash
pnpm add @soverius-ai/browser-models @soverius-ai/browser-models-agui @soverius-ai/browser-models-angular
pnpm add @soverius-ai/browser-models-tools  # for CopilotKit's frontend tools and generative UI
```

## Setup

```ts
// app.config.ts
import type { ApplicationConfig } from '@angular/core';
import { provideCopilotKit } from '@copilotkit/angular';
import { BrowserModelsAgent } from '@soverius-ai/browser-models-agui';
import { ToolCalling } from '@soverius-ai/browser-models-tools';
import { PromptApiEngine } from '@soverius-ai/browser-models/prompt-api';
import {
  provideBrowserModels,
  withAgent,
} from '@soverius-ai/browser-models-angular';

const agent = new BrowserModelsAgent({
  models: { nano: new PromptApiEngine() },
  defaultModel: 'nano',
  tools: new ToolCalling(), // offers the tools CopilotKit registers to the model
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

Signals over [`ModelStore`](../engines/models.md). `ready()` is `availability() === 'available'`.

## Devtools

```ts
import { isDevMode } from '@angular/core';
import { withDevtools } from '@soverius-ai/browser-models-angular';

provideBrowserModels(
  withAgent(agent),
  ...(isDevMode() ? [withDevtools()] : []),
);
```

See [Devtools](../agent/devtools.md).

## Model loading in the chat

```ts
import { MODEL_ACTIVITY } from '@soverius-ai/browser-models-agui';

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

Schema: [Events → Model loading](../agent/events.md#model-loading). Example: `apps/angular-copilotkit` (`model-activity.ts`).

## Streaming tool calls

Both kinds of generative UI, including Open Generative UI (the model writes the page): [Generative UI](../tools/generative-ui.md).

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

API: [browser-models-angular](../api/browser-models-angular/index.md)

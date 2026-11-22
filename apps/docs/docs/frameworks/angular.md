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
import { Component } from '@angular/core';
import { injectBrowserModels } from '@soverius-ai/browser-models-angular';

@Component({
  selector: 'app-model-status',
  template: `
    @if (browserModels.availability() === 'downloadable') {
      <button (click)="browserModels.download()">Download</button>
    }
    <span>{{ browserModels.availability() }}</span>
  `,
})
export class ModelStatus {
  protected readonly browserModels = injectBrowserModels();
}
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
import {
  provideBrowserModels,
  withAgent,
  withDevtools,
} from '@soverius-ai/browser-models-angular';

provideBrowserModels(
  withAgent(agent),
  ...(isDevMode() ? [withDevtools()] : []),
);
```

See [Devtools](../agent/devtools.md).

## Model loading in the chat

```ts
import type { AbstractAgent } from '@ag-ui/client';
import type { ActivityMessage } from '@ag-ui/core';
import { Component, input } from '@angular/core';
import { provideCopilotKit, type ActivityRenderer } from '@copilotkit/angular';
import { MODEL_ACTIVITY } from '@soverius-ai/browser-models-agui';
import * as z from 'zod';

const modelActivity = z.object({
  engineId: z.string(),
  status: z.enum(['loading', 'ready']),
  progress: z.number(),
});
type ModelActivity = z.infer<typeof modelActivity>;

@Component({
  selector: 'app-model-activity',
  template: `<p>{{ content().engineId }}: {{ content().status }}</p>`,
})
export class ModelActivityView implements ActivityRenderer<ModelActivity> {
  readonly activityType = input.required<string>();
  readonly content = input.required<ModelActivity>();
  readonly message = input.required<ActivityMessage>();
  readonly agent = input<AbstractAgent | undefined>();
}

provideCopilotKit({
  agents: { default: agent },
  renderActivityMessages: [
    {
      activityType: MODEL_ACTIVITY,
      content: modelActivity,
      component: ModelActivityView,
    },
  ],
});
```

Schema: [Events → Model loading](../agent/events.md#model-loading). Example: `apps/angular-copilotkit` (`model-activity.ts`, `app.config.ts`).

## Streaming tool calls

Both kinds of generative UI, including Open Generative UI (the model writes the page): [Generative UI](../tools/generative-ui.md).

`toolCall()` changes for every arguments delta. `status`: `in-progress` (partial `args`) → `executing` → `complete`.

`<copilot-chat>` of `@copilotkit/angular` 0.6 reports `executing` with `args: { _raw }` while arguments stream. `streamingToolCall` maps that to `in-progress` with the arguments so far. It is code of the example, not of a package: copy it.

```ts
// streaming-tool-call.ts
import {
  parseToolCallArguments,
  type AngularToolCall,
} from '@copilotkit/angular';

export function streamingToolCall<Args extends Record<string, unknown>>(
  call: AngularToolCall<Args>,
): AngularToolCall<Args> {
  const raw: unknown = (call.args as Record<string, unknown>)['_raw'];
  if (call.status !== 'executing' || typeof raw !== 'string') return call;
  return {
    ...(call.name ? { name: call.name } : {}),
    args: parseToolCallArguments(raw, true) as Partial<Args>,
    status: 'in-progress',
    result: undefined,
  };
}
```

```ts
// trip-plan.ts
import { Component, input } from '@angular/core';
import {
  registerFrontendTool,
  type AngularToolCall,
  type ToolRenderer,
} from '@copilotkit/angular';
import * as z from 'zod';
import { streamingToolCall } from './streaming-tool-call';

type TripArgs = { city: string; stops: string[] };

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

/** Call it in an injection context, for example a component constructor. */
export function registerTripPlan(): void {
  registerFrontendTool({
    name: 'planTrip',
    description: 'Show a trip plan for a city',
    parameters: z.object({ city: z.string(), stops: z.array(z.string()) }),
    component: TripPlan,
    handler: async ({ city, stops }) =>
      `Planned ${stops.length} stops in ${city}`,
  });
}
```

Example: `apps/angular-copilotkit` (`trip-plan.ts`). Try: `Plan a trip to Vienna`.

Try it: [Playground](/playground?platform=angular).

API: [browser-models-angular](../api/browser-models-angular/index.md)

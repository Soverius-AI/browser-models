import { Component, input } from '@angular/core';
import {
  registerFrontendTool,
  type AngularToolCall,
  type ToolRenderer,
} from '@copilotkit/angular';
import { z } from 'zod';
import { streamingToolCall } from './streaming-tool-call';

type TripArgs = { city: string; stops: string[] };

/** The `planTrip` card. While the status is "in-progress", `args` holds the arguments so far. */
@Component({
  selector: 'app-trip-plan',
  template: `
    @let call = streaming(toolCall());
    <div
      data-testid="trip"
      [attr.data-status]="call.status"
      class="card card-border my-2 w-80 bg-base-100 shadow-sm"
    >
      <div class="card-body p-4">
        <h3 class="card-title text-base">
          Trip to {{ call.args.city ?? '…' }}
          <span
            class="badge badge-soft badge-sm"
            [class]="
              call.status === 'complete' ? 'badge-success' : 'badge-warning'
            "
          >
            {{ call.status }}
          </span>
        </h3>
        <ol class="list-decimal pl-5 text-sm">
          @for (stop of call.args.stops ?? []; track $index) {
            <li>{{ stop }}</li>
          }
        </ol>
      </div>
    </div>
  `,
})
export class TripPlan implements ToolRenderer<TripArgs> {
  readonly toolCall = input.required<AngularToolCall<TripArgs>>();
  protected readonly streaming = streamingToolCall;
}

/** Registers the `planTrip` tool. Call it in an injection context. */
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

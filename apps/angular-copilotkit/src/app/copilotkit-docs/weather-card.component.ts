// From the CopilotKit Angular docs, "Render a tool result":
// https://docs.copilotkit.ai/angular/guides/frontend-tools-generative-ui
import { Component, input } from "@angular/core";
import {
  type AngularToolCall,
  type ToolRenderer,
} from "@copilotkit/angular";
import { streamingToolCall } from "../streaming-tool-call";

type WeatherArgs = { city: string };

@Component({
  selector: "app-weather-card",
  // Not in the docs: the classes. The docs' card is unstyled.
  template: `
    @let call = streaming(toolCall());
    @if (call.status === "complete") {
      <article class="card card-border my-2 max-w-xs bg-base-100 shadow-sm">
        <div class="card-body flex-row items-center gap-4 p-4">
          <span class="text-4xl" aria-hidden="true">☀️</span>
          <div>
            <strong class="card-title text-base">{{ call.args.city }}</strong>
            <p class="text-sm opacity-80">{{ call.result }}</p>
          </div>
        </div>
      </article>
    } @else {
      <p class="my-2 animate-pulse text-sm opacity-70">
        Loading weather for {{ call.args.city ?? "…" }}
      </p>
    }
  `,
})
export class WeatherCardComponent implements ToolRenderer<WeatherArgs> {
  readonly toolCall = input.required<AngularToolCall<WeatherArgs>>();
  // Not in the docs: see streaming-tool-call.ts. The docs use `toolCall()` directly.
  protected readonly streaming = streamingToolCall;
}

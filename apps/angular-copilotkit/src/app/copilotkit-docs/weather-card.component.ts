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
  template: `
    @let call = streaming(toolCall());
    @if (call.status === "complete") {
      <article>
        <strong>{{ call.args.city }}</strong>
        <p>{{ call.result }}</p>
      </article>
    } @else {
      <p>Loading weather for {{ call.args.city ?? "…" }}</p>
    }
  `,
})
export class WeatherCardComponent implements ToolRenderer<WeatherArgs> {
  readonly toolCall = input.required<AngularToolCall<WeatherArgs>>();
  // Not in the docs: see streaming-tool-call.ts. The docs use `toolCall()` directly.
  protected readonly streaming = streamingToolCall;
}

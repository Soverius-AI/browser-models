// From the CopilotKit Angular docs, "Let the agent display one of your components":
// https://docs.copilotkit.ai/angular/guides/frontend-tools-generative-ui
import { Component, input } from "@angular/core";
import { AngularToolCall, ToolRenderer } from "@copilotkit/angular";
import { streamingToolCall } from "../streaming-tool-call";

type IncidentArgs = { id: string; severity: string };

@Component({
  selector: "app-incident-card",
  standalone: true,
  template: `
    @let call = streaming(toolCall());
    @if (call.status === "in-progress") {
      <!-- The docs show "Loading incident…". The id so far is added to show the arguments streaming. -->
      <p>Loading incident {{ call.args.id }}…</p>
    } @else {
      <article>
        <strong>{{ call.args.id }}</strong>
        <span>{{ call.args.severity }}</span>
      </article>
    }
  `,
})
export class IncidentCardComponent implements ToolRenderer<IncidentArgs> {
  readonly toolCall = input.required<AngularToolCall<IncidentArgs>>();
  // Not in the docs: see streaming-tool-call.ts. The docs use `toolCall()` directly.
  protected readonly streaming = streamingToolCall;
}

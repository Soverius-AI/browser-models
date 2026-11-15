import {
  EventType,
  Middleware,
  type AbstractAgent,
  type BaseEvent,
  type RunAgentInput,
} from '@ag-ui/client';
import { concatMap, from, type Observable } from 'rxjs';
import { z } from 'zod';
import { closeJson } from './lib/partial-json.ts';

/** The tool CopilotKit registers when `openGenerativeUI` is set, and the activity it renders. */
const TOOL_NAME = 'generateSandboxedUi';
const ACTIVITY_TYPE = 'open-generative-ui';

/** The tool calls in a `MESSAGES_SNAPSHOT`, as far as this module reads them. */
const correctedCalls = z.object({
  messages: z.array(
    z.object({
      toolCalls: z
        .array(
          z.object({
            id: z.string(),
            function: z.object({ arguments: z.string() }),
          }),
        )
        .optional(),
    }),
  ),
});

/** What the model has written of the tool's arguments so far. */
const sandboxArguments = z
  .object({
    initialHeight: z.number(),
    css: z.string(),
    html: z.string(),
    jsFunctions: z.string(),
    jsExpressions: z.array(z.string()),
  })
  .partial();

/**
 * CopilotKit's Open Generative UI for an agent that runs in the browser.
 *
 * The model calls `generateSandboxedUi` with CSS, HTML and JavaScript. CopilotKit shows that in a
 * sandboxed iframe (JetBrains websandbox) from `open-generative-ui` activity messages. Its
 * server runtime normally writes those messages; that code needs Node, so this middleware does
 * the same job in the page: while the tool call streams, it reports what has arrived.
 *
 * ```ts
 * import { OpenGenerativeUi } from '@soverius-ai/browser-models/copilotkit';
 *
 * agent.use(new OpenGenerativeUi());
 * // and switch the feature on in CopilotKit: `openGenerativeUI: {}` on the provider
 * ```
 */
export class OpenGenerativeUi extends Middleware {
  run(input: RunAgentInput, next: AbstractAgent): Observable<BaseEvent> {
    const calls = new Map<string, SandboxCall>();
    return this.runNext(input, next).pipe(
      concatMap((event) => from(withActivity(event, calls))),
    );
  }
}

/** The event, with an activity update next to it when it belongs to a sandbox tool call. */
function withActivity(
  event: BaseEvent,
  calls: Map<string, SandboxCall>,
): BaseEvent[] {
  const { type, toolCallId, toolCallName, delta } = event as BaseEvent & {
    toolCallId?: string;
    toolCallName?: string;
    delta?: string;
  };
  if (type === EventType.MESSAGES_SNAPSHOT) {
    // The agent corrects a streamed call this way after repairing it: show the corrected page.
    const corrected = correctedCalls.safeParse(event).data?.messages ?? [];
    const updates = corrected
      .flatMap((message) => message.toolCalls ?? [])
      .flatMap((toolCall) => {
        const open = calls.get(toolCall.id);
        open?.replace(toolCall.function.arguments);
        return open ? [open.activity(false)] : [];
      });
    return [event, ...updates];
  }
  if (!toolCallId) return [event];

  if (type === EventType.TOOL_CALL_START && toolCallName === TOOL_NAME) {
    const call = new SandboxCall(toolCallId);
    calls.set(toolCallId, call);
    // The activity goes first, so the sandbox sits above the tool call in the chat.
    return [call.activity(false), event];
  }
  const call = calls.get(toolCallId);
  if (!call) return [event];
  if (type === EventType.TOOL_CALL_ARGS) {
    call.write(delta ?? '');
    return [event, call.activity(false)];
  }
  if (type === EventType.TOOL_CALL_END) {
    calls.delete(toolCallId);
    return [call.activity(true), event];
  }
  return [event];
}

/** The arguments of one `generateSandboxedUi` call while they stream in. */
class SandboxCall {
  readonly #messageId: string;
  #json = '';
  #written: Record<string, unknown> = {};
  /** The HTML in the pieces it arrived in: the renderer appends each new piece. */
  readonly #html: string[] = [];
  #htmlLength = 0;

  constructor(toolCallId: string) {
    this.#messageId = `${toolCallId}-activity`;
  }

  write(delta: string): void {
    this.#json += delta;
  }

  /** Replaces what was streamed with the complete, repaired arguments. */
  replace(json: string): void {
    this.#json = json;
    const html = sandboxArguments.safeParse(this.#read()).data?.html ?? '';
    // The pieces shown so far only stay when the repaired HTML continues them.
    if (!html.startsWith(this.#html.join(''))) {
      this.#html.length = 0;
      this.#htmlLength = 0;
    }
  }

  /** The activity message with everything that has arrived. `done`: the call is complete. */
  activity(done: boolean): BaseEvent {
    const written = this.#read();
    const args = sandboxArguments.safeParse(written).data ?? {};
    // The model writes the parameters in order: all but the last one are finished.
    const keys = Object.keys(written);
    const finished = (key: string) =>
      keys.includes(key) && (done || key !== keys.at(-1));

    const html = args.html ?? '';
    if (html.length > this.#htmlLength) {
      this.#html.push(html.slice(this.#htmlLength));
      this.#htmlLength = html.length;
    }
    const expressions = args.jsExpressions ?? [];

    return {
      type: EventType.ACTIVITY_SNAPSHOT,
      messageId: this.#messageId,
      activityType: ACTIVITY_TYPE,
      content: {
        initialHeight: args.initialHeight,
        generating: !done,
        ...(finished('css') && { css: args.css, cssComplete: true }),
        ...(this.#html.length > 0 && { html: [...this.#html] }),
        ...(finished('html') && { htmlComplete: true }),
        ...(finished('jsFunctions') && {
          jsFunctions: args.jsFunctions,
          jsFunctionsComplete: true,
        }),
        // An expression runs once it is complete: the last one may still be growing.
        ...(keys.includes('jsExpressions') && {
          jsExpressions: finished('jsExpressions')
            ? expressions
            : expressions.slice(0, -1),
        }),
        ...(finished('jsExpressions') && { jsExpressionsComplete: true }),
      },
    } as BaseEvent;
  }

  /**
   * The arguments object so far. The JSON is cut off mid-way while the call streams; when a cut
   * cannot be read, the last readable state stays.
   */
  #read(): Record<string, unknown> {
    try {
      this.#written = z
        .record(z.string(), z.unknown())
        .parse(JSON.parse(closeJson(this.#json).json || '{}'));
    } catch {
      // Keep what was readable before.
    }
    return this.#written;
  }
}

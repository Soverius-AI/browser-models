/**
 * `@soverius-ai/browser-models-tools/copilotkit`: CopilotKit's Open Generative UI for an agent in the page.
 *
 * @module copilotkit
 */
import {
  EventType,
  Middleware,
  type AbstractAgent,
  type BaseEvent,
  type RunAgentInput,
} from '@ag-ui/client';
import { concatMap, from } from 'rxjs';
import { asArray, asObject, asString } from './lib/json.ts';
import { closeJson } from './lib/partial-json.ts';

/** The tool CopilotKit registers when `openGenerativeUI` is set, and the activity it renders. */
const TOOL_NAME = 'generateSandboxedUi';
const ACTIVITY_TYPE = 'open-generative-ui';
/** How much more HTML is worth an update while the call streams. */
const HTML_STEP = 400;

/** The tool calls in a `MESSAGES_SNAPSHOT`, as far as this module reads them. */
function correctedCalls(
  event: unknown,
): { readonly id: string; readonly arguments: string }[] {
  return (asArray(asObject(event)?.['messages']) ?? [])
    .flatMap((message) => asArray(asObject(message)?.['toolCalls']) ?? [])
    .flatMap((toolCall) => {
      const call = asObject(toolCall);
      const id = asString(call?.['id']);
      const args = asString(asObject(call?.['function'])?.['arguments']);
      return id !== undefined && args !== undefined
        ? [{ id, arguments: args }]
        : [];
    });
}

/** What the model has written of the tool's arguments so far. A wrong type counts as not written. */
function sandboxArguments(written: Record<string, unknown>) {
  const { initialHeight } = written;
  const expressions = asArray(written['jsExpressions']);
  return {
    initialHeight:
      typeof initialHeight === 'number' ? initialHeight : undefined,
    css: asString(written['css']),
    html: asString(written['html']),
    jsFunctions: asString(written['jsFunctions']),
    jsExpressions: expressions?.every((item) => typeof item === 'string')
      ? expressions
      : undefined,
  };
}

/**
 * CopilotKit's Open Generative UI for an agent that runs in the browser.
 *
 * The model calls `generateSandboxedUi` with CSS, HTML and JavaScript. CopilotKit shows that in a
 * sandboxed iframe (JetBrains websandbox) from `open-generative-ui` activity messages. Its
 * server runtime normally writes those messages; that code needs Node, so this middleware does
 * the same job in the page: while the tool call streams, it reports what has arrived.
 *
 * ```ts
 * import { OpenGenerativeUi } from '@soverius-ai/browser-models-tools/copilotkit';
 *
 * agent.use(new OpenGenerativeUi());
 * // and switch the feature on in CopilotKit: `openGenerativeUI: {}` on the provider
 * ```
 */
export class OpenGenerativeUi extends Middleware {
  /** Passes the agent's events on and adds the `open-generative-ui` activity messages. */
  // Typed through the base class: the declarations name no rxjs of their own.
  run(
    input: RunAgentInput,
    next: AbstractAgent,
  ): ReturnType<Middleware['run']> {
    const calls = new SandboxCalls();
    return this.runNext(input, next).pipe(
      concatMap((event) => from(calls.handle(event))),
    );
  }
}

/** The sandbox tool calls of one run, and the activity updates for them. */
class SandboxCalls {
  readonly #calls = new Map<string, SandboxCall>();
  /** The calls in the snapshot the agent just sent; undefined after any other event. */
  #snapshotCalls: ReadonlySet<string> | undefined;

  /** The event, with an activity update next to it when it belongs to a sandbox tool call. */
  handle(event: BaseEvent): BaseEvent[] {
    const snapshotCalls = this.#snapshotCalls;
    this.#snapshotCalls = undefined;
    const { type, toolCallId, toolCallName, delta } = event as BaseEvent & {
      toolCallId?: string;
      toolCallName?: string;
      delta?: string;
    };
    if (type === EventType.MESSAGES_SNAPSHOT) {
      const corrected = correctedCalls(event);
      this.#snapshotCalls = new Set(corrected.map(({ id }) => id));
      // The agent corrects a streamed call this way after repairing it: show the corrected page.
      const updates = corrected.flatMap(({ id, arguments: json }) => {
        const open = this.#calls.get(id);
        open?.replace(json);
        return open ? [open.activity('generating')] : [];
      });
      return [event, ...updates];
    }
    if (!toolCallId) return [event];

    if (type === EventType.TOOL_CALL_START && toolCallName === TOOL_NAME) {
      const call = new SandboxCall(toolCallId);
      this.#calls.set(toolCallId, call);
      // The activity goes first, so the sandbox sits above the tool call in the chat.
      return [call.activity('generating'), event];
    }
    const call = this.#calls.get(toolCallId);
    if (!call) return [event];
    if (type === EventType.TOOL_CALL_ARGS) {
      call.write(delta ?? '');
      const update = call.progress();
      return update ? [event, update] : [event];
    }
    if (type === EventType.TOOL_CALL_END) {
      this.#calls.delete(toolCallId);
      // The agent takes a call back (cut off, or not repairable) with a snapshot without it,
      // then ends it. Its script is incomplete: it must not run.
      const withdrawn =
        snapshotCalls !== undefined && !snapshotCalls.has(toolCallId);
      return [call.activity(withdrawn ? 'withdrawn' : 'done'), event];
    }
    return [event];
  }
}

/** The arguments of one `generateSandboxedUi` call while they stream in. */
class SandboxCall {
  readonly #messageId: string;
  #json = '';
  #written: Record<string, unknown> = {};
  /** The HTML in the pieces it arrived in: the renderer appends each new piece. */
  readonly #html: string[] = [];
  #htmlLength = 0;
  /** What the last update showed, to send the next one only when something visible changed. */
  #shown = { keys: 0, html: 0, expressions: 0 };

  constructor(toolCallId: string) {
    this.#messageId = `${toolCallId}-activity`;
  }

  write(delta: string): void {
    this.#json += delta;
  }

  /**
   * An update while the call streams, or undefined when nothing visible changed: a parameter
   * started or finished, an expression completed, or {@link HTML_STEP} more characters of HTML.
   * Every update carries the whole page so far, and the client checks and stores each one, so
   * one per token would grow with the square of the page.
   */
  progress(): BaseEvent | undefined {
    const written = this.#read();
    const args = sandboxArguments(written);
    const now = {
      keys: Object.keys(written).length,
      html: args.html?.length ?? 0,
      expressions: args.jsExpressions?.length ?? 0,
    };
    const shown = this.#shown;
    if (
      now.keys === shown.keys &&
      now.expressions === shown.expressions &&
      now.html - shown.html < HTML_STEP
    )
      return undefined;
    this.#shown = now;
    return this.activity('generating');
  }

  /** Replaces what was streamed with the complete, repaired arguments. */
  replace(json: string): void {
    this.#json = json;
    const html = sandboxArguments(this.#read()).html ?? '';
    // The pieces shown so far only stay when the repaired HTML continues them.
    if (!html.startsWith(this.#html.join(''))) {
      this.#html.length = 0;
      this.#htmlLength = 0;
    }
  }

  /**
   * The activity message with everything that has arrived. `done`: the call is complete.
   * `withdrawn`: the agent took the call back; the page stays as far as it got, its script
   * does not run.
   */
  activity(state: 'generating' | 'done' | 'withdrawn'): BaseEvent {
    const done = state !== 'generating';
    const scripts = state !== 'withdrawn';
    const written = this.#read();
    const args = sandboxArguments(written);
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
        ...(scripts &&
          finished('jsFunctions') && {
            jsFunctions: args.jsFunctions,
            jsFunctionsComplete: true,
          }),
        // An expression runs once it is complete: the last one may still be growing.
        ...(scripts &&
          keys.includes('jsExpressions') && {
            jsExpressions: finished('jsExpressions')
              ? expressions
              : expressions.slice(0, -1),
          }),
        ...(scripts &&
          finished('jsExpressions') && { jsExpressionsComplete: true }),
      },
    } as BaseEvent;
  }

  /**
   * The arguments object so far. The JSON is cut off mid-way while the call streams; when a cut
   * cannot be read, the last readable state stays.
   */
  #read(): Record<string, unknown> {
    try {
      const written = asObject(JSON.parse(closeJson(this.#json).json || '{}'));
      if (written) this.#written = written;
    } catch {
      // Keep what was readable before.
    }
    return this.#written;
  }
}

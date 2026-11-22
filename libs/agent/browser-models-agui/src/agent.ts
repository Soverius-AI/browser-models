import {
  AbstractAgent,
  type BaseEvent,
  type RunAgentInput,
} from '@ag-ui/client';
import { EventType, type Event as AgUiEvent } from '@ag-ui/core';
import { Models, type Engine } from '@soverius-ai/browser-models';
import { Observable } from 'rxjs';
import type { Compaction } from './lib/compaction.ts';
import { AgentRun } from './lib/run.ts';
import { SummaryCompaction } from './lib/summary-compaction.ts';
import type { Tools } from './lib/tools.ts';

/** Options of `BrowserModelsAgent`. */
export interface BrowserModelsAgentOptions<
  Engines extends Readonly<Record<string, Engine>>,
> {
  /** The models this agent may use, by id. Selection is always explicit. */
  readonly models: Engines;
  /** Model used when a run does not pick one. Must be one of the `models` keys. */
  readonly defaultModel: keyof Engines & string;
  readonly agentId?: string;
  readonly description?: string;
  /**
   * Tool calling: `new ToolCalling({ localTools })` of `@soverius-ai/browser-models-tools`.
   * Without it the agent only chats and the client's tools are not offered to the model.
   */
  readonly tools?: Tools;
  /**
   * Keeps long conversations within the model's context. Default `new SummaryCompaction()`:
   * older turns become a summary, old tool results are cut, for engines that report a
   * `contextWindowSize`. Pass your own `Compaction` for another algorithm, or `false` for none.
   */
  readonly compaction?: Compaction | false;
}

/**
 * An AG-UI agent backed by a model running in the browser. Works with any AG-UI
 * client, for example CopilotKit: `provideCopilotKit({ agents: { default: agent } })`.
 * Model ids are checked by TypeScript.
 *
 * A run can pick a model with `forwardedProps: { soverius: { model: 'id' } }`.
 * An unknown id fails the run; there is no automatic fallback.
 */
export class BrowserModelsAgent<
  Engines extends Readonly<Record<string, Engine>> = Readonly<
    Record<string, Engine>
  >,
> extends AbstractAgent {
  // TypeScript-private fields, not #private: AbstractAgent.clone() copies via Object.create.
  private options: BrowserModelsAgentOptions<Engines>;
  // Shared with clones, so selectModel() also reaches the copies a client like CopilotKit makes.
  private models: Models<Engines>;
  // Shared with clones: a compaction keeps what it made for a thread, for example a summary.
  private compaction: Compaction | undefined;
  // The current run's controller, for abortRun(). Each clone gets its own on its first run.
  private abortController: AbortController | undefined;

  constructor(options: BrowserModelsAgentOptions<Engines>) {
    super({
      ...(options.agentId ? { agentId: options.agentId } : {}),
      description:
        options.description ?? 'An agent running on a model in the browser',
    });
    this.options = options;
    this.models = new Models(options.models, options.defaultModel);
    this.compaction =
      options.compaction === false
        ? undefined
        : (options.compaction ?? new SummaryCompaction());
  }

  /** The model runs use unless a run picks one. Starts as `defaultModel`. */
  get selectedModel(): keyof Engines & string {
    return this.models.selectedModel;
  }

  /** Switches the model for the next runs. Only registered ids are accepted. */
  selectModel(modelId: keyof Engines & string): void {
    this.models.selectModel(modelId);
  }

  /** The ids of the registered models. */
  get modelIds(): readonly (keyof Engines & string)[] {
    return this.models.modelIds;
  }

  /** The engine for a model id (default: the selected model), for availability or downloads. */
  engine<Id extends keyof Engines & string>(
    modelId: Id = this.models.selectedModel as Id,
  ): Engines[Id] {
    return this.models.engine(modelId);
  }

  /** A copy for a client like CopilotKit. It shares models, selection, tools and compaction. */
  override clone(): BrowserModelsAgent<Engines> {
    const copy = super.clone() as BrowserModelsAgent<Engines>;
    copy.options = this.options;
    copy.models = this.models;
    copy.compaction = this.compaction;
    return copy;
  }

  /** Stops the running model and tools, like `HttpAgent.abortRun()`. Clients call it on "stop". */
  override abortRun(): void {
    this.abortController?.abort();
    super.abortRun();
  }

  /** Sends every event of this agent to the soverius debugger. Returns a function that stops it. */
  connectDevtools(target: Window | undefined = globalThis.window): () => void {
    // No window on the server (SSR): nothing to connect to.
    if (!target) return () => undefined;
    const { unsubscribe } = this.subscribe({
      onEvent: ({ event }) => {
        const message: DevtoolsMessage = {
          source: 'soverius-ai/devtools',
          agentId: this.agentId ?? 'default',
          event,
        };
        // '/' means "same origin as this page" and also works for opaque origins like file://.
        target.postMessage(message, '/');
      },
    });
    return unsubscribe;
  }

  /** Runs the agent on the selected model, or the one `forwardedProps.soverius.model` picks. */
  override run(input: RunAgentInput): Observable<BaseEvent> {
    return new Observable<BaseEvent>((subscriber) => {
      const abort = new AbortController();
      this.abortController = abort;
      const modelId = modelFromInput(input) ?? this.models.selectedModel;

      const stream = this.models.has(modelId)
        ? new AgentRun({
            engine: this.models.engine(modelId),
            input,
            signal: abort.signal,
            ...(this.options.tools ? { tools: this.options.tools } : {}),
            ...(this.compaction ? { compaction: this.compaction } : {}),
          }).events()
        : unknownModel(input, modelId);

      (async () => {
        for await (const event of stream) subscriber.next(event);
        subscriber.complete();
      })().catch((error: unknown) => subscriber.error(error));

      return () => abort.abort();
    });
  }
}

/** Message format the soverius debugger listens for on `window`. */
export interface DevtoolsMessage {
  readonly source: 'soverius-ai/devtools';
  readonly agentId: string;
  readonly event: BaseEvent;
}

/** The model a run picked with `forwardedProps: { soverius: { model } }`, if any. */
function modelFromInput(input: RunAgentInput): string | undefined {
  // forwardedProps is whatever the client sent.
  const props: unknown = input.forwardedProps;
  const soverius: unknown = isRecord(props) ? props['soverius'] : undefined;
  const model: unknown = isRecord(soverius) ? soverius['model'] : undefined;
  return typeof model === 'string' ? model : undefined;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null;
}

async function* unknownModel(
  input: RunAgentInput,
  modelId: string,
): AsyncGenerator<AgUiEvent> {
  yield {
    type: EventType.RUN_STARTED,
    threadId: input.threadId,
    runId: input.runId,
  };
  yield { type: EventType.RUN_ERROR, message: `Unknown model "${modelId}".` };
}

import {
  AbstractAgent,
  type BaseEvent,
  type RunAgentInput,
} from '@ag-ui/client';
import { EventType, type Event as AgUiEvent } from '@ag-ui/core';
import { Observable } from 'rxjs';
import type { Compaction } from './lib/compaction.ts';
import type { Engine } from './lib/engine.ts';
import { asObject, asString } from './lib/json.ts';
import type { RepairOptions } from './lib/repair.ts';
import { AgentRun } from './lib/run.ts';
import { SummaryCompaction } from './lib/summary-compaction.ts';
import type { LocalTool, LocalToolSource } from './lib/tools.ts';

export interface BrowserModelsAgentOptions<
  Models extends Readonly<Record<string, Engine>>,
> {
  /** The models this agent may use, by id. Selection is always explicit. */
  readonly models: Models;
  /** Model used when a run does not pick one. Must be one of the `models` keys. */
  readonly defaultModel: keyof Models & string;
  readonly agentId?: string;
  readonly description?: string;
  /** Tools that run in the agent: tools, or sources like `new WebMcpTools()` read on every run. */
  readonly localTools?: readonly (LocalTool | LocalToolSource)[];
  readonly maxSteps?: number;
  readonly repairHook?: RepairOptions['hook'];
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
  Models extends Readonly<Record<string, Engine>> = Readonly<
    Record<string, Engine>
  >,
> extends AbstractAgent {
  // TypeScript-private fields, not #private: AbstractAgent.clone() copies via Object.create.
  private options: BrowserModelsAgentOptions<Models>;
  // Shared with clones, so selectModel() also reaches the copies a client like CopilotKit makes.
  private selection: { current: keyof Models & string };
  // Shared with clones: a compaction keeps what it made for a thread, for example a summary.
  private compaction: Compaction | undefined;
  // The current run's controller, for abortRun(). Each clone gets its own on its first run.
  private abortController: AbortController | undefined;

  constructor(options: BrowserModelsAgentOptions<Models>) {
    super({
      ...(options.agentId ? { agentId: options.agentId } : {}),
      description:
        options.description ?? 'An agent running on a model in the browser',
    });
    if (!(options.defaultModel in options.models)) {
      throw new Error(
        `defaultModel "${options.defaultModel}" is not one of the registered models.`,
      );
    }
    this.options = options;
    this.selection = { current: options.defaultModel };
    this.compaction =
      options.compaction === false
        ? undefined
        : (options.compaction ?? new SummaryCompaction());
  }

  /** The model runs use unless a run picks one. Starts as `defaultModel`. */
  get selectedModel(): keyof Models & string {
    return this.selection.current;
  }

  /** Switches the model for the next runs. Only registered ids are accepted. */
  selectModel(modelId: keyof Models & string): void {
    if (!(modelId in this.options.models))
      throw new Error(`Unknown model "${modelId}".`);
    this.selection.current = modelId;
  }

  /** The ids of the registered models. */
  get modelIds(): readonly (keyof Models & string)[] {
    return Object.keys(this.options.models) as (keyof Models & string)[];
  }

  /** The engine for a model id (default: the selected model), for availability or downloads. */
  engine(modelId: keyof Models & string = this.selection.current): Engine {
    const engine = this.options.models[modelId];
    if (!engine) throw new Error(`Unknown model "${modelId}".`);
    return engine;
  }

  override clone(): BrowserModelsAgent<Models> {
    const copy = super.clone() as BrowserModelsAgent<Models>;
    copy.options = this.options;
    copy.selection = this.selection;
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

  override run(input: RunAgentInput): Observable<BaseEvent> {
    return new Observable<BaseEvent>((subscriber) => {
      const abort = new AbortController();
      this.abortController = abort;
      const modelId = modelFromInput(input) ?? this.selection.current;
      const engine = this.options.models[modelId];

      const stream = engine
        ? new AgentRun({
            engine,
            input,
            signal: abort.signal,
            ...(this.options.localTools
              ? { localTools: this.options.localTools }
              : {}),
            ...(this.options.maxSteps
              ? { maxSteps: this.options.maxSteps }
              : {}),
            ...(this.options.repairHook
              ? { repairHook: this.options.repairHook }
              : {}),
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
  const soverius = asObject(asObject(input.forwardedProps)?.['soverius']);
  return asString(soverius?.['model']);
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

// The model store is part of the agent entry point.
export {
  ModelStore,
  type ModelState,
  type ModelStatus,
  type ModelSource,
  type StorageUse,
} from './model-store.ts';

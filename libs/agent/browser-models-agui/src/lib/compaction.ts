import type { ChatMessage, Engine } from '@soverius-ai/browser-models';
import type { PromptMessage } from './prompt.ts';

/**
 * Keeps a conversation within the model's context. The agent uses `SummaryCompaction` unless
 * it gets another one: implement this interface for an algorithm of your own.
 */
export interface Compaction {
  /**
   * Called before every model call. Returns the messages the model gets: `request.messages`
   * as they are, or fewer, shorter or other ones. An error fails the run.
   *
   * Every call gets the whole conversation again, also what an earlier call left out. Keep
   * what is expensive to make, for example a summary, by `threadId`.
   */
  compact(request: CompactionRequest): Promise<readonly ChatMessage[]>;
}

/** What `Compaction.compact()` gets before every model call. */
export interface CompactionRequest {
  readonly threadId: string;
  /**
   * What the model would get. First the system prompt, if there is one: the instructions and
   * the tool descriptions. Then the whole conversation, each message with its AG-UI `source`.
   * Last the tool calls and results the run has added so far, without a `source`.
   */
  readonly messages: readonly PromptMessage[];
  /** The model of the run: for its `contextWindowSize`, or to write a summary with. */
  readonly engine: Engine;
  /** Aborts when the run is stopped. */
  readonly signal: AbortSignal;
  /** Sends the CUSTOM event `soverius.compaction` with this value to the client. */
  readonly report: (status: CompactionStatus) => void;
  /**
   * The last model call of this run, when the engine counted its tokens: a real measure of
   * how many characters make a token for this model and language.
   */
  readonly lastCall?: LastCall;
}

/** A model call and the tokens the engine counted for it. */
export interface LastCall {
  /** Prompt and reply together, counted by the engine. */
  readonly tokens: number;
  /** The characters of the prompt's messages and of the reply. */
  readonly characters: number;
}

/** Value of the CUSTOM event `soverius.compaction`. Token counts are estimates. */
export type CompactionStatus =
  | {
      /** The model is writing a summary: the answer starts after it. */
      readonly status: 'summarizing';
      readonly tokens: number;
      readonly contextWindowSize: number;
    }
  | {
      readonly status: 'done';
      readonly tokensBefore: number;
      readonly tokensAfter: number;
      readonly contextWindowSize: number;
      /** Messages a new summary stands for. */
      readonly summarized: number;
      /** Messages whose tool results were cut. */
      readonly shortened: number;
      /** Messages left out without a summary. */
      readonly dropped: number;
    };

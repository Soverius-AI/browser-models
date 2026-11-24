import type { RunAgentInput } from '@ag-ui/core';
import type { Engine, RunTools } from '@soverius-ai/browser-models';

// The tool types are in the core: tool calling does not need the agent.
export type {
  CheckedCall,
  RepairStep,
  RunTools,
  ToolCall,
  ToolSpec,
} from '@soverius-ai/browser-models';

/**
 * Tool calling for the agent. Without it the agent only chats: the client's tools are not
 * offered to the model. `ToolCalling` of `@soverius-ai/browser-models-tools` implements it.
 */
export interface Tools {
  /** Called at the start of every run, before the model is loaded. */
  start(run: ToolsRun): Promise<RunTools>;
}

/** What `Tools.start()` gets at the start of a run. */
export interface ToolsRun {
  /** `input.tools` are the client's tools: the client runs them. */
  readonly input: RunAgentInput;
  readonly engine: Engine;
  /** Aborts when the run is stopped. */
  readonly signal: AbortSignal;
}

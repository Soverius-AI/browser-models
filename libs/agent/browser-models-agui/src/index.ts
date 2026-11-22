/**
 * `@soverius-ai/browser-models-agui`: an AG-UI agent on the engines, for CopilotKit or any AG-UI client.
 *
 * @packageDocumentation
 */
export {
  BrowserModelsAgent,
  type BrowserModelsAgentOptions,
  type DevtoolsMessage,
} from './agent.ts';
export type {
  Compaction,
  CompactionRequest,
  CompactionStatus,
  LastCall,
} from './lib/compaction.ts';
export {
  AgentEvents,
  MODEL_ACTIVITY,
  type CustomEvents,
  type ModelActivity,
  type ToolRepair,
  type ToolSourceError,
} from './lib/events.ts';
export { buildChatMessages, type PromptMessage } from './lib/prompt.ts';
export { AgentRun, type RunOptions } from './lib/run.ts';
export {
  SummaryCompaction,
  type SummaryCompactionOptions,
} from './lib/summary-compaction.ts';
export type {
  CheckedCall,
  RepairStep,
  RunTools,
  ToolCall,
  Tools,
  ToolSpec,
  ToolsRun,
} from './lib/tools.ts';

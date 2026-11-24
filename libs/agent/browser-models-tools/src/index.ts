/**
 * `@soverius-ai/browser-models-tools`: tool calling for `BrowserModelsAgent` (`ToolCalling`) or on an engine without AG-UI (`ToolCallingAgent`), with repair and schema checks.
 *
 * @module tool-calling
 */
export {
  ToolCalling,
  type ToolCallingOptions,
  type ToolCallingRun,
} from './lib/tool-calling.ts';
export {
  ToolCallingAgent,
  type ToolCallingAgentOptions,
  type ToolCallingRunOptions,
} from './lib/tool-calling-agent.ts';
export type {
  ReasoningPart,
  SourceErrorPart,
  StepLimitPart,
  TextPart,
  ToolCallingPart,
  ToolCallPart,
  ToolErrorPart,
} from './lib/engine-tool-loop.ts';
export {
  ToolCallRepair,
  type RepairOptions,
  type RepairResult,
  type RepairStep,
} from './lib/repair.ts';
export { ArgumentsSchema, type SchemaCheck } from './lib/schema.ts';
export type { LocalTool, LocalToolSource, ToolCheck } from './lib/tools.ts';

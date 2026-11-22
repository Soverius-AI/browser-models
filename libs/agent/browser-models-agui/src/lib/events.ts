import { EventType, type BaseEvent, type Event } from '@ag-ui/core';
import type { CompactionStatus } from './compaction.ts';
import type { RepairStep } from './tools.ts';

/** `activityType` of the model loading events. */
export const MODEL_ACTIVITY = 'soverius.model';

/** Content of the `soverius.model` activity: the model loads before the first answer. */
export interface ModelActivity {
  readonly engineId: string;
  readonly status: 'loading' | 'ready';
  /** From 0 to 1. */
  readonly progress: number;
}

/** Value of `soverius.tool_repair`: a tool call the agent had to fix. */
export interface ToolRepair {
  readonly toolCallId: string;
  /** What the model wrote. */
  readonly raw: string;
  readonly steps: readonly RepairStep[];
}

/** Value of `soverius.tool_source_error`: a tool source failed, the run goes on without it. */
export interface ToolSourceError {
  readonly message: string;
}

/** The value of each `CUSTOM` event the agent sends, by name. */
export interface CustomEvents {
  readonly 'soverius.compaction': CompactionStatus;
  readonly 'soverius.tool_repair': ToolRepair;
  readonly 'soverius.tool_source_error': ToolSourceError;
}

/**
 * Reads the agent's own events, typed, from any AG-UI event. Each method answers undefined for
 * every other event.
 *
 * ```ts
 * agent.subscribe({
 *   onEvent: ({ event }) => {
 *     const status = AgentEvents.compaction(event);
 *     if (status?.status === 'summarizing') showHint('Summarizing the conversation…');
 *   },
 * });
 * ```
 */
export class AgentEvents {
  /** The value of `soverius.compaction`. */
  static compaction(event: BaseEvent): CompactionStatus | undefined {
    return AgentEvents.custom(event, 'soverius.compaction');
  }

  /** The value of `soverius.tool_repair`. */
  static toolRepair(event: BaseEvent): ToolRepair | undefined {
    return AgentEvents.custom(event, 'soverius.tool_repair');
  }

  /** The value of `soverius.tool_source_error`. */
  static toolSourceError(event: BaseEvent): ToolSourceError | undefined {
    return AgentEvents.custom(event, 'soverius.tool_source_error');
  }

  /** The content of a `soverius.model` activity. */
  static modelActivity(event: BaseEvent): ModelActivity | undefined {
    // Clients hand out events as BaseEvent; AG-UI's union tells the fields of each type.
    const known = event as Event;
    return known.type === EventType.ACTIVITY_SNAPSHOT &&
      known.activityType === MODEL_ACTIVITY
      ? (known.content as unknown as ModelActivity)
      : undefined;
  }

  /** The value of a `CUSTOM` event of the agent with this name. */
  static custom<Name extends keyof CustomEvents>(
    event: BaseEvent,
    name: Name,
  ): CustomEvents[Name] | undefined {
    const known = event as Event;
    // The agent sends these values, so they have the type their name stands for.
    return known.type === EventType.CUSTOM && known.name === name
      ? (known.value as CustomEvents[Name])
      : undefined;
  }
}

import { EventType, type BaseEvent } from '@ag-ui/core';
import { AgentEvents } from './events.ts';

describe('AgentEvents', () => {
  const compaction = {
    type: EventType.CUSTOM,
    name: 'soverius.compaction',
    value: { status: 'summarizing', tokens: 900, contextWindowSize: 1000 },
  } as BaseEvent;

  it('reads the value of an event of the agent', () => {
    expect(AgentEvents.compaction(compaction)).toEqual({
      status: 'summarizing',
      tokens: 900,
      contextWindowSize: 1000,
    });
  });

  it('answers undefined for every other event', () => {
    expect(AgentEvents.toolRepair(compaction)).toBeUndefined();
    expect(AgentEvents.modelActivity(compaction)).toBeUndefined();
    expect(
      AgentEvents.compaction({ type: EventType.RUN_STARTED } as BaseEvent),
    ).toBeUndefined();
  });
});

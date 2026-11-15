import type { AgentSubscriber } from '@ag-ui/client';
import type { Message, Tool, ToolCall } from '@ag-ui/core';
import { agent } from './agent';

/**
 * A frontend tool: declared in `RunAgentInput.tools` and run by this page, the AG-UI client.
 * (CopilotKit does this part for you; here it is done by hand.)
 */
const frontendTools: Tool[] = [
  {
    name: 'change_background',
    description: 'Change the page background color.',
    parameters: {
      type: 'object',
      properties: { color: { type: 'string' } },
      required: ['color'],
    },
  },
];

function runFrontendTool(call: ToolCall): string {
  const args = JSON.parse(call.function.arguments || '{}') as {
    color?: string;
  };
  document.body.style.background = args.color ?? '';
  return `Background set to ${args.color}`;
}

/** Sends a user message and runs the agent until no frontend tool call is left. */
export async function send(
  text: string,
  subscriber: AgentSubscriber,
): Promise<void> {
  agent.addMessage({ id: crypto.randomUUID(), role: 'user', content: text });

  for (let round = 0; round < 3; round++) {
    const { newMessages } = await agent.runAgent(
      { tools: frontendTools },
      subscriber,
    );
    const calls = frontendCalls(newMessages);
    if (calls.length === 0) return;

    // Run the tools here and add their results; the next run continues with them.
    for (const call of calls) {
      agent.addMessage({
        id: crypto.randomUUID(),
        role: 'tool',
        toolCallId: call.id,
        content: runFrontendTool(call),
      });
    }
  }
}

function frontendCalls(messages: readonly Message[]): ToolCall[] {
  const names = new Set(frontendTools.map((tool) => tool.name));
  return messages.flatMap((message) =>
    message.role === 'assistant'
      ? (message.toolCalls ?? []).filter((call) =>
          names.has(call.function.name),
        )
      : [],
  );
}

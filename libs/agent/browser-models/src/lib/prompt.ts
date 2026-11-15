import type { Context, Message } from '@ag-ui/core';
import type { ChatMessage } from './engine.ts';
import type { ToolSpec } from './tools.ts';

/** Turns the AG-UI conversation into plain chat messages, with tool instructions in the system prompt. */
export function buildChatMessages(
  messages: readonly Message[],
  context: readonly Context[],
  tools: readonly ToolSpec[],
): ChatMessage[] {
  const system: string[] = [];
  const chat: ChatMessage[] = [];
  const toolNames = new Map<string, string>();

  for (const message of messages) {
    switch (message.role) {
      case 'system':
      case 'developer':
        system.push(message.content);
        break;
      case 'user':
        chat.push({ role: 'user', content: textOf(message.content) });
        break;
      case 'assistant': {
        const calls = (message.toolCalls ?? []).map((call) => {
          toolNames.set(call.id, call.function.name);
          return toolCallBlock(call.function.name, call.function.arguments);
        });
        const content = [message.content ?? '', ...calls]
          .filter(Boolean)
          .join('\n');
        if (content) chat.push({ role: 'assistant', content });
        break;
      }
      case 'tool':
        chat.push({
          role: 'user',
          content: toolResultBlock(
            toolNames.get(message.toolCallId) ?? 'unknown',
            message.error ?? (textOf(message.content) || EMPTY_RESULT),
          ),
        });
        break;
      default:
        // Activity and reasoning messages are UI-only and not sent to the model.
        break;
    }
  }

  for (const item of context)
    system.push(`${item.description}:\n${item.value}`);
  if (tools.length > 0) system.push(toolInstructions(tools));

  return system.length > 0
    ? [{ role: 'system', content: system.join('\n\n') }, ...chat]
    : chat;
}

/**
 * Said to the model when a tool returns nothing, for example a CopilotKit `registerComponent`
 * tool that only shows a component. An empty result reads like a failure to small models.
 */
const EMPTY_RESULT = 'Done. The tool ran and returned no data.';

/** How a tool call looks in the conversation the model sees. */
export function toolCallBlock(name: string, argumentsJson: string): string {
  return (
    '```tool_call\n' +
    `{"name": ${JSON.stringify(name)}, "arguments": ${argumentsJson || '{}'}}` +
    '\n```'
  );
}

/** How a tool result looks in the conversation the model sees. */
export function toolResultBlock(name: string, result: string): string {
  return '```tool_result\n' + JSON.stringify({ name, result }) + '\n```';
}

function toolInstructions(tools: readonly ToolSpec[]): string {
  const list = tools
    .map(
      (tool) =>
        `- ${tool.name}: ${tool.description}\n  arguments (JSON Schema): ${JSON.stringify(tool.parameters ?? { type: 'object' })}`,
    )
    .join('\n');
  return [
    'You can call tools. To call one, reply with a block like this and nothing after it:',
    '```tool_call\n{"name": "<tool name>", "arguments": { ... }}\n```',
    'Tool results come back in a ```tool_result block. Only call a tool when you need it.',
    'After a tool result, answer the user in plain words. Never write a tool_result block yourself.',
    'If a tool result is an error, do not give up: fix the arguments or call the tool that provides what is missing, then try again.',
    'Available tools:',
    list,
  ].join('\n');
}

function textOf(
  content: string | readonly { type: string; text?: string }[],
): string {
  if (typeof content === 'string') return content;
  return content
    .map((part) => (part.type === 'text' ? (part.text ?? '') : ''))
    .join('');
}

import type { Context, Message } from '@ag-ui/core';
import type { ChatMessage } from './engine.ts';
import type { ToolSpec } from './tools.ts';

/** A message of the prompt, and the AG-UI message it was made from. */
export interface PromptMessage extends ChatMessage {
  /**
   * The client's message this one was made from. Not set for the system prompt, and for the
   * tool calls and results a run adds.
   */
  readonly source?: Message;
}

/** Turns the AG-UI conversation into plain chat messages, with tool instructions in the system prompt. */
export function buildChatMessages(
  messages: readonly Message[],
  context: readonly Context[],
  tools: readonly ToolSpec[],
): PromptMessage[] {
  const system: string[] = [];
  const chat: PromptMessage[] = [];
  const toolNames = new Map<string, string>();

  for (const message of messages) {
    switch (message.role) {
      case 'system':
      case 'developer':
        system.push(message.content);
        break;
      case 'user':
        chat.push({
          role: 'user',
          content: textOf(message.content),
          source: message,
        });
        break;
      case 'assistant': {
        const calls = (message.toolCalls ?? []).map((call) => {
          toolNames.set(call.id, call.function.name);
          return toolCallBlock(call.function.name, call.function.arguments);
        });
        const content = [message.content ?? '', ...calls]
          .filter(Boolean)
          .join('\n');
        if (content) chat.push({ role: 'assistant', content, source: message });
        break;
      }
      case 'tool':
        chat.push({
          role: 'user',
          content: toolResultBlock(
            toolNames.get(message.toolCallId) ?? 'unknown',
            message.error ?? (textOf(message.content) || EMPTY_RESULT),
          ),
          source: message,
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

const TOOL_RESULT = /```tool_result\n(.*)\n```/g;
const SHORTENED = '\n… (shortened)';

/**
 * Cuts the results in the `tool_result` blocks of a message to `length` characters, to save
 * context. Everything else stays as it is.
 */
export function shortenToolResults(content: string, length: number): string {
  return content.replace(TOOL_RESULT, (block: string, json: string) => {
    let name: unknown;
    let result: unknown;
    try {
      ({ name, result } = JSON.parse(json) as Record<string, unknown>);
    } catch {
      return block; // not a block of ours, for example one the user typed
    }
    if (typeof name !== 'string' || typeof result !== 'string') return block;
    // Also true for a result that was cut before: it is not cut twice.
    if (result.length <= length + SHORTENED.length) return block;
    return toolResultBlock(name, result.slice(0, length) + SHORTENED);
  });
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

/** The text of a message whose content may come in parts. */
export function textOf(
  content: string | readonly { type: string; text?: string }[],
): string {
  if (typeof content === 'string') return content;
  return content
    .map((part) => (part.type === 'text' ? (part.text ?? '') : ''))
    .join('');
}

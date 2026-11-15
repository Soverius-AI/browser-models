import {
  parseToolCallArguments,
  type AngularToolCall,
} from '@copilotkit/angular';

/**
 * Gives a tool renderer the "in-progress" state while the arguments stream.
 *
 * `<copilot-chat>` of @copilotkit/angular 0.6 never tells its tool renderers that the run is
 * still streaming. So the status is "executing" from the first delta, and unfinished arguments
 * arrive unparsed as `{ _raw: '{"city":"Vie' }`. This turns that into what React and Vue get:
 * status "in-progress" with the arguments so far.
 */
export function streamingToolCall<Args extends Record<string, unknown>>(
  call: AngularToolCall<Args>,
): AngularToolCall<Args> {
  const raw: unknown = (call.args as Record<string, unknown>)['_raw'];
  if (call.status !== 'executing' || typeof raw !== 'string') return call;
  return {
    ...(call.name ? { name: call.name } : {}),
    args: parseToolCallArguments(raw, true) as Partial<Args>,
    status: 'in-progress',
    result: undefined,
  };
}

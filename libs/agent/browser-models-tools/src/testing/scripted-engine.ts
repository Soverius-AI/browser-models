import type {
  Availability,
  Engine,
  EnginePart,
  GenerateRequest,
} from '@soverius-ai/browser-models';

/**
 * An engine for the specs: it answers the n-th model call with the n-th of `replies`, in small
 * chunks like a real stream, and keeps the `requests` it got. Like some real engines it does
 * not throw when it is stopped. Its members are properties, so a spec can spread it and
 * replace one: `{ ...new ScriptedEngine(), async *generate() { … } }`.
 */
export class ScriptedEngine implements Engine {
  readonly id = 'scripted';
  readonly supportsConstraint = false;
  readonly requests: GenerateRequest[] = [];
  readonly #replies: readonly string[];

  constructor(...replies: string[]) {
    this.#replies = replies;
  }

  readonly availability = async (): Promise<Availability> => 'available';
  readonly load = async (): Promise<void> => undefined;
  readonly unload = async (): Promise<void> => undefined;
  readonly generate = (request: GenerateRequest): AsyncIterable<EnginePart> =>
    this.#reply(request);

  async *#reply(request: GenerateRequest): AsyncGenerator<EnginePart> {
    this.requests.push(request);
    const reply = this.#replies[this.requests.length - 1] ?? '';
    for (let i = 0; i < reply.length; i += 4)
      yield { type: 'text', text: reply.slice(i, i + 4) };
  }
}

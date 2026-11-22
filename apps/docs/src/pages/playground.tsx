import Link from '@docusaurus/Link';
import { useLocation } from '@docusaurus/router';
import Layout from '@theme/Layout';
import { useRef, useState } from 'react';

const platforms = {
  angular: {
    name: 'Angular',
    logo: 'angular',
    docs: '/docs/frameworks/angular',
  },
  react: { name: 'React', logo: 'react', docs: '/docs/frameworks/react' },
  vue: { name: 'Vue', logo: 'vuedotjs', docs: '/docs/frameworks/vue' },
  vanilla: {
    name: 'Vanilla',
    logo: 'typescript',
    docs: '/docs/agent/without-copilotkit',
  },
  agent: { name: 'Agent, no tools', logo: 'ag-ui', docs: '/docs/agent' },
  engine: {
    name: 'Engine only',
    logo: 'webgpu',
    docs: '/docs/engines/streaming',
  },
  assistant: {
    name: 'Docs assistant',
    logo: 'copilotkit',
    docs: '/docs/examples/docs-assistant',
  },
} as const;

type Platform = keyof typeof platforms;

interface Example {
  readonly title: string;
  readonly text: string;
  /** The prompts to run, per platform. A platform without prompts does not have the example. */
  readonly prompts: Partial<Record<Platform, readonly string[]>>;
  /** Extra query for the example page, for example to switch on an MCP server. */
  readonly query?: string;
}

/** The same prompts on several platforms. */
function on(
  ids: readonly Platform[],
  ...prompts: readonly string[]
): Partial<Record<Platform, readonly string[]>> {
  return Object.fromEntries(ids.map((id) => [id, prompts]));
}

const all = ['angular', 'react', 'vue', 'vanilla'] as const;
/** The two examples without tool calling. */
const plain = ['agent', 'engine'] as const;
const copilotKit = ['angular', 'react', 'vue'] as const;

const examples: readonly Example[] = [
  {
    title: 'Ask the docs',
    text: 'The model searches these docs with a tool of the agent, answers, and shows the page with a tool of the page.',
    prompts: on(
      ['assistant'],
      'how do I check the Prompt API',
      'search the docs for compaction',
    ),
  },
  {
    title: 'Chat',
    text: 'Text streams from the model on your device.',
    prompts: on([...all, ...plain], 'Hello'),
  },
  {
    title: 'Thinking',
    text: 'The model thinks in <think> tags first. Engine only: OutputParser splits it off; the agent sends it as REASONING events.',
    prompts: on(plain, 'think about it'),
  },
  {
    title: 'Generative UI',
    text: 'The model calls a tool and the chat renders a component from its arguments.',
    prompts: {
      ...on(copilotKit, 'What is the weather in Vienna?'),
      angular: ['What is the weather in Vienna?', 'Show incident INC-4711'],
    },
  },
  {
    title: 'Open Generative UI',
    text: 'The model writes HTML, CSS and JavaScript. CopilotKit runs it in a sandboxed iframe (JetBrains websandbox).',
    prompts: on(
      copilotKit,
      'Draw a chart with Chart.js',
      'Build a tip calculator',
    ),
  },
  {
    title: 'Streaming tool call',
    text: 'The card fills in while the model is still writing the arguments.',
    prompts: on(copilotKit, 'Plan a trip to Vienna'),
  },
  {
    title: 'WebMCP',
    text: 'The page registers a tool with document.modelContext. The agent finds it through WebMcpTools.',
    prompts: on(all, 'What is the page title?'),
  },
  {
    title: 'MCP server',
    text: 'Tools of the remote Context7 server, through McpTools. This sends requests to mcp.context7.com.',
    prompts: on(
      all,
      'Find the library id for react with Context7, then look up its docs: how does useState work?',
    ),
    query: 'mcp=context7',
  },
  {
    title: 'Local tool',
    text: 'A tool that runs inside the agent.',
    prompts: on(all, 'What time is it?'),
  },
  {
    title: 'Frontend tool',
    text: 'A tool the app registers. The agent calls it and the app runs it.',
    prompts: {
      angular: ['Change the background to light blue'],
      react: ['Add a todo'],
      vue: ['Add a todo'],
      vanilla: ['Change the background'],
    },
  },
];

/** One AG-UI event of the example's agent, as the "Devtools" switch shows it. */
interface AgentEvent {
  readonly id: number;
  readonly type: string;
  readonly detail: string;
}

/** The part of an AG-UI event worth a line: its text, tool name or error. */
function detail(event: Record<string, unknown>): string {
  const value =
    event.delta ?? event.toolCallName ?? event.message ?? event.name ?? '';
  return typeof value === 'string' ? value : JSON.stringify(value);
}

function isPlatform(value: string | null): value is Platform {
  return value !== null && Object.hasOwn(platforms, value);
}

/**
 * Types a prompt into the example's chat box and sends it. The examples are served from this
 * site, so the page can reach into the frame. Waits until the chat box is there.
 */
async function send(
  frame: HTMLIFrameElement | null,
  prompt: string,
): Promise<void> {
  for (let attempt = 0; attempt < 50; attempt++) {
    const view = frame?.contentWindow as (Window & typeof globalThis) | null;
    const input = view?.document.querySelector<
      HTMLTextAreaElement | HTMLInputElement
    >('textarea, #input');
    if (view && input?.offsetParent) {
      const type =
        input instanceof view.HTMLTextAreaElement
          ? view.HTMLTextAreaElement
          : view.HTMLInputElement;
      // The frameworks watch the element's own value setter, so use that one.
      Object.getOwnPropertyDescriptor(type.prototype, 'value')?.set?.call(
        input,
        prompt,
      );
      input.dispatchEvent(new view.Event('input', { bubbles: true }));
      if (input.form) input.form.requestSubmit();
      else
        input.dispatchEvent(
          new view.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
        );
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}

export default function Playground() {
  const requested = new URLSearchParams(useLocation().search).get('platform');
  const [platform, setPlatform] = useState<Platform>(
    isPlatform(requested) ? requested : 'angular',
  );
  const [query, setQuery] = useState('');
  const [devtools, setDevtools] = useState(false);
  const [events, setEvents] = useState<readonly AgentEvent[]>([]);
  const frame = useRef<HTMLIFrameElement>(null);
  /** A prompt to send once the example has reloaded with another query. */
  const pending = useRef<string | undefined>(undefined);

  const current = platforms[platform];
  const src = `/examples/${platform}/?model=demo${query && `&${query}`}${devtools ? '&devtools' : ''}`;

  /** With `?devtools` the example posts every agent event to its own window: list them. */
  function listen(): void {
    setEvents([]);
    if (!devtools) return;
    let id = 0;
    frame.current?.contentWindow?.addEventListener(
      'message',
      ({ data }: MessageEvent) => {
        if (data?.source !== 'soverius-ai/devtools') return;
        const event = data.event as Record<string, unknown>;
        const next = {
          id: id++,
          type: String(event.type),
          detail: detail(event),
        };
        // Newest first; a long run would otherwise grow without end.
        setEvents((list) => [next, ...list].slice(0, 200));
      },
    );
  }

  function run(example: Example, prompt: string): void {
    if (example.query && example.query !== query) {
      pending.current = prompt;
      setQuery(example.query);
    } else {
      void send(frame.current, prompt);
    }
  }

  return (
    <Layout
      title="Playground"
      description="Try in-browser model agents in Angular, React, Vue and vanilla JS, and the engines on their own."
    >
      <main className="container margin-vert--lg">
        <h1>Playground</h1>
        <div className="playground-tabs" role="tablist">
          {(Object.keys(platforms) as Platform[]).map((id) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={id === platform}
              className={`button ${id === platform ? 'button--primary' : 'button--secondary'}`}
              onClick={() => setPlatform(id)}
            >
              <img src={`/img/logos/${platforms[id].logo}.svg`} alt="" />
              {platforms[id].name}
            </button>
          ))}
          <label className="playground-devtools">
            <input
              type="checkbox"
              checked={devtools}
              onChange={(event) => setDevtools(event.target.checked)}
            />
            Devtools
          </label>
        </div>

        <div className="playground">
          <div
            className={`playground__window${devtools ? ' playground__window--devtools' : ''}`}
          >
            <div className="playground__bar">
              <i />
              <i />
              <i />
              <span>{current.name} example · runs on your device</span>
            </div>
            <iframe
              key={platform + query + String(devtools)}
              ref={frame}
              title={`${current.name} example`}
              src={src}
              className="playground__frame"
              onLoad={() => {
                listen();
                if (!pending.current) return;
                void send(frame.current, pending.current);
                pending.current = undefined;
              }}
            />
            {devtools && (
              <ol className="playground__events" aria-label="Agent events">
                {events.length === 0 && <li>Run an example to see events.</li>}
                {events.map((event) => (
                  <li key={event.id}>
                    <code>{event.type}</code> {event.detail}
                  </li>
                ))}
              </ol>
            )}
          </div>
          <aside className="playground__help">
            <h3>Examples</h3>
            {examples.map((example) => {
              const prompts = example.prompts[platform];
              return (
                prompts && (
                  <section key={example.title} className="playground__example">
                    <h4>{example.title}</h4>
                    <p>{example.text}</p>
                    {prompts.map((prompt) => (
                      <button
                        key={prompt}
                        type="button"
                        className="button button--sm button--outline button--primary"
                        onClick={() => run(example, prompt)}
                      >
                        ▶ {prompt}
                      </button>
                    ))}
                  </section>
                )
              );
            })}
            <h3>Models</h3>
            <p>
              Starts with the scripted <code>demo</code> model. Pick a real one
              in the example's model picker: Gemini Nano (Chrome with the Prompt
              API), Qwen3 or Gemma 4 (WebGPU, downloads once).
            </p>
            <p>
              <a href={src} target="_blank" rel="noreferrer">
                Open full screen
              </a>
              {' · '}
              <Link to={current.docs}>{current.name} docs</Link>
            </p>
          </aside>
        </div>
      </main>
    </Layout>
  );
}

import Link from '@docusaurus/Link';
import CodeBlock from '@theme/CodeBlock';
import Layout from '@theme/Layout';
import ModelOverview from '../components/ModelOverview';
import BrowserModelsWordmark from '../components/BrowserModelsWordmark';

const site = 'https://soverius.ai';

const features = [
  {
    title: 'Tool calling',
    icon: (
      <path d="M14.7 6.3a5 5 0 0 0-6.4 6.4l-5.6 5.6a2.1 2.1 0 0 0 3 3l5.6-5.6a5 5 0 0 0 6.4-6.4l-3.2 3.2-3-3 3.2-3.2Z" />
    ),
    text: 'Tool calling across all supported engines, including validation and repair of malformed calls.',
  },
  {
    title: 'WebMCP and MCP support',
    icon: (
      <>
        <path d="M9 3v4m6-4v4M7 7h10v4a5 5 0 0 1-10 0V7Zm5 9v5" />
      </>
    ),
    text: 'Connect models to tools exposed by the current page or remote MCP servers.',
  },
  {
    title: 'Model manager',
    icon: (
      <>
        <path d="M5 4h14l3 10v4a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-4L5 4ZM2 14h20M6 17h.01M18 17h.01" />
      </>
    ),
    text: 'Download models with progress, inspect cached models, and delete stored files.',
  },
  {
    title: 'Three layers',
    icon: <path d="m12 3 10 5-10 5L2 8l10-5Zm-10 9 10 5 10-5M2 16l10 5 10-5" />,
    text: 'Engines alone for a plain chat, an AG-UI agent for CopilotKit, tool calling when you need it. Take only what you use.',
  },
  {
    title: 'Built on existing standards',
    icon: (
      <>
        <circle cx="12" cy="4" r="2.5" />
        <circle cx="5" cy="19" r="2.5" />
        <circle cx="19" cy="19" r="2.5" />
        <path d="m10.9 6.3-4.8 10.4m7-10.4 4.8 10.4M7.5 19h9" />
      </>
    ),
    text: 'AG-UI events for responses, tool calls, and model-loading progress. Connect to CopilotKit or another compatible client.',
  },
  {
    title: 'Context management',
    icon: (
      <>
        <path d="m12 3 10 5-10 5L2 8l10-5Zm-10 9 10 5 10-5M2 16l10 5 10-5" />
      </>
    ),
    text: 'Automatically summarize older turns to keep long conversations within the model’s context window.',
  },
];

const example = `import { PromptApiEngine } from '@soverius-ai/browser-models/prompt-api';
import { WebLlmEngine } from '@soverius-ai/browser-models/web-llm';
import { BrowserModelsAgent } from '@soverius-ai/browser-models-agui';
import { ToolCalling } from '@soverius-ai/browser-models-tools';

const agent = new BrowserModelsAgent({
  models: {
    nano: new PromptApiEngine(),
    qwen: new WebLlmEngine('Qwen3-0.6B-q4f16_1-MLC'),
  },
  defaultModel: 'nano',
  tools: new ToolCalling({
    localTools: [
      {
        name: 'hello',
        description: 'Log a hello world greeting.',
        async execute() {
          console.log('Hello world!');
        },
      },
    ],
  }),
});

agent.addMessage({ id: 'user', role: 'user', content: 'Say hello.' });
await agent.runAgent();`;

export default function Home() {
  return (
    <Layout
      title="One API to rule them all"
      description="Use the Prompt API, WebLLM, or Transformers.js with one consistent API."
    >
      <header className="hero hero--browser-models">
        <div className="container">
          <h1 className="hero__brand hero__title">
            <span className="sr-only">browser models</span>
            <BrowserModelsWordmark />
          </h1>
          <p className="hero__slogan">One API to rule them all</p>
          <p className="hero__subtitle">
            Use the Prompt API, WebLLM, or Transformers.js with one consistent
            API: engines alone, as an AG-UI agent, or with tool calling.
          </p>
          <div className="hero__buttons">
            <Link
              className="button button--secondary-brand button--lg"
              to="/playground"
            >
              Try it in your browser
            </Link>
            <Link className="button button--outline button--lg" to="/docs">
              Read the docs
            </Link>
          </div>
          <pre className="hero__install">
            pnpm add @soverius-ai/browser-models
          </pre>
        </div>
      </header>

      <section
        className="model-overview-section"
        aria-label="One API for browser runtimes and server fallback"
      >
        <div className="container">
          <ModelOverview />
        </div>
      </section>

      <main className="container margin-vert--xl">
        <div className="feature-grid">
          {features.map((feature) => (
            <div key={feature.title} className="feature-card">
              <h3>
                <svg
                  className="feature-card__icon"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                  focusable="false"
                >
                  {feature.icon}
                </svg>
                <span>{feature.title}</span>
              </h3>
              <p>{feature.text}</p>
            </div>
          ))}
        </div>

        <section className="code-section">
          <h2>A browser agent with tools</h2>
          <CodeBlock language="ts">{example}</CodeBlock>
        </section>
      </main>

      <section className="soverius-band" aria-label="About Soverius AI">
        <div className="container soverius-band__inner">
          <div className="soverius-band__brand">
            <img
              src="/img/soverius-logo.svg"
              alt="Soverius AI"
              className="soverius-band__logo"
            />
            <p>Built and maintained by Soverius AI.</p>
          </div>
          <a className="soverius-band__link" href={site}>
            Official website <span aria-hidden="true">↗</span>
          </a>
        </div>
      </section>
    </Layout>
  );
}

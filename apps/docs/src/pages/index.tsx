import Link from '@docusaurus/Link';
import CodeBlock from '@theme/CodeBlock';
import Layout from '@theme/Layout';

const site = 'https://soverius.ai';

/** Icon marks, shown in one colour: black, or white in dark mode. */
const logos = [
  { name: 'AG-UI', file: 'ag-ui' },
  { name: 'CopilotKit', file: 'copilotkit' },
  { name: 'Angular', file: 'angular' },
  { name: 'React', file: 'react' },
  { name: 'Vue', file: 'vuedotjs' },
  { name: 'Prompt API', file: 'googlechrome' },
  { name: 'WebLLM', file: 'mlc', wide: true },
  { name: 'transformers.js', file: 'huggingface' },
  { name: 'WebGPU', file: 'webgpu' },
  { name: 'MCP · WebMCP', file: 'modelcontextprotocol' },
] as const;

const features = [
  {
    title: 'Three engines',
    text: 'Prompt API (Gemini Nano, Phi-4-mini), WebLLM on WebGPU, transformers.js on WebGPU or WASM.',
  },
  {
    title: 'AG-UI native',
    text: 'Every model is an AG-UI agent. CopilotKit or any AG-UI client works unchanged.',
  },
  {
    title: 'Tool-call repair',
    text: 'Broken JSON, wrong names and types are fixed before a call reaches your app.',
  },
  {
    title: 'WebMCP and MCP',
    text: "Use the page's WebMCP tools and remote MCP servers as agent tools.",
  },
  {
    title: 'Model manager',
    text: 'Download with progress, see what is cached, delete models. OPFS or Cache API.',
  },
  {
    title: 'No server',
    text: 'Prompts, tools and answers stay on the device. Nothing to deploy.',
  },
];

const platforms = [
  {
    id: 'angular',
    name: 'Angular',
    logo: 'angular',
    text: 'provideBrowserModels() + CopilotKit Angular',
  },
  {
    id: 'react',
    name: 'React',
    logo: 'react',
    text: 'useModelStore() + CopilotKit React',
  },
  {
    id: 'vue',
    name: 'Vue',
    logo: 'vuedotjs',
    text: 'useModelStore() + CopilotKit Vue',
  },
  {
    id: 'vanilla',
    name: 'Vanilla',
    logo: 'typescript',
    text: 'Plain @ag-ui/client, no framework',
  },
];

const example = `import { BrowserModelsAgent } from '@soverius-ai/browser-models/agent';
import { PromptApiEngine } from '@soverius-ai/browser-models/prompt-api';
import { WebLlmEngine } from '@soverius-ai/browser-models/web-llm';

const agent = new BrowserModelsAgent({
  models: {
    nano: new PromptApiEngine(),
    qwen: new WebLlmEngine('Qwen3-0.6B-q4f16_1-MLC'),
  },
  defaultModel: 'nano',
});

// An AG-UI agent: hand it to CopilotKit or any AG-UI client.
agent.addMessage({ id: '1', role: 'user', content: 'Hello' });
await agent.runAgent();`;

function Logo({ file, className }: { file: string; className?: string }) {
  return (
    <img
      src={`/img/logos/${file}.svg`}
      alt=""
      className={className}
      loading="lazy"
    />
  );
}

export default function Home() {
  return (
    <Layout
      title="LLMs in the browser, speaking AG-UI"
      description="Run LLMs in the browser as AG-UI agents. By Soverius AI."
    >
      <header className="hero hero--browser-models">
        <div className="container">
          <a className="hero__badge" href={site}>
            <img src="/img/favicon.svg" alt="" /> by Soverius AI
          </a>
          <h1 className="hero__title">
            LLMs in the browser.
            <br />
            <span className="hero__accent">Speaking AG-UI.</span>
          </h1>
          <p className="hero__subtitle">
            Run Gemini Nano, WebLLM and transformers.js models on the user's
            device and plug them into CopilotKit or any AG-UI client.
          </p>
          <div className="hero__buttons">
            <Link
              className="button button--primary button--lg"
              to="/playground"
            >
              Try it in your browser
            </Link>
            <Link className="button button--secondary button--lg" to="/docs">
              Read the docs
            </Link>
          </div>
          <pre className="hero__install">
            pnpm add @soverius-ai/browser-models
          </pre>
        </div>
      </header>

      <section className="logo-strip" aria-label="Works with">
        <div className="container">
          <p className="logo-strip__title">Works with</p>
          <ul className="logo-strip__list">
            {logos.map((logo) => (
              <li
                key={logo.name}
                className={'wide' in logo ? 'logo--wide' : undefined}
              >
                <Logo file={logo.file} className="logo--mono" />
                <span>{logo.name}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <main className="container margin-vert--xl">
        <div className="feature-grid">
          {features.map((feature) => (
            <div key={feature.title} className="feature-card">
              <h3>{feature.title}</h3>
              <p>{feature.text}</p>
            </div>
          ))}
        </div>

        <div className="code-section">
          <div>
            <h2>A few lines to an agent</h2>
            <p>
              Pick the models, pick the default. Users switch models at runtime;
              nothing is chosen for them.
            </p>
            <Link className="button button--outline button--primary" to="/docs">
              Getting started
            </Link>
          </div>
          <CodeBlock language="ts">{example}</CodeBlock>
        </div>

        <h2 className="text--center margin-top--xl">
          Try it with your framework
        </h2>
        <div className="platform-grid">
          {platforms.map((platform) => (
            <Link
              key={platform.id}
              className="platform-card"
              to={`/playground?platform=${platform.id}`}
            >
              <Logo file={platform.logo} className="logo--mono" />
              <strong>{platform.name}</strong>
              <span>{platform.text}</span>
            </Link>
          ))}
        </div>
      </main>

      <section className="soverius-band">
        <div className="container soverius-band__inner">
          <div>
            <img
              src="/img/soverius-logo-dark.svg"
              alt="Soverius AI"
              className="soverius-band__logo"
            />
            <h2>Production AI engineering for application teams</h2>
            <p>
              browser-models is built and maintained by Soverius AI. Get new
              releases, talks and Quantized AI News in your inbox.
            </p>
          </div>
          <div className="soverius-band__actions">
            <a
              className="button button--lg button--secondary-brand"
              href={`${site}/newsletter`}
            >
              Subscribe to the newsletter
            </a>
            <a
              className="button button--lg button--outline button--white"
              href={`${site}/courses`}
            >
              Workshops
            </a>
            <a
              className="button button--lg button--outline button--white"
              href={`${site}/contact`}
            >
              Discuss your project
            </a>
          </div>
        </div>
      </section>
    </Layout>
  );
}

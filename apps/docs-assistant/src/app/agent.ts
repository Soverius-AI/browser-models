import { ModelStore } from '@soverius-ai/browser-models';
import { PromptApiEngine } from '@soverius-ai/browser-models/prompt-api';
import { WebLlmEngine } from '@soverius-ai/browser-models/web-llm';
import { BrowserModelsAgent } from '@soverius-ai/browser-models-agui';
import {
  ToolCalling,
  type LocalTool,
  type ToolCheck,
} from '@soverius-ai/browser-models-tools';
import { demoEngine } from '@soverius-ai/example-shared';
import { DocsIndex } from './docs-index';

/** The docs of this site, bundled into the app: guides and the generated API reference. */
export const docs = DocsIndex.fromFiles(
  import.meta.glob<string>('../../../docs/docs/**/*.md', {
    query: '?raw',
    import: 'default',
    eager: true,
  }),
);

// 1. Engines (@soverius-ai/browser-models): the model built into the browser if there is one,
//    else Gemma on WebLLM. Searching docs needs room: 16k tokens of context.
const engines = {
  nano: new PromptApiEngine({ sampling: 'predictable' }),
  gemma: new WebLlmEngine('gemma-4-E2B-it-q4f16_1-MLC', {
    contextWindowSize: 16384,
    sampling: 'predictable',
  }),
  demo: demoEngine(),
};

export const labels: Readonly<Record<keyof typeof engines, string>> = {
  nano: 'Gemini Nano · Prompt API (built into Chrome)',
  gemma: 'Gemma 4 E2B · WebLLM (WebGPU, ~3.4 GB GPU memory)',
  demo: 'Demo · scripted, no model',
};

// 2. Tools (@soverius-ai/browser-models-tools): the model searches and reads the docs. Both run
//    in the agent; their results go back to the model.
const searchDocs: LocalTool<{ query: string }> = {
  name: 'searchDocs',
  description:
    'Searches the browser-models docs by keywords. Returns the best sections: id, page, title, url and an excerpt.',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description:
          'Words from the question, for example "prompt api availability"',
      },
    },
    required: ['query'],
  },
  execute: async ({ query }) => docs.search(query),
};

/**
 * A small model sometimes searches for the placeholder of a tool call it has seen: "…", "...",
 * "keyword", "search terms". The check sends such a call back to the model, which then searches
 * with the question's words. Any other query is searched, also one word like "query".
 */
const realQuery: ToolCheck = {
  tool: 'searchDocs',
  check: ({ query }) =>
    /^\s*(…|\.\.\.|(your )?(keywords?|search (terms?|keywords?))( here)?)\s*$/i.test(
      String(query),
    )
      ? 'the query is a placeholder; search with words from the question'
      : undefined,
};

const readDocs: LocalTool<{ id: string }> = {
  name: 'readDocs',
  description:
    'Reads one section of the docs by the id searchDocs returned, when its excerpt is not enough.',
  parameters: {
    type: 'object',
    properties: { id: { type: 'string' } },
    required: ['id'],
  },
  execute: async ({ id }) => {
    const section = docs.section(id);
    return section
      ? {
          title: section.title,
          url: section.url,
          text: section.text.slice(0, 2000),
        }
      : { error: `No section "${id}". Use an id from searchDocs.` };
  },
};

// 3. Agent (@soverius-ai/browser-models-agui): CopilotKit talks to it like to any AG-UI agent.
//    The tools CopilotKit registers in the page (showDocsPage) come with every run.
export const agent = new BrowserModelsAgent({
  agentId: 'default',
  models: engines,
  defaultModel: 'gemma',
  tools: new ToolCalling({
    localTools: [searchDocs, readDocs],
    checks: [realQuery],
    maxSteps: 6,
  }),
});

/** How the model should answer: given to CopilotKit as agent context. */
export const instructions = [
  'You answer questions about browser-models, a library that runs language models in the browser.',
  'Always call searchDocs first, with the key words of the question.',
  'If an excerpt is not enough, call readDocs with the id of the best section.',
  'Answer only from what the tools returned, briefly, with a short code example when it helps.',
  'When one section answers the question, call showDocsPage with its url and title.',
  'If the docs do not answer the question, say so.',
].join('\n');

// 4. Model state (@soverius-ai/browser-models): availability and downloads, for the header.
export const store = new ModelStore(agent);

/**
 * Picks the model: `?model=<id>` if given, else the Prompt API when this browser has it, else
 * Gemma. Nothing switches by itself later.
 */
export async function pickModel(): Promise<void> {
  const requested = new URLSearchParams(location.search).get('model');
  if (requested !== null && Object.hasOwn(engines, requested))
    await store.selectModel(requested);
  else if ((await engines.nano.availability()) !== 'unavailable')
    await store.selectModel('nano');
}

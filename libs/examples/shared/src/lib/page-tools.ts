import { installWebMCP } from '@w3c/webmcp-polyfill';

/**
 * Registers a WebMCP tool on the page. The agent reads it with `new WebMcpTools()`.
 * `installWebMCP()` adds `document.modelContext` where the browser has no native WebMCP.
 */
export async function registerPageTools(): Promise<void> {
  installWebMCP();
  await document.modelContext?.registerTool({
    name: 'pageTitle',
    description: 'Returns the title of the current page.',
    annotations: { readOnlyHint: true },
    execute: () => ({ title: document.title }),
  });
}

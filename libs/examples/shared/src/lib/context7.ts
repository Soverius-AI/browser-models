import type { LocalTool, LocalToolSource } from '@soverius-ai/browser-models';
import { McpTools } from '@soverius-ai/browser-models/mcp';

const STORAGE_KEY = 'context7-api-key';

/**
 * The remote Context7 MCP server (library docs) as a tool source the user switches on.
 * While it is off it lists no tools and sends no request. `?mcp=context7` in the URL switches it
 * on (the playground uses that). The optional API key goes only to mcp.context7.com, as a
 * header, and is kept in sessionStorage: this tab only, gone when it closes.
 */
export class Context7Tools implements LocalToolSource {
  enabled = new URLSearchParams(location.search).get('mcp') === 'context7';
  #apiKey = sessionStorage.getItem(STORAGE_KEY) ?? '';

  readonly #mcp = new McpTools({
    url: 'https://mcp.context7.com/mcp',
    namespace: 'context7',
    // Read on every request, so a changed key applies at once. No key: no header (lower limits).
    headers: () =>
      this.#apiKey ? { Authorization: `Bearer ${this.#apiKey}` } : {},
  });

  get apiKey(): string {
    return this.#apiKey;
  }

  set apiKey(key: string) {
    this.#apiKey = key.trim();
    if (this.#apiKey) sessionStorage.setItem(STORAGE_KEY, this.#apiKey);
    else sessionStorage.removeItem(STORAGE_KEY);
  }

  async tools(signal: AbortSignal): Promise<readonly LocalTool[]> {
    return this.enabled ? this.#mcp.tools(signal) : [];
  }
}

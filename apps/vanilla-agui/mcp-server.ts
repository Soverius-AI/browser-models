import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import {
  McpServer,
  WebStandardStreamableHTTPServerTransport,
} from '@modelcontextprotocol/server';
import * as z from 'zod';

/**
 * A demo MCP server at `/mcp` on the app's own dev and preview servers, built with the
 * official MCP SDK. Same origin as the page, so the browser needs no CORS setup.
 */
export function demoMcpServer(): Plugin {
  async function handle(
    req: IncomingMessage,
    res: ServerResponse,
    next: () => void,
  ) {
    if (!req.url?.startsWith('/mcp')) return next();

    // Stateless: a fresh server per request, as in the SDK's examples.
    const server = new McpServer({ name: 'demo', version: '1.0.0' });
    server.registerTool(
      'add',
      {
        description: 'Adds two numbers.',
        inputSchema: z.object({ a: z.number(), b: z.number() }),
        annotations: { readOnlyHint: true },
      },
      async ({ a, b }) => ({
        content: [{ type: 'text', text: String(a + b) }],
      }),
    );
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });
    await server.connect(transport);

    const response = await transport.handleRequest(await toRequest(req));
    res.statusCode = response.status;
    response.headers.forEach((value, key) => res.setHeader(key, value));
    res.end(Buffer.from(await response.arrayBuffer()));
  }

  return {
    name: 'demo-mcp-server',
    configureServer: (server) => void server.middlewares.use(handle),
    configurePreviewServer: (server) => void server.middlewares.use(handle),
  };
}

async function toRequest(req: IncomingMessage): Promise<Request> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value !== undefined)
      headers.set(key, Array.isArray(value) ? value.join(', ') : value);
  }
  const body = chunks.length > 0 ? Buffer.concat(chunks) : undefined;
  return new Request(
    `http://${req.headers.host ?? 'localhost'}${req.url ?? '/'}`,
    {
      method: req.method ?? 'GET',
      headers,
      ...(body ? { body } : {}),
    },
  );
}

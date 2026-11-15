import { expect, test, type Page, type Request } from '@playwright/test';

// Plain @ag-ui/client page (no CopilotKit), with the scripted demo engine.
test.beforeEach(async ({ page }) => {
  await page.goto('/?model=demo');
  await expect(page.getByTestId('model')).toContainText('demo · available');
});

test('streams a text answer', async ({ page }) => {
  await send(page, 'Hello');
  await expect(assistant(page)).toHaveText('You said: Hello');
});

test('runs a local tool', async ({ page }) => {
  await send(page, 'What time is it?');
  await expect(assistant(page)).toHaveText(
    /The tool answered: \d{2}:\d{2}:\d{2}/,
  );
});

test('runs a WebMCP page tool', async ({ page }) => {
  await send(page, 'What is the page title?');
  await expect(assistant(page)).toContainText(
    'browser-models · AG-UI client example · Soverius AI',
  );
});

test('runs a tool of the MCP server', async ({ page }) => {
  await send(page, 'What is the sum of 2 and 3?');
  await expect(page.locator('li[data-role="tool"]')).toHaveText('→ demo__add');
  await expect(assistant(page)).toContainText('"content":"5"');
});

test('runs a frontend tool in the page, then continues', async ({ page }) => {
  await send(page, 'Change the background');
  await expect(page.locator('body')).toHaveCSS(
    'background-color',
    'rgb(173, 216, 230)',
  );
  await expect(assistant(page)).toHaveText(
    'The tool answered: Background set to lightblue',
  );
});

test('shows model loading progress from ACTIVITY events', async ({ page }) => {
  await send(page, 'Hello');
  const activity = page.locator('li[data-role="activity"]');
  await expect(activity).toHaveCount(1); // one card, updated in place
  await expect(activity).toContainText('Demo engine is ready');
});

test.describe('Context7 (remote MCP, mocked)', () => {
  test('sends nothing to Context7 while it is off', async ({ page }) => {
    const context7 = await mockContext7(page);
    await page.locator('#context7-key').fill('ctx7sk-test');

    await send(page, 'What is the sum of 2 and 3?'); // a run lists the tools of all sources
    await expect(assistant(page)).toContainText('"content":"5"');

    expect(context7.requests).toHaveLength(0);
  });

  test('resolves the library, queries its docs and answers', async ({
    page,
  }) => {
    const context7 = await mockContext7(page);
    await page.locator('#context7').check();

    await send(page, 'docs for react');

    await expect(page.locator('li[data-role="tool"]')).toHaveText([
      '→ context7__resolve-library-id',
      '→ context7__query-docs',
    ]);
    await expect(assistant(page)).toHaveText(
      'Context7 found: useState is a React Hook that adds state to a component.',
    );
    expect(context7.calls).toEqual([
      {
        name: 'resolve-library-id',
        arguments: { libraryName: 'react', query: 'docs for react' },
      },
      {
        name: 'query-docs',
        arguments: { libraryId: '/reactjs/react.dev', query: 'docs for react' },
      },
    ]);
    // No key entered: no Authorization header on any request.
    expect(context7.authorizations()).toEqual([undefined]);
  });

  test('sends the API key as a bearer token, only in the header', async ({
    page,
  }) => {
    const context7 = await mockContext7(page);
    await page.locator('#context7-key').fill('ctx7sk-test');
    await page.locator('#context7').check();

    await send(page, 'docs for react');
    await expect(assistant(page)).toContainText('Context7 found:');

    expect(context7.authorizations()).toEqual(['Bearer ctx7sk-test']);
    for (const request of context7.requests) {
      expect(request.url()).toBe(CONTEXT7_URL);
      expect(request.postData()).not.toContain('ctx7sk-test');
    }
    expect(
      await page.evaluate(() => JSON.stringify(localStorage)),
    ).not.toContain('ctx7sk-test');
  });
});

const CONTEXT7_URL = 'https://mcp.context7.com/mcp';

interface ToolCallParams {
  readonly name: string;
  readonly arguments: Record<string, unknown>;
}

/** Stands in for mcp.context7.com: the tests never reach the real service. */
class Context7Mock {
  readonly requests: Request[] = [];
  readonly calls: ToolCallParams[] = [];

  /** The distinct Authorization header values of all requests (`undefined`: not sent). */
  authorizations(): (string | undefined)[] {
    return [
      ...new Set(
        this.requests.map((request) => request.headers()['authorization']),
      ),
    ];
  }

  /** The JSON-RPC result for a request, or undefined for a notification. */
  answer(method: string, params: unknown): object | undefined {
    switch (method) {
      case 'initialize':
        return {
          protocolVersion: '2025-11-25',
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: 'Context7', version: 'mock' },
        };
      case 'tools/list':
        return {
          tools: [
            tool('resolve-library-id', ['libraryName', 'query']),
            tool('query-docs', ['libraryId', 'query']),
          ],
        };
      case 'tools/call': {
        const call = params as ToolCallParams;
        this.calls.push(call);
        return text(
          call.name === 'resolve-library-id'
            ? 'Available Libraries:\n\n- Title: React\n- Context7-compatible library ID: /reactjs/react.dev\n- Description: The React docs.'
            : 'useState is a React Hook that adds state to a component.',
        );
      }
      default:
        return undefined;
    }
  }
}

function tool(name: string, required: string[]) {
  return {
    name,
    description: name,
    inputSchema: {
      type: 'object',
      properties: Object.fromEntries(
        required.map((key) => [key, { type: 'string' }]),
      ),
      required,
    },
    annotations: { readOnlyHint: true },
  };
}

function text(value: string) {
  return { content: [{ type: 'text', text: value }] };
}

/** Routes the Context7 endpoint to the mock, answering in SSE like the real server. */
async function mockContext7(page: Page): Promise<Context7Mock> {
  const mock = new Context7Mock();
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Expose-Headers': 'MCP-Session-Id',
  };
  await page.route(CONTEXT7_URL, async (route) => {
    const request = route.request();
    mock.requests.push(request);
    const { id, method, params } = request.postDataJSON() as {
      id?: number;
      method: string;
      params?: unknown;
    };
    const result = mock.answer(method, params);
    if (!result) return route.fulfill({ status: 202, headers: cors });
    return route.fulfill({
      status: 200,
      headers: { ...cors, 'Content-Type': 'text/event-stream' },
      body: `event: message\ndata: ${JSON.stringify({ jsonrpc: '2.0', id, result })}\n\n`,
    });
  });
  return mock;
}

function assistant(page: Page) {
  return page.locator('li[data-role="assistant"]').last();
}

async function send(page: Page, text: string): Promise<void> {
  await page.locator('#input').fill(text);
  await page.locator('#input').press('Enter');
}

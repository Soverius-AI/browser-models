import { expect, test, type Page } from '@playwright/test';

// Uses the scripted demo engine: headless Chromium has no built-in model.
test.beforeEach(async ({ page }) => {
  await page.goto('/?model=demo');
  await expect(page.getByTestId('model')).toContainText('demo · available');
});

test('chats through CopilotKit with the in-browser agent', async ({ page }) => {
  const input = page.getByRole('textbox');
  await input.fill('Hello');
  await input.press('Enter');

  await expect(page.getByText('You said: Hello')).toBeVisible();
});

test('runs a local tool and answers with its result', async ({ page }) => {
  const input = page.getByRole('textbox');
  await input.fill('What time is it?');
  await input.press('Enter');

  await expect(
    page.getByText(/The tool answered: \d{2}:\d{2}:\d{2}/),
  ).toBeVisible();
});

// The three tests below use examples from the CopilotKit Angular docs.

test('generative UI: shows the documented incident card', async ({ page }) => {
  const states = await watch(page, 'app-incident-card p');
  await send(page, 'Show me incident INC-4711');

  const card = page.locator('app-incident-card article');
  await expect(card).toContainText('INC-4711');
  await expect(card).toContainText('sev1');
  // While the model was still writing the call: in progress, with the id so far.
  expect(states).toContainEqual(expect.stringMatching(/Loading incident INC/));
});

test('frontend tool: the documented change_background tool changes the page', async ({
  page,
}) => {
  await send(page, 'Change the background to light blue');

  await expect(page.locator('main')).toHaveAttribute(
    'style',
    /linear-gradient/,
  );
  // The new background must be visible: nothing opaque may cover the chat area.
  const covering = await page.evaluate(() => {
    const main = document.querySelector('main');
    const { x, y, width, height } =
      document.querySelector('copilot-chat')?.getBoundingClientRect() ??
      new DOMRect();
    return document
      .elementsFromPoint(x + width / 2, y + height / 3)
      .filter((element) => main?.contains(element) && element !== main)
      .map((element) => getComputedStyle(element).backgroundColor)
      .filter(
        (color) => color !== 'rgba(0, 0, 0, 0)' && color !== 'transparent',
      );
  });
  expect(covering).toEqual([]);
});

test('tool result rendering: the documented weather card shows the result', async ({
  page,
}) => {
  const states = await watch(page, 'app-weather-card p');
  await send(page, 'What is the weather in Vienna?');

  const card = page.locator('app-weather-card article');
  await expect(card).toContainText('Vienna');
  await expect(card).toContainText('Sunny and 21 °C in Vienna');
  // While the model was still writing the call: in progress, with the city so far.
  expect(states).toContainEqual(expect.stringMatching(/Loading weather for V/));
});

test('streaming tool call: the trip card grows while its arguments arrive', async ({
  page,
}) => {
  const states = await watch(page, '[data-testid="trip"]');
  await send(page, 'Plan a trip to Vienna');

  const card = page.getByTestId('trip');
  await expect(card).toHaveAttribute('data-status', 'complete');
  await expect(card.locator('li')).toHaveText([
    'St. Stephen’s Cathedral',
    'Schönbrunn Palace',
    'Prater',
    'Naschmarkt',
  ]);
  await expect(
    page.getByText('The tool answered: Planned 4 stops in Vienna'),
  ).toBeVisible();

  // While the model was still writing the call: the city and some, but not all, of the stops.
  expect(
    states.some(
      (text) =>
        text.includes('in-progress') &&
        text.includes('Trip to Vienna') &&
        text.includes('Schönbrunn') &&
        !text.includes('Naschmarkt'),
    ),
  ).toBe(true);
});

test('open generative UI: runs the page the model wrote in a sandboxed iframe', async ({
  page,
}) => {
  await send(page, 'Build a tip calculator');

  // CopilotKit renders the generated HTML, CSS and JavaScript with JetBrains websandbox.
  const sandbox = page.frameLocator('iframe');
  await expect(sandbox.getByRole('heading')).toHaveText('Tip calculator');
  // The generated script ran, and it reacts to input.
  await expect(sandbox.locator('#total')).toHaveText('Total: 46.00');
  await sandbox.locator('#bill').fill('100');
  await expect(sandbox.locator('#total')).toHaveText('Total: 115.00');
  await expect(page.getByText('The tool answered: UI generated')).toBeVisible();
});

test('shows which models are on this device', async ({ page }) => {
  await page.getByText('Models on this device').click();

  await expect(page.locator('tr[data-model="demo"]')).toContainText('Ready');
  await expect(page.getByTestId('storage')).toContainText(
    'Browser storage used by this site',
  );
});

test('uses a WebMCP page tool', async ({ page }) => {
  await send(page, 'What is the page title?');
  await expect(
    page.getByText(/The tool answered: .*browser-models/),
  ).toBeVisible();
});

test('shows model loading progress in the chat', async ({ page }) => {
  await send(page, 'Hello');
  await expect(page.getByText('Demo engine is ready')).toBeVisible();
});

async function send(page: Page, text: string): Promise<void> {
  const input = page.getByRole('textbox');
  await input.fill(text);
  await input.press('Enter');
}

/**
 * Records every text the elements matching `selector` show from now on. A state that lasts
 * only a few frames (a tool call that is still streaming) is easy to miss by polling.
 */
async function watch(page: Page, selector: string): Promise<string[]> {
  const seen: string[] = [];
  await page.exposeFunction('seen', (text: string) => seen.push(text));
  await page.evaluate((selector) => {
    const report = (window as unknown as { seen(text: string): void }).seen;
    new MutationObserver(() => {
      for (const element of document.querySelectorAll(selector)) {
        report(element.textContent ?? '');
      }
    }).observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  }, selector);
  return seen;
}

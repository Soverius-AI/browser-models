import { expect, test, type Page } from '@playwright/test';

// Engine only (no AG-UI), with the scripted demo engine.
test.beforeEach(async ({ page }) => {
  await page.goto('/?model=demo');
  await expect(page.getByTestId('model')).toContainText('demo · available');
});

test('says whether the browser has the Prompt API', async ({ page }) => {
  // Depends on the browser: Playwright's Chromium may offer Gemini Nano for download.
  await expect(page.locator('#prompt-api')).toHaveText(
    /^Prompt API: (not in this browser, so Gemma on WebLLM is used|(available|downloadable|downloading), so Gemini Nano is used)\.$/,
  );
});

test('streams a reply and shows how it ended', async ({ page }) => {
  await send(page, 'Hello');
  await expect(line(page, 'assistant')).toHaveText('You said: Hello');
  await expect(line(page, 'finish')).toHaveText(
    /^done · \d+ tokens in the context$/,
  );
});

test('shows thinking apart from the answer', async ({ page }) => {
  await send(page, 'think about it');
  await expect(line(page, 'thinking')).toContainText(
    'The user wants to see thinking.',
  );
  await expect(line(page, 'assistant')).toHaveText(
    'This is the answer, after the thinking.',
  );
});

test('keeps the conversation for the next message', async ({ page }) => {
  await send(page, 'Hello');
  await expect(line(page, 'assistant')).toHaveText('You said: Hello');
  await send(page, 'Again');
  await expect(page.locator('li[data-role="assistant"]')).toHaveText([
    'You said: Hello',
    'You said: Again',
  ]);
});

function line(page: Page, role: string) {
  return page.locator(`li[data-role="${role}"]`).last();
}

async function send(page: Page, text: string): Promise<void> {
  await page.locator('#input').fill(text);
  await page.locator('#input').press('Enter');
}

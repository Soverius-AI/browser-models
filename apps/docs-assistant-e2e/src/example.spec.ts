import { expect, test } from '@playwright/test';

// The docs assistant with the scripted demo engine.
test.beforeEach(async ({ page }) => {
  await page.goto('/?model=demo');
  await expect(page.getByTestId('model')).toContainText('demo · available');
});

test('searches the docs with a tool, answers, and shows the page', async ({
  page,
}) => {
  await page.getByRole('textbox').fill('how do I check the Prompt API');
  await page.getByRole('textbox').press('Enter');

  await expect(page.getByTestId('docs-search')).toContainText(
    'Searched the docs for “check the Prompt API”',
  );
  await expect(page.getByText(/The docs explain it in/)).toBeVisible();
  const card = page.getByTestId('docs-page');
  // The best section for the question: one of the engine pages.
  await expect(card).toContainText(/\/docs\/engines/);
});

test('opens the page in the docs site when it runs in its panel', async ({
  page,
}) => {
  await page.goto('/?model=demo&embedded');
  await expect(page.getByTestId('model')).toContainText('demo · available');
  // In the panel, the docs site gets the url; here the test plays the docs site.
  await page.evaluate(() => {
    Object.defineProperty(window, 'parent', {
      value: {
        postMessage: (data: unknown) =>
          ((window as unknown as { posted: unknown }).posted = data),
      },
    });
  });
  await page.getByRole('textbox').fill('search the docs for compaction');
  await page.getByRole('textbox').press('Enter');
  await page
    .getByTestId('docs-page')
    .getByRole('button', { name: 'Open' })
    .click();

  expect(
    await page.evaluate(
      () => (window as unknown as { posted: unknown }).posted,
    ),
  ).toMatchObject({
    source: 'docs-assistant',
    url: expect.stringMatching(/^\/docs\//),
  });
});

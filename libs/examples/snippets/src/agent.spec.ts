// Runs the snippet as written; testing/setup.ts stands in for the browser's model.
import './agent';

it('runs the agent and streams its text events into the page', () => {
  expect(document.body.textContent).toContain(
    'A model in your browser answered.',
  );
});

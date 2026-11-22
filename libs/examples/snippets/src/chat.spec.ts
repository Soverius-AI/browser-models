// Runs the snippet as written; testing/setup.ts stands in for the browser's model.
import './chat';

it('streams the answer into the page', () => {
  expect(document.body.textContent).toContain(
    'A model in your browser answered.',
  );
});

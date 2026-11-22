// Runs the snippet as written; testing/setup.ts stands in for the browser's model.
import './tools';

it('calls the local tool and answers from its result', () => {
  expect(document.body.textContent).toMatch(
    /^\[currentTime\] The tool answered: \d/,
  );
});

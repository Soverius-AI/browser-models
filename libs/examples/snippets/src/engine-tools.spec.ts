// Runs the snippet as written; testing/setup.ts stands in for the browser's model.
import './engine-tools';

it('calls the local tool without the agent and answers from its result', () => {
  expect(document.body.textContent).toMatch(
    /^\[currentTime\] The tool answered: \d/,
  );
});

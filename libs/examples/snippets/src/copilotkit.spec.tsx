import { fireEvent, screen, waitFor } from '@testing-library/react';
// Runs the snippet as written; testing/setup.ts stands in for the browser's model.
import './copilotkit';

it('runs a frontend tool from the CopilotKit chat', async () => {
  const input = await screen.findByRole('textbox');
  fireEvent.change(input, { target: { value: 'Make the background blue' } });
  fireEvent.keyDown(input, { key: 'Enter' });

  await waitFor(() => expect(document.body.style.background).toBe('lightblue'));
  await screen.findByText(/The tool answered: The background is lightblue/);
});

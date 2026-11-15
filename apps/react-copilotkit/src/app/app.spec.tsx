import { render, screen } from '@testing-library/react';
import { App } from './app';

describe('App', () => {
  it('shows the model picker with every example model', async () => {
    render(<App />);

    expect(
      screen.getByRole('heading', { name: 'browser-models' }),
    ).toBeTruthy();
    expect(
      screen.getByRole('option', { name: 'Demo · scripted, no model' }),
    ).toBeTruthy();
  });
});

import { StrictMode } from 'react';
import * as ReactDOM from 'react-dom/client';
import '@copilotkit/react-core/v2/styles.css';
import './styles.css';
import App from './app/app';
import { registerPageTools } from '@soverius-ai/example-shared';

void registerPageTools();

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement,
);

root.render(
  <StrictMode>
    <App />
  </StrictMode>,
);

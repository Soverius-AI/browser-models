import { StrictMode } from 'react';
import * as ReactDOM from 'react-dom/client';
import '@copilotkit/react-core/v2/styles.css';
import './styles.css';
import { App } from './app/app';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

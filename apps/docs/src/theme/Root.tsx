import { useHistory } from '@docusaurus/router';
import { useEffect, useState, type ReactNode } from 'react';

/**
 * Wraps every page: adds "Ask the docs", the docs assistant example (apps/docs-assistant) in a
 * side panel. The panel is created on the first click, so no model loads before.
 */
export default function Root({ children }: { children: ReactNode }) {
  const history = useHistory();
  const [open, setOpen] = useState(false);
  const [created, setCreated] = useState(false);

  // "Open" in the assistant: it posts the page's path, this site navigates to it.
  useEffect(() => {
    const navigate = ({ origin, data }: MessageEvent) => {
      if (origin !== window.location.origin) return;
      const message = data as { source?: unknown; url?: unknown } | null;
      if (
        message?.source === 'docs-assistant' &&
        typeof message.url === 'string' &&
        message.url.startsWith('/')
      )
        history.push(message.url);
    };
    window.addEventListener('message', navigate);
    return () => window.removeEventListener('message', navigate);
  }, [history]);

  return (
    <>
      {children}
      <button
        type="button"
        className="docs-assistant__toggle button button--primary"
        aria-expanded={open}
        aria-controls="docs-assistant"
        onClick={() => {
          setCreated(true);
          setOpen(!open);
        }}
      >
        {open ? 'Close' : 'Ask the docs'}
      </button>
      {created && (
        <aside
          id="docs-assistant"
          className="docs-assistant"
          hidden={!open}
          aria-label="Docs assistant"
        >
          <iframe title="Docs assistant" src="/examples/assistant/?embedded" />
        </aside>
      )}
    </>
  );
}

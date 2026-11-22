import { ScriptedLanguageModel } from './scripted-language-model.ts';

// Runs before every spec: the browser APIs the snippets use and jsdom lacks.
vi.stubGlobal('LanguageModel', new ScriptedLanguageModel());
// CopilotKit's chat uses a ResizeObserver to stick to the bottom.
vi.stubGlobal(
  'ResizeObserver',
  class {
    readonly observe = () => undefined;
    readonly unobserve = () => undefined;
    readonly disconnect = () => undefined;
  },
);

const root = document.createElement('div');
root.id = 'root';
document.body.append(root);

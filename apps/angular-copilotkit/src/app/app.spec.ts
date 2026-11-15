import { TestBed } from '@angular/core/testing';
import { provideCopilotKit } from '@copilotkit/angular';
import {
  provideBrowserModels,
  withAgent,
} from '@soverius-ai/browser-models-angular';
import type { Engine } from '@soverius-ai/browser-models';
import { BrowserModelsAgent } from '@soverius-ai/browser-models/agent';
import { App } from './app';

const unavailable: Engine = {
  id: 'prompt-api',
  supportsConstraint: false,
  availability: async () => 'unavailable',
  load: async () => undefined,
  unload: async () => undefined,
  async *generate() {
    yield '';
  },
};

describe('App', () => {
  it('explains when the selected model cannot run here', async () => {
    const agent = new BrowserModelsAgent({
      models: { nano: unavailable },
      defaultModel: 'nano',
    });
    TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideBrowserModels(withAgent(agent)),
        provideCopilotKit({ agents: { default: agent } }),
      ],
    });

    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    fixture.detectChanges();
    const page = fixture.nativeElement as HTMLElement;

    expect(page.querySelector('[data-testid="model"]')?.textContent).toContain(
      'prompt-api · unavailable',
    );
    expect(page.textContent).toContain('This model cannot run in this browser');
    expect(page.querySelector('copilot-chat')).toBeNull();
  });
});

import type { WritableSignal } from '@angular/core';
import { registerComponent, registerFrontendTool } from '@copilotkit/angular';
import { z } from 'zod';
import { IncidentCardComponent } from './incident-card.component';
import { createBackgroundTool } from './tool-feature-model';
import { WeatherCardComponent } from './weather-card.component';

/**
 * Registers the CopilotKit docs examples, unchanged except where marked. Call it in an
 * injection context, for example a component constructor.
 */
export function registerDocsExamples(background: WritableSignal<string>): void {
  // Generative UI: the agent shows a component.
  registerComponent({
    name: 'show_incident',
    description: 'Show one incident from the incident table.',
    parameters: z.object({
      id: z.string().describe('The incident id, such as INC-4711'),
      severity: z.string().describe('One of sev1, sev2, sev3'),
    }),
    component: IncidentCardComponent,
  });

  // A browser tool that changes the page.
  registerFrontendTool(createBackgroundTool(background));

  // A browser tool whose result is rendered by a component.
  registerFrontendTool({
    name: 'getWeather',
    description: 'Get the current weather for a city',
    parameters: z.object({ city: z.string() }),
    component: WeatherCardComponent,
    // The docs fetch `/api/weather`. This example has no backend, so it answers locally.
    handler: async ({ city }) => `Sunny and 21 °C in ${city}`,
  });
}

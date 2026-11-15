import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import { registerPageTools } from '@soverius-ai/example-shared';

void registerPageTools();
bootstrapApplication(App, appConfig).catch((err) => console.error(err));

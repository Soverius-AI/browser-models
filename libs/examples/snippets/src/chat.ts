import { PromptApiEngine } from '@soverius-ai/browser-models/prompt-api';

// Layer 1: an engine. The model built into the browser: Gemini Nano in Chrome.
const engine = new PromptApiEngine();
const output = document.body.appendChild(document.createElement('p'));

if ((await engine.availability()) === 'unavailable') {
  output.textContent = 'This browser has no Prompt API.';
} else {
  for await (const part of engine.generate({
    messages: [{ role: 'user', content: 'Write a haiku about the browser.' }],
  }))
    if (part.type === 'text') output.append(part.text);
}

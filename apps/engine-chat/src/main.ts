import { statusBadge } from '@soverius-ai/example-shared';
import { Conversation } from './app/conversation';
import {
  labels,
  models,
  pickEngine,
  store,
  type EngineId,
} from './app/engines';

const $ = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const picker = $<HTMLSelectElement>('model');
const status = $('status');
const promptApi = $('prompt-api');
const download = $<HTMLButtonElement>('download');
const progress = $<HTMLProgressElement>('progress');
const messages = $('messages');
const form = $<HTMLFormElement>('chat');
const input = $<HTMLInputElement>('input');
const stop = $<HTMLButtonElement>('stop');

const conversation = new Conversation();

// Engine picker and download, from the model store.
for (const id of models.modelIds) picker.add(new Option(labels[id], id));
picker.onchange = () => void store.selectModel(picker.value as EngineId);
download.onclick = () => void store.download();

function renderEngine(): void {
  const state = store.getState();
  picker.value = state.selectedModel;
  status.textContent = `${models.engine().id} · ${state.availability}`;
  status.className = `badge badge-soft ${statusBadge(state.availability)}`;
  download.hidden = state.availability !== 'downloadable';
  progress.hidden = state.availability !== 'downloading';
  progress.value = state.progress ?? 0;
  form.hidden = state.availability !== 'available';
}
store.subscribe(renderEngine);
renderEngine();

void pickEngine().then((nano) => {
  promptApi.textContent =
    nano === 'unavailable'
      ? 'Prompt API: not in this browser, so Gemma on WebLLM is used.'
      : `Prompt API: ${nano}, so Gemini Nano is used.`;
});

/** One line of the chat. Returns the element that holds its text. */
function line(role: string, text = ''): HTMLElement {
  const item = document.createElement('li');
  const body = document.createElement('div');
  item.dataset['role'] = role;
  item.className = role === 'user' ? 'chat chat-end' : 'chat chat-start';
  body.className =
    role === 'user'
      ? 'chat-bubble chat-bubble-primary'
      : role === 'assistant'
        ? 'chat-bubble'
        : 'text-xs opacity-60';
  body.textContent = text;
  item.append(body);
  messages.append(item);
  messages.scrollTop = messages.scrollHeight;
  return body;
}

form.onsubmit = async (event) => {
  event.preventDefault();
  const text = input.value.trim();
  if (!text || conversation.replying) return;
  input.value = '';
  line('user', text);
  let thinking: HTMLElement | undefined;
  let answer: HTMLElement | undefined;
  stop.hidden = false;
  try {
    await conversation.send(models.engine(), text, {
      thinking: (delta) => (thinking ??= line('thinking')).append(delta),
      text: (delta) => (answer ??= line('assistant')).append(delta),
      finished: (reason, usage) =>
        void line(
          'finish',
          `${reason === 'length' ? 'cut at maxOutputTokens' : 'done'}${usage ? ` · ${usage.totalTokens} tokens in the context` : ''}`,
        ),
    });
  } catch (error) {
    line('error', error instanceof Error ? error.message : String(error));
  } finally {
    stop.hidden = true;
  }
};
stop.onclick = () => conversation.stop();

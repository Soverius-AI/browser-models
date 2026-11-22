import type { AgentSubscriber } from '@ag-ui/client';
import { AgentEvents } from '@soverius-ai/browser-models-agui';
import {
  devtoolsFromUrl,
  modelActivityView,
  modelLabel,
  registerPageTools,
  statusBadge,
  type ModelActivity,
} from '@soverius-ai/example-shared';
import { agent, context7, models } from './app/agent';
import { send } from './app/chat';

const $ = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const picker = $<HTMLSelectElement>('model');
const status = $('status');
const download = $<HTMLButtonElement>('download');
const progress = $<HTMLProgressElement>('progress');
const messages = $('messages');
const form = $<HTMLFormElement>('chat');
const input = $<HTMLInputElement>('input');

const context7Toggle = $<HTMLInputElement>('context7');
const context7Key = $<HTMLInputElement>('context7-key');

void registerPageTools();
if (import.meta.env.DEV || devtoolsFromUrl()) agent.connectDevtools();

// Model picker and download, from the model store.
for (const id of models.modelIds) picker.add(new Option(modelLabel(id), id));
picker.onchange = () => void models.selectModel(picker.value);
download.onclick = () => void models.download();

function renderModel(): void {
  const state = models.getState();
  picker.value = state.selectedModel;
  status.textContent = `${models.agent.engine(state.selectedModel).id} · ${state.availability}`;
  status.className = `badge badge-soft ${statusBadge(state.availability)}`;
  download.hidden = state.availability !== 'downloadable';
  progress.hidden = state.availability !== 'downloading';
  progress.value = state.progress ?? 0;
  form.hidden = state.availability !== 'available';
}
models.subscribe(renderModel);
renderModel();

// Context7: nothing is sent to it until the toggle is on.
context7Key.value = context7.apiKey;
context7Key.oninput = () => void (context7.apiKey = context7Key.value);
context7Toggle.checked = context7.enabled;
context7Toggle.onchange = () =>
  void (context7.enabled = context7Toggle.checked);

/** daisyUI classes per line: chat bubbles for messages, small notes for the rest. */
const styles: Record<string, [item: string, body: string]> = {
  user: ['chat chat-end', 'chat-bubble chat-bubble-primary'],
  assistant: ['chat chat-start', 'chat-bubble'],
  error: ['', 'alert alert-error alert-soft text-sm'],
};

/** Shows AG-UI events as they arrive. Returns the element that holds the text. */
function line(role: string, text = ''): HTMLElement {
  const [itemClass, bodyClass] = styles[role] ?? [
    '',
    'text-center text-xs opacity-60',
  ];
  const item = document.createElement('li');
  const body = document.createElement('div');
  item.dataset['role'] = role;
  item.className = itemClass;
  body.className = bodyClass;
  body.textContent = text;
  item.append(body);
  messages.append(item);
  messages.scrollTop = messages.scrollHeight;
  return body;
}

/** Model loading: one card per activity, updated in place as the model loads. */
const cards = new Map<string, HTMLElement>();
const check =
  '<svg viewBox="0 0 24 24" class="size-5" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>';

function showActivity(id: string, activity: ModelActivity): void {
  let card = cards.get(id);
  if (!card) {
    card = line('activity');
    card.className =
      'model-activity my-2 flex w-full max-w-sm items-center gap-3 rounded-box border border-base-300 bg-base-100 p-3 shadow-sm';
    card.innerHTML = `<span class="radial-progress shrink-0 text-[0.65rem] font-semibold text-primary" style="--size: 2.75rem; --thickness: 3px" role="progressbar"></span>
      <span class="hidden size-11 shrink-0 place-items-center rounded-full bg-success/15 text-success">${check}</span>
      <span class="min-w-0"><span class="block truncate text-sm font-medium"></span><span class="block text-xs opacity-60"></span></span>`;
    cards.set(id, card);
  }
  const view = modelActivityView(activity);
  const [ring, done, text] = card.children as unknown as HTMLElement[];
  ring?.classList.toggle('hidden', view.ready);
  ring?.style.setProperty('--value', String(view.percent));
  ring?.setAttribute('aria-valuenow', String(view.percent));
  if (ring) ring.textContent = `${view.percent}%`;
  done?.classList.toggle('hidden', !view.ready);
  done?.classList.toggle('grid', view.ready);
  const [title, detail] = (text?.children ?? []) as unknown as HTMLElement[];
  if (title) title.textContent = view.title;
  if (detail) detail.textContent = view.detail;
}

let current: HTMLElement | undefined;
const subscriber: AgentSubscriber = {
  onTextMessageStartEvent: () => void (current = line('assistant')),
  onTextMessageContentEvent: ({ event }) => void current?.append(event.delta),
  onToolCallStartEvent: ({ event }) =>
    void line('tool', `→ ${event.toolCallName}`),
  onActivitySnapshotEvent: ({ event }) => {
    const activity = AgentEvents.modelActivity(event);
    if (activity) showActivity(event.messageId, activity);
  },
  onRunErrorEvent: ({ event }) => void line('error', event.message),
};

form.onsubmit = async (event) => {
  event.preventDefault();
  const text = input.value.trim();
  if (!text) return;
  input.value = '';
  line('user', text);
  await send(text, subscriber);
};

import type { AgentSubscriber } from '@ag-ui/client';
import { AgentEvents } from '@soverius-ai/browser-models-agui';
import {
  devtoolsFromUrl,
  modelActivityView,
  statusBadge,
} from '@soverius-ai/example-shared';
import { agent, labels, pickModel, store } from './app/agent';

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

if (import.meta.env.DEV || devtoolsFromUrl()) agent.connectDevtools();

// Model picker and download, from the model store.
for (const id of store.modelIds)
  picker.add(new Option(labels[id as keyof typeof labels], id));
picker.onchange = () => void store.selectModel(picker.value);
download.onclick = () => void store.download();

function renderModel(): void {
  const state = store.getState();
  picker.value = state.selectedModel;
  status.textContent = `${agent.engine().id} · ${state.availability}`;
  status.className = `badge badge-soft ${statusBadge(state.availability)}`;
  download.hidden = state.availability !== 'downloadable';
  progress.hidden = state.availability !== 'downloading';
  progress.value = state.progress ?? 0;
  form.hidden = state.availability !== 'available';
}
store.subscribe(renderModel);
renderModel();

void pickModel().then((nano) => {
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

// The agent's AG-UI events, as they arrive. AgentEvents reads the agent's own ones, typed.
let answer: HTMLElement | undefined;
let thinking: HTMLElement | undefined;
let loading: HTMLElement | undefined;
const subscriber: AgentSubscriber = {
  onRunStartedEvent: () => void (answer = thinking = undefined),
  onReasoningMessageContentEvent: ({ event }) =>
    void (thinking ??= line('thinking')).append(event.delta),
  onTextMessageContentEvent: ({ event }) =>
    void (answer ??= line('assistant')).append(event.delta),
  onActivitySnapshotEvent: ({ event }) => {
    const activity = AgentEvents.modelActivity(event);
    if (!activity) return;
    const view = modelActivityView(activity);
    (loading ??= line('activity')).textContent =
      `${view.title} · ${view.detail}`;
  },
  onCustomEvent: ({ event }) => {
    const compaction = AgentEvents.compaction(event);
    if (compaction?.status === 'summarizing')
      line('compaction', 'Summarizing the older turns…');
    if (compaction?.status === 'done')
      line(
        'compaction',
        `Compacted: ${compaction.tokensBefore} → ${compaction.tokensAfter} tokens of ${compaction.contextWindowSize}`,
      );
  },
  onRunErrorEvent: ({ event }) =>
    void line('error', event.code === 'abort' ? 'Stopped.' : event.message),
};

form.onsubmit = async (event) => {
  event.preventDefault();
  const text = input.value.trim();
  if (!text || agent.isRunning) return;
  input.value = '';
  line('user', text);
  agent.addMessage({ id: crypto.randomUUID(), role: 'user', content: text });
  stop.hidden = false;
  // A stopped run rejects; the error event above has shown it already.
  await agent.runAgent({}, subscriber).catch(() => undefined);
  stop.hidden = true;
};
stop.onclick = () => agent.abortRun();

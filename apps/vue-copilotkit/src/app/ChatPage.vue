<script setup lang="ts">
import { CopilotChat } from '@copilotkit/vue/v2';
import { useDevtools, useModelStore } from '@soverius-ai/browser-models-vue';
import { modelLabel, statusBadge } from '@soverius-ai/example-shared';
import { agent, context7, models } from './agent';
import TodoManager from './copilotkit-docs/TodoManager.vue';
import WeatherTool from './copilotkit-docs/WeatherTool.vue';
import ModelsPanel from './ModelsPanel.vue';
import TripPlan from './TripPlan.vue';

const state = useModelStore(models);
const baseUrl = import.meta.env.BASE_URL;
useDevtools(agent, import.meta.env.DEV);

function onModelChange(event: Event): void {
  void models.selectModel((event.target as HTMLSelectElement).value);
}
</script>

<template>
  <main class="flex h-full flex-col">
    <header class="border-b border-base-300 bg-base-100">
      <nav class="navbar min-h-14 flex-wrap gap-2 px-4">
        <a
          class="flex items-center gap-2 font-semibold"
          href="https://soverius.ai"
          target="_blank"
        >
          <img
            :src="`${baseUrl}favicon.svg`"
            alt="Soverius AI"
            class="size-7"
          />
          <h1 class="text-base font-semibold">browser-models</h1>
        </a>
        <span class="badge badge-soft badge-primary">Vue</span>
        <span v-if="context7.enabled" class="badge badge-soft badge-accent">
          MCP · Context7
        </span>

        <div class="ml-auto flex flex-wrap items-center gap-2">
          <select
            class="select select-sm w-72"
            aria-label="Model"
            :value="state.selectedModel"
            @change="onModelChange"
          >
            <option v-for="id in models.modelIds" :key="id" :value="id">
              {{ modelLabel(id) }}
            </option>
          </select>

          <span
            data-testid="model"
            class="badge badge-soft"
            :class="statusBadge(state.availability)"
          >
            {{ models.agent.engine(state.selectedModel).id }} ·
            {{ state.availability }}
          </span>

          <button
            v-if="state.availability === 'downloadable'"
            type="button"
            class="btn btn-primary btn-sm"
            @click="models.download()"
          >
            Download the model
          </button>
          <progress
            v-else-if="state.availability === 'downloading'"
            class="progress progress-primary w-28"
            :value="state.progress ?? 0"
          ></progress>
        </div>
      </nav>

      <div class="flex flex-col gap-2 px-4 pb-3">
        <p
          v-if="state.availability === 'unavailable'"
          role="alert"
          class="alert alert-warning alert-soft py-2 text-sm"
        >
          This model cannot run in this browser (no Prompt API or no WebGPU).
          Pick another one.
        </p>
        <p
          v-if="state.error"
          role="alert"
          class="alert alert-error alert-soft py-2 text-sm"
        >
          {{ state.error }}
        </p>
        <ModelsPanel />
        <TodoManager />
        <WeatherTool />
        <TripPlan />
      </div>
    </header>

    <div v-if="state.availability === 'available'" class="min-h-0 flex-1">
      <CopilotChat />
    </div>
  </main>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import {
  modelActivityView,
  type ModelActivity,
} from '@soverius-ai/example-shared';

// Shows the agent's model loading progress (`soverius.model` activity) in the chat.
const props = defineProps<{ content: ModelActivity }>();
const view = computed(() => modelActivityView(props.content));
</script>

<template>
  <div
    class="model-activity my-2 flex w-full max-w-sm items-center gap-3 rounded-box border border-base-300 bg-base-100 p-3 shadow-sm"
  >
    <span
      v-if="view.ready"
      class="grid size-11 shrink-0 place-items-center rounded-full bg-success/15 text-success"
    >
      <svg
        viewBox="0 0 24 24"
        class="size-5"
        fill="none"
        stroke="currentColor"
        stroke-width="2.5"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="M5 12.5l4.5 4.5L19 7.5" />
      </svg>
    </span>
    <span
      v-else
      class="radial-progress shrink-0 text-[0.65rem] font-semibold text-primary"
      :style="{
        '--value': view.percent,
        '--size': '2.75rem',
        '--thickness': '3px',
      }"
      role="progressbar"
      :aria-valuenow="view.percent"
    >
      {{ view.percent }}%
    </span>
    <span class="min-w-0">
      <span class="block truncate text-sm font-medium">{{ view.title }}</span>
      <span class="block text-xs opacity-60">{{ view.detail }}</span>
    </span>
  </div>
</template>

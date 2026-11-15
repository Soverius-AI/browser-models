<script setup lang="ts">
import { useModelStore } from '@soverius-ai/browser-models-vue';
import {
  gigabytes,
  modelLabel,
  statusBadge,
  statusText,
} from '@soverius-ai/example-shared';
import { models } from './agent';

const state = useModelStore(models);

function onToggle(event: Event): void {
  // Checking every model loads the WebLLM and transformers.js libraries, so only do it on open.
  if ((event.target as HTMLDetailsElement).open) void models.refreshModels();
}
</script>

<template>
  <details
    class="collapse-arrow collapse border border-base-300 bg-base-200"
    @toggle="onToggle"
  >
    <summary class="collapse-title min-h-0 py-2 text-sm font-medium">
      Models on this device
    </summary>
    <div class="collapse-content text-sm">
      <table class="table table-sm">
        <tbody>
          <tr
            v-for="model in state.models"
            :key="model.id"
            :data-model="model.id"
          >
            <td>{{ modelLabel(model.id) }}</td>
            <td>
              <span
                class="badge badge-soft badge-sm"
                :class="statusBadge(model.availability)"
              >
                {{ statusText(model.availability, model.canDelete) }}
              </span>
            </td>
            <td class="text-right">
              <button
                v-if="model.canDelete && model.availability === 'available'"
                type="button"
                class="btn btn-ghost btn-xs text-error"
                @click="models.deleteModel(model.id)"
              >
                Delete
              </button>
            </td>
          </tr>
        </tbody>
      </table>
      <p v-if="state.storage" data-testid="storage" class="mt-2 opacity-70">
        Browser storage used by this site:
        {{ gigabytes(state.storage.usage) }} of
        {{ gigabytes(state.storage.quota) }}
      </p>
    </div>
  </details>
</template>

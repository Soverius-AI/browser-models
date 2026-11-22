<script setup lang="ts">
import { CopilotKitProvider } from '@copilotkit/vue/v2';
import { agent } from './agent';
import ChatPage from './ChatPage.vue';
import ModelActivity from './ModelActivity.vue';
import { MODEL_ACTIVITY } from '@soverius-ai/browser-models-agui';
import {
  modelActivitySchema,
  sandboxDesignSkill,
} from '@soverius-ai/example-shared';
import type { VueActivityMessageRenderer } from '@copilotkit/vue/v2';
import type { Component } from 'vue';

// `agents__unsafe_dev_only` is CopilotKit Vue's prop for agents that run in the page.
// (`selfManagedAgents` does the same but logs a license warning.)
const agents = { default: agent };
// `openGenerativeUI` registers the `generateSandboxedUi` tool and the sandbox renderer (JetBrains
// websandbox). Passed with v-bind, because Vue reads `open-generative-ui` as `openGenerativeUi`.
const sandbox = { openGenerativeUI: { designSkill: sandboxDesignSkill } };
const activityRenderers = [
  {
    activityType: MODEL_ACTIVITY,
    // CopilotKit Vue 1.88 types `content` with its own zod 3 copy; the workspace uses zod 4.
    // CopilotKit only calls `safeParse`, which the zod 4 schema has, so the cast is safe.
    content:
      modelActivitySchema as unknown as VueActivityMessageRenderer<unknown>['content'],
    render: ModelActivity as Component,
  },
];
</script>

<template>
  <CopilotKitProvider
    :agents__unsafe_dev_only="agents"
    v-bind="sandbox"
    :render-activity-messages="activityRenderers"
  >
    <ChatPage />
  </CopilotKitProvider>
</template>

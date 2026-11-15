<!-- From the CopilotKit Vue docs, useFrontendTool, "Tool with a custom Vue renderer":
     https://docs.copilotkit.ai/reference/vue/hooks/useFrontendTool -->
<script setup lang="ts">
import { ToolCallStatus } from "@copilotkit/core";

defineProps<{
  name: string;
  toolCallId: string;
  args: { city?: string; units?: "celsius" | "fahrenheit" };
  status: ToolCallStatus;
  result?: string;
}>();
</script>

<template>
  <div v-if="status === ToolCallStatus.InProgress" class="animate-pulse">
    Fetching weather for {{ args.city }}...
  </div>
  <div v-else-if="status === ToolCallStatus.Complete && result" class="rounded border p-4">
    <h3>{{ JSON.parse(result).city }}</h3>
    <p>{{ JSON.parse(result).temperature }}&deg; {{ JSON.parse(result).units }}</p>
    <p>{{ JSON.parse(result).conditions }}</p>
  </div>
</template>

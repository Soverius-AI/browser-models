<!-- From the CopilotKit Vue docs, useFrontendTool, "Basic tool with a Zod schema and async handler":
     https://docs.copilotkit.ai/reference/vue/hooks/useFrontendTool -->
<script setup lang="ts">
import { ref } from "vue";
import { z } from "zod";
import { useFrontendTool } from "@copilotkit/vue/v2";

const todos = ref<string[]>([]);

useFrontendTool({
  name: "addTodo",
  description: "Add a new item to the user's todo list",
  parameters: z.object({
    text: z.string().describe("The todo item text"),
    priority: z.enum(["low", "medium", "high"]).describe("Priority level"),
  }),
  handler: async ({ text, priority }) => {
    todos.value.push(text);
    return `Added "${text}" with ${priority} priority`;
  },
});
</script>

<template>
  <ul>
    <li v-for="(todo, i) in todos" :key="i">{{ todo }}</li>
  </ul>
</template>

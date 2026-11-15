<!-- The script of the docs' App.vue for the weather tool (same page as WeatherToolView.vue).
     Two changes, both marked: the docs fetch `/api/weather` (this example has no backend), and
     `render` needs a cast because the docs component does not match CopilotKit 1.88's typings. -->
<script setup lang="ts">
import type { Component } from "vue";
import { z } from "zod";
import { useFrontendTool } from "@copilotkit/vue/v2";
import WeatherToolView from "./WeatherToolView.vue";

useFrontendTool({
  name: "getWeather",
  description: "Fetch and display weather information for a city",
  parameters: z.object({
    city: z.string().describe("City name"),
    units: z.enum(["celsius", "fahrenheit"]).default("celsius"),
  }),
  handler: async ({ city, units }) => {
    return JSON.stringify({ city, temperature: 21, units, conditions: "Sunny" });
  },
  // The docs component takes optional `args` for every state; the typings require them for the
  // completed state. It works at runtime (see the e2e test), so only the type is widened here.
  render: WeatherToolView as Component,
});
</script>

<template>
  <span hidden></span>
</template>

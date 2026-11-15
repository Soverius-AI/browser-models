<script setup lang="ts">
import { useFrontendTool } from '@copilotkit/vue/v2';
import type { Component } from 'vue';
import { z } from 'zod';
import TripPlanCard from './TripPlanCard.vue';

// The card is rendered again for every arguments delta, so it grows while the model is still
// writing the call.
useFrontendTool({
  name: 'planTrip',
  description: 'Show a trip plan for a city',
  parameters: z.object({ city: z.string(), stops: z.array(z.string()) }),
  handler: async ({ city, stops }) =>
    `Planned ${stops.length} stops in ${city}`,
  // The card takes partial `args` in every state; CopilotKit's typings want them complete once
  // the call is executing, so the type is widened.
  render: TripPlanCard as Component,
});
</script>

<template>
  <span hidden></span>
</template>

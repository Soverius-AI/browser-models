<script setup lang="ts">
import { ToolCallStatus } from '@copilotkit/core';

// `args` holds the arguments so far while `status` is "inProgress".
defineProps<{
  args: { city?: string; stops?: string[] };
  status: ToolCallStatus;
}>();
</script>

<template>
  <div
    data-testid="trip"
    :data-status="status"
    class="card card-border my-2 w-80 bg-base-100 shadow-sm"
  >
    <div class="card-body p-4">
      <h3 class="card-title text-base">
        Trip to {{ args.city ?? '…' }}
        <span
          class="badge badge-soft badge-sm"
          :class="
            status === ToolCallStatus.Complete
              ? 'badge-success'
              : 'badge-warning'
          "
        >
          {{ status }}
        </span>
      </h3>
      <ol class="list-decimal pl-5 text-sm">
        <li v-for="(stop, index) in args.stops ?? []" :key="index">
          {{ stop }}
        </li>
      </ol>
    </div>
  </div>
</template>

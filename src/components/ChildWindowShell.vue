<script setup lang="ts">
import { computed } from 'vue'
import { isMacLike } from '../lib/window'

defineProps<{
  title: string
  description?: string
}>()

const panelClass = computed(() => isMacLike
  ? 'rounded-none border-0 shadow-none'
  : 'm-2 rounded-[24px] border border-white/10 shadow-[0_20px_60px_rgba(0,0,0,0.22)]')
const bodyClass = computed(() => isMacLike ? 'pt-10' : 'pt-4')
</script>

<template>
  <div class="h-full w-full overflow-hidden bg-transparent text-app-text">
    <div class="glass-shell flex h-full flex-col overflow-hidden" :class="panelClass">
      <div class="px-6 pb-6" :class="bodyClass">
        <div class="mb-6">
          <h1 class="text-xl font-semibold text-white/94">{{ title }}</h1>
          <p v-if="description" class="mt-2 text-sm text-white/46">{{ description }}</p>
        </div>

        <slot />
      </div>
    </div>
  </div>
</template>

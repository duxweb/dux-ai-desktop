<script setup lang="ts">
import { IconX } from '@tabler/icons-vue'
import { computed } from 'vue'
import { closeWindow, isMacLike } from '../lib/window'

defineProps<{
  title: string
  description?: string
}>()

const panelClass = computed(() => isMacLike
  ? 'glass-shell rounded-none border-0 shadow-none'
  : 'windows-native-shell m-0 rounded-none border-0 shadow-none')
</script>

<template>
  <div class="h-full w-full overflow-hidden bg-transparent text-app-text">
    <div class="relative flex h-full flex-col overflow-hidden" :class="panelClass">
      <div v-if="!isMacLike" class="absolute right-3 top-3 z-20 no-drag">
        <button
          type="button"
          class="window-win-button window-win-close no-drag flex size-[32px] items-center justify-center rounded-full"
          aria-label="关闭窗口"
          @mousedown.stop.prevent
          @click="closeWindow"
        >
          <IconX class="h-4 w-4" stroke="2" />
        </button>
      </div>
      <div
        class="shrink-0 border-b border-app px-6 pb-6"
        :class="isMacLike ? 'pt-9' : 'pt-6'"
        data-tauri-drag-region
      >
        <h1 class="text-app text-xl font-semibold">{{ title }}</h1>
        <p v-if="description" class="text-app-muted mt-1 text-sm">{{ description }}</p>
      </div>
      <div class="no-drag min-h-0 flex-1 overflow-auto" :class="isMacLike ? 'p-4' : 'p-6'">
        <slot />
      </div>
    </div>
  </div>
</template>

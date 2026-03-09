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
    <div class="flex h-full flex-col overflow-hidden" :class="panelClass">
      <div v-if="!isMacLike" class="flex h-11 shrink-0 items-center justify-end px-3" data-tauri-drag-region>
        <button
          type="button"
          class="btn-ghost no-drag flex h-8 w-8 items-center justify-center rounded-[10px]"
          aria-label="关闭窗口"
          @mousedown.stop.prevent
          @click="closeWindow"
        >
          <IconX class="h-4 w-4" stroke="2" />
        </button>
      </div>
      <div class="shrink-0 border-b border-app px-6 pb-6" :class="isMacLike ? 'pt-9' : 'pt-0'" data-tauri-drag-region>
        <h1 class="text-app text-xl font-semibold">{{ title }}</h1>
        <p v-if="description" class="text-app-muted mt-1 text-sm">{{ description }}</p>
      </div>
      <div class="no-drag min-h-0 flex-1 overflow-auto" :class="isMacLike ? 'p-4' : 'p-6'">
        <slot />
      </div>
    </div>
  </div>
</template>

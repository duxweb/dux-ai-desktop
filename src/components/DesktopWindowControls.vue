<script setup lang="ts">
import { computed, ref } from 'vue'
import { closeWindow, isMacLike, minimizeWindow, toggleMaximizeWindow } from '../lib/window'

const props = withDefaults(defineProps<{
  compact?: boolean
}>(), {
  compact: false,
})

const hovering = ref(false)
const isWindowsLike = computed(() => !isMacLike)

async function handleMinimize() {
  await minimizeWindow()
}

async function handleToggleMaximize() {
  await toggleMaximizeWindow()
}

async function handleClose() {
  await closeWindow()
}
</script>

<template>
  <div
    class="no-drag flex items-center gap-2"
    @mouseenter="hovering = true"
    @mouseleave="hovering = false"
  >
    <template v-if="isMacLike">
      <button class="window-traffic bg-[#ff5f57]" aria-label="关闭窗口" @click="handleClose">
        <span v-show="hovering">×</span>
      </button>
      <button class="window-traffic bg-[#febc2e]" aria-label="最小化窗口" @click="handleMinimize">
        <span v-show="hovering">—</span>
      </button>
      <button class="window-traffic bg-[#28c840]" aria-label="最大化窗口" @click="handleToggleMaximize">
        <span v-show="hovering">+</span>
      </button>
    </template>
    <template v-else>
      <button class="window-win-button" :class="compact ? 'h-7 w-9 rounded-lg' : ''" aria-label="最小化窗口" @click="handleMinimize">—</button>
      <button class="window-win-button" :class="compact ? 'h-7 w-9 rounded-lg' : ''" aria-label="最大化窗口" @click="handleToggleMaximize">▢</button>
      <button class="window-win-button border-red-400/20 text-red-200 hover:bg-red-500/20" :class="compact ? 'h-7 w-9 rounded-lg' : ''" aria-label="关闭窗口" @click="handleClose">✕</button>
    </template>
  </div>
</template>

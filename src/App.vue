<script setup lang="ts">
import { computed } from 'vue'
import { resolveWindowKind } from './lib/app-windows'
import AboutWindowView from './views/AboutWindowView.vue'
import MainWindowView from './views/MainWindowView.vue'
import SettingsWindowView from './views/SettingsWindowView.vue'

const windowKind = resolveWindowKind()

const activeView = computed(() => {
  if (windowKind === 'settings') {
    return SettingsWindowView
  }
  if (windowKind === 'about') {
    return AboutWindowView
  }
  return MainWindowView
})
</script>

<template>
  <component :is="activeView" />
</template>

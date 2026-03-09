<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'
import ChildWindowShell from '../components/ChildWindowShell.vue'
import { isTauriRuntime } from '../lib/runtime'
import { showEditableContextMenu } from '../lib/native-menu'
import { useSettingsStore } from '../stores/settings'

const settings = useSettingsStore()
let unlistenFocus: null | (() => void) = null

async function hydrateSettings() {
  await settings.init()
}

async function saveSettings() {
  await settings.saveForm()
}

onMounted(async () => {
  await hydrateSettings()

  if (!isTauriRuntime()) {
    return
  }

  const { getCurrentWindow } = await import('@tauri-apps/api/window')
  unlistenFocus = await getCurrentWindow().onFocusChanged(async ({ payload: focused }) => {
    if (focused) {
      await hydrateSettings()
    }
  })
})

onBeforeUnmount(() => {
  unlistenFocus?.()
  unlistenFocus = null
})
</script>

<template>
  <ChildWindowShell title="连接设置" description="保存你的 Dux AI 服务地址和 API Token。">
    <div>
      <div class="grid gap-4">
        <label class="text-sm font-medium text-[color:var(--app-text-muted)]">服务器地址</label>
        <input
          :value="settings.form.serverUrl"
          class="field-base rounded-2xl px-4 py-3 text-sm"
          placeholder="例如 http://127.0.0.1:8000"
          @input="settings.updateForm({ ...settings.form, serverUrl: ($event.target as HTMLInputElement).value })"
          @contextmenu="showEditableContextMenu($event)"
        >

        <label class="text-sm font-medium text-[color:var(--app-text-muted)]">Token</label>
        <input
          :value="settings.form.token"
          type="password"
          class="field-base rounded-2xl px-4 py-3 text-sm"
          placeholder="sk-..."
          @input="settings.updateForm({ ...settings.form, token: ($event.target as HTMLInputElement).value })"
          @contextmenu="showEditableContextMenu($event)"
        >

        <div
          v-if="settings.lastTestMessage"
          class="field-base rounded-2xl px-4 py-3 text-sm text-[color:var(--app-text-soft)]"
        >
          {{ settings.lastTestMessage }}
        </div>
      </div>

      <div class="mt-6 flex items-center justify-end gap-3">
        <button
          class="dialog-btn-muted no-drag px-4 py-3 disabled:cursor-not-allowed disabled:opacity-55"
          :disabled="settings.testing"
          @click="settings.testConnection"
        >
          {{ settings.testing ? '连接中…' : '测试连接' }}
        </button>
        <button
          class="no-drag rounded-2xl bg-[linear-gradient(180deg,var(--app-accent)_0%,var(--app-accent-strong)_100%)] px-5 py-3 text-sm font-semibold text-white shadow-[0_10px_28px_rgba(53,109,247,0.26)] transition disabled:cursor-not-allowed disabled:opacity-55"
          :disabled="settings.saving"
          @click="saveSettings"
        >
          {{ settings.saving ? '保存中…' : '保存' }}
        </button>
      </div>
    </div>
  </ChildWindowShell>
</template>

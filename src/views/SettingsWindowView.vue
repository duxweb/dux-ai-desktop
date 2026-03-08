<script setup lang="ts">
import { onMounted } from 'vue'
import ChildWindowShell from '../components/ChildWindowShell.vue'
import { useSettingsStore } from '../stores/settings'

const settings = useSettingsStore()

async function saveSettings() {
  await settings.saveForm()
}

onMounted(async () => {
  await settings.init()
})
</script>

<template>
  <ChildWindowShell title="连接设置" description="保存你的 Dux AI 服务地址和 API Token。">
    <div>
      <div class="grid gap-4">
        <label class="text-xs font-medium text-[color:var(--app-text-muted)]">服务器地址</label>
        <input
          :value="settings.form.serverUrl"
          class="rounded-2xl px-4 py-3 text-sm text-[color:var(--app-text)] placeholder:text-[color:var(--app-text-muted)]"
          style="border: 1px solid var(--app-border); background: color-mix(in srgb, var(--app-text) 4%, transparent);"
          placeholder="例如 http://127.0.0.1:8000"
          @input="settings.updateForm({ ...settings.form, serverUrl: ($event.target as HTMLInputElement).value })"
        >

        <label class="text-xs font-medium text-[color:var(--app-text-muted)]">Token</label>
        <input
          :value="settings.form.token"
          type="password"
          class="rounded-2xl px-4 py-3 text-sm text-[color:var(--app-text)] placeholder:text-[color:var(--app-text-muted)]"
          style="border: 1px solid var(--app-border); background: color-mix(in srgb, var(--app-text) 4%, transparent);"
          placeholder="sk-..."
          @input="settings.updateForm({ ...settings.form, token: ($event.target as HTMLInputElement).value })"
        >

        <div
          v-if="settings.lastTestMessage"
          class="rounded-2xl px-4 py-3 text-sm text-[color:var(--app-text-soft)]"
          style="border: 1px solid var(--app-border); background: color-mix(in srgb, var(--app-text) 4%, transparent);"
        >
          {{ settings.lastTestMessage }}
        </div>
      </div>

      <div class="mt-6 flex items-center justify-end gap-3">
        <button
          class="no-drag rounded-2xl px-4 py-3 text-sm transition disabled:cursor-not-allowed disabled:opacity-55"
          style="border: 1px solid var(--app-border); background: color-mix(in srgb, var(--app-text) 4%, transparent); color: var(--app-text-soft);"
          :disabled="settings.testing"
          @click="settings.testConnection"
        >
          {{ settings.testing ? '连接中…' : '测试连接' }}
        </button>
        <button
          class="no-drag rounded-2xl bg-[linear-gradient(180deg,var(--app-accent)_0%,var(--app-accent-strong)_100%)] px-5 py-3 text-sm font-semibold text-white shadow-[0_10px_28px_rgba(53,109,247,0.26)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-55"
          :disabled="settings.saving"
          @click="saveSettings"
        >
          {{ settings.saving ? '保存中…' : '保存' }}
        </button>
      </div>
    </div>
  </ChildWindowShell>
</template>

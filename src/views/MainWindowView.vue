<script setup lang="ts">
import { IconInfoCircle, IconSettings } from '@tabler/icons-vue'
import { computed, onMounted } from 'vue'
import ChatPanel from '../components/ChatPanel.vue'
import DesktopWindowControls from '../components/DesktopWindowControls.vue'
import WindowSidebar from '../components/WindowSidebar.vue'
import { openChildWindow } from '../lib/app-windows'
import { isMacLike, startWindowDragging } from '../lib/window'
import { useChatStore } from '../stores/chat'
import { useSettingsStore } from '../stores/settings'

const settings = useSettingsStore()
const chat = useChatStore()

const ready = computed(() => settings.ready)
const configured = computed(() => settings.configured)
const booting = computed(() => chat.booting)
const rootClass = computed(() => isMacLike ? 'p-0' : 'p-1.5')
const shellClass = computed(() => isMacLike
  ? 'mac-native-shell rounded-none border-0 shadow-none'
  : 'rounded-[32px] border border-white/8 shadow-[0_30px_80px_rgba(0,0,0,0.34)]')
const contentClass = computed(() => isMacLike ? 'p-3 pt-1' : 'p-3')

async function bootstrap(force = false) {
  if (!settings.configured) {
    await openChildWindow('settings')
    return
  }
  await chat.bootstrap(force)
}

async function openSettingsWindow() {
  await openChildWindow('settings')
}

async function openAboutWindow() {
  await openChildWindow('about')
}

function handleHeaderMouseDown(event: MouseEvent) {
  if (event.button !== 0) {
    return
  }
  const target = event.target as HTMLElement | null
  if (target?.closest('.no-drag')) {
    return
  }
  void startWindowDragging()
}

onMounted(async () => {
  await settings.init()
  await bootstrap()
})
</script>

<template>
  <div class="relative h-full w-full overflow-hidden bg-transparent text-app-text" :class="rootClass">
    <div
      v-if="!isMacLike"
      class="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_18%,rgba(73,116,255,0.16),transparent_24%),radial-gradient(circle_at_88%_14%,rgba(60,198,196,0.12),transparent_22%),radial-gradient(circle_at_50%_100%,rgba(114,87,255,0.10),transparent_30%)]"
    />

    <div class="glass-shell relative flex h-full w-full flex-col overflow-hidden" :class="shellClass">
      <header
        v-if="isMacLike"
        class="relative h-[40px] shrink-0"
        data-tauri-drag-region
        @mousedown="handleHeaderMouseDown"
      >
        <div class="no-drag absolute right-3 top-3 z-20 flex items-center gap-2">
          <button class="text-[color:var(--app-text-muted)] transition hover:text-[color:var(--app-text)]" aria-label="打开关于" @click="openAboutWindow">
            <IconInfoCircle class="h-5.5 w-5.5" stroke="1.85" />
          </button>
          <button class="text-[color:var(--app-text-muted)] transition hover:text-[color:var(--app-text)]" aria-label="打开设置" @click="openSettingsWindow">
            <IconSettings class="h-5.5 w-5.5" stroke="1.85" />
          </button>
        </div>
      </header>

      <header
        v-else
        class="relative flex h-[38px] shrink-0 items-center justify-between px-3"
        data-tauri-drag-region
        @mousedown="handleHeaderMouseDown"
      >
        <div class="min-w-0" data-tauri-drag-region>
          <div class="truncate text-sm font-semibold text-[color:var(--app-text)]">Dux AI</div>
        </div>
        <div class="flex items-center gap-1 no-drag" data-tauri-drag-region>
          <button class="flex h-8 w-8 items-center justify-center text-[color:var(--app-text-muted)] transition hover:text-[color:var(--app-text)]" aria-label="打开关于" @click="openAboutWindow">
            <IconInfoCircle class="h-5 w-5" stroke="1.9" />
          </button>
          <button class="flex h-8 w-8 items-center justify-center text-[color:var(--app-text-muted)] transition hover:text-[color:var(--app-text)]" aria-label="打开设置" @click="openSettingsWindow">
            <IconSettings class="h-5 w-5" stroke="1.9" />
          </button>
          <DesktopWindowControls compact />
        </div>
      </header>

      <div class="grid min-h-0 flex-1 grid-cols-[290px_minmax(0,1fr)] overflow-hidden">
        <div class="flex min-h-0 min-w-0 flex-col overflow-hidden">
          <WindowSidebar
            :sessions="chat.sessions"
            :agents="chat.agents"
            :active-session-id="chat.activeSessionId"
            :active-agent-code="chat.activeAgentCode"
            :loading="booting"
            :configured="configured"
            @create-session="chat.createSession"
            @select-session="chat.selectSession"
            @rename-session="chat.renameSession"
            @delete-session="chat.deleteSession"
            @select-agent="chat.selectAgent"
            @open-settings="openSettingsWindow"
          />
        </div>

        <div class="flex min-h-0 min-w-0 flex-col overflow-hidden" :class="contentClass">
          <div class="chat-canvas flex h-full min-h-0 flex-col overflow-hidden rounded-[18px] border border-white/5">
            <ChatPanel
              :ready="ready"
              :configured="configured"
              :booting="booting"
              :active-agent="chat.activeAgent"
              :active-session="chat.activeSession"
              :messages="chat.messages"
              :pending-attachments="chat.pendingAttachments"
              :sending="chat.sending"
              :uploading="chat.uploading"
              :error="chat.error"
              @send="chat.sendMessage"
              @cancel="chat.cancelCurrentStream"
              @attach="chat.pickAndUploadFile"
              @retry-bootstrap="bootstrap(true)"
              @open-settings="openSettingsWindow"
            />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

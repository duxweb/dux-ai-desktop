<script setup lang="ts">
import { IconInfoCircle, IconSettings } from '@tabler/icons-vue'
import { computed, onMounted, ref } from 'vue'
import ChatPanel from '../components/ChatPanel.vue'
import DesktopWindowControls from '../components/DesktopWindowControls.vue'
import WindowSidebar from '../components/WindowSidebar.vue'
import { openChildWindow } from '../lib/app-windows'
import { isEditableContextTarget, showEditableContextMenu } from '../lib/native-menu'
import { isMacLike } from '../lib/window'
import { pushToast } from '../lib/toast'
import { useChatStore } from '../stores/chat'
import { useSettingsStore } from '../stores/settings'

const settings = useSettingsStore()
const chat = useChatStore()

const ready = computed(() => settings.ready)
const configured = computed(() => settings.configured)
const booting = computed(() => chat.booting)
const activeSession = computed(() => chat.activeSession)
const rootClass = computed(() => 'p-0')
const shellClass = computed(() => isMacLike
  ? 'glass-shell mac-native-shell rounded-none border-0 shadow-none'
  : 'windows-native-shell rounded-none border-0 shadow-none')

const renameOpen = ref(false)
const deleteOpen = ref(false)
const renameValue = ref('')
const actionBusy = ref(false)
const refreshBusy = ref(false)

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

async function refreshCurrentConversation() {
  if (refreshBusy.value || chat.sending) {
    return
  }
  refreshBusy.value = true
  try {
    await chat.refreshCurrentSession()
    await new Promise(resolve => setTimeout(resolve, 320))
    pushToast('已刷新最新消息', 'success')
  }
  finally {
    refreshBusy.value = false
  }
}

async function ensureSessionFocused(sessionId?: number | null) {
  if (!sessionId || sessionId === activeSession.value?.id) {
    return
  }
  await chat.selectSession(sessionId)
}

async function openRenameDialog(sessionId?: number | null) {
  await ensureSessionFocused(sessionId)
  if (!activeSession.value) {
    return
  }
  renameValue.value = String(activeSession.value.title || '')
  renameOpen.value = true
}

async function openDeleteDialog(sessionId?: number | null) {
  await ensureSessionFocused(sessionId)
  if (!activeSession.value) {
    return
  }
  deleteOpen.value = true
}

async function confirmRename() {
  const title = renameValue.value.trim()
  if (!activeSession.value || !title) {
    return
  }
  actionBusy.value = true
  try {
    await chat.renameSession({ id: activeSession.value.id, title })
    renameOpen.value = false
  }
  finally {
    actionBusy.value = false
  }
}

async function confirmDelete() {
  if (!activeSession.value) {
    return
  }
  actionBusy.value = true
  try {
    await chat.deleteSession(activeSession.value.id)
    deleteOpen.value = false
  }
  finally {
    actionBusy.value = false
  }
}

function handleRootContextMenu(event: MouseEvent) {
  const target = event.target as HTMLElement | null
  if (!target) {
    return
  }
  if (isEditableContextTarget(target)) {
    void showEditableContextMenu(event)
    return
  }
  if (target.closest('[data-context-menu-controlled="true"]')) {
    return
  }
  event.preventDefault()
}

onMounted(async () => {
  await settings.init()
  await bootstrap()
})
</script>

<template>
  <div class="relative h-full w-full overflow-hidden bg-transparent text-app-text" :class="rootClass" @contextmenu="handleRootContextMenu">
    <div class="relative flex h-full w-full flex-col overflow-hidden" :class="shellClass">
      <header
        v-if="isMacLike"
        class="relative h-[40px] shrink-0"
        data-tauri-drag-region
      >
        <div class="no-drag absolute right-3 top-3 z-20 flex items-center gap-2">
          <button class="btn-ghost" aria-label="打开关于" @click="openAboutWindow">
            <IconInfoCircle class="h-5.5 w-5.5" stroke="1.85" />
          </button>
          <button class="btn-ghost" aria-label="打开设置" @click="openSettingsWindow">
            <IconSettings class="h-5.5 w-5.5" stroke="1.85" />
          </button>
        </div>
      </header>

      <header
        v-else
        class="relative flex h-[38px] shrink-0 items-center pl-3"
      >
        <div class="min-w-0 shrink-0 opacity-0 pointer-events-none select-none">
          <div class="truncate text-sm font-semibold text-[color:var(--app-text)]">Dux AI</div>
        </div>
        <div class="min-w-0 flex-1 self-stretch" data-tauri-drag-region />
        <div class="flex h-full items-stretch no-drag">
          <button class="btn-ghost flex h-8 w-8 items-center justify-center" aria-label="打开关于" @click="openAboutWindow">
            <IconInfoCircle class="h-5 w-5" stroke="1.9" />
          </button>
          <button class="btn-ghost flex h-8 w-8 items-center justify-center" aria-label="打开设置" @click="openSettingsWindow">
            <IconSettings class="h-5 w-5" stroke="1.9" />
          </button>
          <DesktopWindowControls compact />
        </div>
      </header>

      <div class="no-drag grid min-h-0 flex-1 grid-cols-[290px_minmax(0,1fr)] overflow-hidden">
        <div class="no-drag flex min-h-0 min-w-0 flex-col overflow-hidden">
          <WindowSidebar
            :sessions="chat.sessions"
            :agents="chat.agents"
            :active-session-id="chat.activeSessionId"
            :active-agent-code="chat.activeAgentCode"
            :loading="booting"
            :configured="configured"
            @create-session="chat.createSession"
            @select-session="chat.selectSession"
            @select-agent="chat.selectAgent"
            @request-rename-session="openRenameDialog"
            @request-delete-session="openDeleteDialog"
          />
        </div>

        <div class="flex min-h-0 min-w-0 flex-col overflow-hidden pt-2 pr-4 pb-4">
          <div class="chat-canvas flex h-full min-h-0 flex-col overflow-hidden rounded-[12px]">
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
              :refreshing="refreshBusy"
              @send="chat.sendMessage"
              @cancel="chat.cancelCurrentStream"
              @attach="chat.pickAndUploadFile"
              @remove-attachment="chat.removePendingAttachment"
              @retry-bootstrap="bootstrap(true)"
              @request-rename="openRenameDialog()"
              @request-delete="openDeleteDialog()"
              @request-retry="chat.retryLastMessage"
              @request-refresh="refreshCurrentConversation"
            />
          </div>
        </div>
      </div>
    </div>

    <div v-if="renameOpen" class="no-drag absolute inset-0 z-40 grid place-items-center bg-black/28 backdrop-blur-sm">
      <div class="dialog-panel w-full max-w-md rounded-[20px] px-5 py-5">
        <div class="text-app text-lg font-semibold">重命名会话</div>
        <p class="text-app-muted mt-2 text-sm">输入新的会话名称。</p>
        <input
          v-model="renameValue"
          class="field-base mt-4 w-full rounded-2xl px-4 py-3 text-sm"
          @contextmenu="showEditableContextMenu($event)"
          placeholder="例如：需求讨论"
          @keydown.enter.prevent="confirmRename"
        >
        <div class="mt-5 flex justify-end gap-3">
          <button class="dialog-btn-muted" @click="renameOpen = false">取消</button>
          <button class="dialog-btn-accent disabled:opacity-55" :disabled="!renameValue.trim() || actionBusy" @click="confirmRename">确认</button>
        </div>
      </div>
    </div>

    <div v-if="deleteOpen" class="no-drag absolute inset-0 z-40 grid place-items-center bg-black/28 backdrop-blur-sm">
      <div class="dialog-panel w-full max-w-md rounded-[20px] px-5 py-5">
        <div class="text-app text-lg font-semibold">删除会话</div>
        <p class="text-app-muted mt-2 text-sm">确认删除“{{ activeSession?.title || '未命名会话' }}”吗？删除后无法恢复。</p>
        <div class="mt-5 flex justify-end gap-3">
          <button class="dialog-btn-muted" @click="deleteOpen = false">取消</button>
          <button class="dialog-btn-danger disabled:opacity-55" :disabled="actionBusy" @click="confirmDelete">确认删除</button>
        </div>
      </div>
    </div>
  </div>
</template>

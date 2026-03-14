<script setup lang="ts">
import { IconInfoCircle, IconSettings } from '@tabler/icons-vue'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
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
const sessionError = computed(() => chat.error)
const rootClass = computed(() => 'p-0')
const shellClass = computed(() => isMacLike
  ? 'glass-shell mac-native-shell rounded-none border-0 shadow-none'
  : 'windows-native-shell rounded-none border-0 shadow-none')

const renameOpen = ref(false)
const deleteOpen = ref(false)
const renameValue = ref('')
const renameTargetId = ref<number | null>(null)
const deleteTargetId = ref<number | null>(null)
const refreshBusy = ref(false)
let refreshTimer: number | null = null

function selectedSession(sessionId?: number | null) {
  if (!sessionId) {
    return null
  }
  return chat.sessions.find(item => item.id === sessionId) || null
}

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

async function refreshCurrentConversation(silent = false) {
  if (refreshBusy.value || chat.sending || chat.creatingSession || !!sessionError.value) {
    return
  }
  refreshBusy.value = true
  try {
    await chat.refreshCurrentSession({ silent })
    if (!silent) {
      pushToast('已刷新最新消息', 'success')
    }
  }
  finally {
    refreshBusy.value = false
  }
}

async function openRenameDialog(sessionId?: number | null) {
  const session = selectedSession(sessionId)
  if (!session) {
    return
  }
  renameTargetId.value = session.id
  renameValue.value = String(session.title || '')
  renameOpen.value = true
}

async function openDeleteDialog(sessionId?: number | null) {
  const session = selectedSession(sessionId)
  if (!session) {
    return
  }
  deleteTargetId.value = session.id
  deleteOpen.value = true
}

async function confirmRename() {
  const title = renameValue.value.trim()
  const sessionId = renameTargetId.value
  if (!sessionId || !title) {
    return
  }
  renameOpen.value = false
  renameTargetId.value = null
  try {
    await chat.renameSession({ id: sessionId, title })
  }
  catch {
    pushToast(chat.error || '重命名失败', 'error')
  }
}

async function confirmDelete() {
  const sessionId = deleteTargetId.value
  if (!sessionId) {
    return
  }
  deleteOpen.value = false
  deleteTargetId.value = null
  try {
    await chat.deleteSession(sessionId)
  }
  catch {
    pushToast(chat.error || '删除失败', 'error')
  }
}

async function handleCreateSession() {
  try {
    await chat.createSession()
  }
  catch {
    pushToast(chat.error || '创建会话失败', 'error')
  }
}

function restartRefreshTimer() {
  if (refreshTimer !== null) {
    window.clearInterval(refreshTimer)
    refreshTimer = null
  }
  if (!settings.configured || !chat.activeSessionId) {
    return
  }
  refreshTimer = window.setInterval(() => {
    void refreshCurrentConversation(true)
  }, 30000)
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

watch(() => chat.activeSessionId, (sessionId) => {
  restartRefreshTimer()
  if (sessionId) {
    void chat.refreshCurrentSession({ silent: true })
  }
})

onMounted(async () => {
  await settings.init()
  await bootstrap()
  restartRefreshTimer()
})

onBeforeUnmount(() => {
  if (refreshTimer !== null) {
    window.clearInterval(refreshTimer)
    refreshTimer = null
  }
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
        <div class="min-w-0 shrink-0">
          <div class="truncate text-sm font-semibold text-[color:var(--app-text)]">Dux AI</div>
        </div>
        <div class="min-w-0 flex-1 self-stretch" data-tauri-drag-region />
        <div class="relative z-20 flex h-full items-stretch no-drag pointer-events-auto">
          <button type="button" class="btn-ghost mt-[4px] flex h-8 w-8 items-center justify-center self-start" aria-label="打开关于" @mousedown.stop.prevent @click="openAboutWindow">
            <IconInfoCircle class="h-5 w-5" stroke="1.9" />
          </button>
          <button type="button" class="btn-ghost mt-[4px] flex h-8 w-8 items-center justify-center self-start" aria-label="打开设置" @mousedown.stop.prevent @click="openSettingsWindow">
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
            :creating="chat.creatingSession"
            :deleting-session-ids="chat.deletingSessionIds"
            @create-session="handleCreateSession"
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
              @request-rename="openRenameDialog(chat.activeSessionId)"
              @request-delete="openDeleteDialog(chat.activeSessionId)"
              @request-retry="chat.retryLastMessage"
              @request-refresh="refreshCurrentConversation(false)"
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
          <button class="dialog-btn-accent disabled:opacity-55" :disabled="!renameValue.trim()" @click="confirmRename">确认</button>
        </div>
      </div>
    </div>

    <div v-if="deleteOpen" class="no-drag absolute inset-0 z-40 grid place-items-center bg-black/28 backdrop-blur-sm">
      <div class="dialog-panel w-full max-w-md rounded-[20px] px-5 py-5">
        <div class="text-app text-lg font-semibold">删除会话</div>
        <p class="text-app-muted mt-2 text-sm">确认删除“{{ selectedSession(deleteTargetId)?.title || '未命名会话' }}”吗？删除后无法恢复。</p>
        <div class="mt-5 flex justify-end gap-3">
          <button class="dialog-btn-muted" @click="deleteOpen = false">取消</button>
          <button class="dialog-btn-danger" @click="confirmDelete">确认删除</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import dayjs from 'dayjs'
import { computed } from 'vue'

const props = defineProps<{
  sessions: any[]
  agents: any[]
  activeSessionId: number | null
  activeAgentCode: string
  loading: boolean
  configured: boolean
}>()

const emit = defineEmits<{
  createSession: []
  selectSession: [id: number]
  renameSession: [payload: { id: number, title: string }]
  deleteSession: [id: number]
  selectAgent: [code: string]
  openSettings: []
}>()

const sortedSessions = computed(() => {
  return [...props.sessions].sort((a, b) => String(b.last_message_at || b.updated_at || '').localeCompare(String(a.last_message_at || a.updated_at || '')))
})

function formatTime(value?: string | null) {
  if (!value)
    return ''
  const date = dayjs(value)
  if (!date.isValid())
    return value
  return date.format('MM/DD HH:mm')
}

function quickRename(session: any) {
  const current = String(session.title || '')
  const next = window.prompt('输入新的会话标题', current)
  if (next !== null && next.trim() && next.trim() !== current) {
    emit('renameSession', { id: Number(session.id), title: next.trim() })
  }
}

function quickDelete(session: any) {
  if (window.confirm(`确认删除“${session.title || '未命名会话'}”吗？`)) {
    emit('deleteSession', Number(session.id))
  }
}
</script>

<template>
  <aside class="flex h-full min-h-0 flex-col overflow-hidden px-4 py-4">
    <div class="mb-4 shrink-0 px-1">
      <div class="text-sm font-semibold text-white/92">Dux AI</div>
      <div class="mt-0.5 text-[11px] text-white/40">Desktop Client</div>
    </div>

    <div class="mb-4 shrink-0 px-1">
      <div class="text-[11px] font-medium uppercase tracking-[0.24em] text-white/34">Workspace</div>
      <div class="mt-2 text-lg font-semibold text-white/92">你的对话</div>
      <div class="mt-1 text-sm text-white/45">一个整体化的桌面聊天壳层。</div>
    </div>

    <div class="mb-4 shrink-0 space-y-3">
      <button
        class="no-drag w-full rounded-2xl bg-[linear-gradient(180deg,#4a7cff_0%,#356df7_100%)] px-4 py-3 text-sm font-semibold text-white shadow-[0_10px_30px_rgba(53,109,247,0.3)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-55"
        :disabled="!configured || loading"
        @click="emit('createSession')"
      >
        新建会话
      </button>

      <label class="block text-xs font-medium text-white/42">智能体</label>
      <div class="rounded-2xl border border-white/8 bg-white/4 px-3 py-2.5">
        <select
          class="no-drag w-full bg-transparent text-sm text-white/88"
          :value="activeAgentCode"
          :disabled="!agents.length || loading"
          @change="emit('selectAgent', ($event.target as HTMLSelectElement).value)"
        >
          <option v-for="agent in agents" :key="agent.id" :value="agent.id" class="bg-[#0f1218]">
            {{ agent.name || agent.id }}
          </option>
        </select>
      </div>
    </div>

    <div class="h-0 flex-1 overflow-hidden">
      <div class="mb-3 shrink-0 px-1 text-xs font-medium text-white/42">会话</div>
      <div class="scrollbar-thin h-[calc(100%-1.75rem)] overflow-auto pr-1">
        <div class="space-y-2 pb-2">
          <div v-if="!configured" class="grid min-h-32 place-items-center rounded-3xl border border-white/6 bg-white/3 px-5 text-center text-sm text-white/42">
            先在左下角配置服务器地址与 Token。
          </div>
          <div v-else-if="loading" class="grid min-h-32 place-items-center rounded-3xl border border-white/6 bg-white/3 px-5 text-center text-sm text-white/42">
            正在加载会话…
          </div>

          <div
            v-for="session in sortedSessions"
            :key="session.id"
            class="no-drag w-full rounded-3xl border px-4 py-3 transition"
            :class="activeSessionId === session.id
              ? 'border-white/12 bg-white/9 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]'
              : 'border-transparent bg-white/[0.035] hover:border-white/8 hover:bg-white/[0.06]'"
          >
            <button class="w-full text-left" @click="emit('selectSession', session.id)">
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0 flex-1">
                  <div class="truncate text-sm font-medium text-white/90">{{ session.title || '未命名会话' }}</div>
                  <div class="mt-1 text-xs text-white/42">{{ session.total_tokens || 0 }} tokens</div>
                </div>
                <div class="shrink-0 text-xs text-white/34">{{ formatTime(session.last_message_at || session.updated_at) }}</div>
              </div>
            </button>
            <div class="mt-3 flex gap-2">
              <button class="rounded-xl border border-white/8 bg-white/4 px-3 py-1.5 text-xs text-white/66 transition hover:bg-white/10" @click.stop="quickRename(session)">重命名</button>
              <button class="rounded-xl border border-red-400/12 bg-red-500/8 px-3 py-1.5 text-xs text-red-200 transition hover:bg-red-500/14" @click.stop="quickDelete(session)">删除</button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="mt-4 shrink-0 border-t border-white/6 pt-4">
      <button class="no-drag w-full rounded-2xl border border-white/8 bg-white/4 px-4 py-3 text-left transition hover:bg-white/8" @click="emit('openSettings')">
        <div class="text-sm font-medium text-white/88">配置</div>
        <div class="mt-1 text-xs text-white/42">服务器地址 / Token</div>
      </button>
    </div>
  </aside>
</template>

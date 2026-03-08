<script setup lang="ts">
import { computed, ref } from 'vue'
import MessageBubble from './MessageBubble.vue'

const props = defineProps<{
  ready: boolean
  configured: boolean
  booting: boolean
  activeAgent: any | null
  activeSession: any | null
  messages: any[]
  pendingAttachments: any[]
  sending: boolean
  uploading: boolean
  error: string
}>()

const emit = defineEmits<{
  send: [text: string]
  cancel: []
  attach: []
  retryBootstrap: []
  openSettings: []
}>()

const draft = ref('')
const headerTitle = computed(() => props.activeSession?.title || props.activeAgent?.name || '新会话')
const canSend = computed(() => props.configured && props.ready && !props.sending && (draft.value.trim().length > 0 || props.pendingAttachments.length > 0))

function submit() {
  const text = draft.value
  if (!text.trim() && !props.pendingAttachments.length) {
    return
  }
  emit('send', text)
  draft.value = ''
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    submit()
  }
}
</script>

<template>
  <section class="flex h-full min-h-0 flex-col p-4">
    <header class="shrink-0 border-b border-white/6 pb-4">
      <div class="flex items-start justify-between gap-4">
        <div class="min-w-0">
          <div class="mt-2 truncate text-xl font-semibold text-white/94">{{ headerTitle }}</div>
          <div class="mt-1 text-sm text-white/42">
            {{ activeAgent?.description || '桌面化聊天画布，内容区域保持纯色稳定，外层保持磨砂通透。' }}
          </div>
        </div>
        <div class="no-drag shrink-0">
          <button class="rounded-2xl border border-white/8 bg-white/4 px-4 py-2 text-sm text-white/82 transition hover:bg-white/8" @click="emit('openSettings')">设置</button>
        </div>
      </div>
    </header>

    <div v-if="!configured" class="grid flex-1 place-items-center text-center">
      <div>
        <h2 class="text-2xl font-semibold text-white/94">先连接你的 Dux AI 服务</h2>
        <p class="mt-3 text-sm text-white/46">填写服务器地址和 Token 后，桌面端会自动拉取智能体与会话。</p>
        <button class="mt-6 rounded-2xl bg-[linear-gradient(180deg,#4a7cff_0%,#356df7_100%)] px-5 py-3 text-sm font-semibold text-white" @click="emit('openSettings')">打开配置</button>
      </div>
    </div>

    <div v-else-if="booting" class="grid flex-1 place-items-center text-center">
      <div>
        <h2 class="text-2xl font-semibold text-white/94">正在连接服务器</h2>
        <p class="mt-3 text-sm text-white/46">读取智能体、会话和历史消息中…</p>
      </div>
    </div>

    <template v-else>
      <div class="h-0 flex-1 overflow-hidden">
        <div class="scrollbar-thin h-full overflow-auto pr-2 py-4">
          <div v-if="error" class="mb-4 flex items-center justify-between gap-4 rounded-2xl border border-red-400/16 bg-red-500/8 px-4 py-3 text-sm text-red-100/90">
            <span>{{ error }}</span>
            <button class="rounded-xl border border-white/8 bg-white/4 px-3 py-1.5 text-xs text-white/78 transition hover:bg-white/8" @click="emit('retryBootstrap')">重试</button>
          </div>

          <div v-if="!messages.length" class="grid min-h-full place-items-center pb-12 text-center">
            <div>
              <h3 class="text-xl font-semibold text-white/92">开始一段新的对话</h3>
              <p class="mt-3 text-sm text-white/42">支持流式回复、会话管理和附件上传。</p>
            </div>
          </div>

          <div class="space-y-4 pb-2">
            <MessageBubble v-for="message in messages" :key="message.localId || message.id" :message="message" />
          </div>
        </div>
      </div>

      <footer class="shrink-0 border-t border-white/6 pt-4">
        <div v-if="pendingAttachments.length" class="mb-3 flex flex-wrap gap-2">
          <div v-for="file in pendingAttachments" :key="file.id" class="rounded-2xl border border-white/8 bg-white/4 px-3 py-2 text-xs text-white/72">
            <div class="font-medium text-white/86">{{ file.name }}</div>
            <div class="mt-1 text-white/42">{{ file.status === 'uploading' ? '上传中' : file.status === 'uploaded' ? '已就绪' : file.error || '失败' }}</div>
          </div>
        </div>

        <div class="mb-3 flex items-center justify-between gap-3">
          <button class="no-drag rounded-2xl border border-white/8 bg-white/4 px-4 py-2 text-sm text-white/76 transition hover:bg-white/8 disabled:cursor-not-allowed disabled:opacity-55" :disabled="uploading" @click="emit('attach')">
            {{ uploading ? '上传中…' : '添加附件' }}
          </button>
          <div class="text-xs text-white/40">
            <span v-if="activeAgent">{{ activeAgent.name }}</span>
            <span v-if="sending"> · 正在生成…</span>
          </div>
        </div>

        <div class="no-drag flex items-end gap-3 rounded-[24px] border border-white/8 bg-[#171b24] px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
          <textarea
            v-model="draft"
            class="min-h-[78px] flex-1 resize-none bg-transparent px-1 py-1 text-[15px] leading-7 text-white/92 placeholder:text-white/34"
            placeholder="输入消息，Enter 发送，Shift + Enter 换行"
            rows="1"
            :disabled="sending"
            @keydown="onKeydown"
          />
          <div class="flex items-center gap-2">
            <button v-if="sending" class="rounded-2xl border border-white/8 bg-white/4 px-4 py-3 text-sm text-white/78 transition hover:bg-white/8" @click="emit('cancel')">停止</button>
            <button v-else class="rounded-2xl bg-[linear-gradient(180deg,#4a7cff_0%,#356df7_100%)] px-5 py-3 text-sm font-semibold text-white shadow-[0_10px_28px_rgba(53,109,247,0.26)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-55" :disabled="!canSend" @click="submit">发送</button>
          </div>
        </div>
      </footer>
    </template>
  </section>
</template>

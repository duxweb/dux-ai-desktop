<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import MessageBubble from './MessageBubble.vue'
import { IconArrowDown, IconEdit, IconFileText, IconPhoto, IconRefresh, IconTrash, IconVideo, IconX } from '@tabler/icons-vue'
import { showEditableContextMenu } from '../lib/native-menu'

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
  refreshing: boolean
  error: string
}>()

const emit = defineEmits<{
  send: [text: string]
  cancel: []
  attach: [kind: 'image' | 'document' | 'video']
  removeAttachment: [id: string]
  retryBootstrap: []
  requestRename: []
  requestDelete: []
  requestRetry: []
  requestRefresh: []
}>()

const draft = ref('')
const scrollRef = ref<HTMLElement | null>(null)
const shouldStickToBottom = ref(true)
const headerTitle = computed(() => props.activeSession?.title || props.activeAgent?.name || '新会话')
const canSend = computed(() => props.configured && props.ready && !props.sending && (draft.value.trim().length > 0 || props.pendingAttachments.length > 0))
const refreshDisabled = computed(() => props.sending || props.refreshing)
const showScrollToBottom = computed(() => !shouldStickToBottom.value)
const lastMessageFingerprint = computed(() => {
  const last = props.messages[props.messages.length - 1]
  if (!last) {
    return ''
  }
  const content = typeof last.content === 'string' ? last.content : JSON.stringify(last.content || [])
  const displayText = typeof last.displayText === 'string' ? last.displayText : ''
  const status = last.meta?.status || ''
  return `${String(last.id || last.localId || '')}:${displayText}:${content}:${status}`
})

function isNearBottom(el: HTMLElement, threshold = 56) {
  const distance = el.scrollHeight - el.clientHeight - el.scrollTop
  return distance <= threshold
}

function handleScroll() {
  const el = scrollRef.value
  if (!el) {
    return
  }
  shouldStickToBottom.value = isNearBottom(el)
}

async function scrollToBottom(force = false) {
  await nextTick()
  const el = scrollRef.value
  if (!el) {
    return
  }
  if (!force && !shouldStickToBottom.value) {
    return
  }
  el.scrollTop = el.scrollHeight
  shouldStickToBottom.value = true
}

function submit() {
  const text = draft.value
  if (!text.trim() && !props.pendingAttachments.length) {
    return
  }
  shouldStickToBottom.value = true
  emit('send', text)
  draft.value = ''
  void scrollToBottom(true)
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    submit()
  }
}

function attachmentStatusText(file: any) {
  if (file.status === 'error') {
    return file.error || '上传失败'
  }
  if (file.kind !== 'document' || !file.remote) {
    return ''
  }
  if (file.remote.parse_mode !== 'parsed') {
    return ''
  }

  return Number(file.remote.parsed_parts_count) > 0 ? '解析成功' : '解析为空'
}

function attachmentIcon(kind?: string) {
  if (kind === 'image') {
    return IconPhoto
  }
  if (kind === 'video') {
    return IconVideo
  }
  return IconFileText
}

watch(() => props.messages.length, () => {
  void scrollToBottom()
})

watch(lastMessageFingerprint, () => {
  void scrollToBottom()
})

watch(() => props.sending, (value) => {
  if (value) {
    shouldStickToBottom.value = true
    void scrollToBottom(true)
    return
  }
  void scrollToBottom()
})

watch(() => props.activeSession?.id, () => {
  shouldStickToBottom.value = true
  void scrollToBottom(true)
})
</script>

<template>
  <section class="flex h-full min-h-0 flex-col p-4">
    <header class="shrink-0 border-b border-app pb-4">
      <div class="flex items-start justify-between gap-4">
        <div class="min-w-0">
          <div class="text-app mt-1 truncate text-xl font-semibold">{{ headerTitle }}</div>
        </div>
        <div class="no-drag flex shrink-0 items-center gap-2">
          <button
            v-if="activeSession"
            class="btn-muted inline-flex h-9 w-9 items-center justify-center rounded-full disabled:cursor-not-allowed disabled:opacity-55"
            :disabled="refreshDisabled"
            aria-label="刷新消息"
            @click="emit('requestRefresh')"
          >
            <IconRefresh class="h-4 w-4" stroke="1.9" :class="props.refreshing ? 'animate-spin' : ''" />
          </button>
          <button
            v-if="activeSession"
            class="btn-muted inline-flex h-9 w-9 items-center justify-center rounded-full"
            aria-label="重命名会话"
            @click="emit('requestRename')"
          >
            <IconEdit class="h-4 w-4" stroke="1.9" />
          </button>
          <button
            v-if="activeSession"
            class="btn-danger inline-flex h-9 w-9 items-center justify-center rounded-full"
            aria-label="删除会话"
            @click="emit('requestDelete')"
          >
            <IconTrash class="h-4 w-4" stroke="1.9" />
          </button>
        </div>
      </div>
    </header>

    <div v-if="!configured" class="grid flex-1 place-items-center text-center">
      <div>
        <h2 class="text-app text-2xl font-semibold">先连接你的 Dux AI 服务</h2>
        <p class="text-app-muted mt-3 text-sm">填写服务器地址和 Token 后，桌面端会自动拉取智能体与会话。</p>
      </div>
    </div>

    <div v-else-if="booting" class="grid flex-1 place-items-center text-center">
      <div>
        <h2 class="text-app text-2xl font-semibold">正在连接服务器</h2>
        <p class="text-app-muted mt-3 text-sm">读取智能体、会话和历史消息中…</p>
      </div>
    </div>

    <template v-else>
      <div class="relative h-0 flex-1 overflow-hidden">
        <div ref="scrollRef" class="scrollbar-thin h-full overflow-auto py-4 pr-2" @scroll="handleScroll">
          <div v-if="!messages.length" class="grid min-h-full place-items-center pb-12 text-center">
            <div>
              <h3 class="text-app text-xl font-semibold">开始一段新的对话</h3>
            </div>
          </div>

          <div class="space-y-4 pb-2">
            <MessageBubble v-for="message in messages" :key="message.localId || message.id" :message="message" @retry="emit('requestRetry')" />
          </div>
        </div>

        <button
          v-if="showScrollToBottom"
          class="btn-muted no-drag absolute bottom-4 right-3 flex h-9 w-9 items-center justify-center rounded-full"
          aria-label="回到底部"
          @click="scrollToBottom(true)"
        >
          <IconArrowDown class="h-4 w-4" stroke="1.9" />
        </button>
      </div>

      <footer class="shrink-0 border-t border-app pt-4">
        <div v-if="pendingAttachments.length" class="mb-3 flex flex-wrap gap-2.5">
          <div
            v-for="file in pendingAttachments"
            :key="file.id"
            class="relative flex min-w-[148px] max-w-[220px] items-center gap-3 rounded-[12px] border border-app bg-[color:color-mix(in_srgb,var(--app-panel-2)_94%,transparent)] px-3 py-3 pr-10"
          >
            <div v-if="file.kind === 'image' && file.previewUrl" class="h-12 w-12 overflow-hidden rounded-[10px] bg-black/5">
              <img :src="file.previewUrl" :alt="file.name" class="h-full w-full object-cover">
            </div>
            <div v-else class="flex h-12 w-12 items-center justify-center rounded-[10px] bg-[color:color-mix(in_srgb,var(--app-text)_6%,transparent)] text-[color:var(--app-text-soft)]">
              <component :is="attachmentIcon(file.kind)" class="h-5 w-5" stroke="1.9" />
            </div>

            <div class="min-w-0 flex-1">
              <div class="truncate text-sm font-medium text-app">{{ file.name }}</div>
              <div v-if="attachmentStatusText(file)" class="mt-1 truncate text-xs text-app-muted">{{ attachmentStatusText(file) }}</div>
            </div>

            <button
              class="btn-ghost absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full disabled:opacity-40"
              :disabled="file.status === 'uploading'"
              aria-label="移除附件"
              @click="emit('removeAttachment', file.id)"
            >
              <IconX class="h-3.5 w-3.5" stroke="2" />
            </button>
          </div>
        </div>

        <div class="mb-3 flex items-center justify-between gap-3">
          <div class="no-drag flex items-center gap-2">
            <button class="btn-muted flex h-9 w-9 items-center justify-center rounded-full disabled:cursor-not-allowed disabled:opacity-55" :disabled="uploading || sending" aria-label="添加图片" @click="emit('attach', 'image')">
              <IconPhoto class="h-4.5 w-4.5" stroke="1.9" />
            </button>
            <button class="btn-muted flex h-9 w-9 items-center justify-center rounded-full disabled:cursor-not-allowed disabled:opacity-55" :disabled="uploading || sending" aria-label="添加文档" @click="emit('attach', 'document')">
              <IconFileText class="h-4.5 w-4.5" stroke="1.9" />
            </button>
            <button class="btn-muted flex h-9 w-9 items-center justify-center rounded-full disabled:cursor-not-allowed disabled:opacity-55" :disabled="uploading || sending" aria-label="添加视频" @click="emit('attach', 'video')">
              <IconVideo class="h-4.5 w-4.5" stroke="1.9" />
            </button>
          </div>
          <div class="text-app-muted text-xs">
            <span v-if="activeAgent">{{ activeAgent.name }}</span>
            <span v-if="sending"> · 正在生成…</span>
          </div>
        </div>

        <div class="panel-plain no-drag flex items-end gap-3 rounded-[20px] px-4 pb-4">
          <textarea
            v-model="draft"
            class="textarea-base text-app min-h-[78px] flex-1 resize-none bg-transparent px-1 py-1 text-[15px] leading-7 placeholder:text-[color:var(--app-text-muted)]"
            placeholder="输入消息，Enter 发送，Shift + Enter 换行"
            rows="1"
            :disabled="sending"
            @keydown="onKeydown"
            @contextmenu="showEditableContextMenu($event)"
          />
          <div class="flex items-center gap-2">
            <button v-if="sending" class="btn-muted rounded-2xl px-4 py-3 text-sm" @click="emit('cancel')">停止</button>
            <button v-else class="btn-accent rounded-2xl px-5 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-55" :disabled="!canSend" @click="submit">发送</button>
          </div>
        </div>
      </footer>
    </template>
  </section>
</template>

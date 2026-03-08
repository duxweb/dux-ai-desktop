<script setup lang="ts">
import { computed } from 'vue'
import { marked } from 'marked'

const props = defineProps<{
  message: any
}>()

const roleLabelMap: Record<string, string> = {
  user: '你',
  assistant: 'Dux AI',
  system: '系统',
  tool: '工具',
}

const roleLabel = computed(() => roleLabelMap[props.message.role] || props.message.role)
const isUser = computed(() => props.message.role === 'user')
const html = computed(() => {
  const rendered = marked.parse(String(props.message.displayText || props.message.content || ''))
  return typeof rendered === 'string' ? rendered : ''
})
</script>

<template>
  <div class="flex gap-3" :class="isUser ? 'justify-end' : 'justify-start'">
    <div v-if="!isUser" class="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-white/6 text-sm font-bold text-white/82">
      {{ roleLabel.slice(0, 1) }}
    </div>

    <div class="max-w-[82%]">
      <div class="mb-2 flex items-center gap-2" :class="isUser ? 'justify-end' : 'justify-start'">
        <span class="text-sm font-semibold text-white/86">{{ roleLabel }}</span>
        <span class="text-sm text-white/34">{{ message.created_at_label || message.created_at || '' }}</span>
      </div>

      <div
        class="rounded-[22px] border px-4 py-3"
        :class="isUser
          ? 'border-blue-400/18 bg-[#16233f] text-white/92'
          : 'border-white/7 bg-[#141922] text-white/88'"
      >
        <div class="markdown-body" v-html="html" />
        <div v-if="message.attachments?.length" class="mt-3 flex flex-wrap gap-2">
          <div v-for="file in message.attachments" :key="file.id || file.path || file.filename" class="rounded-2xl border border-white/8 bg-white/4 px-3 py-2 text-sm text-white/70">
            <div class="font-medium text-white/86">{{ file.filename || file.name || '附件' }}</div>
            <div class="mt-1 text-white/40">{{ file.mime_type || file.media_kind || file.kind || 'file' }}</div>
          </div>
        </div>
      </div>
    </div>

    <div v-if="isUser" class="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-blue-500/20 text-xs font-bold text-blue-100">
      {{ roleLabel.slice(0, 1) }}
    </div>
  </div>
</template>

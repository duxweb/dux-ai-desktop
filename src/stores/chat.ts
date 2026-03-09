import dayjs from 'dayjs'
import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type {
  AgentOption,
  ChatDraftInput,
  ChatMessage,
  DraftAttachment,
  FileUploadItem,
  SessionItem,
} from '../types/chat'
import { buildUserMessage, decomposeContent, DuxAiClient, titleFromInput } from '../lib/dux-ai'
import { emptySettings } from '../lib/settings-repository'
import { basename, detectAttachmentKind, pickLocalFiles, safeErrorMessage } from '../lib/runtime'
import { useSettingsStore } from './settings'

function sortSessions(items: SessionItem[]): SessionItem[] {
  return [...items].sort((left, right) => {
    const a = left.last_message_at || left.updated_at || left.created_at || ''
    const b = right.last_message_at || right.updated_at || right.created_at || ''
    return b.localeCompare(a)
  })
}

function makeDraftMessage(role: 'user' | 'assistant', content: ChatMessage['content'], meta?: ChatMessage['meta']): ChatMessage {
  return {
    id: `draft-${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    role,
    content,
    created_at: new Date().toISOString(),
    meta,
  }
}

export const useChatStore = defineStore('chat', () => {
  const settingsStore = useSettingsStore()

  const agents = ref<AgentOption[]>([])
  const sessions = ref<SessionItem[]>([])
  const messagesBySession = ref<Record<number, ChatMessage[]>>({})
  const currentAgentId = ref('')
  const currentSessionId = ref<number | null>(null)
  const pendingAttachments = ref<DraftAttachment[]>([])
  const loadingAgents = ref(false)
  const loadingSessions = ref(false)
  const loadingMessages = ref(false)
  const sending = ref(false)
  const bootstrapped = ref(false)
  const lastError = ref('')

  let streamAbortController: AbortController | null = null

  const client = computed(() => new DuxAiClient({
    getSettings: () => settingsStore.settings || emptySettings(),
  }))

  const currentAgent = computed(() => agents.value.find(item => item.id === currentAgentId.value) || null)
  const currentSession = computed(() => sessions.value.find(item => item.id === currentSessionId.value) || null)
  const currentMessages = computed(() => currentSessionId.value ? (messagesBySession.value[currentSessionId.value] || []) : [])

  const messages = computed(() => {
    return currentMessages.value.map((message) => {
      const { text, attachments } = decomposeContent(message.content)
      return {
        ...message,
        localId: String(message.id),
        displayText: text || (attachments.length ? '已发送附件' : ''),
        attachments,
        created_at_label: message.created_at ? dayjs(message.created_at).format('MM/DD HH:mm') : '',
      }
    })
  })

  const uploading = computed(() => pendingAttachments.value.some(item => item.status === 'uploading'))
  const booting = computed(() => !bootstrapped.value && (loadingAgents.value || loadingSessions.value || loadingMessages.value))
  const error = computed(() => lastError.value)
  const activeAgent = computed(() => currentAgent.value)
  const activeSession = computed(() => currentSession.value)
  const activeAgentCode = computed(() => currentAgentId.value)
  const activeSessionId = computed(() => currentSessionId.value)

  function revokeAttachmentPreview(item: DraftAttachment) {
    if (item.previewUrl?.startsWith('blob:')) {
      URL.revokeObjectURL(item.previewUrl)
    }
  }

  function clearPendingAttachments() {
    pendingAttachments.value.forEach(revokeAttachmentPreview)
    pendingAttachments.value = []
  }

  function resetState() {
    cancelCurrentStream()
    agents.value = []
    sessions.value = []
    messagesBySession.value = {}
    currentAgentId.value = ''
    currentSessionId.value = null
    clearPendingAttachments()
    loadingAgents.value = false
    loadingSessions.value = false
    loadingMessages.value = false
    sending.value = false
    lastError.value = ''
    bootstrapped.value = false
  }

  async function bootstrap(force = false) {
    if (bootstrapped.value && !force) {
      return
    }
    if (!settingsStore.configured) {
      resetState()
      return
    }

    lastError.value = ''
    await refreshAgents()

    if (!currentAgentId.value && agents.value[0]) {
      currentAgentId.value = agents.value[0].id
    }

    await refreshSessions()

    if (!currentSessionId.value && sessions.value[0]) {
      currentSessionId.value = sessions.value[0].id
    }

    if (currentSessionId.value) {
      await refreshMessages(currentSessionId.value)
    }

    bootstrapped.value = true
  }

  async function refreshAgents() {
    loadingAgents.value = true
    lastError.value = ''

    try {
      agents.value = await client.value.listModels()
      if (!agents.value.some(item => item.id === currentAgentId.value)) {
        currentAgentId.value = agents.value[0]?.id || ''
      }
      return agents.value
    }
    catch (error) {
      lastError.value = safeErrorMessage(error, '加载智能体失败')
      throw error
    }
    finally {
      loadingAgents.value = false
    }
  }

  async function refreshSessions() {
    if (!currentAgentId.value) {
      sessions.value = []
      currentSessionId.value = null
      return []
    }

    loadingSessions.value = true
    lastError.value = ''

    try {
      const data = await client.value.listSessions(currentAgentId.value)
      sessions.value = sortSessions(data)
      if (!sessions.value.some(item => item.id === currentSessionId.value)) {
        currentSessionId.value = sessions.value[0]?.id || null
      }
      return sessions.value
    }
    catch (error) {
      lastError.value = safeErrorMessage(error, '加载会话失败')
      throw error
    }
    finally {
      loadingSessions.value = false
    }
  }

  async function refreshMessages(sessionId = currentSessionId.value) {
    if (!sessionId) {
      return []
    }

    loadingMessages.value = true
    lastError.value = ''

    try {
      const data = await client.value.listMessages(sessionId)
      messagesBySession.value = {
        ...messagesBySession.value,
        [sessionId]: data,
      }
      return data
    }
    catch (error) {
      lastError.value = safeErrorMessage(error, '加载消息失败')
      throw error
    }
    finally {
      loadingMessages.value = false
    }
  }

  async function selectAgent(agentId: string) {
    if (!agentId || agentId === currentAgentId.value) {
      return
    }
    cancelCurrentStream()
    currentAgentId.value = agentId
    currentSessionId.value = null
    clearPendingAttachments()
    await refreshSessions()
    if (currentSessionId.value) {
      await refreshMessages(currentSessionId.value)
    }
  }

  async function selectSession(sessionId: number) {
    if (sessionId === currentSessionId.value) {
      return
    }
    cancelCurrentStream()
    currentSessionId.value = sessionId
    if (!messagesBySession.value[sessionId]) {
      await refreshMessages(sessionId)
    }
  }

  async function createSession() {
    if (!currentAgentId.value) {
      throw new Error('当前没有可用智能体')
    }

    const session = await client.value.createSession(currentAgentId.value)
    sessions.value = sortSessions([session, ...sessions.value.filter(item => item.id !== session.id)])
    currentSessionId.value = session.id
    messagesBySession.value = {
      ...messagesBySession.value,
      [session.id]: [],
    }
    return session
  }

  async function renameSession(payload: { id: number, title: string }) {
    const session = await client.value.renameSession(payload.id, payload.title)
    sessions.value = sortSessions(sessions.value.map(item => item.id === payload.id ? { ...item, ...session } : item))
    return session
  }

  async function deleteSession(sessionId: number) {
    await client.value.deleteSession(sessionId)
    const next = sessions.value.filter(item => item.id !== sessionId)
    const { [sessionId]: _removed, ...rest } = messagesBySession.value
    messagesBySession.value = rest
    sessions.value = sortSessions(next)

    if (currentSessionId.value === sessionId) {
      currentSessionId.value = sessions.value[0]?.id || null
      if (currentSessionId.value) {
        await refreshMessages(currentSessionId.value)
      }
    }
  }

  function removePendingAttachment(id: string) {
    const current = pendingAttachments.value.find(item => item.id === id)
    if (current) {
      revokeAttachmentPreview(current)
    }
    pendingAttachments.value = pendingAttachments.value.filter(item => item.id !== id)
  }

  async function pickAndUploadFile(kind: 'image' | 'document' | 'video' = 'document') {
    if (!currentAgentId.value) {
      throw new Error('请先选择智能体')
    }

    const picked = await pickLocalFiles(kind)
    if (!picked.length) {
      return
    }

    for (const item of picked) {
      const draft: DraftAttachment = {
        id: item.id,
        name: item.name,
        mimeType: item.mimeType,
        size: item.size,
        kind: detectAttachmentKind(item.name, item.mimeType || ''),
        previewUrl: item.file && detectAttachmentKind(item.name, item.mimeType || '') === 'image' ? URL.createObjectURL(item.file) : '',
        path: item.path,
        file: item.file,
        status: 'uploading',
      }
      pendingAttachments.value = [...pendingAttachments.value, draft]

      try {
        const remote = await client.value.uploadAttachment(currentAgentId.value, draft)
        draft.remote = remote
        draft.status = 'uploaded'
        draft.mimeType = draft.mimeType || remote.mime_type || ''
        draft.size = draft.size || remote.bytes || 0
        draft.kind = detectAttachmentKind(draft.name, draft.mimeType || remote.mime_type || '')
        if (!draft.previewUrl && draft.kind === 'image' && remote.url) {
          draft.previewUrl = remote.url
        }
      }
      catch (error) {
        draft.status = 'error'
        draft.error = safeErrorMessage(error, '附件上传失败')
        lastError.value = draft.error
      }
      finally {
        pendingAttachments.value = [...pendingAttachments.value]
      }
    }
  }

  async function ensureSessionForSend() {
    if (currentSessionId.value) {
      return currentSessionId.value
    }
    const created = await createSession()
    return created.id
  }

  async function sendMessage(text: string) {
    const queuedAttachments = [...pendingAttachments.value]
    const input: ChatDraftInput = {
      text,
      attachments: queuedAttachments,
    }
    const trimmed = input.text.trim()
    const uploaded = queuedAttachments
      .filter(item => item.remote)
      .map(item => item.remote as FileUploadItem)

    if (!trimmed && uploaded.length === 0) {
      return
    }
    if (!currentAgentId.value) {
      throw new Error('当前没有可用智能体')
    }

    sending.value = true
    lastError.value = ''
    cancelCurrentStream()
    pendingAttachments.value = []

    const sessionId = await ensureSessionForSend()
    const userMessage = buildUserMessage(trimmed, uploaded)
    const optimisticUser = makeDraftMessage('user', userMessage.content)
    const optimisticAssistant = makeDraftMessage('assistant', '', { status: 'loading' })
    const history = messagesBySession.value[sessionId] || []

    messagesBySession.value = {
      ...messagesBySession.value,
      [sessionId]: [...history, optimisticUser, optimisticAssistant],
    }

    if (currentSession.value && !currentSession.value.title && trimmed) {
      sessions.value = sortSessions(sessions.value.map(item => item.id === sessionId ? { ...item, title: titleFromInput(input) } : item))
    }

    streamAbortController = new AbortController()

    try {
      for await (const event of client.value.streamChat({
        model: currentAgentId.value,
        sessionId,
        messages: [userMessage],
        signal: streamAbortController.signal,
      })) {
        if (event.type === 'session') {
          currentSessionId.value = event.sessionId
          continue
        }

        if (event.type === 'delta') {
          const current = messagesBySession.value[sessionId] || []
          const last = current[current.length - 1]
          if (!last || last.role !== 'assistant') {
            continue
          }

          let nextContent = last.content
          if (typeof event.text === 'string' && event.text) {
            nextContent = `${typeof nextContent === 'string' ? nextContent : ''}${event.text}`
          }
          else if (event.parts?.length) {
            nextContent = Array.isArray(nextContent) ? [...nextContent, ...event.parts] : event.parts
          }

          messagesBySession.value = {
            ...messagesBySession.value,
            [sessionId]: [
              ...current.slice(0, -1),
              {
                ...last,
                content: nextContent,
              },
            ],
          }
          continue
        }

        if (event.type === 'error') {
          throw event.error
        }
      }

      queuedAttachments.forEach(revokeAttachmentPreview)
      await refreshSessions()
      await refreshMessages(sessionId)
    }
    catch (error) {
      pendingAttachments.value = queuedAttachments
      const errorMessage = safeErrorMessage(error, '发送消息失败')
      const current = messagesBySession.value[sessionId] || []
      const last = current[current.length - 1]

      if (last?.role === 'assistant') {
        messagesBySession.value = {
          ...messagesBySession.value,
          [sessionId]: [
            ...current.slice(0, -1),
            {
              ...last,
              content: errorMessage,
              meta: {
                ...(last.meta || {}),
                status: 'error',
              },
            },
          ],
        }
      }
      else {
        messagesBySession.value = {
          ...messagesBySession.value,
          [sessionId]: [
            ...current,
            makeDraftMessage('assistant', errorMessage, { status: 'error' }),
          ],
        }
      }
      throw error
    }
    finally {
      sending.value = false
      streamAbortController = null
    }
  }


  async function retryLastMessage() {
    const sessionId = currentSessionId.value
    if (!sessionId || sending.value) {
      return
    }
    const current = messagesBySession.value[sessionId] || []
    const lastUser = [...current].reverse().find(item => item.role === 'user')
    if (!lastUser) {
      return
    }
    const { text } = decomposeContent(lastUser.content)
    if (!text.trim()) {
      return
    }
    await sendMessage(text)
  }

  async function refreshCurrentSession() {
    if (!currentSessionId.value) {
      return []
    }
    await refreshSessions()
    return await refreshMessages(currentSessionId.value)
  }

  function cancelCurrentStream() {
    if (streamAbortController) {
      streamAbortController.abort()
      streamAbortController = null
    }
  }

  return {
    agents,
    sessions,
    messages,
    pendingAttachments,
    removePendingAttachment,
    sending,
    uploading,
    booting,
    error,
    activeAgent,
    activeSession,
    activeAgentCode,
    activeSessionId,
    bootstrap,
    selectAgent,
    selectSession,
    createSession,
    renameSession,
    deleteSession,
    sendMessage,
    retryLastMessage,
    refreshCurrentSession,
    cancelCurrentStream,
    pickAndUploadFile,
  }
})

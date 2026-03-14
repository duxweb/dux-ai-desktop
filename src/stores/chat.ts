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
import { detectAttachmentKind, pickLocalFiles, safeErrorMessage } from '../lib/runtime'
import { useSettingsStore } from './settings'

interface SessionRuntimeState {
  streaming: boolean
  loadingMessages: boolean
  lastMessageId: number
  pendingUserDraftId: string | null
  pendingAssistantDraftId: string | null
  error: string
  requestSeq: number
}

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

function isDraftMessage(message: ChatMessage | undefined) {
  return typeof message?.id === 'string' && String(message.id).startsWith('draft-')
}

function messageNumericId(message: ChatMessage | undefined): number {
  if (!message) {
    return 0
  }
  const value = Number(message.id)
  return Number.isFinite(value) ? value : 0
}

function contentSignature(content: ChatMessage['content']): string {
  if (typeof content === 'string') {
    return content.trim()
  }
  if (!Array.isArray(content)) {
    return ''
  }
  return JSON.stringify(content)
}

export const useChatStore = defineStore('chat', () => {
  const settingsStore = useSettingsStore()

  const agents = ref<AgentOption[]>([])
  const sessions = ref<SessionItem[]>([])
  const messagesBySession = ref<Record<number, ChatMessage[]>>({})
  const sessionRuntimeById = ref<Record<number, SessionRuntimeState>>({})
  const currentAgentId = ref('')
  const currentSessionId = ref<number | null>(null)
  const pendingAttachments = ref<DraftAttachment[]>([])
  const loadingAgents = ref(false)
  const loadingSessions = ref(false)
  const creatingSession = ref(false)
  const deletingSessionIds = ref<number[]>([])
  const deletedSessionIds = ref<number[]>([])
  const renamingSessionId = ref<number | null>(null)
  const bootstrapped = ref(false)
  const lastError = ref('')

  let sessionsRequestSeq = 0
  const streamAbortControllers = new Map<number, AbortController>()

  const client = computed(() => new DuxAiClient({
    getSettings: () => settingsStore.settings || emptySettings(),
  }))

  const currentAgent = computed(() => agents.value.find(item => item.id === currentAgentId.value) || null)
  const currentSession = computed(() => sessions.value.find(item => item.id === currentSessionId.value) || null)
  const currentMessages = computed(() => currentSessionId.value ? (messagesBySession.value[currentSessionId.value] || []) : [])
  const currentRuntime = computed(() => currentSessionId.value ? ensureSessionRuntime(currentSessionId.value) : emptySessionRuntime())

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
  const booting = computed(() => !bootstrapped.value && (loadingAgents.value || loadingSessions.value || currentRuntime.value.loadingMessages))
  const error = computed(() => currentRuntime.value.error || lastError.value)
  const activeAgent = computed(() => currentAgent.value)
  const activeSession = computed(() => currentSession.value)
  const activeAgentCode = computed(() => currentAgentId.value)
  const activeSessionId = computed(() => currentSessionId.value)
  const sending = computed(() => currentRuntime.value.streaming)

  function emptySessionRuntime(): SessionRuntimeState {
    return {
      streaming: false,
      loadingMessages: false,
      lastMessageId: 0,
      pendingUserDraftId: null,
      pendingAssistantDraftId: null,
      error: '',
      requestSeq: 0,
    }
  }

  function ensureSessionRuntime(sessionId: number): SessionRuntimeState {
    const current = sessionRuntimeById.value[sessionId]
    if (current) {
      return current
    }
    const next = emptySessionRuntime()
    sessionRuntimeById.value = {
      ...sessionRuntimeById.value,
      [sessionId]: next,
    }
    return next
  }

  function updateSessionRuntime(sessionId: number, updater: (current: SessionRuntimeState) => SessionRuntimeState) {
    const current = ensureSessionRuntime(sessionId)
    sessionRuntimeById.value = {
      ...sessionRuntimeById.value,
      [sessionId]: updater({ ...current }),
    }
  }

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
    cancelAllStreams()
    agents.value = []
    sessions.value = []
    messagesBySession.value = {}
    sessionRuntimeById.value = {}
    currentAgentId.value = ''
    currentSessionId.value = null
    clearPendingAttachments()
    loadingAgents.value = false
    loadingSessions.value = false
    creatingSession.value = false
    deletingSessionIds.value = []
    deletedSessionIds.value = []
    renamingSessionId.value = null
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

    await refreshSessions({ preserveCurrent: false })

    if (!currentSessionId.value && sessions.value[0]) {
      currentSessionId.value = sessions.value[0].id
    }

    if (currentSessionId.value) {
      await refreshMessages(currentSessionId.value, { forceFull: false, silent: true })
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

  async function refreshSessions(options: { preserveCurrent?: boolean } = {}) {
    if (!currentAgentId.value) {
      sessions.value = []
      currentSessionId.value = null
      return []
    }

    const requestSeq = ++sessionsRequestSeq
    loadingSessions.value = true
    lastError.value = ''

    try {
      const data = await client.value.listSessions(currentAgentId.value)
      if (requestSeq !== sessionsRequestSeq) {
        return sessions.value
      }

      const incoming = data.filter(item => !deletedSessionIds.value.includes(item.id))
      const localCurrent = currentSessionId.value ? sessions.value.find(item => item.id === currentSessionId.value) || null : null
      const currentRuntime = currentSessionId.value ? ensureSessionRuntime(currentSessionId.value) : null
      if (localCurrent && !incoming.some(item => item.id === localCurrent.id) && !deletedSessionIds.value.includes(localCurrent.id) && (currentRuntime?.streaming || (messagesBySession.value[localCurrent.id] || []).length > 0)) {
        incoming.unshift(localCurrent)
      }

      sessions.value = sortSessions(incoming)
      const preserveCurrent = options.preserveCurrent !== false
      if (!preserveCurrent && !currentSessionId.value) {
        currentSessionId.value = sessions.value[0]?.id || null
      }
      else if (currentSessionId.value && !sessions.value.some(item => item.id === currentSessionId.value)) {
        currentSessionId.value = sessions.value[0]?.id || null
      }
      return sessions.value
    }
    catch (error) {
      lastError.value = safeErrorMessage(error, '加载会话失败')
      throw error
    }
    finally {
      if (requestSeq === sessionsRequestSeq) {
        loadingSessions.value = false
      }
    }
  }

  function mergeMessages(sessionId: number, incoming: ChatMessage[], replace = false) {
    const runtime = ensureSessionRuntime(sessionId)
    const current = messagesBySession.value[sessionId] || []
    const userDraft = runtime.pendingUserDraftId
      ? current.find(message => String(message.id) === runtime.pendingUserDraftId)
      : null
    const assistantDraft = runtime.pendingAssistantDraftId
      ? current.find(message => String(message.id) === runtime.pendingAssistantDraftId)
      : null

    const serverMessages = replace
      ? incoming.filter(message => !isDraftMessage(message))
      : [
          ...current.filter(message => !isDraftMessage(message) && !incoming.some(next => String(next.id) === String(message.id))),
          ...incoming,
        ]

    const userDraftSignature = contentSignature(userDraft?.content || '')
    const assistantDraftSignature = contentSignature(assistantDraft?.content || '')
    const hasResolvedUser = !!userDraft && serverMessages.some((message) => {
      return !isDraftMessage(message)
        && message.role === 'user'
        && contentSignature(message.content) === userDraftSignature
    })
    const hasResolvedAssistant = !!assistantDraft && (
      serverMessages.some((message) => {
        if (isDraftMessage(message) || message.role !== 'assistant') {
          return false
        }
        if (assistantDraftSignature) {
          return contentSignature(message.content) === assistantDraftSignature
        }
        return messageNumericId(message) > runtime.lastMessageId
      })
    )

    const nextMessages = [...serverMessages]
    if (userDraft && !hasResolvedUser) {
      nextMessages.push(userDraft)
    }
    if (assistantDraft && !hasResolvedAssistant) {
      nextMessages.push(assistantDraft)
    }

    messagesBySession.value = {
      ...messagesBySession.value,
      [sessionId]: nextMessages,
    }

    const nextLastId = nextMessages.reduce((max, message) => Math.max(max, messageNumericId(message)), 0)
    updateSessionRuntime(sessionId, current => ({
      ...current,
      lastMessageId: nextLastId,
      pendingUserDraftId: hasResolvedUser ? null : current.pendingUserDraftId,
      pendingAssistantDraftId: hasResolvedAssistant ? null : current.pendingAssistantDraftId,
    }))
  }

  async function refreshMessages(sessionId = currentSessionId.value, options: { forceFull?: boolean, silent?: boolean } = {}) {
    if (!sessionId) {
      return []
    }

    const runtime = ensureSessionRuntime(sessionId)
    const nextRequestSeq = runtime.requestSeq + 1
    updateSessionRuntime(sessionId, current => ({
      ...current,
      loadingMessages: true,
      error: options.silent ? current.error : '',
      requestSeq: nextRequestSeq,
    }))

    try {
      const afterId = options.forceFull ? 0 : runtime.lastMessageId
      const data = await client.value.listMessages(sessionId, { limit: 200, afterId })
      const latest = ensureSessionRuntime(sessionId)
      if (latest.requestSeq !== nextRequestSeq) {
        return messagesBySession.value[sessionId] || []
      }

      mergeMessages(sessionId, data, afterId <= 0)
      return messagesBySession.value[sessionId] || []
    }
    catch (error) {
      const errorMessage = safeErrorMessage(error, '加载消息失败')
      updateSessionRuntime(sessionId, current => ({
        ...current,
        error: errorMessage,
      }))
      if (!options.silent) {
        lastError.value = errorMessage
      }
      throw error
    }
    finally {
      const latest = ensureSessionRuntime(sessionId)
      if (latest.requestSeq === nextRequestSeq) {
        updateSessionRuntime(sessionId, current => ({
          ...current,
          loadingMessages: false,
        }))
      }
    }
  }

  async function selectAgent(agentId: string) {
    if (!agentId || agentId === currentAgentId.value) {
      return
    }
    currentAgentId.value = agentId
    currentSessionId.value = null
    clearPendingAttachments()
    await refreshSessions({ preserveCurrent: false })
    if (currentSessionId.value) {
      await refreshMessages(currentSessionId.value, { forceFull: false, silent: true })
    }
  }

  async function selectSession(sessionId: number) {
    if (!sessionId || sessionId === currentSessionId.value) {
      return
    }
    currentSessionId.value = sessionId
    ensureSessionRuntime(sessionId)
    await refreshMessages(sessionId, { forceFull: false, silent: true })
  }

  async function createSession() {
    if (!currentAgentId.value) {
      throw new Error('当前没有可用智能体')
    }

    creatingSession.value = true
    const requestSeq = ++sessionsRequestSeq
    try {
      const session = await client.value.createSession(currentAgentId.value)
      if (requestSeq !== sessionsRequestSeq) {
        return session
      }
      deletedSessionIds.value = deletedSessionIds.value.filter(id => id !== session.id)
      sessions.value = [session, ...sessions.value.filter(item => item.id !== session.id)]
      sessions.value = sortSessions(sessions.value)
      currentSessionId.value = session.id
      messagesBySession.value = {
        ...messagesBySession.value,
        [session.id]: [],
      }
      ensureSessionRuntime(session.id)
      return session
    }
    finally {
      creatingSession.value = false
    }
  }

  async function renameSession(payload: { id: number, title: string }) {
    const title = payload.title.trim()
    if (!title) {
      return null
    }
    renamingSessionId.value = payload.id
    const original = sessions.value.find(item => item.id === payload.id) || null
    sessions.value = sortSessions(sessions.value.map(item => item.id === payload.id ? { ...item, title } : item))
    try {
      const session = await client.value.renameSession(payload.id, title)
      sessions.value = sortSessions(sessions.value.map(item => item.id === payload.id ? { ...item, ...session } : item))
      return session
    }
    catch (error) {
      const errorMessage = safeErrorMessage(error, '重命名会话失败')
      lastError.value = errorMessage
      if (original) {
        sessions.value = sortSessions(sessions.value.map(item => item.id === payload.id ? original : item))
      }
      throw error
    }
    finally {
      renamingSessionId.value = null
    }
  }

  async function deleteSession(sessionId: number) {
    const existed = sessions.value.find(item => item.id === sessionId)
    if (!existed) {
      return
    }

    deletingSessionIds.value = [...new Set([...deletingSessionIds.value, sessionId])]
    deletedSessionIds.value = [...new Set([...deletedSessionIds.value, sessionId])]
    const nextSessions = sessions.value.filter(item => item.id !== sessionId)
    const { [sessionId]: _removedMessages, ...restMessages } = messagesBySession.value
    const { [sessionId]: _removedRuntime, ...restRuntime } = sessionRuntimeById.value
    messagesBySession.value = restMessages
    sessionRuntimeById.value = restRuntime
    sessions.value = sortSessions(nextSessions)

    if (currentSessionId.value === sessionId) {
      currentSessionId.value = sessions.value[0]?.id || null
      if (currentSessionId.value) {
        await refreshMessages(currentSessionId.value, { forceFull: false, silent: true })
      }
    }

    try {
      await client.value.deleteSession(sessionId)
    }
    catch (error) {
      lastError.value = safeErrorMessage(error, '删除会话失败')
      throw error
    }
    finally {
      deletingSessionIds.value = deletingSessionIds.value.filter(id => id !== sessionId)
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

  async function startStreamForSession(sessionId: number, userMessage: ChatMessage['content'], titleHint = '') {
    const optimisticUser = makeDraftMessage('user', userMessage)
    const optimisticAssistant = makeDraftMessage('assistant', '', { status: 'loading' })
    const history = messagesBySession.value[sessionId] || []

    messagesBySession.value = {
      ...messagesBySession.value,
      [sessionId]: [...history, optimisticUser, optimisticAssistant],
    }

    updateSessionRuntime(sessionId, current => ({
      ...current,
      streaming: true,
      pendingUserDraftId: String(optimisticUser.id),
      pendingAssistantDraftId: String(optimisticAssistant.id),
      error: '',
    }))

    if (currentSession.value && !currentSession.value.title && titleHint) {
      sessions.value = sortSessions(sessions.value.map(item => item.id === sessionId ? { ...item, title: titleHint } : item))
    }

    const controller = new AbortController()
    streamAbortControllers.set(sessionId, controller)

    try {
      for await (const event of client.value.streamChat({
        model: currentAgentId.value,
        sessionId,
        messages: [{ role: 'user', content: userMessage }],
        signal: controller.signal,
      })) {
        if (event.type === 'session') {
          continue
        }

        if (event.type === 'delta') {
          const current = messagesBySession.value[sessionId] || []
          const draftId = ensureSessionRuntime(sessionId).pendingAssistantDraftId
          const index = current.findIndex(message => String(message.id) === String(draftId))
          if (index < 0) {
            continue
          }
          const last = current[index]
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
              ...current.slice(0, index),
              {
                ...last,
                content: nextContent,
                meta: {
                  ...(last.meta || {}),
                  status: 'loading',
                },
              },
              ...current.slice(index + 1),
            ],
          }
          continue
        }

        if (event.type === 'error') {
          throw event.error
        }
      }

      await refreshSessions({ preserveCurrent: true })
      await refreshMessages(sessionId, { forceFull: false, silent: true })
    }
    catch (error) {
      const errorMessage = safeErrorMessage(error, '发送消息失败')
      const current = messagesBySession.value[sessionId] || []
      const draftId = ensureSessionRuntime(sessionId).pendingAssistantDraftId
      const index = current.findIndex(message => String(message.id) === String(draftId))

      if (index >= 0) {
        const last = current[index]
        messagesBySession.value = {
          ...messagesBySession.value,
          [sessionId]: [
            ...current.slice(0, index),
            {
              ...last,
              content: errorMessage,
              meta: {
                ...(last.meta || {}),
                status: 'error',
              },
            },
            ...current.slice(index + 1),
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
      updateSessionRuntime(sessionId, current => ({
        ...current,
        error: errorMessage,
        pendingUserDraftId: null,
      pendingAssistantDraftId: null,
      }))
      throw error
    }
    finally {
      streamAbortControllers.delete(sessionId)
      updateSessionRuntime(sessionId, current => ({
        ...current,
        streaming: false,
      }))
    }
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

    lastError.value = ''
    pendingAttachments.value = []

    const sessionId = await ensureSessionForSend()
    const userMessage = buildUserMessage(trimmed, uploaded)

    try {
      await startStreamForSession(sessionId, userMessage.content, titleFromInput(input))
      queuedAttachments.forEach(revokeAttachmentPreview)
    }
    catch (error) {
      pendingAttachments.value = queuedAttachments
      throw error
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
    lastError.value = ''
    await startStreamForSession(sessionId, lastUser.content)
  }

  async function refreshCurrentSession(options: { silent?: boolean } = {}) {
    if (!currentSessionId.value || creatingSession.value) {
      return []
    }
    await refreshSessions({ preserveCurrent: true })
    return await refreshMessages(currentSessionId.value, { forceFull: false, silent: options.silent })
  }

  function cancelCurrentStream(sessionId = currentSessionId.value) {
    if (!sessionId) {
      return
    }
    const controller = streamAbortControllers.get(sessionId)
    if (controller) {
      controller.abort()
      streamAbortControllers.delete(sessionId)
    }
  }

  function cancelAllStreams() {
    for (const controller of streamAbortControllers.values()) {
      controller.abort()
    }
    streamAbortControllers.clear()
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
    creatingSession,
    deletingSessionIds,
    renamingSessionId,
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

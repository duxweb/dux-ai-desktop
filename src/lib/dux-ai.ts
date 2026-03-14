import type {
  ApiEnvelope,
  AppSettings,
  AgentOption,
  ChatCompletionChunk,
  ChatContentPart,
  ChatDraftInput,
  ChatMessage,
  ChatRequestMessage,
  ChatStreamEvent,
  DraftAttachment,
  FileUploadItem,
  SessionItem,
} from '../types/chat'
import { isTauriRuntime, normalizeServerUrl, safeErrorMessage, withBasePath } from './runtime'

export class DuxAiApiError extends Error {
  status: number
  details?: unknown

  constructor(message: string, status = 0, details?: unknown) {
    super(message)
    this.name = 'DuxAiApiError'
    this.status = status
    this.details = details
  }
}

export interface DuxAiClientOptions {
  getSettings: () => AppSettings | Promise<AppSettings>
}

export interface StreamChatInput {
  model: string
  sessionId?: number | null
  messages: ChatRequestMessage[]
  signal?: AbortSignal
}

export interface ListMessagesOptions {
  limit?: number
  afterId?: number
}

interface NativeStreamDataPayload {
  streamId: string
  data: string
}

interface NativeStreamEndPayload {
  streamId: string
}

interface NativeStreamErrorPayload {
  streamId: string
  message: string
}

export class DuxAiClient {
  constructor(private readonly options: DuxAiClientOptions) {}

  async testConnection(): Promise<AgentOption[]> {
    return this.listModels()
  }

  async listModels(): Promise<AgentOption[]> {
    const data = await this.request<ApiEnvelope<AgentOption[]>>('/agent/v1/models')
    return Array.isArray(data.data) ? data.data : []
  }

  async listSessions(model?: string, limit = 50): Promise<SessionItem[]> {
    const query = new URLSearchParams({ limit: String(limit) })
    if (model) {
      query.set('model', model)
    }
    const data = await this.request<ApiEnvelope<SessionItem[]>>(`/agent/v1/sessions?${query.toString()}`)
    return Array.isArray(data.data) ? data.data : []
  }

  async createSession(model?: string): Promise<SessionItem> {
    const data = await this.request<ApiEnvelope<SessionItem>>('/agent/v1/sessions', {
      method: 'POST',
      body: { model },
    })
    return data.data
  }

  async renameSession(id: number, title: string): Promise<SessionItem> {
    const data = await this.request<ApiEnvelope<SessionItem>>(`/agent/v1/sessions/${id}`, {
      method: 'PUT',
      body: { title },
    })
    return data.data
  }

  async deleteSession(id: number): Promise<void> {
    await this.request(`/agent/v1/sessions/${id}`, {
      method: 'DELETE',
    })
  }

  async listMessages(sessionId: number, options: ListMessagesOptions = {}): Promise<ChatMessage[]> {
    const query = new URLSearchParams({ limit: String(options.limit ?? 200) })
    if (options.afterId && options.afterId > 0) {
      query.set('after_id', String(options.afterId))
    }
    const data = await this.request<ApiEnvelope<ChatMessage[]>>(`/agent/v1/sessions/${sessionId}/messages?${query.toString()}`)
    return Array.isArray(data.data)
      ? data.data.map(item => normalizeMessage(item))
      : []
  }

  async uploadAttachment(model: string, item: DraftAttachment): Promise<FileUploadItem> {
    const settings = await this.resolveSettings()
    this.ensureConfigured(settings)

    if (isTauriRuntime() && item.path) {
      const { invoke } = await import('@tauri-apps/api/core')
      const payload = await invoke<ApiEnvelope<FileUploadItem>>('upload_file', {
        request: {
          serverUrl: settings.serverUrl,
          token: settings.token,
          model,
          filePath: item.path,
        },
      })
      return payload.data
    }

    if (!item.file) {
      throw new DuxAiApiError('未找到可上传的文件')
    }

    const formData = new FormData()
    formData.append('file', item.file)

    const response = await fetch(withBasePath(settings.serverUrl, `/agent/v1/files?model=${encodeURIComponent(model)}`), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${settings.token}`,
      },
      body: formData,
    })

    const payload = await this.parseResponse<ApiEnvelope<FileUploadItem>>(response)
    return payload.data
  }

  async *streamChat(input: StreamChatInput): AsyncGenerator<ChatStreamEvent, void, undefined> {
    const settings = await this.resolveSettings()
    this.ensureConfigured(settings)

    if (isTauriRuntime()) {
      yield* this.streamViaTauri(settings, input)
      return
    }

    yield* this.streamViaBrowser(settings, input)
  }

  private async *streamViaTauri(settings: AppSettings, input: StreamChatInput): AsyncGenerator<ChatStreamEvent, void, undefined> {
    const { invoke } = await import('@tauri-apps/api/core')
    const { listen } = await import('@tauri-apps/api/event')

    const streamId = `stream-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const queue: ChatStreamEvent[] = []
    let done = false
    let notify: (() => void) | null = null

    const push = (event: ChatStreamEvent) => {
      queue.push(event)
      notify?.()
      notify = null
    }

    const waitForQueue = async () => {
      if (queue.length || done) {
        return
      }
      await new Promise<void>((resolve) => {
        notify = resolve
      })
    }

    const stop = async () => {
      done = true
      notify?.()
      notify = null
      await invoke('cancel_chat_stream', {
        request: {
          streamId,
        },
      }).catch(() => {})
    }

    const dataUnlisten = await listen<NativeStreamDataPayload>('chat-stream-data', (event) => {
      if (event.payload.streamId !== streamId) {
        return
      }
      for (const item of this.consumeSseDataLine(event.payload.data)) {
        push(item)
      }
    })

    const endUnlisten = await listen<NativeStreamEndPayload>('chat-stream-end', (event) => {
      if (event.payload.streamId !== streamId) {
        return
      }
      done = true
      notify?.()
      notify = null
    })

    const errorUnlisten = await listen<NativeStreamErrorPayload>('chat-stream-error', (event) => {
      if (event.payload.streamId !== streamId) {
        return
      }
      push({
        type: 'error',
        error: new DuxAiApiError(event.payload.message || '流式响应失败'),
      })
      done = true
    })

    const abortHandler = () => {
      void stop()
    }
    input.signal?.addEventListener('abort', abortHandler, { once: true })

    try {
      await invoke('start_chat_stream', {
        request: {
          streamId,
          windowLabel: 'main',
          serverUrl: settings.serverUrl,
          token: settings.token,
          model: input.model,
          sessionId: input.sessionId ?? null,
          messages: input.messages,
        },
      })

      while (!done || queue.length) {
        if (!queue.length) {
          await waitForQueue()
          continue
        }
        const next = queue.shift()
        if (next) {
          yield next
        }
      }
    }
    finally {
      input.signal?.removeEventListener('abort', abortHandler)
      dataUnlisten()
      endUnlisten()
      errorUnlisten()
      await stop()
    }
  }

  private async *streamViaBrowser(settings: AppSettings, input: StreamChatInput): AsyncGenerator<ChatStreamEvent, void, undefined> {
    const response = await fetch(withBasePath(settings.serverUrl, '/agent/v1/chat/completions'), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${settings.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: input.model,
        stream: true,
        session_id: input.sessionId ?? undefined,
        messages: input.messages,
      }),
      signal: input.signal,
    })

    if (!response.ok || !response.body) {
      const payload = await this.parseResponse(response)
      throw new DuxAiApiError(payload?.error?.message || payload?.message || '流式响应失败', response.status, payload)
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder('utf-8')
    let buffer = ''

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) {
          break
        }
        buffer += decoder.decode(value, { stream: true })
        const parts = buffer.split('\n\n')
        buffer = parts.pop() || ''
        for (const part of parts) {
          for (const event of this.consumeSseDataLine(part)) {
            yield event
          }
        }
      }
    }
    finally {
      reader.releaseLock()
    }
  }

  private consumeSseDataLine(block: string): ChatStreamEvent[] {
    const events: ChatStreamEvent[] = []
    for (const line of block.split('\n')) {
      if (!line.startsWith('data:')) {
        continue
      }
      const raw = line.slice(5).trim()
      if (!raw || raw === '[DONE]') {
        events.push({ type: 'done' })
        continue
      }
      let payload: ChatCompletionChunk
      try {
        payload = JSON.parse(raw)
      }
      catch {
        continue
      }

      if (payload.error?.message) {
        events.push({ type: 'error', error: new DuxAiApiError(payload.error.message, 0, payload) })
        continue
      }

      if (payload.session_id) {
        events.push({ type: 'session', sessionId: payload.session_id })
      }

      for (const choice of payload.choices || []) {
        if (choice.finish_reason) {
          events.push({ type: 'done', finishReason: choice.finish_reason, chunk: payload })
          continue
        }
        const delta = choice.delta || {}
        const text = typeof delta.content === 'string' ? delta.content : undefined
        const parts = Array.isArray(delta.content) ? delta.content : undefined
        if (text || parts?.length) {
          events.push({ type: 'delta', text, parts, chunk: payload })
        }
      }
    }
    return events
  }

  private async resolveSettings(): Promise<AppSettings> {
    const settings = await this.options.getSettings()
    return {
      serverUrl: normalizeServerUrl(settings.serverUrl || ''),
      token: settings.token || '',
    }
  }

  private ensureConfigured(settings: AppSettings) {
    if (!settings.serverUrl || !settings.token) {
      throw new DuxAiApiError('请先完成服务器地址和 Token 配置')
    }
  }

  private async request<T = any>(path: string, options: { method?: string, body?: any, query?: Record<string, any> } = {}): Promise<T> {
    const settings = await this.resolveSettings()
    this.ensureConfigured(settings)

    const url = new URL(withBasePath(settings.serverUrl, path))
    if (options.query) {
      for (const [key, value] of Object.entries(options.query)) {
        if (value === null || value === undefined || value === '') {
          continue
        }
        url.searchParams.set(key, String(value))
      }
    }

    const response = await fetch(url.toString(), {
      method: options.method || 'GET',
      headers: {
        Authorization: `Bearer ${settings.token}`,
        'Content-Type': 'application/json',
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    })

    return this.parseResponse<T>(response)
  }

  private async parseResponse<T = any>(response: Response): Promise<T> {
    const text = await response.text()
    let payload: any = null
    try {
      payload = text ? JSON.parse(text) : null
    }
    catch {
      payload = null
    }

    if (!response.ok) {
      throw new DuxAiApiError(payload?.error?.message || payload?.message || text || '请求失败', response.status, payload)
    }

    return payload as T
  }
}

function normalizeMessage(item: ChatMessage): ChatMessage {
  const content = normalizeContent(item.content)
  return {
    ...item,
    content,
  }
}

function normalizeContent(content: ChatMessage['content']): ChatMessage['content'] {
  if (Array.isArray(content)) {
    return content.map((part) => {
      if (!part || typeof part !== 'object') {
        return { type: 'text', text: String(part || '') } as ChatContentPart
      }
      return part as ChatContentPart
    })
  }
  return typeof content === 'string' ? content : String(content || '')
}

export function titleFromInput(input: ChatDraftInput) {
  const text = input.text.trim()
  if (text) {
    return text.slice(0, 20)
  }
  if (input.attachments?.length) {
    return input.attachments[0].name.slice(0, 20)
  }
  return '新会话'
}

export function buildUserMessage(text: string, attachments: FileUploadItem[]): ChatRequestMessage {
  const trimmed = text.trim()
  if (!attachments.length) {
    return {
      role: 'user',
      content: trimmed,
    }
  }

  const parts: ChatContentPart[] = []
  if (trimmed) {
    parts.push({ type: 'text', text: trimmed })
  }

  for (const attachment of attachments) {
    const mediaKind = attachment.media_kind || inferMediaKind(attachment)
    if (mediaKind === 'image') {
      parts.push({
        type: 'image_url',
        image_url: {
          url: attachment.url,
          name: attachment.filename,
          mime_type: attachment.mime_type,
        },
      })
      continue
    }
    if (mediaKind === 'video') {
      parts.push({
        type: 'video_url',
        video_url: {
          url: attachment.url,
          name: attachment.filename,
          mime_type: attachment.mime_type,
        },
      })
      continue
    }
    parts.push({
      type: 'file_url',
      file_url: {
        url: attachment.url,
        name: attachment.filename,
        mime_type: attachment.mime_type,
        provider_file_id: attachment.provider_file_id,
      },
    })
  }

  return {
    role: 'user',
    content: parts,
  }
}

export function decomposeContent(content: ChatMessage['content']) {
  if (typeof content === 'string') {
    return { text: content, attachments: [] as any[] }
  }

  const textParts: string[] = []
  const attachments: any[] = []
  for (const part of content || []) {
    if (part.type === 'text') {
      textParts.push(part.text || '')
      continue
    }
    if (part.type === 'image_url') {
      attachments.push({ kind: 'image', url: part.image_url.url, name: part.image_url.name || '图片', mimeType: part.image_url.mime_type || '' })
      continue
    }
    if (part.type === 'video_url') {
      attachments.push({ kind: 'video', url: part.video_url.url, name: part.video_url.name || '视频', mimeType: part.video_url.mime_type || '' })
      continue
    }
    if (part.type === 'file_url') {
      attachments.push({ kind: 'file', url: part.file_url.url, name: part.file_url.name || '文件', mimeType: part.file_url.mime_type || '' })
      continue
    }
    if (part.type === 'card') {
      attachments.push({ kind: 'card', card: part.card })
    }
  }
  return {
    text: textParts.join('\n').trim(),
    attachments,
  }
}

function inferMediaKind(file: FileUploadItem): string {
  const mime = String(file.mime_type || '').toLowerCase()
  if (mime.startsWith('image/')) {
    return 'image'
  }
  if (mime.startsWith('video/')) {
    return 'video'
  }
  return 'file'
}

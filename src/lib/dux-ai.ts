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

  async listMessages(sessionId: number, limit = 200): Promise<ChatMessage[]> {
    const query = new URLSearchParams({ limit: String(limit) })
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
        session_id: input.sessionId ?? undefined,
        stream: true,
        messages: input.messages,
      }),
      signal: input.signal,
    })

    if (!response.ok || !response.body) {
      throw await this.toApiError(response)
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) {
          break
        }

        buffer += decoder.decode(value, { stream: true })
        const blocks = buffer.split('\n\n')
        buffer = blocks.pop() ?? ''

        for (const block of blocks) {
          const lines = block
            .split(/\r?\n/)
            .filter(line => line.startsWith('data:'))
            .map(line => line.replace(/^data:\s?/, '').trim())
            .filter(Boolean)

          for (const line of lines) {
            for (const item of this.consumeSseDataLine(line)) {
              yield item
            }
          }
        }
      }

      if (buffer.trim()) {
        const lines = buffer
          .split(/\r?\n/)
          .filter(line => line.startsWith('data:'))
          .map(line => line.replace(/^data:\s?/, '').trim())
          .filter(Boolean)
        for (const line of lines) {
          for (const item of this.consumeSseDataLine(line)) {
            yield item
          }
        }
      }
    }
    catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return
      }
      yield {
        type: 'error',
        error: error instanceof Error ? error : new Error(safeErrorMessage(error)),
      }
    }
  }

  private *consumeSseDataLine(dataLine: string): Generator<ChatStreamEvent, void, undefined> {
    if (dataLine === '[DONE]') {
      yield { type: 'done' }
      return
    }

    let chunk: ChatCompletionChunk
    try {
      chunk = JSON.parse(dataLine) as ChatCompletionChunk
    }
    catch {
      return
    }

    if (chunk.error) {
      yield {
        type: 'error',
        error: new DuxAiApiError(chunk.error.message || '流式响应失败', 500, chunk.error),
      }
      return
    }

    if (typeof chunk.session_id === 'number' && chunk.session_id > 0) {
      yield {
        type: 'session',
        sessionId: chunk.session_id,
      }
    }

    const choice = chunk.choices?.[0]
    const delta = choice?.delta
    const text = typeof delta?.content === 'string' ? delta.content : undefined
    const parts = Array.isArray(delta?.content) ? delta.content as ChatContentPart[] : undefined

    if (text || (parts && parts.length)) {
      yield {
        type: 'delta',
        text,
        parts,
        chunk,
      }
    }

    if (choice?.finish_reason) {
      yield {
        type: 'done',
        finishReason: choice.finish_reason,
        chunk,
      }
    }
  }

  private async request<T>(path: string, init?: { method?: string, body?: unknown }): Promise<T> {
    const settings = await this.resolveSettings()
    this.ensureConfigured(settings)

    if (isTauriRuntime()) {
      const { invoke } = await import('@tauri-apps/api/core')
      return await invoke<T>('api_request', {
        request: {
          serverUrl: settings.serverUrl,
          token: settings.token,
          path,
          method: init?.method || 'GET',
          body: init?.body ?? null,
        },
      })
    }

    const response = await fetch(withBasePath(settings.serverUrl, path), {
      method: init?.method || 'GET',
      headers: {
        Authorization: `Bearer ${settings.token}`,
        'Content-Type': 'application/json',
      },
      body: init?.body !== undefined && init?.body !== null ? JSON.stringify(init.body) : undefined,
    })

    return this.parseResponse<T>(response)
  }

  private async parseResponse<T>(response: Response): Promise<T> {
    if (response.ok) {
      return await response.json() as T
    }
    throw await this.toApiError(response)
  }

  private async toApiError(response: Response): Promise<DuxAiApiError> {
    let payload: any = null
    try {
      payload = await response.json()
    }
    catch {
      payload = null
    }
    const message = payload?.error?.message || payload?.message || `请求失败 (${response.status})`
    return new DuxAiApiError(message, response.status, payload)
  }

  private async resolveSettings(): Promise<AppSettings> {
    const settings = await this.options.getSettings()
    return {
      serverUrl: normalizeServerUrl(settings.serverUrl),
      token: String(settings.token || '').trim(),
    }
  }

  private ensureConfigured(settings: AppSettings): void {
    if (!settings.serverUrl) {
      throw new DuxAiApiError('请先配置服务器地址')
    }
    if (!settings.token) {
      throw new DuxAiApiError('请先配置访问 Token')
    }
  }
}

export function buildUserMessage(text: string, uploads: FileUploadItem[] = []): ChatRequestMessage {
  const parts: ChatContentPart[] = []
  const value = text.trim()

  if (value) {
    parts.push({
      type: 'text',
      text: value,
    })
  }

  for (const item of uploads) {
    const mime = item.mime_type || ''
    const name = item.filename || '附件'

    if ((item.media_kind === 'image' || mime.startsWith('image/')) && item.url) {
      parts.push({
        type: 'image_url',
        image_url: {
          url: item.url,
          name,
          mime_type: mime,
        },
      })
      continue
    }

    if ((item.media_kind === 'video' || mime.startsWith('video/')) && item.url) {
      parts.push({
        type: 'video_url',
        video_url: {
          url: item.url,
          name,
          mime_type: mime,
        },
      })
      continue
    }

    parts.push({
      type: 'file_url',
      file_url: {
        url: item.url,
        name,
        mime_type: mime,
        provider_file_id: item.provider_file_id,
      },
    })
  }

  return {
    role: 'user',
    content: parts.length === 1 && parts[0].type === 'text' ? value : parts,
  }
}

export function normalizeMessage(message: ChatMessage): ChatMessage {
  return {
    ...message,
    content: normalizeMessageContent(message.content),
  }
}

function normalizeMessageContent(content: ChatMessage['content']): ChatMessage['content'] {
  if (Array.isArray(content)) {
    return content
  }
  return typeof content === 'string' ? content : ''
}

export function decomposeContent(content: ChatMessage['content']): { text: string, attachments: Array<Record<string, unknown>> } {
  if (typeof content === 'string') {
    return {
      text: content,
      attachments: [],
    }
  }

  let text = ''
  const attachments: Array<Record<string, unknown>> = []

  for (const part of content) {
    if (!part || typeof part !== 'object') {
      continue
    }

    if (part.type === 'text') {
      text = `${text}${part.text || ''}`.trim()
      continue
    }

    if (part.type === 'image_url') {
      attachments.push({
        kind: 'image',
        url: part.image_url?.url,
        filename: part.image_url?.name || '图片',
        mime_type: part.image_url?.mime_type,
      })
      continue
    }

    if (part.type === 'video_url') {
      attachments.push({
        kind: 'video',
        url: part.video_url?.url,
        filename: part.video_url?.name || '视频',
        mime_type: part.video_url?.mime_type,
      })
      continue
    }

    if (part.type === 'file_url') {
      attachments.push({
        kind: 'file',
        url: part.file_url?.url,
        filename: part.file_url?.name || '附件',
        mime_type: part.file_url?.mime_type,
      })
      continue
    }

    if (part.type === 'card') {
      attachments.push({
        kind: 'card',
        filename: '结构化卡片',
        card: part.card,
      })
    }
  }

  return { text, attachments }
}

export function titleFromInput(input: ChatDraftInput): string {
  return input.text.trim().slice(0, 30) || '新会话'
}

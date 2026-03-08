export type MessageRole = 'user' | 'assistant' | 'system' | 'tool'

export interface AppSettings {
  serverUrl: string
  token: string
}

export interface AgentAttachmentConfig {
  enabled?: Record<string, boolean>
  mode?: Record<string, string>
  local_parse?: Record<string, boolean>
  parse?: {
    parse_provider_id?: number | null
  }
  local_storage_name?: string | null
}

export interface AgentOption {
  id: string
  object?: string
  created?: number
  owned_by?: string
  name: string
  description?: string
  attachments?: AgentAttachmentConfig
}

export interface SessionItem {
  id: number
  agent_id: number
  title?: string | null
  external_id?: string | null
  user_type?: string | null
  user_id?: number | null
  state?: Record<string, unknown>
  memory?: Record<string, unknown>
  last_result?: Record<string, unknown>
  active?: boolean
  last_message_at?: string | null
  prompt_tokens?: number
  completion_tokens?: number
  total_tokens?: number
  updated_at?: string | null
  created_at?: string | null
}

export interface FileUploadItem {
  id: string
  object?: string
  created_at?: number
  filename: string
  bytes?: number
  purpose?: string
  url: string
  mime_type?: string
  content?: string
  provider_file_id?: string | null
  provider?: string | null
  ingestion_mode?: string | null
  media_kind?: string | null
  mode_hint?: string | null
  upload_channel?: string | null
  parse_mode?: string | null
  parsed_text?: string | null
  parsed_parts_count?: number
}

export interface TextPart {
  type: 'text'
  text: string
}

export interface ImagePart {
  type: 'image_url'
  image_url: {
    url: string
    detail?: string
    name?: string
    mime_type?: string
  }
}

export interface FilePart {
  type: 'file_url'
  file_url: {
    url: string
    name?: string
    mime_type?: string
    provider_file_id?: string | null
  }
}

export interface VideoPart {
  type: 'video_url'
  video_url: {
    url: string
    name?: string
    mime_type?: string
  }
}

export interface CardPart {
  type: 'card'
  card: Record<string, unknown> | Record<string, unknown>[]
}

export type ChatContentPart = TextPart | ImagePart | FilePart | VideoPart | CardPart
export type ChatMessageContent = string | ChatContentPart[]

export interface ChatMessage {
  id: number | string
  role: MessageRole
  content: ChatMessageContent
  created_at?: string | null
  tool_call_id?: string
  tool_calls?: Array<Record<string, unknown>>
  meta?: {
    card?: Record<string, unknown> | Record<string, unknown>[]
  }
}

export interface DraftAttachment {
  id: string
  name: string
  mimeType: string
  size: number
  status: 'queued' | 'uploading' | 'uploaded' | 'error'
  file?: File
  path?: string
  remote?: FileUploadItem
  error?: string | null
}

export interface ChatRequestMessage {
  role: Exclude<MessageRole, 'tool'> | 'tool'
  content: ChatMessageContent
  tool_call_id?: string
  tool_calls?: Array<Record<string, unknown>>
}

export interface ChatCompletionChunkChoice {
  index?: number
  delta?: {
    role?: string
    content?: string | ChatContentPart[]
    tool_calls?: Array<Record<string, unknown>>
  }
  finish_reason?: string | null
}

export interface ChatCompletionChunk {
  id?: string
  object?: string
  created?: number
  model?: string
  session_id?: number
  choices?: ChatCompletionChunkChoice[]
  error?: {
    message?: string
    type?: string
    code?: string
  }
}

export type ChatStreamEvent =
  | {
      type: 'session'
      sessionId: number
    }
  | {
      type: 'delta'
      text?: string
      parts?: ChatContentPart[]
      chunk: ChatCompletionChunk
    }
  | {
      type: 'done'
      finishReason?: string | null
      chunk?: ChatCompletionChunk
    }
  | {
      type: 'error'
      error: Error
    }

export interface ApiEnvelope<T> {
  object?: string
  data: T
}

export interface ChatDraftInput {
  text: string
  attachments?: DraftAttachment[]
}

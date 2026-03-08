export interface PickedLocalFile {
  id: string
  name: string
  path?: string
  file?: File
  mimeType: string
  size: number
}

export function isTauriRuntime(): boolean {
  if (typeof window === 'undefined') {
    return false
  }
  return Boolean((window as typeof window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__)
}

export function normalizeServerUrl(url: string): string {
  return String(url || '').trim().replace(/\/$/, '')
}

export function withBasePath(serverUrl: string, path: string): string {
  const base = normalizeServerUrl(serverUrl)
  const suffix = path.startsWith('/') ? path : `/${path}`
  return `${base}${suffix}`
}

export function safeErrorMessage(error: unknown, fallback = '请求失败'): string {
  if (error instanceof Error && error.message) {
    return error.message
  }
  if (typeof error === 'string' && error.trim()) {
    return error
  }
  return fallback
}

export function basename(path: string): string {
  return String(path || '').split(/[/\\]/).filter(Boolean).pop() || 'file'
}

export async function pickLocalFiles(): Promise<PickedLocalFile[]> {
  if (isTauriRuntime()) {
    const { open } = await import('@tauri-apps/plugin-dialog')
    const selected = await open({
      multiple: true,
      directory: false,
      title: '选择要发送的附件',
    })

    if (!selected) {
      return []
    }

    const paths = Array.isArray(selected) ? selected : [selected]
    return paths.map(path => ({
      id: `path-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: basename(path),
      path,
      mimeType: '',
      size: 0,
    }))
  }

  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.multiple = true
    input.onchange = () => {
      const files = Array.from(input.files || [])
      resolve(files.map(file => ({
        id: `file-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: file.name,
        file,
        mimeType: file.type || '',
        size: file.size,
      })))
    }
    input.click()
  })
}

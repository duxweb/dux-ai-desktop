import { invoke } from '@tauri-apps/api/core'
import { isTauriRuntime } from './runtime'
import type { AppWindowKind, ChildWindowKind } from './window-definitions'

export type { AppWindowKind, ChildWindowKind } from './window-definitions'

export function resolveWindowKind(): AppWindowKind {
  if (typeof window === 'undefined') {
    return 'main'
  }

  const params = new URLSearchParams(window.location.search)
  const explicit = params.get('window')
  if (explicit === 'settings' || explicit === 'about' || explicit === 'main') {
    return explicit
  }

  const metadataLabel = (window as typeof window & { __TAURI_INTERNALS__?: { metadata?: { currentWindow?: { label?: string } } } }).__TAURI_INTERNALS__?.metadata?.currentWindow?.label
  if (metadataLabel === 'settings' || metadataLabel === 'about' || metadataLabel === 'main') {
    return metadataLabel
  }

  return 'main'
}

export async function openChildWindow(kind: ChildWindowKind) {
  if (!isTauriRuntime()) {
    return null
  }

  try {
    await invoke('open_app_window', {
      request: { kind },
    })
    return true
  }
  catch (error) {
    console.error('[app-windows] failed to open child window', kind, error)
    throw error
  }
}

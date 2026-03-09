import { invoke } from '@tauri-apps/api/core'
import { isTauriRuntime } from './runtime'

function isMacPlatform() {
  if (typeof navigator === 'undefined') {
    return false
  }
  return /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent)
}

export async function minimizeWindow() {
  if (!isTauriRuntime()) {
    return
  }
  await invoke('minimize_app_window')
}

export async function toggleMaximizeWindow() {
  if (!isTauriRuntime()) {
    return
  }
  await invoke('toggle_maximize_app_window')
}

export async function closeWindow() {
  if (!isTauriRuntime()) {
    return
  }
  await invoke('close_app_window')
}

export async function isWindowMaximized() {
  if (!isTauriRuntime()) {
    return false
  }
  return await invoke<boolean>('is_app_window_maximized')
}

export const isMacLike = isMacPlatform()

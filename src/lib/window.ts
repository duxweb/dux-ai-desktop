import { isTauriRuntime } from './runtime'

function isMacPlatform() {
  if (typeof navigator === 'undefined') {
    return false
  }
  return /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent)
}

async function currentWindow() {
  if (!isTauriRuntime()) {
    return null
  }
  const { getCurrentWindow } = await import('@tauri-apps/api/window')
  return getCurrentWindow()
}

export async function minimizeWindow() {
  const window = await currentWindow()
  await window?.minimize()
}

export async function toggleMaximizeWindow() {
  const window = await currentWindow()
  await window?.toggleMaximize()
}

export async function closeWindow() {
  const window = await currentWindow()
  await window?.close()
}

export async function startWindowDragging() {
  const window = await currentWindow()
  await window?.startDragging()
}

export async function isWindowMaximized() {
  const window = await currentWindow()
  return window ? window.isMaximized() : false
}

export const isMacLike = isMacPlatform()

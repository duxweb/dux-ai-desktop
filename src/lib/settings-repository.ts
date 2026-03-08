import type { AppSettings } from '../types/chat'
import { getDesktopStore } from './desktop-store'
import { normalizeServerUrl } from './runtime'

const SETTINGS_KEY = 'app-settings'

export const emptySettings = (): AppSettings => ({
  serverUrl: '',
  token: '',
})

export function normalizeSettings(input?: Partial<AppSettings> | null): AppSettings {
  return {
    serverUrl: normalizeServerUrl(input?.serverUrl || ''),
    token: String(input?.token || '').trim(),
  }
}

export async function loadSettings(): Promise<AppSettings> {
  const store = await getDesktopStore()
  const settings = await store.get<AppSettings>(SETTINGS_KEY)
  return normalizeSettings(settings)
}

export async function saveSettings(settings: AppSettings): Promise<AppSettings> {
  const store = await getDesktopStore()
  const next = normalizeSettings(settings)
  await store.set(SETTINGS_KEY, next)
  return next
}

export async function clearSettings(): Promise<void> {
  const store = await getDesktopStore()
  await store.delete(SETTINGS_KEY)
}

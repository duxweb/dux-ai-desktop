import { isTauriRuntime } from './runtime'

export interface KeyValueStore {
  get<T>(key: string): Promise<T | null>
  set<T>(key: string, value: T): Promise<void>
  delete(key: string): Promise<void>
}

class LocalStorageStore implements KeyValueStore {
  constructor(private readonly namespace: string) {}

  async get<T>(key: string): Promise<T | null> {
    if (typeof localStorage === 'undefined') {
      return null
    }

    const raw = localStorage.getItem(this.key(key))
    if (!raw) {
      return null
    }

    try {
      return JSON.parse(raw) as T
    }
    catch {
      return null
    }
  }

  async set<T>(key: string, value: T): Promise<void> {
    if (typeof localStorage === 'undefined') {
      return
    }
    localStorage.setItem(this.key(key), JSON.stringify(value))
  }

  async delete(key: string): Promise<void> {
    if (typeof localStorage === 'undefined') {
      return
    }
    localStorage.removeItem(this.key(key))
  }

  private key(key: string): string {
    return `${this.namespace}:${key}`
  }
}

let tauriStorePromise: Promise<KeyValueStore> | null = null

async function createTauriStore(): Promise<KeyValueStore> {
  const { Store } = await import('@tauri-apps/plugin-store')
  const store = await Store.load('settings.json')

  return {
    async get<T>(key: string) {
      const value = await store.get<T>(key)
      return value ?? null
    },
    async set<T>(key: string, value: T) {
      await store.set(key, value)
      await store.save()
    },
    async delete(key: string) {
      await store.delete(key)
      await store.save()
    },
  }
}

export async function getDesktopStore(): Promise<KeyValueStore> {
  if (!isTauriRuntime()) {
    return new LocalStorageStore('dux-ai-tabletop')
  }

  tauriStorePromise ??= createTauriStore().catch(() => new LocalStorageStore('dux-ai-tabletop'))
  return tauriStorePromise
}

import { onBeforeUnmount, onMounted } from 'vue'

function applyTheme(theme: 'light' | 'dark') {
  const root = document.documentElement
  root.classList.toggle('dark', theme === 'dark')
  root.dataset.theme = theme
}

function resolveSystemTheme() {
  if (typeof window === 'undefined') {
    return 'dark' as const
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function initSystemTheme() {
  if (typeof window === 'undefined') {
    return () => {}
  }

  const media = window.matchMedia('(prefers-color-scheme: dark)')
  const sync = () => applyTheme(media.matches ? 'dark' : 'light')
  sync()

  if (typeof media.addEventListener === 'function') {
    media.addEventListener('change', sync)
    return () => media.removeEventListener('change', sync)
  }

  media.addListener(sync)
  return () => media.removeListener(sync)
}

export function useSystemTheme() {
  let cleanup = () => {}
  onMounted(() => {
    cleanup = initSystemTheme()
  })
  onBeforeUnmount(() => {
    cleanup()
  })
}

export { applyTheme, resolveSystemTheme }
